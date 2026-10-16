import * as THREE from '../lib/three/three.module.js';
import { CinemaRenderer } from '../js/core/Renderer.js';
import { CinemaScene } from '../js/scene/CinemaScene.js';
import { SeatManager } from '../js/seating/SeatManager.js';
import { CinemaLightingManager } from '../js/lighting/CinemaLightingManager.js';
import { CinemaAudioEngine } from '../js/audio/CinemaAudioEngine.js';
import { ModelAssetManager } from '../js/assets/ModelAssetManager.js';
import { ModelLoader } from '../js/assets/ModelLoader.js';
import { DEFAULT_SETTINGS } from '../js/core/Config.js';
const output=document.querySelector('#results'),canvas=document.querySelector('#test-canvas');
const log=(message)=>output.textContent+=message+'\n';
const assert=(condition,message)=>{if(!condition)throw new Error(message);log('✓ '+message);};
const video=document.createElement('video');video.src='../assets/first-light.mp4';video.crossOrigin='anonymous';video.preload='auto';video.playsInline=true;
const settings={...DEFAULT_SETTINGS,quality:'LOW'},audio=new CinemaAudioEngine(video,settings);
let rendering,frame,running=false;
document.querySelector('#run').addEventListener('click',async()=>{
  output.textContent='';document.querySelector('#run').disabled=true;
  // 在用户点击调用栈中申请媒体授权，与真实影院一致。
  const audioReady=audio.ensure(),play=video.play();
  try{
    await Promise.all([audioReady,play]);assert(video.videoWidth===960&&video.videoHeight===540,'H.264 / AAC 试映短片已解码（960×540）');
    const seats=new SeatManager(),lighting=new CinemaLightingManager(),cinema=new CinemaScene(seats,lighting);
    rendering=new CinemaRenderer(canvas,settings);rendering.configure(cinema);rendering.renderer.setSize(960,540,false);
    cinema.camera.aspect=16/9;cinema.camera.updateProjectionMatrix();const seat=seats.best();cinema.camera.position.set(seat.position.x,seat.position.y+1.17,seat.position.z);cinema.camera.lookAt(0,10.3,-22);
    cinema.screen.useVideo(video);cinema.screen.setFit('contain');lighting.set('MOVIE',0);audio.setPhase('movie');
    const errors=[];rendering.renderer.debug.onShaderError=(gl,program,vs,fs)=>errors.push(gl.getProgramInfoLog(program)+' '+gl.getShaderInfoLog(fs));
    running=true;let last=performance.now();const render=()=>{if(!running)return;const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;lighting.update(dt);audio.update(cinema.camera,dt);rendering.render(cinema.scene,cinema.camera,true);frame=requestAnimationFrame(render);};render();
    await new Promise(r=>setTimeout(r,700));assert(video.currentTime>.1,'HTML5 Video 时间前进');assert(cinema.screen.videoTexture.isVideoTexture,'银幕正在使用 THREE.VideoTexture');assert(errors.length===0,'基础 WebGL shader 编译通过');
    const gl=rendering.renderer.getContext();assert(gl instanceof WebGL2RenderingContext,'WebGL2 可用');assert(gl.getError()===gl.NO_ERROR,'基础渲染无 WebGL 错误');
    assert(audio.context.state==='running','AudioContext 已获得用户授权');assert(audio.panners.length>10,'空间声场矩阵与 PannerNode 已建立');
    const x=audio.panners.find(p=>p.id==='L').node.positionX.value;cinema.camera.rotation.y+=Math.PI/2;audio.update(cinema.camera,.016);assert(audio.panners.find(p=>p.id==='L').node.positionX.value===x,'转头后音箱保持影院世界坐标');cinema.camera.lookAt(0,10.3,-22);
    log('  实际声道：'+audio.channelLabel+'；采样率：'+audio.context.sampleRate+' Hz');
    settings.quality='HIGH';rendering.configure(cinema);rendering.composer?.setSize(960,540);rendering.renderer.setSize(960,540,false);await new Promise(r=>setTimeout(r,600));
    assert(errors.length===0,'HIGH 后处理 shader 编译通过');assert(gl.getError()===gl.NO_ERROR,'SSAO / Bloom / OutputPass 无 WebGL 错误');
    assert(rendering.composer?.passes.length>=4,'完整高画质后处理链已建立');
    const manager=new ModelAssetManager(),id=crypto.randomUUID();
    try{
      const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{uri:'vertices.bin',byteLength:36}],bufferViews:[{buffer:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}]};
      const root=new Blob([JSON.stringify(json)]),bin=new Blob([new Float32Array([0,0,0,1,0,0,0,1,0])]);
      const record={id,name:'self-test.gltf',rootPath:'self-test.gltf',format:'gltf',kind:'url',createdAt:Date.now(),originUrl:'https://offline-test.invalid/self-test.gltf',size:root.size+bin.size,files:[{path:'self-test.gltf',blob:root},{path:'vertices.bin',blob:bin}],uriMap:{'vertices.bin':'vertices.bin'}};
      await manager.save(record);const stored=await manager.get(id);assert(stored.files.length===2,'IndexedDB 保存与读取模型和 BIN 依赖');
      const cached=await manager.fromURL(record.originUrl);assert(cached.cached,'URL 再次导入优先使用缓存，无需外部网络');
      const loaded=await new ModelLoader(rendering.renderer).load(stored);assert(loaded.stats.triangles===1,'GLTFLoader 从持久缓存解析依赖');loaded.object.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
    }finally{await manager.delete(id);}
    const external=performance.getEntriesByType('resource').filter(e=>{try{return ['http:','https:'].includes(new URL(e.name).protocol)&&new URL(e.name).origin!==location.origin;}catch{return false;}});
    assert(external.length===0,'默认运行与自检没有第三方外部请求');
    log('\n本机技术自检完成。请按 README 验证完整的真实 60 秒入场与本地文件导入。');
  }catch(error){log('✕ '+error.message);console.error(error);}
  finally{running=false;cancelAnimationFrame(frame);video.pause();audio.setPhase('lobby');audio.ambience?.gain.setValueAtTime(0,audio.context.currentTime);audio.master?.gain.setValueAtTime(0,audio.context.currentTime);document.querySelector('#run').disabled=false;}
});
document.querySelector('#pointer').addEventListener('click',async()=>{try{await canvas.requestPointerLock();log('✓ 鼠标锁定成功，3 秒后释放');setTimeout(()=>document.exitPointerLock(),3000);}catch(e){log('△ 当前环境不允许鼠标锁定：'+e.message);}});
document.querySelector('#full').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();log('✓ 全屏切换成功');}catch(e){log('△ 当前环境不允许全屏：'+e.message);}});
