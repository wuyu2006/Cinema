import * as THREE from '../../lib/three/three.module.js';
import { CINEMA as C } from '../core/Config.js';
import { box,sign,surfaceTexture } from './Primitives.js';
export function buildArchitecture(group,lighting){
  const replacements={};for(const kind of ['lamps','exit','doors','decor']){const g=new THREE.Group();g.userData.keepBatch=true;group.add(g);replacements[kind]=g;}
  const carpet=new THREE.MeshStandardMaterial({color:0x39313a,map:surfaceTexture('carpet'),roughness:1});
  const wall=new THREE.MeshStandardMaterial({color:0x37333b,map:surfaceTexture('wall'),roughness:.98});
  const dark=new THREE.MeshStandardMaterial({color:0x17191f,roughness:.85});
  const metal=new THREE.MeshStandardMaterial({color:0x5a5654,metalness:.7,roughness:.4});
  const trim=new THREE.MeshStandardMaterial({color:0x463b32,metalness:.55,roughness:.55});
  const warm=new THREE.MeshStandardMaterial({color:0xd9ae6d,emissive:0xf6bb71,emissiveIntensity:1});
  const wallLamp=new THREE.MeshStandardMaterial({color:0xf0d1a2,emissive:0xffcf90,emissiveIntensity:1});
  const downlight=new THREE.MeshStandardMaterial({color:0xffe9ca,emissive:0xffdba2,emissiveIntensity:1});
  const green=new THREE.MeshStandardMaterial({color:0x163a2b,emissive:0x4da57a,emissiveIntensity:.3});
  lighting.register('step',warm,1.6);lighting.register('wall',wallLamp,1.7);lighting.register('ceiling',downlight,2);
  lighting.register('exit',green,1.3);
  box(group,carpet,[31,.3,42],[0,-.2,-4]);
  for(let r=0;r<C.rows;r++){
    const y=r*C.stepHeight,z=C.rowStart+r*C.rowPitch;
    box(group,carpet,[31,y+.2,C.rowPitch],[0,(y-.2)/2,z]);
    for(const x of [-13.5,-4.25,4.25,13.5]){
      box(group,warm,[.72,.025,.025],[x,y+.02,z-C.rowPitch/2+.02]);
      // 低位阶梯灯采用自发光几何，不为每盏灯创建昂贵的实时光源。
      box(group,dark,[.76,.05,.08],[x,y+.01,z-C.rowPitch/2+.02]);
      box(group,warm,[.65,.022,.025],[x,y+.043,z-C.rowPitch/2-.023]);
    }
  }
  const backY=(C.rows-1)*C.stepHeight;
  box(group,carpet,[31,backY+.2,4],[0,(backY-.2)/2,13]);
  for(const x of [-15.7,15.7]){
    box(group,wall,[.4,22,42],[x,10.8,-4]);
    for(let z=-18;z<15;z+=2.65){
      box(group,dark,[.15,10,2.3],[x*.982,8,z]);
      box(group,wall,[.2,9.7,2.18],[x*.976,8,z]);
      box(group,trim,[.09,.05,2.3],[x*.971,13,z]);
    }
    for(const z of [-10,1,11]){
      box(replacements.lamps,trim,[.3,1.7,.4],[x*.96,5,z]);
      box(replacements.lamps,wallLamp,[.08,1.2,.15],[x*.946,5,z]);
    }
    box(replacements.exit,green,[.12,.5,1.3],[x*.967,6,12.5]);
    const exit=sign(replacements.exit,'EXIT  →',[x*.962,6,12.5],1.2,.4,'#8fb49e');exit.rotation.y=x<0?Math.PI/2:-Math.PI/2;
    box(replacements.doors,dark,[.12,2.5,1.6],[x*.962,backY+1.25,12.5]);
    // 侧墙扶手与楼梯走向一致，给空间尺度提供参照。
    for(let r=0;r<C.rows-1;r++){
      const rail=box(group,metal,[.055,.055,C.rowPitch*1.03],[x*.91,r*C.stepHeight+1.0,C.rowStart+r*C.rowPitch+.7]);rail.rotation.x=-.17;
      box(group,metal,[.04,.85,.04],[x*.91,r*C.stepHeight+.57,C.rowStart+r*C.rowPitch]);
    }
  }
  box(group,wall,[31,22,.4],[0,10.8,15.2]);
  box(group,dark,[31,.35,42],[0,21.8,-4]);
  for(let z=-20;z<16;z+=2.5)box(group,wall,[30,.3,.55],[0,21.5,z]);
  for(const x of [-9,0,9])for(const z of [-10,7]){
    box(group,metal,[2.2,.08,.9],[x,21.4,z]);
    for(let i=0;i<9;i++)box(group,dark,[2,.03,.035],[x,21.34,z-.35+i*.085]);
    box(group,dark,[.85,.06,.85],[x+2,21.4,z+3]);
    const sprinkler=new THREE.Mesh(new THREE.CylinderGeometry(.035,.09,.1,8),metal);sprinkler.position.set(x-2,21.25,z+3);group.add(sprinkler);
  }
  for(const x of [-7,7])for(const z of [-7,8]){
    box(group,downlight,[.3,.06,.3],[x,21.32,z]);
    const light=new THREE.PointLight(0xffdfb3,100,35,2);light.position.set(x,14,z);group.add(light);lighting.register('ceiling',light,100);
  }
  for(const x of [-13,13]){
    const light=new THREE.PointLight(0xe9b777,35,23,2);light.position.set(x,6,1);group.add(light);lighting.register('wall',light,35);
  }
  // 仅一个主光源投射实时阴影；低画质会统一关闭阴影。
  const key=new THREE.SpotLight(0xffe2c1,280,.0,Math.PI/3,.7,1.7);key.position.set(0,18,0);key.target.position.set(0,0,2);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);key.shadow.bias=-.001;key.shadow.normalBias=.04;group.add(key,key.target);lighting.register('ceiling',key,280);
  const ambient=new THREE.HemisphereLight(0xbbb8d0,0x25212b,.7);group.add(ambient);lighting.register('ambient',ambient,.7);
  return {carpet,wall,metal,warm,wallLamp,downlight,green,replacements};
}
