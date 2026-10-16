// 只有状态机能够更改流程。UI、视频与灯光通过事件响应状态，不互相猜测状态。
export const STATES = Object.freeze({ LOBBY:'LOBBY', VIDEO_READY:'VIDEO_READY',
  ENTERING:'ENTERING', SEATING:'SEATING', SEATED:'SEATED', PRE_SHOW:'PRE_SHOW',
  MOVIE_PLAYING:'MOVIE_PLAYING', MOVIE_PAUSED:'MOVIE_PAUSED',
  MOVIE_FINISHED:'MOVIE_FINISHED', EXIT:'EXIT' });
const paths = {
  LOBBY:['VIDEO_READY','ENTERING'], VIDEO_READY:['LOBBY','ENTERING'],
  ENTERING:['SEATING','EXIT'], SEATING:['SEATED','PRE_SHOW','EXIT'],
  SEATED:['SEATING','PRE_SHOW','EXIT'], PRE_SHOW:['MOVIE_PLAYING','SEATING','EXIT'],
  MOVIE_PLAYING:['MOVIE_PAUSED','MOVIE_FINISHED','SEATING','EXIT'],
  MOVIE_PAUSED:['MOVIE_PLAYING','MOVIE_FINISHED','SEATING','EXIT'],
  MOVIE_FINISHED:['PRE_SHOW','SEATING','EXIT'], EXIT:['LOBBY','VIDEO_READY']
};
export class CinemaStateManager extends EventTarget {
  constructor(){ super(); this.current = STATES.LOBBY; }
  is(...states){ return states.includes(this.current); }
  transition(next, detail = {}){
    if(next === this.current) return false;
    if(!paths[this.current]?.includes(next)) throw new Error(`非法影院状态：${this.current} → ${next}`);
    const previous = this.current; this.current = next;
    this.dispatchEvent(new CustomEvent('change',{detail:{previous,current:next,...detail}}));
    return true;
  }
}
