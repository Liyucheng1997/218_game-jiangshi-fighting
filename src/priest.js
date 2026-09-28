import * as THREE from 'three';
import { getTemplate } from './gfx/characters.js';
import { instantiate } from './gfx/rig.js';
import { legCycle, zeroPose, ease } from './gfx/anim.js';
import { GUN_BUILDERS } from './gfx/guns.js';

// 枪在手骨中的朝向：枪 -Z → 骨 -Y（指尖方向），枪 +Y → 骨 +Z
const GRIP_Q = new THREE.Quaternion(0, Math.SQRT1_2, Math.SQRT1_2, 0);

// 道长化身：程序化蒙皮模型 + 程序动画（走/跑/持枪瞄准/挥剑/施法/受击/阵亡）
export class Priest {
  constructor(scene) {
    this.scene = scene;
    this.inst = instantiate(getTemplate('priest'));
    this.group = this.inst.root;
    this.bones = this.inst.bones;
    this.group.visible = false;
    scene.add(this.group);
    this.guns = {};
    this.weapon = 'mauser';
    this.phase = 0;
    this.t = 0;
    this.castT = -1;
    this.hitT = 0;
    this.deadT = -1;
    this.localVel = new THREE.Vector2();
    this.loaded = true;
  }

  async load() { return true; }

  _gun(id) {
    if (this.guns[id]) return this.guns[id];
    const g = GUN_BUILDERS[id]();
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const holder = new THREE.Group();
    holder.add(g);
    holder.quaternion.copy(GRIP_Q);
    const grip = g.userData.grip.clone().applyQuaternion(GRIP_Q);
    holder.position.set(0, -0.06, 0.012).sub(grip);
    holder.userData.muzzle = g.userData.muzzle.clone();
    holder.userData.gun = g;
    holder.visible = false;
    this.bones.hand_R.add(holder);
    this.guns[id] = holder;
    return holder;
  }

  setWeapon(id) {
    this.weapon = id;
    for (const k in this.guns) this.guns[k].visible = false;
    this._gun(id).visible = true;
  }

  muzzleWorld() {
    const h = this.guns[this.weapon];
    if (!h) return this.group.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    this.group.updateMatrixWorld(true);
    return h.userData.muzzle.clone().applyMatrix4(h.userData.gun.matrixWorld);
  }

  cast() { this.castT = 0; }
  hurt() { this.hitT = 1; }
  die() { this.deadT = 0; }
  revive() { this.deadT = -1; this.group.rotation.x = 0; }

  /**
   * @param s { pos, yaw, pitch, vel(Vector3 世界), running, swingT, dashing }
   */
  update(dt, s) {
    this.t += dt;
    const b = this.bones;
    zeroPose(b);
    this.group.position.set(s.pos.x, s.pos.y - 1.65, s.pos.z);
    this.group.rotation.y = s.yaw + Math.PI;
    // 本地速度（前/右）
    const fwdX = -Math.sin(s.yaw), fwdZ = -Math.cos(s.yaw);
    const fwd = s.vel.x * fwdX + s.vel.z * fwdZ;
    const side = s.vel.x * -fwdZ + s.vel.z * fwdX;
    const speed = Math.hypot(s.vel.x, s.vel.z);
    this.localVel.set(side, fwd);

    if (this.deadT >= 0) {
      this.deadT += dt;
      const k = ease(this.deadT / 0.8);
      this.group.rotation.x = -k * Math.PI / 2 * 0.95;
      b.arm_L.rotation.set(-0.4, 0, 1.2 * k); b.arm_R.rotation.set(-0.4, 0, -1.2 * k);
      b.head.rotation.x = -0.4 * k;
      return;
    }
    this.group.rotation.x = 0;

    // 下半身
    const amt = Math.min(1, speed / 6.5);
    const dirSign = fwd < -0.5 ? -1 : 1;
    this.phase += dt * (4 + speed * 1.55) * dirSign;
    if (speed > 0.3) {
      legCycle(b, this.phase, amt * (s.running ? 1.1 : 0.85), 1.1);
      // 侧移：髋部扭转
      const sideK = THREE.MathUtils.clamp(side / Math.max(1, speed), -1, 1);
      b.hips.rotation.y = sideK * 0.5 * (fwd < 0 ? -1 : 1);
      b.hips.rotation.z = Math.sin(this.phase) * 0.05 * amt;
      b.spine.rotation.y = -b.hips.rotation.y * 0.9;
      b.spine.rotation.x = s.running ? 0.18 : 0.06;
    } else {
      const br = Math.sin(this.t * 1.6) * 0.02;
      b.spine.rotation.x = br;
      b.thigh_L.rotation.z = 0.05; b.thigh_R.rotation.z = -0.05;
    }
    if (s.dashing) { b.spine.rotation.x = 0.45; b.thigh_L.rotation.x = -0.8; b.shin_L.rotation.x = 1.0; b.thigh_R.rotation.x = 0.5; }

    // 上半身瞄准
    const p = s.pitch;
    b.chest.rotation.x = -p * 0.3;
    b.neck.rotation.x = -p * 0.25;
    b.head.rotation.x = -p * 0.3;
    const wep = this.weapon;
    if (wep === 'sword') {
      const k = s.swingT;
      if (k >= 0) {
        const e = ease(k);
        b.arm_R.rotation.set(-1.9 + e * 0.6, 0, 1.5 - e * 2.3);
        b.fore_R.rotation.set(-0.5 + e * 0.4, 0, 0);
        b.spine.rotation.y += 0.6 - e * 1.2;
      } else {
        b.arm_R.rotation.set(-0.9 - p * 0.5, 0, 0.35);
        b.fore_R.rotation.set(-0.9, 0, 0);
        b.hand_R.rotation.set(0.3, 0, 0);
      }
      // 左手剑指
      b.arm_L.rotation.set(-0.5, 0, -0.35);
      b.fore_L.rotation.set(-1.6, 0, 0);
    } else if (wep === 'mauser') {
      b.arm_R.rotation.set(-1.52 - p * 0.9, 0, 0.12);
      b.fore_R.rotation.set(-0.05, 0, 0);
      b.hand_R.rotation.set(0.02, 0, 0);
      b.arm_L.rotation.set(-0.15 + Math.sin(this.phase) * 0.3 * amt, 0, 0.12);
      b.fore_L.rotation.set(-0.4, 0, 0);
      b.chest.rotation.y = 0.25;
    } else {
      // 双手持长枪
      const heavy = wep === 'gatling';
      b.arm_R.rotation.set(-1.15 - p * 0.8, 0, 0.35);
      b.fore_R.rotation.set(-0.75, 0, 0);
      b.hand_R.rotation.set(heavy ? 0.4 : 0.3, 0, 0);
      b.arm_L.rotation.set(-1.25 - p * 0.8, 0, -0.55);
      b.fore_L.rotation.set(-0.45, 0, 0);
      b.chest.rotation.y = 0.35;
      b.spine.rotation.y -= 0.1;
    }
    // 掐诀施法（左手上举）
    if (this.castT >= 0) {
      this.castT += dt / 0.45;
      const k = Math.sin(Math.min(1, this.castT) * Math.PI);
      b.arm_L.rotation.x -= k * 1.8;
      b.arm_L.rotation.z += k * 0.3;
      b.fore_L.rotation.x -= k * 0.8;
      if (this.castT >= 1) this.castT = -1;
    }
    if (this.hitT > 0) {
      this.hitT = Math.max(0, this.hitT - dt * 5);
      b.spine.rotation.x -= this.hitT * 0.3;
      b.head.rotation.x -= this.hitT * 0.3;
    }
  }

  setVisible(v) { this.group.visible = v; }
}
