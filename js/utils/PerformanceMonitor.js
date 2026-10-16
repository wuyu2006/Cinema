import { QUALITY } from '../core/Config.js';
// 先使用保守的设备启发式，随后只在持续掉帧时降级，防止帧率波动造成画质反复切换。
export class PerformanceMonitor {
  constructor(renderer){
    this.renderer=renderer; this.frames=0; this.elapsed=0; this.fps=60; this.slow=0;
    const gl=renderer.getContext(), ext=gl.getExtension('WEBGL_debug_renderer_info');
    this.gpu=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'WebGL GPU';
    const weak=/swiftshader|llvmpipe|software|mali|adreno|intel.*hd/i.test(this.gpu);
    this.detected=weak||navigator.hardwareConcurrency<=4?'LOW':
      (innerWidth*innerHeight*(devicePixelRatio||1)**2>6000000?'MEDIUM':'HIGH');
  }
  preset(name){ return QUALITY[name==='AUTO'?this.detected:name]||QUALITY.MEDIUM; }
  update(dt,automatic,onDowngrade){
    this.frames++; this.elapsed+=dt;
    if(this.elapsed<2) return;
    this.fps=Math.round(this.frames/this.elapsed); this.frames=0; this.elapsed=0;
    this.slow=this.fps<32?this.slow+1:0;
    if(automatic && this.slow>=3 && this.detected!=='LOW'){
      this.detected=this.detected==='HIGH'?'MEDIUM':'LOW'; this.slow=0; onDowngrade();
    }
  }
}
