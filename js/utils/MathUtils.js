export const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export const lerp = (a,b,t) => a + (b-a)*t;
export const ease = t => t*t*(3-2*t);
export function timeLabel(seconds){
  if(!Number.isFinite(seconds)) return '00:00';
  const s=Math.max(0,Math.floor(seconds)), h=Math.floor(s/3600), m=Math.floor(s%3600/60);
  return (h?`${h}`.padStart(2,'0')+':':'') + `${m}`.padStart(2,'0') + ':' + `${s%60}`.padStart(2,'0');
}
export function aspectLabel(w,h){
  for(const [a,b] of [[16,9],[4,3],[21,9],[1,1]]) if(Math.abs(w/h-a/b)<.015) return `${a}:${b}`;
  return `${(w/h).toFixed(2)}:1`;
}
export const bytesLabel = b => `${(b/1024/1024).toFixed(1)} MB`;
