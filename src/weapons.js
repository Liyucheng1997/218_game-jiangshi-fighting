import * as THREE from 'three';
import { Audio } from './audio.js';

export const WEAPONS = [
  {
    id: 'ak47', name: 'AK-47', slot: '1 AK-47',
    auto: true, fireInterval: 0.11, damage: 28, headshotMult: 2.5,
    magSize: 30, reserve: 240, reloadTime: 1.8,
    spread: 0.016, recoil: 0.02, range: 130,
    sound: 'ak', melee: false, model: 'ak47',
    shake: 0.28, knockback: 0.14, flashScale: 1.5,
  },
  {
    id: 'gatling', name: '加特林 Minigun', slot: '2 加特林',
    auto: true, fireInterval: 0.052, damage: 10, headshotMult: 2,
    magSize: 120, reserve: 480, reloadTime: 3.2,
    spread: 0.045, recoil: 0.005, range: 110,
    sound: 'gatling', melee: false, model: 'gatling',
    shake: 0.13, knockback: 0.05, flashScale: 1.3,
    spinUp: 0.6, moveSlow: 0.55,
  },
  {
    id: 'shotgun', name: '霰弹枪 Shotgun', slot: '3 霰弹',
    auto: false, fireInterval: 0.95, damage: 11, headshotMult: 1.8,
    magSize: 6, reserve: 48, reloadTime: 2.3,
    spread: 0.055, recoil: 0.055, range: 45,
    sound: 'shotgun', melee: false, model: 'shotgun',
    pellets: 8, shake: 0.65, knockback: 0.85, flashScale: 2.0,
  },
  {
    id: 'smg', name: '冲锋枪 SMG', slot: '4 冲锋枪',
    auto: true, fireInterval: 0.095, damage: 14, headshotMult: 2.5,
    magSize: 30, reserve: 150, reloadTime: 1.6,
    spread: 0.022, recoil: 0.011, range: 120,
    sound: 'smg', melee: false, model: 'smg',
    shake: 0.14, knockback: 0.07, flashScale: 1.0,
  },
  {
    id: 'pistol', name: '手枪 Pistol', slot: '5 手枪',
    auto: false, fireInterval: 0.24, damage: 32, headshotMult: 3,
    magSize: 12, reserve: 72, reloadTime: 1.3,
    spread: 0.008, recoil: 0.018, range: 100,
    sound: 'pistol', melee: false, model: 'pistol',
    shake: 0.2, knockback: 0.12, flashScale: 0.9,
  },
  {
    id: 'knife', name: '军刀 Knife', slot: '6 军刀',
    auto: false, fireInterval: 0.45, damage: 75, headshotMult: 1,
    magSize: Infinity, reserve: Infinity, reloadTime: 0,
    spread: 0, recoil: 0, range: 2.4,
    sound: 'knife', melee: true, model: 'knife',
    shake: 0.1, knockback: 0.3,
  },
];

// ===================== 程序化枪模（枪口朝 -Z）=====================
function woodTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#7a4a22'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(${60 + Math.random() * 40},${30 + Math.random() * 22},10,.55)`;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    const y = Math.random() * 64;
    g.moveTo(0, y);
    g.bezierCurveTo(20, y + 6, 44, y - 6, 64, y + 3);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let _mats = null;
function mats() {
  if (_mats) return _mats;
  _mats = {
    metal: new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.42, metalness: 0.75 }),
    metalDark: new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.5, metalness: 0.7 }),
    metalGrey: new THREE.MeshStandardMaterial({ color: 0x4d525a, roughness: 0.38, metalness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.75 }),
    grip: new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.85 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb08d2f, roughness: 0.35, metalness: 0.8 }),
  };
  return _mats;
}

function box(w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}
function cyl(r1, r2, len, mat, x, y, z, alongZ = true, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), mat);
  if (alongZ) m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

// AK-47：木托木护木 + 弯弹匣
function buildAK47() {
  const M = mats();
  const g = new THREE.Group();
  g.add(box(0.07, 0.085, 0.3, M.metal, 0, 0, 0));                    // 机匣
  g.add(box(0.075, 0.02, 0.31, M.metalDark, 0, 0.052, 0));           // 机匣盖
  g.add(box(0.065, 0.065, 0.17, M.wood, 0, -0.002, -0.25));          // 木护木
  g.add(cyl(0.013, 0.013, 0.3, M.metalDark, 0, 0.005, -0.47));       // 枪管
  g.add(cyl(0.009, 0.009, 0.16, M.metalGrey, 0, 0.042, -0.36));      // 导气管
  g.add(box(0.012, 0.05, 0.018, M.metalDark, 0, 0.05, -0.56));       // 准星
  g.add(cyl(0.017, 0.017, 0.06, M.metalGrey, 0, 0.005, -0.63));      // 枪口
  // 弯弹匣（两段折出弧度）
  g.add(box(0.042, 0.13, 0.075, M.metalGrey, 0, -0.1, -0.045, 0.3));
  g.add(box(0.042, 0.1, 0.07, M.metalGrey, 0, -0.19, -0.085, 0.62));
  g.add(box(0.04, 0.105, 0.055, M.grip, 0, -0.09, 0.115, -0.25));    // 握把
  g.add(box(0.05, 0.075, 0.26, M.wood, 0, -0.015, 0.29, 0.06));      // 木托
  g.add(box(0.055, 0.1, 0.03, M.wood, 0, -0.02, 0.42));              // 托底
  return { group: g, len: 0.62, muzzle: [0, 0.01, -0.36] };
}

// 加特林：六管旋转 + 弹箱
function buildGatling() {
  const M = mats();
  const g = new THREE.Group();
  g.add(cyl(0.085, 0.095, 0.24, M.metalDark, 0, 0, 0.1));            // 后机体
  g.add(box(0.06, 0.05, 0.1, M.metalGrey, 0, 0.09, 0.12));           // 顶部提把
  g.add(box(0.11, 0.1, 0.13, M.metalDark, 0, -0.14, 0.1));           // 弹箱
  g.add(box(0.02, 0.05, 0.02, M.brass, 0, -0.07, 0.06, 0.5));        // 供弹带扣
  g.add(box(0.04, 0.09, 0.05, M.grip, 0, -0.1, 0.24, -0.3));         // 握把
  // 旋转管束
  const spin = new THREE.Group();
  spin.position.set(0, 0, -0.18);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    spin.add(cyl(0.015, 0.015, 0.52, M.metalGrey, Math.cos(a) * 0.048, Math.sin(a) * 0.048, -0.1));
  }
  spin.add(cyl(0.072, 0.072, 0.035, M.metalDark, 0, 0, -0.34));      // 前箍环
  spin.add(cyl(0.075, 0.075, 0.035, M.metalDark, 0, 0, -0.02));      // 中箍环
  spin.add(cyl(0.03, 0.03, 0.05, M.metal, 0, 0, 0.1));               // 轴
  g.add(spin);
  return { group: g, len: 0.78, muzzle: [0, 0.05, -0.42], spinGroup: spin };
}

// 霰弹枪：泵动 + 管状弹仓
function buildShotgun() {
  const M = mats();
  const g = new THREE.Group();
  g.add(box(0.058, 0.085, 0.2, M.metal, 0, 0, 0.02));                // 机匣
  g.add(cyl(0.015, 0.015, 0.48, M.metalDark, 0, 0.026, -0.32));      // 枪管
  g.add(cyl(0.0135, 0.0135, 0.4, M.metalGrey, 0, -0.021, -0.29));    // 管状弹仓
  g.add(box(0.055, 0.05, 0.14, M.wood, 0, -0.02, -0.3));             // 泵动护木
  g.add(box(0.012, 0.035, 0.015, M.metalDark, 0, 0.055, -0.54));     // 准星
  g.add(box(0.04, 0.1, 0.05, M.wood, 0, -0.09, 0.12, -0.35));        // 握把颈
  g.add(box(0.05, 0.085, 0.23, M.wood, 0, -0.035, 0.26, 0.1));       // 木托
  return { group: g, len: 0.66, muzzle: [0, 0.025, -0.4] };
}

const BUILDERS = { ak47: buildAK47, gatling: buildGatling, shotgun: buildShotgun };

// ===================== 武器系统 =====================
export class WeaponSystem {
  /**
   * @param shoot (origin, dir, def, first) => void   命中判定回调（霰弹多颗弹丸多次调用，first 标记第一颗）
   */
  constructor(camera, scene, shootCallback) {
    this.camera = camera;
    this.scene = scene;
    this.shoot = shootCallback;

    this.rig = new THREE.Group();
    camera.add(this.rig);

    this.viewmodels = [];
    this.current = 0;
    this.state = WEAPONS.map((w) => ({ mag: w.magSize, reserve: w.reserve }));

    this.cooldown = 0;
    this.reloading = 0;
    this.triggerDown = false;
    this._triggerConsumed = false;
    this.recoilKick = 0;
    this.bobT = 0;
    this.switchAnim = 0;
    this.spin = 0;            // 加特林转速 0..1
    this.trauma = 0;          // 屏幕震动能量（由 main 消费）

    this.flashLight = new THREE.PointLight(0xffb050, 0, 6, 2);
    camera.add(this.flashLight);
    this.flashLight.position.set(0.22, -0.15, -0.9);
    // 枪口火光：径向渐变 + 加法混合
    const fcv = document.createElement('canvas');
    fcv.width = fcv.height = 64;
    const fg = fcv.getContext('2d');
    const grad = fg.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,230,1)');
    grad.addColorStop(0.25, 'rgba(255,210,120,0.9)');
    grad.addColorStop(0.6, 'rgba(255,140,40,0.35)');
    grad.addColorStop(1, 'rgba(255,100,20,0)');
    fg.fillStyle = grad;
    fg.fillRect(0, 0, 64, 64);
    // 十字星芒
    fg.fillStyle = 'rgba(255,240,190,.8)';
    fg.fillRect(30, 4, 4, 56);
    fg.fillRect(4, 30, 56, 4);
    const flashTex = new THREE.CanvasTexture(fcv);
    flashTex.colorSpace = THREE.SRGBColorSpace;
    const flashMat = new THREE.MeshBasicMaterial({
      map: flashTex, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
    });
    this.flashSprite = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
    this.flashSprite.renderOrder = 999;
  }

  buildViewmodels(weaponMeshes) {
    // SMG 几何体是斜挎姿态建模的：先把主轴(经 PCA 测得)对齐到 -Z，再补滚转/偏航
    const smgQuat = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.05)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1.05))
      .multiply(new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0.7373, 0.3064, 0.6021).normalize(),
        new THREE.Vector3(0, 0, -1)
      ));
    const configs = {
      ak47:    { pos: [0.28, -0.26, -0.46], scale: 0.66 },
      gatling: { pos: [0.24, -0.3, -0.44], scale: 0.72 },
      shotgun: { pos: [0.28, -0.26, -0.46], scale: 0.66 },
      smg:     { pos: [0.28, -0.24, -0.52], quat: smgQuat, len: 0.55, muzzle: [0, 0.04, -0.3] },
      pistol:  { pos: [0.24, -0.23, -0.45], rot: [0, Math.PI / 2, 0], len: 0.28, muzzle: [0, 0.05, -0.18] },
      knife:   { pos: [0.27, -0.25, -0.42], rot: [0.25, Math.PI / 2 + 0.4, 0.1], len: 0.36 },
    };

    WEAPONS.forEach((w, i) => {
      const cfg = configs[w.model];
      const holder = new THREE.Group();
      let muzzle = cfg.muzzle || [0, 0.02, -0.3];

      if (BUILDERS[w.model]) {
        // 程序化建模枪械
        const built = BUILDERS[w.model]();
        const s = cfg.scale || 1;
        built.group.scale.setScalar(s);
        built.group.traverse((n) => { if (n.isMesh) { n.layers.set(2); n.frustumCulled = false; } });
        holder.add(built.group);
        muzzle = built.muzzle.map((v) => v * s);
        if (built.spinGroup) holder.userData.spinGroup = built.spinGroup;
      } else {
        // 从角色模型提取的枪械
        const srcObj = weaponMeshes[w.model];
        if (srcObj) {
          const obj = srcObj.clone(true);
          obj.position.set(0, 0, 0);
          obj.rotation.set(0, 0, 0);
          obj.scale.set(1, 1, 1);
          const bbox = new THREE.Box3().setFromObject(obj);
          const size = bbox.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          obj.scale.setScalar(cfg.len / maxDim);
          const bbox2 = new THREE.Box3().setFromObject(obj);
          obj.position.sub(bbox2.getCenter(new THREE.Vector3()));
          obj.traverse((n) => {
            if (n.isMesh) {
              n.castShadow = false;
              n.frustumCulled = false;
              n.layers.set(2);
              if (n.material) { n.material = n.material.clone(); n.material.depthTest = true; }
            }
          });
          const inner = new THREE.Group();
          inner.add(obj);
          if (cfg.quat) inner.quaternion.copy(cfg.quat);
          else inner.rotation.set(cfg.rot[0], cfg.rot[1], cfg.rot[2]);
          holder.add(inner);
        }
      }

      holder.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      holder.userData.muzzle = muzzle;
      holder.visible = i === this.current;
      this.rig.add(holder);
      this.viewmodels[i] = holder;
    });

    // 火光贴到当前武器枪口
    this.attachFlash(this.current);

    // 视模型补光（仅照 layer 2）
    this.camera.layers.enable(2);
    const vmLight = new THREE.DirectionalLight(0xcfd8e8, 2.2);
    vmLight.position.set(0.5, 1, 0.5);
    vmLight.layers.set(2);
    vmLight.target.position.set(0, -0.5, -1);
    this.camera.add(vmLight);
    this.camera.add(vmLight.target);
    const vmFill = new THREE.AmbientLight(0x404858, 1.2);
    vmFill.layers.set(2);
    this.camera.add(vmFill);
    this.flashLight.layers.enable(2);
  }

  attachFlash(i) {
    const vm = this.viewmodels[i];
    if (!vm || WEAPONS[i].melee) return;
    vm.add(this.flashSprite);
    const m = vm.userData.muzzle;
    this.flashSprite.position.set(m[0], m[1], m[2]);
  }

  get def() { return WEAPONS[this.current]; }
  get ammo() { return this.state[this.current]; }

  switchTo(i) {
    if (i === this.current || i < 0 || i >= WEAPONS.length) return;
    Audio.setMinigunSpin(0);
    this.spin = 0;
    this.current = i;
    this.reloading = 0;
    this.cooldown = 0.18;
    this.switchAnim = 0.25;
    this.viewmodels.forEach((v, k) => { if (v) v.visible = k === i; });
    this.attachFlash(i);
  }

  startReload() {
    const w = this.def, s = this.ammo;
    if (w.melee || this.reloading > 0 || s.mag >= w.magSize || s.reserve <= 0) return;
    this.reloading = w.reloadTime;
    Audio.reload();
  }

  refillAll() {
    WEAPONS.forEach((w, i) => { this.state[i].reserve = w.reserve; });
  }

  update(dt, enabled) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.recoilKick = Math.max(0, this.recoilKick - dt * 0.09);
    this.switchAnim = Math.max(0, this.switchAnim - dt);
    this.trauma = Math.max(0, this.trauma - dt * 2.8);

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const w = this.def, s = this.ammo;
        const take = Math.min(w.magSize - s.mag, s.reserve);
        s.mag += take;
        s.reserve -= take;
        this.reloading = 0;
      }
    }

    const w = this.def;

    // 加特林转速
    if (w.spinUp) {
      const wantSpin = enabled && this.triggerDown && this.reloading <= 0 && this.switchAnim <= 0;
      this.spin = Math.max(0, Math.min(1, this.spin + (wantSpin ? dt / w.spinUp : -dt / (w.spinUp * 1.2))));
      Audio.setMinigunSpin(this.spin);
      const sg = this.viewmodels[this.current]?.userData.spinGroup;
      if (sg) sg.rotation.z -= this.spin * dt * 42;
    }

    // 开火
    const wantFire = enabled && this.triggerDown && this.cooldown === 0 && this.reloading <= 0 && this.switchAnim <= 0;
    if (wantFire) {
      const spinReady = !w.spinUp || this.spin >= 0.99;
      if (w.auto || !this._triggerConsumed) {
        if (spinReady) {
          this.fire();
          this._triggerConsumed = true;
        }
      }
    }
    if (!this.triggerDown) this._triggerConsumed = false;

    this.flashLight.intensity *= Math.pow(0.001, dt * 8);
    if (this.flashSprite.material.opacity > 0) {
      this.flashSprite.material.opacity = Math.max(0, this.flashSprite.material.opacity - dt * 14);
    }

    this.animateRig(dt);
  }

  fire() {
    const w = this.def, s = this.ammo;
    if (!w.melee && s.mag <= 0) {
      Audio.dryFire();
      this.cooldown = 0.3;
      if (s.reserve > 0) this.startReload();
      return;
    }

    this.cooldown = w.fireInterval;
    if (!w.melee) s.mag--;

    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const pellets = w.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      if (w.spread > 0) {
        dir.x += (Math.random() - 0.5) * 2 * w.spread;
        dir.y += (Math.random() - 0.5) * 2 * w.spread;
        dir.z += (Math.random() - 0.5) * 2 * w.spread;
        dir.normalize();
      }
      this.shoot(origin, dir, w, p === 0);
    }

    if (w.melee) {
      Audio.knifeSwing();
      this._meleeAnim = 0.2;
    } else {
      Audio.gunshot(w.sound);
      this.recoilKick = Math.min(0.07, this.recoilKick + w.recoil);
      this.flashLight.intensity = 12 + (w.flashScale || 1) * 6;
      this.flashSprite.material.opacity = 0.95;
      this.flashSprite.scale.setScalar(w.flashScale || 1);
      this.flashSprite.rotation.z = Math.random() * Math.PI;
    }
    this.trauma = Math.min(1, this.trauma + (w.shake || 0.1));
  }

  animateRig(dt) {
    const vm = this.viewmodels[this.current];
    if (!vm) return;

    this.bobT += dt * (this._moving ? (this._running ? 11 : 7.5) : 2);
    const bobX = Math.sin(this.bobT) * (this._moving ? 0.012 : 0.003);
    const bobY = Math.abs(Math.cos(this.bobT)) * (this._moving ? 0.014 : 0.004);

    let oz = 0, oy = 0, rx = 0;
    oz = this.recoilKick * 1.6;
    rx = this.recoilKick * 2.2;
    if (this.reloading > 0) {
      const w = this.def;
      const t = 1 - this.reloading / w.reloadTime;
      const dip = Math.sin(Math.min(1, t * 1.15) * Math.PI);
      oy -= dip * 0.18;
      rx -= dip * 0.9;
    }
    if (this.switchAnim > 0) oy -= this.switchAnim * 1.2;
    if (this._meleeAnim > 0) {
      this._meleeAnim -= dt;
      const t = Math.max(0, this._meleeAnim) / 0.2;
      rx -= Math.sin((1 - t) * Math.PI) * 1.1;
      oz -= Math.sin((1 - t) * Math.PI) * 0.2;
    }
    // 加特林转起来时的持续微震
    if (this.def.spinUp && this.spin > 0.1) {
      oy += (Math.random() - 0.5) * 0.004 * this.spin;
      oz += (Math.random() - 0.5) * 0.003 * this.spin;
    }

    this.rig.position.set(bobX, bobY * 0.5 + oy * 0.3, 0);
    if (vm.userData.baseY === undefined) vm.userData.baseY = vm.position.y;
    if (vm.userData.baseZ === undefined) vm.userData.baseZ = vm.position.z;
    vm.position.y = vm.userData.baseY + oy;
    vm.position.z = vm.userData.baseZ + oz;
    vm.rotation.x = rx;
  }

  setMoveState(moving, running) {
    this._moving = moving;
    this._running = running;
  }
}
