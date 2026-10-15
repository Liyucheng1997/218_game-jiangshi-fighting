import * as THREE from 'three';
import { ENEMIES, AFFIXES } from './data.js';
import { getTemplate } from './gfx/characters.js';
import { instantiate } from './gfx/rig.js';
import { poseJiangshi, poseHou, poseImp, posePaper, poseGhost, poseWuchang, poseSoldier, poseSorcerer, poseBeast, poseStagger, deathTransform, zeroPose, ease } from './gfx/anim.js';
import { softDotTexture } from './gfx/textures.js';
import { Audio } from './audio.js';
import { BOSS_AI } from './bosses.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

let _uid = 1;

// 死亡溶解的余烬颜色
const DISSOLVE = {
  jiangshi: new THREE.Color(1.0, 0.42, 0.12), hou: new THREE.Color(1.0, 0.22, 0.06), imp: new THREE.Color(0.35, 1.0, 0.45),
  paper: new THREE.Color(1.0, 0.6, 0.15), ghost: new THREE.Color(0.55, 0.75, 1.0), wuWhite: new THREE.Color(0.7, 0.85, 1.0),
  wuBlack: new THREE.Color(0.5, 0.6, 1.0), soldier: new THREE.Color(0.4, 0.9, 1.0), sorcerer: new THREE.Color(0.75, 0.3, 1.0),
};
const BLOOD = { jiangshi: 0x3a0606, hou: 0x2a0404, imp: 0x0a2a0a, paper: 0x050403, ghost: 0x0a1a3a, wuWhite: 0x101a2a, wuBlack: 0x0a0a1a, soldier: 0x0a1a24, sorcerer: 0x1a0a24 };
// 首领轮廓光（线性色）：夜景与浓雾里也要一眼认出首领的剪影
const BOSS_RIM = {
  jiangshi: new THREE.Color(0.55, 0.16, 0.03), hou: new THREE.Color(0.5, 0.08, 0.03), wuWhite: new THREE.Color(0.3, 0.4, 0.6),
  wuBlack: new THREE.Color(0.35, 0.3, 0.6), sorcerer: new THREE.Color(0.32, 0.12, 0.6), beast: new THREE.Color(0.5, 0.16, 0.9),
};

// =====================================================================
//  敌人管理：生成（对象池）、AI、程序动画、命中体、状态效果、弹幕、
//  精英词缀、首领破绽与阶段、场地危险区、定时事件、死亡溶解
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
    this.hazards = [];
    this.events = [];
    this.decoys = [];
    this.onKill = null;          // (e, info)
    this.onDamage = null;        // (e, amount, pos, info)
    this.onPlayerHit = null;     // (dmg, fromPos, kind)
    this.onBossSpawn = null;
    this.onSummon = null;        // (type, pos) => e
    this.onPhase = null;         // (e, phase)
    this.onStagger = null;       // (e)
    this.onShake = null;         // (amount)
    this.onWardBreak = null;
    this.difficulty = { hp: 1, dmg: 1, speed: 1, aggro: 1, tele: 1, affixes: 1 };
    this.freezeAll = 0;
    this.time = 0;

    const glowTex = softDotTexture();
    this.orbMat = new THREE.SpriteMaterial({ map: glowTex, color: 0x7ab8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.fireMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xff7a20, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.chainMat = new THREE.MeshStandardMaterial({ color: 0x9aa0b0, metalness: 0.9, roughness: 0.3, emissive: 0x203050 });
    this.chainGeo = new THREE.TorusGeometry(0.09, 0.025, 5, 10);
    this.swordGeo = new THREE.BoxGeometry(0.035, 0.012, 0.9);
    this.swordGeo.translate(0, 0, -0.2);
    this.swordMat = new THREE.MeshStandardMaterial({ color: 0x120c18, metalness: 0.9, roughness: 0.25, emissive: 0x7a20d0, emissiveIntensity: 1.6 });
    this.discGeo = new THREE.CircleGeometry(1, 48);
    this.wardGeo = new THREE.PlaneGeometry(0.16, 0.38);
    this.wardMat = new THREE.MeshStandardMaterial({ color: 0xe8c64e, emissive: 0x6a4a00, emissiveIntensity: 1.2, side: THREE.DoubleSide, roughness: 0.8 });

    // 脚底接触阴影（实例化，单 draw call）
    this.BLOBS = 120;
    const blobTex = softDotTexture('rgba(0,0,0,0.85)', 'rgba(0,0,0,0)');
    const bg = new THREE.PlaneGeometry(1, 1);
    bg.rotateX(-Math.PI / 2);
    this.blobs = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), this.BLOBS);
    this.blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.blobs.frustumCulled = false;
    this.blobs.count = 0;
    this.blobs.renderOrder = 1;
    scene.add(this.blobs);
  }

  get aliveCount() { let n = 0; for (const e of this.list) if (e.alive) n++; return n; }
  get bosses() { return this.list.filter((e) => e.alive && e.cfg.boss); }
  T(x) { return x * (this.difficulty.tele ?? 1); }

  warm(types) {
    for (const t of types) {
      getTemplate(ENEMIES[t].model);
      if (t === 'sorcerer') getTemplate('sorcererBeast');
    }
  }

  _acquire(type) {
    const p = this.pool[type] ||= [];
    let e = p.pop();
    if (!e) {
      const cfg = ENEMIES[type];
      const inst = instantiate(getTemplate(cfg.model));
      e = { id: _uid++, type, cfg, inst, root: inst.root, bones: inst.bones, mats: inst.materials, head: inst.bones.head, form: 'base' };
      this.scene.add(e.root);
      if (type === 'sorcerer') {
        e.altInst = instantiate(getTemplate('sorcererBeast'));
        e.altInst.root.visible = false;
        this.scene.add(e.altInst.root);
      }
    }
    if (e.form === 'beast') this.swapForm(e);
    e.root.visible = true;
    return e;
  }

  // 玄阴子：人形 ↔ 尸化 共用同一实体（血条、状态延续）
  swapForm(e) {
    const cur = e.inst, alt = e.altInst;
    if (!alt) return;
    alt.root.position.copy(cur.root.position);
    alt.root.rotation.copy(cur.root.rotation);
    alt.root.scale.setScalar(e.scale);
    cur.root.visible = false; alt.root.visible = true;
    e.altInst = cur; e.inst = alt;
    e.root = alt.root; e.bones = alt.bones; e.mats = alt.materials; e.head = alt.bones.head;
    e.form = e.form === 'beast' ? 'base' : 'beast';
    alt.uber.uRimExtra.value.copy(e.form === 'beast' ? BOSS_RIM.beast : (BOSS_RIM[e.cfg.kind] || BOSS_RIM.jiangshi));
    alt.uber.uDissolveColor.value.copy(cur.uber.uDissolveColor.value);
    e.height = alt.template.height * e.scale;
    e.radius = (e.form === 'beast' ? 0.85 : e.cfg.radius) * e.scale;
    zeroPose(e.bones);
  }

  _rollAffixes(cfg, n) {
    const keys = Object.keys(AFFIXES).filter((k) => !(k === 'summoner' && cfg.kind === 'imp') && !(k === 'splitter' && cfg.kind === 'soldier'));
    const out = [];
    while (out.length < n && keys.length) out.push(keys.splice(Math.floor(Math.random() * keys.length), 1)[0]);
    return out;
  }

  spawn(type, pos, opt = {}) {
    const cfg = ENEMIES[type];
    const e = this._acquire(type);
    const D = this.difficulty;
    const elite = !!opt.elite;
    const scale = cfg.scale * (elite ? 1.18 : 1) * (opt.scale ?? (0.94 + Math.random() * 0.12));
    const affixes = elite ? this._rollAffixes(cfg, D.affixes ?? 1) : (opt.affixes || []);
    Object.assign(e, {
      alive: true, dying: false, deathT: 0, spawnT: opt.instant ? 0 : 0.9,
      elite, boss: !!cfg.boss, scale, affixes,
      maxHp: cfg.hp * (cfg.boss ? (D.bossHp ?? 1) : D.hp) * (elite ? 3.2 : 1) * (opt.hpMult ?? 1),
      dmgMult: D.dmg * (elite ? 1.3 : 1),
      speed: cfg.speed * D.speed * (elite ? 1.08 : 1) * (0.92 + Math.random() * 0.16) * (affixes.includes('swift') ? 1.4 : 1),
      atkSpeed: (D.aggro ?? 1) * (affixes.includes('swift') ? 1.25 : 1),
      radius: cfg.radius * scale / cfg.scale,
      height: e.inst.template.height * scale,
      vel: new THREE.Vector3(), knock: new THREE.Vector3(), yaw: 0,
      anim: { t: Math.random() * 10, phase: 0, air: -1, landT: 1, atk: -1, hit: 0, cast: -1, mode: 'walk', modeT: 0, seed: Math.random() * 10, speedK: 0, style: '' },
      hopT: Math.random() * 0.3, hopping: false, hopDir: new THREE.Vector3(),
      atkCd: 0.5 + Math.random(), atkT: -1, atkHit: false,
      shotCd: 1.5 + Math.random() * 2, summonCd: 6, specialCd: 3 + Math.random() * 2, chargeDir: new THREE.Vector3(),
      mode: 'walk', modeT: 0, strafe: Math.random() < 0.5 ? 1 : -1, blinkDmg: 0, enraged: false,
      status: { stun: 0, root: 0, slow: 0, slowT: 0, burn: 0, burnT: 0, burnTick: 0 },
      flash: 0, hitCd: {}, floatY: cfg.float ?? 0,
      posture: 0, postureMax: cfg.posture ? cfg.posture * (D.bossHp ?? 1) : 0, postureIdle: 0, staggerT: 0, staggers: 0,
      phase: 0, invulnT: 0, lost: 0, lostT: 0, sniffYaw: 0,
      slot: (e.id * 2.39996) % (Math.PI * 2), growlT: 2 + Math.random() * 8, tellT: 0,
      ward: affixes.includes('warded') ? 0 : 0, wardMax: 0, summonT: 5 + Math.random() * 3, partnerDead: false, ai: {},
      headPopped: false, dissolving: false,
    });
    e.hp = e.maxHp;
    if (affixes.includes('warded')) { e.wardMax = e.maxHp * 0.5; e.ward = e.wardMax; this._makeWard(e); }
    e.label = elite ? affixes.map((a) => AFFIXES[a].name).join('·') + ' ' + cfg.name : '';
    e.root.position.set(pos.x, e.spawnT > 0 ? -e.height * 0.9 : e.floatY, pos.z);
    e.root.rotation.set(0, Math.random() * 6, 0);
    e.root.scale.setScalar(scale);
    e.headPos = new THREE.Vector3();
    zeroPose(e.bones);
    e.head.scale.setScalar(1);
    const U = e.inst.uber;
    U.uDissolve.value = 0; U.uAir.value = 0; U.uWind.value = 0;
    U.uDissolveColor.value.copy(DISSOLVE[cfg.kind] || DISSOLVE.jiangshi);
    if (elite) U.uRimExtra.value.set(AFFIXES[affixes[0]].color).multiplyScalar(0.55);
    else if (cfg.boss) U.uRimExtra.value.copy(BOSS_RIM[cfg.kind] || BOSS_RIM.jiangshi);
    else U.uRimExtra.value.set(0x000000);
    for (const m of e.inst.meshes) m.castShadow = true;
    e.castsShadow = true;
    for (const m of e.mats) { m.emissive.setHex(elite ? 0x2a0600 : 0x000000); m.emissiveIntensity = 1; }
    e.baseEmissive = elite ? 0x2a0600 : 0x000000;
    if (cfg.aura && !e.auraMesh) {
      e.auraMesh = new THREE.Mesh(this.discGeo, new THREE.MeshBasicMaterial({ map: this.effects._baguaTex, color: 0xff5010, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      e.auraMesh.rotation.x = -Math.PI / 2;
      this.scene.add(e.auraMesh);
    }
    if (e.auraMesh) { e.auraMesh.visible = true; e.auraMesh.scale.setScalar(cfg.aura.radius); }
    this.list.push(e);
    if (e.spawnT > 0) {
      this.effects.dirtBurst(e.root.position.clone().setY(0.05), 1 + scale * 0.3);
      this.effects.decal(e.root.position, 1.1 + scale * 0.5, 0x050403);
    }
    if (cfg.boss) this.onBossSpawn?.(e);
    return e;
  }

  // 符护：环绕的符纸
  _makeWard(e) {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(this.wardGeo, this.wardMat);
      m.userData.a = (i / 4) * Math.PI * 2;
      g.add(m);
    }
    this.scene.add(g);
    e.wardObj = g;
  }
  _dropWard(e) {
    if (e.wardObj) { this.scene.remove(e.wardObj); e.wardObj = null; }
  }

  clear() {
    for (const e of this.list) this._release(e);
    this.list.length = 0;
    for (const p of this.projectiles) this.scene.remove(p.obj);
    this.projectiles.length = 0;
    for (const t of this.telegraphs) this._dropTelegraph(t);
    this.telegraphs.length = 0;
    for (const h of this.hazards) h.dispose?.();
    this.hazards.length = 0;
    this.events.length = 0;
    this.decoys.length = 0;
    this.blobs.count = 0;
  }

  _release(e) {
    e.root.visible = false;
    if (e.auraMesh) e.auraMesh.visible = false;
    this._dropWard(e);
    e.alive = false;
    if (e.form === 'beast') this.swapForm(e);
    if (e.altInst) e.altInst.root.visible = false;
    e.root.visible = false;
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
      const hc = e.headPos;
      if (!e.headPopped) {
        const hr = 0.15 * e.scale;
        _v.subVectors(origin, hc);
        const b = _v.dot(dir), c = _v.lengthSq() - hr * hr;
        const disc = b * b - c;
        if (disc > 0) {
          const t = -b - Math.sqrt(disc);
          if (t > 0 && t < bestT) { bestT = t; best = { enemy: e, t, headshot: true }; }
        }
      }
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
    const pos = info.point || this.center(e, new THREE.Vector3());
    if (e.invulnT > 0) { this.onDamage?.(e, 0, pos, { ...info, immune: true }); return false; }
    let dmg = amount;
    const physical = type === 'bullet' || type === 'melee';
    if (physical) dmg *= e.cfg.bulletMult;
    if (type === 'fire') dmg *= e.cfg.fireMult;
    if (info.vsTag && e.cfg.tags.includes(info.vsTag.tag)) dmg *= info.vsTag.mult;
    // 阴兵正面持盾
    if (physical && e.cfg.shield && info.dir && e.staggerT <= 0 && e.status.stun <= 0) {
      const fx = Math.sin(e.root.rotation.y), fz = Math.cos(e.root.rotation.y);
      const l = Math.hypot(info.dir.x, info.dir.z) || 1;
      const front = -(info.dir.x * fx + info.dir.z * fz) / l;
      if (front > Math.cos(e.cfg.shield.arc * 0.5)) { dmg *= e.cfg.shield.mult; info.blocked = true; }
    }
    if (physical && e.affixes.includes('armored')) dmg *= 0.5;
    if (e.staggerT > 0) dmg *= 1.6;
    if (e.spawnT > 0) dmg *= 0.6;
    dmg = Math.max(1, Math.round(dmg));
    if (e.flash <= 0.02) e.flash = 0.1;
    // 符护先吸收
    if (e.ward > 0) {
      e.ward -= dmg * (type === 'fire' || type === 'art' ? 1.5 : 0.35);
      this.onDamage?.(e, dmg, pos, { ...info, warded: true });
      if (e.ward <= 0) {
        e.ward = 0;
        this._dropWard(e);
        this.effects.gold(this.center(e, _v2), 40, 1.6);
        this.effects.shockRing(e.root.position, 2.4, 0xffd060, 0.4);
        Audio.shieldBreak();
        this.onWardBreak?.(e);
      }
      return false;
    }
    e.hp -= dmg;
    e.anim.hit = Math.min(1, e.anim.hit + (e.boss ? 0.15 : info.blocked ? 0.1 : 0.6));
    if (info.knock && info.dir && !info.blocked) {
      const k = info.knock * (e.boss ? 0.12 : 1) * (e.elite ? 0.5 : 1);
      e.knock.x += info.dir.x * k * 6; e.knock.z += info.dir.z * k * 6;
    }
    if (info.stun) e.status.stun = Math.max(e.status.stun, info.stun * (e.boss ? 0.25 : 1));
    if (info.root) e.status.root = Math.max(e.status.root, info.root * (e.boss ? 0.3 : 1));
    if (info.slow) { e.status.slow = Math.max(e.status.slow, info.slow); e.status.slowT = Math.max(e.status.slowT, info.slowT ?? 2); }
    if (info.burn) { e.status.burn = Math.max(e.status.burn, info.burn); e.status.burnT = Math.max(e.status.burnT, info.burnT ?? 3); }
    if (e.cfg.ai === 'caster' || e.cfg.ai === 'sorcerer') e.blinkDmg += dmg;
    // 首领破绽
    if (e.postureMax && e.staggerT <= 0 && !info.dot) {
      e.posture += dmg * (info.headshot ? 1.5 : 1) * (type === 'fire' || type === 'art' ? 1.25 : 1) * (info.crit ? 1.2 : 1);
      e.postureIdle = 0;
      if (e.posture >= e.postureMax) this._stagger(e);
    }
    this.onDamage?.(e, dmg, pos, info);
    if (e.hp <= 0) { this.kill(e, info); return true; }
    return false;
  }

  _stagger(e) {
    e.posture = 0;
    e.staggerT = 4.2;
    e.staggers++;
    e.mode = 'stagger'; e.modeT = 0;
    e.atkT = -1; e.anim.atk = -1;
    e.vel.set(0, 0, 0);
    this.effects.shockRing(e.root.position, 3.5, 0xffe080, 0.5);
    this.effects.gold(this.center(e, _v2), 50, 2);
    Audio.stagger();
    this.onStagger?.(e);
  }

  kill(e, info = {}) {
    if (!e.alive || e.dying) return;
    if (e.auraMesh) e.auraMesh.visible = false;
    this._dropWard(e);
    e.hp = 0;
    e.dying = true;
    e.deathT = 0;
    e.anim.atk = -1;
    e.dissolving = false;
    e.staggerT = 0;
    const kind = e.cfg.kind;
    const c = this.center(e, new THREE.Vector3());
    // 爆头：头颅崩碎、官帽飞出
    if (info.headshot && !e.boss && (kind === 'jiangshi' || kind === 'imp' || kind === 'soldier')) {
      e.headPopped = true;
      const hp = e.headPos.clone();
      e.head.scale.setScalar(0.001);
      const dir = info.dir ? _v2.set(info.dir.x, 0, info.dir.z).normalize() : null;
      this.effects.fountain(hp.clone().add(_v.set(0, -0.12 * e.scale, 0)), dir, kind === 'imp' ? [0.1, 0.5, 0.15] : kind === 'soldier' ? [0.2, 0.5, 0.7] : [0.4, 0.02, 0.03]);
      if (kind === 'jiangshi') this.effects.hatFly(hp, _v.set((dir?.x ?? 0) * 3 + (Math.random() - 0.5) * 2, 4 + Math.random() * 2, (dir?.z ?? 0) * 3 + (Math.random() - 0.5) * 2));
      this.effects.blood(hp, 18, dir);
    }
    if (e.cfg.burstOnDeath) this.effects.paperBurn(c);
    if (kind === 'ghost' || kind === 'wuWhite' || kind === 'wuBlack') this.effects.soulWisp(c);
    this.effects.decal(e.root.position, 0.9 + e.radius * 1.6, BLOOD[kind] ?? 0x3a0606);
    // 词缀：尸爆 / 分身
    if (e.affixes.includes('volatile')) {
      const p = e.root.position.clone();
      this.telegraph(p, 3.4, 0.9, 0xff6020);
      this.later(0.9, () => {
        this.effects.fireBurst(p, 3.4);
        Audio.explosion(p);
        this.onShake?.(0.3);
        this._areaHit(p, 3.4, 26 * e.dmgMult, 'volatile');
        for (const o of this.queryRadius(p, 3.4)) if (o !== e) this.damage(o, 80, { type: 'fire', knock: 1, dir: o.root.position.clone().sub(p).setY(0).normalize() });
      });
    }
    if (e.affixes.includes('splitter')) {
      for (let k = 0; k < 2; k++) {
        const a = Math.random() * Math.PI * 2;
        this.spawn(e.type, e.root.position.clone().add(_v.set(Math.cos(a) * 1.2, 0, Math.sin(a) * 1.2)), { scale: 0.72, hpMult: 0.35, instant: true });
      }
      this.effects.puff(c, new THREE.Color(0.75, 0.6, 1), 20);
    }
    // 黑白无常：一方陨落，另一方暴怒
    if (kind === 'wuWhite' || kind === 'wuBlack') {
      for (const o of this.list) {
        if (o !== e && o.alive && !o.dying && (o.cfg.kind === 'wuWhite' || o.cfg.kind === 'wuBlack')) {
          o.partnerDead = true; o.enraged = true;
          o.speed *= 1.2; o.atkSpeed *= 1.25;
          this.effects.shockRing(o.root.position, 6, 0xa0c0ff, 0.7);
          Audio.bossRoar(o.root.position);
          this.onPhase?.(o, 'partner');
        }
      }
    }
    Audio.zombieDie(e.root.position, kind);
    this.onKill?.(e, info);
  }

  // 范围伤害（对玩家）
  _areaHit(pos, r, dmg, kind = 'shock') {
    this._pendingShock = this._pendingShock || [];
    this._pendingShock.push({ pos: pos.clone(), radius: r, dmg, kind });
  }

  later(t, fn) { this.events.push({ t, fn }); }

  // ---------------------------------------------------------------- 预警（逐渐填充的地面纹样）
  telegraph(pos, radius, dur, color = 0xff3020, kind = 'ring', extra = {}) {
    const shape = kind === 'line' ? 'rect' : kind === 'cone' ? 'cone' : 'circle';
    const mesh = this.effects.telegraphMesh(shape, color, extra);
    mesh.rotation.x = -Math.PI / 2;
    if (shape === 'rect') {
      mesh.rotation.z = -extra.yaw;
      mesh.scale.set(extra.width, extra.len, 1);
      const c = pos.clone().addScaledVector(extra.dir, extra.len / 2);
      mesh.position.set(c.x, 0.07, c.z);
    } else if (shape === 'cone') {
      mesh.rotation.z = Math.PI + extra.yaw;
      mesh.scale.setScalar(extra.range);
      mesh.position.set(pos.x, 0.07, pos.z);
    } else {
      mesh.position.set(pos.x, 0.07, pos.z);
      mesh.scale.setScalar(radius);
    }
    this.scene.add(mesh);
    const t = { mesh, t: 0, dur, follow: extra.follow || null, shape };
    this.telegraphs.push(t);
    return t;
  }

  _dropTelegraph(t) {
    this.scene.remove(t.mesh);
    t.mesh.material.dispose();
    if (t.mesh.userData.ownGeo) t.mesh.geometry.dispose();
  }

  fireOrb(from, target, { speed = 7, dmg = 10, homing = 0.8, color = 0x7ab8ff, size = 0.55, life = 5 } = {}) {
    const sp = new THREE.Sprite(color === 0xff7a20 ? this.fireMat : this.orbMat.clone());
    if (color !== 0xff7a20) sp.material.color.set(color);
    sp.scale.setScalar(size);
    sp.position.copy(from);
    this.scene.add(sp);
    const vel = target.clone().sub(from).normalize().multiplyScalar(speed);
    this.projectiles.push({ obj: sp, vel, dmg, life, homing, speed, radius: 0.35, kind: 'orb', fire: color === 0xff7a20 });
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
    Audio.chain(from);
  }

  // 邪道飞剑：悬停瞄准 → 直线疾射（可闪避）
  flyingSword(from, target, { dmg = 16, hover = 0.6, speed = 24 } = {}) {
    const m = new THREE.Mesh(this.swordGeo, this.swordMat);
    m.position.copy(from);
    m.lookAt(target);
    this.scene.add(m);
    this.projectiles.push({ obj: m, vel: new THREE.Vector3(), dmg, life: hover + 2.2, homing: 0, speed, radius: 0.45, kind: 'sword', hover, target: target.clone() });
  }

  shockwave(pos, radius, dmg, color = 0xff6030) {
    this.effects.shockRing(pos, radius, color);
    this._areaHit(pos, radius, dmg, 'shock');
  }

  // 天降陨火 / 掌心雷：预警圈 → 命中
  strike(pos, { radius = 2.2, delay = 1, dmg = 20, kind = 'meteor', color = 0xff6020 } = {}) {
    const p = pos.clone().setY(0);
    this.telegraph(p, radius, delay, color);
    if (kind === 'meteor') {
      const sp = new THREE.Sprite(this.fireMat);
      sp.scale.setScalar(1.6);
      const from = p.clone().add(_v.set((Math.random() - 0.5) * 6, 22, (Math.random() - 0.5) * 6));
      sp.position.copy(from);
      sp.visible = false;
      this.scene.add(sp);
      const fall = 0.45;
      this.projectiles.push({ obj: sp, vel: new THREE.Vector3(), dmg: 0, life: delay + 0.05, homing: 0, speed: 0, radius: 0, kind: 'meteor', update: (pr) => {
        const k = 1 - (pr.life - 0.05) / fall;
        if (k < 0) return;
        sp.visible = true;
        sp.position.lerpVectors(from, p, Math.min(1, k));
        if (Math.random() < 0.8) this.effects.ember(sp.position);
      } });
    }
    this.later(delay, () => {
      if (kind === 'meteor') { this.effects.fireBurst(p, radius); Audio.explosion(p); this.onShake?.(0.18); }
      else { this.effects.bolt(p.clone().setY(18), p.clone().setY(0.1), 0xd0a0ff, 0.12, 0.25); this.effects.shockRing(p, radius, 0xc080ff, 0.35); Audio.thunder(p); }
      this._areaHit(p, radius, dmg, kind);
    });
  }

  // 场地危险：真火地 / 魂锁光束
  fireField(pos, r, dur, dps, delay = 1) {
    const p = pos.clone().setY(0);
    this.telegraph(p, r, delay, 0xff5010);
    this.later(delay, () => {
      const disc = new THREE.Mesh(this.discGeo, new THREE.MeshBasicMaterial({ map: softDotTexture('rgba(255,140,40,1)', 'rgba(255,60,0,0)'), color: 0xff6020, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.set(p.x, 0.06, p.z); disc.scale.setScalar(r * 1.15);
      this.scene.add(disc);
      let life = dur, tick = 0;
      this.hazards.push({
        update: (dt, player) => {
          life -= dt; tick -= dt;
          disc.material.opacity = Math.min(1, life) * (0.75 + Math.random() * 0.25);
          if (Math.random() < dt * 30) this.effects.fire(p, r * 0.85, 3);
          if (tick <= 0) {
            tick = 0.25;
            const d = Math.hypot(player.position.x - p.x, player.position.z - p.z);
            if (d < r && player.position.y - 1.65 < 0.8) this.onPlayerHit?.(dps * 0.25, p, 'fire');
          }
          return life > 0;
        },
        dispose: () => { this.scene.remove(disc); disc.material.dispose(); },
      });
    });
  }

  soulBeams(center, { count = 4, len = 40, width = 1.3, speed = 0.33, dps = 40, warn = 2 } = {}) {
    const g = new THREE.Group();
    // 魂锁光束：地面光带（中心亮线 + 两侧辉光）+ 自下而上渐隐的光幕，能量沿光束流动
    const U = { time: { value: 0 }, on: { value: 0 }, color: { value: new THREE.Color(0xb050ff) } };
    const vert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
    const mat = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: vert,
      fragmentShader: `uniform float time; uniform float on; uniform vec3 color; varying vec2 vUv;
        void main(){
          float x = abs(vUv.x * 2.0 - 1.0);
          float core = smoothstep(0.25, 0.0, x);
          float glow = smoothstep(1.0, 0.0, x);
          float flow = 0.6 + 0.4 * sin(vUv.y * 60.0 - time * 14.0);
          float warn = 0.18 + 0.12 * abs(sin(time * 8.0));
          float a = mix(warn * glow, (core * 1.2 + glow * 0.35) * flow, on);
          gl_FragColor = vec4(mix(color, vec3(1.0, 0.85, 1.0), core * on) * a, a);
        }`,
    });
    const core = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: vert,
      fragmentShader: `uniform float time; uniform float on; uniform vec3 color; varying vec2 vUv;
        void main(){
          // MSAA 下边缘像素的 vUv 会外插出 [0,1]；pow 的底数为负即 NaN，经 Bloom 扩散成整屏黑
          float fade = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 2.2);
          float streak = 0.55 + 0.45 * sin(vUv.x * 90.0 - time * 10.0 + vUv.y * 6.0);
          float a = fade * streak * 0.32 * on;
          gl_FragColor = vec4(color * a, a);
        }`,
    });
    for (let i = 0; i < count; i++) {
      const arm = new THREE.Group();
      arm.rotation.y = (i / count) * Math.PI * 2;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.8, len), mat);
      plane.rotation.x = -Math.PI / 2; plane.position.set(0, 0.09, len / 2);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.9), core);
      wall.rotation.y = Math.PI / 2; wall.position.set(0, 0.95, len / 2);
      arm.add(plane, wall);
      g.add(arm);
    }
    g.position.set(center.x, 0, center.z);
    this.scene.add(g);
    let t = 0, tick = 0, ang = 0;
    const h = {
      active: true,
      update: (dt, player) => {
        t += dt;
        const on = t > warn;
        ang += dt * speed * (on ? 1 : 0.3);
        g.rotation.y = ang;
        U.time.value = t;
        U.on.value = on ? Math.min(1, (t - warn) * 3) : 0;
        if (on) {
          if (Math.random() < dt * 40) {
            const a = ang + Math.floor(Math.random() * count) * (Math.PI * 2 / count), d = Math.random() * len;
            this.effects.add.emit(center.x + Math.sin(a) * d, 0.3 + Math.random() * 2, center.z + Math.cos(a) * d, 0, 1.5, 0, 0.75, 0.4, 1, 0.25, 0.6, -0.5, 0.5, 0.2);
          }
          tick -= dt;
          if (tick <= 0) {
            tick = 0.2;
            const rx = player.position.x - center.x, rz = player.position.z - center.z;
            for (let i = 0; i < count; i++) {
              const a = ang + (i / count) * Math.PI * 2;
              const dx = Math.sin(a), dz = Math.cos(a);
              const along = rx * dx + rz * dz, perp = Math.abs(rx * dz - rz * dx);
              if (along > 0 && along < len && perp < width * 0.5 + 0.35) { this.onPlayerHit?.(dps * 0.2, player.position.clone(), 'beam'); break; }
            }
          }
        }
        return h.active;
      },
      dispose: () => { this.scene.remove(g); mat.dispose(); core.dispose(); },
    };
    this.hazards.push(h);
    return h;
  }

  // ---------------------------------------------------------------- 主更新
  update(dt, player) {
    this.time += dt;
    const ppos = player.position;
    const pfeet = ppos.y - 1.65;
    if (this._pendingShock?.length) {
      for (const s of this._pendingShock) {
        const d = Math.hypot(ppos.x - s.pos.x, ppos.z - s.pos.z);
        if (d < s.radius && pfeet < 1.0) this.onPlayerHit?.(s.dmg, s.pos, s.kind);
      }
      this._pendingShock.length = 0;
    }
    for (let i = this.events.length - 1; i >= 0; i--) {
      const ev = this.events[i];
      ev.t -= dt;
      if (ev.t <= 0) { this.events.splice(i, 1); ev.fn(); }
    }
    for (const d of this.decoys) d.t -= dt;
    this.decoys = this.decoys.filter((d) => d.t > 0);

    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.dying) {
        if (this._updateDeath(e, dt)) { list.splice(i, 1); this._release(e); }
        continue;
      }
      this._updateEnemy(e, dt, player);
    }
    this._separate();
    this._updateProjectiles(dt, player);
    this._updateTelegraphs(dt);
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      if (!this.hazards[i].update(dt, player)) { this.hazards[i].dispose?.(); this.hazards.splice(i, 1); }
    }
    this._updateBlobs(player);
  }

  _updateBlobs(player) {
    let n = 0;
    const put = (x, z, r, lift) => {
      if (n >= this.BLOBS) return;
      const k = Math.max(0.35, 1 - lift * 0.25);
      _q.identity(); _s.set(r * 2.6 * k, 1, r * 2.6 * k);
      _m4.compose(_v.set(x, 0.022, z), _q, _s);
      this.blobs.setMatrixAt(n++, _m4);
    };
    const px = player.position.x, pz = player.position.z;
    for (const e of this.list) {
      if (!e.alive || e.dying || e.spawnT > 0.5) continue;
      put(e.root.position.x, e.root.position.z, e.radius * (e.boss ? 1.2 : 1), e.root.position.y);
      // 远处的敌人不投射实时阴影（脚底接触阴影代替），省下一半三角形
      const near = e.boss || (e.root.position.x - px) ** 2 + (e.root.position.z - pz) ** 2 < 22 * 22;
      if (e.castsShadow !== near) { e.castsShadow = near; for (const m of e.inst.meshes) m.castShadow = near; }
    }
    if (player.alive && this.showPlayerBlob) put(player.position.x, player.position.z, 0.42, player.position.y - 1.65);
    this.blobs.count = n;
    this.blobs.instanceMatrix.needsUpdate = true;
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
    if (e.invulnT > 0) e.invulnT -= dt;
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
    if (e.tellT > 0) e.tellT -= dt;
    // 词缀持续效果
    if (e.affixes.length) {
      if (e.affixes.includes('vampiric') && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.025 * dt);
      if (e.affixes.includes('frenzy') && !e.frenzied && e.hp < e.maxHp * 0.5) {
        e.frenzied = true; e.speed *= 1.35; e.atkSpeed *= 1.4;
        e.inst.uber.uRimExtra.value.set(0xff2010).multiplyScalar(0.9);
        this.effects.shockRing(pos, 2, 0xff3020, 0.4);
      }
      if (e.affixes.includes('summoner')) {
        e.summonT -= dt;
        if (e.summonT <= 0 && e.spawnT <= 0) {
          e.summonT = 7.5;
          for (let k = 0; k < 2; k++) { const ang = Math.random() * Math.PI * 2; this.onSummon?.('imp', pos.clone().add(_v.set(Math.cos(ang) * 1.6, 0, Math.sin(ang) * 1.6))); }
        }
      }
    }
    if (e.wardObj) {
      e.wardObj.position.set(pos.x, pos.y + e.height * 0.55, pos.z);
      e.wardObj.children.forEach((m, i) => {
        const ang = m.userData.a + a.t * 2.2;
        m.position.set(Math.cos(ang) * (e.radius + 0.35), Math.sin(a.t * 3 + i) * 0.25, Math.sin(ang) * (e.radius + 0.35));
        m.rotation.y = -ang;
      });
    }
    // 受击闪白 / 状态辉光
    if (e.flash > 0) {
      e.flash -= dt;
      const k = Math.max(0, e.flash / 0.1) * (e.boss ? 0.22 : 0.5);
      for (const m of e.mats) m.emissive.setRGB(k + (st.burnT > 0 ? 0.3 : 0), 0.82 * k + (st.root > 0 ? 0.1 : 0), 0.75 * k + (st.root > 0 ? 0.25 : 0));
    } else {
      const glow = st.burnT > 0 ? [0.35, 0.08, 0] : st.root > 0 || st.stun > 0 ? [0.05, 0.12, 0.3] : e.tellT > 0 ? [0.35, 0.02, 0.0] : null;
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
    let toX = tgt.x - pos.x, toZ = tgt.z - pos.z;
    const dist = Math.hypot(toX, toZ) || 0.001;
    let dirX = toX / dist, dirZ = toZ / dist;
    // 闭气：僵尸嗅不到人气，原地徘徊
    const isJiangshi = cfg.tags.includes('jiangshi') && !cfg.boss;
    if (isJiangshi && player.stealth && dist > 2.4 && tgt === ppos) {
      if (!e.lost) { e.lost = 1; e.sniffYaw = Math.random() * Math.PI * 2; this.lostCount = (this.lostCount || 0) + 1; }
      e.lostT = 0.3 + Math.random() * 0.6;
    } else if (e.lost) {
      e.lostT -= dt;
      if (e.lostT <= 0) e.lost = 0;
    }
    // 包抄：靠近时按各自槽位从不同方向合围
    if (!cfg.boss && dist < 10 && dist > (cfg.atkRange || 1.5) * 1.3 && tgt === ppos && !e.lost) {
      const offR = Math.min(2.6, (dist - 2) * 0.38);
      const ax = ppos.x + Math.cos(e.slot) * offR - pos.x, az = ppos.z + Math.sin(e.slot) * offR - pos.z;
      const al = Math.hypot(ax, az) || 1;
      dirX = ax / al; dirZ = az / al;
    }
    const disabled = st.stun > 0 || this.freezeAll > 0 || e.staggerT > 0;
    const slowK = (1 - st.slow) * (st.root > 0 ? 0 : 1);
    e.atkCd -= dt * e.atkSpeed;

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
    const realDX = toX / dist, realDZ = toZ / dist;

    // 首领破绽：跪地喘息
    if (e.staggerT > 0) {
      e.staggerT -= dt;
      e.modeT += dt;
      if (e.staggerT <= 0) { e.mode = 'walk'; e.modeT = 0; e.specialCd = Math.min(e.specialCd, 0.8); }
    }
    if (e.postureMax && e.staggerT <= 0) {
      e.postureIdle += dt;
      if (e.postureIdle > 2.2) e.posture = Math.max(0, e.posture - e.postureMax * 0.06 * dt);
    }
    // 阶段转换
    if (cfg.phases && e.phase < cfg.phases.length && e.hp <= e.maxHp * cfg.phases[e.phase]) {
      e.phase++;
      BOSS_AI.phase?.(this, e, e.phase, player);
      this.onPhase?.(e, e.phase);
    }

    if (!disabled) {
      switch (cfg.ai) {
        case 'hop': {
          if (e.atkT >= 0 || e.mode === 'roar') break;
          if (e.lost) {
            // 嗅探：原地转身、偶尔小跳
            e.sniffYaw += dt * 1.6;
            face(Math.sin(e.sniffYaw), Math.cos(e.sniffYaw), 3);
            if (!e.hopping) { e.hopT -= dt; if (e.hopT <= 0) { e.hopping = true; e.hopT = 0; e.hopDir.set(0, 0, 0); } }
            else { e.hopT += dt / cfg.hop.t; if (e.hopT >= 1) { e.hopping = false; e.hopT = 0.8 + Math.random(); a.landT = 0; } }
            break;
          }
          if (!e.hopping) {
            e.hopT -= dt * (slowK > 0 ? 1 : 0) * e.atkSpeed;
            face(realDX, realDZ, 10);
            if (e.hopT <= 0 && slowK > 0) {
              e.hopping = true; e.hopT = 0; e.hopDir.set(dirX, 0, dirZ);
              if (cfg.hop.h > 1) Audio.whoosh();
            }
          } else {
            e.hopT += dt / cfg.hop.t;
            const vh = e.speed * (cfg.hop.t + cfg.hop.rest) / cfg.hop.t * slowK;
            moveX = e.hopDir.x * vh; moveZ = e.hopDir.z * vh;
            speedK = 1;
            if (e.hopT >= 1) {
              e.hopping = false; e.hopT = cfg.hop.rest * (0.8 + Math.random() * 0.4); a.landT = 0;
              if (dist < 22) Audio.hop(pos, cfg.boss || cfg.hop.h > 1);
              if (cfg.hop.h > 1 || cfg.boss) this.effects.dust(pos.clone(), 4);
            }
          }
          break;
        }
        case 'run': case 'walk': {
          if (e.atkT >= 0) break;
          const zig = cfg.ai === 'run' ? Math.sin(a.t * 3 + a.seed) * 0.35 : 0;
          const mx = dirX + -dirZ * zig, mz = dirZ + dirX * zig;
          const l = Math.hypot(mx, mz);
          if (dist > cfg.atkRange * 0.7) { moveX = mx / l * e.speed * slowK; moveZ = mz / l * e.speed * slowK; speedK = slowK; }
          face(realDX, realDZ, 10);
          if (cfg.ai === 'run' && dist < 20 && Math.random() < dt * 0.15) Audio.impChatter(pos);
          if (cfg.ai === 'walk' && dist < 16 && Math.random() < dt * 0.2) Audio.paperRustle(pos);
          break;
        }
        case 'soldier': {
          if (e.atkT >= 0) { face(realDX, realDZ, 4); break; }
          if (dist > cfg.atkRange * 0.85) { moveX = dirX * e.speed * slowK; moveZ = dirZ * e.speed * slowK; speedK = slowK; }
          face(realDX, realDZ, 5);
          break;
        }
        case 'caster': this._aiCaster(e, dt, player, dist, realDX, realDZ, slowK, face); moveX = e.vel.x; moveZ = e.vel.z; speedK = 0.5; break;
        default: {
          const fn = BOSS_AI[cfg.ai];
          if (fn) {
            fn(this, e, dt, player, dist, realDX, realDZ, slowK, face);
            moveX = e.vel.x; moveZ = e.vel.z;
            speedK = Math.min(1, e.vel.length() / Math.max(0.1, e.speed));
          }
        }
      }
      // 近战
      const melee = cfg.ai === 'hop' || cfg.ai === 'run' || cfg.ai === 'walk' || cfg.ai === 'soldier' || cfg.ai === 'wuBlack' || cfg.ai === 'hou' || (cfg.ai === 'sorcerer' && e.form === 'beast');
      if (melee && e.mode === 'walk' && !e.lost) {
        const reach = cfg.atkRange * e.scale / cfg.scale + 0.3;
        if (e.atkT < 0 && dist < reach && e.atkCd <= 0 && !e.hopping) {
          e.atkT = 0; e.atkHit = false; a.atk = 0; e.tellT = 0.25;
          face(realDX, realDZ, 30);
        }
      }
      if (cfg.fireRing) {
        e.specialCd -= dt;
        if (e.specialCd <= 0) {
          e.specialCd = cfg.fireRing.cd * (e.enraged ? 0.7 : 1) / (this.difficulty.aggro ?? 1);
          const c = this.center(e, new THREE.Vector3());
          const n = cfg.fireRing.count + (e.phase >= 1 ? 4 : 0);
          for (let k = 0; k < n; k++) {
            const ang = (k / n) * Math.PI * 2 + a.t;
            this.fireOrb(c, c.clone().add(_v.set(Math.cos(ang), 0, Math.sin(ang))), { speed: 8, dmg: cfg.fireRing.dmg * e.dmgMult, homing: 0, color: 0xff7a20, size: 0.8, life: 4 });
          }
          Audio.fireball(pos);
        }
      }
      if (cfg.boss && BOSS_AI.extra) BOSS_AI.extra(this, e, dt, player, dist);
    }
    // 攻击进行中
    if (e.atkT >= 0) {
      e.atkT += dt / (cfg.atkTime * (e.enraged ? 0.8 : 1)) * Math.min(1.3, e.atkSpeed);
      a.atk = e.atkT;
      if (!e.atkHit && e.atkT > (cfg.ai === 'soldier' ? 0.5 : 0.45)) {
        e.atkHit = true;
        const reach = (cfg.atkRange * e.scale / cfg.scale + 0.5);
        if (tgt === ppos && dist < reach && player.position.y - 1.65 < 1.4) this.onPlayerHit?.(cfg.damage * e.dmgMult, pos, 'melee');
        if (cfg.kind === 'hou' || cfg.kind === 'wuBlack' || e.form === 'beast') this.effects.dust(pos.clone().addScaledVector(_v.set(realDX, 0, realDZ), 1.5));
      }
      if (e.atkT >= 1) { e.atkT = -1; a.atk = -1; e.atkCd = cfg.atkTime * 1.1 + Math.random() * 0.5; }
    }

    pos.x += moveX * dt; pos.z += moveZ * dt;
    // 高度
    const U = e.inst.uber;
    if (cfg.ai === 'hop') {
      if (e.hopping) { const k = e.hopT; pos.y = 4 * cfg.hop.h * k * (1 - k) * (e.scale / cfg.scale) * (e.lost ? 0.35 : 1); a.air = k; U.uAir.value = Math.sin(k * Math.PI) * (e.lost ? 0.4 : 1); }
      else { pos.y = 0; a.air = -1; a.landT += dt; U.uAir.value = Math.max(0, U.uAir.value - dt * 4); }
    } else if (e.ai.flyY !== undefined) {
      pos.y = e.ai.flyY;
    } else if (e.floatY) {
      pos.y = e.floatY + Math.sin(a.t * 1.6 + a.seed) * 0.12;
    } else pos.y = 0;
    U.uWind.value = Math.min(2.5, Math.hypot(moveX, moveZ) * 0.25 + (cfg.kind === 'ghost' ? 1 : 0));
    this.world.collide(pos, e.radius, 0, e.height);
    a.speedK = speedK;
    a.phase += dt * (cfg.ai === 'run' ? 13 : cfg.ai === 'walk' ? 9 : 6) * Math.max(0.2, speedK);
    this._pose(e, dt, speedK);
    this._updateHead(e);
    // 光环
    if (e.auraMesh) {
      const r = cfg.aura.radius * (e.phase >= 1 ? 1.25 : 1);
      e.auraMesh.scale.setScalar(r);
      e.auraMesh.position.set(pos.x, 0.07, pos.z);
      e.auraMesh.rotation.z += dt * 0.8;
      e.auraMesh.material.opacity = 0.35 + Math.sin(a.t * 4) * 0.12;
      if (Math.random() < dt * 20) { const ang = Math.random() * Math.PI * 2, rr = Math.random() * r; this.effects.ember(_v.set(pos.x + Math.cos(ang) * rr, 0.2, pos.z + Math.sin(ang) * rr)); }
      if (player.alive) {
        const d = Math.hypot(ppos.x - pos.x, ppos.z - pos.z);
        if (d < r) this.onPlayerHit?.(cfg.aura.dps * dt * e.dmgMult, pos, 'aura');
      }
    }
    // 远处的低吼
    e.growlT -= dt;
    if (e.growlT <= 0) {
      e.growlT = 6 + Math.random() * 10;
      if (dist < 18 && (cfg.kind === 'jiangshi' || cfg.kind === 'soldier')) Audio.growl(pos);
    }
  }

  _updateHead(e) {
    e.root.updateMatrixWorld(true);
    e.head.getWorldPosition(e.headPos);
    e.headPos.y += 0.09 * e.scale;
  }

  _pose(e, dt, speedK) {
    const a = e.anim, b = e.bones, kind = e.cfg.kind;
    if (e.staggerT > 0) {
      zeroPose(b);
      poseStagger(b, Math.min(1, e.modeT), a.t);
      return;
    }
    switch (kind) {
      case 'jiangshi':
        a.style = e.lost ? 'sniff' : '';
        poseJiangshi(b, a);
        if (e.lost) { b.head.rotation.y = Math.sin(a.t * 3 + a.seed) * 0.7; b.head.rotation.x = -0.35; }
        break;
      case 'hou': a.mode = e.mode; a.modeT = e.modeT; poseHou(b, a); break;
      case 'imp': poseImp(b, a); break;
      case 'paper': posePaper(b, a); break;
      case 'ghost': poseGhost(b, a); break;
      case 'soldier': poseSoldier(b, a); break;
      case 'wuWhite': a.mode = 'throw'; poseWuchang(b, a, false); break;
      case 'wuBlack': a.mode = e.mode === 'dash' ? 'dash' : 'slam'; poseWuchang(b, a, true); break;
      case 'sorcerer':
        a.mode = e.mode; a.modeT = e.modeT;
        zeroPose(b);
        if (e.form === 'beast') poseBeast(b, a); else poseSorcerer(b, a);
        break;
    }
    void dt; void speedK;
  }

  // 返回 true 表示可回收
  _updateDeath(e, dt) {
    e.deathT += dt;
    const kind = e.cfg.kind;
    const fallDur = e.boss ? 1.8 : 0.9;
    const k = Math.min(1, e.deathT / fallDur);
    const tr = deathTransform(e.form === 'beast' ? 'sorcererBeast' : kind, k);
    e.root.rotation.x = tr.rotX;
    e.root.rotation.z = tr.rotZ;
    const floaty = kind === 'ghost' || kind === 'paper';
    if (floaty) {
      e.root.position.y = (e.floatY || 0) + tr.dy;
      e.root.scale.set(e.scale, e.scale * Math.max(0.02, tr.scaleY), e.scale);
    } else {
      e.root.position.y = Math.max(e.root.position.y - dt * 4, 0);
    }
    const f = Math.max(0, 1 - e.deathT * 2);
    for (const m of e.mats) m.emissive.setRGB(0.4 * f, 0.1 * f, 0.05 * f);
    // 焚化溶解
    const start = floaty ? 0.1 : fallDur * 0.75;
    const ddur = e.boss ? 2.8 : floaty ? 0.9 : 1.3;
    if (e.deathT > start) {
      const dk = (e.deathT - start) / ddur;
      if (!e.dissolving) {
        e.dissolving = true;
        for (const m of e.inst.meshes) m.castShadow = false;
      }
      e.inst.uber.uDissolve.value = Math.min(1, dk);
      const col = e.inst.uber.uDissolveColor.value;
      if (Math.random() < dt * (e.boss ? 60 : 18)) {
        const names = Object.keys(e.bones);
        const bn = e.bones[names[Math.floor(Math.random() * names.length)]];
        bn.getWorldPosition(_v2);
        this.effects.embersBurst(_v2, col, e.boss ? 4 : 2, e.boss ? 0.6 : 0.3);
      }
      return dk >= 1;
    }
    return false;
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
      if (p.update) {
        p.update(p, dt);
        if (p.life <= 0) { this.scene.remove(p.obj); this.projectiles.splice(i, 1); }
        continue;
      }
      if (p.kind === 'sword') {
        if (p.hover > 0) {
          p.hover -= dt;
          p.obj.lookAt(p.target);
          if (p.hover <= 0) { p.vel.copy(p.target).sub(p.obj.position).normalize().multiplyScalar(p.speed); Audio.whoosh(); }
          continue;
        }
        if (Math.random() < dt * 40) this.effects.trail(p.obj.position, new THREE.Color(0.6, 0.25, 1));
      }
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
      const hit = dx * dx + dz * dz < (p.radius + 0.4) ** 2 && Math.abs(dy) < 1.1;
      if (hit && player.alive) this.onPlayerHit?.(p.dmg, p.obj.position, p.kind === 'orb' && p.fire ? 'fire' : p.kind);
      const hitWall = p.obj.position.y < 0.05 || this.world.obstacles.some((b) => b.containsPoint(p.obj.position));
      if (hit || hitWall || p.life <= 0) {
        if (p.kind === 'orb') this.effects.puff(p.obj.position, p.obj.material.color);
        if (p.kind === 'sword') this.effects.sparks(p.obj.position, 10);
        this.scene.remove(p.obj);
        this.projectiles.splice(i, 1);
      }
    }
  }

  _updateTelegraphs(dt) {
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i];
      t.t += dt;
      const k = Math.min(1, t.t / t.dur);
      const u = t.mesh.material.uniforms;
      u.progress.value = ease(k);
      u.opacity.value = Math.min(1, t.t * 6) * (k > 0.92 ? 1.3 : 0.85);
      u.time.value = t.t;
      if (t.follow) t.mesh.position.set(t.follow.root.position.x, 0.07, t.follow.root.position.z);
      if (k >= 1) { this._dropTelegraph(t); this.telegraphs.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------- 厉鬼施法
  _aiCaster(e, dt, player, dist, dx, dz, slowK, face) {
    const cfg = e.cfg;
    const want = dist > 13 ? 1 : dist < 7 ? -1 : 0;
    const sx = -dz * e.strafe, sz = dx * e.strafe;
    const sp = e.speed * slowK;
    e.vel.set((dx * want + sx * 0.7) * sp, 0, (dz * want + sz * 0.7) * sp);
    if (Math.random() < dt * 0.3) e.strafe *= -1;
    face(dx, dz, 6);
    e.shotCd -= dt * e.atkSpeed;
    if (e.anim.cast >= 0) { e.anim.cast += dt / 0.7; if (e.anim.cast >= 1) e.anim.cast = -1; }
    if (e.shotCd <= 0 && dist < 22) {
      e.shotCd = cfg.shot.cd * (0.8 + Math.random() * 0.4);
      e.anim.cast = 0;
      const from = this.center(e, new THREE.Vector3()).add(_v.set(dx * 0.5, 0.35, dz * 0.5));
      this.fireOrb(from, player.position.clone().add(_v2.set(0, -0.5, 0)), { speed: cfg.shot.speed, dmg: cfg.shot.dmg * e.dmgMult, homing: 1.1, color: 0x7ab8ff });
      Audio.ghostWail(e.root.position);
    }
    if (e.blinkDmg > e.maxHp * 0.35) {
      e.blinkDmg = 0;
      this.effects.puff(this.center(e, new THREE.Vector3()), new THREE.Color(0x8ab0ff), 18);
      const ang = Math.random() * Math.PI * 2;
      e.root.position.x = THREE.MathUtils.clamp(e.root.position.x + Math.cos(ang) * 7, -32, 32);
      e.root.position.z = THREE.MathUtils.clamp(e.root.position.z + Math.sin(ang) * 7, -32, 32);
      this.effects.puff(this.center(e, new THREE.Vector3()), new THREE.Color(0x8ab0ff), 18);
    }
  }
}

export { UP };
