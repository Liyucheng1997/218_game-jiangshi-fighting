import * as THREE from 'three';
import { Audio } from './audio.js';

const EYE_HEIGHT = 1.65;
const GRAVITY = 22;

export class Player {
  constructor(camera, world, domElement) {
    this.camera = camera;
    this.world = world;
    this.dom = domElement;

    this.position = new THREE.Vector3(0, EYE_HEIGHT, 10);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;            // 面向 -z 场地中心
    this.pitch = 0;
    this.onGround = true;

    this.hp = 100;
    this.maxHp = 100;
    this.alive = true;

    this.keys = {};
    this.locked = false;
    this.enabled = false;

    this.walkSpeed = 5.2;
    this.runSpeed = 8.2;
    this.radius = 0.45;

    this._stepTimer = 0;

    document.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
  }

  onMouseMove(e) {
    if (!this.locked || !this.enabled) return;
    const sens = 0.0021;
    this.yaw -= e.movementX * sens;
    this.pitch -= e.movementY * sens;
    this.pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, this.pitch));
  }

  reset() {
    this.position.set(0, EYE_HEIGHT, 10);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.hp = this.maxHp;
    this.alive = true;
  }

  get isRunning() {
    return (this.keys['ShiftLeft'] || this.keys['ShiftRight']) && this.moving;
  }

  takeDamage(dmg) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - dmg);
    Audio.playerHurt();
    if (this.hp <= 0) this.alive = false;
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  update(dt) {
    if (!this.enabled) return;

    // 朝向（钳制俯仰角——后坐力等外部修改也不能顶过头顶）
    this.pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, this.pitch));
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    // 移动输入
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const move = new THREE.Vector3();
    if (this.keys['KeyW']) move.add(fwd);
    if (this.keys['KeyS']) move.sub(fwd);
    if (this.keys['KeyD']) move.add(right);
    if (this.keys['KeyA']) move.sub(right);
    this.moving = move.lengthSq() > 0;

    const speed = (this.isRunning ? this.runSpeed : this.walkSpeed) * (this.speedMult ?? 1);
    if (this.moving) move.normalize().multiplyScalar(speed);

    // 平滑加速
    const accel = this.onGround ? 14 : 3;
    this.velocity.x += (move.x - this.velocity.x) * Math.min(1, accel * dt);
    this.velocity.z += (move.z - this.velocity.z) * Math.min(1, accel * dt);

    // 跳跃 / 重力
    if (this.keys['Space'] && this.onGround) {
      this.velocity.y = 7.5;
      this.onGround = false;
    }
    this.velocity.y -= GRAVITY * dt;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    if (this.position.y <= EYE_HEIGHT) {
      this.position.y = EYE_HEIGHT;
      this.velocity.y = 0;
      this.onGround = true;
    }

    this.world.collide(this.position, this.radius, this.position.y - EYE_HEIGHT, 1.78);
    this.camera.position.copy(this.position);

    // 视角摆动 + 脚步声
    if (this.moving && this.onGround) {
      this._stepTimer += dt * (this.isRunning ? 2.6 : 1.7);
      this.camera.position.y += Math.sin(this._stepTimer * 7) * 0.035;
      if (Math.sin(this._stepTimer * 7) < -0.985 && this._lastStep !== Math.floor(this._stepTimer * 3.5)) {
        this._lastStep = Math.floor(this._stepTimer * 3.5);
        Audio.footstep();
      }
    }
  }
}
