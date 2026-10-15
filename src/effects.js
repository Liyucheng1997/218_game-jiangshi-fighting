import * as THREE from 'three';
import { softDotTexture, sigilTexture, canvasTexture, noiseTexture } from './gfx/textures.js';

// =====================================================================
//  特效：单 draw call 的 GPU 点粒子（加法 / 普通两套）+ 冲击环 + 雷电 + 曳光
//  粒子分三类：0 柔光点 · 1 火焰（噪声溶蚀 + 白热内核 + 随寿命降温）· 2 烟尘（翻卷 + 溶散）
//  灯光池固定数量，避免灯光增减导致着色器重编译。
// =====================================================================

export const P_SOFT = 0, P_FLAME = 1, P_SMOKE = 2;

const PART_VERT = `
  attribute float size; attribute float alpha; attribute vec3 color; attribute vec3 info;
  varying vec3 vColor; varying float vAlpha; varying vec3 vInfo;
  uniform float scale;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // 贴近镜头的粒子淡出（第一人称枪口硝烟、扫过镜头的火星不会糊满屏幕）
    vColor = color; vAlpha = alpha * smoothstep(0.3, 1.1, -mv.z); vInfo = info;
    gl_PointSize = size * scale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;

const PART_FRAG = `
  uniform sampler2D map; uniform sampler2D noise;
  varying vec3 vColor; varying float vAlpha; varying vec3 vInfo;
  void main(){
    float kind = vInfo.x, seed = vInfo.y, age = vInfo.z;
    if (kind < 0.5) {
      float a0 = texture2D(map, gl_PointCoord).a * vAlpha;
      if (a0 < 0.01) discard;
      gl_FragColor = vec4(vColor, a0);
      return;
    }
    // 每个粒子随机朝向 + 缓慢自旋，避免重复
    float ang = seed * 6.2831 + age * (seed - 0.5) * 4.0;
    vec2 c = gl_PointCoord - 0.5;
    float cs = cos(ang), sn = sin(ang);
    vec2 r = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
    float d = length(c) * 2.0;
    vec2 o = vec2(seed * 7.13, fract(seed * 3.71) * 5.0);
    float n1 = texture2D(noise, r * 0.85 + o + vec2(0.0, age * 0.55)).r;
    float n2 = texture2D(noise, r * 1.9 + o.yx + vec2(age * 0.25, age * 0.8)).g;
    float n = n1 * 0.62 + n2 * 0.38;
    float a;
    vec3 col;
    if (kind < 1.5) {
      // 火焰：形状 = 径向衰减 × 噪声；阈值随寿命抬升 → 火舌碎裂、收缩；内核白热、外缘暗红
      float radial = 1.0 - smoothstep(0.15, 1.0, d);
      float shape = radial * (0.5 + n * 1.0);
      float th = mix(0.16, 0.9, age);
      a = smoothstep(th, th + 0.2, shape);
      float heat = clamp((shape - th) * 2.4 + 0.25 - age * 0.55, 0.0, 1.0);
      col = vColor * (0.35 + heat * 0.95) + vec3(1.0, 0.82, 0.5) * pow(heat, 4.0) * 0.55;
      col = mix(col, vColor * vec3(0.55, 0.22, 0.12), smoothstep(0.55, 1.0, age));
    } else {
      // 烟尘：柔软翻卷的团块，边缘随寿命被噪声蚀散；中心略亮模拟体积感
      float radial = 1.0 - smoothstep(0.0, 1.0, d);
      float shape = radial * (0.4 + n * 0.95);
      float th = mix(0.1, 0.62, age * age);
      a = smoothstep(th, th + 0.38, shape) * smoothstep(0.0, 0.06, age);
      col = vColor * (0.7 + n * 0.55 + radial * 0.2);
    }
    a *= vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
  }`;

class Particles {
  constructor(scene, max, additive) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.info = new Float32Array(max * 3);   // kind, seed, age
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.a0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('info', new THREE.BufferAttribute(this.info, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDotTexture() }, noise: { value: noiseTexture() }, scale: { value: 600 } },
      vertexShader: PART_VERT,
      fragmentShader: PART_FRAG,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mat = mat;
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, r, g, b, size, life, grav = 0, drag = 0, grow = 0, alpha = 1, kind = P_SOFT) {
    let i = this.n;
    if (i >= this.max) i = Math.floor(Math.random() * this.max);
    else this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.info[i * 3] = kind; this.info[i * 3 + 1] = Math.random(); this.info[i * 3 + 2] = 0;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life;
    this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow; this.a0[i] = alpha; this.alpha[i] = alpha;
  }

  update(dt) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        if (i !== n) this._copy(n, i);
        i--;
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02 && this.grav[i] > 0) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.2; this.vel[i * 3] *= 0.6; this.vel[i * 3 + 2] *= 0.6; }
      this.size[i] = Math.max(0.005, this.size[i] + this.grow[i] * dt);
      const k = this.life[i] / this.maxLife[i];
      this.info[i * 3 + 2] = 1 - k;
      // 火焰 / 烟尘的消散交给着色器溶蚀，只在最后收一点；柔光点按寿命淡出
      this.alpha[i] = this.a0[i] * Math.min(1, k * (this.info[i * 3] > 0.5 ? 6 : 2.5));
    }
    this.n = n;
    this.geo.setDrawRange(0, n);
    for (const a of ['position', 'color', 'size', 'alpha', 'info']) this.geo.attributes[a].needsUpdate = true;
  }

  _copy(from, to) {
    for (let k = 0; k < 3; k++) {
      this.pos[to * 3 + k] = this.pos[from * 3 + k];
      this.vel[to * 3 + k] = this.vel[from * 3 + k];
      this.col[to * 3 + k] = this.col[from * 3 + k];
      this.info[to * 3 + k] = this.info[from * 3 + k];
    }
    this.size[to] = this.size[from]; this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from];
    this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from]; this.grow[to] = this.grow[from];
    this.a0[to] = this.a0[from]; this.alpha[to] = this.alpha[from];
  }

  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

const rs = (s = 1) => (Math.random() - 0.5) * 2 * s;
const _c = new THREE.Color();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

// 地面血迹 / 灼痕纹理（程序绘制的溅射形状）
function splatTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const R = Math.random;
    const blob = (x, y, r, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.75, `rgba(255,255,255,${a * 0.9})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
    blob(128, 128, 70, 0.95);
    for (let i = 0; i < 14; i++) { const a = R() * Math.PI * 2, d = 40 + R() * 60; blob(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 10 + R() * 26, 0.85); }
    for (let i = 0; i < 30; i++) { const a = R() * Math.PI * 2, d = 80 + R() * 40; blob(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 2 + R() * 6, 0.8); }
  });
}

// 预警纹理着色器：外圈描边 + 由内向外随进度填充，越接近命中越亮
const TELE_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const TELE_FRAG = `
uniform vec3 color; uniform float progress; uniform float opacity; uniform float shape; uniform float time;
varying vec2 vUv;
void main(){
  float a;
  if (shape < 0.5) {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float edge = smoothstep(0.9, 0.97, r) * (1.0 - smoothstep(0.985, 1.0, r));
    float fill = step(r, progress);
    float front = smoothstep(progress - 0.06, progress, r) * fill;
    float rings = 0.5 + 0.5 * sin(r * 28.0 - time * 6.0);
    a = edge * 0.95 + fill * (0.16 + 0.1 * rings) + front * 0.55 + 0.07;
  } else {
    float ex = abs(vUv.x * 2.0 - 1.0);
    float edge = smoothstep(0.82, 0.94, ex);
    float fill = step(vUv.y, progress);
    float front = smoothstep(progress - 0.05, progress, vUv.y) * fill;
    float arrows = step(0.6, fract(vUv.y * 10.0 - time * 2.0 + ex * 0.6));
    a = edge * 0.9 + fill * (0.14 + 0.08 * arrows) + front * 0.5 + 0.06;
  }
  gl_FragColor = vec4(color * 1.6, clamp(a, 0.0, 1.0) * opacity);
}`;

const PILLAR_VERT = `
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const PILLAR_FRAG = `
uniform vec3 color; uniform float opacity; uniform float time; uniform sampler2D noise;
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main(){
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float core = pow(facing, 2.2);
  float vert = smoothstep(0.0, 0.05, vUv.y) * (1.0 - smoothstep(0.25, 1.0, vUv.y));
  float streak = texture2D(noise, vec2(vUv.x * 4.0, vUv.y * 0.5 - time * 1.4)).r;
  float a = core * vert * (0.35 + streak * 0.9) * opacity;
  gl_FragColor = vec4(color * (1.2 + streak * 0.8), a);
}`;

// 冲击环：细亮前沿 + 向内拖出的柔光（w = 前沿宽度，按世界尺寸换算）
const RING_FRAG = `
uniform vec3 color; uniform float opacity; uniform float w;
varying vec2 vUv;
void main(){
  float r = length(vUv * 2.0 - 1.0);
  if (r > 1.0) discard;
  float rc = 1.0 - w;
  float edge = 1.0 - smoothstep(0.0, w, abs(r - rc));
  float inner = smoothstep(rc - w * 7.0, rc, r) * step(r, rc);
  gl_FragColor = vec4(color * 1.4, (edge + inner * inner * 0.35) * opacity);
}`;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.add = new Particles(scene, 4000, true);
    this.norm = new Particles(scene, 2500, false);
    this.meshes = [];   // { obj, life, maxLife, update }
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffa040, 0, 12, 1.6);
      scene.add(l);
      this.lights.push({ l, t: 0, dur: 1, peak: 0 });
    }
    // 第 4 盏留作过场主光（首领登场 / 伏诛 / 对白特写），总灯数不变，不触发着色器重编译
    this.keyL = this.lights.pop().l;
    this._key = { t: 0, dur: 0, peak: 0 };
    this._discGeo = new THREE.CircleGeometry(1, 48);
    this._tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 5, 1, true);
    this._tracerGeo.rotateX(Math.PI / 2);
    this._tracerGeo.translate(0, 0, 0.5);
    this._baguaTex = sigilTexture();
    this._glowTex = softDotTexture();
    // 闪电 / 光束横截面：中心白热、两侧柔和衰减
    this._beamTex = canvasTexture(64, 4, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.32, 'rgba(255,255,255,0.28)');
      gr.addColorStop(0.47, 'rgba(255,255,255,1)'); gr.addColorStop(0.53, 'rgba(255,255,255,1)');
      gr.addColorStop(0.68, 'rgba(255,255,255,0.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    this._casingGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.035, 6);
    this._casingMat = new THREE.MeshStandardMaterial({ color: 0xc9a437, roughness: 0.3, metalness: 0.9 });
    this.casings = [];
    this.emitters = [];
    this.time = 0;
    this.gore = true;
    // 地面持久贴花：血泊 / 灵液 / 焦痕（环形缓冲，单 draw call）
    this.DECALS = 220;
    const dgeo = new THREE.PlaneGeometry(1, 1);
    dgeo.rotateX(-Math.PI / 2);
    this.decals = new THREE.InstancedMesh(dgeo, new THREE.MeshStandardMaterial({
      map: splatTexture(), transparent: true, depthWrite: false, roughness: 0.22, metalness: 0.0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }), this.DECALS);
    this.decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.decals.count = 0;
    this.decals.receiveShadow = true;
    this.decals.frustumCulled = false;
    for (let i = 0; i < this.DECALS; i++) this.decals.setColorAt(i, _c.set(0x000000));
    this._decalI = 0;
    scene.add(this.decals);
    // 飞出的清朝官帽（爆头）
    const hat = new THREE.Group();
    const hm = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.85 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.11, 0.05, 20), hm);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hm);
    dome.position.y = 0.02;
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc0302a, roughness: 0.3 }));
    bead.position.y = 0.13;
    const fu = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.13), new THREE.MeshStandardMaterial({ color: 0xe8c64e, side: THREE.DoubleSide, roughness: 0.9 }));
    fu.position.set(0, -0.06, 0.112);
    hat.add(brim, dome, bead, fu);
    hat.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this._hatProto = hat;
    this._teleGeo = { circle: new THREE.CircleGeometry(1, 64), rect: new THREE.PlaneGeometry(1, 1), cone: null };
  }

  // ---------------------------------------------------------------- 持久贴花
  decal(p, size, color = 0x4a0606, rot = Math.random() * Math.PI * 2) {
    if (!this.gore && color !== 0x050403) color = 0x1a1a1a;
    const i = this._decalI;
    this._decalI = (this._decalI + 1) % this.DECALS;
    _e.set(0, rot, 0); _q.setFromEuler(_e);
    _s.set(size * (0.8 + Math.random() * 0.5), 1, size * (0.8 + Math.random() * 0.5));
    _m4.compose(new THREE.Vector3(p.x, 0.018 + (i % 7) * 0.0006, p.z), _q, _s);
    this.decals.setMatrixAt(i, _m4);
    this.decals.setColorAt(i, _c.set(color));
    this.decals.count = Math.max(this.decals.count, i + 1);
    this.decals.instanceMatrix.needsUpdate = true;
    if (this.decals.instanceColor) this.decals.instanceColor.needsUpdate = true;
  }

  clearDecals() { this.decals.count = 0; this._decalI = 0; }

  // ---------------------------------------------------------------- 预警
  telegraphMesh(shape, color, extra = {}) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, progress: { value: 0 }, opacity: { value: 0 }, shape: { value: shape === 'circle' || shape === 'cone' ? 0 : 1 }, time: { value: 0 } },
      vertexShader: TELE_VERT, fragmentShader: TELE_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    let geo = this._teleGeo[shape];
    if (shape === 'cone') geo = new THREE.CircleGeometry(1, 32, Math.PI / 2 - extra.angle, extra.angle * 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.ownGeo = shape === 'cone';
    mesh.renderOrder = 3;
    return mesh;
  }

  // ---------------------------------------------------------------- 定时发射器
  emit(dur, fn) { this.emitters.push({ t: 0, dur, fn }); }

  // 断颈喷血
  fountain(p, dir = null, color = [0.42, 0.02, 0.03], dur = 0.55) {
    const pos = p.clone();
    this.emit(dur, (dt, k) => {
      const n = Math.ceil(dt * 120 * (1 - k));
      for (let i = 0; i < n; i++) this.norm.emit(pos.x, pos.y, pos.z, rs(0.8) + (dir ? dir.x * 0.8 : 0), 3 + Math.random() * 3 * (1 - k), rs(0.8) + (dir ? dir.z * 0.8 : 0), color[0], color[1], color[2], 0.05 + Math.random() * 0.04, 0.7, 11, 0.3);
    });
  }

  // 爆头飞帽
  hatFly(p, vel) {
    const h = this._hatProto.clone();
    h.userData.shared = true;
    h.position.copy(p);
    this.scene.add(h);
    const v = vel.clone();
    const spin = new THREE.Vector3(rs(14), rs(14), rs(14));
    let rest = false;
    this._addMesh(h, 6, (k, dt) => {
      if (!rest) {
        v.y -= 13 * dt;
        h.position.addScaledVector(v, dt);
        h.rotation.x += spin.x * dt; h.rotation.y += spin.y * dt; h.rotation.z += spin.z * dt;
        if (h.position.y < 0.06) {
          h.position.y = 0.06;
          if (Math.abs(v.y) < 1.2) { rest = true; h.rotation.set(Math.random() < 0.5 ? 0 : Math.PI, Math.random() * 6, 0); if (h.rotation.x) h.position.y = 0.1; }
          else { v.y = -v.y * 0.35; v.x *= 0.5; v.z *= 0.5; spin.multiplyScalar(0.5); }
        }
      }
      if (k > 0.85) h.scale.setScalar(Math.max(0.01, (1 - k) / 0.15));
    });
  }

  // 溶解余烬（尸体焚化）
  embersBurst(p, color, n = 10, spread = 0.4) {
    for (let i = 0; i < n; i++) this.add.emit(p.x + rs(spread), p.y + rs(spread * 0.6), p.z + rs(spread), rs(0.6), 0.8 + Math.random() * 1.6, rs(0.6), color.r, color.g, color.b, 0.06 + Math.random() * 0.08, 0.7 + Math.random() * 0.6, -0.4, 0.6, -0.05);
  }

  // 黑气旋涡（玄阴子尸化 / 召唤）
  darkSwirl(p, color = [0.6, 0.2, 1], n = 60, r = 2) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, rr = r * (0.4 + Math.random() * 0.6);
      this.add.emit(p.x + Math.cos(a) * rr, p.y + Math.random() * 2, p.z + Math.sin(a) * rr, -Math.cos(a) * rr * 1.2 - Math.sin(a) * 2, 1 + Math.random() * 2, -Math.sin(a) * rr * 1.2 + Math.cos(a) * 2, color[0], color[1], color[2], 0.18, 0.9, -0.5, 1.2, 0.2, 0.8);
    }
  }

  // 落地碎石
  debris(p, n = 20, s = 1) {
    for (let i = 0; i < n; i++) this.norm.emit(p.x + rs(0.5 * s), 0.15, p.z + rs(0.5 * s), rs(5 * s), 3 + Math.random() * 5 * s, rs(5 * s), 0.25, 0.22, 0.2, 0.06 + Math.random() * 0.08, 1.2, 14, 0.2);
    this.dust(p, 10);
  }

  setViewportHeight(h) {
    this.add.mat.uniforms.scale.value = h * 0.8;
    this.norm.mat.uniforms.scale.value = h * 0.8;
  }

  // 过场主光：0.4 秒淡入、保持、最后 25% 淡出
  keyLight(pos, color = 0xffe0c0, peak = 30, dur = 3, dist = 14) {
    this.keyL.position.copy(pos);
    this.keyL.color.set(color);
    this.keyL.distance = dist;
    Object.assign(this._key, { t: 0, dur, peak });
  }

  keyOff() { this._key.t = this._key.dur; }

  flashLight(pos, color = 0xffa040, peak = 40, dur = 0.25, dist = 12) {
    let slot = this.lights.find((s) => s.t >= s.dur) || this.lights.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    slot.l.position.copy(pos);
    slot.l.color.set(color);
    slot.l.distance = dist;
    slot.t = 0; slot.dur = dur; slot.peak = peak;
  }

  // ---------------------------------------------------------------- 粒子预设
  blood(p, n = 12, dir = null) {
    for (let i = 0; i < n; i++) {
      const s = 1.5 + Math.random() * 2.5;
      const vx = rs(1) * s + (dir ? dir.x * 2 : 0), vz = rs(1) * s + (dir ? dir.z * 2 : 0);
      this.norm.emit(p.x, p.y, p.z, vx, Math.random() * 3, vz, 0.35 + Math.random() * 0.15, 0.02, 0.03, 0.06 + Math.random() * 0.05, 0.5 + Math.random() * 0.3, 9, 0.5);
    }
  }
  bigBlood(p) { this.blood(p, 24); this.puff(p, _c.setRGB(0.25, 0.05, 0.05), 4, false); }
  ichor(p, color) { for (let i = 0; i < 10; i++) this.add.emit(p.x, p.y, p.z, rs(2), Math.random() * 2.5, rs(2), color.r, color.g, color.b, 0.08, 0.4, 6, 1); }

  sparks(p, n = 8) {
    for (let i = 0; i < n; i++) this.add.emit(p.x, p.y, p.z, rs(4), Math.random() * 4, rs(4), 1, 0.8, 0.4, 0.05, 0.25 + Math.random() * 0.15, 12, 1);
    this.norm.emit(p.x, p.y, p.z, 0, 0.5, 0, 0.5, 0.5, 0.5, 0.3, 0.5, 0, 1, 0.8, 0.4);
  }

  dust(p, n = 6) {
    for (let i = 0; i < n; i++) this.norm.emit(p.x + rs(0.5), 0.2, p.z + rs(0.5), rs(1.5), 0.5 + Math.random(), rs(1.5), 0.45, 0.42, 0.36, 0.55, 1.0, -0.3, 2, 1.4, 0.42, P_SMOKE);
  }

  // 翻卷的烟团（normal 混合，深色）
  smoke(p, n = 6, spread = 0.5, color = [0.08, 0.07, 0.065], size = 0.7, life = 1.6, alpha = 0.55) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      this.norm.emit(p.x + Math.cos(a) * r, p.y + Math.random() * 0.4, p.z + Math.sin(a) * r, Math.cos(a) * r * 0.8 + rs(0.3), 0.8 + Math.random() * 1.2, Math.sin(a) * r * 0.8 + rs(0.3), color[0], color[1], color[2], size * (0.7 + Math.random() * 0.6), life * (0.7 + Math.random() * 0.6), -0.15, 1.0, size * 1.2, alpha, P_SMOKE);
    }
  }

  // 枪口硝烟：顺着枪口方向吐出一小团，迅速减速、膨胀、散开
  gunSmoke(p, dir, k = 1, alpha = 0.22) {
    this.norm.emit(p.x + dir.x * 0.08, p.y + dir.y * 0.08, p.z + dir.z * 0.08, dir.x * 1.3 * k + rs(0.15), dir.y * 1.3 * k + 0.3, dir.z * 1.3 * k + rs(0.15), 0.6, 0.58, 0.56, 0.08 * k, 0.8 + Math.random() * 0.5, -0.3, 3.5, 0.45 * k, alpha, P_SMOKE);
  }

  dirtBurst(p, s = 1) {
    for (let i = 0; i < 18 * s; i++) this.norm.emit(p.x + rs(0.4), 0.1, p.z + rs(0.4), rs(2.5), 2 + Math.random() * 3, rs(2.5), 0.28, 0.23, 0.17, 0.12 + Math.random() * 0.1, 0.9, 10, 0.3);
    this.dust(p, 6);
  }

  puff(p, color, n = 10, additive = true) {
    const sys = additive ? this.add : this.norm;
    for (let i = 0; i < n; i++) sys.emit(p.x, p.y, p.z, rs(1.5), rs(1.5), rs(1.5), color.r, color.g, color.b, 0.35, 0.5, 0, 3, 1.2, 0.8);
  }

  trail(p, color) { this.add.emit(p.x + rs(0.08), p.y + rs(0.08), p.z + rs(0.08), 0, 0.3, 0, color.r, color.g, color.b, 0.35, 0.35, 0, 0, -0.6, 0.7); }

  ember(p) { this.add.emit(p.x, p.y, p.z, rs(0.3), 1 + Math.random(), rs(0.3), 1, 0.45 + Math.random() * 0.3, 0.1, 0.14, 0.6, -0.5, 0.5, -0.1); }

  // 火舌：噪声溶蚀的火焰粒子上升、膨胀、降温，夹杂少量黑烟
  fire(p, radius = 1, n = 30) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
      const hot = Math.random();
      this.add.emit(p.x + Math.cos(a) * r, p.y + Math.random() * 0.25, p.z + Math.sin(a) * r, rs(0.5), 1.4 + Math.random() * 2.2, rs(0.5), 1, 0.3 + hot * 0.32, 0.05 + hot * 0.08, 0.32 + Math.random() * 0.4, 0.5 + Math.random() * 0.45, -1.4, 1.4, 0.55, 0.9, P_FLAME);
    }
    for (let i = 0; i < Math.ceil(n / 8); i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * radius * 0.7;
      this.norm.emit(p.x + Math.cos(a) * r, p.y + 0.6 + Math.random() * 0.6, p.z + Math.sin(a) * r, rs(0.3), 0.9 + Math.random() * 0.8, rs(0.3), 0.07, 0.06, 0.055, 0.5 + Math.random() * 0.4, 1.2 + Math.random() * 0.8, -0.2, 0.8, 0.9, 0.45, P_SMOKE);
    }
  }

  // 爆炸：白热内核 → 向外翻滚的火球 → 升腾的黑烟柱 + 飞溅火星 + 冲击环 + 地面焦痕
  fireBurst(p, radius) {
    const R = radius, K = Math.min(1.6, R / 3);
    const y0 = Math.max(0.3, p.y);
    for (let i = 0; i < 3; i++) this.add.emit(p.x + rs(0.3), y0 + 0.3 + Math.random() * 0.4, p.z + rs(0.3), rs(1), 1 + Math.random(), rs(1), 1, 0.62, 0.3, R * 0.28 + Math.random() * R * 0.12, 0.14 + Math.random() * 0.06, 0, 2, R * 0.9, 0.4, P_FLAME);
    for (let i = 0; i < 42; i++) {
      const a = Math.random() * Math.PI * 2, el = Math.random() * 0.95, sp = (2.2 + Math.random() * 4) * K;
      const hot = Math.random();
      this.add.emit(p.x + rs(0.3), y0 + Math.random() * 0.4, p.z + rs(0.3), Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp * 0.8 + 1.2, Math.sin(a) * Math.cos(el) * sp, 1, 0.24 + hot * 0.32, 0.04 + hot * 0.08, 0.5 + Math.random() * 0.6, 0.42 + Math.random() * 0.42, -1.6, 3.4, 1.5, 0.42, P_FLAME);
    }
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * R * 0.5;
      this.norm.emit(p.x + Math.cos(a) * r, 0.5 + Math.random() * 0.9, p.z + Math.sin(a) * r, Math.cos(a) * 0.9 + rs(0.3), 1 + Math.random() * 1.5, Math.sin(a) * 0.9 + rs(0.3), 0.075, 0.065, 0.06, 0.9 + Math.random() * 0.8, 1.7 + Math.random() * 1.1, -0.15, 1.1, 1.2, 0.62, P_SMOKE);
    }
    for (let i = 0; i < 28; i++) this.add.emit(p.x, y0 + 0.3, p.z, rs(7) * K, 2 + Math.random() * 6, rs(7) * K, 1, 0.62 + Math.random() * 0.3, 0.22, 0.045 + Math.random() * 0.04, 0.6 + Math.random() * 0.7, 9, 0.6, -0.02);
    this.shockRing(p, R * 1.15, 0xff7a30, 0.42);
    this.groundGlow(p, R * 1.25, 0xff6a20, 0.7, 0.45);
    this.flashLight(p.clone().setY(1.2), 0xff7020, 38, 0.55, R * 3.5);
    this.decal(p, R * 1.6, 0x050403);
  }

  paperBurn(p) {
    this.fire(p, 0.5, 26);
    for (let i = 0; i < 16; i++) this.norm.emit(p.x + rs(0.3), p.y + rs(0.5), p.z + rs(0.3), rs(1), 1 + Math.random() * 2, rs(1), 0.1, 0.08, 0.06, 0.08, 1.4, -0.4, 0.5);
  }

  soulWisp(p) {
    for (let i = 0; i < 18; i++) this.add.emit(p.x + rs(0.3), p.y + rs(0.4), p.z + rs(0.3), rs(0.4), 1.5 + Math.random() * 2, rs(0.4), 0.5, 0.75, 1, 0.3, 1.2, -0.3, 0.4, -0.1, 0.8);
  }

  gold(p, n = 20, spread = 1) {
    for (let i = 0; i < n; i++) this.add.emit(p.x, p.y, p.z, rs(2 * spread), Math.random() * 3 * spread, rs(2 * spread), 1, 0.8, 0.3, 0.12, 0.7, 3, 1);
  }

  heal(p) {
    for (let i = 0; i < 20; i++) { const a = Math.random() * Math.PI * 2; this.add.emit(p.x + Math.cos(a) * 0.6, p.y - 1.4 + Math.random(), p.z + Math.sin(a) * 0.6, 0, 1.5 + Math.random(), 0, 0.4, 1, 0.5, 0.15, 0.8, -0.5, 0, 0); }
  }

  levelUp(p) {
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      this.add.emit(p.x + Math.cos(a) * 0.8, p.y - 1.5, p.z + Math.sin(a) * 0.8, Math.cos(a) * 1.5, 3 + Math.random() * 2, Math.sin(a) * 1.5, 1, 0.85, 0.35, 0.18, 1.0, 2, 0.8);
    }
    this.shockRing(p.clone().setY(0.05), 5, 0xffd060);
    this.baguaDecal(p, 3.5, 0.9, 0xffd060);
  }

  // ---------------------------------------------------------------- 网格特效
  _addMesh(obj, life, update) {
    this.scene.add(obj);
    this.meshes.push({ obj, life, maxLife: life, update });
  }

  shockRing(p, radius, color = 0xffa040, dur = 0.5) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 0.95 }, w: { value: 0.05 } },
      vertexShader: TELE_VERT, fragmentShader: RING_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(this._discGeo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.08, p.z);
    m.renderOrder = 3;
    this._addMesh(m, dur, (k) => {
      const e = 1 - Math.pow(1 - k, 3);
      const s = 0.2 + e * radius;
      m.scale.setScalar(s);
      mat.uniforms.w.value = Math.min(0.25, 0.14 / s);
      mat.uniforms.opacity.value = 0.95 * (1 - k) * (1 - k * 0.5);
    });
  }

  // 地面火光：爆点周围短暂的加法光斑（配合点光源，让石板"被照亮"）
  groundGlow(p, radius, color = 0xff6a20, dur = 0.6, peak = 0.5) {
    const m = new THREE.Mesh(this._discGeo, new THREE.MeshBasicMaterial({ map: this._glowTex, color, transparent: true, opacity: peak, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.06, p.z);
    m.scale.setScalar(radius);
    m.renderOrder = 2;
    this._addMesh(m, dur, (k) => { m.material.opacity = peak * (1 - k) * (1 - k); });
  }

  baguaDecal(p, radius, dur = 1, color = 0xffd060, peak = 0.9) {
    const m = new THREE.Mesh(this._discGeo, new THREE.MeshBasicMaterial({ map: this._baguaTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.07, p.z);
    m.renderOrder = 2;
    this._addMesh(m, dur, (k) => { m.scale.setScalar(radius * (0.6 + Math.min(1, k * 4) * 0.4)); m.rotation.z = k * 2; m.material.opacity = peak * (k < 0.2 ? k * 5 : 1 - (k - 0.2) / 0.8); });
  }

  tracer(from, to, color = 0xffe0a0, width = 1) {
    const m = new THREE.Mesh(this._tracerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(from);
    m.lookAt(to);
    const len = from.distanceTo(to);
    m.scale.set(width, width, len);
    this._addMesh(m, 0.06, (k) => { m.material.opacity = 0.9 * (1 - k); });
  }

  // 闪电：按长度抖动的折线（两片交叉的发光带，截面白热 → 柔光）+ 分叉 + 落点电火花
  bolt(from, to, color = 0xbfe0ff, width = 0.09, dur = 0.22) {
    const pts = [];
    const n = 12;
    const amp = Math.min(1.4, from.distanceTo(to) / n * 0.75);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = from.clone().lerp(to, t);
      if (i > 0 && i < n) { p.x += rs(amp); p.z += rs(amp); p.y += rs(amp * 0.4); }
      pts.push(p);
    }
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: this._beamTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const seg = (a, b, w) => {
      const len = a.distanceTo(b);
      for (const rot of [0, Math.PI / 2]) {
        const q = new THREE.Mesh(new THREE.PlaneGeometry(w * 4, len), mat);
        q.position.copy(a).lerp(b, 0.5);
        q.lookAt(b); q.rotateX(Math.PI / 2); q.rotateY(rot);
        g.add(q);
      }
    };
    for (let i = 0; i < n; i++) seg(pts[i], pts[i + 1], width);
    for (let k = 0; k < 3; k++) {
      const i = 2 + Math.floor(Math.random() * (n - 4));
      let a = pts[i];
      for (let j = 0; j < 3; j++) {
        const b = a.clone().add(new THREE.Vector3(rs(amp * 1.6), -amp * (0.8 + Math.random()), rs(amp * 1.6)));
        seg(a, b, width * (0.55 - j * 0.12));
        a = b;
      }
    }
    this._addMesh(g, dur, (k) => { mat.opacity = (1 - k) * (Math.random() > 0.3 ? 1 : 0.4); });
    this.flashLight(to.clone().setY(2), color, 80, 0.2, 18);
    for (let i = 0; i < 16; i++) this.add.emit(to.x, to.y + 0.2, to.z, rs(4), Math.random() * 4, rs(4), 0.7, 0.85, 1, 0.1, 0.35, 10, 1);
  }

  // 光柱：正对镜头处最亮、轮廓处淡出（不会出现硬边"光墙"），顶部渐隐，噪声条纹上涌
  pillar(p, color = 0xffe080, height = 8, radius = 0.8, dur = 0.5) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 0.6 }, time: { value: Math.random() * 10 }, noise: { value: noiseTexture() } },
      vertexShader: PILLAR_VERT, fragmentShader: PILLAR_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 24, 1, true), mat);
    m.position.set(p.x, height / 2, p.z);
    m.renderOrder = 6;
    this._addMesh(m, dur, (k, dt) => {
      mat.uniforms.time.value += dt;
      mat.uniforms.opacity.value = 0.6 * (1 - k) * Math.min(1, k * 12 + 0.3);
      m.scale.set(1 - k * 0.6, 1, 1 - k * 0.6);
    });
  }

  casing(pos, vel) {
    const m = new THREE.Mesh(this._casingGeo, this._casingMat);
    m.position.copy(pos);
    const spin = new THREE.Vector3(rs(20), rs(20), rs(20));
    const v = vel.clone();
    this._addMesh(m, 0.9, (k, dt) => { v.y -= 11 * dt; m.position.addScaledVector(v, dt); m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt; if (m.position.y < 0.02) { m.position.y = 0.02; v.multiplyScalar(0.3); v.y = Math.abs(v.y); } });
  }

  update(dt) {
    this.time += dt;
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.t += dt;
      e.fn(dt, Math.min(1, e.t / e.dur));
      if (e.t >= e.dur) this.emitters.splice(i, 1);
    }
    this.add.update(dt);
    this.norm.update(dt);
    for (let i = this.meshes.length - 1; i >= 0; i--) {
      const m = this.meshes[i];
      m.life -= dt;
      const k = 1 - Math.max(0, m.life) / m.maxLife;
      m.update?.(k, dt);
      if (m.life <= 0) {
        this.scene.remove(m.obj);
        if (!m.obj.userData.shared) m.obj.traverse((o) => { if (o.material && o.material !== this._casingMat) o.material.dispose?.(); if (o.geometry && o.geometry !== this._discGeo && o.geometry !== this._tracerGeo && o.geometry !== this._casingGeo) o.geometry.dispose(); });
        this.meshes.splice(i, 1);
      }
    }
    for (const s of this.lights) {
      if (s.t < s.dur) { s.t += dt; s.l.intensity = s.peak * Math.max(0, 1 - s.t / s.dur); }
      else s.l.intensity = 0;
    }
    const K = this._key;
    if (K.t < K.dur) {
      K.t += dt;
      const k = K.t / K.dur;
      this.keyL.intensity = K.peak * Math.min(1, K.t / 0.4) * (k > 0.75 ? Math.max(0, (1 - k) / 0.25) : 1);
    } else this.keyL.intensity = 0;
  }

  clear() {
    this.add.clear(); this.norm.clear();
    for (const m of this.meshes) this.scene.remove(m.obj);
    this.meshes.length = 0;
    this.emitters.length = 0;
    for (const s of this.lights) { s.t = s.dur; s.l.intensity = 0; }
    this._key.t = this._key.dur; this.keyL.intensity = 0;
  }
}
