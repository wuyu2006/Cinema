import { timeLabel } from '../utils/MathUtils.js';
export class LobbyUI {
  constructor(onFile,onURL){
    this.onFile=onFile;const input=document.querySelector('#video-file'),drop=document.querySelector('#file-drop');
    input.addEventListener('change',()=>{if(input.files[0])onFile(input.files[0]);input.value='';});
    drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}});
    for(const event of ['dragenter','dragover'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('dragover');});
    drop.addEventListener('dragleave',()=>drop.classList.remove('dragover'));
    drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragover');if(e.dataTransfer.files[0])onFile(e.dataTransfer.files[0]);});
    document.querySelectorAll('[data-source]').forEach(tab=>tab.addEventListener('click',()=>{
      document.querySelectorAll('[data-source]').forEach(t=>{const selected=t===tab;t.classList.toggle('active',selected);t.setAttribute('aria-selected',selected);document.querySelector(`#source-${t.dataset.source}`).hidden=!selected;});
    }));
    document.querySelector('#source-url').addEventListener('submit',e=>{e.preventDefault();onURL(document.querySelector('#video-url').value);});
    this.network=()=>{document.querySelector('#network-status').textContent=navigator.onLine?'离线就绪 · 网络可选':'Offline · 本地影院正常';};
    window.addEventListener('online',this.network);window.addEventListener('offline',this.network);this.network();
  }
  loading(){
    document.querySelector('#enter-cinema').disabled=true;this.status('正在加载影片…… 正在读取视频信息与准备银幕。');
    document.querySelector('#film-info').hidden=true;document.querySelector('#lobby').classList.remove('film-loaded');
    const progress=document.createElement('progress');progress.setAttribute('aria-label','正在加载影片');progress.className='video-loading-progress';
    // HTMLVideoElement 不公开文件已下载字节数，使用不确定进度而不伪造百分比。
    document.querySelector('#import-status').append(progress);
  }
  ready(meta){
    document.querySelector('#lobby').classList.add('film-loaded');document.querySelector('#film-info').hidden=false;
    document.querySelector('#film-name').textContent=meta.name;document.querySelector('#film-name').title=meta.name;
    document.querySelector('#film-resolution').textContent=`${meta.width} × ${meta.height}`;
    document.querySelector('#film-duration').textContent=timeLabel(meta.duration);document.querySelector('#film-aspect').textContent=`${meta.aspect} · ${meta.format}`;
    document.querySelector('#film-audio').textContent='音轨 / 声道：待首次播放后检测';
    document.querySelector('#enter-cinema').disabled=false;document.querySelector('#import-status').hidden=true;
  }
  status(message,error=false){const el=document.querySelector('#import-status');el.hidden=false;el.textContent=message;el.classList.toggle('error',error);}
}
