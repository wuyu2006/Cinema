import * as THREE from '../../lib/three/three.module.js';
import { ShaderPass } from '../../lib/three/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from '../../lib/three/postprocessing/Pass.js';

// 景深：焦点固定在准星（屏幕中心）指向的那个表面上。
//
// 对焦距离完全在 GPU 上求得——焦点 pass 把场景深度纹理中心那一个像素的线性深度写进一张 1×1 贴图，
// 并与上一帧的值做指数平滑；模糊 pass 再读这张 1×1 贴图作为对焦距离。
// 这样做有两个好处：不需要任何 CPU 回读（不会打断 GPU 流水线），
// 也不需要从 CPU 去射线检测整厅合批后的网格（那是几十万三角形，每帧做不起）。
//
// 两个 pass 都必须紧跟在 RenderPass 之后：深度纹理挂在场景渲染目标上，
// 任何后续写进同一张目标的全屏 pass 都可能把深度一起覆盖掉。
const vertexShader = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }';

const DOF_SHADER = {
  name: 'CinemaDepthOfFieldShader',
  defines: { TAPS: 16 },
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tFocus: { value: null },
    cameraNear: { value: .08 },
    cameraFar: { value: 110 },
    minRange: { value: 2 },
    rangeScale: { value: .55 },
    maxRadius: { value: 10 },
    texel: { value: new THREE.Vector2( 1 / 1280, 1 / 720 ) }
  },
  vertexShader,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform sampler2D tFocus;
    uniform float cameraNear; uniform float cameraFar; uniform float minRange;
    uniform float rangeScale; uniform float maxRadius; uniform vec2 texel;
    varying vec2 vUv;

    // 循环里用显式 LOD 取样：色散圆半径小的像素会提前返回，循环因此是发散的，
    // 隐式求导在发散控制流里没有定义（D3D 会报 X3595）。目标贴图本来就没有 mipmap，LOD 恒为 0。
    float linearDepthAt( vec2 uv ){
      float d = texture2DLodEXT( tDepth, uv, 0.0 ).x;
      float z = d * 2.0 - 1.0;
      return ( 2.0 * cameraNear * cameraFar ) / ( cameraFar + cameraNear - z * ( cameraFar - cameraNear ) );
    }
    vec3 colourAt( vec2 uv ){ return texture2DLodEXT( tDiffuse, uv, 0.0 ).rgb; }
    // 弥散圆半径（像素）：以对焦距离为中心，前后按 range 过渡。
    float cocRadius( float depth, float focus, float range ){
      float coc = clamp( abs( depth - focus ) / range, 0.0, 1.0 );
      return pow( coc, 1.35 ) * maxRadius;
    }

    void main(){
      vec3 base = colourAt( vUv );
      float focus = texture2D( tFocus, vec2( 0.5 ) ).x;
      float range = max( minRange, focus * rangeScale );
      float radius = cocRadius( linearDepthAt( vUv ), focus, range );
      // 合焦处原样输出：既保住清晰度，也保住多重采样抗锯齿的结果。
      if ( radius < 0.5 ) { gl_FragColor = vec4( base, 1.0 ); return; }

      vec3 sum = base;
      float weight = 1.0;
      for ( int i = 0; i < TAPS; i ++ ) {
        float fi = float( i ) + 1.0;
        float angle = fi * 2.39996323;          // 黄金角螺旋，避免出现条带
        float r = sqrt( fi / float( TAPS ) ) * radius;
        vec2 uv = vUv + vec2( cos( angle ), sin( angle ) ) * r * texel;
        float sampleRadius = cocRadius( linearDepthAt( uv ), focus, range );
        float w = clamp( sampleRadius - r + 1.0, 0.0, 1.0 );
        sum += colourAt( uv ) * w;
        weight += w;
      }
      gl_FragColor = vec4( sum / weight, 1.0 );
    }`
};

const FOCUS_FRAGMENT = `
  uniform sampler2D tDepth; uniform sampler2D tPrev;
  uniform float cameraNear; uniform float cameraFar; uniform float blend;
  void main(){
    float d = texture2D( tDepth, vec2( 0.5 ) ).x;
    float z = d * 2.0 - 1.0;
    float dist = ( 2.0 * cameraNear * cameraFar ) / ( cameraFar + cameraNear - z * ( cameraFar - cameraNear ) );
    float prev = texture2D( tPrev, vec2( 0.5 ) ).x;
    // 深度无效（清屏 = 远平面）时沿用上一帧；两帧都还没有值时给一个厅内中景兜底，
    // 免得刚开启景深的那一帧把焦距甩到很奇怪的地方。
    bool valid = dist > cameraNear && dist < cameraFar * 0.9995;
    float target = valid ? dist : ( prev > 0.0 ? prev : 18.0 );
    float value = prev > 0.0 ? mix( prev, target, blend ) : target;
    gl_FragColor = vec4( value, 0.0, 0.0, 1.0 );
  }`;

// 只写进自己的 1×1 目标，不碰读写缓冲，所以放在链首也不会影响颜色流转。
class FocusPass extends Pass {
  constructor( depthOfField ){
    super();
    this.depthOfField = depthOfField;
    this.needsSwap = false;
  }
  render( renderer, writeBuffer, readBuffer, deltaTime ){
    this.depthOfField.update( renderer, deltaTime );
  }
}

export class DepthOfField {
  constructor(){
    this.pass = new ShaderPass( DOF_SHADER );
    this.focusPass = new FocusPass( this );
    this.focusMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null }, tPrev: { value: null },
        cameraNear: { value: .08 }, cameraFar: { value: 110 }, blend: { value: 1 }
      },
      vertexShader,
      fragmentShader: FOCUS_FRAGMENT,
      depthTest: false, depthWrite: false
    });
    this.quad = new FullScreenQuad( this.focusMaterial );
    // 1×1 的乒乓缓存：保存平滑后的对焦距离，模糊 pass 只需一次纹理读取。
    this.targets = [ 0, 1 ].map( () => {
      const target = new THREE.WebGLRenderTarget( 1, 1, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false } );
      target.texture.minFilter = THREE.NearestFilter;
      target.texture.magFilter = THREE.NearestFilter;
      target.texture.generateMipmaps = false;
      return target;
    });
    this.index = 0;
    this.pass.uniforms.tFocus.value = this.targets[ 0 ].texture;
    this._strength = .55;
    this.setResolution( 1280, 720 );
  }
  setDepthTexture( texture ){
    this.focusMaterial.uniforms.tDepth.value = texture;
    this.pass.uniforms.tDepth.value = texture;
  }
  setCamera( camera ){
    this.focusMaterial.uniforms.cameraNear.value = this.pass.uniforms.cameraNear.value = camera.near;
    this.focusMaterial.uniforms.cameraFar.value = this.pass.uniforms.cameraFar.value = camera.far;
  }
  // 分辨率变化时同步 texel 与最大模糊半径（按画面高度等比，保证不同窗口下观感一致）。
  setResolution( width, height ){
    this._height = Math.max( 1, height );
    this.pass.uniforms.texel.value.set( 1 / Math.max( 1, width ), 1 / this._height );
    this.setStrength( this._strength );
  }
  // 强度同时控制最大虚化半径与景深范围：越强越浅。
  setStrength( strength ){
    const s = Math.max( 0, Math.min( 1, Number( strength ) || 0 ) );
    this._strength = s;
    this.pass.uniforms.maxRadius.value = this._height * .022 * s;
    this.pass.uniforms.rangeScale.value = .9 - .6 * s;
  }
  update( renderer, deltaTime ){
    const depth = this.focusMaterial.uniforms.tDepth.value;
    if( !depth ) return;
    const dt = Math.min( .1, Math.max( 0, deltaTime || 0 ) );
    const write = this.targets[ 1 - this.index ];
    this.focusMaterial.uniforms.tPrev.value = this.targets[ this.index ].texture;
    this.focusMaterial.uniforms.blend.value = dt > 0 ? 1 - Math.exp( -9 * dt ) : 1;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget( write );
    this.quad.render( renderer );
    renderer.setRenderTarget( previous );
    this.index = 1 - this.index;
    this.pass.uniforms.tFocus.value = write.texture;
  }
  dispose(){
    this.pass.dispose();
    this.quad.dispose();
    this.focusMaterial.dispose();
    this.targets.forEach( target => target.dispose() );
  }
}
