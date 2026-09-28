import * as THREE from 'three';
import { softDotTexture, baguaTexture } from './gfx/textures.js';

// =====================================================================
//  特效：单 draw call 的 GPU 点粒子（加法 / 普通两套）+ 冲击环 + 雷电 + 曳光
//  灯光池固定数量，避免灯光增减导致着色器重编译。
// =====================================================================

class Particles {
  constructor(scene, max, additive) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
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
    g.setDrawRange(0, 0);
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDotTexture() }, scale: { value: 600 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha;
        uniform float scale;
        void main(){
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec3 vColor; varying float vAlpha;
        void main(){
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor, t.a * vAlpha);
          if (gl_FragColor.a < 0.01) discard;
        }`,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mat = mat;
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, r, g, b, size, life, grav = 0, drag = 0, grow = 0, alpha = 1) {
    let i = this.n;
    if (i >= this.max) i = Math.floor(Math.random() * this.max);
    else this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
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
      this.size[i] += this.grow[i] * dt;
      const k = this.life[i] / this.maxLife[i];
      this.alpha[i] = this.a0[i] * Math.min(1, k * 2.5);
    }
    this.n = n;
    this.geo.setDrawRange(0, n);
    for (const a of ['position', 'color', 'size', 'alpha']) this.geo.attributes[a].needsUpdate = true;
  }

  _copy(from, to) {
    for (let k = 0; k < 3; k++) {
      this.pos[to * 3 + k] = this.pos[from * 3 + k];
      this.vel[to * 3 + k] = this.vel[from * 3 + k];
      this.col[to * 3 + k] = this.col[from * 3 + k];
    }
    this.size[to] = this.size[from]; this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from];
    this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from]; this.grow[to] = this.grow[from];
    this.a0[to] = this.a0[from]; this.alpha[to] = this.alpha[from];
  }

  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

const rs = (s = 1) => (Math.random() - 0.5) * 2 * s;
const _c = new THREE.Color();

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
    this._ringGeo = new THREE.RingGeometry(0.85, 1, 64);
    this._discGeo = new THREE.CircleGeometry(1, 48);
    this._tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 5, 1, true);
    this._tracerGeo.rotateX(Math.PI / 2);
    this._tracerGeo.translate(0, 0, 0.5);
    this._baguaTex = baguaTexture();
    this._casingGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.035, 6);
    this._casingMat = new THREE.MeshStandardMaterial({ color: 0xc9a437, roughness: 0.3, metalness: 0.9 });
    this.casings = [];
  }

  setViewportHeight(h) {
    this.add.mat.uniforms.scale.value = h * 0.8;
    this.norm.mat.uniforms.scale.value = h * 0.8;
  }

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
    for (let i = 0; i < n; i++) this.norm.emit(p.x + rs(0.5), 0.2, p.z + rs(0.5), rs(1.5), 0.5 + Math.random(), rs(1.5), 0.45, 0.42, 0.36, 0.5, 0.9, -0.3, 2, 1.4, 0.45);
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

  fire(p, radius = 1, n = 30) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * radius;
      const hot = Math.random();
      this.add.emit(p.x + Math.cos(a) * r, p.y + Math.random() * 0.3, p.z + Math.sin(a) * r, rs(0.6), 1.5 + Math.random() * 2.5, rs(0.6), 1, 0.35 + hot * 0.5, 0.08 + hot * 0.2, 0.3 + Math.random() * 0.4, 0.5 + Math.random() * 0.4, -1, 1, -0.3);
    }
  }

  fireBurst(p, radius) {
    this.fire(p, radius * 0.6, 50);
    for (let i = 0; i < 16; i++) this.norm.emit(p.x + rs(radius * 0.5), 0.4, p.z + rs(radius * 0.5), rs(1), 1.5, rs(1), 0.12, 0.1, 0.1, 0.7, 1.4, -0.5, 1, 1.2, 0.5);
    this.shockRing(p, radius, 0xff8030);
    this.flashLight(p.clone().setY(1.2), 0xff7020, 60, 0.45, radius * 3.5);
    this.scorch(p, radius * 0.7);
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
    const m = new THREE.Mesh(this._ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.08, p.z);
    this._addMesh(m, dur, (k) => { const e = 1 - Math.pow(1 - k, 3); m.scale.setScalar(0.2 + e * radius); m.material.opacity = 0.9 * (1 - k); });
  }

  baguaDecal(p, radius, dur = 1, color = 0xffd060) {
    const m = new THREE.Mesh(this._discGeo, new THREE.MeshBasicMaterial({ map: this._baguaTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.07, p.z);
    this._addMesh(m, dur, (k) => { m.scale.setScalar(radius * (0.6 + Math.min(1, k * 4) * 0.4)); m.rotation.z = k * 2; m.material.opacity = k < 0.2 ? k * 5 : 1 - (k - 0.2) / 0.8; });
  }

  scorch(p, r) {
    const m = new THREE.Mesh(this._discGeo, new THREE.MeshBasicMaterial({ map: softDotTexture('rgba(0,0,0,0.8)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.04, p.z);
    m.scale.setScalar(r);
    this._addMesh(m, 6, (k) => { m.material.opacity = 0.7 * (1 - k); });
  }

  tracer(from, to, color = 0xffe0a0, width = 1) {
    const m = new THREE.Mesh(this._tracerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(from);
    m.lookAt(to);
    const len = from.distanceTo(to);
    m.scale.set(width, width, len);
    this._addMesh(m, 0.06, (k) => { m.material.opacity = 0.9 * (1 - k); });
  }

  // 闪电：折线 + 两片交叉带，外加分叉
  bolt(from, to, color = 0xbfe0ff, width = 0.09, dur = 0.22) {
    const pts = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = from.clone().lerp(to, t);
      if (i > 0 && i < n) { p.x += rs(0.5); p.z += rs(0.5); p.y += rs(0.3); }
      pts.push(p);
    }
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const seg = (a, b, w) => {
      const len = a.distanceTo(b);
      for (const rot of [0, Math.PI / 2]) {
        const q = new THREE.Mesh(new THREE.PlaneGeometry(w, len), mat);
        q.position.copy(a).lerp(b, 0.5);
        q.lookAt(b); q.rotateX(Math.PI / 2); q.rotateY(rot);
        g.add(q);
      }
    };
    for (let i = 0; i < n; i++) seg(pts[i], pts[i + 1], width);
    for (let k = 0; k < 3; k++) {
      const i = 2 + Math.floor(Math.random() * 6);
      const end = pts[i].clone().add(new THREE.Vector3(rs(1.5), -1 - Math.random(), rs(1.5)));
      seg(pts[i], end, width * 0.5);
    }
    this._addMesh(g, dur, (k) => { mat.opacity = (1 - k) * (Math.random() > 0.3 ? 1 : 0.4); });
    this.flashLight(to.clone().setY(2), color, 80, 0.2, 18);
    for (let i = 0; i < 16; i++) this.add.emit(to.x, to.y + 0.2, to.z, rs(4), Math.random() * 4, rs(4), 0.7, 0.85, 1, 0.1, 0.35, 10, 1);
  }

  pillar(p, color = 0xffe080, height = 8, radius = 0.8, dur = 0.5) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 16, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(p.x, height / 2, p.z);
    this._addMesh(m, dur, (k) => { m.material.opacity = 0.5 * (1 - k); m.scale.set(1 - k * 0.7, 1, 1 - k * 0.7); });
  }

  casing(pos, vel) {
    const m = new THREE.Mesh(this._casingGeo, this._casingMat);
    m.position.copy(pos);
    const spin = new THREE.Vector3(rs(20), rs(20), rs(20));
    const v = vel.clone();
    this._addMesh(m, 0.9, (k, dt) => { v.y -= 11 * dt; m.position.addScaledVector(v, dt); m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt; if (m.position.y < 0.02) { m.position.y = 0.02; v.multiplyScalar(0.3); v.y = Math.abs(v.y); } });
  }

  update(dt) {
    this.add.update(dt);
    this.norm.update(dt);
    for (let i = this.meshes.length - 1; i >= 0; i--) {
      const m = this.meshes[i];
      m.life -= dt;
      const k = 1 - Math.max(0, m.life) / m.maxLife;
      m.update?.(k, dt);
      if (m.life <= 0) {
        this.scene.remove(m.obj);
        m.obj.traverse((o) => { if (o.material && o.material !== this._casingMat) o.material.dispose?.(); if (o.geometry && o.geometry !== this._ringGeo && o.geometry !== this._discGeo && o.geometry !== this._tracerGeo && o.geometry !== this._casingGeo) o.geometry.dispose(); });
        this.meshes.splice(i, 1);
      }
    }
    for (const s of this.lights) {
      if (s.t < s.dur) { s.t += dt; s.l.intensity = s.peak * Math.max(0, 1 - s.t / s.dur); }
      else s.l.intensity = 0;
    }
  }

  clear() {
    this.add.clear(); this.norm.clear();
    for (const m of this.meshes) this.scene.remove(m.obj);
    this.meshes.length = 0;
    for (const s of this.lights) { s.t = s.dur; s.l.intensity = 0; }
  }
}
