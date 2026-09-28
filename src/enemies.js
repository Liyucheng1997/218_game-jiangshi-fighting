import * as THREE from 'three';
import { ENEMIES } from './data.js';
import { getTemplate } from './gfx/characters.js';
import { instantiate } from './gfx/rig.js';
import { poseJiangshi, poseHou, poseImp, posePaper, poseGhost, poseWuchang, deathTransform, zeroPose, ease } from './gfx/anim.js';
import { softDotTexture } from './gfx/textures.js';
import { Audio } from './audio.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

let _uid = 1;

// =====================================================================
//  敌人管理：生成（对象池）、AI、程序动画、命中体、状态效果、弹幕
// =====================================================================
export class EnemyManager {
  constructor(scene, world, effects) {
    this.scene = scene;
    this.world = world;
    this.effects = effects;
    this.list = [];
    this.pool = {};
    this.projectiles = [];
    this.telegraphs = [];
    this.decoys = [];            // 纸人替身 { pos, t }
    this.onKill = null;          // (e, info) => void
    this.onDamage = null;        // (e, amount, pos, info) => void
    this.onPlayerHit = null;     // (dmg, fromPos, kind) => void
    this.onBossSpawn = null;
    this.onSummon = null;        // (type, pos) => void
    this.difficulty = { hp: 1, dmg: 1, speed: 1 };
    this.freezeAll = 0;

    const glowTex = softDotTexture();
    this.orbMat = new THREE.SpriteMaterial({ map: glowTex, color: 0x7ab8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.fireMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xff7a20, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.chainMat = new THREE.MeshStandardMaterial({ color: 0x9aa0b0, metalness: 0.9, roughness: 0.3, emissive: 0x203050 });
    this.chainGeo = new THREE.TorusGeometry(0.09, 0.025, 5, 10);
    this.ringGeo = new THREE.RingGeometry(0.9, 1, 48);
    this.discGeo = new THREE.CircleGeometry(1, 48);
    this.lineGeo = new THREE.PlaneGeometry(1, 1);
  }

  get aliveCount() { let n = 0; for (const e of this.list) if (e.alive) n++; return n; }
  get bosses() { return this.list.filter((e) => e.alive && e.cfg.boss); }

  // 预热：提前构建模板，避免首次出现时卡顿
  warm(types) {
    for (const t of types) getTemplate(ENEMIES[t].model);
  }

  _acquire(type) {
    const p = this.pool[type] ||= [];
    let e = p.pop();
    if (!e) {
      const cfg = ENEMIES[type];
      const inst = instantiate(getTemplate(cfg.model));
      e = { id: _uid++, type, cfg, inst, root: inst.root, bones: inst.bones, mats: inst.materials, head: inst.bones.head };
      this.scene.add(e.root);
    }
    e.root.visible = true;
    return e;
  }

  spawn(type, pos, opt = {}) {
    const cfg = ENEMIES[type];
    const e = this._acquire(type);
    const elite = !!opt.elite;
    const scale = cfg.scale * (elite ? 1.18 : 1) * (0.94 + Math.random() * 0.12) * (cfg.boss ? 1 : 1);
    Object.assign(e, {
      alive: true, dying: false, deathT: 0, spawnT: opt.instant ? 0 : 0.9,
      elite, boss: !!cfg.boss, scale,
      maxHp: cfg.hp * (cfg.boss ? (this.difficulty.bossHp ?? 1) : this.difficulty.hp) * (elite ? 3.2 : 1) * (opt.hpMult ?? 1),
      dmgMult: this.difficulty.dmg * (elite ? 1.3 : 1),
      speed: cfg.speed * this.difficulty.speed * (elite ? 1.08 : 1) * (0.92 + Math.random() * 0.16),
      radius: cfg.radius * scale / cfg.scale,
      height: e.inst.template.height * scale,
      vel: new THREE.Vector3(), knock: new THREE.Vector3(), yaw: 0,
      anim: { t: Math.random() * 10, phase: 0, air: -1, landT: 1, atk: -1, hit: 0, cast: -1, mode: 'walk', modeT: 0, seed: Math.random() * 10, speedK: 0, style: '' },
      hopT: Math.random() * 0.3, hopping: false, hopDir: new THREE.Vector3(),
      atkCd: 0.5 + Math.random(), atkT: -1, atkHit: false,
      shotCd: 1.5 + Math.random() * 2, summonCd: 6, specialCd: 3 + Math.random() * 2, chargeT: 0, chargeDir: new THREE.Vector3(),
      mode: 'walk', modeT: 0, strafe: Math.random() < 0.5 ? 1 : -1, blinkDmg: 0, enraged: false,
      status: { stun: 0, root: 0, slow: 0, slowT: 0, burn: 0, burnT: 0, burnTick: 0 },
      flash: 0, hitCd: {}, floatY: cfg.float ?? 0,
    });
    e.hp = e.maxHp;
    e.root.position.set(pos.x, e.spawnT > 0 ? -e.height * 0.9 : e.floatY, pos.z);
    e.root.rotation.set(0, Math.random() * 6, 0);
    e.root.scale.setScalar(scale);
    e.headPos = new THREE.Vector3();
    zeroPose(e.bones);
    for (const m of e.mats) { m.emissive.setHex(elite ? 0x3a0800 : 0x000000); m.emissiveIntensity = 1; }
    e.baseEmissive = elite ? 0x3a0800 : 0x000000;
    // 光环 / 精英标识
    if (cfg.aura && !e.auraMesh) {
      e.auraMesh = new THREE.Mesh(this.discGeo, new THREE.MeshBasicMaterial({ map: this.effects._baguaTex, color: 0xff5010, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      e.auraMesh.rotation.x = -Math.PI / 2;
      this.scene.add(e.auraMesh);
    }
    if (e.auraMesh) { e.auraMesh.visible = true; e.auraMesh.scale.setScalar(cfg.aura.radius); }
    this.list.push(e);
    if (e.spawnT > 0) this.effects.dirtBurst(e.root.position.clone().setY(0.05), 1 + scale * 0.3);
    if (cfg.boss) this.onBossSpawn?.(e);
    return e;
  }

  clear() {
    for (const e of this.list) this._release(e);
    this.list.length = 0;
    for (const p of this.projectiles) this.scene.remove(p.obj);
    this.projectiles.length = 0;
    for (const t of this.telegraphs) this.scene.remove(t.mesh);
    this.telegraphs.length = 0;
    this.decoys.length = 0;
  }

  _release(e) {
    e.root.visible = false;
    if (e.auraMesh) e.auraMesh.visible = false;
    e.alive = false;
    (this.pool[e.type] ||= []).push(e);
  }

  // ---------------------------------------------------------------- 查询
  queryRadius(pos, r, out = []) {
    out.length = 0;
    for (const e of this.list) {
      if (!e.alive) continue;
      const dx = e.root.position.x - pos.x, dz = e.root.position.z - pos.z;
      const rr = r + e.radius;
      if (dx * dx + dz * dz < rr * rr) out.push(e);
    }
    return out;
  }

  nearest(pos, maxD = 30, exclude = null) {
    let best = null, bd = maxD * maxD;
    for (const e of this.list) {
      if (!e.alive || e.spawnT > 0.4 || (exclude && exclude.has(e))) continue;
      const d = e.root.position.distanceToSquared(pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  randomNear(pos, maxD = 20) {
    const c = [];
    for (const e of this.list) if (e.alive && e.spawnT <= 0.4 && e.root.position.distanceTo(pos) < maxD) c.push(e);
    return c.length ? c[Math.floor(Math.random() * c.length)] : null;
  }

  // 最密集处（用于落点类道术）
  densest(pos, maxD = 18, r = 3) {
    let best = null, bc = 0;
    const cand = this.list.filter((e) => e.alive && e.spawnT <= 0.4 && e.root.position.distanceTo(pos) < maxD);
    for (let i = 0; i < Math.min(cand.length, 24); i++) {
      const e = cand[Math.floor(Math.random() * cand.length)];
      let c = 0;
      for (const o of cand) if (o.root.position.distanceToSquared(e.root.position) < r * r) c++;
      if (c > bc) { bc = c; best = e; }
    }
    return best;
  }

  center(e, out = new THREE.Vector3()) {
    return out.set(e.root.position.x, e.root.position.y + e.height * 0.55, e.root.position.z);
  }

  // ---------------------------------------------------------------- 射线命中
  raycast(origin, dir, range, skip = null) {
    let best = null, bestT = range;
    for (const e of this.list) {
      if (!e.alive || (skip && skip.has(e))) continue;
      const p = e.root.position;
      // 头部球
      const hc = e.headPos;
      const hr = 0.14 * e.scale;
      _v.subVectors(origin, hc);
      const b = _v.dot(dir), c = _v.lengthSq() - hr * hr;
      const disc = b * b - c;
      if (disc > 0) {
        const t = -b - Math.sqrt(disc);
        if (t > 0 && t < bestT) { bestT = t; best = { enemy: e, t, headshot: true }; }
      }
      // 躯干竖直圆柱
      const r = e.radius * 0.95;
      const ox = origin.x - p.x, oz = origin.z - p.z;
      const a2 = dir.x * dir.x + dir.z * dir.z;
      if (a2 < 1e-8) continue;
      const b2 = ox * dir.x + oz * dir.z;
      const c2 = ox * ox + oz * oz - r * r;
      const d2 = b2 * b2 - a2 * c2;
      if (d2 < 0) continue;
      const t = (-b2 - Math.sqrt(d2)) / a2;
      if (t <= 0 || t >= bestT) continue;
      const y = origin.y + dir.y * t;
      const bodyTop = hc.y - 0.1 * e.scale;
      if (y < p.y || y > bodyTop) continue;
      bestT = t;
      best = { enemy: e, t, headshot: false };
    }
    if (best) best.point = origin.clone().addScaledVector(dir, best.t);
    return best;
  }

  // ---------------------------------------------------------------- 伤害
  damage(e, amount, info = {}) {
    if (!e.alive || e.dying) return false;
    const type = info.type || 'bullet';
    let dmg = amount;
    if (type === 'bullet' || type === 'melee') dmg *= e.cfg.bulletMult;
    if (type === 'fire') dmg *= e.cfg.fireMult;
    if (info.vsTag && e.cfg.tags.includes(info.vsTag.tag)) dmg *= info.vsTag.mult;
    if (e.spawnT > 0) dmg *= 0.6;
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg;
    if (e.flash <= 0.02) e.flash = 0.1;
    e.anim.hit = Math.min(1, e.anim.hit + (e.boss ? 0.15 : 0.6));
    if (info.knock && info.dir) {
      const k = info.knock * (e.boss ? 0.12 : 1) * (e.elite ? 0.5 : 1);
      e.knock.x += info.dir.x * k * 6; e.knock.z += info.dir.z * k * 6;
    }
    if (info.stun) e.status.stun = Math.max(e.status.stun, info.stun * (e.boss ? 0.25 : 1));
    if (info.root) e.status.root = Math.max(e.status.root, info.root * (e.boss ? 0.3 : 1));
    if (info.slow) { e.status.slow = Math.max(e.status.slow, info.slow); e.status.slowT = Math.max(e.status.slowT, info.slowT ?? 2); }
    if (info.burn) { e.status.burn = Math.max(e.status.burn, info.burn); e.status.burnT = Math.max(e.status.burnT, info.burnT ?? 3); }
    if (e.cfg.ai === 'caster') e.blinkDmg += dmg;
    this.onDamage?.(e, dmg, info.point || this.center(e, new THREE.Vector3()), info);
    if (e.hp <= 0) { this.kill(e, info); return true; }
    return false;
  }

  kill(e, info = {}) {
    if (!e.alive || e.dying) return;
    if (e.auraMesh) e.auraMesh.visible = false;
    e.hp = 0;
    e.dying = true;
    e.deathT = 0;
    e.anim.atk = -1;
    if (e.cfg.burstOnDeath) this.effects.paperBurn(this.center(e, new THREE.Vector3()));
    if (e.cfg.kind === 'ghost' || e.cfg.kind === 'wuWhite' || e.cfg.kind === 'wuBlack') this.effects.soulWisp(this.center(e, new THREE.Vector3()));
    Audio.zombieDie();
    this.onKill?.(e, info);
  }

  // ---------------------------------------------------------------- 弹幕与预警
  telegraph(pos, radius, dur, color = 0xff3020, kind = 'ring', extra = {}) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    let mesh;
    if (kind === 'line') {
      mesh = new THREE.Mesh(this.lineGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = -extra.yaw;
      mesh.scale.set(extra.width, extra.len, 1);
      const c = pos.clone().addScaledVector(extra.dir, extra.len / 2);
      mesh.position.set(c.x, 0.06, c.z);
    } else {
      mesh = new THREE.Mesh(this.discGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(pos.x, 0.06, pos.z);
      mesh.scale.setScalar(radius);
    }
    this.scene.add(mesh);
    this.telegraphs.push({ mesh, t: 0, dur });
  }

  fireOrb(from, target, { speed = 7, dmg = 10, homing = 0.8, color = 0x7ab8ff, size = 0.55, life = 5 } = {}) {
    const sp = new THREE.Sprite(color === 0xff7a20 ? this.fireMat : this.orbMat.clone());
    if (color !== 0xff7a20) sp.material.color.set(color);
    sp.scale.setScalar(size);
    sp.position.copy(from);
    this.scene.add(sp);
    const vel = target.clone().sub(from).normalize().multiplyScalar(speed);
    this.projectiles.push({ obj: sp, vel, dmg, life, homing, speed, radius: 0.35, kind: 'orb' });
  }

  throwChain(from, dir, { speed = 16, dmg = 18 } = {}) {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const l = new THREE.Mesh(this.chainGeo, this.chainMat);
      l.position.z = -i * 0.16; l.rotation.z = (i % 2) * Math.PI / 2;
      g.add(l);
    }
    const hook = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), this.chainMat);
    hook.rotation.x = -Math.PI / 2; hook.position.z = 0.15; g.add(hook);
    g.position.copy(from);
    g.lookAt(from.clone().add(dir));
    g.rotateY(Math.PI);
    this.scene.add(g);
    this.projectiles.push({ obj: g, vel: dir.clone().multiplyScalar(speed), dmg, life: 1.6, homing: 0, speed, radius: 0.5, kind: 'chain' });
    Audio.chain();
  }

  shockwave(pos, radius, dmg, color = 0xff6030) {
    this.effects.shockRing(pos, radius, color);
    this._pendingShock = this._pendingShock || [];
    this._pendingShock.push({ pos: pos.clone(), radius, dmg });
  }

  // ---------------------------------------------------------------- 主更新
  update(dt, player) {
    const ppos = player.position;
    const pfeet = ppos.y - 1.65;
    // 冲击波结算
    if (this._pendingShock?.length) {
      for (const s of this._pendingShock) {
        const d = Math.hypot(ppos.x - s.pos.x, ppos.z - s.pos.z);
        if (d < s.radius && pfeet < 1.0) this.onPlayerHit?.(s.dmg, s.pos, 'shock');
      }
      this._pendingShock.length = 0;
    }
    for (const d of this.decoys) d.t -= dt;
    this.decoys = this.decoys.filter((d) => d.t > 0);

    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.dying) {
        this._updateDeath(e, dt);
        if (e.deathT > 2.6) { list.splice(i, 1); this._release(e); }
        continue;
      }
      this._updateEnemy(e, dt, player);
    }
    this._separate();
    this._updateProjectiles(dt, player);
    this._updateTelegraphs(dt);
  }

  _targetFor(e, ppos) {
    let tgt = ppos, best = e.root.position.distanceToSquared(ppos);
    for (const d of this.decoys) {
      const dd = e.root.position.distanceToSquared(d.pos);
      if (dd < 14 * 14 && dd < best * 1.8) { tgt = d.pos; best = dd; }
    }
    return tgt;
  }

  _updateEnemy(e, dt, player) {
    const cfg = e.cfg, st = e.status, a = e.anim, pos = e.root.position;
    a.t += dt;
    // 状态
    if (st.burnT > 0) {
      st.burnT -= dt; st.burnTick -= dt;
      if (st.burnTick <= 0) { st.burnTick = 0.5; this.damage(e, st.burn * 0.5, { type: 'fire', dot: true }); if (!e.alive || e.dying) return; }
      if (Math.random() < dt * 8) this.effects.ember(this.center(e, _v2).add(_v.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.3) * e.height * 0.5, (Math.random() - 0.5) * 0.5)));
    }
    if (st.slowT > 0) { st.slowT -= dt; if (st.slowT <= 0) st.slow = 0; }
    st.stun = Math.max(0, st.stun - dt);
    st.root = Math.max(0, st.root - dt);
    a.hit = Math.max(0, a.hit - dt * 4);
    // 受击闪白
    if (e.flash > 0) {
      e.flash -= dt;
      const k = Math.max(0, e.flash / 0.1) * (e.boss ? 0.22 : 0.5);
      for (const m of e.mats) m.emissive.setRGB(k + (st.burnT > 0 ? 0.3 : 0), 0.82 * k + (st.root > 0 ? 0.1 : 0), 0.75 * k + (st.root > 0 ? 0.25 : 0));
    } else {
      const glow = st.burnT > 0 ? [0.35, 0.08, 0] : st.root > 0 || st.stun > 0 ? [0.05, 0.12, 0.3] : null;
      for (const m of e.mats) { if (glow) m.emissive.setRGB(...glow); else m.emissive.setHex(e.baseEmissive); }
    }
    // 出土
    if (e.spawnT > 0) {
      e.spawnT -= dt;
      const k = 1 - Math.max(0, e.spawnT) / 0.9;
      pos.y = -e.height * 0.9 * (1 - ease(k)) + e.floatY * k;
      this._pose(e, dt, 0);
      this._updateHead(e);
      return;
    }
    const ppos = player.position;
    const tgt = this._targetFor(e, ppos);
    const toX = tgt.x - pos.x, toZ = tgt.z - pos.z;
    const dist = Math.hypot(toX, toZ) || 0.001;
    const dirX = toX / dist, dirZ = toZ / dist;
    const disabled = st.stun > 0 || this.freezeAll > 0;
    const slowK = (1 - st.slow) * (st.root > 0 ? 0 : 1);
    e.atkCd -= dt;

    // 击退
    pos.x += e.knock.x * dt; pos.z += e.knock.z * dt;
    e.knock.multiplyScalar(Math.max(0, 1 - dt * 7));

    let moveX = 0, moveZ = 0, speedK = 0;
    const face = (x, z, rate = 8) => {
      const target = Math.atan2(x, z);
      let d = target - e.root.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      e.root.rotation.y += d * Math.min(1, dt * rate);
    };

    if (!disabled) {
      switch (cfg.ai) {
        case 'hop': {
          // 蹦跳：落地停顿 → 起跳
          if (e.atkT >= 0) break;
          if (!e.hopping) {
            e.hopT -= dt * (slowK > 0 ? 1 : 0);
            face(dirX, dirZ, 10);
            if (e.hopT <= 0 && slowK > 0) {
              e.hopping = true; e.hopT = 0; e.hopDir.set(dirX, 0, dirZ);
              if (cfg.hop.h > 1) Audio.whoosh();
            }
          } else {
            e.hopT += dt / cfg.hop.t;
            const vh = e.speed * (cfg.hop.t + cfg.hop.rest) / cfg.hop.t * slowK;
            moveX = e.hopDir.x * vh; moveZ = e.hopDir.z * vh;
            speedK = 1;
            if (e.hopT >= 1) { e.hopping = false; e.hopT = cfg.hop.rest * (0.8 + Math.random() * 0.4); a.landT = 0; }
          }
          break;
        }
        case 'run': case 'walk': {
          if (e.atkT >= 0) break;
          const zig = cfg.ai === 'run' ? Math.sin(a.t * 3 + a.seed) * 0.35 : 0;
          const mx = dirX + -dirZ * zig, mz = dirZ + dirX * zig;
          const l = Math.hypot(mx, mz);
          if (dist > cfg.atkRange * 0.7) { moveX = mx / l * e.speed * slowK; moveZ = mz / l * e.speed * slowK; speedK = slowK; }
          face(dirX, dirZ, 10);
          break;
        }
        case 'caster': this._aiCaster(e, dt, player, dist, dirX, dirZ, slowK, face); moveX = e.vel.x; moveZ = e.vel.z; speedK = 0.5; break;
        case 'wuWhite': this._aiWuWhite(e, dt, player, dist, dirX, dirZ, slowK, face); moveX = e.vel.x; moveZ = e.vel.z; speedK = e.vel.length() / e.speed; break;
        case 'wuBlack': this._aiWuBlack(e, dt, player, dist, dirX, dirZ, slowK, face); moveX = e.vel.x; moveZ = e.vel.z; speedK = e.vel.length() / e.speed; break;
        case 'hou': this._aiHou(e, dt, player, dist, dirX, dirZ, slowK, face); moveX = e.vel.x; moveZ = e.vel.z; speedK = Math.min(1, e.vel.length() / e.speed); break;
      }
      // 近战攻击
      if (cfg.ai !== 'caster' && cfg.ai !== 'wuWhite' && e.mode === 'walk') {
        const reach = cfg.atkRange * e.scale / cfg.scale + 0.3;
        if (e.atkT < 0 && dist < reach && e.atkCd <= 0 && !e.hopping) {
          e.atkT = 0; e.atkHit = false; a.atk = 0;
          face(dirX, dirZ, 30);
        }
      }
      // 旱魃：火环
      if (cfg.fireRing) {
        e.specialCd -= dt;
        if (e.specialCd <= 0) {
          e.specialCd = cfg.fireRing.cd * (e.enraged ? 0.7 : 1);
          const c = this.center(e, new THREE.Vector3());
          for (let k = 0; k < cfg.fireRing.count; k++) {
            const ang = (k / cfg.fireRing.count) * Math.PI * 2 + a.t;
            this.fireOrb(c, c.clone().add(_v.set(Math.cos(ang), 0, Math.sin(ang))), { speed: 8, dmg: cfg.fireRing.dmg * e.dmgMult, homing: 0, color: 0xff7a20, size: 0.8, life: 4 });
          }
          Audio.fireball();
        }
      }
    }
    // 攻击进行中
    if (e.atkT >= 0) {
      e.atkT += dt / (cfg.atkTime * (e.enraged ? 0.8 : 1));
      a.atk = e.atkT;
      if (!e.atkHit && e.atkT > 0.45) {
        e.atkHit = true;
        const reach = (cfg.atkRange * e.scale / cfg.scale + 0.5);
        if (tgt === ppos && dist < reach && player.position.y - 1.65 < 1.4) this.onPlayerHit?.(cfg.damage * e.dmgMult, pos, 'melee');
        if (cfg.kind === 'hou' || cfg.kind === 'wuBlack') this.effects.dust(pos.clone().addScaledVector(_v.set(dirX, 0, dirZ), 1.5));
      }
      if (e.atkT >= 1) { e.atkT = -1; a.atk = -1; e.atkCd = cfg.atkTime * 1.1 + Math.random() * 0.5; }
    }

    pos.x += moveX * dt; pos.z += moveZ * dt;
    // 高度
    if (cfg.ai === 'hop') {
      if (e.hopping) { const k = e.hopT; pos.y = 4 * cfg.hop.h * k * (1 - k) * (e.scale / cfg.scale); a.air = k; }
      else { pos.y = 0; a.air = -1; a.landT += dt; }
    } else if (e.floatY) {
      pos.y = e.floatY + Math.sin(a.t * 1.6 + a.seed) * 0.12;
    } else pos.y = 0;
    this.world.collide(pos, e.radius, 0, e.height);
    a.speedK = speedK;
    a.phase += dt * (cfg.ai === 'run' ? 13 : cfg.ai === 'walk' ? 9 : 6) * Math.max(0.2, speedK);
    this._pose(e, dt, speedK);
    this._updateHead(e);
    // 光环
    if (e.auraMesh) {
      e.auraMesh.position.set(pos.x, 0.07, pos.z);
      e.auraMesh.rotation.z += dt * 0.8;
      e.auraMesh.material.opacity = 0.35 + Math.sin(a.t * 4) * 0.12;
      if (Math.random() < dt * 20) { const ang = Math.random() * Math.PI * 2, rr = Math.random() * cfg.aura.radius; this.effects.ember(_v.set(pos.x + Math.cos(ang) * rr, 0.2, pos.z + Math.sin(ang) * rr)); }
    }
    if (cfg.aura && player.alive) {
      const d = Math.hypot(ppos.x - pos.x, ppos.z - pos.z);
      if (d < cfg.aura.radius) this.onPlayerHit?.(cfg.aura.dps * dt * e.dmgMult, pos, 'aura');
    }
  }

  _updateHead(e) {
    e.root.updateMatrixWorld(true);
    e.head.getWorldPosition(e.headPos);
    e.headPos.y += 0.09 * e.scale;
  }

  _pose(e, dt, speedK) {
    const a = e.anim, b = e.bones, kind = e.cfg.kind;
    switch (kind) {
      case 'jiangshi': poseJiangshi(b, a); break;
      case 'hou': a.mode = e.mode; a.modeT = e.modeT; poseHou(b, a); break;
      case 'imp': poseImp(b, a); break;
      case 'paper': posePaper(b, a); break;
      case 'ghost': poseGhost(b, a); break;
      case 'wuWhite': a.mode = e.mode === 'throw' ? 'throw' : 'throw'; poseWuchang(b, a, false); break;
      case 'wuBlack': a.mode = e.mode === 'dash' ? 'dash' : e.mode === 'slamWind' || e.mode === 'slam' ? 'slam' : 'slam'; poseWuchang(b, a, true); break;
    }
    void dt; void speedK;
  }

  _updateDeath(e, dt) {
    e.deathT += dt;
    const k = Math.min(1, e.deathT / 1.0);
    const tr = deathTransform(e.cfg.kind, k);
    e.root.rotation.x = tr.rotX;
    e.root.rotation.z = tr.rotZ;
    const sink = e.deathT > 1.6 ? (e.deathT - 1.6) * 0.9 : 0;
    if (e.cfg.kind === 'ghost' || e.cfg.kind === 'paper') {
      e.root.position.y = (e.floatY || 0) + tr.dy;
      e.root.scale.set(e.scale, e.scale * Math.max(0.02, tr.scaleY), e.scale);
      if (k >= 1) e.root.visible = false;
    } else {
      e.root.position.y = Math.max(e.root.position.y - dt * 4, 0) - sink;
    }
    const f = Math.max(0, 1 - e.deathT * 2);
    for (const m of e.mats) m.emissive.setRGB(0.4 * f, 0.1 * f, 0.05 * f);
  }

  _separate() {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.alive || a.dying || a.spawnT > 0) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.alive || b.dying || b.spawnT > 0) continue;
        const dx = b.root.position.x - a.root.position.x, dz = b.root.position.z - a.root.position.z;
        const rr = (a.radius + b.radius) * 0.9;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (rr - d) * 0.5;
          const wa = a.boss ? 0.1 : 1, wb = b.boss ? 0.1 : 1;
          const nx = dx / d, nz = dz / d;
          a.root.position.x -= nx * push * wa; a.root.position.z -= nz * push * wa;
          b.root.position.x += nx * push * wb; b.root.position.z += nz * push * wb;
        }
      }
    }
  }

  _updateProjectiles(dt, player) {
    const ppos = player.position;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.homing > 0 && p.kind === 'orb') {
        _v.set(ppos.x, ppos.y - 0.5, ppos.z).sub(p.obj.position).normalize().multiplyScalar(p.speed);
        p.vel.lerp(_v, Math.min(1, dt * p.homing));
      }
      p.obj.position.addScaledVector(p.vel, dt);
      if (p.kind === 'orb') {
        p.obj.material.rotation += dt * 4;
        if (Math.random() < dt * 20) this.effects.trail(p.obj.position, p.obj.material.color);
      }
      const dx = ppos.x - p.obj.position.x, dz = ppos.z - p.obj.position.z;
      const dy = (ppos.y - 0.7) - p.obj.position.y;
      let hit = dx * dx + dz * dz < (p.radius + 0.4) ** 2 && Math.abs(dy) < 1.1;
      if (hit && player.alive) this.onPlayerHit?.(p.dmg, p.obj.position, p.kind);
      const hitWall = p.obj.position.y < 0.05 || this.world.obstacles.some((b) => b.containsPoint(p.obj.position));
      if (hit || hitWall || p.life <= 0) {
        if (p.kind === 'orb') this.effects.puff(p.obj.position, p.obj.material.color);
        this.scene.remove(p.obj);
        this.projectiles.splice(i, 1);
      }
    }
  }

  _updateTelegraphs(dt) {
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i];
      t.t += dt;
      const k = t.t / t.dur;
      t.mesh.material.opacity = 0.12 + 0.3 * Math.abs(Math.sin(t.t * 12)) * (0.5 + k);
      if (k >= 1) { this.scene.remove(t.mesh); t.mesh.material.dispose(); this.telegraphs.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------- 特殊 AI
  _aiCaster(e, dt, player, dist, dx, dz, slowK, face) {
    const cfg = e.cfg;
    const want = dist > 13 ? 1 : dist < 7 ? -1 : 0;
    const sx = -dz * e.strafe, sz = dx * e.strafe;
    const sp = e.speed * slowK;
    e.vel.set((dx * want + sx * 0.7) * sp, 0, (dz * want + sz * 0.7) * sp);
    if (Math.random() < dt * 0.3) e.strafe *= -1;
    face(dx, dz, 6);
    e.shotCd -= dt;
    if (e.anim.cast >= 0) { e.anim.cast += dt / 0.7; if (e.anim.cast >= 1) e.anim.cast = -1; }
    if (e.shotCd <= 0 && dist < 22) {
      e.shotCd = cfg.shot.cd * (0.8 + Math.random() * 0.4);
      e.anim.cast = 0;
      const from = this.center(e, new THREE.Vector3()).add(_v.set(dx * 0.5, 0.35, dz * 0.5));
      this.fireOrb(from, player.position.clone().add(_v2.set(0, -0.5, 0)), { speed: cfg.shot.speed, dmg: cfg.shot.dmg * e.dmgMult, homing: 1.1, color: 0x7ab8ff });
      Audio.ghostWail();
    }
    // 受重创瞬移
    if (e.blinkDmg > e.maxHp * 0.35) {
      e.blinkDmg = 0;
      this.effects.puff(this.center(e, new THREE.Vector3()), new THREE.Color(0x8ab0ff), 18);
      const ang = Math.random() * Math.PI * 2;
      e.root.position.x = THREE.MathUtils.clamp(e.root.position.x + Math.cos(ang) * 7, -32, 32);
      e.root.position.z = THREE.MathUtils.clamp(e.root.position.z + Math.sin(ang) * 7, -32, 32);
      this.effects.puff(this.center(e, new THREE.Vector3()), new THREE.Color(0x8ab0ff), 18);
    }
  }

  _aiWuWhite(e, dt, player, dist, dx, dz, slowK, face) {
    const cfg = e.cfg;
    const want = dist > 12 ? 1 : dist < 8 ? -0.8 : 0;
    const sx = -dz * e.strafe, sz = dx * e.strafe;
    const sp = e.speed * slowK * (e.enraged ? 1.25 : 1);
    if (e.mode === 'throw') {
      e.vel.multiplyScalar(0.85);
      e.modeT += dt / 0.9;
      e.anim.atk = e.modeT;
      if (!e.thrown && e.modeT > 0.45) {
        e.thrown = true;
        const from = this.center(e, new THREE.Vector3()).add(_v.set(0, 0.4, 0));
        const aim = player.position.clone().add(_v2.set(0, -0.7, 0)).sub(from).normalize();
        this.throwChain(from, aim, { speed: cfg.chain.speed, dmg: cfg.chain.dmg * e.dmgMult });
        if (e.enraged) {
          for (const off of [-0.25, 0.25]) this.throwChain(from, aim.clone().applyAxisAngle(UP, off), { speed: cfg.chain.speed, dmg: cfg.chain.dmg * e.dmgMult });
        }
      }
      face(dx, dz, 12);
      if (e.modeT >= 1) { e.mode = 'walk'; e.anim.atk = -1; }
      return;
    }
    e.vel.set((dx * want + sx * 0.8) * sp, 0, (dz * want + sz * 0.8) * sp);
    if (Math.random() < dt * 0.25) e.strafe *= -1;
    face(dx, dz, 6);
    e.shotCd -= dt;
    if (e.shotCd <= 0) {
      e.shotCd = cfg.chain.cd * (e.enraged ? 0.65 : 1);
      e.mode = 'throw'; e.modeT = 0; e.thrown = false;
      const from = e.root.position.clone();
      const d = new THREE.Vector3(dx, 0, dz);
      this.telegraph(from, 0, 0.45, 0xa0c0ff, 'line', { dir: d, yaw: Math.atan2(dx, dz), len: 18, width: 0.9 });
    }
    e.summonCd -= dt;
    if (e.summonCd <= 0) {
      e.summonCd = cfg.summon.cd;
      for (let k = 0; k < cfg.summon.count; k++) {
        const ang = Math.random() * Math.PI * 2;
        this.onSummon?.(cfg.summon.type, e.root.position.clone().add(_v.set(Math.cos(ang) * 2.5, 0, Math.sin(ang) * 2.5)));
      }
    }
    if (!e.enraged && e.hp < e.maxHp * 0.5) { e.enraged = true; this.effects.shockRing(e.root.position, 4, 0xa0c0ff); Audio.bossRoar(); }
  }

  _aiWuBlack(e, dt, player, dist, dx, dz, slowK, face) {
    const cfg = e.cfg;
    const sp = e.speed * slowK * (e.enraged ? 1.25 : 1);
    e.specialCd -= dt;
    switch (e.mode) {
      case 'windup':
        e.modeT += dt;
        e.vel.set(0, 0, 0);
        e.anim.atk = 0.2;
        face(e.chargeDir.x, e.chargeDir.z, 20);
        if (e.modeT >= cfg.dash.windup) { e.mode = 'dash'; e.modeT = 0; Audio.whoosh(); }
        break;
      case 'dash': {
        e.modeT += dt;
        e.anim.atk = 0.5;
        e.vel.copy(e.chargeDir).multiplyScalar(cfg.dash.speed);
        if (Math.random() < dt * 30) this.effects.dust(e.root.position.clone());
        const pd = Math.hypot(player.position.x - e.root.position.x, player.position.z - e.root.position.z);
        if (!e.dashHit && pd < 1.5) { e.dashHit = true; this.onPlayerHit?.(cfg.dash.dmg * e.dmgMult, e.root.position, 'dash'); }
        if (e.modeT > 0.6) { e.mode = 'slamWind'; e.modeT = 0; this.telegraph(e.root.position, cfg.slam.radius, 0.6, 0xff4030); }
        break;
      }
      case 'slamWind':
        e.modeT += dt;
        e.vel.multiplyScalar(0.8);
        e.anim.atk = Math.min(0.45, e.modeT / 0.6 * 0.45);
        if (e.modeT >= 0.6) {
          e.mode = 'slam'; e.modeT = 0;
          this.shockwave(e.root.position, cfg.slam.radius, cfg.slam.dmg * e.dmgMult, 0xff5030);
          Audio.slam();
        }
        break;
      case 'slam':
        e.modeT += dt;
        e.anim.atk = 0.45 + Math.min(0.55, e.modeT);
        if (e.modeT > 0.5) { e.mode = 'walk'; e.anim.atk = -1; e.specialCd = cfg.dash.cd * (e.enraged ? 0.6 : 1); }
        break;
      default: {
        e.vel.set(dx * sp, 0, dz * sp);
        if (dist < 2) e.vel.multiplyScalar(0.2);
        face(dx, dz, 8);
        if (e.specialCd <= 0 && dist < 16 && dist > 4) {
          e.mode = 'windup'; e.modeT = 0; e.dashHit = false;
          e.chargeDir.set(dx, 0, dz);
          this.telegraph(e.root.position, 0, cfg.dash.windup + 0.3, 0xff4030, 'line', { dir: e.chargeDir, yaw: Math.atan2(dx, dz), len: 11, width: 1.4 });
        }
      }
    }
    if (!e.enraged && e.hp < e.maxHp * 0.5) { e.enraged = true; this.effects.shockRing(e.root.position, 4, 0xff5030); Audio.bossRoar(); }
  }

  _aiHou(e, dt, player, dist, dx, dz, slowK, face) {
    const cfg = e.cfg;
    const en = e.enraged ? 1.3 : 1;
    const sp = e.speed * slowK * en;
    e.specialCd -= dt;
    e.summonCd -= dt;
    switch (e.mode) {
      case 'roar':
        e.modeT += dt / 1.6;
        e.vel.set(0, 0, 0);
        if (e.modeT >= 1) { e.mode = 'walk'; e.modeT = 0; }
        break;
      case 'windup':
        e.modeT += dt / cfg.charge.windup;
        e.vel.set(0, 0, 0);
        face(e.chargeDir.x, e.chargeDir.z, 20);
        if (e.modeT >= 1) { e.mode = 'charge'; e.modeT = 0; e.dashHit = false; Audio.bossRoar(); }
        break;
      case 'charge': {
        e.modeT += dt / cfg.charge.duration;
        e.vel.copy(e.chargeDir).multiplyScalar(cfg.charge.speed * en);
        if (Math.random() < dt * 40) this.effects.dust(e.root.position.clone());
        const pd = Math.hypot(player.position.x - e.root.position.x, player.position.z - e.root.position.z);
        if (!e.dashHit && pd < 2.2) { e.dashHit = true; this.onPlayerHit?.(cfg.charge.damage * e.dmgMult, e.root.position, 'charge'); }
        if (e.modeT >= 1) { e.mode = 'walk'; e.modeT = 0; e.specialCd = cfg.charge.cd / en; }
        break;
      }
      case 'slam':
        e.modeT += dt / 1.3;
        e.vel.set(0, 0, 0);
        if (!e.slammed && e.modeT > 0.62) {
          e.slammed = true;
          this.shockwave(e.root.position, cfg.slam.radius, cfg.slam.dmg * e.dmgMult, 0xff4020);
          Audio.slam();
          if (e.enraged) {
            for (let k = 0; k < 12; k++) {
              const ang = (k / 12) * Math.PI * 2;
              const c = this.center(e, new THREE.Vector3());
              this.fireOrb(c, c.clone().add(_v.set(Math.cos(ang), 0, Math.sin(ang))), { speed: 9, dmg: 14 * e.dmgMult, homing: 0, color: 0xff7a20, size: 0.8, life: 4 });
            }
          }
        }
        if (e.modeT >= 1) { e.mode = 'walk'; e.modeT = 0; }
        break;
      default: {
        e.vel.set(dx * sp, 0, dz * sp);
        if (dist < 2.5) e.vel.multiplyScalar(0.1);
        face(dx, dz, 5);
        if (e.specialCd <= 0 && e.atkT < 0) {
          if (dist < 7) {
            e.mode = 'slam'; e.modeT = 0; e.slammed = false;
            this.telegraph(e.root.position, cfg.slam.radius, 0.8, 0xff3020);
            e.specialCd = cfg.slam.cd / en;
          } else if (dist < 24) {
            e.mode = 'windup'; e.modeT = 0;
            e.chargeDir.set(dx, 0, dz);
            this.telegraph(e.root.position, 0, cfg.charge.windup, 0xff3020, 'line', { dir: e.chargeDir, yaw: Math.atan2(dx, dz), len: cfg.charge.speed * cfg.charge.duration, width: 2.2 });
          }
        }
        if (e.summonCd <= 0) {
          e.summonCd = cfg.summon.cd;
          for (let k = 0; k < cfg.summon.count + (e.enraged ? 2 : 0); k++) {
            const ang = Math.random() * Math.PI * 2;
            this.onSummon?.(cfg.summon.type, e.root.position.clone().add(_v.set(Math.cos(ang) * 4, 0, Math.sin(ang) * 4)));
          }
        }
      }
    }
    e.anim.mode = e.mode === 'walk' ? (e.vel.lengthSq() > 0.1 ? 'walk' : 'walk') : e.mode;
    if (!e.enraged && e.hp < e.maxHp * 0.5) {
      e.enraged = true; e.mode = 'roar'; e.modeT = 0;
      this.effects.shockRing(e.root.position, 8, 0xff3020);
      Audio.bossRoar();
      for (const m of e.mats) m.emissiveIntensity = 1;
      e.baseEmissive = 0x3a0600;
    }
  }
}
