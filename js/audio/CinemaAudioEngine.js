import { SPEAKER_LAYOUT } from '../scene/Speakers.js';
import { channelRoutes } from './ChannelMapper.js';
import * as THREE from '../../lib/three/three.module.js';
export class CinemaAudioEngine extends EventTarget {
  constructor(video,settings){
    super();this.video=video;this.settings=settings;this.context=null;this.actualChannels=null;this.level=0;this.ambientTarget=1;
    this.panners=[];this.routeNodes=[];this.movieLevel=0;this.muted=false;this.available=true;
    this.forward=new THREE.Vector3();this.up=new THREE.Vector3(0,1,0);this.lastStep=0;
  }
  async ensure(){
    if(!this.available)return;
    if(!this.context){
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio){this.available=false;this.dispatchEvent(new Event('unsupported'));return;}
      try{
        this.context=new Audio({latencyHint:'playback'});const c=this.context;
        // 在点击的同步调用栈中申请解锁，不能等加载 AudioWorklet 后才调用 resume。
        c.resume().catch(()=>{});
        this.master=c.createGain();this.master.gain.value=this.settings.master;
        // 影院多路扩散可能叠加峰值，用温和的压缩器保护输出免于数字削波。
        this.limiter=c.createDynamicsCompressor();this.limiter.threshold.value=-3;this.limiter.knee.value=6;this.limiter.ratio.value=8;
        this.master.connect(this.limiter).connect(c.destination);
        this.movieGain=c.createGain();this.movieGain.gain.value=0;this.movieGain.connect(this.master);
        this.source=c.createMediaElementSource(this.video);this.video.volume=1;
        this.splitter=c.createChannelSplitter(8);this.splitter.channelInterpretation='discrete';this.source.connect(this.splitter);
        this.direct=c.createGain();this.direct.gain.value=0;this.source.connect(this.direct).connect(this.movieGain);
        this.buildRoutes();this.buildAmbient();
        if(c.audioWorklet && window.isSecureContext){
          try{
            await c.audioWorklet.addModule(new URL('./channel-probe.js',import.meta.url));
            this.probe=new AudioWorkletNode(c,'cinema-channel-probe',{channelCount:8,channelCountMode:'max',numberOfOutputs:1,outputChannelCount:[1]});
            this.source.connect(this.probe);this.probe.connect(c.destination);
            this.probe.port.onmessage=e=>{
              this.level=e.data.level;const count=e.data.channels;
              if([1,2,6,8].includes(count)&&this.actualChannels!==count){this.actualChannels=count;this.buildRoutes();this.dispatchEvent(new CustomEvent('channels',{detail:count}));}
            };
          }catch(error){this.probeError=error.message;}
        }
      }catch(error){
        // 如果创建 MediaElementSource 之前就失败，可回到浏览器原生音频；已经接管后保持图连接。
        if(!this.source){this.available=false;this.video.volume=this.settings.master;this.dispatchEvent(new CustomEvent('unsupported',{detail:error.message}));return;}
        throw error;
      }
    }
    let timer;try{
      await Promise.race([this.context.resume(),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('音频上下文未获得播放授权，请再次点击「开始观影」。')),3500))]);
    }finally{clearTimeout(timer);}
  }
  get channelCount(){const value=Number(this.settings.channels);return [1,2,6,8].includes(value)?value:(this.actualChannels||2);}
  get channelLabel(){
    const count=this.channelCount,name=({1:'Mono',2:'2.0',6:'5.1',8:'7.1'})[count];
    return `${name} · ${this.settings.channels!=='auto'?'手动映射':this.actualChannels?'浏览器已解码':'待检测，暂用 2.0'}`;
  }
  resetDetection(){this.actualChannels=null;this.level=0;if(this.context)this.buildRoutes();}
  buildRoutes(){
    if(!this.context)return;this.splitter.disconnect();this.routeNodes.forEach(n=>n.disconnect());this.routeNodes=[];this.panners=[];
    const c=this.context;this.direct.gain.setTargetAtTime(this.settings.spatial?0:1,c.currentTime,.1);
    this.routes=channelRoutes(this.channelCount,this.settings.channelLayout||'standard');
    if(!this.settings.spatial)return;
    for(const route of this.routes){
      const speaker=SPEAKER_LAYOUT.find(s=>s.id===route.speaker);if(!speaker)continue;
      const gain=c.createGain();gain.gain.value=route.gain*(route.speaker==='LFE'?this.settings.bass:1);this.splitter.connect(gain,route.input);
      let node=gain;this.routeNodes.push(gain);
      if(route.filter){const filter=c.createBiquadFilter();filter.type=route.filter;filter.frequency.value=route.filter==='lowpass'?110:350;node.connect(filter);node=filter;this.routeNodes.push(filter);}
      if(route.delay){const delay=c.createDelay(.1);delay.delayTime.value=route.delay;node.connect(delay);node=delay;this.routeNodes.push(delay);}
      // PannerNode 的坐标保持在影院世界中；只有 AudioListener 随相机转动，因此转头会改变声源方向。
      const panner=c.createPanner();panner.panningModel='HRTF';panner.distanceModel='inverse';panner.refDistance=8;panner.maxDistance=70;panner.rolloffFactor=.15;panner.channelCount=1;panner.channelCountMode='explicit';
      panner.positionX.value=speaker.position[0];panner.positionY.value=speaker.position[1];panner.positionZ.value=speaker.position[2];
      node.connect(panner).connect(this.movieGain);this.routeNodes.push(panner);this.panners.push({id:speaker.id,node:panner,position:speaker.position,gain:route.gain,input:route.input});
    }
  }
  buildAmbient(){
    const c=this.context;this.ambience=c.createGain();this.ambience.gain.value=0;this.ambience.connect(this.master);
    // 本地程序生成空调、远处人群的滤波噪声，不需要下载音效，也不采集麦克风。
    const buffer=c.createBuffer(1,c.sampleRate*4,c.sampleRate),data=buffer.getChannelData(0);let brown=0,seed=271;
    for(let i=0;i<data.length;i++){seed=(seed*1664525+1013904223)>>>0;const white=seed/4294967296*2-1;brown=(brown+.02*white)/1.02;data[i]=brown*2;}
    const noise=c.createBufferSource();noise.buffer=buffer;noise.loop=true;
    const low=c.createBiquadFilter();low.type='lowpass';low.frequency.value=180;noise.connect(low).connect(this.ambience);noise.start();this.noiseBuffer=buffer;
    const crowd=c.createBufferSource();crowd.buffer=buffer;crowd.loop=true;crowd.playbackRate.value=1.5;
    const filter=c.createBiquadFilter();filter.type='bandpass';filter.frequency.value=560;filter.Q.value=.7;
    const gain=c.createGain();gain.gain.value=.16;crowd.connect(filter).connect(gain).connect(this.ambience);crowd.start();
  }
  sound(type){
    if(!this.context||this.context.state!=='running'||!this.noiseBuffer)return;const c=this.context,t=c.currentTime;
    const src=c.createBufferSource();src.buffer=this.noiseBuffer;src.playbackRate.value=type==='seat'?2.3:.75;
    const gain=c.createGain();gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.06,t+.025);gain.gain.exponentialRampToValueAtTime(.0001,t+(type==='seat'?.45:.16));src.connect(gain).connect(this.master);src.start();src.stop(t+.5);src.onended=()=>{src.disconnect();gain.disconnect();};
  }
  setPhase(phase){
    this.ambientTarget=phase==='movie'?.1:phase==='paused'?.35:1;this.movieLevel=phase==='movie'||phase==='paused'?1:0;
  }
  setMuted(value){this.muted=value;this.updateSettings();}
  updateSettings(){
    if(!this.context){this.video.volume=this.settings.master*this.settings.movie;this.video.muted=this.muted;return;}
    this.master.gain.setTargetAtTime(this.muted?0:this.settings.master,this.context.currentTime,.06);
  }
  update(camera,dt){
    if(!this.context)return;const c=this.context,listener=c.listener,p=camera.position;
    camera.getWorldDirection(this.forward);this.up.set(0,1,0).applyQuaternion(camera.quaternion);
    const values={positionX:p.x,positionY:p.y,positionZ:p.z,forwardX:this.forward.x,forwardY:this.forward.y,forwardZ:this.forward.z,upX:this.up.x,upY:this.up.y,upZ:this.up.z};
    if(listener.positionX){for(const [k,v] of Object.entries(values))listener[k].setTargetAtTime(v,c.currentTime,.025);}
    else {listener.setPosition(p.x,p.y,p.z);listener.setOrientation(this.forward.x,this.forward.y,this.forward.z,this.up.x,this.up.y,this.up.z);}
    this.movieGain.gain.setTargetAtTime(this.settings.movie*this.movieLevel,c.currentTime,.3);
    this.ambience.gain.setTargetAtTime(this.settings.ambient*this.ambientTarget*.25,c.currentTime,.5);
  }
  debug(){return {state:this.context?.state||'尚未创建',sampleRate:this.context?.sampleRate||0,channels:this.channelLabel,level:this.level,spatial:this.settings.spatial,routes:this.panners.map(p=>({speaker:p.id,input:p.input,gain:p.gain,position:p.position}))};}
}
