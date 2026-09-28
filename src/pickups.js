import * as THREE from 'three';
import { softDotTexture, canvasTexture } from './gfx/textures.js';
import { roundedBox, lathe } from './gfx/shapes.js';
import { Audio } from './audio.js';

// =====================================================================
//  掉落物：阳气珠（GPU 点）、回春葫芦、镇尸宝箱
// =====================================================================
const MAX = 700;
const TIERS = [
  { v: 1, color: [1, 0.78, 0.3], size: 0.3 },
  { v: 5, color: [0.4, 0.8, 1], size: 0.42 },
  { v: 20, color: [1, 0.35, 0.3], size: 0.6 },
];

export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.n = 0;
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.val = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.pull = new Uint8Array(MAX);
    this.age = new Float32Array(MAX);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDotTexture() }, scale: { value: 600 }, time: { value: 0 } },
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; uniform float scale; uniform float time;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position + vec3(0.0, sin(time*3.0 + position.x*2.0)*0.06, 0.0), 1.0);
        gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); float core = smoothstep(0.35, 0.0, length(gl_PointCoord-0.5));
        gl_FragColor = vec4(vC * (1.0 + core * 1.5), t.a); if (gl_FragColor.a < 0.02) discard; }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.items = [];   // { obj, kind, t }
    this.gourdTex = canvasTexture(64, 64, (c) => { c.fillStyle = '#c8a040'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#b01010'; c.fillRect(0, 26, 64, 12); });
  }

  setViewportHeight(h) { this.mat.uniforms.scale.value = h * 0.8; }

  dropXp(pos, value) {
    let remaining = value;
    while (remaining > 0) {
      const tier = remaining >= 20 ? 2 : remaining >= 5 ? 1 : 0;
      const v = TIERS[tier].v;
      remaining -= v;
      this._add(pos, v, tier);
    }
  }

  _add(pos, v, tier) {
    let i;
    if (this.n >= MAX) {
      // 合并进最近的一颗
      i = Math.floor(Math.random() * this.n);
      this.val[i] += v;
      return;
    }
    i = this.n++;
    const T = TIERS[tier];
    this.pos[i * 3] = pos.x + (Math.random() - 0.5) * 0.6;
    this.pos[i * 3 + 1] = 0.5;
    this.pos[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.6;
    this.vel[i * 3] = (Math.random() - 0.5) * 3;
    this.vel[i * 3 + 1] = 3 + Math.random() * 2;
    this.vel[i * 3 + 2] = (Math.random() - 0.5) * 3;
    this.col[i * 3] = T.color[0]; this.col[i * 3 + 1] = T.color[1]; this.col[i * 3 + 2] = T.color[2];
    this.size[i] = T.size;
    this.val[i] = v;
    this.pull[i] = 0;
    this.age[i] = 0;
  }

  dropHeal(pos) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(lathe([[0.001, 0], [0.14, 0.03], [0.17, 0.12], [0.1, 0.24], [0.08, 0.28], [0.12, 0.36], [0.1, 0.46], [0.03, 0.5]], 16),
      new THREE.MeshStandardMaterial({ color: 0xc89040, roughness: 0.4, emissive: 0x301800 }));
    g.add(body);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.015, 6, 16), new THREE.MeshStandardMaterial({ color: 0xc01010 }));
    band.rotation.x = Math.PI / 2; band.position.y = 0.27; g.add(band);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTexture(), color: 0x60ff90, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
    glow.scale.setScalar(1.1); glow.position.y = 0.25; g.add(glow);
    g.position.set(pos.x, 0.1, pos.z);
    g.scale.setScalar(1.3);
    this.scene.add(g);
    this.items.push({ obj: g, kind: 'heal', t: 0, life: 25 });
  }

  dropChest(pos) {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a1a10, roughness: 0.5 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe0b040, metalness: 0.9, roughness: 0.3, emissive: 0x402800 });
    const base = new THREE.Mesh(roundedBox(0.8, 0.45, 0.55, 0.04), wood); base.position.y = 0.23; g.add(base);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 16, 1, false, 0, Math.PI), wood);
    lid.rotation.z = Math.PI / 2; lid.rotation.y = Math.PI / 2; lid.position.y = 0.45; g.add(lid);
    for (const x of [-0.3, 0, 0.3]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.58), gold); b.position.set(x, 0.24, 0); g.add(b); }
    const lock = new THREE.Mesh(roundedBox(0.14, 0.16, 0.05, 0.02), gold); lock.position.set(0, 0.42, 0.3); g.add(lock);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTexture(), color: 0xffd060, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7 }));
    glow.scale.setScalar(1.4); glow.position.y = 0.45; g.add(glow);
    g.position.set(pos.x, 0, pos.z);
    this.scene.add(g);
    this.items.push({ obj: g, kind: 'chest', t: 0, life: 999 });
  }

  // 全屏吸取（首领死亡时）
  vacuum() { for (let i = 0; i < this.n; i++) this.pull[i] = 1; }

  update(dt, player, magnet, onXp, onItem) {
    this.mat.uniforms.time.value += dt;
    const px = player.position.x, py = player.position.y - 0.8, pz = player.position.z;
    const m2 = magnet * magnet;
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.age[i] += dt;
      const ix = i * 3;
      const dx = px - this.pos[ix], dy = py - this.pos[ix + 1], dz = pz - this.pos[ix + 2];
      const d2 = dx * dx + dz * dz;
      if (!this.pull[i] && d2 < m2 && this.age[i] > 0.3) this.pull[i] = 1;
      if (this.pull[i]) {
        const d = Math.sqrt(d2 + dy * dy) || 0.001;
        const sp = 6 + this.age[i] * 2;
        this.vel[ix] += (dx / d * sp * 3 - this.vel[ix]) * Math.min(1, dt * 6);
        this.vel[ix + 1] += (dy / d * sp * 3 - this.vel[ix + 1]) * Math.min(1, dt * 6);
        this.vel[ix + 2] += (dz / d * sp * 3 - this.vel[ix + 2]) * Math.min(1, dt * 6);
        if (d < 0.7) {
          onXp(this.val[i]);
          n--;
          if (i !== n) this._copy(n, i);
          i--;
          continue;
        }
      } else {
        this.vel[ix + 1] -= 12 * dt;
        this.vel[ix] *= 1 - dt * 3; this.vel[ix + 2] *= 1 - dt * 3;
        if (this.pos[ix + 1] < 0.35) { this.pos[ix + 1] = 0.35; this.vel[ix + 1] = 0; }
      }
      this.pos[ix] += this.vel[ix] * dt;
      this.pos[ix + 1] += this.vel[ix + 1] * dt;
      this.pos[ix + 2] += this.vel[ix + 2] * dt;
    }
    this.n = n;
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.obj.rotation.y += dt * 1.5;
      it.obj.position.y = (it.kind === 'chest' ? 0 : 0.15) + Math.abs(Math.sin(it.t * 2)) * 0.12;
      const d = Math.hypot(px - it.obj.position.x, pz - it.obj.position.z);
      if (d < 1.2) {
        onItem(it.kind, it.obj.position.clone());
        this.scene.remove(it.obj);
        this.items.splice(i, 1);
        continue;
      }
      if (it.t > it.life) { this.scene.remove(it.obj); this.items.splice(i, 1); }
    }
  }

  _copy(from, to) {
    for (let k = 0; k < 3; k++) {
      this.pos[to * 3 + k] = this.pos[from * 3 + k];
      this.vel[to * 3 + k] = this.vel[from * 3 + k];
      this.col[to * 3 + k] = this.col[from * 3 + k];
    }
    this.size[to] = this.size[from]; this.val[to] = this.val[from]; this.pull[to] = this.pull[from]; this.age[to] = this.age[from];
  }

  clear() {
    this.n = 0;
    this.geo.setDrawRange(0, 0);
    for (const it of this.items) this.scene.remove(it.obj);
    this.items.length = 0;
  }
}

void Audio;
