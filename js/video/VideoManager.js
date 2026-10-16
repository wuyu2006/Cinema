import { timeLabel,aspectLabel } from '../utils/MathUtils.js';
export class VideoManager extends EventTarget {
  constructor(){
    super();this.video=document.createElement('video');this.video.preload='metadata';this.video.playsInline=true;
    this.video.crossOrigin='anonymous';this.video.style.display='none';this.video.setAttribute('aria-hidden','true');document.body.append(this.video);
    this.objectURL=null;this.ready=false;this.source=null;this.token=0;
    for(const type of ['play','pause','ended','timeupdate','waiting','playing','seeked','volumechange'])this.video.addEventListener(type,()=>this.dispatchEvent(new Event(type)));
    this.video.addEventListener('error',()=>{if(this.ready)this.dispatchEvent(new CustomEvent('failure',{detail:this.errorMessage()}));});
  }
  loadFile(file){
    if(!file)return Promise.reject(new Error('请选择视频文件'));
    if(!/^video\//.test(file.type)&&!(/\.(mp4|webm|og[gv]|m4v|mov)$/i.test(file.name)))return Promise.reject(new Error('请选择浏览器支持的 MP4、WebM 或 OGG 视频。'));
    return this.load(URL.createObjectURL(file),{kind:'local',name:file.name,format:file.type||file.name.split('.').pop(),size:file.size});
  }
  loadURL(value){
    let url;try{url=new URL(value.trim());}catch{throw new Error('请输入完整的视频直链，例如 https://example.com/movie.mp4');}
    if(!['https:','http:'].includes(url.protocol))throw new Error('视频 URL 仅支持 HTTP / HTTPS 直链。');
    if(!navigator.onLine&&url.origin!==location.origin)throw new Error('当前处于离线状态，请使用本地视频。URL 视频需要网络。');
    if(location.protocol==='https:'&&url.protocol==='http:')throw new Error('当前页面使用 HTTPS，请提供 HTTPS 视频直链，或在本地 HTTP 服务中打开影院。');
    return this.load(url.href,{kind:'url',name:decodeURIComponent(url.pathname.split('/').pop()||'远程影片'),format:url.pathname.split('.').pop().toUpperCase()});
  }
  async load(url,source){
    this.pendingCancel?.();const token=++this.token;this.video.pause();this.ready=false;
    if(this.objectURL)URL.revokeObjectURL(this.objectURL);
    this.objectURL=source.kind==='local'?url:null;this.source=source;
    this.dispatchEvent(new CustomEvent('loading',{detail:source}));
    return new Promise((resolve,reject)=>{
      const done=()=>{clearTimeout(timer);this.video.removeEventListener('loadedmetadata',loaded);this.video.removeEventListener('error',failed);this.pendingCancel=null;};
      const loaded=()=>{if(token!==this.token)return;
        if(!this.video.videoWidth||!Number.isFinite(this.video.duration)){done();reject(new Error('未检测到有效的视频画面或有限时长。请使用可寻址的影片文件。'));return;}
        done();this.ready=true;const v=this.video;
        this.metadata={...source,width:v.videoWidth,height:v.videoHeight,duration:v.duration,durationLabel:timeLabel(v.duration),aspect:aspectLabel(v.videoWidth,v.videoHeight)};
        this.dispatchEvent(new CustomEvent('ready',{detail:this.metadata}));resolve(this.metadata);
      };
      const failed=()=>{done();reject(new Error(this.errorMessage()));};
      const timer=setTimeout(()=>{done();reject(new Error('影片加载超时，请检查文件、网络或跨域权限。'));},30000);
      this.pendingCancel=()=>{done();reject(new DOMException('影片已更换','AbortError'));};
      this.video.addEventListener('loadedmetadata',loaded);this.video.addEventListener('error',failed);
      this.video.crossOrigin='anonymous';this.video.src=url;this.video.load();
    });
  }
  errorMessage(){
    // 浏览器会把网络错误与 CORS 错误合并隐藏；不能凭同一错误码谎称已精确诊断服务器。
    if(this.source?.kind==='url')return '远程影片加载失败：可能是网络、格式或 CORS 限制。若控制台提示 CORS：该视频服务器禁止跨域访问，请使用本地视频文件。';
    return '影片加载失败：视频格式或编解码器不受支持，或文件已经损坏。请重新选择 MP4 / WebM 文件。';
  }
  async play(){if(!this.ready)throw new Error('请先导入影片');await this.video.play();}
  audioPresence(level=0){
    if(typeof this.video.mozHasAudio==='boolean')return this.video.mozHasAudio?'已检测到音轨':'未检测到音轨';
    if(this.video.audioTracks?.length>0||this.video.webkitAudioDecodedByteCount>0||level>.00001)return '已检测到音轨';
    return '音轨存在性未确认（可能尚未解码或处于静音片段）';
  }
  pause(){this.video.pause();}
  seek(time){if(this.ready)this.video.currentTime=Math.max(0,Math.min(this.video.duration,time));}
  destroy(){this.pendingCancel?.();this.video.pause();this.video.removeAttribute('src');this.video.load();this.video.remove();if(this.objectURL)URL.revokeObjectURL(this.objectURL);}
}
