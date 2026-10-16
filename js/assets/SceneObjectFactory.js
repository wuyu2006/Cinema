import * as THREE from '../../lib/three/three.module.js';
import { CINEMA as C } from '../core/Config.js';
import { SPEAKER_LAYOUT } from '../scene/Speakers.js';
import { disposeObject } from '../scene/Primitives.js';
const heights={seats:1.35,speakers:1.2,lamps:1.2,exit:.5,doors:2.5,decor:2};
export class SceneObjectFactory {
  constructor(cinema,seats,loader){this.cinema=cinema;this.seats=seats;this.loader=loader;this.current=new Map();}
  placements(kind){
    if(kind==='seats')return this.seats.seats.map(s=>({position:s.position.clone(),rotation:s.rotation}));
    if(kind==='speakers')return SPEAKER_LAYOUT.map(s=>({position:new THREE.Vector3(...s.position).add(new THREE.Vector3(0,-.6,0)),rotation:s.position[0]<-13?Math.PI/2:s.position[0]>13?-Math.PI/2:s.type==='back'?Math.PI:0}));
    const results=[];for(const side of [-1,1]){
      if(kind==='lamps')for(const z of [-10,1,11])results.push({position:new THREE.Vector3(side*14.8,4.4,z),rotation:side<0?Math.PI/2:-Math.PI/2});
      if(kind==='exit')results.push({position:new THREE.Vector3(side*15,5.75,12.5),rotation:side<0?Math.PI/2:-Math.PI/2});
      if(kind==='doors')results.push({position:new THREE.Vector3(side*15,(C.rows-1)*C.stepHeight,12.5),rotation:side<0?Math.PI/2:-Math.PI/2});
      if(kind==='decor')for(const z of [-9,0,9])results.push({position:new THREE.Vector3(side*14.9,8,z),rotation:side<0?Math.PI/2:-Math.PI/2});
    }return results;
  }
  defaultGroup(kind){return kind==='seats'?this.cinema.seats.group:kind==='speakers'?this.cinema.speakers.group:this.cinema.materials.replacements[kind];}
  clear(kind){
    const current=this.current.get(kind);if(current){current.group.removeFromParent();current.group.children.forEach(m=>{m.geometry?.dispose();m.dispose?.();});disposeObject(current.object);this.current.delete(kind);}
    const original=this.defaultGroup(kind);if(original)original.visible=true;
  }
  async replace(kind,record,{height=heights[kind],isCurrent=()=>true}={}){
    if(!record){this.clear(kind);return;}
    const {object,stats}=await this.loader.load(record);if(!isCurrent()){disposeObject(object);return;}
    const placements=this.placements(kind),group=new THREE.Group();
    const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    // 自动归一化到真实影院尺寸，同时保留宽高比例；过宽模型缩小到默认座椅的碰撞包络内。
    let scale=height/Math.max(size.y,.0001);if(kind==='seats')scale=Math.min(scale,.94/size.x,.85/size.z);
    const normalization=new THREE.Matrix4().makeScale(scale,scale,scale).multiply(new THREE.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z));
    object.updateMatrixWorld(true);const base=new THREE.Object3D();
    try{
      object.traverse(mesh=>{if(!mesh.isMesh)return;
        let geometry=mesh.geometry.clone();
        // 将蒙皮模型冻结为当前姿态，避免重复使用时共享骨骼引发坐标错误。
        if(mesh.isSkinnedMesh){const attribute=geometry.attributes.position;const v=new THREE.Vector3();for(let i=0;i<attribute.count;i++){mesh.getVertexPosition(i,v);attribute.setXYZ(i,v.x,v.y,v.z);}attribute.needsUpdate=true;geometry.computeVertexNormals();}
        const local=new THREE.Matrix4().multiplyMatrices(normalization,mesh.matrixWorld),sourceCount=mesh.isInstancedMesh?mesh.count:1;
        if(!mesh.isInstancedMesh)geometry.applyMatrix4(local);
        const batch=new THREE.InstancedMesh(geometry,mesh.material,placements.length*sourceCount);batch.castShadow=true;batch.receiveShadow=true;
        const instance=new THREE.Matrix4(),matrix=new THREE.Matrix4();
        placements.forEach((p,i)=>{base.position.copy(p.position);base.rotation.set(0,p.rotation,0);base.updateMatrix();
          for(let j=0;j<sourceCount;j++){
            if(mesh.isInstancedMesh){mesh.getMatrixAt(j,instance);matrix.copy(base.matrix).multiply(local).multiply(instance);}else matrix.copy(base.matrix);
            batch.setMatrixAt(i*sourceCount+j,matrix);
          }
        });batch.computeBoundingSphere();group.add(batch);
      });
      // 完整构造成功后再替换旧对象；解析失败时默认影院始终可用。
      if(!isCurrent()){group.children.forEach(m=>m.geometry.dispose());disposeObject(object);return;}
      this.clear(kind);this.defaultGroup(kind).visible=false;this.cinema.scene.add(group);this.current.set(kind,{id:record.id,group,object,stats});
    }catch(error){group.children.forEach(m=>m.geometry.dispose());disposeObject(object);throw error;}
  }
}
