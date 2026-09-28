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
  }

  get isRunning() { return (this.keys.ShiftLeft || this.keys.ShiftRight) && this.moving; }
  get dashing() { return this.dashT > 0; }

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
    if (d.lengthSq() < 0.01) d.copy(fwd);
    this.dashDir.copy(d.normalize());
    this.dashT = 0.22;
    this.dashCd = 2.2;
    Audio.dash();
    return true;
  }

  update(dt) {
    if (!this.enabled) return;
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const move = new THREE.Vector3();
    if (this.keys.KeyW) move.add(fwd);
    if (this.keys.KeyS) move.sub(fwd);
    if (this.keys.KeyD) move.add(right);
    if (this.keys.KeyA) move.sub(right);
    this.moving = move.lengthSq() > 0;
    const speed = (this.isRunning ? this.runSpeed : this.walkSpeed) * this.speedMult;
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
    if (this.keys.Space && this.onGround) { this.velocity.y = 7.5; this.onGround = false; }
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
        Audio.footstep();
      }
    } else this.bob = (this.bob || 0) * 0.9;
  }
}
