import * as THREE from '../../lib/three/three.module.js';
import { CINEMA as C } from '../core/Config.js';
import { ease,lerp } from '../utils/MathUtils.js';
export class SeatTransition {
  constructor(controller,manager){this.controller=controller;this.manager=manager;this.active=false;this.resolve=null;}
  start(seat,{travel=true}={}){
    if(!this.manager.choose(seat))return Promise.reject(new Error('该座位不可用'));
    this.cancel();this.active=true;this.controller.transitioning=true;this.controller.keys.clear();
    this.points=travel?this.manager.route(this.controller.camera.position,seat):[];
    this.seat=seat;this.startPoint=this.controller.camera.position.clone();this.index=0;this.elapsed=0;
    this.sitting=!this.points.length;this.startYaw=this.controller.yaw;this.startPitch=this.controller.pitch;
    return new Promise(resolve=>this.resolve=resolve);
  }
  cancel(){if(this.resolve)this.resolve(false);this.resolve=null;this.active=false;this.controller.transitioning=false;}
  update(dt){
    if(!this.active)return;const c=this.controller,p=c.camera.position;this.elapsed+=dt;
    if(!this.sitting){
      const target=this.points[this.index],duration=Math.max(.12,this.startPoint.distanceTo(target)/8);
      const t=Math.min(1,this.elapsed/duration);p.lerpVectors(this.startPoint,target,ease(t));
      c.faceScreen();c.yaw=lerp(c.yaw,c.targetYaw,1-Math.exp(-4*dt));c.pitch=lerp(c.pitch,c.targetPitch,1-Math.exp(-4*dt));
      if(t===1){this.index++;this.elapsed=0;this.startPoint.copy(p);if(this.index===this.points.length)this.sitting=true;}
    }else{
      // 1.05 秒的坐下运动只作用于相机：下降、后移及不足 1cm 的座垫回弹。
      const t=Math.min(1,this.elapsed/1.05),s=ease(t),seat=this.seat;
      const target=new THREE.Vector3(seat.position.x,seat.position.y+C.seatedHeight,seat.position.z+.03);
      p.lerpVectors(this.startPoint,target,s);p.y+=Math.sin(t*Math.PI*3)*.009*(1-t);
      c.faceScreen();c.yaw=lerp(c.yaw,c.targetYaw,1-Math.exp(-6*dt));c.pitch=lerp(c.pitch,c.targetPitch,1-Math.exp(-6*dt));
      if(t===1){this.active=false;c.transitioning=false;c.seated=true;c.baseY=p.y;const resolve=this.resolve;this.resolve=null;resolve?.(true);}
    }
    c.camera.rotation.set(c.pitch,c.yaw,0,'YXZ');
  }
}
