const groups={
  picture:[
    ['quality','画质','自动模式会在持续低帧率时降低画质。','select',[['AUTO','自动检测'],['LOW','LOW · 低'],['MEDIUM','MEDIUM · 中'],['HIGH','HIGH · 高']]],
    ['renderScale','渲染比例','DPR 上限为 2；4K 采用像素预算限制。','select',[[.5,'50%'],[.75,'75%'],[1,'自动 · 100%'],[1.25,'125%']]],
    ['fit','银幕画幅','保留原比例；影院裁切会裁去超出银幕的部分。','select',[['contain','完整显示 · 保持比例'],['crop','影院裁切 · 保持比例']]],
    ['glow','动态银幕溢光','每 160ms 采样低分辨率画面，让银幕灯跟随画面颜色；关闭后银幕灯保持中性固定色。','check'],
    ['ssao','SSAO 环境遮蔽','仅 HIGH 生效。','check'],['shadows','动态阴影','MEDIUM / HIGH 生效，单个主光源。','check'],
    ['bloom','微弱 Bloom','仅 HIGH 生效，保持克制的灯箱辉光。','check']
  ],
  controls:[['sensitivity','鼠标灵敏度','瞬时角位移始终受限，减少快速甩头。','range',[.2,2,.05]],['damping','视角响应','数值较小更柔和，数值较大更跟手。','range',[5,22,1]],['breathing','轻微呼吸效果','仅 ±0.012m；默认关闭。','check']],
  audio:[['master','主音量','','range',[0,1,.01]],['movie','电影音量','','range',[0,1,.01]],['ambient','环境音量','本地生成空调与远处环境氛围。','range',[0,1,.01]],['bass','低频增强','低于 110Hz 的低通扩散。','range',[0,2,.05]],['spatial','空间音频','HRTF 世界坐标声场，推荐使用耳机。','check'],['channels','音频声道映射','优先检测实际解码声道，无法检测时可手动指定。','select',[['auto','自动检测'],['1','Mono · 1'],['2','Stereo · 2.0'],['6','Surround · 5.1'],['8','Surround · 7.1']]],['channelLayout','7.1 通道顺序','取决于浏览器实际解码输出。','select',[['standard','L R C LFE SL SR BL BR'],['rear-first','L R C LFE BL BR SL SR']]],['audioDebug','Audio Debug','查看声道、音量、采样率和音箱坐标。','check']],
  cinema:[['countdown','选座等待时间','入场后可用于寻找座位的秒数；0 表示立即由影院安排最佳座位。','range',[0,180,5]],['fullLight','全场灯光','覆盖当前灯光状态，可随时恢复。','check'],['speakers','显示音箱布局','显示前方、侧墙、后方和顶部声道标签。','check'],['seatNumbers','显示座位编号','默认只显示排号，减少观影干扰。','check']]
};
export class SettingsUI {
  constructor(settings,onChange,onAssets,assetManager){this.settings=settings;this.onChange=onChange;this.onAssets=onAssets;this.assets=assetManager;this.tab='picture';
    document.querySelectorAll('[data-settings-tab]').forEach(button=>button.addEventListener('click',()=>{this.tab=button.dataset.settingsTab;this.render();}));
  }
  async render(){
    const tab=this.tab;document.querySelectorAll('[data-settings-tab]').forEach(t=>{t.classList.toggle('active',t.dataset.settingsTab===tab);t.setAttribute('aria-selected',t.dataset.settingsTab===tab);});
    const root=document.querySelector('#settings-content');root.replaceChildren();
    for(const [key,title,description,type,values] of groups[tab]){
      const row=document.createElement('label');row.className='setting-row';const copy=document.createElement('span');copy.className='setting-copy';const name=document.createElement('span');name.textContent=title;copy.append(name);
      if(description){const hint=document.createElement('small');hint.textContent=description;copy.append(hint);}row.append(copy);
      let input;
      if(type==='select'){
        input=document.createElement('select');for(const [value,label] of values){const option=new Option(label,String(value));input.add(option);}input.value=String(this.settings[key]??values[0][0]);
      }else if(type==='check'){input=document.createElement('input');input.type='checkbox';input.checked=this.settings[key];}
      else {input=document.createElement('input');input.type='range';[input.min,input.max,input.step]=values;input.value=this.settings[key];}
      input.setAttribute('aria-label',title);
      if(type==='range'){const wrap=document.createElement('span');wrap.className='setting-range';const out=document.createElement('output');const format=()=>out.textContent=values[1]<=2?Number(input.value).toFixed(2):input.value;format();input.addEventListener('input',format);wrap.append(input,out);row.append(wrap);}else row.append(input);
      input.addEventListener(type==='range'?'input':'change',()=>{let value=type==='check'?input.checked:type==='range'||key==='renderScale'?Number(input.value):input.value;this.settings[key]=value;this.onChange(key,value);});root.append(row);
    }
    if(tab==='audio'){const note=document.createElement('p');note.className='setting-note';note.textContent='2.0 / 顶部扩散是影院声场模拟，不是原生 Atmos 解码。原始音轨可能已被浏览器降混；自动检测显示实际交付的声道。远程视频需要 CORS 授权。';root.append(note);}
    if(tab==='cinema'){
      const button=document.createElement('button');button.className='secondary-button';button.style.width='100%';button.style.marginTop='20px';button.textContent='打开 3D 资源管理器';button.addEventListener('click',this.onAssets);root.append(button);
      try{
        const records=await this.assets.list();if(this.tab!==tab||!root.isConnected)return;
        const heading=document.createElement('h3');heading.className='settings-subhead';heading.textContent='自定义影院部件 · 默认自动缩放';root.append(heading);
        for(const [kind,label] of [['seats','座椅模型'],['speakers','音箱模型'],['lamps','壁灯模型'],['exit','出口灯箱'],['doors','影院门'],['decor','墙面装饰']]){
          const row=document.createElement('label');row.className='setting-row';const title=document.createElement('span');title.className='setting-copy';title.textContent=label;const select=document.createElement('select');select.add(new Option('内置默认模型',''));
          records.forEach(r=>select.add(new Option(r.name,r.id)));select.value=this.settings[`model_${kind}`]||'';
          select.addEventListener('change',()=>{this.settings[`model_${kind}`]=select.value;this.onChange(`model_${kind}`,select.value);});row.append(title,select);root.append(row);
        }
      }catch(error){const note=document.createElement('p');note.className='setting-note';note.textContent=error.message;root.append(note);}
    }
  }
}
