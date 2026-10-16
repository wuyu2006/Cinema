import * as THREE from '../../lib/three/three.module.js';
import { CINEMA as C } from '../core/Config.js';
import { clamp,lerp } from '../utils/MathUtils.js';
export class FirstPersonController extends EventTarget {
  constructor(camera,canvas,seatManager,settings){
    super();this.camera=camera;this.canvas=canvas;this.seats=seatManager;this.settings=settings;
    this.enabled=false;this.seated=false;this.transitioning=false;this.keys=new Set();this.velocity=new THREE.Vector3();
    this.yaw=this.targetYaw=0;this.pitch=this.targetPitch=0;this.pointer=null;this.mouseBudget=0;
    // 不创建任何可见 Avatar。碰撞只用数学胶囊的地面投影，视野中始终没有身体模型。
    document.addEventListener('pointerlockchange',()=>{this.keys.clear();this.dispatchEvent(new CustomEvent('lock',{detail:this.locked}));});
    document.addEventListener('pointerlockerror',()=>this.dispatchEvent(new Event('lockerror')));
    document.addEventListener('mousemove',e=>{if(this.locked&&this.enabled&&!this.blocked?.())this.look(e.movementX,e.movementY);});
    window.addEventListener('keydown',e=>{if(!this.enabled||this.blocked?.()||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(['KeyW','KeyA','KeyS','KeyD'].includes(e.code))this.keys.add(e.code);});
    window.addEventListener('keyup',e=>this.keys.delete(e.code));
    window.addEventListener('blur',()=>this.keys.clear());
    // 没有 Pointer Lock 的触摸设备仍可拖动画面环顾。
    canvas.addEventListener('pointerdown',e=>{if(!this.enabled||this.locked||this.blocked?.())return;this.pointer={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!this.pointer||this.locked)return;this.look(e.clientX-this.pointer.x,e.clientY-this.pointer.y);this.pointer={x:e.clientX,y:e.clientY};});
    canvas.addEventListener('pointerup',()=>this.pointer=null);
  }
  get locked(){return document.pointerLockElement===this.canvas;}
  async lock(){try{await this.canvas.requestPointerLock?.();}catch{this.dispatchEvent(new Event('lockerror'));}}
  release(){if(this.locked)document.exitPointerLock();}
  look(dx,dy){
    // 每帧限制总角位移，随后指数阻尼；高频鼠标事件不能绕过瞬时角速度限制。
    const factor=.002*this.settings.sensitivity,remaining=Math.max(0,.13-this.mouseBudget);
    const length=Math.hypot(dx,dy)*factor,scale=length>remaining?remaining/(length||1):1;
    this.mouseBudget+=length*scale;this.targetYaw-=dx*factor*scale;
    this.targetPitch=clamp(this.targetPitch-dy*factor*scale,-Math.PI/3,Math.PI/3);
  }
  reset(position){this.camera.position.copy(position);this.baseY=position.y;this.yaw=this.targetYaw=0;this.pitch=this.targetPitch=0;this.velocity.set(0,0,0);}
  faceScreen(immediate=false){
    const p=this.camera.position;const yaw=Math.atan2(p.x,p.z-C.screenZ);
    this.targetYaw=this.yaw+Math.atan2(Math.sin(yaw-this.yaw),Math.cos(yaw-this.yaw));
    this.targetPitch=clamp(Math.atan2(C.screenCenterY-p.y,p.z-C.screenZ),-.3,.6);
    if(immediate){this.yaw=this.targetYaw;this.pitch=this.targetPitch;}
  }
  update(dt,time){
    this.mouseBudget=0;if(!this.enabled||this.transitioning)return;
    if(this.blocked?.()){this.keys.clear();this.velocity.set(0,0,0);this.pointer=null;return;}
    const t=1-Math.exp(-this.settings.damping*dt);
    this.yaw=lerp(this.yaw,this.targetYaw,t);this.pitch=lerp(this.pitch,this.targetPitch,t);
    this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');
    if(!this.seated){
      const x=Number(this.keys.has('KeyD'))-Number(this.keys.has('KeyA'));
      const z=Number(this.keys.has('KeyS'))-Number(this.keys.has('KeyW'));
      const movement=new THREE.Vector3(x,0,z);if(movement.lengthSq())movement.normalize().applyAxisAngle(new THREE.Vector3(0,1,0),this.yaw).multiplyScalar(C.walkSpeed);
      this.velocity.lerp(movement,1-Math.exp(-12*dt));
      // 将一次移动分成小步，再分别解算 X/Z，使低帧率下也不会穿过扶手或墙壁。
      const steps=Math.max(1,Math.ceil(this.velocity.length()*dt/.08));
      for(let i=0;i<steps;i++){
        const p=this.camera.position,nx=p.x+this.velocity.x*dt/steps,nz=p.z+this.velocity.z*dt/steps;
        if(!this.seats.collides(nx,p.z))p.x=nx;
        if(!this.seats.collides(p.x,nz))p.z=nz;
      }
      this.baseY=lerp(this.baseY??this.camera.position.y,this.seats.ground(this.camera.position.z)+C.standingHeight,1-Math.exp(-15*dt));
    }else this.baseY=this.seats.selected?.position.y+C.seatedHeight||this.camera.position.y;
    this.camera.position.y=this.baseY+(this.settings.breathing?Math.sin(time*.9)*.012:0);
  }
}
