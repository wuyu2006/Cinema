import * as THREE from '../../lib/three/three.module.js';
import { CINEMA as C } from '../core/Config.js';
import { clamp } from '../utils/MathUtils.js';
// 国内影院常见的按摩座椅区：把最佳观影位置整块换成按摩座椅。
// 行取自评分最优区间（最高分座位落在第 9 排 9/10 座），列取两条内部过道之间的中间座位块。
export const MASSAGE_ROWS=[8,10],MASSAGE_COLUMNS=[7,12];
export class SeatManager extends EventTarget {
  constructor(){
    super();this.selected=null;this.seats=[];
    for(let r=0;r<C.rows;r++)for(let c=0;c<C.columns;c++){
      const x=(c-(C.columns-1)/2)*C.seatPitch+(c<6?-C.aisleGap:c>=12?C.aisleGap:0);
      const z=C.rowStart+r*C.rowPitch,y=r*C.stepHeight;
      const seat={id:`${r+1}-${c+1}`,row:r+1,column:c+1,position:new THREE.Vector3(x,y,z),
        rotation:Math.atan2(x,z-C.screenZ)*.18,available:true,occupied:false};
      seat.distance=Math.hypot(x,z-C.screenZ);seat.horizontalOffset=Math.abs(x);
      seat.score=this.score(seat);
      seat.massage=seat.row>=MASSAGE_ROWS[0]&&seat.row<=MASSAGE_ROWS[1]&&seat.column>=MASSAGE_COLUMNS[0]&&seat.column<=MASSAGE_COLUMNS[1];
      this.seats.push(seat);
    }
  }
  score(seat){
    const p=seat.position, depth=p.z-C.screenZ, idealDepth=27, idealRow=C.rows*.66;
    // 距离约为银幕宽度的 1.08 倍；同时惩罚仰角、离轴角和远离声学甜区的位置。
    const distance=30*clamp(1-Math.abs(depth-idealDepth)/22,0,1);
    const center=25*clamp(1-Math.abs(p.x)/13,0,1);
    const angle=Math.atan2(C.screenCenterY-(p.y+C.seatedHeight),depth);
    const viewing=20*clamp(1-Math.abs(angle-.24)/.5,0,1);
    const audio=20*clamp(1-Math.hypot(p.x,(depth-idealDepth)*.65)/16,0,1);
    const row=5*clamp(1-Math.abs(seat.row-idealRow)/C.rows,0,1);
    return distance+center+viewing+audio+row;
  }
  best(){ return this.seats.filter(s=>s.available&&(!s.occupied||s===this.selected)).sort((a,b)=>b.score-a.score)[0]; }
  choose(seat){
    if(!seat || !seat.available || seat.occupied && seat!==this.selected)return false;
    this.release();this.selected=seat;seat.occupied=true;this.dispatchEvent(new Event('change'));return true;
  }
  release(){ if(this.selected)this.selected.occupied=false;this.selected=null;this.dispatchEvent(new Event('change')); }
  nearest(position,max=1.7){
    let best=null,dist=max;
    for(const s of this.seats){if(!s.available||s.occupied)continue;
      const d=Math.hypot(s.position.x-position.x,s.position.z-position.z);
      if(d<dist && Math.abs(s.position.y+C.standingHeight-position.y)<.7){best=s;dist=d;}
    }return best;
  }
  ground(z){return clamp(Math.floor((z-C.rowStart+C.rowPitch*.5)/C.rowPitch),0,C.rows-1)*C.stepHeight;}
  collides(x,z,radius=C.playerRadius){
    if(Math.abs(x)>Math.min(C.halfWidth,14.15)-radius || z>C.back-radius||z<C.front+radius)return true;
    return this.seats.some(s=>{
      const dx=x-s.position.x,dz=z-s.position.z,cos=Math.cos(s.rotation),sin=Math.sin(s.rotation);
      const lx=cos*dx-sin*dz,lz=sin*dx+cos*dz;
      // 圆形玩家投影与旋转座椅矩形求最近点，包含扶手包络，避免斜放椅子的边角漏判。
      const ax=lx-clamp(lx,-.55,.55),az=lz-clamp(lz,-.47,.5);
      return ax*ax+az*az<radius*radius;
    });
  }
  // 先沿排间通道横向到过道，再沿过道到目标排，最后接近座位，避免自动寻座穿过成排座椅。
  route(from,seat){
    const aisleX=[-13.2,-4.25,4.25,13.2].sort((a,b)=>Math.abs(a-from.x)-Math.abs(b-from.x))[0];
    const startRow=Math.round((from.z-C.rowStart)/C.rowPitch);
    const rowZ=C.rowStart+startRow*C.rowPitch;
    const walkway=from.z>C.rowStart+(C.rows-.5)*C.rowPitch||from.z<C.rowStart-C.rowPitch/2?from.z:
      clamp(rowZ+(from.z>=rowZ?1:-1)*C.rowPitch/2,C.front+1,C.back-1);
    const targetZ=seat.position.z-C.rowPitch/2;
    return [new THREE.Vector3(from.x,this.ground(walkway)+C.standingHeight,walkway),
      new THREE.Vector3(aisleX,this.ground(walkway)+C.standingHeight,walkway),
      new THREE.Vector3(aisleX,this.ground(targetZ)+C.standingHeight,targetZ),
      new THREE.Vector3(seat.position.x,seat.position.y+C.standingHeight,targetZ),
      new THREE.Vector3(seat.position.x,seat.position.y+C.standingHeight,seat.position.z-.12)];
  }
}
