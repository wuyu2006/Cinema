import * as THREE from '../../lib/three/three.module.js';
import { CINEMA as C } from '../core/Config.js';
import { roundedBox,sign } from './Primitives.js';
// 一种零件只提交一次 draw call；216 把椅子复用几何、纹理与材质。
// 把几何沿法线整体外扩，得到只用于描边的外壳：只画背面，实心部分因深度测试失败被座椅本身遮住，剩下一圈轮廓。
function shell(geometry,distance){
  const g=geometry.clone(),p=g.attributes.position,n=g.attributes.normal;
  for(let i=0;i<p.count;i++)p.setXYZ(i,p.getX(i)+n.getX(i)*distance,p.getY(i)+n.getY(i)*distance,p.getZ(i)+n.getZ(i)*distance);
  p.needsUpdate=true;g.computeBoundingBox();g.computeBoundingSphere();return g;
}
export class Seats {
  constructor(parent,manager){
    this.manager=manager;
    this.group=new THREE.Group();parent.add(this.group);this.numbers=new THREE.Group();parent.add(this.numbers);this.numbers.visible=false;
    const fabric=new THREE.MeshStandardMaterial({color:0x602b34,roughness:.94});
    const cushion=new THREE.MeshStandardMaterial({color:0x6c303a,roughness:.94});
    const plastic=new THREE.MeshStandardMaterial({color:0x16161c,roughness:.65});
    const metal=new THREE.MeshStandardMaterial({color:0x24242a,metalness:.65,roughness:.38});
    const backrest=roundedBox(.85,.95,.21),seatCushion=roundedBox(.82,.2,.77);
    const parts=[
      [backrest,fabric,[0,.89,.27],[.12,0,0]],
      [seatCushion,cushion,[0,.45,-.04],[0,0,0]],
      [roundedBox(.13,.12,.72,.04),plastic,[-.48,.67,-.01],[0,0,0]],
      [roundedBox(.13,.12,.72,.04),plastic,[.48,.67,-.01],[0,0,0]],
      [new THREE.BoxGeometry(.72,.12,.62),plastic,[0,.31,0],[0,0,0]],
      [new THREE.BoxGeometry(.12,.33,.45),metal,[0,.16,.08],[0,0,0]],
      [new THREE.CylinderGeometry(.058,.045,.07,12),metal,[-.48,.73,-.23],[0,0,0]],
      [new THREE.CylinderGeometry(.058,.045,.07,12),metal,[.48,.73,-.23],[0,0,0]]
    ];
    // 国内影院的按摩座椅区：整块最佳观影位置换成带按摩靠垫的皮椅。
    // 颜色沿用本厅既有的深红座椅与金色标识，改为更深的皮质 + 金色包边，暂时不含任何按摩功能。
    const leather=new THREE.MeshStandardMaterial({color:0x1b1417,roughness:.42,metalness:.06});
    const gold=new THREE.MeshStandardMaterial({color:0xa8874c,roughness:.3,metalness:.62});
    const control=new THREE.MeshStandardMaterial({color:0x121116,roughness:.55});
    const tilt=.12;
    // 入座后相机 (视线) 固定在座椅局部坐标 (0, C.seatedHeight, +0.03)，任何靠垫都必须留在它后面，
    // 否则转头时近裁剪面 (0.08) 会把靠垫切掉，看起来就是穿模。
    // 因此所有靠垫都按“贴着靠背正面”定位：surface(y) 是靠背/皮革外壳正面在高度 y 处的 z。
    const surface=y=>.160871+(y-.904364)*.120578;
    const hug=(y,thickness)=>surface(y)-.4961*thickness;
    const massageParts=[
      // 靠背与坐垫整体重新包一层深色皮革：观众从影厅后方（也就是入场方向）看到的正是椅背，
      // 只贴正面靠垫的话按摩区从后面看和普通座椅完全一样。外壳正面只比原靠背凸出 5mm。
      [roundedBox(.89,.99,.24,.07),leather,[0,.89,.28],[tilt,0,0]],
      [roundedBox(.86,.24,.81,.06),leather,[0,.45,-.04],[0,0,0]],
      // 正面按摩靠垫与金色包边：都做成薄垫并压在肩线以下，不侵入头部空间。
      [roundedBox(.76,.46,.055,.025),leather,[0,.8,hug(.8,.055)],[tilt,0,0]],
      [roundedBox(.82,.52,.03,.015),gold,[0,.79,hug(.79,.03)],[tilt,0,0]],
      [roundedBox(.42,.16,.035,.015),leather,[0,1.29,hug(1.29,.035)],[tilt,0,0]],
      [roundedBox(.52,.18,.11,.05),leather,[0,.5,hug(.5,.11)],[tilt,0,0]],
      [roundedBox(.74,.13,.66,.05),leather,[0,.615,-.04],[0,0,0]],
      [roundedBox(.8,.08,.72,.02),gold,[0,.585,-.04],[0,0,0]],
      // 扶手控制面板（仅外观，暂时不含按摩功能）。
      [roundedBox(.15,.04,.2,.015),control,[.48,.752,0],[0,0,0]],
      [roundedBox(.17,.02,.22,.01),gold,[.48,.738,0],[0,0,0]]
    ];
    const transform=new THREE.Object3D(),local=new THREE.Object3D();
    const instance=(geometry,material,offset,rotation,seats)=>{
      const batch=new THREE.InstancedMesh(geometry,material,seats.length);batch.castShadow=true;batch.receiveShadow=true;
      local.position.set(...offset);local.rotation.set(...rotation);local.updateMatrix();
      seats.forEach((seat,i)=>{transform.position.copy(seat.position);transform.rotation.set(0,seat.rotation,0);transform.updateMatrix();batch.setMatrixAt(i,new THREE.Matrix4().multiplyMatrices(transform.matrix,local.matrix));});
      batch.computeBoundingSphere();this.group.add(batch);return batch;
    };
    for(const [geometry,material,offset,rotation] of parts)instance(geometry,material,offset,rotation,manager.seats);
    const massageSeats=manager.seats.filter(s=>s.massage);
    if(massageSeats.length)for(const [geometry,material,offset,rotation] of massageParts)instance(geometry,material,offset,rotation,massageSeats);
    // 准星拾取用的不可见包围盒：Raycaster 不检查 visible，所以它只参与命中测试、不产生任何绘制，
    // 并且与座椅 3D 模型是否被替换无关（替换后的模型仍摆在同一个逻辑座位上）。
    this.hitProxy=instance(new THREE.BoxGeometry(1.06,1.44,.92),new THREE.MeshBasicMaterial(),[0,.74,-.02],[0,0,0],manager.seats);
    this.hitProxy.visible=false;
    this.raycaster=new THREE.Raycaster();this.raycaster.far=C.aimDistance;this.screenCenter=new THREE.Vector2(0,0);
    for(let r=0;r<C.rows;r++){
      for(const x of [-12.4,12.4]){const s=sign(parent,String.fromCharCode(65+r),[x,r*C.stepHeight+.4,C.rowStart+r*C.rowPitch],.3,.3,'#af9671');s.rotation.y=x<0?Math.PI/2:-Math.PI/2;}
    }
    manager.seats.forEach(s=>sign(this.numbers,`${s.row} · ${s.column}`,[s.position.x,s.position.y+1.2,s.position.z+.43],.4,.12,'#aa9a85'));
    this.marker=new THREE.Mesh(new THREE.RingGeometry(.12,.16,32),new THREE.MeshBasicMaterial({color:0xff8a1e,side:THREE.DoubleSide,transparent:true,opacity:.75,depthWrite:false}));
    this.marker.rotation.x=-Math.PI/2;this.marker.visible=false;parent.add(this.marker);
    this.outline=new THREE.Group();this.outline.visible=false;parent.add(this.outline);
    const outline=new THREE.MeshBasicMaterial({color:0xff8a1e,side:THREE.BackSide,transparent:true,opacity:.92,depthWrite:false,toneMapped:false});
    for(const [geometry,offset,rotation,thickness] of [[backrest,[0,.89,.27],[.12,0,0],.05],[seatCushion,[0,.45,-.04],[0,0,0],.045]]){
      const mesh=new THREE.Mesh(shell(geometry,thickness),outline);mesh.position.set(...offset);mesh.rotation.set(...rotation);this.outline.add(mesh);
    }
  }
  // 屏幕中心（准星）射线上第一个通过筛选的座位；射线不超过 C.aimDistance。
  pick(camera,selectable){
    camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.screenCenter,camera);
    for(const hit of this.raycaster.intersectObject(this.hitProxy,false)){
      const seat=this.manager.seats[hit.instanceId];
      if(seat&&(!selectable||selectable(seat)))return seat;
    }
    return null;
  }
  highlight(seat){
    this.marker.visible=this.outline.visible=!!seat;
    if(!seat)return;
    this.marker.position.set(seat.position.x,seat.position.y+.02,seat.position.z-.66);
    this.outline.position.copy(seat.position);this.outline.rotation.set(0,seat.rotation,0);
  }
}
