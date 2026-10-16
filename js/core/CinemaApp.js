import * as THREE from '../../lib/three/three.module.js';
import { CINEMA as C, DEFAULT_SETTINGS, COUNTDOWN_RANGE } from './Config.js';
import { CinemaStateManager as State, STATES as S } from './CinemaStateManager.js';
import { CinemaRenderer } from './Renderer.js';
import { LobbyScene } from '../scene/LobbyScene.js';
import { CinemaScene } from '../scene/CinemaScene.js';
import { SeatManager } from '../seating/SeatManager.js';
import { SeatTransition } from '../seating/SeatTransition.js';
import { FirstPersonController } from '../camera/FirstPersonController.js';
import { VideoManager } from '../video/VideoManager.js';
import { CinemaAudioEngine } from '../audio/CinemaAudioEngine.js';
import { CinemaLightingManager } from '../lighting/CinemaLightingManager.js';
import { ScreenGlow } from '../lighting/ScreenGlow.js';
import { ModelAssetManager } from '../assets/ModelAssetManager.js';
import { ModelLoader } from '../assets/ModelLoader.js';
import { SceneObjectFactory } from '../assets/SceneObjectFactory.js';
import { LobbyUI } from '../ui/LobbyUI.js';
import { ControlBar } from '../ui/ControlBar.js';
import { SettingsUI } from '../ui/SettingsUI.js';
import { AssetUI } from '../ui/AssetUI.js';
import { readSettings,saveSettings,hasVisited,markVisited } from '../utils/Storage.js';
import { clamp,timeLabel,ease } from '../utils/MathUtils.js';
const $=selector=>document.querySelector(selector);
export class CinemaApp {
  constructor(){
    // session 使旧的异步播放/选座回调在退出后失效；ending 防止倒计时为零时重复安排座位。
    this.settings=readSettings();this.state=new State();this.inCinema=false;this.session=0;this.ending=false;this.starting=false;this.aimed=null;this.lastSeconds=-1;this.modelVersions={};
    this.video=new VideoManager();this.audio=new CinemaAudioEngine(this.video.video,this.settings);
    this.lighting=new CinemaLightingManager();this.seatManager=new SeatManager();
    this.rendering=new CinemaRenderer($('#world'),this.settings);this.lobby=new LobbyScene();
    this.cinema=new CinemaScene(this.seatManager,this.lighting);this.rendering.configure(this.cinema);
    this.controller=new FirstPersonController(this.cinema.camera,$('#world'),this.seatManager,this.settings);
    this.controller.blocked=()=>this.anyDialog()||!$('#lock-overlay').hidden;
    this.seatTransition=new SeatTransition(this.controller,this.seatManager);
    this.glow=new ScreenGlow(this.cinema.scene,this.video.video);
    this.assets=new ModelAssetManager();this.modelLoader=new ModelLoader(this.rendering.renderer);
    this.factory=new SceneObjectFactory(this.cinema,this.seatManager,this.modelLoader);
    this.lobbyUI=new LobbyUI(file=>this.loadVideo(()=>this.video.loadFile(file)),url=>this.loadVideo(()=>this.video.loadURL(url)));
    this.controls=new ControlBar(this.video.video,time=>this.video.seek(time),value=>this.setVolume(value));
    this.settingsUI=new SettingsUI(this.settings,(key,value)=>this.changeSetting(key,value),()=>this.assetUI.open(),this.assets);
    this.assetUI=new AssetUI(this.assets,this.modelLoader,{openDialog:id=>this.openDialog(id),toast:m=>this.toast(m),onDelete:id=>this.removeAsset(id),onSaved:()=>this.settingsUI.render()});
    this.seatPrompt=$('#seat-prompt');this.seatPromptLabel=$('#nearby-seat');this.seatPromptAction=$('#seat-prompt button');this.seatPromptSeat=null;
    this.bind();this.applySettings();this.restoreModels();this.resize();this.lastTime=performance.now();
    this.running=true;requestAnimationFrame(t=>this.frame(t));$('#boot').hidden=true;
    // 暴露只读快照供故障诊断，不提供跳过倒计时的用户入口。
    window.cinemaDiagnostics=()=>({state:this.state.current,remaining:this.remaining,seats:this.seatManager.seats.length,seat:this.seatManager.selected?.id,fps:this.rendering.performance.fps,quality:this.rendering.performance.detected,audio:this.audio.debug(),localThree:THREE.REVISION});
  }
  bind(){
    this.state.addEventListener('change',e=>this.onState(e.detail));
    document.addEventListener('click',e=>{
      const close=e.target.closest('[data-close]');if(close){close.closest('dialog')?.close();return;}
      const button=e.target.closest('[data-action]');if(button){e.preventDefault();this.action(button.dataset.action);}
    });
    document.querySelectorAll('dialog').forEach(dialog=>{
      dialog.addEventListener('close',()=>{this.controller.keys.clear();if(this.inCinema&&!this.anyDialog()&&!this.starting&&!this.ending)this.showUnlocked();});
      dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
    });
    this.controller.addEventListener('lock',e=>{if(e.detail){$('#lock-overlay').hidden=true;$('#reticle').hidden=false;this.controls.hide();}else{this.controls.show();this.showUnlocked();}});
    this.controller.addEventListener('lockerror',()=>{this.toast('当前环境无法锁定鼠标。可拖动画面环顾，使用 WASD 或方向触控移动。');$('#lock-overlay').hidden=true;});
    $('#countdown-range').addEventListener('input',e=>this.setCountdown(e.target.value));
    this.video.addEventListener('ready',e=>{
      this.audio.resetDetection();this.glow.reset();this.lobbyUI.ready(e.detail);$('#playing-title').textContent=e.detail.name;
      if(this.state.is(S.LOBBY))this.state.transition(S.VIDEO_READY);
      this.controls.update();
    });
    this.video.addEventListener('failure',e=>{this.toast(e.detail);if(this.state.is(S.MOVIE_PLAYING))this.pauseMovie();});
    this.video.addEventListener('pause',()=>{
      clearTimeout(this.pauseTimer);
      if(this.state.is(S.MOVIE_PLAYING)&&!this.video.video.ended)this.pauseTimer=setTimeout(()=>{if(this.video.video.paused&&this.state.is(S.MOVIE_PLAYING))this.state.transition(S.MOVIE_PAUSED);},500);
    });
    this.video.addEventListener('play',()=>{clearTimeout(this.pauseTimer);if(this.state.is(S.MOVIE_PAUSED))this.state.transition(S.MOVIE_PLAYING);});
    this.video.addEventListener('ended',()=>this.finish());
    this.video.addEventListener('waiting',()=>{if(this.state.is(S.MOVIE_PLAYING))this.toast('影片缓冲中…… 本地视频如持续无法解码，请尝试兼容的 MP4 / WebM。');});
    const updateAudio=()=>$('#film-audio').textContent=`${this.video.audioPresence(this.audio.level)} · ${this.audio.channelLabel}`;
    this.audio.addEventListener('channels',updateAudio);this.video.addEventListener('timeupdate',()=>{if(this.audio.context)updateAudio();});
    this.audio.addEventListener('unsupported',()=>this.toast('此浏览器的 Web Audio 不可用，已保留原生视频音频播放。'));
    window.addEventListener('resize',()=>this.resize());window.addEventListener('keydown',e=>this.keydown(e));
    document.addEventListener('fullscreenchange',()=>document.body.classList.toggle('fullscreen-mode',!!document.fullscreenElement));
    window.addEventListener('blur',()=>this.controller.keys.clear());
    document.addEventListener('visibilitychange',()=>{this.lastTime=performance.now();this.controller.keys.clear();});
    document.querySelectorAll('[data-move]').forEach(button=>{
      const stop=()=>this.controller.keys.delete(button.dataset.move);
      button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);if(!this.controller.seated)this.controller.keys.add(button.dataset.move);});button.addEventListener('pointerup',stop);button.addEventListener('pointercancel',stop);
    });
    $('#world').addEventListener('webglcontextlost',e=>{e.preventDefault();this.video.pause();this.running=false;this.toast('WebGL 上下文已丢失，请重新加载页面恢复影院。');});
    window.addEventListener('beforeunload',()=>{this.running=false;this.assets.cancel();this.video.destroy();});
  }
  anyDialog(){return !!document.querySelector('dialog[open]');}
  openDialog(id){
    this.controller.keys.clear();this.controller.release();$('#lock-overlay').hidden=true;const dialog=document.getElementById(id);if(!dialog.open)dialog.showModal();
  }
  closeDialogs(){document.querySelectorAll('dialog[open]').forEach(d=>d.close());$('#lock-overlay').hidden=true;}
  toast(message){clearTimeout(this.toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;this.toastTimer=setTimeout(()=>$('#toast').hidden=true,4700);}
  async loadVideo(loader){
    this.lobbyUI.loading();try{await loader();}
    catch(error){
      if(error.name==='AbortError')return;
      if(this.video.ready&&this.video.metadata)this.lobbyUI.ready(this.video.metadata);
      else if(this.state.is(S.VIDEO_READY))this.state.transition(S.LOBBY);
      this.lobbyUI.status(error.message,true);this.toast(error.message);
    }
  }
  action(name){
    const actions={home:()=>this.home(),enter:()=>this.requestEntry(false),explore:()=>this.requestEntry(true),demo:()=>this.loadDemo(),help:()=>{this.pendingEntry=false;$('#help-start').firstChild.textContent='明白了 ';this.openDialog('help-dialog');},'help-start':()=>this.helpStart(),
      settings:()=>{this.settingsUI.render();this.openDialog('settings-dialog');},assets:()=>this.assetUI.open(),lock:()=>{this.audio.ensure().catch(e=>this.toast(e.message));this.controller.lock();$('#lock-overlay').hidden=true;},'dismiss-lock':()=>$('#lock-overlay').hidden=true,
      sit:()=>this.sit(this.aimed),seatmap:()=>this.openSeatMap(),'best-seat':()=>this.goBest(),leave:()=>this.leaveSeat(),start:()=>this.startMovie(),play:()=>this.togglePlayback(),mute:()=>{this.audio.setMuted(!this.audio.muted);this.controls.volume(this.settings.master,this.audio.muted);},light:()=>{this.settings.fullLight=!this.settings.fullLight;this.changeSetting('fullLight',this.settings.fullLight);this.toast(this.settings.fullLight?'全场灯光已开启':'已恢复影院灯光');},fullscreen:()=>this.fullscreen(),
      replay:()=>this.replay(),'choose-movie':()=>{this.home();$('#video-file').click();},'back-to-seating':()=>this.continueSeating(),'reset-settings':()=>{Object.assign(this.settings,DEFAULT_SETTINGS);this.removeAsset(null);this.applySettings();this.settingsUI.render();this.toast('设置与影院部件已恢复默认，模型收藏仍保留');}
    };
    const run=actions[name];if(run)Promise.resolve().then(run).catch(error=>this.toast(error.message));
  }
  requestEntry(explore){
    if(this.inCinema)return;if(!explore&&!this.video.ready){this.toast('请先选择一部影片');return;}
    if(!hasVisited()){
      this.pendingEntry=true;$('#help-start').firstChild.textContent='开始体验 ';this.openDialog('help-dialog');
    }else this.enter();
  }
  loadDemo(){
    this.loadVideo(async()=>{
      const response=await fetch(new URL('../../assets/first-light.mp4',import.meta.url));if(!response.ok)throw new Error('试映短片不可用，请选择本地影片');
      const blob=await response.blob();return this.video.loadFile(new File([blob],'FIRST LIGHT · 内置试映短片.mp4',{type:'video/mp4'}));
    });
  }
  helpStart(){const enter=this.pendingEntry;this.pendingEntry=false;$('#help-dialog').close();if(enter){markVisited();this.enter();}}
  enter(){
    this.session++;this.closeDialogs();this.inCinema=true;this.ending=false;this.starting=false;this.standAnimation=null;
    document.body.classList.replace('is-lobby','is-cinema');document.body.classList.remove('is-playing');
    this.video.pause();this.seatTransition.cancel();this.seatManager.release();this.controller.enabled=true;this.controller.seated=false;
    this.controller.reset(new THREE.Vector3(-13.2,this.seatManager.ground(13)+C.standingHeight,13));this.controller.faceScreen(true);
    this.cinema.screen.showWelcome();this.cinema.screen.drawWelcome(this.settings.countdown);this.glow.reset();this.audio.setPhase('entry');
    this.state.transition(S.ENTERING);this.state.transition(S.SEATING);this.beginCountdown();
    $('#cinema-hud').hidden=false;$('#control-bar').hidden=false;$('#controls-zone').hidden=false;$('#current-seat').textContent='尚未入座';$('#leave-seat').hidden=true;$('#touch-controls').style.visibility='visible';$('#paused-label').hidden=true;
    $('#lock-title').textContent='准备好，走进电影。';$('#lock-description').innerHTML='点击后锁定鼠标，用视线探索影院。<br>按 ESC 随时释放鼠标。';$('#lock-overlay').hidden=false;
    this.audio.ensure().catch(e=>this.toast(e.message));this.controls.show();
  }
  beginCountdown(){this.deadline=performance.now()+this.settings.countdown*1000;this.remaining=this.settings.countdown;this.lastSeconds=-1;$('#countdown').classList.remove('quiet');}
  // 选座等待时间在入场前自由调节；0 表示入场后立即由影院安排最佳座位。
  setCountdown(value,save=true){
    this.settings.countdown=Math.round(clamp(Number(value),COUNTDOWN_RANGE.min,COUNTDOWN_RANGE.max))||0;
    $('#countdown-range').value=this.settings.countdown;
    $('#entry-note-text').textContent=this.settings.countdown>0?`开场前，留给你 ${this.settings.countdown} 秒寻找心仪的座位`:'0 秒：入场后由影院立即为你安排最佳座位';
    if(save)saveSettings(this.settings);
  }
  onState({current}){
    const modes={SEATING:'SEATING',SEATED:'SEATING',PRE_SHOW:'PRE_SHOW',MOVIE_PLAYING:'MOVIE',MOVIE_PAUSED:'PAUSED',MOVIE_FINISHED:'FINISHED',LOBBY:'ENTRY',VIDEO_READY:'ENTRY'};
    if(modes[current])this.lighting.set(modes[current],current===S.MOVIE_FINISHED?2.5:1.5);
    if(current===S.SEATING){this.audio.setPhase('entry');this.phase('请选择您的座位','PLEASE FIND YOUR SEAT');}
    if(current===S.SEATED)this.phase('已入座，静候开场','YOUR SEAT IS READY');
    if(current===S.PRE_SHOW){this.audio.setPhase('entry');this.phase('电影即将开始','YOUR PRIVATE SCREENING');$('#countdown-value').textContent='READY';}
    if(current===S.MOVIE_PLAYING){
      this.audio.setPhase('movie');document.body.classList.add('is-playing');$('#paused-label').hidden=true;$('#countdown').classList.add('quiet');this.controls.show();
    }else document.body.classList.remove('is-playing');
    if(current===S.MOVIE_PAUSED){this.audio.setPhase('paused');$('#paused-label').hidden=false;$('#paused-label').classList.remove('fade');clearTimeout(this.pausedFade);this.pausedFade=setTimeout(()=>$('#paused-label').classList.add('fade'),3200);this.controls.show();}
    if(current===S.MOVIE_FINISHED){this.audio.setPhase('finished');$('#paused-label').hidden=true;this.phase('电影结束 · 感谢您的观影','THANK YOU FOR WATCHING');$('#countdown').classList.remove('quiet');$('#countdown-value').textContent='FIN';}
  }
  phase(title,subtitle){$('#phase-label').textContent=title;$('#phase-subtitle').textContent=subtitle;}
  async sit(seat,{travel=true}={}){
    if(!seat||!this.inCinema||this.seatTransition.active||this.standAnimation)return false;
    if(!this.state.is(S.SEATING,S.SEATED,S.MOVIE_PLAYING,S.MOVIE_PAUSED,S.MOVIE_FINISHED))return false;
    const token=this.session;$('#seatmap-dialog').close();$('#seat-prompt').hidden=true;
    this.currentSit=this.seatTransition.start(seat,{travel:travel&&!this.controller.seated});
    const complete=await this.currentSit;if(!complete||token!==this.session)return false;
    if(this.state.is(S.SEATING))this.state.transition(S.SEATED);
    this.audio.sound('seat');$('#current-seat').textContent=`${seat.row} 排 · ${String(seat.column).padStart(2,'0')} 座`;
    $('#leave-seat').hidden=false;$('#touch-controls').style.visibility='hidden';return true;
  }
  goBest(){
    if(!this.inCinema||this.ending||this.state.is(S.PRE_SHOW,S.MOVIE_FINISHED))return;
    const seat=this.seatManager.best();if(!seat){this.toast('暂无可用座位');return;}
    this.toast(`正在前往最佳观影位置：${seat.row} 排 ${seat.column} 座`);this.sit(seat).catch(e=>this.toast(e.message));
  }
  async endCountdown(){
    if(this.ending||!this.inCinema)return;this.ending=true;const token=this.session;
    this.phase('电影即将开始','STAY WHERE YOU ARE');$('#countdown-value').textContent='00:00';
    try{
      // 只等观众自己发起的入座动画走完，绝不主动把人挪到别处：
      // 倒计时结束就停在当前的位置和视角开演，坐不坐、坐哪儿由观众自己按 E / R 决定。
      if(this.seatTransition.active)await this.currentSit;
      if(token!==this.session||!this.inCinema)return;
      this.state.transition(S.PRE_SHOW);
      // 倒计时结束直接开演，不再要求再点一次「开始观影」。只有在浏览器拒绝自动播放、
      // 或还没有可用影片时，才退回那个按钮。
      if(this.video.ready)this.startMovie();else this.presentStart();
    }finally{if(token===this.session)this.ending=false;}
  }
  presentStart(){
    const ready=this.video.ready;$('#start-movie').disabled=!ready;
    $('#start-description').innerHTML=ready?'浏览器暂未允许自动播放。<br>点一下这里即可继续，之后不会再次询问。':'影厅已就绪。选择一部本地影片，<br>即可完全离线开始观影。';
    this.openDialog('start-dialog');
  }
  async startMovie(){
    if(this.starting||!this.video.ready||!this.state.is(S.PRE_SHOW))return;
    this.starting=true;const token=this.session,position=this.video.video.currentTime;$('#start-movie').disabled=true;
    try{
      // 两个受策略约束的 API 都在这里启动。先授权、暂停，然后执行熄灯仪式，不跳过影片开头。
      // 音频上下文拿不到授权时只提示一声，不阻止影片开始（视频照常播放，只是可能没有空间声场）。
      let audioError=null;
      const audio=this.audio.ensure().catch(error=>{audioError=error.message;});
      const play=this.video.play();await Promise.all([audio,play]);
      if(token!==this.session)return;this.video.pause();this.video.seek(position);
      $('#start-dialog').close();$('#lock-overlay').hidden=true;this.cinema.screen.useVideo(this.video.video);this.cinema.screen.setFit(this.settings.fit);
      this.lighting.set('PRE_SHOW',.65);await new Promise(resolve=>setTimeout(resolve,650));
      if(token!==this.session||!this.state.is(S.PRE_SHOW))return;
      await this.video.play();if(token!==this.session){this.video.pause();return;}
      this.state.transition(S.MOVIE_PLAYING);this.controls.show();
      this.toast(audioError?'影片已开始，但音频未获得播放授权，声音可能不可用。点击画面可重试。':'观影愉快。按 ESC 可操作控制栏，空格暂停。');
    }catch(error){
      if(token===this.session){this.video.pause();this.toast(error.name==='NotAllowedError'?'浏览器暂时不允许自动播放，点一下「开始观影」即可，之后不会再问。':error.message);this.presentStart();}
    }finally{if(token===this.session){this.starting=false;$('#start-movie').disabled=false;}}
  }
  async togglePlayback(){
    if(!this.inCinema)return;
    if(this.state.is(S.PRE_SHOW)){if(this.video.ready)this.startMovie();else this.presentStart();return;}
    if(this.state.is(S.MOVIE_FINISHED)){this.replay();return;}
    if(this.state.is(S.SEATING,S.SEATED)){this.toast(`请稍候，距离开场还有 ${this.remaining} 秒。你可以自由选座。`);return;}
    if(!this.video.ready)return;
    if(this.video.video.paused){try{await Promise.all([this.audio.ensure(),this.video.play()]);}catch(e){this.toast('继续播放需要浏览器授权，请点击播放按钮。');}}
    else this.pauseMovie();this.controls.show();
  }
  pauseMovie(){this.video.pause();}
  leaveSeat(){
    if(!this.controller.seated||this.ending||this.starting||this.seatTransition.active||this.standAnimation)return;
    // 影片一旦开始（播放中 / 暂停 / 已结束），起身只是站起来：不暂停影片、不回到映前画面。
    // 映前起身同样不重开倒计时——入场时给的那段选座时间继续走，坐着再站起来不会把时间刷新。
    const started=this.state.is(S.MOVIE_PLAYING,S.MOVIE_PAUSED,S.MOVIE_FINISHED);
    if(!started){this.video.pause();clearTimeout(this.pauseTimer);}
    const seat=this.seatManager.selected;
    this.controller.seated=false;this.controller.transitioning=true;
    const from=this.cinema.camera.position.clone(),to=new THREE.Vector3(seat.position.x,seat.position.y+C.standingHeight,seat.position.z-.77);
    this.standAnimation={from,to,elapsed:0};this.seatManager.release();
    if(!started)this.state.transition(S.SEATING);
    $('#current-seat').textContent='尚未入座';$('#leave-seat').hidden=true;$('#touch-controls').style.visibility='visible';$('#paused-label').hidden=true;this.controls.show();
  }
  continueSeating(){
    if(!this.state.is(S.PRE_SHOW))return;$('#start-dialog').close();
    if(this.controller.seated){this.state.transition(S.SEATING);this.state.transition(S.SEATED);}else this.state.transition(S.SEATING);
    this.beginCountdown();this.cinema.screen.showWelcome();this.showUnlocked();
  }
  finish(){
    clearTimeout(this.pauseTimer);if(!this.state.is(S.MOVIE_PLAYING,S.MOVIE_PAUSED))return;
    const token=this.session;this.state.transition(S.MOVIE_FINISHED);
    setTimeout(()=>{if(token===this.session&&this.state.is(S.MOVIE_FINISHED))this.openDialog('finished-dialog');},1800);
  }
  replay(){
    if(!this.state.is(S.MOVIE_FINISHED))return;$('#finished-dialog').close();this.video.seek(0);this.state.transition(S.PRE_SHOW);
    // 重播同样直接开演：这次点击本身就是用户手势，浏览器一定会放行。
    if(this.video.ready)this.startMovie();else this.presentStart();
  }
  home(){
    if(!this.inCinema){this.closeDialogs();return;}
    this.session++;this.inCinema=false;this.ending=false;this.starting=false;this.standAnimation=null;clearTimeout(this.pauseTimer);clearTimeout(this.pausedFade);
    this.aimed=null;this.seatPromptSeat=null;this.cinema.seats.highlight(null);
    this.video.pause();this.audio.setPhase('lobby');this.audio.movieLevel=0;this.seatTransition.cancel();this.seatManager.release();this.controller.enabled=false;this.controller.seated=false;this.controller.release();this.closeDialogs();
    this.state.transition(S.EXIT);this.state.transition(this.video.ready?S.VIDEO_READY:S.LOBBY);
    document.body.classList.replace('is-cinema','is-lobby');document.body.classList.remove('is-playing');$('#cinema-hud').hidden=true;$('#control-bar').hidden=true;$('#controls-zone').hidden=true;$('#lock-overlay').hidden=true;this.controls.hide();
    if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
  }
  showUnlocked(){
    if(!this.inCinema||this.controller.locked||this.anyDialog()||this.ending||this.starting)return;
    $('#lock-title').textContent='观影控制已暂停';$('#lock-description').innerHTML='电影与影院仍在继续。<br>点击进入观影模式，或使用底部控制栏。';$('#lock-overlay').hidden=false;$('#reticle').hidden=true;
  }
  openSeatMap(){
    if(this.ending||this.starting||this.seatTransition.active)return;
    if(this.controller.seated&&this.state.is(S.MOVIE_PLAYING,S.MOVIE_PAUSED,S.PRE_SHOW,S.MOVIE_FINISHED)){this.toast('观影中可按 R 返回最佳位置；自由选座请先按 E 起身。');return;}
    const root=$('#seat-map');root.replaceChildren();const best=this.seatManager.best();
    for(let r=1;r<=C.rows;r++){
      const row=document.createElement('div');row.className='seat-map-row';const label=document.createElement('span');label.textContent=String.fromCharCode(64+r);row.append(label);
      this.seatManager.seats.filter(s=>s.row===r).forEach(seat=>{
        const button=document.createElement('button');button.className='map-seat';button.textContent=seat.column;
        button.classList.toggle('recommended',seat.score>best.score-4);button.classList.toggle('selected',seat===this.seatManager.selected);
        button.disabled=!seat.available||seat.occupied&&seat!==this.seatManager.selected;button.title=`${seat.row} 排 ${seat.column} 座 · 观影评分 ${seat.score.toFixed(1)}`;button.setAttribute('aria-label',button.title);
        button.addEventListener('click',()=>this.sit(seat).catch(e=>this.toast(e.message)));row.append(button);
      });root.append(row);
    }this.openDialog('seatmap-dialog');
  }
  // E 键：准星对准某个座位时直接坐上去（影院会自行带路）；已经入座时再按一次起身。
  toggleSeat(){
    if(!this.inCinema||this.ending||this.starting||this.seatTransition.active||this.standAnimation)return;
    if(this.controller.seated)return this.leaveSeat();
    if(this.aimed)return this.sit(this.aimed);
  }
  // ~ 键：在观影中随时锁定 / 解锁鼠标指针，不必去找 ESC 或底部控制栏。
  togglePointerLock(){
    if(!this.inCinema)return;
    if(this.controller.locked){this.controller.release();this.controls.show();return;}
    this.audio.ensure().catch(()=>{});
    $('#lock-overlay').hidden=true;this.controller.lock();
  }
  keydown(e){
    if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
    if(e.key==='?'&&!this.anyDialog()){e.preventDefault();this.pendingEntry=false;this.openDialog('help-dialog');return;}
    if(!this.inCinema||this.anyDialog()||e.repeat)return;
    const handlers={Space:()=>this.togglePlayback(),ArrowLeft:()=>this.video.seek(this.video.video.currentTime-5),ArrowRight:()=>this.video.seek(this.video.video.currentTime+5),ArrowUp:()=>this.setVolume(this.settings.master+.05),ArrowDown:()=>this.setVolume(this.settings.master-.05),KeyM:()=>this.action('mute'),KeyR:()=>this.goBest(),KeyF:()=>this.fullscreen(),KeyL:()=>this.action('light'),KeyE:()=>this.toggleSeat(),Backquote:()=>this.togglePointerLock(),Tab:()=>{this.controller.release();this.controls.show(true);}};
    if(handlers[e.code]){e.preventDefault();Promise.resolve(handlers[e.code]()).catch(error=>this.toast(error.message));}
  }
  setVolume(value){this.settings.master=clamp(value,0,1);if(this.settings.master>0)this.audio.muted=false;this.audio.updateSettings();this.controls.volume(this.settings.master,this.audio.muted);saveSettings(this.settings);}
  async fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();this.controls.hide();}catch{this.toast('当前浏览器或嵌入环境不允许全屏，请在独立标签页打开影院。');}}
  async changeSetting(key){
    saveSettings(this.settings);
    if(key.startsWith('model_')){await this.replaceModel(key.slice(6),this.settings[key]);return;}
    if(['quality','renderScale','ssao','shadows','bloom'].includes(key))this.rendering.configure(this.cinema);
    if(['spatial','channels','channelLayout','bass'].includes(key))this.audio.buildRoutes();
    this.applySettings(false);
  }
  applySettings(configure=true){
    if(configure)this.rendering.configure(this.cinema);
    this.setCountdown(this.settings.countdown,false);
    this.cinema.screen.setFit(this.settings.fit);this.cinema.speakers.labels.visible=this.settings.speakers;this.cinema.seats.numbers.visible=this.settings.seatNumbers;
    this.lighting.setFull(this.settings.fullLight);this.glow.enabled=this.settings.glow&&this.rendering.preset.glow;this.glow.setCount(this.rendering.preset.screenLights);
    $('#audio-debug').hidden=!this.settings.audioDebug;this.audio.updateSettings();this.controls.volume(this.settings.master,this.audio.muted);
    $('#performance-status').textContent=`WebGL2 · ${this.settings.quality==='AUTO'?'自动 '+this.rendering.performance.detected:this.settings.quality} · ${this.rendering.performance.gpu.slice(0,29)}`;
  }
  async replaceModel(kind,id){
    const version=this.modelVersions[kind]=(this.modelVersions[kind]||0)+1;
    try{
      if(!id){this.factory.clear(kind);return;}
      const record=await this.assets.get(id);if(version!==this.modelVersions[kind])return;
      if(!record){this.settings[`model_${kind}`]='';this.factory.clear(kind);saveSettings(this.settings);return;}
      if(kind==='seats'&&record.stats?.triangles*C.rows*C.columns>12000000)this.toast('该模型用于全部座椅的三角形总数较高，建议使用简化模型或降低画质。');
      await this.factory.replace(kind,record,{version,isCurrent:()=>version===this.modelVersions[kind]});
      if(version===this.modelVersions[kind])this.toast(`已使用本地模型：${record.name}`);
    }catch(error){if(version===this.modelVersions[kind]){this.settings[`model_${kind}`]='';saveSettings(this.settings);this.toast(`模型替换失败，保留默认影院：${error.message}`);}}
  }
  async restoreModels(){for(const kind of ['seats','speakers','lamps','exit','doors','decor'])if(this.settings[`model_${kind}`])await this.replaceModel(kind,this.settings[`model_${kind}`]);}
  removeAsset(id){
    for(const kind of ['seats','speakers','lamps','exit','doors','decor'])if(!id||this.settings[`model_${kind}`]===id){this.modelVersions[kind]=(this.modelVersions[kind]||0)+1;this.factory.clear(kind);this.settings[`model_${kind}`]='';}
    saveSettings(this.settings);this.settingsUI.render();
  }
  resize(){this.rendering.resize();for(const camera of [this.lobby.camera,this.cinema.camera]){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}}
  frame(now){
    if(!this.running)return;const dt=Math.min(.05,(now-this.lastTime)/1000);this.lastTime=now;
    if(this.inCinema){
      if(this.state.is(S.SEATING,S.SEATED)&&!this.ending){
        this.remaining=Math.max(0,Math.ceil((this.deadline-now)/1000));
        if(this.remaining!==this.lastSeconds){this.lastSeconds=this.remaining;$('#countdown-value').textContent=timeLabel(this.remaining);$('#countdown').classList.toggle('urgent',this.remaining<=10);this.cinema.screen.drawWelcome(this.remaining);}
        if(this.remaining===0)this.endCountdown().catch(e=>{this.toast(e.message);if(this.inCinema&&this.state.is(S.SEATING,S.SEATED)){this.state.transition(S.PRE_SHOW);this.presentStart();}});
      }
      this.seatTransition.update(dt);
      if(this.standAnimation){const a=this.standAnimation;a.elapsed+=dt;const t=Math.min(1,a.elapsed/.95);this.cinema.camera.position.lerpVectors(a.from,a.to,ease(t));this.cinema.camera.position.y+=Math.sin(t*Math.PI)*.12;if(t===1){this.standAnimation=null;this.controller.transitioning=false;this.controller.baseY=a.to.y;}}
      this.controller.update(dt,now/1000);
      // 影片开始后起身也可以自由走动、重新对准座位，但不会再触发选座倒计时。
      const roaming=this.state.is(S.SEATING)||(!this.controller.seated&&this.state.is(S.MOVIE_PLAYING,S.MOVIE_PAUSED,S.MOVIE_FINISHED));
      const canWalk=roaming&&!this.controller.seated&&!this.controller.transitioning&&!this.ending;
      this.aimed=canWalk?this.cinema.seats.pick(this.cinema.camera,seat=>seat.available&&(!seat.occupied||seat===this.seatManager.selected)):null;
      this.cinema.seats.highlight(this.aimed);
      // 准星对准座位时提示「坐下」；开场倒计时内已经入座时，同一位置提示「起身」。
      const seated=this.controller.seated&&!this.seatTransition.active&&!this.standAnimation&&this.state.is(S.SEATING,S.SEATED)?this.seatManager.selected:null;
      const target=this.aimed||seated;
      if(target!==this.seatPromptSeat){
        this.seatPromptSeat=target;this.seatPromptLabel.textContent=target?`${this.aimed?'座位':'已入座'} ${target.row} 排 ${String(target.column).padStart(2,'0')} 座`:'';
        this.seatPromptAction.dataset.action=this.aimed?'sit':'leave';
        this.seatPromptAction.innerHTML=this.aimed?'<kbd>E</kbd> 坐下':'<kbd>E</kbd> 起身';
      }
      this.seatPrompt.hidden=!target||this.anyDialog();
      if(canWalk&&this.controller.velocity.length()>.5&&now-this.audio.lastStep>490){this.audio.lastStep=now;this.audio.sound('step');}
      this.lighting.update(dt);this.glow.update(dt,this.state.is(S.MOVIE_PLAYING,S.MOVIE_PAUSED,S.MOVIE_FINISHED)?this.lighting.current.screen:0);this.cinema.update();
      this.audio.update(this.cinema.camera,dt);this.rendering.render(this.cinema.scene,this.cinema.camera,true);
      if(this.settings.audioDebug&&now-(this.debugTime||0)>400){this.debugTime=now;const a=this.audio.debug();$('#audio-debug').textContent=`AudioContext State: ${a.state}\nSample Rate: ${a.sampleRate} Hz\nChannels: ${a.channels}\nMaster: ${Math.round(this.settings.master*100)}% · RMS: ${a.level.toFixed(4)}\nPanner: ${a.spatial?'HRTF / world-relative':'原生降混'}\n\n`+a.routes.map(p=>`${p.speaker.padEnd(4)} ← ch${p.input+1} · gain ${p.gain}\n      (${p.position.join(', ')})`).join('\n');}
    }else{
      this.lobby.update(now/1000);this.audio.update(this.lobby.camera,dt);this.rendering.render(this.lobby.scene,this.lobby.camera,false);
    }
    this.rendering.performance.update(dt,this.settings.quality==='AUTO',()=>{this.rendering.configure(this.cinema);this.applySettings(false);this.toast('已根据持续帧率调整画质。');});
    requestAnimationFrame(t=>this.frame(t));
  }
}
