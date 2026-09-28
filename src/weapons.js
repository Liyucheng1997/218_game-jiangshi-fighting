import * as THREE from 'three';
import { Audio } from './audio.js';
import { GUN_BUILDERS, buildFpsArm } from './gfx/guns.js';

export const WEAPON_ORDER = ['mauser', 'thompson', 'ak47', 'shotgun', 'gatling', 'sword'];

export const WEAPON_DEFS = {
  mauser: {
    id: 'mauser', name: '驳壳枪', auto: false, interval: 0.17, damage: 34, headMult: 2.4, mag: 20, reload: 1.4,
    spread: 0.007, recoil: 0.022, range: 120, sound: 'pistol', shake: 0.16, knock: 0.15, flash: 0.9,
    pos: [0.17, -0.19, -0.45], scale: 1.0,
  },
  thompson: {
    id: 'thompson', name: '汤姆逊', auto: true, interval: 0.075, damage: 17, headMult: 2.2, mag: 50, reload: 2.1,
    spread: 0.024, recoil: 0.011, range: 110, sound: 'smg', shake: 0.12, knock: 0.08, flash: 1.0,
    pos: [0.17, -0.21, -0.46], scale: 0.85,
  },
  ak47: {
    id: 'ak47', name: 'AK-47', auto: true, interval: 0.1, damage: 29, headMult: 2.4, mag: 30, reload: 1.9,
    spread: 0.015, recoil: 0.02, range: 140, sound: 'ak', shake: 0.26, knock: 0.14, flash: 1.4,
    pos: [0.16, -0.2, -0.46], scale: 0.85,
  },
  shotgun: {
    id: 'shotgun', name: '双管猎枪', auto: false, interval: 0.3, damage: 13, pellets: 9, headMult: 1.6, mag: 2, reload: 1.5,
    spread: 0.06, recoil: 0.06, range: 40, sound: 'shotgun', shake: 0.6, knock: 0.95, flash: 2.0,
    pos: [0.16, -0.2, -0.44], scale: 0.85,
  },
  gatling: {
    id: 'gatling', name: '加特林', auto: true, interval: 0.045, damage: 12, headMult: 2, mag: 200, reload: 3.4,
    spread: 0.04, recoil: 0.005, range: 110, sound: 'gatling', shake: 0.12, knock: 0.05, flash: 1.3,
    spinUp: 0.55, moveSlow: 0.62, pos: [0.19, -0.26, -0.5], scale: 0.85,
  },
  sword: {
    id: 'sword', name: '桃木剑', melee: true, auto: false, interval: 0.42, damage: 70, headMult: 1, mag: Infinity, reload: 0,
    spread: 0, recoil: 0, range: 3.0, arc: 1.35, sound: 'knife', shake: 0.12, knock: 0.9, flash: 0,
    pos: [0.22, -0.25, -0.35], scale: 1.05,
  },
};

export class WeaponSystem {
  /**
   * @param shoot (origin, dir, def, first) => void
   * @param melee (def) => void
   */
  constructor(camera, scene, effects, shoot, melee) {
    this.camera = camera;
    this.scene = scene;
    this.effects = effects;
    this.shoot = shoot;
    this.melee = melee;
    this.rig = new THREE.Group();
    camera.add(this.rig);
    this.viewmodels = {};
    this.owned = ['mauser', 'sword'];
    this.levels = {};
    this.state = {};
    this.current = 'mauser';
    this.cooldown = 0;
    this.reloading = 0;
    this.triggerDown = false;
    this._consumed = false;
    this.recoilKick = 0;
    this.kick = 0;
    this.bobT = 0;
    this.switchAnim = 0;
    this.spin = 0;
    this.trauma = 0;
    this.swingT = -1;
    this.stats = { gunDmg: 1, fireRate: 1, reloadMult: 1, crit: 0, headMult: 1 };

    this.flashLight = new THREE.PointLight(0xffb050, 0, 7, 2);
    camera.add(this.flashLight);
    this.flashLight.position.set(0.2, -0.12, -0.9);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255,255,235,1)'); grad.addColorStop(0.25, 'rgba(255,215,120,0.95)');
    grad.addColorStop(0.6, 'rgba(255,140,40,0.35)'); grad.addColorStop(1, 'rgba(255,100,20,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    // 星形火舌
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(255,230,160,0.8)'; g.lineWidth = 6;
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); g.stroke(); }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.flashMat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true });
    this.flashSprite = new THREE.Sprite(this.flashMat);
    this.flashSprite.visible = false;
    this.flashSprite.renderOrder = 999;
    this.rig.add(this.flashSprite);
    // 第三人称枪口火光（世界空间）
    this.worldFlash = new THREE.Sprite(this.flashMat.clone());
    this.worldFlash.material.depthTest = true;
    this.worldFlash.visible = false;
    scene.add(this.worldFlash);
    this.tpsMuzzle = null;   // () => Vector3
    this.resetRun();
  }

  resetRun() {
    this.owned = ['mauser', 'sword'];
    this.levels = { mauser: 0, sword: 0 };
    for (const id of WEAPON_ORDER) this.state[id] = { mag: WEAPON_DEFS[id].mag };
    this.current = 'mauser';
    this.cooldown = 0; this.reloading = 0; this.spin = 0; this.swingT = -1;
    this._ensureViewmodel('mauser');
    this._showViewmodel();
  }

  def(id = this.current) {
    const d = WEAPON_DEFS[id];
    const l = this.levels[id] || 0;
    if (d.melee) return { ...d, damage: d.damage * (1 + l * 0.3), range: d.range * (1 + l * 0.15) };
    return { ...d, damage: d.damage * (1 + l * 0.2), mag: Math.round(d.mag * (1 + l * 0.25)), reload: d.reload * (1 - l * 0.1) };
  }

  get ammo() { return this.state[this.current]; }

  addWeapon(id) {
    if (this.owned.includes(id)) return;
    this.owned.push(id);
    this.owned.sort((a, b) => WEAPON_ORDER.indexOf(a) - WEAPON_ORDER.indexOf(b));
    this.state[id] = { mag: this.def(id).mag };
    this._ensureViewmodel(id);
    this.switchTo(id);
  }

  upgrade(id) {
    this.levels[id] = (this.levels[id] || 0) + 1;
    if (this.state[id]) this.state[id].mag = this.def(id).mag;
  }

  _ensureViewmodel(id) {
    if (this.viewmodels[id]) return this.viewmodels[id];
    const d = WEAPON_DEFS[id];
    const holder = new THREE.Group();
    const gun = GUN_BUILDERS[id]();
    gun.scale.setScalar(d.scale);
    gun.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.material = o.material.clone(); o.material.depthWrite = true; } });
    holder.add(gun);
    // 手臂
    const ud = gun.userData;
    const gripP = ud.grip.clone().multiplyScalar(d.scale);
    const rightFrom = new THREE.Vector3(0.28, -0.5, 0.45);
    holder.add(buildFpsArm(rightFrom, gripP.clone().add(new THREE.Vector3(0.012, 0, 0)), 1));
    if (ud.fore) {
      const foreP = ud.fore.clone().multiplyScalar(d.scale);
      holder.add(buildFpsArm(new THREE.Vector3(-0.42, -0.55, 0.3), foreP.clone().add(new THREE.Vector3(-0.02, -0.01, 0)), -1));
    } else if (!d.melee) {
      holder.add(buildFpsArm(new THREE.Vector3(-0.35, -0.55, 0.35), gripP.clone().add(new THREE.Vector3(-0.03, -0.015, -0.02)), -1));
    }
    holder.position.set(...d.pos);
    holder.userData = { gun, muzzle: ud.muzzle.clone().multiplyScalar(d.scale), spin: ud.spin, base: new THREE.Vector3(...d.pos) };
    holder.visible = false;
    this.rig.add(holder);
    this.viewmodels[id] = holder;
    return holder;
  }

  _showViewmodel() {
    for (const [id, vm] of Object.entries(this.viewmodels)) vm.visible = id === this.current;
  }

  switchTo(id) {
    if (typeof id === 'number') id = this.owned[id];
    if (!id || !this.owned.includes(id) || id === this.current) return;
    this.current = id;
    this.reloading = 0;
    this.cooldown = 0.25;
    this.switchAnim = 1;
    this.spin = 0;
    this.swingT = -1;
    Audio.setMinigunSpin(0);
    this._ensureViewmodel(id);
    this._showViewmodel();
    Audio.reload();
  }

  cycle(delta) {
    const i = this.owned.indexOf(this.current);
    this.switchTo(this.owned[(i + delta + this.owned.length) % this.owned.length]);
  }

  startReload() {
    const d = this.def();
    if (d.melee || this.reloading > 0 || this.ammo.mag >= d.mag) return;
    this.reloading = d.reload / this.stats.reloadMult;
    this.reloadTotal = this.reloading;
    Audio.reload();
  }

  refillAll() {
    for (const id of this.owned) this.state[id].mag = this.def(id).mag;
    this.reloading = 0;
  }

  setMoveState(moving, running) { this.moving = moving; this.running = running; }

  update(dt, active, view = 'fps', muzzleWorld = null) {
    const d = this.def();
    this.cooldown -= dt;
    this.switchAnim = Math.max(0, this.switchAnim - dt * 4);
    this.recoilKick = Math.max(0, this.recoilKick - dt * 8);
    this.kick = Math.max(0, this.kick - dt * 10);
    this.trauma = Math.max(0, this.trauma - dt * 2.5);
    const vm = this.viewmodels[this.current];

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) { this.reloading = 0; this.ammo.mag = d.mag; }
    }

    // 加特林预热
    if (d.spinUp) {
      const target = this.triggerDown && active ? 1 : 0;
      this.spin += (target - this.spin) * Math.min(1, dt * (target ? 1 / d.spinUp : 3));
      Audio.setMinigunSpin(this.spin);
      if (vm?.userData.spin) vm.userData.spin.rotation.z += dt * this.spin * 40;
    }

    // 开火
    if (active && this.triggerDown && this.cooldown <= 0 && this.reloading <= 0) {
      if (d.melee) {
        if (!this._consumed) {
          this._consumed = true;
          this.cooldown = d.interval;
          this.swingT = 0;
          Audio.knifeSwing();
          this.melee?.(d);
          this.trauma = Math.min(1, this.trauma + d.shake);
        }
      } else if (!d.auto && this._consumed) {
        // 半自动需松开
      } else if (d.spinUp && this.spin < 0.8) {
        // 预热中
      } else if (this.ammo.mag <= 0) {
        if (!this._consumed) { Audio.dryFire(); this._consumed = true; }
        this.startReload();
      } else {
        this._consumed = true;
        this.cooldown = d.interval / this.stats.fireRate;
        this.ammo.mag--;
        this._fire(d, view, muzzleWorld);
        if (this.ammo.mag <= 0) this.startReload();
      }
    }
    if (!this.triggerDown) this._consumed = false;

    // 视图模型动画
    if (vm) {
      const base = vm.userData.base;
      this.bobT += dt * (this.moving ? (this.running ? 13 : 8.5) : 1.8);
      const amp = this.moving ? (this.running ? 0.022 : 0.012) : 0.003;
      let rx = 0.015, ry = 0.035, rz = 0;
      let px = base.x + Math.cos(this.bobT * 0.5) * amp, py = base.y + Math.abs(Math.sin(this.bobT)) * amp * -1, pz = base.z + this.kick * 0.07;
      rx += this.kick * 0.25;
      if (this.running && !this.triggerDown) { rx -= 0.25; ry += 0.45; px -= 0.03; py -= 0.04; }
      if (this.reloading > 0) {
        const k = 1 - this.reloading / this.reloadTotal;
        const s = Math.sin(k * Math.PI);
        rx -= s * 0.55; rz += s * 0.5; py -= s * 0.08;
      }
      if (this.swingT >= 0) {
        this.swingT += dt / 0.3;
        const k = Math.min(1, this.swingT);
        const s = Math.sin(k * Math.PI);
        ry = 1.1 - k * 2.2; rx = -0.3 * s; rz = -0.6 * s; px -= s * 0.1; pz -= s * 0.12;
        if (this.swingT >= 1) this.swingT = -1;
      } else if (d.melee) { rx += 0.2; ry += 0.35; rz += 0.3; }
      py -= this.switchAnim * 0.3;
      vm.position.set(px, py, pz);
      vm.rotation.set(rx, ry, rz);
    }

    // 枪口火光衰减
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flashSprite.visible = false; this.worldFlash.visible = false; this.flashLight.intensity = 0; }
    }
  }

  _fire(d, view, muzzleWorld) {
    const cam = this.camera;
    const origin = cam.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const pellets = d.pellets || 1;
    const spread = d.spread * (this.moving ? 1.5 : 1) * (d.spinUp ? 1 : 1);
    for (let i = 0; i < pellets; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      this.shoot(origin, dir, d, i === 0);
    }
    Audio.gunshot(d.sound);
    this.recoilKick = d.recoil;
    this.kick = Math.min(1, this.kick + d.recoil * 20);
    this.trauma = Math.min(1, this.trauma + d.shake);
    // 火光
    this.flashT = 0.045;
    this.flashLight.intensity = 22 * d.flash;
    const vm = this.viewmodels[this.current];
    if (view === 'fps' && vm) {
      const mp = vm.userData.muzzle.clone().applyEuler(vm.rotation).add(vm.position);
      this.flashSprite.position.copy(mp);
      this.flashSprite.scale.setScalar(0.22 * d.flash * (0.8 + Math.random() * 0.4));
      this.flashSprite.material.rotation = Math.random() * Math.PI;
      this.flashSprite.visible = true;
      this.flashLight.position.copy(mp);
      this.lastMuzzle = mp.clone().applyMatrix4(cam.matrixWorld);
      // 抛壳
      const ej = vm.position.clone().add(new THREE.Vector3(0.03, 0.04, -0.05)).applyMatrix4(cam.matrixWorld);
      const vel = right.clone().multiplyScalar(1.4 + Math.random()).addScaledVector(up, 1.6 + Math.random() * 0.8).addScaledVector(fwd, -0.3);
      if (!d.pellets || Math.random() < 0.5) this.effects.casing(ej, vel);
    } else if (muzzleWorld) {
      const mp = muzzleWorld();
      this.worldFlash.position.copy(mp);
      this.worldFlash.scale.setScalar(0.5 * d.flash);
      this.worldFlash.visible = true;
      this.lastMuzzle = mp.clone();
      this.flashLight.intensity = 0;
      this.effects.flashLight(mp, 0xffb050, 10 * d.flash, 0.06, 6);
    }
  }
}
