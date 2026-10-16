import { ModelPreview } from '../assets/ModelPreview.js';
import { bytesLabel } from '../utils/MathUtils.js';
import { RESOURCE_CONFIG as R } from '../core/Config.js';
export class AssetUI {
  constructor(manager,loader,{openDialog,toast,onDelete,onSaved}){
    this.manager=manager;this.loader=loader;this.openDialog=openDialog;this.toast=toast;this.onDelete=onDelete;this.onSaved=onSaved;
    this.preview=null;this.pending=null;this.importing=false;
    document.querySelector('#model-url-form').addEventListener('submit',e=>{e.preventDefault();this.importURL(document.querySelector('#model-url').value);});
    for(const id of ['model-file','model-folder'])document.getElementById(id).addEventListener('change',e=>{if(e.target.files.length)this.importLocal(e.target.files);e.target.value='';});
    document.querySelector('#cancel-download').addEventListener('click',()=>manager.cancel());
    document.querySelector('#clear-models').addEventListener('click',()=>this.clear());
    document.querySelector('#save-model').addEventListener('click',()=>this.save());
    document.querySelector('#model-preview-dialog').addEventListener('close',()=>{this.preview?.destroy();this.preview=null;this.pending=null;});
    document.querySelector('#assets-dialog').addEventListener('close',()=>{if(this.importing)manager.cancel();});
  }
  message(text,error=false){const el=document.querySelector('#asset-message');el.textContent=text;el.classList.toggle('error',error);el.hidden=!text;}
  setBusy(value){
    this.importing=value;document.querySelectorAll('#model-url-form button,#model-file,#model-folder,#clear-models').forEach(el=>el.disabled=value);
    document.querySelector('#model-progress').hidden=!value;
  }
  progress({name,loaded,total}){
    document.querySelector('#model-progress-text').textContent=`${name} · ${bytesLabel(loaded)}${total?' / '+bytesLabel(total):' / 大小未知，实时限制中'}`;
    const bar=document.querySelector('#model-progress-bar');if(total)bar.value=loaded/total*100;else bar.removeAttribute('value');
  }
  async importURL(url){
    if(this.importing)return;this.setBusy(true);this.message('正在检查模型格式、文件大小与本地容量……');
    try{const record=await this.manager.fromURL(url,p=>this.progress(p));await this.showPreview(record);this.message(record.cached?'已从本地缓存读取，没有请求外部模型。':'模型下载完成，请在预览中确认保存。');}
    catch(error){this.message(error.name==='AbortError'?'下载已取消。':error.message,true);}finally{this.setBusy(false);}
  }
  async importLocal(files){
    if(this.importing)return;this.setBusy(true);this.message('正在验证本地模型与依赖……');
    try{const record=await this.manager.fromFiles(files);await this.showPreview(record);this.message('本地模型验证完成，请在预览中确认保存。');}
    catch(error){this.message(error.message,true);}finally{this.setBusy(false);}
  }
  async showPreview(record){
    this.message('正在解析模型与检查性能……');const result=await this.loader.load(record);
    this.pending={...record,stats:result.stats};document.querySelector('#preview-name').textContent=record.name;
    const root=document.querySelector('#model-statistics');root.replaceChildren();
    const stats=result.stats;
    for(const [name,value] of [['文件大小',bytesLabel(record.size)],['三角形',stats.triangles.toLocaleString()],['顶点',stats.vertices.toLocaleString()],['Mesh',stats.meshes],['材质',stats.materials],['纹理',stats.textures],['最大纹理',`${stats.maxTexture} px`],['尺寸 / 单位',stats.dimensions.map(v=>v.toFixed(2)).join(' × ')]]){
      const el=document.createElement('span');el.textContent=name;const strong=document.createElement('strong');strong.textContent=value;el.append(strong);root.append(el);
    }
    const warnings=document.querySelector('#model-warnings');warnings.replaceChildren();
    stats.warnings.forEach(text=>{const p=document.createElement('p');p.textContent=`△ ${text}。批量替换座椅可能影响帧率，建议先优化。`;warnings.append(p);});
    const save=document.querySelector('#save-model');save.disabled=false;save.textContent=record.cached?'已缓存 · 完成':'保存到本地';
    this.openDialog('model-preview-dialog');
    try{this.preview=new ModelPreview(document.querySelector('#model-preview-canvas'),result.object);}
    catch(error){document.querySelector('#model-preview-dialog').close();throw error;}
  }
  async save(){
    if(!this.pending)return;const record=this.pending,button=document.querySelector('#save-model');button.disabled=true;
    try{if(!record.cached)await this.manager.save(record);document.querySelector('#model-preview-dialog').close();await this.refresh();this.onSaved?.();this.toast('模型已保存到本地，可在「设置 → 影院」中替换部件。');}
    catch(error){button.disabled=false;this.toast(error.message);}
  }
  async open(){this.openDialog('assets-dialog');await this.refresh();}
  async refresh(){
    const root=document.querySelector('#asset-list');root.replaceChildren();
    try{
      const records=(await this.manager.list()).sort((a,b)=>b.createdAt-a.createdAt);const used=records.reduce((s,r)=>s+r.size,0);
      document.querySelector('#storage-usage').textContent=`${bytesLabel(used)} / ${bytesLabel(R.MAX_TOTAL_MODEL_STORAGE)}`;
      document.querySelector('#resource-status').textContent=`Three.js · 场景 · 材质 · 环境音：本地 ✓  | 用户模型 ${records.length} 个`;
      if(!records.length){const empty=document.createElement('div');empty.className='asset-empty';empty.innerHTML='<svg><use href="#i-box"/></svg>你的模型收藏，从这里开始。<br>内置影院已完整可用，导入模型可为它添些个人风格。';root.append(empty);}
      records.forEach(record=>{
        const row=document.createElement('div');row.className='asset-row';const name=document.createElement('div');name.className='asset-row-name';name.innerHTML='<svg><use href="#i-box"/></svg>';const copy=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('small');
        strong.textContent=record.name;strong.title=record.name;small.textContent=`${bytesLabel(record.size)} · ${record.format.toUpperCase()} · ${record.kind==='url'?'URL 缓存':'本地导入'} · ${new Date(record.createdAt).toLocaleDateString('zh-CN')}`;copy.append(strong,small);name.append(copy);
        const actions=document.createElement('div');actions.className='asset-row-actions';const status=document.createElement('span');status.className='cached-label';status.textContent='✓ 离线可用';
        const preview=document.createElement('button');preview.className='text-button';preview.textContent='预览';preview.addEventListener('click',async()=>{try{await this.showPreview({...record,cached:true});}catch(e){this.message(e.message,true);}});
        const remove=document.createElement('button');remove.className='text-button danger';remove.textContent='删除';remove.addEventListener('click',()=>this.delete(record));actions.append(status,preview,remove);row.append(name,actions);root.append(row);
      });
    }catch(error){this.message(error.message,true);}
  }
  confirm(title,message,label='删除'){
    const dialog=document.querySelector('#confirm-dialog');document.querySelector('#confirm-title').textContent=title;document.querySelector('#confirm-message').textContent=message;document.querySelector('#confirm-ok').textContent=label;
    return new Promise(resolve=>{
      const ok=()=>{dialog.returnValue='yes';dialog.close();},cancel=()=>{dialog.returnValue='no';dialog.close();};
      document.querySelector('#confirm-ok').addEventListener('click',ok);document.querySelector('#confirm-cancel').addEventListener('click',cancel);
      dialog.addEventListener('close',()=>{document.querySelector('#confirm-ok').removeEventListener('click',ok);document.querySelector('#confirm-cancel').removeEventListener('click',cancel);resolve(dialog.returnValue==='yes');},{once:true});dialog.returnValue='';this.openDialog('confirm-dialog');
    });
  }
  async delete(record){
    if(!await this.confirm('删除本地模型？',`${record.name} · ${bytesLabel(record.size)}\n删除后该模型将无法在离线模式下使用。已使用的部件将恢复默认模型。`))return;
    try{await this.manager.delete(record.id);this.onDelete(record.id);await this.refresh();this.toast('模型与缓存依赖已删除。');}catch(e){this.message(e.message,true);}
  }
  async clear(){
    if(!await this.confirm('清理模型缓存？','全部用户模型、元数据与依赖将被删除，影院部件恢复默认。内置影院不受影响。','清理缓存'))return;
    try{await this.manager.clear();this.onDelete(null);await this.refresh();this.toast('模型缓存已清理。');}catch(e){this.message(e.message,true);}
  }
}
