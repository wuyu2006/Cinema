import * as THREE from '../../lib/three/three.module.js';
import { LIGHTING_PRESETS } from '../core/Config.js';
import { ease,lerp } from '../utils/MathUtils.js';
export class CinemaLightingManager {
  constructor(){this.targets=[];this.current={...LIGHTING_PRESETS.ENTRY};this.from={...this.current};this.to={...this.current};this.elapsed=0;this.duration=0;this.mode='ENTRY';this.full=false;}
  register(channel,target,base=1){this.targets.push({channel,target,base,enabled:true,color:target.color?.clone?.()});}
  set(mode,duration=1.5){
    this.mode=mode;this.from={...this.current};this.to={...LIGHTING_PRESETS[this.full?'FULL_LIGHT':mode]};this.elapsed=0;this.duration=duration;
  }
  setFull(enabled){this.full=enabled;this.set(this.mode);}
  setEnabled(channel,enabled){this.targets.filter(t=>t.channel===channel).forEach(t=>t.enabled=enabled);}
  setColor(channel,color){this.targets.filter(t=>t.channel===channel).forEach(t=>{t.target.color?.set(color);t.target.emissive?.set(color);});}
  update(dt){
    this.elapsed+=dt;const t=this.duration?ease(Math.min(1,this.elapsed/this.duration)):1;
    for(const k of Object.keys(this.current))this.current[k]=lerp(this.from[k],this.to[k],t);
    for(const e of this.targets){const value=e.enabled?this.current[e.channel]*e.base:0;
      if(e.target.isLight)e.target.intensity=value;else e.target.emissiveIntensity=value;}
    if(this.screen)this.screen.brightness=this.current.screen;
  }
}
