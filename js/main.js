import { CinemaApp } from './core/CinemaApp.js';
// 启动错误保留可读的中文说明，不能让没有 WebGL2 的设备只看到空白画布。
try{
  new CinemaApp();
  if('serviceWorker' in navigator && window.isSecureContext){
    navigator.serviceWorker.register(new URL('../sw.js',import.meta.url),{scope:new URL('../',import.meta.url).pathname}).catch(error=>console.info('离线页面缓存不可用，本地静态部署仍可离线运行。',error.message));
  }
}catch(error){
  console.error(error);const boot=document.querySelector('#boot');boot.hidden=false;boot.classList.add('error');
  const message=document.createElement('span');message.textContent=`影院未能启动。请使用支持 WebGL2 的现代浏览器，并通过本地 HTTP 服务打开。\n${error.message}`;
  boot.replaceChildren(message);const button=document.createElement('button');button.className='primary-button';button.textContent='重新加载';button.addEventListener('click',()=>location.reload());boot.append(button);
}
