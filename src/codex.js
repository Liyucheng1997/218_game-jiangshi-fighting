import * as THREE from 'three';
import { ENEMIES, CODEX_ORDER } from './data.js';
import { getTemplate } from './gfx/characters.js';
import { instantiate } from './gfx/rig.js';
import { poseDance, zeroPose } from './gfx/anim.js';
import { canvasTexture, softDotTexture } from './gfx/textures.js';
import { lathe } from './gfx/shapes.js';

// 百鬼图鉴：灵堂供台，选中者立于台上表演专属动作，可拖拽旋转
export class Codex {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 100);
    this.built = false;
    this.selected = 0;
    this.inst = {};
    this.onSelect = null;
    this.t = 0;
    this.spin = 0;
    this.dragging = false;
  }

  build() {
    if (this.built) return;
    this.built = true;
    const s = this.scene;
    s.background = new THREE.Color(0x07060a);
    s.fog = new THREE.Fog(0x07060a, 8, 22);
    s.add(new THREE.HemisphereLight(0x8090b0, 0x2a2018, 0.9));
    const key = new THREE.SpotLight(0xffe0c0, 60, 20, 0.5, 0.6, 1.5);
    key.position.set(2.5, 6, 5); key.target.position.set(0, 1, 0);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    s.add(key, key.target);
    const rim = new THREE.SpotLight(0x80a0ff, 40, 16, 0.6, 0.8, 1.5);
    rim.position.set(-3, 4, -4); rim.target.position.set(0, 1.2, 0);
    s.add(rim, rim.target);
    this.accent = new THREE.PointLight(0xff5020, 8, 8, 1.8);
    this.accent.position.set(0, 0.6, 1.8);
    s.add(this.accent);
    // 地面与后墙
    const floorTex = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#1c1a1c'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) { const v = 28 + Math.random() * 14; g.fillStyle = `rgb(${v},${v - 2},${v})`; g.fillRect(x + 2, y + 2, 60, 60); }
    }, 8, 8);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.7, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    const wallTex = canvasTexture(512, 256, (g, w, h) => {
      g.fillStyle = '#140c0a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8c060'; g.font = 'bold 150px "Ma Shan Zheng","KaiTi",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.globalAlpha = 0.12; g.fillText('百鬼夜行', w / 2, h / 2);
    });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 1 }));
    wall.position.set(0, 4, -5); s.add(wall);
    // 供台
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3a3438, roughness: 0.6, metalness: 0.1 });
    const ped = new THREE.Mesh(lathe([[1.6, 0], [1.6, 0.12], [1.45, 0.16], [1.45, 0.28], [1.55, 0.32], [1.55, 0.36]], 48), stoneMat);
    ped.receiveShadow = true; ped.castShadow = true; s.add(ped);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.42, 64), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.365; s.add(ring);
    this.ring = ring;
    // 两侧蜡烛与幡
    const candleMat = new THREE.MeshStandardMaterial({ color: 0xc01818, roughness: 0.6 });
    const flameMat = new THREE.SpriteMaterial({ map: softDotTexture('rgba(255,220,140,1)', 'rgba(255,120,20,0)'), blending: THREE.AdditiveBlending, depthWrite: false });
    this.flames = [];
    for (const [x, z, h] of [[-2.3, -0.4, 0.5], [-2.9, -1.4, 0.8], [1.9, -2.2, 0.6], [2.6, -2.8, 0.9], [-2.0, 0.6, 0.35], [-3.2, -0.2, 1.1]]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, h, 10), candleMat);
      c.position.set(x, h / 2, z); c.castShadow = true; s.add(c);
      const f = new THREE.Sprite(flameMat); f.scale.set(0.18, 0.32, 1); f.position.set(x, h + 0.12, z); s.add(f);
      this.flames.push(f);
    }
    for (const x of [-4.2, 4.2]) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 4.5), new THREE.MeshStandardMaterial({ color: 0x6a0c0c, roughness: 0.9, side: THREE.DoubleSide }));
      banner.position.set(x, 3.3, -3.5); s.add(banner);
    }
    this.dust = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 600 }, () => (Math.random() - 0.5) * 10), 3)),
      new THREE.PointsMaterial({ size: 0.02, color: 0xffd8a0, transparent: true, opacity: 0.5 }));
    s.add(this.dust);
    this.holder = new THREE.Group();
    this.holder.position.y = 0.36;
    s.add(this.holder);
    this.camera.position.set(0, 1.9, 6.2);
    this.camera.lookAt(0, 1.3, 0);
  }

  _get(type) {
    if (!this.inst[type]) {
      const cfg = ENEMIES[type];
      const i = instantiate(getTemplate(cfg.model));
      i.root.scale.setScalar(cfg.scale);
      this.holder.add(i.root);
      this.inst[type] = i;
    }
    return this.inst[type];
  }

  select(i) {
    const n = CODEX_ORDER.length;
    this.selected = ((i % n) + n) % n;
    const type = CODEX_ORDER[this.selected];
    for (const k in this.inst) this.inst[k].root.visible = false;
    const inst = this._get(type);
    inst.root.visible = true;
    this.spin = 0;
    const cfg = ENEMIES[type];
    const h = inst.template.height * cfg.scale;
    const dist = 3.2 + h * 1.35;
    this.camera.position.set(0, 0.6 + h * 0.62, dist);
    this.camera.lookAt(0, 0.36 + h * 0.5, 0);
    this.accent.color.set(cfg.category === '首领' ? 0xff3020 : cfg.category === '鬼怪' ? 0x4080ff : 0xff8030);
    this.onSelect?.(type);
  }

  rotate(dx) { this.spin += dx * 0.01; }

  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  update(dt) {
    this.t += dt;
    const type = CODEX_ORDER[this.selected];
    const inst = this.inst[type];
    if (inst) {
      zeroPose(inst.bones);
      const kind = ENEMIES[type].kind;
      const lift = poseDance(kind === 'jiangshi' ? 'jiangshi' : kind, inst.bones, this.t, 0);
      inst.root.position.y = lift;
      inst.root.rotation.y = Math.sin(this.t * 0.4) * 0.5 + this.spin;
    }
    this.ring.material.opacity = 0.45 + Math.sin(this.t * 2) * 0.2;
    this.flames.forEach((f, i) => { f.scale.y = 0.3 + Math.sin(this.t * 12 + i * 2) * 0.04; });
    this.dust.rotation.y += dt * 0.02;
  }
}
