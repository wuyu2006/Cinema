import * as THREE from '../../lib/three/three.module.js';
import { box,sign,label,surfaceTexture,batchStaticBoxes } from './Primitives.js';
// 大厅也是真实 WebGL 场景，海报、灯箱、地毯均由本地程序生成。
export class LobbyScene {
  constructor(){
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x090b0d);
    this.scene.fog=new THREE.FogExp2(0x090b0d,.026);
    this.camera=new THREE.PerspectiveCamera(49,innerWidth/innerHeight,.1,100);
    this.camera.position.set(9,2.9,17);this.camera.lookAt(0,3.4,-8);
    const g=new THREE.Group();this.scene.add(g);
    const stone=new THREE.MeshStandardMaterial({color:0x29272a,roughness:.26,metalness:.5,map:surfaceTexture('wall')});
    const wall=new THREE.MeshStandardMaterial({color:0x2e2d2d,roughness:.9});
    const black=new THREE.MeshStandardMaterial({color:0x0d1116,roughness:.8});
    const brass=new THREE.MeshStandardMaterial({color:0x8e7051,metalness:.8,roughness:.4});
    const glow=new THREE.MeshBasicMaterial({color:0xf3d9ac,toneMapped:false});
    const blue=new THREE.MeshBasicMaterial({color:0x9ab8c4,toneMapped:false});
    box(g,stone,[36,.2,48],[0,-.15,0]);
    box(g,wall,[36,13,.5],[0,6,-13]);box(g,black,[36,.3,48],[0,12,0]);
    box(g,wall,[.6,12,48],[-15,6,0]);box(g,wall,[.6,12,48],[15,6,0]);
    // 构造门洞周围的分层竖向线条，地面平行灯带把视线引向影厅入口。
    for(let x=-14;x<=14;x+=1.1){box(g,black,[.25,11,.3],[x,5.6,-12.65]);box(g,brass,[.022,11,.1],[x+.15,5.6,-12.42]);}
    box(g,black,[9,7,.9],[1,3.5,-12.1]);
    for(const x of [-3.6,5.6]){box(g,brass,[.2,7.3,.3],[x,3.65,-11.55]);box(g,glow,[.045,7.2,.05],[x+.12,3.65,-11.36]);}
    box(g,brass,[9.4,.2,.3],[1,7.2,-11.55]);box(g,glow,[9.2,.035,.04],[1,7.34,-11.36]);
    for(const x of [-1.1,3.1]){
      box(g,wall,[4.05,6.6,.2],[x,3.3,-11.75]);box(g,brass,[.065,1,.12],[x+(x<0?1.7:-1.7),3,-11.55]);
      for(let i=0;i<10;i++)box(g,black,[.035,6.4,.02],[x-1.7+i*.38,3.3,-11.61]);
    }
    sign(g,'I M A X',[1,8.7,-12.1],8,1.8,'#c8dce1');
    sign(g,'A U D I T O R I U M   0 1',[1,7.8,-11.8],5,.45,'#b49e80');
    sign(g,'BEYOND THE FRAME',[-8.6,7.5,-12.2],5,.45,'#b6a78e');
    for(const x of [-12,-8,10,14])for(let z=-10;z<22;z+=4){
      box(g,brass,[.04,.01,2.9],[x,.01,z]);
    }
    for(const x of [-5.2,7.2])box(g,glow,[.025,.012,21],[x,.015,-1]);
    for(const x of [-9.8,11]){
      box(g,brass,[3.4,5.4,.15],[x,3.5,-12.1]);
      const poster=new THREE.Mesh(new THREE.PlaneGeometry(3.15,5.15),this.poster());poster.position.set(x,3.5,-11.99);g.add(poster);
      const light=new THREE.PointLight(0xc3d8e8,8,8);light.position.set(x,4,-10.7);g.add(light);
    }
    for(const x of [-13.4,13.4])for(const z of [-7,3,13]){
      box(g,brass,[.2,2.5,.3],[x,4,z]);box(g,glow,[.025,2.2,.15],[x+(x<0?.12:-.12),4,z]);
      const l=new THREE.PointLight(0xe5bc83,35,15,2);l.position.set(x*.95,4,z);g.add(l);
    }
    this.scene.add(new THREE.HemisphereLight(0x91a3ae,0x2c2118,.65));
    const top=new THREE.DirectionalLight(0xc2cfdd,1.1);top.position.set(2,9,3);this.scene.add(top);
    batchStaticBoxes(g);
    this.target=new THREE.Vector2();window.addEventListener('pointermove',e=>{this.target.set((e.clientX/innerWidth-.5)*.6,(e.clientY/innerHeight-.5)*.15);});
  }
  poster(){
    const c=document.createElement('canvas');c.width=512;c.height=840;const x=c.getContext('2d');
    const gr=x.createLinearGradient(0,0,512,840);gr.addColorStop(0,'#061c27');gr.addColorStop(.5,'#234b5b');gr.addColorStop(1,'#0a1117');x.fillStyle=gr;x.fillRect(0,0,512,840);
    let s=311;const rand=()=>((s=(s*1664525+1013904223)>>>0)/4294967296);
    for(let i=0;i<360;i++){x.fillStyle=`rgba(225,237,233,${rand()*.7})`;x.fillRect(rand()*512,rand()*620,1+rand()*2,1+rand()*2);}
    for(let i=0;i<30;i++){x.beginPath();x.ellipse(256,350,175+i*1.5,100+i*.9,-.5,0,Math.PI*2);x.strokeStyle=`rgba(214,185,137,${.02+i*.001})`;x.lineWidth=1;x.stroke();}
    const planet=x.createRadialGradient(220,250,0,255,330,115);planet.addColorStop(0,'#9badb5');planet.addColorStop(.8,'#234453');planet.addColorStop(1,'#050e17');x.fillStyle=planet;x.beginPath();x.arc(256,330,114,0,Math.PI*2);x.fill();
    x.textAlign='center';x.fillStyle='#e0d9c7';x.font='20px Arial';x.fillText('AN IMMERSIVE EXPERIENCE',256,640);x.font='54px Georgia';x.fillText('THE INFINITE',256,716);x.font='16px Arial';x.fillStyle='#b8ab93';x.fillText('A JOURNEY BEYOND THE FRAME',256,762);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshBasicMaterial({map:t,toneMapped:false});
  }
  update(time){this.camera.position.x=9+this.target.x;this.camera.position.y=2.9-this.target.y;this.camera.lookAt(0,3.5,-8);}
}
