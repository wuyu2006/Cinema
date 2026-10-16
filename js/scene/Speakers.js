import * as THREE from '../../lib/three/three.module.js';
import { box,sign } from './Primitives.js';
// 银幕后 L/C/R 与低音炮的 z 必须小于幕布平面（-22；幕布边缘向观众侧最大凸出 0.85m），
// 否则箱体会挡在幕布前面、直接遮住画面。幕布在真实影院中是透声幕，因此把它们整体移到幕布之后。
export const SPEAKER_LAYOUT = [
  {id:'L',position:[-8,7,-23.6],type:'front'},{id:'C',position:[0,7,-23.6],type:'front'},{id:'R',position:[8,7,-23.6],type:'front'},
  {id:'LFE',position:[0,1.2,-23.4],type:'sub'},
  ...[-9,-2,5,11].flatMap((z,i)=>[{id:`SL${i+1}`,position:[-15,6+i*.2,z],type:'side'},{id:`SR${i+1}`,position:[15,6+i*.2,z],type:'side'}]),
  {id:'BL',position:[-8,7,14.7],type:'back'},{id:'BR',position:[8,7,14.7],type:'back'},
  ...[-10,0,10].flatMap((z,i)=>[{id:`T${['F','M','R'][i]}L`,position:[-6,20,z],type:'top'},{id:`T${['F','M','R'][i]}R`,position:[6,20,z],type:'top'}])
];
export class Speakers {
  constructor(parent){
    this.group=new THREE.Group();this.labels=new THREE.Group();parent.add(this.group,this.labels);this.labels.visible=false;
    const caseMat=new THREE.MeshStandardMaterial({color:0x1d2026,roughness:.72});
    const grille=new THREE.MeshStandardMaterial({color:0x0d0f13,roughness:.9});
    for(const s of SPEAKER_LAYOUT){
      const g=new THREE.Group();g.position.set(...s.position);
      if(s.type==='side')g.rotation.y=s.position[0]<0?Math.PI/2:-Math.PI/2;
      if(s.type==='back')g.rotation.y=Math.PI;if(s.type==='top')g.rotation.x=Math.PI/2;
      const size=s.type==='sub'?[2.6,1.1,.75]:s.type==='front'?[1.3,2.5,.8]:[.8,1.15,.55];
      box(g,caseMat,size,[0,0,0]);box(g,grille,[size[0]*.88,size[1]*.88,.03],[0,0,-size[2]/2-.02]);
      this.group.add(g);
      // 银幕后音箱的标签同样留在幕布之后：它们描述的正是画面里看不到的音箱，
      // 若把标签移到幕布前面反而会再次遮住画面。
      const text=sign(this.labels,s.id,[s.position[0]*.92,s.position[1]+.9,s.position[2]-.8],1.2,.5,'#dfb975');
      text.userData.speaker=s;
    }
  }
  update(camera){if(this.labels.visible)this.labels.children.forEach(m=>m.quaternion.copy(camera.quaternion));}
}
