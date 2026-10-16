import * as THREE from '../../lib/three/three.module.js';
import { CINEMA as C } from '../core/Config.js';
import { box } from './Primitives.js';
// 微曲面使用真实弧形几何；比例适配在 shader 的 UV 空间中进行，绝不拉伸视频。
export function fitUV(u,v,videoAspect,screenAspect,mode){
  let x=1,y=1;
  if(mode==='crop'){if(videoAspect>screenAspect)x=screenAspect/videoAspect;else y=videoAspect/screenAspect;}
  else {if(videoAspect>screenAspect)y=videoAspect/screenAspect;else x=screenAspect/videoAspect;}
  return [(u-.5)*x+.5,(v-.5)*y+.5];
}
export class CinemaScreen {
  constructor(parent){
    const geo=new THREE.PlaneGeometry(C.screenWidth,C.screenHeight,80,1);
    const positions=geo.attributes.position;
    for(let i=0;i<positions.count;i++){const x=positions.getX(i);positions.setZ(i,.85*(x/(C.screenWidth/2))**2);}
    geo.computeVertexNormals();
    this.canvas=document.createElement('canvas');this.canvas.width=1430;this.canvas.height=1000;
    this.idleTexture=new THREE.CanvasTexture(this.canvas);this.idleTexture.colorSpace=THREE.SRGBColorSpace;
    this.uniforms={content:{value:this.idleTexture},isVideo:{value:false},videoAspect:{value:1.43},screenAspect:{value:1.43},crop:{value:false},opacity:{value:.55}};
    this.material=new THREE.ShaderMaterial({uniforms:this.uniforms,toneMapped:false,
      vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:`uniform sampler2D content;uniform bool isVideo;uniform float videoAspect;uniform float screenAspect;uniform bool crop;uniform float opacity;varying vec2 vUv;
      void main(){vec2 scale=vec2(1.0);if(crop){if(videoAspect>screenAspect)scale.x=screenAspect/videoAspect;else scale.y=videoAspect/screenAspect;}else{if(videoAspect>screenAspect)scale.y=videoAspect/screenAspect;else scale.x=screenAspect/videoAspect;}
      vec2 uv=(vUv-.5)*scale+.5;vec3 color=vec3(0.0);if(uv.x>=0.0&&uv.x<=1.0&&uv.y>=0.0&&uv.y<=1.0){color=texture2D(content,uv).rgb;if(isVideo)color=mix(pow((color+.055)/1.055,vec3(2.4)),color/12.92,step(color,vec3(.04045)));}gl_FragColor=vec4(color*opacity,1.0);
      #include <colorspace_fragment>
      }`});
    this.mesh=new THREE.Mesh(geo,this.material);this.mesh.position.set(0,C.screenCenterY,C.screenZ);parent.add(this.mesh);
    const frame=new THREE.MeshStandardMaterial({color:0x050608,roughness:1});
    for(const x of [-13.3,13.3])box(parent,frame,[1.1,20,.4],[x,10.2,C.screenZ+.6]);
    box(parent,frame,[27.6,.65,1],[0,19.45,C.screenZ+.2]);box(parent,frame,[27.6,1.3,.5],[0,1,C.screenZ+.2]);
    const curtain=new THREE.MeshStandardMaterial({color:0x121217,roughness:1});
    for(let x=-15;x<=15;x+=.35)if(Math.abs(x)>13)box(parent,curtain,[.25,21,.6],[x,10.3,C.screenZ+.3]);
    this.drawWelcome(60);
  }
  drawWelcome(seconds){
    const c=this.canvas.getContext('2d');c.fillStyle='#080b10';c.fillRect(0,0,1430,1000);
    const g=c.createRadialGradient(715,430,10,715,430,650);g.addColorStop(0,'#1b2b34');g.addColorStop(1,'#080b10');c.fillStyle=g;c.fillRect(0,0,1430,1000);
    c.textAlign='center';c.fillStyle='#bda782';c.font='24px Arial';c.fillText('I M M E R S I V E   I M A X   C I N E M A',715,260);
    c.fillStyle='#e7e5df';c.font='78px Georgia';c.fillText('Welcome.',715,440);c.fillStyle='#b0b8bd';c.font='28px Arial';c.fillText('Please find your seat',715,510);
    c.fillStyle='#bda782';c.font='60px Arial';c.fillText(`00:${String(Math.max(0,seconds)).padStart(2,'0')}`,715,675);
    c.strokeStyle='#33414a';c.beginPath();c.moveTo(515,735);c.lineTo(915,735);c.stroke();this.idleTexture.needsUpdate=true;
  }
  useVideo(video){
    this.videoTexture?.dispose();this.videoTexture=new THREE.VideoTexture(video);
    this.videoTexture.colorSpace=THREE.SRGBColorSpace;this.videoTexture.generateMipmaps=false;
    this.videoTexture.minFilter=THREE.LinearFilter;this.videoTexture.magFilter=THREE.LinearFilter;
    this.uniforms.content.value=this.videoTexture;this.uniforms.isVideo.value=true;this.uniforms.videoAspect.value=video.videoWidth/video.videoHeight||16/9;
  }
  showWelcome(){this.uniforms.content.value=this.idleTexture;this.uniforms.isVideo.value=false;this.uniforms.videoAspect.value=1.43;}
  setFit(mode){this.uniforms.crop.value=mode==='crop';}
  set brightness(value){this.uniforms.opacity.value=value;}
}
