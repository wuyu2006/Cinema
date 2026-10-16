import * as THREE from '../../lib/three/three.module.js';
import { mergeGeometries } from '../../lib/three/utils/BufferGeometryUtils.js';
// 程序化纹理不需要外部图片；固定的伪随机序列使每次启动的材质细节一致。
export function surfaceTexture(kind='carpet'){
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d'); let seed=42;
  const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  ctx.fillStyle=kind==='carpet'?'#25232a':'#33333a'; ctx.fillRect(0,0,128,128);
  for(let i=0;i<4000;i++){
    const v=Math.floor(rand()*30); ctx.fillStyle=`rgba(${90+v},${80+v},${85+v},${.05+rand()*.18})`;
    ctx.fillRect(rand()*128,rand()*128,kind==='carpet'?1:2,kind==='carpet'?3:1);
  }
  if(kind==='wall') for(let x=4;x<128;x+=8)for(let y=4;y<128;y+=8){ctx.fillStyle='#15151a';ctx.beginPath();ctx.arc(x,y,1.2,0,Math.PI*2);ctx.fill();}
  const texture=new THREE.CanvasTexture(canvas); texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(kind==='carpet'?3:2,kind==='carpet'?3:2); texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
const unitBox=new THREE.BoxGeometry(1,1,1);
export function box(parent,material,size,position,rotation){
  const m=new THREE.Mesh(unitBox,material); m.scale.set(...size); m.position.set(...position);
  if(rotation)m.rotation.set(...rotation); m.castShadow=true; m.receiveShadow=true;m.userData.batchBox=true; parent.add(m); return m;
}
export function label(text,{color='#e6dfce',background='transparent',width=512,height=128,size=64}={}){
  const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');
  if(background!=='transparent'){ctx.fillStyle=background;ctx.fillRect(0,0,width,height);}
  ctx.fillStyle=color;ctx.font=`600 ${size}px Arial, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,width/2,height/2);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({map:t,transparent:background==='transparent',toneMapped:false,side:THREE.DoubleSide});
}
export function sign(parent,text,position,width=2,height=.5,color){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(width,height),label(text,{color}));m.position.set(...position);parent.add(m);return m;
}
export function roundedBox(w,h,d,r=.06){
  const s=new THREE.Shape(),x=-w/2+r,y=-h/2+r,ww=w-2*r,hh=h-2*r;
  s.moveTo(x,y);s.lineTo(x+ww,y);s.lineTo(x+ww,y+hh);s.lineTo(x,y+hh);s.closePath();
  const g=new THREE.ExtrudeGeometry(s,{depth:Math.max(.01,d-2*r),bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:r,bevelThickness:r});g.center();return g;
}
// 资源替换与预览关闭时释放 GPU 对象；共享几何与材质通过 Set 保证只释放一次。
export function disposeObject(root){
  const geometries=new Set(), materials=new Set(),textures=new Set();
  root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of [].concat(o.material)){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>{t.dispose();t.image?.close?.();});
}
export function batchStaticBoxes(root){
  root.children.filter(c=>c.userData.keepBatch).forEach(c=>batchStaticBoxes(c));
  root.updateMatrixWorld(true);const inverse=new THREE.Matrix4().copy(root.matrixWorld).invert(),buckets=new Map(),old=[];
  root.traverse(o=>{if(!o.userData.batchBox)return;let parent=o.parent;while(parent&&parent!==root){if(parent.userData.keepBatch)return;parent=parent.parent;}
    const g=o.geometry.clone();g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));
    if(!buckets.has(o.material))buckets.set(o.material,[]);buckets.get(o.material).push(g);old.push(o);});
  for(const o of old)o.removeFromParent();
  for(const [material,geometries] of buckets){const g=mergeGeometries(geometries,false),mesh=new THREE.Mesh(g,material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);geometries.forEach(x=>x.dispose());}
}
