import * as THREE from 'three';

// 粒子 & 弹道特效
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];   // {mesh, vel, life, maxLife, gravity}
    this.tracers = [];     // {line, life}

    this._bloodMat = new THREE.MeshBasicMaterial({ color: 0x8f0f0f });
    this._bloodMat2 = new THREE.MeshBasicMaterial({ color: 0x5c0808 });
    this._sparkMat = new THREE.MeshBasicMaterial({ color: 0xffcc66 });
    this._casingMat = new THREE.MeshStandardMaterial({ color: 0xc9a437, roughness: 0.4, metalness: 0.8 });
    this._boxGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    this._sparkGeo = new THREE.BoxGeometry(0.035, 0.035, 0.035);
    this._casingGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.03, 6);
  }

  // 抛壳
  casing(pos, vel) {
    const mesh = new THREE.Mesh(this._casingGeo, this._casingMat);
    mesh.position.copy(pos);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    this.scene.add(mesh);
    this.particles.push({
      mesh, vel: vel.clone(), life: 0.9, maxLife: 0.9, gravity: 11,
      spin: new THREE.Vector3(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10),
    });
  }

  _spawnBurst(pos, count, mats, geo, speed, gravity, life) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mats[i % mats.length]);
      mesh.position.copy(pos);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 0.9 + 0.2,
        (Math.random() - 0.5) * 2
      ).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.8));
      this.scene.add(mesh);
      this.particles.push({ mesh, vel, life, maxLife: life, gravity });
    }
  }

  blood(pos) {
    this._spawnBurst(pos, 14, [this._bloodMat, this._bloodMat2], this._boxGeo, 3.2, 9, 0.55);
  }

  bigBlood(pos) {
    this._spawnBurst(pos, 26, [this._bloodMat, this._bloodMat2], this._boxGeo, 4.5, 9, 0.7);
  }

  sparks(pos) {
    this._spawnBurst(pos, 7, [this._sparkMat], this._sparkGeo, 4, 12, 0.3);
  }

  tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.75 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.06 });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.spin) {
        p.mesh.rotation.x += p.spin.x * dt;
        p.mesh.rotation.y += p.spin.y * dt;
        p.mesh.rotation.z += p.spin.z * dt;
      } else {
        const s = Math.max(0.1, p.life / p.maxLife);
        p.mesh.scale.setScalar(s);
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.particles) this.scene.remove(p.mesh);
    for (const t of this.tracers) this.scene.remove(t.line);
    this.particles.length = 0;
    this.tracers.length = 0;
  }
}
