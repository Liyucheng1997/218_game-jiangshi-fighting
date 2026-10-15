import * as THREE from 'three';
import { Audio } from './audio.js';

export const EYE_HEIGHT = 1.65;
const GRAVITY = 22;

// 第一/第三人称通用控制器：WASD 移动、Shift 疾跑、空格跳、E 罡步冲刺
export class Player {
  constructor(camera, world, domElement) {
    this.camera = camera;
    this.world = world;
    this.dom = domElement;
    this.position = new THREE.Vector3(0, EYE_HEIGHT, 8);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = true;
    this.hp = 100;
    this.maxHp = 100;
    this.alive = true;
    this.keys = {};
    this.locked = false;
    this.enabled = false;
    this.walkSpeed = 5.4;
    this.runSpeed = 8.2;
    this.radius = 0.45;
    this.sensitivity = 1;
    this.invuln = 0;
    this.dashT = 0;
    this.dashCd = 0;
    this.dashDir = new THREE.Vector3();
    this.speedMult = 1;
    this._stepTimer = 0;
    this.dashCdMax = 2.2;
    // 闭气（按住 C）：僵尸嗅不到人气
    this.breathMax = 3.2;
    this.breath = this.breathMax;
    this.holding = false;
    this.breathLock = 0;
    this.onBreath = null;   // (event: 'start' | 'end' | 'gasp')
    // 手柄输入（与键盘并存）
    this.analog = new THREE.Vector2();
    this.pad = { jump: false, sprint: false, breath: false };
    document.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
  }

  onMouseMove(e) {
    if (!this.locked || !this.enabled) return;
    const sens = 0.0021 * this.sensitivity;
    this.yaw -= e.movementX * sens;
    this.pitch -= e.movementY * sens;
    this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
  }

  reset() {
    this.position.set(0, EYE_HEIGHT, 8);
    this.velocity.set(0, 0, 0);
    this.yaw = 0; this.pitch = 0;
    this.hp = this.maxHp;
    this.alive = true;
    this.invuln = 0; this.dashT = 0; this.dashCd = 0;
    this.breath = this.breathMax; this.holding = false; this.breathLock = 0;
  }

  get isRunning() { return (this.keys.ShiftLeft || this.keys.ShiftRight || this.pad.sprint) && this.moving && !this.holding; }
  get dashing() { return this.dashT > 0; }
  get stealth() { return this.holding && this.alive; }

  takeDamage(dmg) {
    if (!this.alive || this.invuln > 0 || this.dashT > 0) return false;
    this.hp = Math.max(0, this.hp - dmg);
    Audio.playerHurt();
    this.invuln = 0.35;
    if (this.hp <= 0) this.alive = false;
    return true;
  }

  heal(amount) { this.hp = Math.min(this.maxHp, this.hp + amount); }

  dash() {
    if (this.dashCd > 0 || !this.alive) return false;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const d = new THREE.Vector3();
    if (this.keys.KeyW) d.add(fwd);
    if (this.keys.KeyS) d.sub(fwd);
    if (this.keys.KeyD) d.add(right);
    if (this.keys.KeyA) d.sub(right);
    if (this.analog.lengthSq() > 0.04) d.addScaledVector(fwd, -this.analog.y).addScaledVector(right, this.analog.x);
    if (d.lengthSq() < 0.01) d.copy(fwd);
    this.dashDir.copy(d.normalize());
    this.dashT = 0.22;
    this.dashCd = this.dashCdMax;
    Audio.dash();
    return true;
  }

  updateBreath(dt) {
    this.breathLock = Math.max(0, this.breathLock - dt);
    const want = (!!this.keys.KeyC || this.pad.breath) && this.breathLock <= 0 && this.alive && this.enabled;
    if (want && this.breath > 0) {
      if (!this.holding) { this.holding = true; this.onBreath?.('start'); }
      this.breath -= dt;
      if (this.breath <= 0) {
        this.breath = 0; this.holding = false; this.breathLock = 2.2;
        this.onBreath?.('gasp');
      }
    } else {
      if (this.holding) { this.holding = false; this.onBreath?.('end'); }
      this.breath = Math.min(this.breathMax, this.breath + dt * this.breathMax / 4.5);
    }
  }

  update(dt) {
    if (!this.enabled) return;
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.updateBreath(dt);
    this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const move = new THREE.Vector3();
    if (this.keys.KeyW) move.add(fwd);
    if (this.keys.KeyS) move.sub(fwd);
    if (this.keys.KeyD) move.add(right);
    if (this.keys.KeyA) move.sub(right);
    let analogK = 1;
    if (this.analog.lengthSq() > 0.0025) {
      move.addScaledVector(fwd, -this.analog.y).addScaledVector(right, this.analog.x);
      analogK = Math.min(1, Math.max(0.35, this.analog.length()));
    }
    this.moving = move.lengthSq() > 0.0025;
    const speed = (this.isRunning ? this.runSpeed : this.walkSpeed) * this.speedMult * (this.holding ? 0.72 : 1) * analogK;
    if (this.moving) move.normalize().multiplyScalar(speed);

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.velocity.x = this.dashDir.x * 22;
      this.velocity.z = this.dashDir.z * 22;
    } else {
      const accel = this.onGround ? 14 : 4;
      this.velocity.x += (move.x - this.velocity.x) * Math.min(1, accel * dt);
      this.velocity.z += (move.z - this.velocity.z) * Math.min(1, accel * dt);
    }
    if ((this.keys.Space || this.pad.jump) && this.onGround) { this.velocity.y = 7.5; this.onGround = false; }
    this.velocity.y -= GRAVITY * dt;
    this.position.addScaledVector(this.velocity, dt);
    if (this.position.y <= EYE_HEIGHT) { this.position.y = EYE_HEIGHT; this.velocity.y = 0; this.onGround = true; }
    this.world.collide(this.position, this.radius, this.position.y - EYE_HEIGHT, 1.78);
    this.camera.position.copy(this.position);

    if (this.moving && this.onGround) {
      this._stepTimer += dt * (this.isRunning ? 2.6 : 1.7);
      const s = Math.sin(this._stepTimer * 7);
      this.bob = s * 0.035;
      if (s < -0.985 && this._lastStep !== Math.floor(this._stepTimer * 3.5)) {
        this._lastStep = Math.floor(this._stepTimer * 3.5);
        if (!this.holding) Audio.footstep(this.isRunning);
      }
    } else this.bob = (this.bob || 0) * 0.9;
  }
}
