import * as THREE from '../../lib/three/three.module.js';
import { EffectComposer } from '../../lib/three/postprocessing/EffectComposer.js';
import { RenderPass } from '../../lib/three/postprocessing/RenderPass.js';
import { SSAOPass } from '../../lib/three/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from '../../lib/three/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../lib/three/postprocessing/OutputPass.js';
import { DepthOfField } from './DepthOfField.js';
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
    this.dof=null;this.sceneBuffer=null;this.postBuffer=null;
    // 用了后处理就不能再靠 renderer 的 antialias（那只作用于默认帧缓冲），
    // 必须自己在渲染目标上开多重采样，否则 MEDIUM / HIGH 反而比 LOW 更锯齿。
    this.msaa=Math.min(4,this.renderer.capabilities.maxSamples||0);
  }
  configure(cinema){
    this.cinema=cinema;const p=this.performance.preset(this.settings.quality);this.preset=p;
    this.renderer.shadowMap.enabled=p.shadows&&this.settings.shadows;
    if(this.composer){this.composer.passes.forEach(pass=>pass.dispose?.());this.composer.dispose();this.composer=null;}
    this.dof?.dispose();this.dof=null;this.sceneBuffer=null;this.postBuffer=null;
    if(p.post){
      try{
        const size=this.renderer.getSize(new THREE.Vector2());
        const width=Math.max(1,Math.round(size.x||1)),height=Math.max(1,Math.round(size.y||1));
        const type=this.renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType;
        const samples=p.msaa?this.msaa:0;
        // 场景渲染目标带多重采样与深度纹理：深度纹理供景深自动对焦使用。
        const sceneBuffer=new THREE.WebGLRenderTarget(width,height,{type,samples,depthBuffer:true});
        sceneBuffer.texture.name='ic-scene';
        const wantDepth=this.settings.depthOfField!==false&&p.depthOfField!==false;
        if(wantDepth)sceneBuffer.depthTexture=new THREE.DepthTexture(width,height);
        const postBuffer=new THREE.WebGLRenderTarget(width,height,{type,samples:0});
        postBuffer.texture.name='ic-post';
        this.composer=new EffectComposer(this.renderer,sceneBuffer);
        // 自己控制读/写缓冲：RenderPass 固定渲染进带深度纹理的 sceneBuffer，
        // 否则前后处理的交换会让深度纹理落在另一张目标上，对焦就会读到过期数据。
        this.composer.renderTarget2.dispose();
        this.composer.renderTarget2=postBuffer;
        this.composer.readBuffer=sceneBuffer;this.composer.writeBuffer=postBuffer;
        this.sceneBuffer=sceneBuffer;this.postBuffer=postBuffer;
        this.composer.addPass(new RenderPass(cinema.scene,cinema.camera));
        // 景深的两个 pass 必须紧跟 RenderPass：深度纹理挂在场景渲染目标上，
        // 之后的任何全屏 pass 都可能把它一起覆盖掉。
        if(wantDepth){
          this.dof=new DepthOfField();
          sceneBuffer.depthTexture.name='ic-depth';
          this.dof.setDepthTexture(sceneBuffer.depthTexture);
          this.dof.setCamera(cinema.camera);
          this.dof.setStrength(this.settings.dofStrength);
          this.composer.addPass(this.dof.focusPass);
          this.composer.addPass(this.dof.pass);
        }
        if(p.ssao&&this.settings.ssao){this.ssao=new SSAOPass(cinema.scene,cinema.camera,width,height,8);this.ssao.kernelRadius=5;this.ssao.minDistance=.001;this.ssao.maxDistance=.08;this.composer.addPass(this.ssao);}
        if(p.bloom&&this.settings.bloom){this.bloom=new UnrealBloomPass(new THREE.Vector2(width,height),.065,.3,1.05);this.composer.addPass(this.bloom);}
        this.composer.addPass(new OutputPass());
      }catch(error){console.warn('后处理不可用，使用直接渲染',error);this.composer?.dispose();this.composer=null;this.dof=null;this.sceneBuffer=null;this.postBuffer=null;}
    }
    this.resize();
  }
  resize(){
    const width=innerWidth,height=innerHeight;
    // 4K 屏幕不再叠加 2× DPR，像素预算最多约 830 万；手动设置也受安全上限约束。
    const dpr=Math.min(Math.min(devicePixelRatio||1,this.preset?.dpr||1.5)*this.settings.renderScale,C.maxDPR,Math.sqrt(8294400/(width*height)));
    this.renderer.setPixelRatio(Math.min(C.maxDPR,dpr));this.renderer.setSize(width,height,false);
    this.composer?.setPixelRatio(Math.min(C.maxDPR,dpr));this.composer?.setSize(width,height);
    // 后处理在绘制缓冲尺寸上工作，景深的 texel 与模糊半径都要按这个尺寸算。
    const buffer=this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.dof?.setResolution(buffer.x,buffer.y);
    this.dof?.setStrength(this.settings.dofStrength);
  }
  // 景深强度可以随时改，不需要重建整条后处理链。
  setDepthOfFieldStrength(value){this.dof?.setStrength(value);}
  render(scene,camera,inCinema){
    if(inCinema&&this.composer){
      const autoClear=this.renderer.autoClear;
      try{
        // 固定读/写缓冲，让 RenderPass 每帧都渲染进带深度纹理的目标。
        this.composer.readBuffer=this.sceneBuffer;this.composer.writeBuffer=this.postBuffer;
        // 关掉隐式清除：后处理各 pass 自己管理清除，避免多余的清理动作碰到深度纹理。
        this.renderer.autoClear=false;
        this.composer.render();
      }catch(error){console.warn('关闭失败的后处理',error);this.composer=null;this.dof=null;}
      finally{this.renderer.autoClear=autoClear;}
      if(!this.composer)this.renderer.render(scene,camera);
    }else this.renderer.render(scene,camera);
  }
}
