// Web Audio 的标准 5.1 顺序为 L R C LFE SL SR；7.1 的最后两对由播放器解码器约定，提供两种布局。
export function channelRoutes(count,layout='standard'){
  const routes=[];const add=(speaker,input,gain=1,filter=null,delay=0)=>routes.push({speaker,input,gain,filter,delay});
  if(count===1){add('C',0,.78);add('L',0,.27);add('R',0,.27);add('LFE',0,.13,'lowpass');}
  else if(count>=6){
    add('L',0,.8);add('R',1,.8);add('C',2,.9);add('LFE',3,.55,'lowpass');
    const sideL=count>=8&&layout==='rear-first'?6:4,sideR=sideL+1;
    for(let i=1;i<=4;i++){add(`SL${i}`,sideL,.3);add(`SR${i}`,sideR,.3);}
    if(count>=8){const back=layout==='rear-first'?4:6;add('BL',back,.7);add('BR',back+1,.7);}
    else{add('BL',4,.13,null,.012);add('BR',5,.13,null,.012);}
  }else{
    add('L',0,.72);add('R',1,.72);
    // Mid=L+R 的等量混合模拟银幕后对白，并非声源分离或真实 Dolby/Atmos 解码。
    add('C',0,.27);add('C',1,.27);add('LFE',0,.09,'lowpass');add('LFE',1,.09,'lowpass');
    for(let i=1;i<=4;i++){add(`SL${i}`,0,.065,'highpass',.009+i*.003);add(`SR${i}`,1,.065,'highpass',.009+i*.003);}
    add('BL',0,.065,'highpass',.027);add('BR',1,.065,'highpass',.027);
  }
  // 顶部是弱扩散层，明确标注为模拟；不能把常规影片称为含有原生对象音频。
  for(const zone of ['F','M','R']){add(`T${zone}L`,count===1?0:count>=6?4:0,.022,'highpass',.025);add(`T${zone}R`,count===1?0:count>=6?5:1,.022,'highpass',.025);}
  return routes;
}
