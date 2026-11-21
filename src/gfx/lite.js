import * as THREE from 'three';

// =====================================================================
//  轻量着色（一体机头显用）
//  移动端 GPU 上，全屏 PBR（MeshStandardMaterial）是帧率的头号杀手：
//  实测 Pico Neo 3 上整场景换成无光照材质，帧率从 ~20 升到 ~70。
//  LITE 开启时：标准材质一律换成 Lambert「孪生」材质（漫反射 + 自发光，没有高光 / 环境反射）。
//  孪生材质与原材质共享颜色对象、转发常用标量，所以游戏逻辑照旧改原材质即可。
// =====================================================================

const q = new URLSearchParams(location.search);
export const LITE = q.get('lite') !== '0' && (q.has('lite') || q.has('vr') || /Pico|OculusBrowser|Quest|Wolvic/i.test(navigator.userAgent));

const twins = new WeakMap();
const FORWARD = ['opacity', 'transparent', 'visible', 'emissiveIntensity', 'depthWrite', 'depthTest', 'side'];
const OWN = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function lite(src) {
  if (!src || !src.isMeshStandardMaterial) return src;
  let t = twins.get(src);
  if (t) return t;
  t = new THREE.MeshLambertMaterial();
  THREE.Material.prototype.copy.call(t, src);
  t.userData = src.userData;
  t.color = src.color;
  t.emissive = src.emissive;
  t.map = src.map;
  t.emissiveMap = src.emissiveMap;
  t.alphaMap = src.alphaMap;
  t.flatShading = src.flatShading;
  t.wireframe = src.wireframe;
  t.fog = src.fog;
  // 自定义着色器补丁：只动顶点 / 通用片段的可以原样带过来；湿地面的补丁依赖 PBR 片段，直接放弃
  const key = OWN(src, 'customProgramCacheKey') ? String(src.customProgramCacheKey()) : '';
  if (OWN(src, 'onBeforeCompile') && !key.startsWith('wet-ground')) {
    t.onBeforeCompile = src.onBeforeCompile;
    if (key) t.customProgramCacheKey = () => 'lite-' + src.customProgramCacheKey();
  }
  for (const k of FORWARD) Object.defineProperty(t, k, { get: () => src[k], set: (v) => { src[k] = v; }, enumerable: true, configurable: true });
  twins.set(src, t);
  return t;
}

// 把场景里所有标准材质换成孪生材质（每帧调用也很便宜：只是一次遍历）
export function liteSweep(scene) {
  let n = 0;
  scene.traverse((o) => {
    const m = o.material;
    if (m && m.isMeshStandardMaterial) { o.material = lite(m); n++; }
  });
  return n;
}
