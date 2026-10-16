import * as THREE from '../../lib/three/three.module.js';
import { EffectComposer } from '../../lib/three/postprocessing/EffectComposer.js';
import { RenderPass } from '../../lib/three/postprocessing/RenderPass.js';
import { SSAOPass } from '../../lib/three/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from '../../lib/three/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../lib/three/postprocessing/OutputPass.js';
import { CINEMA as C } from './Config.js';
import { PerformanceMonitor } from '../utils/PerformanceMonitor.js';
export class CinemaRenderer {
  constructor(canvas,settings){
    this.settings=settings;this.canvas=canvas;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    // SDR 影片已经由浏览器解码。不再对银幕叠加 ACES，保持原始色彩；光照以线性空间计算。
    this.renderer.toneMapping=THREE.NoToneMapping;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.performance=new PerformanceMonitor(this.renderer);this.composer=null;this.cinema=null;
  }
  configure(cinema){
    this.cinema=cinema;const p=this.performance.preset(this.settings.quality);this.preset=p;
    this.renderer.shadowMap.enabled=p.shadows&&this.settings.shadows;
    if(this.composer){this.composer.passes.forEach(pass=>pass.dispose?.());this.composer.dispose();this.composer=null;}
    if(p.post){
      try{
        const size=this.renderer.getSize(new THREE.Vector2());
        const target=new THREE.WebGLRenderTarget(size.x||1,size.y||1,{type:this.renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType});
        this.composer=new EffectComposer(this.renderer,target);this.composer.addPass(new RenderPass(cinema.scene,cinema.camera));
        if(p.ssao&&this.settings.ssao){this.ssao=new SSAOPass(cinema.scene,cinema.camera,Math.max(1,innerWidth),Math.max(1,innerHeight),8);this.ssao.kernelRadius=5;this.ssao.minDistance=.001;this.ssao.maxDistance=.08;this.composer.addPass(this.ssao);}
        if(p.bloom&&this.settings.bloom){this.bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.065,.3,1.05);this.composer.addPass(this.bloom);}
        this.composer.addPass(new OutputPass());
      }catch(error){console.warn('后处理不可用，使用直接渲染',error);this.composer?.dispose();this.composer=null;}
    }
    this.resize();
  }
  resize(){
    const width=innerWidth,height=innerHeight;
    // 4K 屏幕不再叠加 2× DPR，像素预算最多约 830 万；手动设置也受安全上限约束。
    const dpr=Math.min(Math.min(devicePixelRatio||1,this.preset?.dpr||1.5)*this.settings.renderScale,C.maxDPR,Math.sqrt(8294400/(width*height)));
    this.renderer.setPixelRatio(Math.min(C.maxDPR,dpr));this.renderer.setSize(width,height,false);
    this.composer?.setPixelRatio(Math.min(C.maxDPR,dpr));this.composer?.setSize(width,height);
  }
  render(scene,camera,inCinema){
    if(inCinema&&this.composer){try{this.composer.render();}catch(error){console.warn('关闭失败的后处理',error);this.composer=null;this.renderer.render(scene,camera);}}
    else this.renderer.render(scene,camera);
  }
}
