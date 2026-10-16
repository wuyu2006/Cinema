// 开发自检：仅使用 Node 内置 assert/test。浏览器运行影院无需 Node。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir,stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../lib/three/three.module.js';
import { CINEMA as C,RESOURCE_CONFIG as R,DEFAULT_SETTINGS } from '../js/core/Config.js';
import { CinemaStateManager,STATES as S } from '../js/core/CinemaStateManager.js';
import { SeatManager } from '../js/seating/SeatManager.js';
import { SeatTransition } from '../js/seating/SeatTransition.js';
import { FirstPersonController } from '../js/camera/FirstPersonController.js';
import { channelRoutes } from '../js/audio/ChannelMapper.js';
import { CinemaAudioEngine } from '../js/audio/CinemaAudioEngine.js';
import { CinemaLightingManager } from '../js/lighting/CinemaLightingManager.js';
import { fitUV } from '../js/scene/Screen.js';
import { ModelAssetManager,dependencies,modelJSON,normalizePath } from '../js/assets/ModelAssetManager.js';
import { ModelLoader } from '../js/assets/ModelLoader.js';
import { SceneObjectFactory } from '../js/assets/SceneObjectFactory.js';
import { CinemaApp } from '../js/core/CinemaApp.js';
import { VideoManager } from '../js/video/VideoManager.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const suite=[];const check=(name,fn)=>suite.push({name,fn});
const stateAtSeating=()=>{const s=new CinemaStateManager();s.transition(S.ENTERING);s.transition(S.SEATING);return s;};
check('状态机：完整观影、暂停、散场、重播与退场合法，非法跳转被拒绝',()=>{
  const s=new CinemaStateManager(),seen=[];s.addEventListener('change',e=>seen.push(e.detail.current));
  assert.throws(()=>s.transition(S.MOVIE_PLAYING),/非法影院状态/);
  for(const next of [S.VIDEO_READY,S.ENTERING,S.SEATING,S.SEATED,S.PRE_SHOW,S.MOVIE_PLAYING,S.MOVIE_PAUSED,S.MOVIE_PLAYING,S.MOVIE_FINISHED,S.PRE_SHOW,S.MOVIE_PLAYING,S.SEATING,S.EXIT,S.VIDEO_READY])s.transition(next);
  assert.equal(seen.length,14);assert.equal(C.countdown,60);
});
check('座位：12×18，坐标和编号唯一，最佳座位符合中后段与中轴线',()=>{
  const m=new SeatManager();assert.equal(m.seats.length,216);assert.equal(new Set(m.seats.map(s=>s.id)).size,216);
  const best=m.best();assert(best.row>=7&&best.row<=10);assert(Math.abs(best.position.x)<1);
  assert(best.score>m.seats[0].score);m.choose(best);assert(best.occupied);assert.equal(m.best(),best);m.release();assert(!best.occupied);
  best.available=false;assert.notEqual(m.best().id,best.id);assert.equal(m.ground(100),3.08);assert.equal(m.ground(-20),0);
});
check('碰撞：墙、扶手、座椅包络不可穿越；四条主过道保持畅通',()=>{
  const m=new SeatManager();assert(m.collides(16,0));assert(m.collides(0,-20));assert(m.collides(0,15));
  for(const s of m.seats)assert(m.collides(s.position.x,s.position.z));
  for(const x of [-13.2,-4.25,4.25,13.2])for(let z=-16;z<=13;z+=.1)assert(!m.collides(x,z),`过道受阻 ${x},${z}`);
});
function checkRoute(manager,from,seat){
  const points=manager.route(from,seat);let previous=from;
  for(const p of points.slice(0,-1)){
    for(let t=0;t<=1;t+=.025){const position=previous.clone().lerp(p,t);assert(!manager.collides(position.x,position.z),`路径碰撞：${position.x},${position.z}`);}previous=p;
  }
}
check('自动寻座：全部 216 个目标沿排间通道到达，461 个自由位置可回到最佳座位',()=>{
  const m=new SeatManager();m.seats.forEach(s=>checkRoute(m,new THREE.Vector3(-13.2,4.76,13),s));let count=0;
  for(const x of [-13.2,-10,-7,-4.25,0,4.25,10,13.2])for(let z=-16;z<13.5;z+=.37){if(m.collides(x,z))continue;checkRoute(m,new THREE.Vector3(x,m.ground(z)+1.68,z),m.best());count++;}assert(count>450);
});
check('坐下动画：平滑完成并锁定坐姿，最终高度精确且无可见身体',async()=>{
  const m=new SeatManager(),camera=new THREE.PerspectiveCamera();camera.position.set(-13.2,4.76,13);
  const c={camera,yaw:0,pitch:0,targetYaw:0,targetPitch:0,keys:new Set(),faceScreen(){},transitioning:false};const animation=new SeatTransition(c,m);
  const promise=animation.start(m.best());let frames=0;while(animation.active&&frames++<1500)animation.update(1/60);
  assert.equal(await promise,true);assert(c.seated);assert(!c.transitioning);assert.equal(camera.position.y,m.selected.position.y+C.seatedHeight);
});
check('银幕：1.43 / 16:9 / 2.39 保持比例，contain 留黑、crop 裁切',()=>{
  const wide=fitUV(.5,0,2.39,1.43,'contain');assert(wide[1]<0);
  const crop=fitUV(0,.5,2.39,1.43,'crop');assert(crop[0]>0&&crop[0]<.5);
  assert.deepEqual(fitUV(.2,.7,1.43,1.43,'contain'),[.2,.7]);
  const portrait=fitUV(0,.5,.75,1.43,'contain');assert(portrait[0]<0);
});
check('音频矩阵：Mono / 2.0 / 5.1 / 两种 7.1 都正确映射，并包含低频与顶部扩散',()=>{
  const mono=channelRoutes(1);assert(mono.every(r=>r.input===0));
  const stereo=channelRoutes(2);assert.equal(stereo.filter(r=>r.speaker==='C').length,2);assert.equal(stereo.filter(r=>r.speaker.startsWith('T')).length,6);
  const surround=channelRoutes(6);assert.equal(surround.find(r=>r.speaker==='C').input,2);assert.equal(surround.find(r=>r.speaker==='LFE').input,3);assert.equal(surround.find(r=>r.speaker==='SL1').input,4);
  const eight=channelRoutes(8);assert.equal(eight.find(r=>r.speaker==='BL').input,6);
  const alternate=channelRoutes(8,'rear-first');assert.equal(alternate.find(r=>r.speaker==='BL').input,4);assert.equal(alternate.find(r=>r.speaker==='SL1').input,6);
  for(const count of [1,2,6,8])assert(channelRoutes(count).every(r=>r.input>=0&&r.input<count));
});
check('Web Audio 图：媒体源仅创建一次，音箱固定世界坐标，Listener 随相机转头',async()=>{
  const param=()=>({value:0,setValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;}});
  class Node {constructor(){this.connections=[];for(const k of ['gain','threshold','knee','ratio','frequency','Q','positionX','positionY','positionZ','delayTime','playbackRate'])this[k]=param();}connect(n,...ports){this.connections.push({n,ports});return n;}disconnect(){this.connections=[];}start(){}stop(){}}
  let sources=0;class Audio {constructor(){this.state='running';this.currentTime=0;this.sampleRate=1000;this.destination=new Node();this.listener={};for(const k of ['positionX','positionY','positionZ','forwardX','forwardY','forwardZ','upX','upY','upZ'])this.listener[k]=param();}async resume(){this.state='running';}createGain(){return new Node();}createDynamicsCompressor(){return new Node();}createMediaElementSource(){sources++;return new Node();}createChannelSplitter(){return new Node();}createPanner(){return new Node();}createBiquadFilter(){return new Node();}createDelay(){return new Node();}createBufferSource(){return new Node();}createBuffer(ch,length){return {getChannelData:()=>new Float32Array(length)};}}
  globalThis.window={AudioContext:Audio,isSecureContext:false};const settings={...DEFAULT_SETTINGS},video={volume:1};const engine=new CinemaAudioEngine(video,settings);
  await engine.ensure();await engine.ensure();assert.equal(sources,1);assert.equal(engine.panners.find(p=>p.id==='L').node.positionX.value,-8);
  const camera=new THREE.PerspectiveCamera();camera.position.set(3,4,5);camera.rotation.y=Math.PI/2;engine.update(camera,.016);
  assert.equal(engine.context.listener.positionX.value,3);assert(Math.abs(engine.context.listener.forwardX.value+1)<.00001);assert.equal(engine.panners.find(p=>p.id==='L').node.positionX.value,-8);
  settings.channels='6';engine.buildRoutes();assert.equal(engine.panners.find(p=>p.id==='C').input,2);engine.setMuted(true);assert.equal(engine.master.gain.value,0);
  settings.spatial=false;engine.buildRoutes();assert.equal(engine.panners.length,0);assert.equal(engine.direct.gain.value,1);
});
check('灯光：入口→映前→播放→暂停为缓动，支持全场灯光和单通道关闭',()=>{
  const m=new CinemaLightingManager(),light=new THREE.PointLight();m.register('ceiling',light,10);m.update(0);assert.equal(light.intensity,7);
  m.set('PRE_SHOW',1.5);m.update(.75);assert(light.intensity>0&&light.intensity<7);m.update(.75);assert.equal(light.intensity,0);
  m.set('PAUSED',1);m.update(1);assert.equal(m.current.wall,.35);m.setFull(true);m.update(1.5);assert.equal(light.intensity,10);m.setEnabled('ceiling',false);m.update(1);assert.equal(light.intensity,0);
});
check('模型资源：拒绝脚本依赖、目录逃逸、错误 GLB 和非 glTF 2.0',()=>{
  assert.throws(()=>normalizePath('../../evil.bin'),/超出/);assert.equal(normalizePath('folder/../texture.png'),'texture.png');
  assert.throws(()=>dependencies({buffers:[{uri:'javascript:alert(1)'}]}),/协议/);assert.throws(()=>dependencies({images:[{uri:'thing.js'}]}),/JavaScript/);
  assert.throws(()=>modelJSON(new ArrayBuffer(5),'glb'),/损坏/);assert.throws(()=>modelJSON(new TextEncoder().encode('{"asset":{"version":"1.0"}}').buffer,'gltf'),/2.0/);
});
check('模型本地导入：20MB 限制与依赖完整性，不能绕过总容量限制',async()=>{
  const m=new ModelAssetManager();m.usage=async()=>0;
  const over=new File([new Uint8Array(R.MAX_MODEL_SIZE+1)],'large.glb');await assert.rejects(()=>m.fromFiles([over]),/过大/);
  const json={asset:{version:'2.0'},buffers:[{uri:'mesh.bin',byteLength:12}]};const root=new File([JSON.stringify(json)],'model.gltf');
  await assert.rejects(()=>m.fromFiles([root]),/缺少模型依赖/);
  const record=await m.fromFiles([root,new File([new Uint8Array(12)],'mesh.bin')]);assert.equal(record.files.length,2);assert.equal(record.uriMap['mesh.bin'],'mesh.bin');
  m.usage=async()=>194*1024*1024;await assert.rejects(()=>m.checkCapacity(12*1024*1024),/存储空间不足/);
});
check('模型 URL：HEAD 提前阻止大文件，未知大小流式超过 20MB 立即中断',async()=>{
  const original=globalThis.fetch,m=new ModelAssetManager();m.controller=new AbortController();let gets=0;
  globalThis.fetch=async(url,init)=>{if(init.method==='HEAD')return new Response('',{headers:{'content-length':String(R.MAX_MODEL_SIZE+1)}});gets++;throw new Error('不应下载正文');};
  try{await assert.rejects(()=>m.downloadFile('https://example.com/a.glb',R.MAX_MODEL_SIZE,()=>{}),/过大/);assert.equal(gets,0);
    globalThis.fetch=async(url,init)=>init.method==='HEAD'?new Response(''):new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(10*1024*1024));c.enqueue(new Uint8Array(11*1024*1024));c.close();}}));
    await assert.rejects(()=>m.downloadFile('https://example.com/a.glb',R.MAX_MODEL_SIZE,()=>{}),/超过/);assert(m.controller.signal.aborted);
  }finally{globalThis.fetch=original;}
});
check('模型 URL：完全相同 URL 命中本地缓存，零网络请求',async()=>{
  const m=new ModelAssetManager(),cached={id:'cached',originUrl:'https://example.com/seat.glb',size:42};m.list=async()=>[cached];const original=globalThis.fetch;let fetched=false;
  globalThis.fetch=async()=>{fetched=true;throw new Error('不应联网');};try{const r=await m.fromURL(cached.originUrl);assert(r.cached);assert(!fetched);}finally{globalThis.fetch=original;}
});
function mockDOM(){
  const elements=new Map();const classes=()=>({values:new Set(),add(...keys){keys.forEach(k=>this.values.add(k));},remove(...keys){keys.forEach(k=>this.values.delete(k));},toggle(k,b){if(b===undefined)b=!this.values.has(k);b?this.add(k):this.remove(k);},replace(a,b){this.remove(a);this.add(b);},contains(k){return this.values.has(k);}});
  const element=id=>{if(!elements.has(id))elements.set(id,{id,hidden:false,open:false,textContent:'',innerHTML:'',classList:classes(),style:{},firstChild:{textContent:''},close(){this.open=false;},showModal(){this.open=true;},addEventListener(){},setAttribute(){},getContext(){return new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(o,p)=>o[p]||(()=>{})});}});return elements.get(id);};
  globalThis.document={body:{classList:classes()},getElementById:id=>element('#'+id),querySelector:s=>s==='dialog[open]'?[...elements.values()].find(e=>e.open)||null:element(s),querySelectorAll:s=>s==='dialog[open]'?[...elements.values()].filter(e=>e.open):[],createElement:()=>element('canvas'+elements.size),addEventListener(){},pointerLockElement:null};
  globalThis.window={innerWidth:1280,innerHeight:720,indexedDB:null,addEventListener(){}};globalThis.innerWidth=1280;globalThis.innerHeight=720;globalThis.devicePixelRatio=1;globalThis.self=globalThis;
  return element;
}
check('真实程序化场景可构造：216 把 InstancedMesh 座椅，20 个音箱，无角色模型',async()=>{
  mockDOM();const {CinemaScene}=await import('../js/scene/CinemaScene.js');const {LobbyScene}=await import('../js/scene/LobbyScene.js');
  const cinema=new CinemaScene(new SeatManager(),new CinemaLightingManager());const lobby=new LobbyScene();
  assert.equal(cinema.seats.group.children.filter(o=>o.isInstancedMesh).length,8);assert(cinema.seats.group.children.every(o=>o.count===216));
  assert.equal(cinema.speakers.labels.children.length,20);assert(lobby.scene.children.length>2);
  let bodies=0;cinema.scene.traverse(o=>{if(/avatar|body|knees|arms|hands/i.test(o.name))bodies++;});assert.equal(bodies,0);
});
check('VideoManager：本地 Blob、metadata、时长比例、CORS 设置顺序与失败状态可恢复',async()=>{
  mockDOM();class Media extends EventTarget {
    constructor(){super();this.style={};this.videoWidth=3840;this.videoHeight=2160;this.duration=8136;this.paused=true;this.fail=false;this.currentTime=0;this.readyState=2;}
    set src(value){this.source=value;this.corsAtLoad=this.crossOrigin;}setAttribute(){}removeAttribute(){}remove(){}
    pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}async play(){this.paused=false;this.dispatchEvent(new Event('play'));}
    load(){queueMicrotask(()=>this.dispatchEvent(new Event(this.fail?'error':'loadedmetadata')));}
  }
  const media=new Media();document.createElement=()=>media;document.body.append=()=>{};
  Object.defineProperty(globalThis,'navigator',{value:{onLine:true,hardwareConcurrency:8,userAgent:'Node.js test harness'},configurable:true});globalThis.location={origin:'https://cinema.test',protocol:'https:'};
  const manager=new VideoManager(),file=new File([new Uint8Array(8)],'film.mp4',{type:'video/mp4'}),metadata=await manager.loadFile(file);
  assert(manager.ready);assert(manager.objectURL.startsWith('blob:'));assert.equal(metadata.durationLabel,'02:15:36');assert.equal(metadata.aspect,'16:9');assert.equal(media.corsAtLoad,'anonymous');
  await manager.play();assert.equal(media.paused,false);manager.seek(9000);assert.equal(media.currentTime,8136);
  media.fail=true;await assert.rejects(()=>manager.loadURL('https://example.com/movie.mp4'),/CORS/);assert.equal(manager.ready,false);
  await assert.rejects(()=>manager.loadFile(new File(['wrong'],'wrong.txt')),/请选择/);manager.destroy();
});
check('第一人称：WASD 不穿椅墙、坐下禁走、俯仰±60°、大鼠标位移限速、弹窗阻断移动',()=>{
  const el=mockDOM(),manager=new SeatManager(),camera=new THREE.PerspectiveCamera(),controller=new FirstPersonController(camera,el('#canvas'),manager,{...DEFAULT_SETTINGS});
  controller.enabled=true;controller.reset(new THREE.Vector3(-13.2,4.76,13));controller.keys.add('KeyW');for(let i=0;i<600;i++)controller.update(1/60,i/60);
  assert(camera.position.z>C.front);assert(!manager.collides(camera.position.x,camera.position.z));
  controller.look(1000000,1000000);assert(Math.abs(controller.targetYaw)<.14);controller.look(0,1000000);assert(Math.abs(controller.targetPitch)<=Math.PI/3);
  const seat=manager.best();manager.choose(seat);controller.seated=true;controller.reset(new THREE.Vector3(seat.position.x,seat.position.y+1.17,seat.position.z));const start=camera.position.clone();for(let i=0;i<60;i++)controller.update(1/60,i/60);assert(camera.position.distanceTo(start)<.00001);
  controller.seated=false;controller.blocked=()=>true;controller.keys.add('KeyW');controller.update(.1,0);assert(camera.position.distanceTo(start)<.00001);assert.equal(controller.keys.size,0);
});
function appHarness(){
  const el=mockDOM(),app=Object.create(CinemaApp.prototype);app.state=stateAtSeating();app.inCinema=true;app.session=1;app.ending=false;app.starting=false;app.settings={...DEFAULT_SETTINGS};app.seatManager=new SeatManager();
  const camera=new THREE.PerspectiveCamera();camera.position.set(-13.2,4.76,13);
  app.controller={camera,yaw:0,pitch:0,targetYaw:0,targetPitch:0,keys:new Set(),faceScreen(){},release(){},seated:false};app.seatTransition=new SeatTransition(app.controller,app.seatManager);
  app.audio={sound(){},ensure:async()=>{},setPhase(){}};app.video={ready:true,video:{currentTime:0},play:async()=>{app.playCalls=(app.playCalls||0)+1;},pause(){},seek(){}};
  app.cinema={camera,screen:{useVideo(){},setFit(){}}};app.lighting={set(){}};app.controls={show(){}};app.toast=()=>{};return {app,el};
}
check('集成流程：倒计时归零，即使未选座也自动入座；首次影片不会未经点击自行播放',async()=>{
  const {app,el}=appHarness();const finished=app.endCountdown();let ticks=0;while(app.seatTransition.active&&ticks++<1500)app.seatTransition.update(1/60);await finished;
  assert.equal(app.state.current,S.PRE_SHOW);assert(app.controller.seated);assert.equal(app.seatManager.selected.id,app.seatManager.best().id);assert(el('#start-dialog').open);assert.equal(app.playCalls||0,0);
});
check('播放策略：播放被浏览器拒绝时保留开始按钮，可重试且流程不丢失',async()=>{
  const {app,el}=appHarness();app.state.transition(S.PRE_SHOW);app.video.play=async()=>{throw new DOMException('blocked','NotAllowedError');};await app.startMovie();
  assert.equal(app.state.current,S.PRE_SHOW);assert(el('#start-dialog').open);assert.equal(app.starting,false);assert.equal(el('#start-movie').disabled,false);
});
check('开场仪式：授权后暂停保留起始时间，650ms 黑场后正式播放与声音渐入',async()=>{
  const {app}=appHarness();app.state.transition(S.PRE_SHOW);app.video.video.currentTime=37;let seek;app.video.seek=t=>seek=t;await app.startMovie();
  assert.equal(app.playCalls,2);assert.equal(seek,37);assert.equal(app.state.current,S.MOVIE_PLAYING);assert.equal(app.starting,false);
});
check('GLB 真解析与实例化：只加载一次，216 个座椅实例，恢复默认释放资源',async()=>{
  mockDOM();const vertices=new Float32Array([0,0,0,1,0,0,0,1,0]);
  const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:vertices.byteLength}],bufferViews:[{buffer:0,byteOffset:0,byteLength:vertices.byteLength}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}]};
  const encoded=new TextEncoder().encode(JSON.stringify(json)),length=Math.ceil(encoded.length/4)*4,buffer=new ArrayBuffer(12+8+length+8+vertices.byteLength),view=new DataView(buffer);
  view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,buffer.byteLength,true);view.setUint32(12,length,true);view.setUint32(16,0x4e4f534a,true);new Uint8Array(buffer,20,length).fill(32);new Uint8Array(buffer,20,encoded.length).set(encoded);
  view.setUint32(20+length,vertices.byteLength,true);view.setUint32(24+length,0x004e4942,true);new Uint8Array(buffer,28+length).set(new Uint8Array(vertices.buffer));
  assert.equal(modelJSON(buffer,'glb').asset.version,'2.0');
  const record={id:'triangle',rootPath:'test.glb',format:'glb',files:[{path:'test.glb',blob:new Blob([buffer])}],uriMap:{}};
  const loader=new ModelLoader({extensions:{has:()=>false}}),loaded=await loader.load(record);assert.equal(loaded.stats.triangles,1);assert.equal(loaded.stats.meshes,1);
  let loads=0;const cinema={scene:new THREE.Scene(),seats:{group:new THREE.Group()}},factory=new SceneObjectFactory(cinema,new SeatManager(),{load:async()=>{loads++;return loaded;}});
  await factory.replace('seats',record);assert.equal(loads,1);assert.equal(factory.current.get('seats').group.children[0].count,216);assert.equal(cinema.seats.group.visible,false);factory.clear('seats');assert(cinema.seats.group.visible);assert.equal(cinema.scene.children.length,0);
});
check('离线依赖闭包：所有实际 import 为相对路径，引用文件存在，Three 与解码器本地齐全',async()=>{
  async function walk(dir){let files=[];for(const entry of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);files.push(...(entry.isDirectory()?await walk(p):[p]));}return files;}
  const files=await walk(root);for(const file of files.filter(f=>f.endsWith('.js'))){const contents=await readFile(file,'utf8');
    const clean=contents.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
    for(const match of clean.matchAll(/\b(?:import|export)\s+(?:[\s\S]*?\s+from\s*)?['"]([^'"\n]+)['"]/g)){
      if(match[1].startsWith('.'))assert((await stat(path.resolve(path.dirname(file),match[1]))).isFile());else assert.fail(`非相对依赖 ${file}: ${match[1]}`);
    }
  }
  for(const p of ['lib/three/three.module.js','lib/three/three.core.js','lib/three/libs/draco/gltf/draco_decoder.wasm','lib/three/libs/basis/basis_transcoder.wasm','assets/first-light.mp4'])assert((await stat(path.join(root,p))).size>0);
});
for(const {name,fn} of suite)await test(name,fn);
