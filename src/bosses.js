import * as THREE from 'three';
import { Audio } from './audio.js';
import { P_FLAME } from './effects.js';

// =====================================================================
//  首领 AI：多阶段行为树
//  旱魃：火环 →（二阶段）赤地真火 →（三阶段）焚天陨火
//  黑白无常：勾魂索 / 冲锋砸地，同生共死（一方陨落另一方暴怒）
//  犼：冲撞 / 震地 / 召唤 →（二阶段）喷火 →（三阶段）腾空跃击
//  玄阴子：掌心雷 / 飞剑 / 纸人 / 瞬移 →（尸化）爪击冲撞跃击 →（鬼门大开）魂锁光束
// =====================================================================

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function pickPlayerLead(player, lead = 0.5) {
  return player.position.clone().addScaledVector(player.velocity, lead).setY(0);
}

// 阶段转换：咆哮 + 冲击波推开玩家 + 短暂无敌
function phaseRoar(M, e, color = 0xff3020, dur = 1.4) {
  e.mode = 'roar'; e.modeT = 0; e.roarDur = dur;
  e.atkT = -1; e.anim.atk = -1;
  e.invulnT = dur;
  e.vel.set(0, 0, 0);
  M.effects.shockRing(e.root.position, 9, color, 0.8);
  M.effects.shockRing(e.root.position, 5, 0xffffff, 0.5);
  M.onShake?.(0.55);
  Audio.bossRoar(e.root.position);
}

function tickRoar(e, dt) {
  e.modeT += dt / (e.roarDur || 1.4);
  e.vel.set(0, 0, 0);
  if (e.modeT >= 1) { e.mode = 'walk'; e.modeT = 0; return false; }
  return true;
}

export const BOSS_AI = {
  // ---------------------------------------------------------------- 阶段事件
  phase(M, e, ph) {
    const k = e.cfg.kind;
    if (k === 'jiangshi') { phaseRoar(M, e, 0xff6010); e.enraged = ph >= 2; }
    else if (k === 'hou') { phaseRoar(M, e, 0xff3020, 1.6); e.enraged = true; e.baseEmissive = 0x3a0600; e.inst.uber.uRimExtra.value.setRGB(0.85, 0.12, 0.04); }
    else if (k === 'wuWhite' || k === 'wuBlack') { e.enraged = true; M.effects.shockRing(e.root.position, 4, k === 'wuWhite' ? 0xa0c0ff : 0xff5030); Audio.bossRoar(e.root.position); }
    else if (k === 'sorcerer') {
      if (ph === 1) {
        e.mode = 'transform'; e.modeT = 0; e.invulnT = 3.4; e.vel.set(0, 0, 0);
        e.atkT = -1; e.anim.atk = -1;
        Audio.bossRoar(e.root.position);
      } else if (ph === 2) {
        phaseRoar(M, e, 0xb050ff, 1.8);
        e.enraged = true;
        e.ai.beams = M.soulBeams(new THREE.Vector3(0, 0, 0), { count: 4, len: 42, width: 1.4, speed: 0.3, dps: 38 * M.difficulty.dmg, warn: 2.2 });
      }
    }
  },

  // ---------------------------------------------------------------- 首领附加行为（旱魃阶段技能）
  extra(M, e, dt, player, dist) {
    if (e.cfg.id !== 'drought') return;
    if (e.mode === 'roar') { tickRoar(e, dt); return; }
    const A = e.ai;
    if (e.phase >= 1) {
      A.fieldCd = (A.fieldCd ?? 2) - dt;
      if (A.fieldCd <= 0) {
        A.fieldCd = 5.5 / (M.difficulty.aggro ?? 1);
        M.fireField(pickPlayerLead(player, 0.6), 2.8, 5, 16 * e.dmgMult, M.T(1.1));
      }
    }
    if (e.phase >= 2) {
      A.meteorCd = (A.meteorCd ?? 1.5) - dt;
      if (A.meteorCd <= 0) {
        A.meteorCd = 4.2 / (M.difficulty.aggro ?? 1);
        const c = player.position.clone().setY(0);
        M.strike(pickPlayerLead(player, 0.8), { radius: 2.4, delay: M.T(1.1), dmg: 24 * e.dmgMult, kind: 'meteor' });
        for (let i = 0; i < 4; i++) {
          const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 5;
          M.strike(c.clone().add(_v.set(Math.cos(a) * r, 0, Math.sin(a) * r)), { radius: 2.2, delay: M.T(1.1 + i * 0.18), dmg: 22 * e.dmgMult, kind: 'meteor' });
        }
      }
    }
    void dist;
  },

  // ---------------------------------------------------------------- 白无常：勾魂索 + 召唤小鬼
  wuWhite(M, e, dt, player, dist, dx, dz, slowK, face) {
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
        const from = M.center(e, new THREE.Vector3()).add(_v.set(0, 0.4, 0));
        const aim = player.position.clone().add(_v2.set(0, -0.7, 0)).sub(from).normalize();
        M.throwChain(from, aim, { speed: cfg.chain.speed, dmg: cfg.chain.dmg * e.dmgMult });
        if (e.enraged) for (const off of [-0.25, 0.25]) M.throwChain(from, aim.clone().applyAxisAngle(UP, off), { speed: cfg.chain.speed, dmg: cfg.chain.dmg * e.dmgMult });
        if (e.partnerDead) for (const off of [-0.5, 0.5]) M.throwChain(from, aim.clone().applyAxisAngle(UP, off), { speed: cfg.chain.speed * 0.9, dmg: cfg.chain.dmg * e.dmgMult });
      }
      face(dx, dz, 12);
      if (e.modeT >= 1) { e.mode = 'walk'; e.anim.atk = -1; }
      return;
    }
    e.vel.set((dx * want + sx * 0.8) * sp, 0, (dz * want + sz * 0.8) * sp);
    if (Math.random() < dt * 0.25) e.strafe *= -1;
    face(dx, dz, 6);
    e.shotCd -= dt * e.atkSpeed;
    if (e.shotCd <= 0) {
      e.shotCd = cfg.chain.cd * (e.enraged ? 0.65 : 1);
      e.mode = 'throw'; e.modeT = 0; e.thrown = false;
      M.telegraph(e.root.position.clone(), 0, M.T(0.45), 0xa0c0ff, 'line', { dir: new THREE.Vector3(dx, 0, dz), yaw: Math.atan2(dx, dz), len: 18, width: 0.9 });
    }
    e.summonCd -= dt;
    if (e.summonCd <= 0) {
      e.summonCd = cfg.summon.cd * (e.partnerDead ? 0.6 : 1);
      for (let k = 0; k < cfg.summon.count; k++) {
        const ang = Math.random() * Math.PI * 2;
        M.onSummon?.(cfg.summon.type, e.root.position.clone().add(_v.set(Math.cos(ang) * 2.5, 0, Math.sin(ang) * 2.5)));
      }
    }
  },

  // ---------------------------------------------------------------- 黑无常：冲锋 + 砸地
  wuBlack(M, e, dt, player, dist, dx, dz, slowK, face) {
    const cfg = e.cfg;
    const sp = e.speed * slowK * (e.enraged ? 1.25 : 1);
    const slamR = cfg.slam.radius * (e.partnerDead ? 1.3 : 1);
    e.specialCd -= dt * e.atkSpeed;
    switch (e.mode) {
      case 'windup':
        e.modeT += dt;
        e.vel.set(0, 0, 0);
        e.anim.atk = 0.2;
        face(e.chargeDir.x, e.chargeDir.z, 20);
        if (e.modeT >= M.T(cfg.dash.windup)) { e.mode = 'dash'; e.modeT = 0; Audio.whoosh(); }
        break;
      case 'dash': {
        e.modeT += dt;
        e.anim.atk = 0.5;
        e.vel.copy(e.chargeDir).multiplyScalar(cfg.dash.speed);
        if (Math.random() < dt * 30) M.effects.dust(e.root.position.clone());
        const pd = Math.hypot(player.position.x - e.root.position.x, player.position.z - e.root.position.z);
        if (!e.dashHit && pd < 1.5) { e.dashHit = true; M.onPlayerHit?.(cfg.dash.dmg * e.dmgMult, e.root.position, 'dash'); }
        if (e.modeT > 0.6) { e.mode = 'slamWind'; e.modeT = 0; M.telegraph(e.root.position, slamR, M.T(0.6), 0xff4030, 'ring', { follow: e }); }
        break;
      }
      case 'slamWind':
        e.modeT += dt;
        e.vel.multiplyScalar(0.8);
        e.anim.atk = Math.min(0.45, e.modeT / 0.6 * 0.45);
        if (e.modeT >= M.T(0.6)) {
          e.mode = 'slam'; e.modeT = 0;
          M.shockwave(e.root.position, slamR, cfg.slam.dmg * e.dmgMult, 0xff5030);
          M.effects.debris(e.root.position, 16, 1);
          M.onShake?.(0.35);
          Audio.slam(e.root.position);
        }
        break;
      case 'slam':
        e.modeT += dt;
        e.anim.atk = 0.45 + Math.min(0.55, e.modeT);
        if (e.modeT > 0.5) { e.mode = 'walk'; e.anim.atk = -1; e.specialCd = cfg.dash.cd * (e.enraged ? 0.6 : 1) * (e.partnerDead ? 0.6 : 1); }
        break;
      default: {
        e.vel.set(dx * sp, 0, dz * sp);
        if (dist < 2) e.vel.multiplyScalar(0.2);
        face(dx, dz, 8);
        if (e.specialCd <= 0 && dist < 16 && dist > 4) {
          e.mode = 'windup'; e.modeT = 0; e.dashHit = false;
          e.chargeDir.set(dx, 0, dz);
          M.telegraph(e.root.position.clone(), 0, M.T(cfg.dash.windup) + 0.3, 0xff4030, 'line', { dir: e.chargeDir.clone(), yaw: Math.atan2(dx, dz), len: 11, width: 1.4 });
        }
      }
    }
  },

  // ---------------------------------------------------------------- 犼
  hou(M, e, dt, player, dist, dx, dz, slowK, face) {
    const cfg = e.cfg;
    const en = e.enraged ? 1.3 : 1;
    const sp = e.speed * slowK * en;
    const A = e.ai;
    e.specialCd -= dt * e.atkSpeed;
    e.summonCd -= dt;
    switch (e.mode) {
      case 'roar': tickRoar(e, dt); break;
      case 'windup':
        e.modeT += dt / M.T(cfg.charge.windup);
        e.vel.set(0, 0, 0);
        face(e.chargeDir.x, e.chargeDir.z, 20);
        if (e.modeT >= 1) { e.mode = 'charge'; e.modeT = 0; e.dashHit = false; Audio.bossRoar(e.root.position); }
        break;
      case 'charge': {
        e.modeT += dt / cfg.charge.duration;
        e.vel.copy(e.chargeDir).multiplyScalar(cfg.charge.speed * en);
        if (Math.random() < dt * 40) M.effects.dust(e.root.position.clone());
        const pd = Math.hypot(player.position.x - e.root.position.x, player.position.z - e.root.position.z);
        if (!e.dashHit && pd < 2.2) { e.dashHit = true; M.onPlayerHit?.(cfg.charge.damage * e.dmgMult, e.root.position, 'charge'); }
        if (e.modeT >= 1) { e.mode = 'walk'; e.modeT = 0; e.specialCd = cfg.charge.cd / en; }
        break;
      }
      case 'slam':
        e.modeT += dt / 1.3;
        e.vel.set(0, 0, 0);
        if (!e.slammed && e.modeT > 0.62) {
          e.slammed = true;
          M.shockwave(e.root.position, cfg.slam.radius, cfg.slam.dmg * e.dmgMult, 0xff4020);
          M.effects.debris(e.root.position, 22, 1.2);
          M.onShake?.(0.45);
          Audio.slam(e.root.position);
          if (e.enraged) {
            for (let k = 0; k < 12; k++) {
              const ang = (k / 12) * Math.PI * 2;
              const c = M.center(e, new THREE.Vector3());
              M.fireOrb(c, c.clone().add(_v.set(Math.cos(ang), 0, Math.sin(ang))), { speed: 9, dmg: 14 * e.dmgMult, homing: 0, color: 0xff7a20, size: 0.8, life: 4 });
            }
          }
        }
        if (e.modeT >= 1) { e.mode = 'walk'; e.modeT = 0; }
        break;
      case 'breathWind':
        e.modeT += dt;
        e.vel.set(0, 0, 0);
        face(A.breathDir.x, A.breathDir.z, 10);
        if (e.modeT >= A.breathWind) { e.mode = 'breath'; e.modeT = 0; A.breathTick = 0; Audio.fireball(e.root.position); }
        break;
      case 'breath': {
        e.modeT += dt;
        e.vel.set(0, 0, 0);
        // 火焰缓慢追踪玩家
        const want = Math.atan2(dx, dz);
        let cur = Math.atan2(A.breathDir.x, A.breathDir.z);
        let d = want - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        cur += THREE.MathUtils.clamp(d, -0.8 * dt, 0.8 * dt);
        A.breathDir.set(Math.sin(cur), 0, Math.cos(cur));
        face(A.breathDir.x, A.breathDir.z, 20);
        const B = cfg.breath;
        const mouth = e.headPos.clone();
        for (let i = 0; i < 6; i++) {
          const spread = (Math.random() - 0.5) * B.angle * 1.6;
          const dir = A.breathDir.clone().applyAxisAngle(UP, spread);
          const v = 9 + Math.random() * 6;
          M.effects.add.emit(mouth.x, mouth.y - 0.1, mouth.z, dir.x * v, -0.8 + Math.random() * 1.2, dir.z * v, 1, 0.34 + Math.random() * 0.3, 0.06, 0.45 + Math.random() * 0.4, 0.6, -1, 1.2, 1.8, 0.9, P_FLAME);
        }
        if (Math.random() < dt * 14) M.effects.smoke(mouth.clone().addScaledVector(A.breathDir, 3 + Math.random() * 4), 1, 0.6, [0.07, 0.06, 0.055], 0.9, 1.4, 0.4);
        A.breathTick -= dt;
        if (A.breathTick <= 0) {
          A.breathTick = 0.2;
          const rx = player.position.x - e.root.position.x, rz = player.position.z - e.root.position.z;
          const rl = Math.hypot(rx, rz);
          const ang = Math.acos(Math.max(-1, Math.min(1, (rx * A.breathDir.x + rz * A.breathDir.z) / (rl || 1))));
          if (rl < B.range && ang < B.angle) M.onPlayerHit?.(B.dps * 0.2 * e.dmgMult, e.root.position, 'fire');
        }
        if (e.modeT >= B.dur) { e.mode = 'walk'; e.modeT = 0; e.specialCd = 3.5 / en; }
        break;
      }
      case 'leapWind':
        e.modeT += dt;
        e.vel.set(0, 0, 0);
        if (e.modeT >= M.T(0.55)) {
          e.mode = 'leap'; e.modeT = 0;
          A.leapFrom = e.root.position.clone();
          A.leapTo = pickPlayerLead(player, 0.45);
          A.leapTo.x = THREE.MathUtils.clamp(A.leapTo.x, -31, 31); A.leapTo.z = THREE.MathUtils.clamp(A.leapTo.z, -31, 31);
          M.telegraph(A.leapTo, cfg.leap.radius, 1.0, 0xff3020);
          Audio.whoosh();
        }
        break;
      case 'leap': {
        e.modeT += dt / 1.0;
        const k = Math.min(1, e.modeT);
        e.root.position.x = THREE.MathUtils.lerp(A.leapFrom.x, A.leapTo.x, k);
        e.root.position.z = THREE.MathUtils.lerp(A.leapFrom.z, A.leapTo.z, k);
        A.flyYSet = true;
        e.ai.flyY = Math.sin(k * Math.PI) * 7.5;
        e.vel.set(0, 0, 0);
        if (k >= 1) {
          e.ai.flyY = undefined;
          e.mode = 'slam'; e.modeT = 0.62; e.slammed = true;
          M.shockwave(A.leapTo, cfg.leap.radius, cfg.leap.dmg * e.dmgMult, 0xff3020);
          M.effects.debris(A.leapTo, 30, 1.5);
          M.effects.fireBurst(A.leapTo, 3);
          M.onShake?.(0.75);
          Audio.slam(A.leapTo);
          e.specialCd = 2.5;
        }
        break;
      }
      default: {
        e.vel.set(dx * sp, 0, dz * sp);
        if (dist < 2.5) e.vel.multiplyScalar(0.1);
        face(dx, dz, 5);
        if (e.specialCd <= 0 && e.atkT < 0) {
          const r = Math.random();
          if (e.phase >= 2 && dist > 6 && r < 0.45) {
            e.mode = 'leapWind'; e.modeT = 0;
          } else if (e.phase >= 1 && dist < 9 && r < 0.5) {
            e.mode = 'breathWind'; e.modeT = 0;
            A.breathDir = new THREE.Vector3(dx, 0, dz);
            A.breathWind = M.T(0.9);
            M.telegraph(e.root.position.clone(), 0, A.breathWind + cfg.breath.dur * 0.5, 0xff5010, 'cone', { yaw: Math.atan2(dx, dz), angle: cfg.breath.angle, range: cfg.breath.range, follow: e });
          } else if (dist < 7) {
            e.mode = 'slam'; e.modeT = 0; e.slammed = false;
            M.telegraph(e.root.position, cfg.slam.radius, M.T(0.8), 0xff3020, 'ring', { follow: e });
            e.specialCd = cfg.slam.cd / en;
          } else if (dist < 24) {
            e.mode = 'windup'; e.modeT = 0;
            e.chargeDir.set(dx, 0, dz);
            M.telegraph(e.root.position.clone(), 0, M.T(cfg.charge.windup), 0xff3020, 'line', { dir: e.chargeDir.clone(), yaw: Math.atan2(dx, dz), len: cfg.charge.speed * cfg.charge.duration, width: 2.2 });
          }
        }
        if (e.summonCd <= 0) {
          e.summonCd = cfg.summon.cd;
          for (let k = 0; k < cfg.summon.count + (e.enraged ? 2 : 0); k++) {
            const ang = Math.random() * Math.PI * 2;
            M.onSummon?.(cfg.summon.type, e.root.position.clone().add(_v.set(Math.cos(ang) * 4, 0, Math.sin(ang) * 4)));
          }
        }
      }
    }
    e.anim.mode = e.mode;
  },

  // ---------------------------------------------------------------- 玄阴子
  sorcerer(M, e, dt, player, dist, dx, dz, slowK, face) {
    if (e.form === 'beast') return BOSS_AI.beast(M, e, dt, player, dist, dx, dz, slowK, face);
    const A = e.ai;
    const aggro = M.difficulty.aggro ?? 1;
    A.hover = (A.hover ?? 0) + dt;
    e.ai.flyY = 0.35 + Math.sin(A.hover * 1.4) * 0.12 + (e.mode === 'transform' ? Math.min(1, e.modeT) * 1.6 : 0);
    // 环绕的黑符
    if (Math.random() < dt * 14) {
      const a = A.hover * 2 + Math.random() * 6.28;
      const c = e.root.position;
      M.effects.add.emit(c.x + Math.cos(a) * 0.9, c.y + 1 + Math.random() * 1.2, c.z + Math.sin(a) * 0.9, 0, 0.6, 0, 0.6, 0.25, 1, 0.12, 0.8, -0.3, 0.5, 0);
    }
    switch (e.mode) {
      case 'roar': tickRoar(e, dt); return;
      case 'transform': {
        e.modeT += dt / 3.0;
        e.vel.set(0, 0, 0);
        face(dx, dz, 3);
        if (Math.random() < dt * 30) M.effects.darkSwirl(e.root.position, [0.6, 0.2, 1], 6, 2.5);
        if (Math.random() < dt * 3) M.onShake?.(0.12);
        if (e.modeT >= 1) {
          M.swapForm(e);
          e.mode = 'roar'; e.modeT = 0; e.roarDur = 1.2;
          e.ai.flyY = undefined;
          e.speed = e.cfg.speed * 1.3 * M.difficulty.speed;
          e.root.position.y = 0;
          M.effects.darkSwirl(e.root.position, [0.8, 0.2, 0.4], 120, 4);
          M.effects.shockRing(e.root.position, 10, 0xff3060, 0.9);
          M.shockwave(e.root.position, 7, 18 * e.dmgMult, 0xb050ff);
          M.effects.debris(e.root.position, 30, 1.4);
          M.onShake?.(0.9);
          Audio.bossRoar(e.root.position);
          Audio.slam(e.root.position);
        }
        return;
      }
      case 'blink':
        e.modeT += dt / 0.55;
        e.vel.set(0, 0, 0);
        if (!A.blinked && e.modeT > 0.5) {
          A.blinked = true;
          M.effects.darkSwirl(e.root.position, [0.5, 0.15, 0.9], 40, 1.2);
          const ang = Math.random() * Math.PI * 2, r = 9 + Math.random() * 5;
          e.root.position.x = THREE.MathUtils.clamp(player.position.x + Math.cos(ang) * r, -31, 31);
          e.root.position.z = THREE.MathUtils.clamp(player.position.z + Math.sin(ang) * r, -31, 31);
          M.effects.darkSwirl(e.root.position, [0.5, 0.15, 0.9], 40, 1.2);
          Audio.whoosh();
        }
        if (e.modeT >= 1) { e.mode = 'walk'; e.modeT = 0; }
        return;
      case 'thunder':
        e.modeT += dt / 1.1;
        e.vel.multiplyScalar(0.9);
        face(dx, dz, 6);
        if (!A.fired && e.modeT > 0.3) {
          A.fired = true;
          const n = e.enraged ? 5 : 3;
          M.strike(pickPlayerLead(player, 0.7), { radius: 2.3, delay: M.T(0.95), dmg: 24 * e.dmgMult, kind: 'thunder', color: 0xb070ff });
          for (let i = 1; i < n; i++) {
            const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 4;
            M.strike(player.position.clone().add(_v.set(Math.cos(a) * r, 0, Math.sin(a) * r)), { radius: 2.1, delay: M.T(0.95 + i * 0.22), dmg: 22 * e.dmgMult, kind: 'thunder', color: 0xb070ff });
          }
          Audio.bell();
        }
        if (e.modeT >= 1) { e.mode = 'walk'; e.modeT = 0; }
        return;
      case 'swords':
        e.modeT += dt / 1.2;
        e.vel.multiplyScalar(0.9);
        face(dx, dz, 6);
        if (!A.fired && e.modeT > 0.3) {
          A.fired = true;
          const n = e.enraged ? 7 : 5;
          const c = e.root.position.clone().add(_v.set(0, 2.2, 0));
          const side = new THREE.Vector3(-dz, 0, dx);
          for (let i = 0; i < n; i++) {
            const off = (i - (n - 1) / 2) * 0.9;
            const from = c.clone().addScaledVector(side, off).add(_v.set(0, Math.abs(off) * -0.25, 0));
            const target = pickPlayerLead(player, 0.25).add(_v2.set(0, 1.0, 0)).addScaledVector(side, off * 0.6);
            M.flyingSword(from, target, { dmg: 16 * e.dmgMult, hover: M.T(0.55) + i * 0.06, speed: 26 });
          }
          Audio.whoosh();
        }
        if (e.modeT >= 1) { e.mode = 'walk'; e.modeT = 0; }
        return;
      case 'summon':
        e.modeT += dt / 1.0;
        e.vel.set(0, 0, 0);
        if (!A.fired && e.modeT > 0.4) {
          A.fired = true;
          for (let k = 0; k < 3; k++) {
            const ang = Math.random() * Math.PI * 2;
            const p = e.root.position.clone().add(_v.set(Math.cos(ang) * 3, 0, Math.sin(ang) * 3));
            M.effects.darkSwirl(p, [0.9, 0.5, 0.4], 20, 1);
            M.onSummon?.(e.enraged ? 'soldier' : 'paper', p);
          }
        }
        if (e.modeT >= 1) { e.mode = 'walk'; e.modeT = 0; }
        return;
      case 'slash':
        e.modeT += dt / M.T(0.85);
        e.vel.set(0, 0, 0);
        face(dx, dz, 10);
        if (!A.fired && e.modeT > 0.45) {
          A.fired = true;
          M.effects.shockRing(e.root.position, 3, 0xb050ff, 0.25);
          if (dist < 3.4) M.onPlayerHit?.(28 * e.dmgMult, e.root.position, 'melee');
          Audio.knifeSwing();
        }
        if (e.modeT >= 1) { e.mode = 'walk'; e.modeT = 0; }
        return;
      default: {
        // 悬浮游走，保持中距离
        const want = dist > 13 ? 1 : dist < 8 ? -1 : 0;
        const sp = e.speed * slowK * 0.8;
        e.vel.set((dx * want - dz * e.strafe * 0.7) * sp, 0, (dz * want + dx * e.strafe * 0.7) * sp);
        if (Math.random() < dt * 0.3) e.strafe *= -1;
        face(dx, dz, 5);
        e.specialCd -= dt * aggro;
        if (dist < 3 && e.specialCd < 1.5) {
          e.mode = 'slash'; e.modeT = 0; A.fired = false;
          M.telegraph(e.root.position.clone(), 3.2, M.T(0.4), 0xb050ff, 'ring', { follow: e });
          return;
        }
        if (e.blinkDmg > e.maxHp * 0.08 || (dist < 5 && Math.random() < dt * 0.8)) {
          e.blinkDmg = 0; e.mode = 'blink'; e.modeT = 0; A.blinked = false;
          return;
        }
        if (e.specialCd <= 0) {
          e.specialCd = (e.enraged ? 1.6 : 2.3) + Math.random() * 0.6;
          const papers = M.list.filter((o) => o.alive && !o.dying && (o.type === 'paper' || o.type === 'soldier')).length;
          const r = Math.random();
          A.fired = false;
          if (r < 0.15 && papers < 5) { e.mode = 'summon'; e.modeT = 0; }
          else if (r < 0.58) { e.mode = 'thunder'; e.modeT = 0; }
          else { e.mode = 'swords'; e.modeT = 0; }
        }
      }
    }
  },

  // 尸化形态：凶猛近战 + 冲撞 + 震地 + 跃击 + 血火环
  beast(M, e, dt, player, dist, dx, dz, slowK, face) {
    const cfg = { charge: { windup: 0.85, speed: 17, duration: 0.85, damage: 34, cd: 5.5 }, slam: { radius: 6.5, dmg: 30, cd: 7 }, leap: { radius: 6.5, dmg: 36 }, breath: { dur: 1.6, range: 9.5, angle: 0.5, dps: 40 } };
    const en = e.enraged ? 1.25 : 1;
    const sp = e.speed * slowK * en;
    const A = e.ai;
    e.specialCd -= dt * e.atkSpeed;
    switch (e.mode) {
      case 'roar': tickRoar(e, dt); return;
      case 'windup':
        e.modeT += dt / M.T(cfg.charge.windup);
        e.vel.set(0, 0, 0);
        face(e.chargeDir.x, e.chargeDir.z, 20);
        if (e.modeT >= 1) { e.mode = 'charge'; e.modeT = 0; e.dashHit = false; Audio.bossRoar(e.root.position); }
        return;
      case 'charge': {
        e.modeT += dt / cfg.charge.duration;
        e.vel.copy(e.chargeDir).multiplyScalar(cfg.charge.speed * en);
        if (Math.random() < dt * 40) M.effects.dust(e.root.position.clone());
        const pd = Math.hypot(player.position.x - e.root.position.x, player.position.z - e.root.position.z);
        if (!e.dashHit && pd < 2.3) { e.dashHit = true; M.onPlayerHit?.(cfg.charge.damage * e.dmgMult, e.root.position, 'charge'); }
        if (e.modeT >= 1) { e.mode = 'walk'; e.modeT = 0; e.specialCd = cfg.charge.cd / en; }
        return;
      }
      case 'slam':
        e.modeT += dt / 1.2;
        e.vel.set(0, 0, 0);
        if (!e.slammed && e.modeT > 0.62) {
          e.slammed = true;
          M.shockwave(e.root.position, cfg.slam.radius, cfg.slam.dmg * e.dmgMult, 0xb030ff);
          M.effects.debris(e.root.position, 24, 1.3);
          M.onShake?.(0.5);
          Audio.slam(e.root.position);
          const n = e.enraged ? 16 : 10;
          for (let k = 0; k < n; k++) {
            const ang = (k / n) * Math.PI * 2;
            const c = M.center(e, new THREE.Vector3());
            M.fireOrb(c, c.clone().add(_v.set(Math.cos(ang), 0, Math.sin(ang))), { speed: 9, dmg: 14 * e.dmgMult, homing: 0, color: 0xc060ff, size: 0.8, life: 4 });
          }
        }
        if (e.modeT >= 1) { e.mode = 'walk'; e.modeT = 0; }
        return;
      case 'leapWind':
        e.modeT += dt;
        e.vel.set(0, 0, 0);
        if (e.modeT >= M.T(0.5)) {
          e.mode = 'leap'; e.modeT = 0;
          A.leapFrom = e.root.position.clone();
          A.leapTo = pickPlayerLead(player, 0.45);
          A.leapTo.x = THREE.MathUtils.clamp(A.leapTo.x, -31, 31); A.leapTo.z = THREE.MathUtils.clamp(A.leapTo.z, -31, 31);
          M.telegraph(A.leapTo, cfg.leap.radius, 0.95, 0xb030ff);
          Audio.whoosh();
        }
        return;
      case 'leap': {
        e.modeT += dt / 0.95;
        const k = Math.min(1, e.modeT);
        e.root.position.x = THREE.MathUtils.lerp(A.leapFrom.x, A.leapTo.x, k);
        e.root.position.z = THREE.MathUtils.lerp(A.leapFrom.z, A.leapTo.z, k);
        e.ai.flyY = Math.sin(k * Math.PI) * 8;
        e.vel.set(0, 0, 0);
        if (k >= 1) {
          e.ai.flyY = undefined;
          e.mode = 'slam'; e.modeT = 0.62; e.slammed = true;
          M.shockwave(A.leapTo, cfg.leap.radius, cfg.leap.dmg * e.dmgMult, 0xb030ff);
          M.effects.debris(A.leapTo, 30, 1.5);
          M.effects.darkSwirl(A.leapTo, [0.8, 0.2, 0.5], 40, 3);
          M.onShake?.(0.8);
          Audio.slam(A.leapTo);
          e.specialCd = 2.2;
        }
        return;
      }
      default: {
        e.vel.set(dx * sp, 0, dz * sp);
        if (dist < 2.4) e.vel.multiplyScalar(0.15);
        face(dx, dz, 6);
        if (e.specialCd <= 0 && e.atkT < 0) {
          const r = Math.random();
          if (dist > 6 && r < (e.phase >= 2 ? 0.5 : 0.3)) { e.mode = 'leapWind'; e.modeT = 0; }
          else if (dist < 7) {
            e.mode = 'slam'; e.modeT = 0; e.slammed = false;
            M.telegraph(e.root.position, cfg.slam.radius, M.T(0.75), 0xb030ff, 'ring', { follow: e });
            e.specialCd = cfg.slam.cd / en;
          } else if (dist < 24) {
            e.mode = 'windup'; e.modeT = 0;
            e.chargeDir.set(dx, 0, dz);
            M.telegraph(e.root.position.clone(), 0, M.T(cfg.charge.windup), 0xb030ff, 'line', { dir: e.chargeDir.clone(), yaw: Math.atan2(dx, dz), len: cfg.charge.speed * cfg.charge.duration, width: 2.4 });
          }
        }
        e.summonCd -= dt;
        if (e.phase >= 2 && e.summonCd <= 0) {
          e.summonCd = 12;
          for (let k = 0; k < 3; k++) {
            const ang = Math.random() * Math.PI * 2;
            M.onSummon?.('flying', e.root.position.clone().add(_v.set(Math.cos(ang) * 5, 0, Math.sin(ang) * 5)));
          }
        }
      }
    }
  },
};
