import * as THREE from '../../lib/three/three.module.js';
import { disposeObject } from '../scene/Primitives.js';
export class ModelPreview {
  constructor(canvas,object){
    this.canvas=canvas;this.object=object;this.running=true;this.angle=.35;this.drag=null;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setSize(canvas.clientWidth||600,canvas.clientHeight||300,false);
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(40,canvas.clientWidth/(canvas.clientHeight||300),.01,100);this.camera.position.set(3,1.8,4);this.camera.lookAt(0,1,0);
    this.pivot=new THREE.Group();const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const scale=2/Math.max(size.y,size.x,size.z);object.scale.multiplyScalar(scale);object.position.sub(center.multiplyScalar(scale));object.position.y+=1;
    this.pivot.add(object);this.scene.add(this.pivot,new THREE.HemisphereLight(0xd2e6ff,0x403227,2));
    const light=new THREE.DirectionalLight(0xffe5c2,3);light.position.set(3,6,5);this.scene.add(light);
    const grid=new THREE.GridHelper(8,20,0x4d4840,0x26272b);this.scene.add(grid);
    this.onDown=e=>{this.drag=e.clientX;canvas.setPointerCapture(e.pointerId);};this.onMove=e=>{if(this.drag!==null){this.angle+=(e.clientX-this.drag)*.01;this.drag=e.clientX;}};this.onUp=()=>this.drag=null;
    canvas.addEventListener('pointerdown',this.onDown);canvas.addEventListener('pointermove',this.onMove);canvas.addEventListener('pointerup',this.onUp);
    const render=()=>{if(!this.running)return;if(this.drag===null)this.angle+=.002;this.pivot.rotation.y=this.angle;this.renderer.render(this.scene,this.camera);this.frame=requestAnimationFrame(render);};render();
  }
  destroy(){this.running=false;cancelAnimationFrame(this.frame);this.canvas.removeEventListener('pointerdown',this.onDown);this.canvas.removeEventListener('pointermove',this.onMove);this.canvas.removeEventListener('pointerup',this.onUp);disposeObject(this.object);this.scene.children.filter(x=>x.isGridHelper).forEach(disposeObject);this.renderer.dispose();this.renderer.forceContextLoss();}
}
