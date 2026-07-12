import * as THREE from 'three';
import { Audio } from './audio.js';
import { TALISMAN } from './data.js';

// 符纸贴图（复用僵尸符样式）
function talismanTexture() {
  const cv = document.createElement('canvas');
  cv.width = 48; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#e5c85c'; g.fillRect(0, 0, 48, 128);
  g.strokeStyle = '#b71f1f'; g.lineWidth = 3;
  g.strokeRect(3, 3, 42, 122);
  g.fillStyle = '#b71f1f';
  g.font = 'bold 22px serif'; g.textAlign = 'center';
  g.fillText('敕', 24, 26);
  g.fillText('令', 24, 50);
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(24, 58);
  g.bezierCurveTo(10, 74, 38, 88, 14, 102);
  g.bezierCurveTo(34, 110, 18, 118, 26, 124);
  g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 火符：右键投掷 → 抛物线飞行 → 落地/命中爆出真火
export class TalismanSkill {
  constructor(scene, world, zombies, effects, progress) {
    this.scene = scene;
    this.world = world;
    this.zombies = zombies;
    this.effects = effects;
    this.progress = progress;
    this.cooldown = 0;
    this.projectiles = [];
    this.flames = [];       // 爆炸残焰
    this._mat = new THREE.MeshBasicMaterial({ map: talismanTexture(), side: THREE.DoubleSide });
    this._geo = new THREE.PlaneGeometry(0.18, 0.45);
    this.onHit = null;      // (hits) => void
  }

  get maxCooldown() {
    return Math.max(3, TALISMAN.cooldown - this.progress.talismanCdBonus);
  }
  get damage() {
    return TALISMAN.damage + this.progress.talismanDmgBonus;
  }
  get ready() { return this.cooldown <= 0; }

  throw(origin, dir) {
    if (!this.ready) return false;
    this.cooldown = this.maxCooldown;
    const mesh = new THREE.Mesh(this._geo, this._mat);
    mesh.position.copy(origin).addScaledVector(dir, 0.5);
    this.scene.add(mesh);
    const vel = dir.clone().multiplyScalar(TALISMAN.speed);
    vel.y += 2.2;   // 上抛弧线
    this.projectiles.push({ mesh, vel, life: 3 });
    Audio.knifeSwing();
    return true;
  }

  explode(pos) {
    const radius = TALISMAN.radius;
    const hits = this.zombies.fireExplosion(pos, radius, this.damage);
    // 火焰视觉：粒子 + 短暂光源 + 地面残焰
    this.effects._spawnBurst(pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 30,
      [new THREE.MeshBasicMaterial({ color: 0xff7a20 }), new THREE.MeshBasicMaterial({ color: 0xffc040 })],
      this.effects._boxGeo, 5, 4, 0.8);
    const light = new THREE.PointLight(0xff6a20, 60, radius * 3, 1.8);
    light.position.copy(pos).add(new THREE.Vector3(0, 1, 0));
    this.scene.add(light);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, radius, 28),
      new THREE.MeshBasicMaterial({ color: 0xff8830, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.07, pos.z);
    this.scene.add(ring);
    this.flames.push({ light, ring, life: 0.8, maxLife: 0.8 });
    Audio.gunshot('shotgun');
    this.onHit?.(hits);
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.vel.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 9;
      p.mesh.rotation.y += dt * 5;
      // 命中僵尸或落地
      let boom = p.mesh.position.y <= 0.1 || p.life <= 0;
      if (!boom) {
        for (const z of this.zombies.zombies) {
          if (!z.alive) continue;
          const d = Math.hypot(z.group.position.x - p.mesh.position.x, z.group.position.z - p.mesh.position.z);
          const dy = p.mesh.position.y - z.group.position.y;
          if (d < 0.85 && dy > -0.2 && dy < z.cfg.height + 0.4) { boom = true; break; }
        }
      }
      if (boom) {
        p.mesh.position.y = Math.max(0.1, p.mesh.position.y);
        this.explode(p.mesh.position);
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    for (let i = this.flames.length - 1; i >= 0; i--) {
      const f = this.flames[i];
      f.life -= dt;
      const t = Math.max(0, f.life / f.maxLife);
      f.light.intensity = 60 * t;
      f.ring.material.opacity = 0.7 * t;
      f.ring.scale.setScalar(1 + (1 - t) * 0.4);
      if (f.life <= 0) {
        this.scene.remove(f.light);
        this.scene.remove(f.ring);
        this.flames.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    for (const f of this.flames) { this.scene.remove(f.light); this.scene.remove(f.ring); }
    this.projectiles.length = 0;
    this.flames.length = 0;
    this.cooldown = 0;
  }
}
