// 所有尺寸、资源上限与画质预设集中在这里，避免模块之间出现不一致的限制。
export const CINEMA = Object.freeze({
  rows: 12, columns: 18, rowStart: -8, rowPitch: 1.65, stepHeight: 0.28,
  seatPitch: 1.18, aisleGap: 1.4, halfWidth: 15.5, back: 14, front: -19,
  screenWidth: 25, screenHeight: 25 / 1.43, screenZ: -22,
  screenCenterY: 10.3, standingHeight: 1.68, seatedHeight: 1.17,
  playerRadius: 0.21, walkSpeed: 3.0, maxDPR: 2,
  // 准星选座的最大有效距离；整厅纵深约 33m，26m 足以覆盖任意座位。
  aimDistance: 26
});
export const RESOURCE_CONFIG = Object.freeze({
  MAX_MODEL_SIZE: 20 * 1024 * 1024,
  MAX_TOTAL_MODEL_STORAGE: 200 * 1024 * 1024,
  MAX_TEXTURE_SIZE: 2048, WARNING_TRIANGLES: 100000,
  HIGH_COMPLEXITY_TRIANGLES: 500000, WARNING_MESH_COUNT: 30,
  WARNING_MATERIAL_COUNT: 15, MAX_DEPENDENCIES: 80,
  MAX_VERTICES: 3000000, MAX_NODES: 10000
});
export const QUALITY = Object.freeze({
  // screenLights：银幕溢光用几盏灯近似整块银幕的面积光。屏幕是熄灯后影厅里唯一的光源，
  // 因此 LOW 也保留一盏，否则整间厅会全黑；画质越高铺得越均匀。
  LOW: { dpr: 1, shadows: false, glow: true, ssao: false, bloom: false, post: false, screenLights: 1 },
  MEDIUM: { dpr: 1.5, shadows: true, glow: true, ssao: false, bloom: false, post: true, screenLights: 3 },
  HIGH: { dpr: 2, shadows: true, glow: true, ssao: true, bloom: true, post: true, screenLights: 5 }
});
// 入场后的选座等待时间，可在 0–180 秒之间自由设置；0 表示入场后立即由影院安排座位。
export const COUNTDOWN_RANGE = Object.freeze({ min: 0, max: 180, step: 5, default: 60 });
export const DEFAULT_SETTINGS = {
  quality: 'AUTO', renderScale: 1, sensitivity: 0.9, damping: 12,
  breathing: false, master: 0.8, movie: 1, ambient: 0.28,
  bass: 1, spatial: true, channels: 'auto', channelLayout:'standard', fit: 'contain',
  glow: true, ssao: true, bloom: true, shadows: true,
  speakers: false, seatNumbers: false, fullLight: false, audioDebug: false,
  countdown: COUNTDOWN_RANGE.default
};
export const LIGHTING_PRESETS = Object.freeze({
  ENTRY: { ceiling: .7, wall: .7, step: 1, exit: .2, screen: 0, ambient: .6 },
  SEATING: { ceiling: .7, wall: .7, step: 1, exit: .2, screen: .5, ambient: .6 },
  PRE_SHOW: { ceiling: 0, wall: .08, step: .25, exit: .12, screen: 0, ambient: .08 },
  MOVIE: { ceiling: 0, wall: .16, step: .28, exit: .12, screen: 1, ambient: .45 },
  PAUSED: { ceiling: .04, wall: .35, step: .5, exit: .15, screen: 1, ambient: .2 },
  FINISHED: { ceiling: .7, wall: .7, step: 1, exit: .2, screen: .5, ambient: .6 },
  FULL_LIGHT: { ceiling: 1, wall: 1, step: 1, exit: .2, screen: 1, ambient: .8 }
});
