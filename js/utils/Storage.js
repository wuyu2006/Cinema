import { DEFAULT_SETTINGS, COUNTDOWN_RANGE } from '../core/Config.js';
// 隐私浏览、存储被禁用或旧版本配置损坏时，影院仍应能够正常启动。
export function readSettings(){
  try { return sanitizeSettings(JSON.parse(localStorage.getItem('ic-settings') || '{}')); }
  catch { return {...DEFAULT_SETTINGS}; }
}
export function sanitizeSettings(data){
  const result={...DEFAULT_SETTINGS};if(!data||typeof data!=='object')return result;
  const ranges={renderScale:[.5,1.25],sensitivity:[.2,2],damping:[5,22],master:[0,1],movie:[0,1],ambient:[0,1],bass:[0,2],countdown:[COUNTDOWN_RANGE.min,COUNTDOWN_RANGE.max],dofStrength:[0,1]};
  const choices={quality:['AUTO','LOW','MEDIUM','HIGH'],fit:['contain','crop'],channels:['auto','1','2','6','8'],channelLayout:['standard','rear-first']};
  for(const key of Object.keys(result)){
    if(ranges[key]){const n=Number(data[key]);if(Number.isFinite(n))result[key]=Math.max(ranges[key][0],Math.min(ranges[key][1],n));}
    else if(choices[key]){if(choices[key].includes(data[key]))result[key]=data[key];}
    else if(typeof data[key]==='boolean')result[key]=data[key];
  }
  for(const kind of ['seats','speakers','lamps','exit','doors','decor'])if(typeof data[`model_${kind}`]==='string')result[`model_${kind}`]=data[`model_${kind}`].slice(0,100);
  return result;
}
export function saveSettings(settings){ try { localStorage.setItem('ic-settings',JSON.stringify(settings)); } catch {} }
export function hasVisited(){ try { return localStorage.getItem('ic-visited')==='1'; } catch { return false; } }
export function markVisited(){ try { localStorage.setItem('ic-visited','1'); } catch {} }
