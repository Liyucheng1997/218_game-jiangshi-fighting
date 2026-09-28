// =====================================================================
//  程序化动画：所有骨骼在绑定姿态下无旋转，这里直接写欧拉角。
//  约定：rotation.x 负 = 向前抬（手臂/大腿），正 = 向后；
//        手臂 rotation.z：左臂 +z 外展，右臂 -z 外展。
// =====================================================================

const PI = Math.PI;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const easeOutBack = (x) => { x = clamp01(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

function R(b, x = 0, y = 0, z = 0) { b.rotation.set(x, y, z); }

export function zeroPose(b) {
  for (const k in b) b[k].rotation.set(0, 0, 0);
}

// 通用走/跑腿部循环（phase 弧度，amt 0..1 步幅）
export function legCycle(b, phase, amt, kneeAmt = 1) {
  const s = Math.sin(phase) * amt;
  R(b.thigh_L, -s * 0.75, 0, 0);
  R(b.thigh_R, s * 0.75, 0, 0);
  R(b.shin_L, Math.max(0, Math.sin(phase + 1.3)) * 1.0 * amt * kneeAmt + 0.05, 0, 0);
  R(b.shin_R, Math.max(0, Math.sin(phase + PI + 1.3)) * 1.0 * amt * kneeAmt + 0.05, 0, 0);
  R(b.foot_L, -Math.min(0, Math.sin(phase + 0.5)) * 0.3 * amt, 0, 0);
  R(b.foot_R, -Math.min(0, Math.sin(phase + PI + 0.5)) * 0.3 * amt, 0, 0);
}

// ---------------------------------------------------------------- 僵尸
// st: { t, air(0..1 跳跃进度, -1 落地), atk(0..1 或 -1), hit, speedK, style, dance }
export function poseJiangshi(b, st) {
  const t = st.t;
  const bob = Math.sin(t * 2.1 + st.seed) * 0.04;
  const atk = st.atk;
  // 双臂平举
  let armX = -1.5 + bob, armZ = 0.12;
  let foreX = -0.05, handX = 0.55 + Math.sin(t * 3 + st.seed) * 0.08;
  if (atk >= 0) {
    // 三段爪击：抬 → 劈 → 回
    if (atk < 0.35) { const k = ease(atk / 0.35); armX = -1.5 - 0.9 * k; foreX = -0.2 * k; handX = 0.55 - 0.9 * k; }
    else if (atk < 0.6) { const k = ease((atk - 0.35) / 0.25); armX = -2.4 + 1.6 * k; foreX = -0.2 + 0.1 * k; handX = -0.35 + 0.9 * k; }
    else { const k = ease((atk - 0.6) / 0.4); armX = -0.8 - 0.7 * k; handX = 0.55; }
  }
  R(b.arm_L, armX, 0.05, armZ - 0.35 * (atk >= 0 && atk < 0.6 ? 0.3 : 0) - 0.18);
  R(b.arm_R, armX + (st.style === 'claw' ? Math.sin(t * 5) * 0.08 : 0), -0.05, -armZ + 0.18);
  R(b.fore_L, foreX, 0, 0);
  R(b.fore_R, foreX, 0, 0);
  R(b.hand_L, handX, 0, 0.1);
  R(b.hand_R, handX, 0, -0.1);
  // 僵直躯干，落地时微俯
  const land = st.air < 0 ? ease(1 - Math.min(1, st.landT * 5)) : 0;
  const lunge = atk >= 0 && atk < 0.6 ? Math.sin(atk / 0.6 * PI) * 0.35 : 0;
  R(b.hips, 0, 0, 0);
  R(b.spine, 0.05 + land * 0.12 + lunge * 0.5, 0, Math.sin(t * 1.3 + st.seed) * 0.03);
  R(b.chest, lunge * 0.3, 0, 0);
  R(b.neck, -0.08 - lunge * 0.4, 0, 0);
  R(b.head, -0.12 + Math.sin(t * 1.7 + st.seed) * 0.05, Math.sin(t * 0.7 + st.seed) * 0.08, Math.sin(t * 1.1) * 0.06);
  // 双腿并拢，空中绷脚
  const air = st.air >= 0 ? Math.sin(st.air * PI) : 0;
  R(b.thigh_L, -air * 0.12 + land * -0.25, 0, 0.02);
  R(b.thigh_R, -air * 0.12 + land * -0.25, 0, -0.02);
  R(b.shin_L, air * 0.1 + land * 0.45, 0, 0);
  R(b.shin_R, air * 0.1 + land * 0.45, 0, 0);
  R(b.foot_L, air * 0.55 - land * 0.2, 0, 0);
  R(b.foot_R, air * 0.55 - land * 0.2, 0, 0);
  if (st.hit > 0) {
    const h = st.hit;
    b.spine.rotation.x -= h * 0.35;
    b.head.rotation.x -= h * 0.4;
    b.arm_L.rotation.x += h * 0.3;
    b.arm_R.rotation.x += h * 0.3;
  }
}

// 犼：重踏行走 + 冲撞 + 蓄力 + 砸地
export function poseHou(b, st) {
  const t = st.t;
  if (st.mode === 'charge' || st.mode === 'run') {
    const ph = t * 11;
    legCycle(b, ph, 0.95, 1.2);
    R(b.spine, 0.55, 0, 0); R(b.chest, 0.2, 0, 0); R(b.neck, -0.5, 0, 0); R(b.head, -0.3, 0, 0);
    R(b.arm_L, 0.6 + Math.sin(ph) * 0.4, 0, 0.5); R(b.arm_R, 0.6 - Math.sin(ph) * 0.4, 0, -0.5);
    R(b.fore_L, -0.6, 0, 0); R(b.fore_R, -0.6, 0, 0);
    R(b.hand_L, 0, 0, 0); R(b.hand_R, 0, 0, 0);
    return;
  }
  if (st.mode === 'windup') {
    const k = ease(st.modeT * 2);
    const shake = Math.sin(t * 40) * 0.03 * k;
    R(b.spine, -0.25 * k, 0, shake); R(b.chest, -0.15 * k, 0, 0); R(b.neck, 0.1 * k, 0, 0); R(b.head, -0.25 * k, shake, 0);
    R(b.arm_L, -0.4 * k, 0, 1.2 * k); R(b.arm_R, -0.4 * k, 0, -1.2 * k);
    R(b.fore_L, -1.0 * k, 0, 0); R(b.fore_R, -1.0 * k, 0, 0);
    R(b.hand_L, 0, 0, 0); R(b.hand_R, 0, 0, 0);
    R(b.thigh_L, -0.35 * k, 0, 0.2 * k); R(b.thigh_R, -0.35 * k, 0, -0.2 * k);
    R(b.shin_L, 0.6 * k, 0, 0); R(b.shin_R, 0.6 * k, 0, 0);
    R(b.foot_L, -0.25 * k, 0, 0); R(b.foot_R, -0.25 * k, 0, 0);
    return;
  }
  if (st.mode === 'slam') {
    const k = st.modeT;
    const up = k < 0.45 ? ease(k / 0.45) : 1 - ease((k - 0.45) / 0.2);
    R(b.spine, -0.3 * up + 0.5 * (1 - up) * (k > 0.45 ? 1 : 0), 0, 0);
    R(b.chest, 0, 0, 0); R(b.neck, 0, 0, 0); R(b.head, -0.2, 0, 0);
    R(b.arm_L, -2.8 * up - 0.8 * (1 - up), 0, 0.3); R(b.arm_R, -2.8 * up - 0.8 * (1 - up), 0, -0.3);
    R(b.fore_L, -0.4 * up, 0, 0); R(b.fore_R, -0.4 * up, 0, 0);
    R(b.hand_L, 0, 0, 0); R(b.hand_R, 0, 0, 0);
    R(b.thigh_L, -0.3, 0, 0.25); R(b.thigh_R, -0.3, 0, -0.25);
    R(b.shin_L, 0.5, 0, 0); R(b.shin_R, 0.5, 0, 0);
    R(b.foot_L, -0.2, 0, 0); R(b.foot_R, -0.2, 0, 0);
    return;
  }
  if (st.mode === 'roar') {
    const k = Math.sin(clamp01(st.modeT) * PI);
    R(b.spine, -0.35 * k, 0, 0); R(b.chest, -0.2 * k, 0, 0); R(b.neck, -0.2 * k, 0, 0); R(b.head, -0.5 * k, Math.sin(t * 30) * 0.05 * k, 0);
    R(b.arm_L, -0.3, 0, 1.3 * k + 0.2); R(b.arm_R, -0.3, 0, -1.3 * k - 0.2);
    R(b.fore_L, -1.2 * k, 0, 0); R(b.fore_R, -1.2 * k, 0, 0);
    legCycle(b, 0, 0);
    return;
  }
  // 行走：沉重步伐
  const ph = t * 5.5;
  const amt = Math.min(1, st.speedK);
  legCycle(b, ph, amt * 0.7, 1);
  R(b.spine, 0.3, Math.sin(ph) * 0.12 * amt, 0); R(b.chest, 0.1, 0, 0);
  R(b.neck, -0.25, 0, 0); R(b.head, -0.1 + Math.sin(t * 1.3) * 0.05, Math.sin(t * 0.8) * 0.2, 0);
  const atk = st.atk;
  let ax = -0.6 + Math.sin(ph) * 0.3 * amt;
  if (atk >= 0) ax = atk < 0.4 ? -0.6 - 1.8 * ease(atk / 0.4) : -2.4 + 2.2 * ease((atk - 0.4) / 0.3);
  R(b.arm_L, ax, 0, 0.4); R(b.arm_R, atk >= 0 ? ax : -0.6 - Math.sin(ph) * 0.3 * amt, 0, -0.4);
  R(b.fore_L, -0.7, 0, 0); R(b.fore_R, -0.7, 0, 0);
  R(b.hand_L, 0.2, 0, 0); R(b.hand_R, 0.2, 0, 0);
}

// ---------------------------------------------------------------- 小鬼
export function poseImp(b, st) {
  const t = st.t;
  const ph = st.phase;
  const amt = Math.min(1.2, st.speedK);
  legCycle(b, ph, amt, 1.3);
  b.thigh_L.rotation.x -= 0.35; b.thigh_R.rotation.x -= 0.35;
  b.shin_L.rotation.x += 0.45; b.shin_R.rotation.x += 0.45;
  R(b.hips, 0, Math.sin(ph) * 0.15, 0);
  R(b.spine, 0.45 + Math.sin(ph * 2) * 0.05, 0, 0);
  R(b.chest, 0.2, 0, 0);
  R(b.neck, -0.55, 0, 0);
  R(b.head, -0.1 + Math.sin(t * 7) * 0.08, Math.sin(t * 3 + st.seed) * 0.25, 0);
  const atk = st.atk;
  if (atk >= 0) {
    const k = Math.sin(clamp01(atk) * PI);
    R(b.arm_L, -1.2 - k * 1.2, 0, 0.3); R(b.arm_R, -1.2 - k * 1.2, 0, -0.3);
    R(b.fore_L, -0.3, 0, 0); R(b.fore_R, -0.3, 0, 0);
  } else {
    R(b.arm_L, 0.6 + Math.sin(ph + PI) * 0.7 * amt, 0, 0.35); R(b.arm_R, 0.6 + Math.sin(ph) * 0.7 * amt, 0, -0.35);
    R(b.fore_L, -0.9, 0, 0); R(b.fore_R, -0.9, 0, 0);
  }
  R(b.hand_L, 0.3, 0, 0); R(b.hand_R, 0.3, 0, 0);
}

// ---------------------------------------------------------------- 纸人：僵硬抽搐的小碎步
export function posePaper(b, st) {
  const t = st.t;
  const ph = st.phase;
  const amt = Math.min(1, st.speedK) * 0.45;
  const s = Math.sin(ph) * amt;
  R(b.thigh_L, -s, 0, 0); R(b.thigh_R, s, 0, 0);
  R(b.shin_L, 0, 0, 0); R(b.shin_R, 0, 0, 0);
  R(b.foot_L, 0, 0, 0); R(b.foot_R, 0, 0, 0);
  const jitter = (Math.sin(t * 23 + st.seed) > 0.9 ? 0.2 : 0);
  R(b.hips, 0, 0, Math.sin(ph) * 0.06);
  R(b.spine, 0, 0, 0); R(b.chest, 0, 0, 0);
  R(b.neck, 0, 0, 0);
  R(b.head, jitter * 0.5, Math.sin(t * 0.9 + st.seed) * 0.3, 0.35 + jitter);
  const atk = st.atk;
  if (atk >= 0) {
    const k = Math.sin(clamp01(atk) * PI);
    R(b.arm_L, -1.6 * k, 0, 0.1); R(b.arm_R, -1.6 * k, 0, -0.1);
  } else {
    R(b.arm_L, s * 0.6, 0, 0.12); R(b.arm_R, s * 0.6, 0, -0.12);
  }
  R(b.fore_L, 0, 0, 0); R(b.fore_R, 0, 0, 0);
  R(b.hand_L, 0, 0, 0); R(b.hand_R, 0, 0, 0);
}

// ---------------------------------------------------------------- 厉鬼：漂浮
export function poseGhost(b, st) {
  const t = st.t;
  const sway = Math.sin(t * 1.4 + st.seed);
  R(b.hips, 0.05, 0, sway * 0.05);
  R(b.spine, 0.12, 0, 0); R(b.chest, 0.05, 0, 0);
  R(b.neck, 0.15, 0, 0);
  R(b.head, 0.2 + Math.sin(t * 0.9) * 0.1, Math.sin(t * 0.6 + st.seed) * 0.2, 0.2 + sway * 0.1);
  const cast = st.cast ?? -1;
  if (cast >= 0) {
    const k = Math.sin(clamp01(cast) * PI);
    R(b.arm_L, -1.3 - k * 0.9, 0, 0.3 + k * 0.6); R(b.arm_R, -1.3 - k * 0.9, 0, -0.3 - k * 0.6);
    R(b.fore_L, -0.2, 0, 0); R(b.fore_R, -0.2, 0, 0);
    b.head.rotation.x -= k * 0.4;
  } else {
    R(b.arm_L, -1.25 + Math.sin(t * 2 + 1) * 0.1, 0, 0.1); R(b.arm_R, -1.25 + Math.sin(t * 2) * 0.1, 0, -0.1);
    R(b.fore_L, -0.1, 0, 0); R(b.fore_R, -0.1, 0, 0);
  }
  R(b.hand_L, 0.6, 0, 0); R(b.hand_R, 0.6, 0, 0);
  // 腿收于裙内并随漂浮拖曳
  R(b.thigh_L, 0.25 + sway * 0.1, 0, 0); R(b.thigh_R, 0.3 - sway * 0.1, 0, 0);
  R(b.shin_L, 0.4, 0, 0); R(b.shin_R, 0.4, 0, 0);
  R(b.foot_L, 0.6, 0, 0); R(b.foot_R, 0.6, 0, 0);
}

// ---------------------------------------------------------------- 无常：飘忽大步 / 甩链 / 砸棒
export function poseWuchang(b, st, black) {
  const t = st.t;
  const ph = st.phase;
  const amt = Math.min(1, st.speedK) * 0.6;
  legCycle(b, ph, amt, 0.7);
  R(b.hips, 0, Math.sin(ph) * 0.1 * amt, 0);
  R(b.spine, 0.12, 0, Math.sin(t * 1.2) * 0.04);
  R(b.chest, 0, 0, 0);
  R(b.neck, 0.05, 0, 0);
  R(b.head, black ? -0.05 : 0.1 + Math.sin(t * 2) * 0.1, Math.sin(t * 0.7 + st.seed) * 0.2, black ? 0 : 0.25 + Math.sin(t * 1.3) * 0.1);
  const atk = st.atk;
  const mode = st.mode;
  if (atk >= 0 && mode === 'throw') {
    // 右臂后引 → 前甩
    const k = atk < 0.4 ? ease(atk / 0.4) : 1 - ease((atk - 0.4) / 0.25);
    R(b.arm_R, -0.4 - 2.3 * (atk < 0.4 ? k : 1) + (atk >= 0.4 ? 1.8 * ease((atk - 0.4) / 0.25) : 0), 0, -0.2);
    R(b.fore_R, -0.8 * k, 0, 0);
    R(b.arm_L, 0.2, 0, 0.3); R(b.fore_L, -0.4, 0, 0);
    b.spine.rotation.y = -0.3 * k;
  } else if (atk >= 0 && mode === 'slam') {
    const k = atk < 0.45 ? ease(atk / 0.45) : 1 - ease((atk - 0.45) / 0.2);
    R(b.arm_R, -0.6 - 2.4 * k, 0, -0.15); R(b.arm_L, -0.6 - 2.4 * k, 0, 0.15);
    R(b.fore_R, -0.4 * k, 0, 0); R(b.fore_L, -0.4 * k, 0, 0);
    b.spine.rotation.x += (1 - k) * 0.4 * (atk > 0.45 ? 1 : 0) - k * 0.2;
  } else if (atk >= 0 && mode === 'dash') {
    R(b.arm_R, 0.8, 0, -0.3); R(b.arm_L, 0.8, 0, 0.3);
    R(b.fore_R, -0.2, 0, 0); R(b.fore_L, -0.2, 0, 0);
    b.spine.rotation.x += 0.5;
  } else {
    const sw = Math.sin(ph) * amt * 0.6;
    R(b.arm_L, sw - 0.1, 0, 0.18); R(b.arm_R, -sw - 0.25, 0, -0.18);
    R(b.fore_L, -0.35, 0, 0); R(b.fore_R, -0.5, 0, 0);
  }
  R(b.hand_L, 0.1, 0, 0); R(b.hand_R, 0.1, 0, 0);
}

// ---------------------------------------------------------------- 图鉴 / 菜单 专属舞步
export function poseDance(kind, b, t, seed = 0) {
  const beat = t * 2.2 + seed;
  const pulse = Math.pow(Math.abs(Math.sin(beat * PI * 0.5)), 3);
  switch (kind) {
    case 'jiangshi': {
      poseJiangshi(b, { t, seed, atk: -1, hit: 0, air: -1, landT: 1, style: '' });
      b.arm_L.rotation.x += Math.sin(beat * PI) * 0.35;
      b.arm_R.rotation.x -= Math.sin(beat * PI) * 0.35;
      b.spine.rotation.y = Math.sin(beat * PI * 0.5) * 0.3;
      b.head.rotation.z = Math.sin(beat * PI) * 0.2;
      return pulse * 0.12;
    }
    case 'imp':
      poseImp(b, { t, phase: t * 8, speedK: 0.5, atk: -1, seed });
      b.arm_L.rotation.x = -2.4 + Math.sin(t * 8) * 0.5; b.arm_R.rotation.x = -2.4 - Math.sin(t * 8) * 0.5;
      return Math.abs(Math.sin(t * 4)) * 0.15;
    case 'paper':
      posePaper(b, { t, phase: t * 3, speedK: 0.6, atk: -1, seed });
      return 0;
    case 'ghost':
      poseGhost(b, { t, seed, cast: (t * 0.4) % 1 < 0.5 ? ((t * 0.4) % 1) * 2 : -1 });
      return 0.25 + Math.sin(t * 1.2) * 0.08;
    case 'wuWhite':
    case 'wuBlack':
      poseWuchang(b, { t, phase: t * 3, speedK: 0.6, atk: ((t * 0.35) % 1), mode: kind === 'wuWhite' ? 'throw' : 'slam', seed }, kind === 'wuBlack');
      return 0;
    case 'hou':
      poseHou(b, { t, mode: (t % 6) < 2 ? 'roar' : 'walk', modeT: ((t % 6) / 2), speedK: 0.3, atk: -1 });
      return 0;
    default:
      return 0;
  }
}

// 死亡：返回根节点变换 { rotX, rotZ, dy, scaleY }
export function deathTransform(kind, k) {
  switch (kind) {
    case 'jiangshi':
      return { rotX: -easeOutBack(k * 1.4) * PI / 2 * 0.98, rotZ: 0, dy: 0, scaleY: 1 };
    case 'hou':
      return { rotX: ease(k * 1.2) * PI / 2 * 0.9, rotZ: 0.2 * ease(k), dy: 0, scaleY: 1 };
    case 'imp':
      return { rotX: ease(k * 2) * PI / 2, rotZ: 0.4 * ease(k * 2), dy: 0, scaleY: 1 };
    case 'ghost':
      return { rotX: 0, rotZ: 0, dy: ease(k) * 1.2, scaleY: 1 - ease(k) * 0.95 };
    case 'paper':
      return { rotX: ease(k * 1.5) * 0.6, rotZ: 0, dy: -ease(k) * 0.3, scaleY: 1 - ease(k) * 0.9 };
    default:
      return { rotX: ease(k * 1.4) * PI / 2 * 0.95, rotZ: 0, dy: 0, scaleY: 1 };
  }
}

export { ease, clamp01 };
