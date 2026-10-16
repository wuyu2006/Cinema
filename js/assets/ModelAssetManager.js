import { RESOURCE_CONFIG as R } from '../core/Config.js';
import { bytesLabel } from '../utils/MathUtils.js';
export function normalizePath(path){
  const parts=[];for(const p of decodeURIComponent(path).replaceAll('\\','/').split('/')){
    if(!p||p==='.')continue;if(p==='..'){if(!parts.length)throw new Error('模型依赖路径超出了所选目录');parts.pop();}else parts.push(p);
  }return parts.join('/');
}
export function modelJSON(buffer,format){
  let json;
  if(format==='glb'){
    if(buffer.byteLength<20)throw new Error('GLB 文件头损坏');const view=new DataView(buffer);
    if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==buffer.byteLength)throw new Error('仅支持完整的 GLB 2.0 文件');
    const length=view.getUint32(12,true);if(view.getUint32(16,true)!==0x4e4f534a||length+20>buffer.byteLength)throw new Error('GLB JSON 数据损坏');
    json=JSON.parse(new TextDecoder().decode(buffer.slice(20,length+20)).replace(/\0+$/,''));
  }else json=JSON.parse(new TextDecoder().decode(buffer));
  if(typeof json.asset?.version!=='string'||!json.asset.version.startsWith('2.'))throw new Error('仅支持 glTF 2.0 资源');
  if((json.nodes?.length||0)>R.MAX_NODES)throw new Error('模型节点数量过高，请先简化模型');
  // 对压缩后很小、解压后极大的几何体进行提前约束，防止异常文件耗尽浏览器内存。
  const vertices=(json.accessors||[]).filter(a=>a.type==='VEC3').reduce((s,a)=>s+(a.count||0),0);
  if(vertices>R.MAX_VERTICES*3)throw new Error('模型声明的顶点数据过大，请先简化模型');
  return json;
}
export function dependencies(json){
  const uris=[...(json.buffers||[]),...(json.images||[])].map(x=>x.uri).filter(Boolean);
  for(const uri of uris){
    if(typeof uri!=='string')throw new Error('模型依赖 URI 必须是字符串');
    if(uri.startsWith('data:')&&!/^data:(application\/(octet-stream|gltf-buffer)|image\/(png|jpeg|webp|ktx2|avif));base64,/i.test(uri))throw new Error('仅支持二进制缓冲和安全的嵌入图像资源');
    if(/^(javascript|file|blob):/i.test(uri))throw new Error('模型包含不支持的依赖协议');
    if(/\.(html?|m?js)(?:[?#]|$)/i.test(uri))throw new Error('模型不能引用 HTML 或 JavaScript 依赖');
  }
  const unique=[...new Set(uris.filter(u=>!u.startsWith('data:')))];
  if(unique.length>R.MAX_DEPENDENCIES)throw new Error('外部依赖过多，请改用嵌入资源的 GLB');
  return unique;
}
export class ModelAssetManager {
  constructor(){this.dbPromise=null;this.controller=null;this.busy=false;}
  open(){
    if(this.dbPromise)return this.dbPromise;
    this.dbPromise=new Promise((resolve,reject)=>{
      if(!window.indexedDB){reject(new Error('此浏览器未提供 IndexedDB，无法永久保存模型'));return;}
      const request=indexedDB.open('immersive-cinema-assets',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('models',{keyPath:'id'});
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('无法打开本地资源库，请检查浏览器存储权限'));
      request.onblocked=()=>reject(new Error('其他标签页阻止了资源库升级，请关闭旧影院标签页'));
    });return this.dbPromise;
  }
  async transaction(mode,run){
    const db=await this.open();return new Promise((resolve,reject)=>{
      const tx=db.transaction('models',mode),store=tx.objectStore('models');let request;
      try{request=run(store);}catch(e){reject(e);return;}
      tx.oncomplete=()=>resolve(request?.result);tx.onerror=()=>reject(new Error(tx.error?.name==='QuotaExceededError'?'浏览器存储配额不足，请删除不需要的模型':'本地资源操作失败'));tx.onabort=()=>reject(tx.error||new Error('资源操作已取消'));
    });
  }
  list(){return this.transaction('readonly',s=>s.getAll());}
  get(id){return this.transaction('readonly',s=>s.get(id));}
  delete(id){return this.transaction('readwrite',s=>s.delete(id));}
  clear(){return this.transaction('readwrite',s=>s.clear());}
  async usage(){return (await this.list()).reduce((sum,r)=>sum+r.size,0);}
  async checkCapacity(size){
    if(size>R.MAX_MODEL_SIZE)throw new Error(`模型文件过大：${bytesLabel(size)}，最大允许 ${bytesLabel(R.MAX_MODEL_SIZE)}（包含依赖）。请使用简化后的 GLB。`);
    const used=await this.usage();if(used+size>R.MAX_TOTAL_MODEL_STORAGE)throw new Error(`本地模型存储空间不足。当前 ${bytesLabel(used)} / ${bytesLabel(R.MAX_TOTAL_MODEL_STORAGE)}，请删除不需要的模型。`);
    return R.MAX_TOTAL_MODEL_STORAGE-used;
  }
  async save(record){
    // 在同一 IndexedDB 写事务中重新计算容量，多个标签页同时导入也不能绕过 200MB 总限制。
    const db=await this.open();return new Promise((resolve,reject)=>{
      const tx=db.transaction('models','readwrite'),store=tx.objectStore('models');let reason;
      const list=store.getAll();list.onsuccess=()=>{
        const used=list.result.filter(r=>r.id!==record.id).reduce((sum,r)=>sum+r.size,0);
        if(record.size>R.MAX_MODEL_SIZE||used+record.size>R.MAX_TOTAL_MODEL_STORAGE){reason=new Error('模型缓存容量不足，请清理资源后重试');tx.abort();return;}
        store.put(record);
      };
      tx.oncomplete=()=>resolve(record);tx.onabort=()=>reject(reason||new Error('模型保存失败：存储配额不足或权限受限'));tx.onerror=()=>{};
    });
  }
  cancel(){this.controller?.abort();}
  async downloadFile(url,budget,progress){
    const signal=this.controller.signal;let expected=0,response;
    try{
      const timeout=AbortSignal.timeout?AbortSignal.timeout(6000):signal;
      const head=await fetch(url,{method:'HEAD',mode:'cors',credentials:'omit',signal:AbortSignal.any?AbortSignal.any([signal,timeout]):timeout});
      if(head.ok)expected=Number(head.headers.get('content-length'))||0;
    }catch(error){if(signal.aborted)throw error;}
    if(expected>budget)throw new Error(`模型文件过大：${bytesLabel(expected)}，本次剩余允许 ${bytesLabel(budget)}。下载已在读取正文前阻止。`);
    if(!expected){
      try{
        response=await fetch(url,{mode:'cors',credentials:'omit',headers:{Range:'bytes=0-0'},signal});
        if(response.status===206){expected=Number(response.headers.get('content-range')?.split('/')[1])||0;await response.body?.cancel();response=null;}
        else if(!response.ok){await response.body?.cancel();response=null;}
      }catch(error){if(signal.aborted)throw error;response=null;}
      if(expected>budget)throw new Error(`模型文件过大：${bytesLabel(expected)}，最大允许 ${bytesLabel(budget)}。`);
    }
    response=response||await fetch(url,{mode:'cors',credentials:'omit',signal});
    if(!response.ok)throw new Error(`模型下载失败：HTTP ${response.status}`);
    expected=Number(response.headers.get('content-length'))||expected;
    if(expected>budget){await response.body?.cancel();throw new Error('模型超过大小限制，已中止下载');}
    if(!response.body){throw new Error('浏览器不支持流式下载，请使用本地模型导入');}
    const reader=response.body.getReader(),chunks=[];let received=0;
    try{
      for(;;){const {done,value}=await reader.read();if(done)break;received+=value.byteLength;
        if(received>budget){await reader.cancel();chunks.length=0;this.controller.abort();throw new Error('模型超过 20MB 或剩余缓存容量，下载已立即终止');}
        chunks.push(value);progress(received,expected);
      }
      return new Blob(chunks,{type:response.headers.get('content-type')||'application/octet-stream'});
    }finally{reader.releaseLock();}
  }
  async fromURL(value,progress=()=>{}){
    if(this.busy)throw new Error('请等待当前导入完成');this.busy=true;this.controller=new AbortController();
    try{
      let url;try{url=new URL(value.trim());}catch{throw new Error('请输入合法的模型直链 URL');}
      if(!['https:','http:'].includes(url.protocol))throw new Error('模型 URL 仅支持 HTTP / HTTPS');
      const format=url.pathname.split('.').pop().toLowerCase();if(!['glb','gltf'].includes(format))throw new Error('模型 URL 必须指向 .glb 或 .gltf 文件');
      // 完全相同的 URL 优先返回本地缓存，不重复请求互联网。
      const cached=(await this.list()).find(r=>r.originUrl===url.href);if(cached)return {...cached,cached:true};
      const remaining=await this.checkCapacity(0),budget=Math.min(R.MAX_MODEL_SIZE,remaining);
      const rootPath=decodeURIComponent(url.pathname.split('/').pop());
      const root=await this.downloadFile(url.href,budget,(loaded,total)=>progress({name:rootPath,loaded,total}));
      const json=modelJSON(await root.arrayBuffer(),format);let size=root.size;const files=[{path:rootPath,blob:root}],uriMap={};const downloaded=new Map();
      for(const uri of dependencies(json)){
        const depURL=new URL(uri,url);if(!['https:','http:'].includes(depURL.protocol))throw new Error('模型包含不支持的外部依赖');
        if(downloaded.has(depURL.href)){uriMap[uri]=downloaded.get(depURL.href);continue;}
        const path=`dependency-${files.length}/${decodeURIComponent(depURL.pathname.split('/').pop()||'data.bin')}`;
        const blob=await this.downloadFile(depURL.href,budget-size,(loaded,total)=>progress({name:uri,loaded:size+loaded,total:total?size+total:0}));
        files.push({path,blob});size+=blob.size;uriMap[uri]=path;downloaded.set(depURL.href,path);
      }
      await this.checkCapacity(size);
      return {id:crypto.randomUUID(),name:rootPath,format,kind:'url',originUrl:url.href,createdAt:Date.now(),rootPath,files,uriMap,size};
    }catch(error){
      if(error.name==='TypeError')throw new Error('无法访问该模型：网络失败或服务器未允许跨域资源访问（CORS）。请使用允许跨域的 URL，或下载后从本地导入。');
      throw error;
    }finally{this.busy=false;this.controller=null;}
  }
  async fromFiles(inputFiles){
    const selected=Array.from(inputFiles);const roots=selected.filter(f=>/\.(glb|gltf)$/i.test(f.name));
    if(roots.length!==1)throw new Error('每次请选择一个 GLB / GLTF 主文件；GLTF 可同时选择 BIN 和纹理，或选择完整文件夹。');
    const root=roots[0],format=root.name.split('.').pop().toLowerCase();await this.checkCapacity(root.size);
    const rootPath=normalizePath(root.webkitRelativePath||root.name),base=rootPath.includes('/')?rootPath.slice(0,rootPath.lastIndexOf('/')+1):'';
    const json=modelJSON(await root.arrayBuffer(),format);const files=[{path:rootPath,blob:root}],uriMap={};let size=root.size;
    const fileMap=new Map(selected.map(f=>[normalizePath(f.webkitRelativePath||f.name),f]));const stored=new Set([rootPath]);
    for(const uri of dependencies(json)){
      if(/^[a-z]+:/i.test(uri))throw new Error('本地 GLTF 引用了远程依赖，请将依赖下载并改成相对路径，或使用嵌入资源的 GLB');
      const path=normalizePath(base+uri.split(/[?#]/)[0]);let file=fileMap.get(path);
      if(!file){const name=path.split('/').pop(),matches=selected.filter(f=>f.name===name);if(matches.length===1)file=matches[0];}
      if(!file)throw new Error(`缺少模型依赖：${uri}。请选择完整 GLTF 文件夹或将依赖一起选中。`);
      if(!stored.has(path)){size+=file.size;await this.checkCapacity(size);files.push({path,blob:file});stored.add(path);}uriMap[uri]=path;
    }
    return {id:crypto.randomUUID(),name:root.name,format,kind:'local',originUrl:null,createdAt:Date.now(),rootPath,files,uriMap,size};
  }
}
