import * as THREE from '../../lib/three/three.module.js';
import { GLTFLoader } from '../../lib/three/loaders/GLTFLoader.js';
import { DRACOLoader } from '../../lib/three/loaders/DRACOLoader.js';
import { KTX2Loader } from '../../lib/three/loaders/KTX2Loader.js';
import { MeshoptDecoder } from '../../lib/three/libs/meshopt_decoder.module.js';
import { RESOURCE_CONFIG as R } from '../core/Config.js';
import { disposeObject } from '../scene/Primitives.js';
export class ModelLoader {
  constructor(renderer){this.renderer=renderer;}
  async load(record){
    const manager=new THREE.LoadingManager(),urls=new Map();
    const decoderBase=new URL('../../lib/three/libs/',import.meta.url).href;
    const virtual='https://cinema-assets.invalid/';
    for(const f of record.files)urls.set(f.path,URL.createObjectURL(f.blob));
    // 将原始 URI 映射到已缓存的 Blob；解析时禁止隐式联网，保证缓存后的完整离线性。
    manager.setURLModifier(url=>{
      if(url.startsWith('blob:')||url.startsWith('data:')||url.startsWith(decoderBase))return url;
      let original=url.startsWith(virtual)?url.slice(virtual.length):url;
      try{original=decodeURI(original);}catch{}
      const key=record.uriMap?.[original]||original;
      if(urls.has(key))return urls.get(key);
      for(const [uri,path] of Object.entries(record.uriMap||{})){
        if(new URL(uri,virtual).href===url&&urls.has(path))return urls.get(path);
      }
      throw new Error(`模型缺少已缓存依赖：${original}`);
    });
    const draco=new DRACOLoader(manager).setDecoderPath(decoderBase+'draco/gltf/').setWorkerLimit(2);
    const ktx=new KTX2Loader(manager).setTranscoderPath(decoderBase+'basis/').setWorkerLimit(2).detectSupport(this.renderer);
    const loader=new GLTFLoader(manager).setDRACOLoader(draco).setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder);
    try{
      const root=record.files.find(f=>f.path===record.rootPath);if(!root)throw new Error('缓存缺少模型主文件');
      const buffer=await root.blob.arrayBuffer(),input=record.format==='gltf'?new TextDecoder().decode(buffer):buffer;
      const gltf=await loader.parseAsync(input,virtual);const stats=this.analyze(gltf.scene);
      if(stats.vertices>R.MAX_VERTICES){disposeObject(gltf.scene);throw new Error('模型解码后的顶点数过大，请先简化模型');}
      return {object:gltf.scene,stats,animations:gltf.animations};
    }finally{urls.forEach(u=>URL.revokeObjectURL(u));draco.dispose();ktx.dispose();}
  }
  analyze(object){
    let triangles=0,vertices=0,meshes=0,skinned=false;const materials=new Set(),textures=new Set();let maxTexture=0;
    object.traverse(o=>{if(!o.isMesh)return;meshes++;skinned ||=!!o.isSkinnedMesh;const instances=o.isInstancedMesh?o.count:1;vertices+=(o.geometry.attributes.position?.count||0)*instances;triangles+=(o.geometry.index?.count||o.geometry.attributes.position?.count||0)*instances/3;
      for(const m of [].concat(o.material)){materials.add(m);for(const t of Object.values(m))if(t?.isTexture){textures.add(t);const i=t.image;maxTexture=Math.max(maxTexture,i?.width||0,i?.height||0);}}});
    const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3());
    if(!meshes||!Number.isFinite(size.length())||size.length()===0)throw new Error('模型没有可预览的有效几何体');
    const warnings=[];
    if(triangles>R.HIGH_COMPLEXITY_TRIANGLES)warnings.push('高复杂度模型：超过 500,000 个三角形');
    else if(triangles>R.WARNING_TRIANGLES)warnings.push('三角形超过建议值 100,000');
    if(meshes>R.WARNING_MESH_COUNT)warnings.push('Mesh 超过建议值 30');
    if(materials.size>R.WARNING_MATERIAL_COUNT)warnings.push('材质超过建议值 15');
    if(maxTexture>R.MAX_TEXTURE_SIZE)warnings.push('纹理尺寸超过建议值 2048×2048');
    if(skinned)warnings.push('含骨骼模型：重复使用时将冻结为静态姿态');
    return {triangles:Math.round(triangles),vertices,meshes,materials:materials.size,textures:textures.size,maxTexture,dimensions:size.toArray(),warnings,skinned};
  }
}
