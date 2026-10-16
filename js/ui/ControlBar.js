import { timeLabel } from '../utils/MathUtils.js';
export class ControlBar {
  constructor(video,onSeek,onVolume){
    this.video=video;this.bar=document.querySelector('#control-bar');this.seek=document.querySelector('#seek');this.dragging=false;this.timer=null;
    this.seek.addEventListener('input',()=>{this.dragging=true;onSeek(this.seek.value/1000*this.video.duration);this.update();});
    this.seek.addEventListener('change',()=>this.dragging=false);this.seek.addEventListener('pointerup',()=>this.dragging=false);
    document.querySelector('#volume').addEventListener('input',e=>onVolume(Number(e.target.value)));
    this.bar.addEventListener('pointerenter',()=>this.show(true));this.bar.addEventListener('pointerleave',()=>this.show());
    this.bar.addEventListener('focusin',()=>this.show(true));this.bar.addEventListener('focusout',()=>this.show());
    document.querySelector('#controls-zone').addEventListener('pointermove',()=>this.show());
    document.addEventListener('mousemove',e=>{if(document.body.classList.contains('is-cinema')&&!document.pointerLockElement&&e.clientY>innerHeight-150)this.show();});
    document.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&e.target.id==='world')this.show();});
    for(const type of ['timeupdate','loadedmetadata','seeked','play','pause','ended'])video.addEventListener(type,()=>this.update());
  }
  show(sticky=false){clearTimeout(this.timer);document.body.classList.add('show-controls');if(!sticky)this.timer=setTimeout(()=>document.body.classList.remove('show-controls'),2800);}
  hide(){clearTimeout(this.timer);document.body.classList.remove('show-controls');}
  update(){
    const v=this.video;if(!this.dragging)this.seek.value=Number.isFinite(v.duration)?v.currentTime/v.duration*1000:0;
    document.querySelector('#current-time').textContent=timeLabel(v.currentTime);document.querySelector('#total-time').textContent=timeLabel(v.duration);
    document.querySelector('#play-button use').setAttribute('href',v.paused?'#i-play':'#i-pause');
    this.seek.disabled=!Number.isFinite(v.duration);
  }
  volume(value,muted){document.querySelector('#volume').value=value;document.querySelector('#mute-button use').setAttribute('href',muted||value===0?'#i-muted':'#i-volume');}
}
