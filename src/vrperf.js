import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LITE, liteSweep } from './gfx/lite.js';

// =====================================================================
//  VR 性能整备
//  头显浏览器的瓶颈是 draw call（两只眼各画一遍，CPU 单核吃紧），不是分辨率。
//  · 颜色不同、其余参数相同的材质 → 颜色烘进顶点色，合成一个网格
//  · 刚性小组件（灯笼、枪）在本地空间里按材质合并
//  · 骨骼角色打开视锥剔除（给一个宽松的包围球）
//  · 只留极少数点光源，去掉环境反射
// =====================================================================

const DEFAULT_OBC = THREE.Material.prototype.onBeforeCompile;
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();

const texKey = (m) => ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap', 'envMap', 'lightMap']
  .map((k) => (m[k] ? m[k].uuid : '')).join(',');

// 可以互相合并的材质给出相同的键；颜色不进键（改由顶点色承担）
function mergeKey(m) {
  if (Array.isArray(m)) return null;
  const plain = m.onBeforeCompile === DEFAULT_OBC && !m.isShaderMaterial;
  const colorable = plain && (m.isMeshStandardMaterial || m.isMeshBasicMaterial || m.isMeshLambertMaterial) && m.color;
  if (!colorable) return 'u:' + m.uuid;
  return [m.type, m.side, m.transparent, m.opacity, m.alphaTest, m.depthWrite, m.depthTest, m.fog, m.blending, m.toneMapped, m.flatShading, m.wireframe,
    m.roughness, m.metalness, m.emissive ? m.emissive.getHex() : '', m.emissiveIntensity, m.envMapIntensity, m.premultipliedAlpha, m.polygonOffset, m.polygonOffsetFactor, texKey(m)].join('|');
}

function prepGeometry(mesh, matrix) {
  const src = mesh.geometry;
  if (!src.getAttribute('position') || src.morphAttributes.position) return null;
  const g = src.index ? src.toNonIndexed() : src.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const n = g.getAttribute('position').count;
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  const mat = mesh.material;
  const c = mat.color || new THREE.Color(1, 1, 1);
  const old = mat.vertexColors ? g.getAttribute('color') : null;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r * (old ? old.getX(i) : 1);
    col[i * 3 + 1] = c.g * (old ? old.getY(i) : 1);
    col[i * 3 + 2] = c.b * (old ? old.getZ(i) : 1);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (matrix) g.applyMatrix4(matrix);
  g.clearGroups();
  return g;
}

const _matCache = new Map();
function mergedMaterial(key, sample) {
  if (key.startsWith('u:')) return sample;
  let m = _matCache.get(key);
  if (!m) {
    m = sample.clone();
    m.color.set(0xffffff);
    m.vertexColors = true;
    _matCache.set(key, m);
  }
  return m;
}

function buildMerged(buckets, parent, { staticMatrix = false } = {}) {
  let made = 0;
  for (const [key, b] of buckets) {
    if (!b.geos.length) continue;
    const unique = key.startsWith('u:');
    // 独占材质：不带顶点色（材质自己的颜色照旧生效）
    if (unique) for (const g of b.geos) g.deleteAttribute('color');
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (!geo) continue;
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, mergedMaterial(key.split('#')[0], b.mat));
    mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.renderOrder = b.order;
    if (staticMatrix) { mesh.matrixAutoUpdate = false; mesh.updateMatrix(); }
    mesh.userData.vrMerged = true;
    parent.add(mesh);
    made++;
  }
  return made;
}

const bucketOf = (buckets, mesh) => {
  const k = mergeKey(mesh.material);
  if (!k) return null;
  const key = `${k}#${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}${mesh.renderOrder}`;
  let b = buckets.get(key);
  if (!b) { b = { mat: mesh.material, cast: mesh.castShadow, recv: mesh.receiveShadow, order: mesh.renderOrder, geos: [] }; buckets.set(key, b); }
  return b;
};

// World.bakeStatic 已按材质合过一遍，但大量材质只是颜色不同：再合一遍
export function rebakeStatic(scene) {
  const baked = scene.children.filter((o) => o.isMesh && !o.matrixAutoUpdate && !o.isSkinnedMesh && !o.isInstancedMesh && !o.userData.vrMerged && !o.userData.dynamic && o.visible && !Array.isArray(o.material));
  const buckets = new Map();
  const victims = [];
  for (const o of baked) {
    o.updateMatrixWorld(true);
    const b = bucketOf(buckets, o);
    const g = b && prepGeometry(o, o.matrixWorld);
    if (!g) continue;
    b.geos.push(g);
    victims.push(o);
  }
  for (const v of victims) { scene.remove(v); v.geometry.dispose(); }
  const made = buildMerged(buckets, scene, { staticMatrix: true });
  return { before: victims.length, after: made };
}

// 刚性小组件：子网格在 root 的本地空间里合并（root 自身照常运动）
export function collapseRigid(root, skip = null) {
  if (root.userData.vrCollapsed) return 0;
  root.userData.vrCollapsed = true;
  root.updateWorldMatrix(true, true);
  _inv.copy(root.matrixWorld).invert();
  const buckets = new Map();
  const victims = [];
  const visit = (o) => {
    if (o === skip) return;
    if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && o.visible && !Array.isArray(o.material) && !o.userData.vrMerged) {
      const b = bucketOf(buckets, o);
      const g = b && prepGeometry(o, _m.multiplyMatrices(_inv, o.matrixWorld));
      if (g) { b.geos.push(g); victims.push(o); }
    }
    for (const c of o.children) visit(c);
  };
  for (const c of root.children) visit(c);
  if (victims.length < 2) return 0;
  for (const v of victims) {
    const parent = v.parent;
    for (const ch of [...v.children]) parent.attach(ch);
    parent.remove(v);
  }
  buildMerged(buckets, root);
  return victims.length;
}

// 骨骼角色：模板几何体挂一个宽松的包围球，打开视锥剔除（背后的敌人不再提交绘制）
const CULL_SPHERE = new THREE.Sphere(new THREE.Vector3(0, 1.1, 0), 3.2);
export function cullSkinned(mesh) {
  if (mesh.userData.vrCull) return;
  mesh.userData.vrCull = true;
  mesh.geometry.boundingSphere = CULL_SPHERE.clone();
  mesh.boundingSphere = null;
  mesh.frustumCulled = true;
}

export class VRPerf {
  constructor(game) {
    this.g = game;
    this.done = false;
    this.t = 0;
    this.stats = {};
  }

  // 进入 VR 时做一次的重活
  setup() {
    const g = this.g;
    if (LITE) liteSweep(g.scene);
    if (LITE && !this.skyBaker && g.world.sky) this.skyBaker = new SkyBaker(g.renderer, g.world.sky);
    if (!this.done) {
      this.done = true;
      this.stats.static = rebakeStatic(g.scene);
    }
    this.sweep();
  }

  // 每秒巡一遍：新出现的灯笼 / 枪 / 角色 / 点光源
  sweep() {
    const g = this.g;
    // 点光源全部关掉：每多一盏，所有受光材质的每个像素都要多算一遍（灯笼靠自发光照样亮）
    let rigid = 0, guns = 0, skinned = 0, lights = 0;
    const todo = [];
    g.scene.traverse((o) => {
      if (o.isPointLight && o.visible) { o.visible = false; o.userData.vrOff = true; lights++; }
      else if (o.isSkinnedMesh && !o.userData.vrCull) { cullSkinned(o); skinned++; }
      else if (!o.userData.vrCollapsed && (o.userData.rigid || o.userData.gun)) todo.push(o);
    });
    for (const o of todo) {
      if (o.userData.rigid) { if (collapseRigid(o)) rigid++; } else { o.userData.vrCollapsed = true; if (collapseRigid(o.userData.gun, o.userData.spin || null)) guns++; }
    }
    if (g.scene.environment) { this.env = g.scene.environment; g.scene.environment = null; }
    this.stats.last = { rigid, guns, skinned, lights };
  }

  update(dt) {
    if (LITE) liteSweep(this.g.scene);
    this.skyBaker?.update(dt);
    this.t -= dt;
    if (this.t <= 0) { this.t = 1; this.sweep(); }
  }

  // 退出 VR：恢复灯光与环境反射（网格合并不影响外观，保留）
  restore() {
    const g = this.g;
    g.scene.traverse((o) => { if (o.userData.vrOff) { o.visible = true; o.userData.vrOff = false; } });
    if (this.env && !g.scene.environment) g.scene.environment = this.env;
    this.env = null;
  }
}

// =====================================================================
//  天空烘焙
//  程序化天空（星空 + 两层 5 阶 fbm 流云）每像素十来次噪声采样，铺满半个画面，
//  在头显上独占三成帧时间。流云走得极慢 —— 每隔几秒把它画进一张等距柱状贴图，
//  平时只做一次贴图采样；月亮圆盘和闪电另在显示着色器里实时补上，保持锐利 / 即时。
// =====================================================================
export class SkyBaker {
  constructor(renderer, sky) {
    this.r = renderer;
    this.sky = sky;
    this.src = sky.material;
    const U = this.src.uniforms;
    this.rt = new THREE.WebGLRenderTarget(2048, 1024, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.rt.texture.wrapS = THREE.RepeatWrapping;
    // 烘焙：与球体 UV 一致的方向映射；去掉色调映射 / 色彩空间（留到显示时做）、去掉月盘与闪电
    const frag = this.src.fragmentShader
      .replace('varying vec3 vDir;', 'varying vec2 vUv;')
      .replace('vec3 d = normalize(vDir);', 'float th = (1.0 - vUv.y) * 3.14159265; float ph = vUv.x * 6.2831853; vec3 d = vec3(-cos(ph) * sin(th), cos(th), sin(ph) * sin(th));')
      .replace('col = mix(col, moonCol, disk);', '')
      .replace(/col \+= vec3\(0\.55, 0\.6, 0\.8\) \* flash[^;]*;/, '')
      .replace('#include <tonemapping_fragment>', '')
      .replace('#include <colorspace_fragment>', '');
    this.bakeMat = new THREE.ShaderMaterial({
      uniforms: U, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: frag,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bakeMat);
    this.quad.frustumCulled = false;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.show = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      // 带上原天空的全部 uniform：World 仍通过 sky.material.uniforms 改颜色 / 时间
      uniforms: { ...U, tSky: { value: this.rt.texture } },
      vertexShader: 'varying vec3 vDir; varying vec2 vUv; void main(){ vDir = normalize(position); vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
      fragmentShader: `
        uniform sampler2D tSky; uniform vec3 moonDir; uniform vec3 moonColor; uniform float moonSize; uniform float eclipse; uniform float flash;
        varying vec3 vDir; varying vec2 vUv;
        void main(){
          vec3 d = normalize(vDir);
          vec3 col = texture2D(tSky, vUv).rgb;
          float md = dot(d, moonDir);
          float disk = smoothstep(cos(moonSize * 1.04), cos(moonSize * 0.96), md);
          col = mix(col, mix(moonColor, moonColor * 0.05, eclipse), disk);
          col += vec3(0.55, 0.6, 0.8) * flash * 0.7 * smoothstep(-0.05, 0.3, d.y);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.t = 0;
    this.sig = '';
    sky.material = this.show;
  }

  _sig() {
    const u = this.src.uniforms;
    return [u.top.value.getHex(), u.horizon.value.getHex(), u.cloudColor.value.getHex(), u.moonColor.value.getHex(), u.eclipse.value.toFixed(2), u.moonSize.value, u.moonDir.value.x.toFixed(3), u.moonDir.value.y.toFixed(3)].join();
  }

  update(dt) {
    this.t -= dt;
    const sig = this._sig();
    if (this.t > 0 && sig === this.sig) return;
    this.t = 4; this.sig = sig;
    const r = this.r;
    const old = r.getRenderTarget();
    const xr = r.xr.enabled;
    r.xr.enabled = false;
    r.setRenderTarget(this.rt);
    r.render(this.quad, this.cam);
    r.setRenderTarget(old);
    r.xr.enabled = xr;
  }
}
