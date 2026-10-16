// 仅缓存此项目的静态壳；绝不缓存或代理影片 URL、外部模型或跨域请求。
const PREFIX='ic-shell:'+new URL(self.registration.scope).pathname+'|';
const CACHE=PREFIX+'8b27d05ec6a1';
const FILES=[
  "./assets/first-light.mp4",
  "./assets/icons/favicon.svg",
  "./css/cinema.css",
  "./css/controls.css",
  "./css/lobby.css",
  "./css/main.css",
  "./index.html",
  "./js/assets/ModelAssetManager.js",
  "./js/assets/ModelLoader.js",
  "./js/assets/ModelPreview.js",
  "./js/assets/SceneObjectFactory.js",
  "./js/audio/ChannelMapper.js",
  "./js/audio/CinemaAudioEngine.js",
  "./js/audio/channel-probe.js",
  "./js/camera/FirstPersonController.js",
  "./js/core/CinemaApp.js",
  "./js/core/CinemaStateManager.js",
  "./js/core/Config.js",
  "./js/core/Renderer.js",
  "./js/lighting/CinemaLightingManager.js",
  "./js/lighting/ScreenGlow.js",
  "./js/main.js",
  "./js/scene/Architecture.js",
  "./js/scene/CinemaScene.js",
  "./js/scene/LobbyScene.js",
  "./js/scene/Primitives.js",
  "./js/scene/Screen.js",
  "./js/scene/Seats.js",
  "./js/scene/Speakers.js",
  "./js/seating/SeatManager.js",
  "./js/seating/SeatTransition.js",
  "./js/ui/AssetUI.js",
  "./js/ui/ControlBar.js",
  "./js/ui/LobbyUI.js",
  "./js/ui/SettingsUI.js",
  "./js/utils/MathUtils.js",
  "./js/utils/PerformanceMonitor.js",
  "./js/utils/Storage.js",
  "./js/video/VideoManager.js",
  "./lib/three/controls/PointerLockControls.js",
  "./lib/three/libs/basis/basis_transcoder.js",
  "./lib/three/libs/basis/basis_transcoder.wasm",
  "./lib/three/libs/draco/gltf/draco_decoder.js",
  "./lib/three/libs/draco/gltf/draco_decoder.wasm",
  "./lib/three/libs/draco/gltf/draco_wasm_wrapper.js",
  "./lib/three/libs/ktx-parse.module.js",
  "./lib/three/libs/meshopt_decoder.module.js",
  "./lib/three/libs/zstddec.module.js",
  "./lib/three/loaders/DRACOLoader.js",
  "./lib/three/loaders/GLTFLoader.js",
  "./lib/three/loaders/HDRLoader.js",
  "./lib/three/loaders/KTX2Loader.js",
  "./lib/three/loaders/RGBELoader.js",
  "./lib/three/math/ColorSpaces.js",
  "./lib/three/math/SimplexNoise.js",
  "./lib/three/postprocessing/EffectComposer.js",
  "./lib/three/postprocessing/MaskPass.js",
  "./lib/three/postprocessing/OutputPass.js",
  "./lib/three/postprocessing/Pass.js",
  "./lib/three/postprocessing/RenderPass.js",
  "./lib/three/postprocessing/SSAOPass.js",
  "./lib/three/postprocessing/ShaderPass.js",
  "./lib/three/postprocessing/UnrealBloomPass.js",
  "./lib/three/shaders/CopyShader.js",
  "./lib/three/shaders/LuminosityHighPassShader.js",
  "./lib/three/shaders/OutputShader.js",
  "./lib/three/shaders/SSAOShader.js",
  "./lib/three/three.core.js",
  "./lib/three/three.module.js",
  "./lib/three/utils/BufferGeometryUtils.js",
  "./lib/three/utils/WorkerPool.js",
  "./tests/browser-tests.html",
  "./tests/browser-tests.js"
];
const URLS=FILES.map(p=>new URL(p,self.registration.scope).href);
const CORE=new Set(URLS);
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(URLS.map(url=>new Request(url,{cache:'reload',credentials:'same-origin'})));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url),scope=new URL(self.registration.scope);
  if(url.origin!==scope.origin)return;
  let canonical=url.origin+url.pathname;
  if(canonical===scope.href)canonical=new URL('index.html',scope).href;
  if(!CORE.has(canonical))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);return await cache.match(canonical)||fetch(event.request);
  })());
});
