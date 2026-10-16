import * as THREE from '../../lib/three/three.module.js';
import { CINEMA as C } from '../core/Config.js';
// 熄灯后银幕是影厅里唯一的大面积光源，真实影院里它会把整间厅打亮：侧墙软包、座椅轮廓、
// 走道和天花板都能看出形状，而且颜色随画面变化。
// 单个点光源做不到这件事（衰减太快、只有一个亮点），这里用“银幕正前方一排点光源 + 一盏半球补光”
// 近似这块面积光。采样仍然每 160ms 只读 32×18 像素，不在 4K 视频上做逐帧 CPU 分析。
export class ScreenGlow {
  constructor(parent,video){
    this.video=video;this.enabled=true;this.tainted=false;this.timer=0;this.brightness=.34;
    this.canvas=document.createElement('canvas');this.canvas.width=32;this.canvas.height=18;
    this.context=this.canvas.getContext('2d',{willReadFrequently:true});
    this.targetColor=new THREE.Color(.78,.82,1);this.color=this.targetColor.clone();
    // 横向铺满整块银幕。decay=1 而不是 2：大面积光源的照度衰减远慢于一个灯泡，
    // 否则后墙和后排座椅完全收不到光，就是“屏幕很亮但墙上一点光都没有”。
    const height=C.screenCenterY-.6,depth=C.screenZ+2.8;
    this.lights=[];
    for(let i=0;i<5;i++){
      const light=new THREE.PointLight(0xc9d9ff,0,0,1);
      light.position.set((i-2)/2*C.screenWidth*.44,height,depth);
      light.visible=false;parent.add(light);this.lights.push(light);
    }
    this.setCount(3);
    // 半球补光不随距离衰减：保证最远的后墙、天花板和高处也有轮廓；天空色跟随画面。
    this.fill=new THREE.HemisphereLight(0xc9d9ff,0x0d0b12,0);parent.add(this.fill);
  }
  setCount(count){this.lights.forEach((light,i)=>light.visible=i<count);}
  reset(){this.tainted=false;this.timer=0;this.brightness=.34;this.targetColor.setRGB(.78,.82,1);this.color.copy(this.targetColor);}
  sample(){
    if(this.video.readyState<2||this.tainted)return;
    try{this.context.drawImage(this.video,0,0,32,18);const d=this.context.getImageData(0,0,32,18).data;let r=0,g=0,b=0;
      for(let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];}
      const n=d.length/4*255;r/=n;g/=n;b/=n;
      // 下限 0.3：全黑画面在真实影院里也不是一点光都没有（放映机与杂散光），
      // 否则暗场会把整间厅彻底吃掉、什么轮廓都看不见。
      this.brightness=Math.max(.3,.2126*r+.7152*g+.0722*b);
      // 降低饱和度与强度，银幕反射不能变成闪烁的 RGB 舞台灯。
      this.targetColor.setRGB(r*.45+.3,g*.45+.3,b*.45+.3,THREE.SRGBColorSpace);
    }catch{this.tainted=true;this.brightness=.3;}
  }
  update(dt,screenLevel){
    this.timer+=dt;if(this.enabled&&this.timer>=.16){this.timer=0;this.sample();}
    const level=screenLevel||0;
    // 关闭「动态银幕溢光」只停止跟随画面颜色，银幕灯本身始终存在，
    // 否则观影时整间厅会重新变回全黑。
    if(!this.enabled)this.targetColor.setRGB(.78,.8,.92,THREE.SRGBColorSpace);
    this.color.lerp(this.targetColor,1-Math.exp(-2.5*dt));
    const brightness=this.enabled?this.brightness:.42;
    // 强度经过实拍标定：太亮会变成“开着场灯看电影”，太暗就回到“屏幕上很亮、墙上一点光都没有”。
    // 参考值（银幕画面亮度 0.62、画面不透明度 1）：单灯约 14，半球补光约 0.32。
    const target=Math.min(22,brightness*23)*level;
    const damping=1-Math.exp(-3*dt);
    for(const light of this.lights){light.color.copy(this.color);light.intensity+=(target-light.intensity)*damping;}
    // 半球补光负责“轮廓”：它不随距离衰减，因此侧墙、天花板和背对银幕的表面也有形状。
    this.fill.color.copy(this.color);
    this.fill.intensity+=((Math.min(.38,brightness*.52)*level)-this.fill.intensity)*damping;
  }
}
