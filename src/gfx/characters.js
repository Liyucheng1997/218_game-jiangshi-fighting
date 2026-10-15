import * as THREE from 'three';
import { RigBuilder } from './rig.js';
import { REGION, FACE } from './textures.js';
import {
  V, place, loft, limb, lathe, sphere, roundedBox, cyl, cone, torus,
  curvedPlane, tatters, braid, tube, claw, horn, hand, faceted,
} from './shapes.js';

// =====================================================================
//  全部角色的程序化建模（参照 v1.0 的 Tripo 模型造型：清代官服、补子、
//  海水江崖袍摆、暖帽顶珠、额贴符纸、长辫……）
//  坐标：面朝 +Z，左侧 = +X，脚底 y = 0，单位米。
// =====================================================================

// ---------------------------------------------------------------- 骨架
function defineSkeleton(rb, s = 1, o = {}) {
  const P = {
    hips: V(0, 0.98, 0), spine: V(0, 1.13, 0), chest: V(0, 1.3, 0), neck: V(0, 1.49, 0), head: V(0, 1.575, 0.005),
    arm: V(0.185, 1.44, 0), fore: V(0.235, 1.17, 0), hand: V(0.27, 0.935, 0),
    thigh: V(0.095, 0.95, 0), shin: V(0.1, 0.53, 0.0), foot: V(0.1, 0.09, 0),
    headC: V(0, 1.66, 0.012), headR: V(0.078, 0.112, 0.095),
    ...o,
  };
  for (const k in P) if (P[k].isVector3 && k !== 'headR') P[k] = P[k].clone().multiplyScalar(s);
  P.headR = P.headR.clone().multiplyScalar(s);
  P.s = s;
  rb.bone('hips', null, P.hips.x, P.hips.y, P.hips.z)
    .bone('spine', 'hips', P.spine.x, P.spine.y, P.spine.z)
    .bone('chest', 'spine', P.chest.x, P.chest.y, P.chest.z)
    .bone('neck', 'chest', P.neck.x, P.neck.y, P.neck.z)
    .bone('head', 'neck', P.head.x, P.head.y, P.head.z);
  for (const sd of [1, -1]) {
    const S = sd > 0 ? 'L' : 'R';
    rb.bone('arm_' + S, 'chest', P.arm.x * sd, P.arm.y, P.arm.z)
      .bone('fore_' + S, 'arm_' + S, P.fore.x * sd, P.fore.y, P.fore.z)
      .bone('hand_' + S, 'fore_' + S, P.hand.x * sd, P.hand.y, P.hand.z)
      .bone('thigh_' + S, 'hips', P.thigh.x * sd, P.thigh.y, P.thigh.z)
      .bone('shin_' + S, 'thigh_' + S, P.shin.x * sd, P.shin.y, P.shin.z)
      .bone('foot_' + S, 'shin_' + S, P.foot.x * sd, P.foot.y, P.foot.z);
  }
  return P;
}

const sd2S = (sd) => (sd > 0 ? 'L' : 'R');
const mix = (a, b, t) => a + (b - a) * t;
function sm(e0, e1, x) { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

function profileR(profile, y) {
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
    if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) return mix(r0, r1, (y - y0) / ((y1 - y0) || 1));
  }
  return profile[y < profile[0][1] ? 0 : profile.length - 1][0];
}

function shade(hex, k) { return new THREE.Color(hex).multiplyScalar(k); }

// 柔性权重：从挂点 topY 向下 len 米逐渐变软（布条、符纸、发丝）
const hang = (topY, len, k = 1) => (v) => Math.min(1, Math.max(0, (topY - v.y) / len)) * k;
// 以某点为根，按距离变软
const hangFrom = (root, len, k = 1) => (v) => Math.min(1, v.distanceTo(root) / len) * k;
// 袍摆：靠近下摆处微微飘动
const hemFlex = (hemY, s, k = 0.35) => (v) => sm((hemY + 0.38) * s, hemY * s, v.y) * k;

// ---------------------------------------------------------------- 头部
function buildHead(rb, P, look) {
  const c = P.headC, r = P.headR, s = P.s;
  const skin = look.skin;
  // 颅骨
  rb.add(place(sphere(1, 24, 18), [c.x, c.y, c.z], [0, 0, 0], [r.x, r.y, r.z]), { bone: 'head', color: skin, rough: 0.62 });
  // 面壳（贴花）
  const f = new THREE.SphereGeometry(1, 30, 22, 0, Math.PI, 0, Math.PI);
  place(f, [c.x, c.y, c.z], [0, 0, 0], [r.x * 1.012, r.y * 1.012, r.z * 1.012]);
  rb.add(f, { bone: 'head', color: skin, decal: REGION.face(look.face), rough: 0.6 });
  // 鼻
  if (look.nose !== false) {
    const nz = c.z + r.z * 0.93;
    rb.add(limb([V(0, c.y + r.y * 0.05, nz - 0.004 * s), V(0, c.y - r.y * 0.2, nz + 0.012 * s), V(0, c.y - r.y * 0.3, nz + 0.014 * s)],
      [0.009 * s, 0.013 * s, 0.014 * s], 8), { bone: 'head', color: shade(skin, 0.96), rough: 0.6 });
  }
  // 耳
  if (look.ears !== false) {
    const pointy = look.pointyEars;
    for (const sd of [1, -1]) {
      const g = pointy
        ? place(cone(0.03 * s, 0.11 * s, 6), [c.x + sd * r.x * 1.05, c.y + 0.02 * s, c.z - 0.01 * s], [0, 0, -sd * 1.1], [0.5, 1, 1])
        : place(sphere(1, 10, 8), [c.x + sd * r.x * 0.98, c.y - 0.005 * s, c.z - 0.005 * s], [0, 0, 0], [0.012 * s, 0.03 * s, 0.022 * s]);
      rb.add(g, { bone: 'head', color: shade(skin, 0.92), rough: 0.65 });
    }
  }
  // 眼（发光或眼窝深陷）
  if (look.eyeGlow) {
    for (const sd of [1, -1]) {
      rb.add(place(sphere(1, 8, 6), [c.x + sd * r.x * 0.36, c.y + 0.0, c.z + r.z * 0.9], [0, 0, 0], [0.011 * s, 0.007 * s, 0.006 * s]),
        { bone: 'head', color: look.eyeGlow, emis: 3.5, rough: 0.3 });
    }
  }
  // 眉弓
  if (look.brow) {
    rb.add(place(sphere(1, 14, 6), [c.x, c.y + r.y * 0.2, c.z + r.z * 0.82], [0, 0, 0], [r.x * 0.82, 0.014 * s, 0.03 * s]), { bone: 'head', color: shade(skin, 0.85), rough: 0.7 });
  }
  // 獠牙
  if (look.fangs) {
    for (const sd of [1, -1]) {
      rb.add(place(cone(0.006 * s, look.fangs * s, 6), [c.x + sd * 0.013 * s, c.y - r.y * 0.62, c.z + r.z * 0.82], [Math.PI, 0, 0]), { bone: 'head', color: 0xf2ecd8, rough: 0.3 });
    }
  }
}

// 清式暖帽（翻檐 + 帽胎 + 顶珠 + 红缨）
function buildQingHat(rb, P, { color = 0x141416, brim = 0x1d1d20, finial = 0xc0302a, tassel = false, ornate = false, scale = 1 } = {}) {
  const c = P.headC, s = P.s * scale;
  const y0 = c.y + P.headR.y * 0.42;
  const brimG = lathe([[0.086, 0], [0.112, -0.003], [0.118, 0.02], [0.114, 0.05], [0.104, 0.058]].map(([r, y]) => [r * s, y * s]), 28, 0.92, 1.06);
  place(brimG, [c.x, y0, c.z - 0.004]);
  rb.add(brimG, { bone: 'head', color: brim, rough: ornate ? 0.4 : 0.9, metal: ornate ? 0.5 : 0, pat: 0.4, uvScale: [3, 1] });
  const dome = lathe([[0.1, 0.01], [0.1, 0.05], [0.09, 0.085], [0.06, 0.112], [0.02, 0.122], [0.0, 0.124]].map(([r, y]) => [r * s, y * s]), 28, 0.92, 1.06);
  place(dome, [c.x, y0, c.z - 0.004]);
  rb.add(dome, { bone: 'head', color, rough: 0.85, pat: 0.5, uvScale: [4, 1] });
  if (tassel) {
    const t = lathe([[0.004, 0.13], [0.03, 0.12], [0.07, 0.1], [0.098, 0.065], [0.102, 0.045]].map(([r, y]) => [r * s, y * s]), 28, 0.93, 1.07);
    place(t, [c.x, y0 + 0.002, c.z - 0.004]);
    rb.add(t, { bone: 'head', color: 0xa81c1c, rough: 0.9, pat: 0.9, uvScale: [12, 1] });
  }
  // 顶珠
  rb.add(place(cyl(0.012 * s, 0.018 * s, 0.02 * s, 10), [c.x, y0 + 0.132 * s, c.z - 0.004]), { bone: 'head', color: 0xc9a040, metal: 0.8, rough: 0.3 });
  rb.add(place(sphere(0.02 * s, 12, 10), [c.x, y0 + 0.155 * s, c.z - 0.004]), { bone: 'head', color: finial, rough: 0.25, metal: 0.2, emis: 0.15 });
  if (ornate) {
    // 金饰额箍与垂珠
    rb.add(place(torus(0.108 * s, 0.006 * s, 6, 32), [c.x, y0 + 0.012 * s, c.z - 0.004], [Math.PI / 2, 0, 0], [0.92, 1.06, 1]), { bone: 'head', color: 0xd4a040, metal: 0.9, rough: 0.3 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 2.2;
      const x = Math.sin(a) * 0.105 * s * 0.92, z = Math.cos(a) * 0.105 * s * 1.06 + c.z;
      rb.add(place(cyl(0.0015 * s, 0.0015 * s, 0.06 * s, 4), [x, y0 - 0.02 * s, z]), { bone: 'head', color: 0xd4a040, metal: 0.9, rough: 0.3 });
      rb.add(place(sphere(0.006 * s, 6, 5), [x, y0 - 0.052 * s, z]), { bone: 'head', color: i % 2 ? 0xc02020 : 0xe0c060, metal: 0.4, rough: 0.3 });
    }
  }
  return y0;
}

function buildTalisman(rb, P, { len = 0.125, width = 0.052 } = {}) {
  const c = P.headC, s = P.s;
  const top = c.y + P.headR.y * 0.5;
  const g = curvedPlane(width * s, len * s, 0.05 * s, 4, 10);
  place(g, [c.x, top - len * s / 2, c.z + P.headR.z * 1.08]);
  rb.add(g, { bone: 'head', decal: REGION.talisman, color: 0xffffff, rough: 0.9, flex: hang(top, len * s, 0.9) });
}

function buildQueue(rb, P, color = 0x121212) {
  const c = P.headC, s = P.s;
  const pts = [
    V(0, c.y - 0.02 * s, c.z - P.headR.z * 0.95), V(-0.05 * s, c.y - 0.12 * s, c.z - 0.085 * s), V(-0.12 * s, 1.47 * s, -0.02 * s),
    V(-0.13 * s, 1.4 * s, 0.1 * s), V(-0.11 * s, 1.25 * s, 0.15 * s), V(-0.1 * s, 1.08 * s, 0.155 * s), V(-0.1 * s, 0.98 * s, 0.15 * s),
  ];
  rb.add(braid(pts, 0.024 * s, 8, 22), {
    weights: (v) => { const t = sm(1.46 * s, 1.56 * s, v.y); return [['head', t], ['chest', 1 - t]]; },
    color, rough: 0.45, flex: (v) => sm(1.32 * s, 0.98 * s, v.y) * 0.55,
  });
  // 辫梢红绳
  rb.add(place(cyl(0.016 * s, 0.012 * s, 0.03 * s, 8), [-0.1 * s, 0.985 * s, 0.15 * s]), { bone: 'chest', color: 0x9a1818, rough: 0.8, flex: 0.55 });
}

// ---------------------------------------------------------------- 身体
function armPts(P, sd) {
  return { a: V(P.arm.x * sd, P.arm.y, P.arm.z), e: V(P.fore.x * sd, P.fore.y, P.fore.z), w: V(P.hand.x * sd, P.hand.y, P.hand.z) };
}
function armChain(P, sd, shoulderW = 0.035) {
  const S = sd2S(sd);
  const { a, e, w } = armPts(P, sd);
  const du = e.clone().sub(a).normalize(), df = w.clone().sub(e).normalize();
  return ['chest', ['arm_' + S, a.clone().addScaledVector(du, -0.01 * P.s), du, shoulderW * P.s], ['fore_' + S, e, df.clone().add(du).normalize(), 0.05 * P.s]];
}
function legChain(P, sd) {
  const S = sd2S(sd);
  return ['hips', ['thigh_' + S, V(P.thigh.x * sd, P.thigh.y - 0.03 * P.s, 0), V(0, -1, 0), 0.04 * P.s],
    ['shin_' + S, P.shin.clone().setX(P.shin.x * sd), V(0, -1, 0), 0.05 * P.s],
    ['foot_' + S, P.foot.clone().setX(P.foot.x * sd).setY(P.foot.y + 0.03 * P.s), V(0, -1, 0), 0.025 * P.s]];
}

// 躯干蒙皮权重：hips→spine→chest + 肩部少量跟随手臂
const torsoWeights = (s) => (v) => {
  const tS = sm(1.02 * s, 1.1 * s, v.y), tC = sm(1.18 * s, 1.26 * s, v.y);
  let w = [['hips', 1 - tS], ['spine', tS * (1 - tC)], ['chest', tS * tC]];
  const ax = Math.abs(v.x);
  const armW = sm(0.12 * s, 0.2 * s, ax) * sm(1.3 * s, 1.42 * s, v.y) * 0.55;
  if (armW > 0) { w = w.map(([b, x]) => [b, x * (1 - armW)]); w.push(['arm_' + (v.x > 0 ? 'L' : 'R'), armW]); }
  return w;
};
const TORSO_PROF = [[0.158, 0.9], [0.16, 1.0], [0.165, 1.12], [0.182, 1.26], [0.196, 1.36], [0.19, 1.42], [0.15, 1.47], [0.08, 1.5], [0.062, 1.51]];

// 上身袍（车削椭圆）
function buildTorso(rb, P, { color, sz = 0.66, bulk = 1, pat = 0.85, rough = 0.85, colorFn } = {}) {
  const s = P.s;
  const prof = TORSO_PROF.map(([r, y]) => [r * s * bulk, y * s]);
  const g = lathe(prof, 28, 1, sz);
  rb.add(g, { weights: torsoWeights(s), color, pat, rough, uvScale: [3, 2], colorFn });
  return prof;
}

// 躯干外壳（甲胄 / 裂纹贴花），从 y0 到 y1，略大于躯干
function buildTorsoShell(rb, P, { y0 = 1.0, y1 = 1.42, bulk = 1, sz = 0.66, grow = 1.03, region, color = 0xffffff, rough = 0.5, metal = 0, emis = 0 } = {}) {
  const s = P.s;
  const ys = [];
  for (let i = 0; i <= 6; i++) ys.push(mix(y0, y1, i / 6));
  const prof = ys.map((y) => [profileR(TORSO_PROF, y) * bulk * grow * s, y * s]);
  rb.add(lathe(prof, 32, 1, sz), { weights: torsoWeights(s), decal: region, color, rough, metal, emis });
}

// 下摆（裙袍），腿部跟随
function buildSkirt(rb, P, { color, hemY = 0.3, topY = 1.02, rTop = 0.165, rHem = 0.3, sz = 0.74, pat = 0.85, rough = 0.85, legFollow = 0.8, open = true, darkHem = 0.75 } = {}) {
  const s = P.s;
  const prof = [[rHem, hemY], [rHem * 0.9, hemY + 0.2], [mix(rHem, rTop, 0.62), mix(hemY, topY, 0.55)], [rTop * 1.04, topY - 0.08], [rTop, topY]]
    .map(([r, y]) => [r * s, y * s]);
  const g = lathe(prof, 32, 1, sz);
  const base = new THREE.Color(color);
  rb.add(g, {
    weights: (v) => {
      const d = sm(topY * s - 0.05 * s, hemY * s, v.y) * legFollow;
      const side = sm(-0.06 * s, 0.06 * s, v.x);
      return [['hips', 1 - d], ['thigh_L', d * side], ['thigh_R', d * (1 - side)]];
    },
    colorFn: (v, c) => c.copy(base).multiplyScalar(mix(darkHem, 1, sm(hemY * s, (hemY + 0.5) * s, v.y))),
    pat, rough, uvScale: [4, 3], flex: hemFlex(hemY, s),
  });
  return prof;
}

function buildHemBand(rb, P, prof, { from, to, sz = 0.74, color = 0xffffff, region = REGION.waves, rough = 0.6, metal = 0.1, legFollow = 0.8, topY = 1.02, hemY = from } = {}) {
  const s = P.s;
  const ys = [];
  for (let i = 0; i <= 4; i++) ys.push(mix(from * s, to * s, i / 4));
  const bandProf = ys.map((y) => [profileR(prof, y) * 1.012, y]);
  const g = lathe(bandProf, 40, 1, sz);
  rb.add(g, {
    weights: (v) => {
      const d = sm(topY * s - 0.05 * s, from * s, v.y) * legFollow;
      const side = sm(-0.06 * s, 0.06 * s, v.x);
      return [['hips', 1 - d], ['thigh_L', d * side], ['thigh_R', d * (1 - side)]];
    },
    decal: region, color, rough, metal, flex: hemFlex(hemY, s),
  });
}

// 宽袖（开口）
function buildSleeves(rb, P, { color, rWrist = 0.1, rShoulder = 0.068, cuff = true, cuffColor = 0xffffff, pat = 0.85, extraLen = 0, cuffRegion = REGION.cuff, tatter = 0 } = {}) {
  const s = P.s;
  rb.mirror((sd) => {
    const { a, e, w } = armPts(P, sd);
    const du = e.clone().sub(a).normalize(), df = w.clone().sub(e).normalize();
    const end = w.clone().addScaledVector(df, (0.045 + extraLen) * s);
    const pts = [a.clone().addScaledVector(du, -0.04 * s), a.clone().addScaledVector(du, 0.03 * s), a.clone().lerp(e, 0.55), e.clone(), e.clone().lerp(end, 0.55), end];
    const radii = [rShoulder * 0.85, rShoulder, rShoulder * 1.02, mix(rShoulder, rWrist, 0.45), mix(rShoulder, rWrist, 0.8), rWrist].map((r) => r * s);
    const parts = [[loft(pts, radii, { seg: 16 }), { chain: armChain(P, sd), color, pat, rough: 0.85, uvScale: [2, 2] }]];
    if (cuff) {
      const c0 = end.clone().addScaledVector(df, -0.075 * s);
      parts.push([loft([c0, end.clone().addScaledVector(df, 0.004 * s)], [radii[5] * 0.93 * 1.03, radii[5] * 1.03], { seg: 20 }),
        { chain: armChain(P, sd), decal: cuffRegion, color: cuffColor, rough: 0.6, metal: 0.1 }]);
    }
    if (tatter) {
      const tg = tatters(radii[5] / s, 0, 9, 0.04, tatter, 0.02, 1, 1, 7 + sd * 3, 0.2);
      tg.scale(s, s, s);
      // 朝向：沿前臂方向
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), df);
      tg.applyQuaternion(q);
      tg.translate(end.x, end.y, end.z);
      parts.push([tg, { bone: 'fore_' + sd2S(sd), color: shade(color, 0.8), pat: 0.6, rough: 0.9, flex: hangFrom(end, tatter * s + 0.02, 1) }]);
    }
    return parts;
  });
}

// 裸臂（小鬼、厉鬼等）
function buildBareArms(rb, P, { color, r = [0.045, 0.038, 0.032] }) {
  const s = P.s;
  rb.mirror((sd) => {
    const { a, e, w } = armPts(P, sd);
    return [limb([a.clone().add(V(-0.02 * sd * s, 0.01 * s, 0)), e, w], r.map((x) => x * s), 10), { chain: armChain(P, sd), color, rough: 0.6 }];
  });
}

function buildHands(rb, P, { color, clawLen = 0, clawColor = 0x2a2420, curl = 0.35, size = 1, thick = 1 } = {}) {
  const s = P.s;
  rb.mirror((sd) => {
    const { e, w } = armPts(P, sd);
    const df = w.clone().sub(e).normalize();
    const ang = Math.atan2(df.x, -df.y);
    const list = hand(sd, { curl, clawLen: clawLen * s, thick, palm: [0.085 * s * size, 0.09 * s * size, 0.03 * s * size], finger: 0.07 * s * size });
    return list.map((it) => {
      place(it.g, [w.x, w.y + 0.01 * s, w.z], [0, 0, ang]);
      return [it.g, it.kind === 'claw'
        ? { bone: 'hand_' + sd2S(sd), color: clawColor, rough: 0.3, metal: 0.2 }
        : { bone: 'hand_' + sd2S(sd), color, rough: 0.6 }];
    });
  });
}

function buildLegs(rb, P, { color = 0x16161a, boot = 0x111114, sole = 0xe6e2d6, sock = null, r = [0.078, 0.062, 0.05], beast = false, shoe = 'boot', clawLen = 0 } = {}) {
  const s = P.s;
  rb.mirror((sd) => {
    const hip = V(P.thigh.x * sd, P.thigh.y + 0.02 * s, 0), knee = V(P.shin.x * sd, P.shin.y, 0.01 * s), ank = V(P.foot.x * sd, P.foot.y + 0.05 * s, -0.005 * s);
    const parts = [];
    // 灯笼裤
    parts.push([loft([hip, hip.clone().lerp(knee, 0.5), knee, knee.clone().lerp(ank, 0.5), ank.clone().add(V(0, 0.06 * s, 0))],
      [r[0], r[0] * 1.02, r[1], r[1] * 1.08, r[2] * 1.2].map((x) => x * s), { seg: 12, capStart: true }),
    { chain: legChain(P, sd), color, pat: 0.5, rough: 0.9, uvScale: [2, 2] }]);
    if (sock) {
      parts.push([loft([ank.clone().add(V(0, 0.13 * s, 0)), ank.clone().add(V(0, 0.0, 0))], [r[2] * 1.02 * s, r[2] * 0.95 * s], { seg: 12 }),
        { chain: legChain(P, sd), color: sock, rough: 0.9 }]);
    }
    if (beast) {
      // 兽足：三趾利爪
      const f = P.foot.clone().setX(P.foot.x * sd);
      parts.push([place(roundedBox(0.12 * s, 0.08 * s, 0.2 * s, 0.035 * s), [f.x, 0.05 * s, f.z + 0.05 * s]), { bone: 'foot_' + sd2S(sd), color: beast, rough: 0.7 }]);
      for (let k = -1; k <= 1; k++) {
        const c = claw(0.07 * s, 0.012 * s, 1.2);
        place(c, [f.x + k * 0.035 * s, 0.03 * s, f.z + 0.15 * s], [Math.PI / 2 + 0.3, 0, 0]);
        parts.push([c, { bone: 'foot_' + sd2S(sd), color: 0x1a1612, rough: 0.3 }]);
      }
    } else {
      const f = P.foot.clone().setX(P.foot.x * sd);
      if (shoe === 'boot') {
        parts.push([loft([ank.clone().add(V(0, 0.16 * s, 0)), ank.clone().add(V(0, 0.02 * s, 0))], [r[2] * 1.3 * s, r[2] * 1.2 * s], { seg: 12, capStart: true }),
          { chain: legChain(P, sd), color: boot, rough: 0.55, pat: 0.3 }]);
      }
      parts.push([place(roundedBox(0.092 * s, 0.075 * s, 0.25 * s, 0.03 * s), [f.x, 0.052 * s, f.z + 0.04 * s]), { bone: 'foot_' + sd2S(sd), color: boot, rough: 0.55 }]);
      parts.push([place(roundedBox(0.098 * s, 0.028 * s, 0.26 * s, 0.01 * s), [f.x, 0.014 * s, f.z + 0.04 * s]), { bone: 'foot_' + sd2S(sd), color: sole, rough: 0.8 }]);
    }
    return parts;
  });
}

function buildCollar(rb, P, color, h = 0.045) {
  const s = P.s;
  const g = lathe([[0.064, 1.475], [0.066, 1.5], [0.062, 1.475 + h + 0.005]].map(([r, y]) => [r * s, y * s]), 24, 1, 0.95);
  rb.add(g, { weights: (v) => { const t = sm(1.49 * s, 1.52 * s, v.y); return [['chest', 1 - t * 0.6], ['neck', t * 0.6]]; }, color, rough: 0.7, pat: 0.5 });
}

function buildNeck(rb, P, skin) {
  const s = P.s;
  rb.add(loft([V(0, 1.44 * s, -0.005 * s), V(0, 1.53 * s, 0), V(0, 1.6 * s, 0.01 * s)], [0.045 * s, 0.042 * s, 0.04 * s], { seg: 12 }),
    { weights: (v) => { const t = sm(1.5 * s, 1.58 * s, v.y); return [['neck', 1 - t], ['head', t]]; }, color: skin, rough: 0.65 });
}

// 大襟金线 + 盘扣
function buildLapel(rb, P, color = 0xd4a640, bodyZ = 0.12) {
  const s = P.s;
  const pts = [V(0.0, 1.49, 0.075), V(-0.06, 1.44, 0.118), V(-0.12, 1.38, 0.118), V(-0.14, 1.3, 0.112)].map((p) => p.multiplyScalar(s));
  pts.forEach((p) => { p.z = p.z * (bodyZ / 0.12); });
  rb.add(tube(pts, 0.006 * s, 0.006 * s, 12, 6), { bone: 'chest', color, metal: 0.7, rough: 0.35 });
  for (const p of [pts[1], pts[2], V(-0.14 * s, 1.2 * s, 0.112 * s * (bodyZ / 0.12))]) {
    rb.add(place(sphere(0.009 * s, 8, 6), [p.x, p.y, p.z + 0.004 * s]), { bone: 'chest', color, metal: 0.8, rough: 0.3 });
  }
}

// 胸前补子
function buildRankBadge(rb, P, region = REGION.crane, size = 0.2, bodyZ = 0.122) {
  const s = P.s;
  const g = new THREE.PlaneGeometry(size * s, size * s, 6, 6);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) / s; p.setZ(i, -x * x * 1.1 * s); }
  g.computeVertexNormals();
  place(g, [0, 1.3 * s, bodyZ * s + 0.004 * s]);
  rb.add(g, { bone: 'chest', decal: region, color: 0xffffff, rough: 0.55, metal: 0.15 });
}

function buildBelt(rb, P, { color = 0x1a1410, buckle = 0xc9a040, y = 1.0, r = 0.168, sz = 0.7, h = 0.05 } = {}) {
  const s = P.s;
  rb.add(lathe([[r * 1.02, (y - h / 2)], [r * 1.05, y], [r * 1.02, y + h / 2]].map(([a, b]) => [a * s, b * s]), 28, 1, sz),
    { weights: (v) => [['hips', 0.6], ['spine', 0.4]], color, rough: 0.6, pat: 0.3 });
  rb.add(place(roundedBox(0.07 * s, 0.055 * s, 0.02 * s, 0.008 * s), [0, y * s, r * sz * 1.06 * s]), { bone: 'hips', color: buckle, metal: 0.85, rough: 0.3 });
}

// 毛刺簇（毛僵、犼）
function furTufts(rb, bone, center, count, len, spreadR, color, seed = 1, dir = V(0, 1, 0), s = 1, flex = 0) {
  let q = seed;
  const R = () => { q = (q * 16807) % 2147483647; return (q % 10000) / 10000; };
  for (let i = 0; i < count; i++) {
    const a = R() * Math.PI * 2, rr = R() * spreadR;
    const off = V(Math.cos(a) * rr, (R() - 0.5) * spreadR * 0.6, Math.sin(a) * rr);
    const d = dir.clone().add(V((R() - 0.5) * 0.9, (R() - 0.5) * 0.5, (R() - 0.5) * 0.9)).normalize();
    const g = cone(0.012 * s * (0.6 + R()), len * (0.6 + R() * 0.8), 5);
    g.translate(0, len * 0.4, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d));
    g.translate(center.x + off.x, center.y + off.y, center.z + off.z);
    rb.add(g, { bone, color: shade(color, 0.8 + R() * 0.4), rough: 0.9, flex: flex ? hangFrom(center, len * 1.2, flex) : 0 });
  }
}

// =====================================================================
//  僵尸（八大尸变）
// =====================================================================
export const JIANGSHI_LOOKS = {
  normal: { robe: 0x1c2640, skin: 0xd6d3cb, collar: 0x2a66a8, cuff: 0x9ab4d8, hem: 0xc8d4e8, claws: 0.012, clawColor: 0x3a3430 },
  purple: { robe: 0x33203d, skin: 0x9b84b8, collar: 0x3a2a50, cuff: 0xc8a8d8, hem: 0xd8c0e0, claws: 0.022, clawColor: 0x2a1a30 },
  white: { robe: 0xcfcdc4, skin: 0xe6e6e2, collar: 0xa8a8a0, cuff: 0xe0e0e0, hem: 0xe8e8e0, claws: 0.03, clawColor: 0xd0d0c8, whiteHair: true, hat: 0x2a2a2a },
  green: { robe: 0x173d2a, skin: 0x6e9a72, collar: 0x14301f, cuff: 0x9ad0a0, hem: 0xa8d8b0, claws: 0.045, clawColor: 0x1a2a1a, spikyHair: 0x2a4a2a, brow: true },
  hairy: { robe: 0x2a2421, skin: 0x7c6d82, collar: 0x1a1614, cuff: 0x8a7a70, hem: 0x8a7a70, claws: 0.07, clawColor: 0xd8c890, fur: 0x5a4c58, tatter: 0.18, brow: true },
  flying: { robe: 0x1a2750, skin: 0x8aa2d4, collar: 0x243a78, cuff: 0xa8c8ff, hem: 0xb8d0ff, claws: 0.06, clawColor: 0x20304a, streamers: 0x8ec8ff, tatter: 0.3 },
  drought: { robe: 0x6a2c12, skin: 0x8a5c3c, collar: 0x3a1a0a, cuff: 0xe0a040, hem: 0xf0b050, claws: 0.05, clawColor: 0x2a1a0a, ornate: true, tatter: 0.22, badge: 'sun', eyeGlow: 0xff7a20, embers: 0xff6a18 },
};

export function buildJiangshi(type) {
  const L = JIANGSHI_LOOKS[type];
  const rb = new RigBuilder('jiangshi_' + type);
  const P = defineSkeleton(rb, 1);
  const look = { skin: L.skin, face: FACE.jiangshi, brow: L.brow, fangs: 0.014, eyeGlow: L.eyeGlow };
  buildHead(rb, P, look);
  buildNeck(rb, P, L.skin);
  buildQingHat(rb, P, { color: L.hat ?? 0x151518, brim: 0x1a1a1e, finial: L.ornate ? 0xe0b040 : 0x2a2a30, ornate: L.ornate, tassel: type === 'normal' || type === 'purple' });
  buildTalisman(rb, P);
  buildQueue(rb, P, L.whiteHair ? 0xdad8d0 : 0x121212);
  const torsoProf = buildTorso(rb, P, { color: L.robe, colorFn: null });
  buildCollar(rb, P, L.collar);
  buildLapel(rb, P, L.ornate ? 0xe0a040 : 0xc9a040);
  buildRankBadge(rb, P, L.badge === 'sun' ? REGION.sun : REGION.crane);
  const prof = buildSkirt(rb, P, { color: L.robe, hemY: 0.3, legFollow: 0.25 });
  buildHemBand(rb, P, prof, { from: 0.3, to: 0.56, color: L.hem, legFollow: 0.25, hemY: 0.3 });
  if (L.tatter) {
    const tg = tatters(0.3, 0.33, 34, 0.05, L.tatter, 0.035, 1.0, 0.74, 11, 0.25);
    rb.add(tg, { weights: (v) => [['hips', 1]], color: shade(L.robe, 0.75), pat: 0.7, rough: 0.9, flex: hang(0.36, L.tatter, 1.1) });
  }
  buildSleeves(rb, P, { color: L.robe, cuffColor: L.cuff, tatter: L.tatter ? L.tatter * 0.5 : 0 });
  buildHands(rb, P, { color: L.skin, clawLen: L.claws, clawColor: L.clawColor, curl: 0.55 });
  buildLegs(rb, P, { color: 0x121216, boot: 0x0e0e12 });

  if (L.whiteHair) {
    // 白发披散
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * (0.25 + (i / 13) * 1.5);
      const x = Math.sin(a) * 0.085, z = Math.cos(a) * 0.09 + 0.01;
      const len = 0.35 + (i % 3) * 0.08;
      const pts = [V(x, 1.72, z), V(x * 1.25, 1.62, z * 1.2), V(x * 1.6, 1.5, z * 1.35 - 0.02), V(x * 1.7, 1.72 - len, z * 1.5 - 0.02)];
      rb.add(tube(pts, (t) => 0.018 * (1 - t * 0.7), 0, 8, 5), {
        weights: (v) => { const t = sm(1.45, 1.6, v.y); return [['head', t], ['chest', 1 - t]]; }, color: 0xe4e2da, rough: 0.5, flex: hang(1.62, len, 0.8),
      });
    }
  }
  if (L.spikyHair) {
    furTufts(rb, 'head', V(0, 1.62, -0.07), 16, 0.08, 0.07, L.spikyHair, 5, V(0, -0.2, -1));
  }
  if (L.fur) {
    for (const sd of [1, -1]) {
      const { e, w } = armPts(P, sd);
      furTufts(rb, 'fore_' + sd2S(sd), w.clone().lerp(e, 0.2), 10, 0.07, 0.06, L.fur, 9 + sd, V(sd, -0.5, 0));
      furTufts(rb, 'chest', V(0.14 * sd, 1.46, 0), 8, 0.09, 0.07, L.fur, 21 + sd, V(sd * 0.6, 1, 0));
    }
    furTufts(rb, 'neck', V(0, 1.5, 0.02), 12, 0.08, 0.07, L.fur, 33, V(0, 0.2, 1));
  }
  if (L.streamers) {
    // 飞僵：幽蓝飘带（扭转布条）
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      const g = curvedPlane(0.05, 0.62 + (i % 3) * 0.1, -0.12, 2, 10, 0.25);
      place(g, [Math.sin(a) * 0.24, 0.62 - (i % 3) * 0.05, Math.cos(a) * 0.18], [0, a, 0]);
      rb.add(g, { weights: () => [['hips', 1]], color: L.streamers, emis: 0.6, rough: 0.4, flex: hang(0.95, 0.7, 1.4) });
    }
  }
  if (L.embers) {
    // 旱魃：胸口与袖口的火纹
    for (let i = 0; i < 14; i++) {
      const y = 0.4 + (i / 14) * 1.0;
      const a = i * 2.4;
      const r = y > 1.02 ? 0.19 : 0.2 + (1.02 - y) * 0.12;
      const g = place(sphere(0.012, 6, 4), [Math.sin(a) * r, y, Math.cos(a) * r * 0.72], [0, 0, 0], [1, 2.2, 1]);
      rb.add(g, { bone: y > 1.02 ? 'chest' : 'hips', color: L.embers, emis: 3.0 });
    }
  }
  return rb.build({ kind: 'jiangshi', typeId: type, headBone: 'head', heightScale: 1 });
}

// ---------------------------------------------------------------- 犼（尸王）
export function buildHou() {
  const rb = new RigBuilder('hou');
  const s = 1;
  const P = defineSkeleton(rb, s, { arm: V(0.2, 1.44, 0), fore: V(0.27, 1.16, 0.02), hand: V(0.31, 0.9, 0.03) });
  const skin = 0x8a7c84, robe = 0x19141a, fur = 0x5a5256;
  buildHead(rb, P, { skin, face: FACE.hou, brow: true, fangs: 0.03, eyeGlow: 0xff2a10, pointyEars: true });
  buildNeck(rb, P, skin);
  // 鬼角
  for (const sd of [1, -1]) {
    const g = horn(0.2, 0.024, 1.4);
    place(g, [sd * 0.05, 1.74, 0.02], [-0.3, 0, -sd * 0.55]);
    rb.add(g, { bone: 'head', color: 0x2a2220, rough: 0.35, metal: 0.1 });
    const g2 = horn(0.11, 0.015, 1.1);
    place(g2, [sd * 0.075, 1.66, -0.02], [-0.6, 0, -sd * 1.2]);
    rb.add(g2, { bone: 'head', color: 0x3a302a, rough: 0.35 });
  }
  // 鬃毛
  furTufts(rb, 'head', V(0, 1.7, -0.07), 26, 0.14, 0.08, 0x2a2224, 71, V(0, 0.3, -1));
  furTufts(rb, 'neck', V(0, 1.52, -0.05), 20, 0.16, 0.09, 0x2a2224, 72, V(0, 0.2, -1));
  buildTalisman(rb, P, { len: 0.15, width: 0.06 });
  buildTorso(rb, P, { color: robe, bulk: 1.12 });
  buildRankBadge(rb, P, REGION.crane, 0.2, 0.132);
  buildCollar(rb, P, 0x3a1010);
  const prof = buildSkirt(rb, P, { color: robe, hemY: 0.42, rTop: 0.18, rHem: 0.3, legFollow: 0.7 });
  const tg = tatters(0.3, 0.45, 40, 0.1, 0.34, 0.035, 1.0, 0.74, 3, 0.3);
  rb.add(tg, {
    weights: (v) => { const side = sm(-0.06, 0.06, v.x); return [['hips', 0.4], ['thigh_L', 0.6 * side], ['thigh_R', 0.6 * (1 - side)]]; },
    colorFn: (v, c) => c.set(v.y < 0.25 ? 0x6a0e0e : 0x241a1c), pat: 0.6, rough: 0.9, flex: hang(0.46, 0.34, 1.0),
  });
  buildHemBand(rb, P, prof, { from: 0.42, to: 0.6, color: 0x9a3030, legFollow: 0.7, hemY: 0.42 });
  // 肩甲 + 骨刺毛簇
  for (const sd of [1, -1]) {
    const g = lathe([[0.001, 0.09], [0.07, 0.07], [0.11, 0.02], [0.12, -0.04]], 16, 1, 0.9);
    place(g, [sd * 0.2, 1.46, 0], [0, 0, -sd * 0.5]);
    rb.add(g, { chain: armChain(P, sd, 0.06), color: 0x2e2622, metal: 0.6, rough: 0.4, pat: 0.3 });
    furTufts(rb, 'arm_' + sd2S(sd), V(sd * 0.22, 1.5, 0), 22, 0.18, 0.08, fur, 40 + sd, V(sd * 0.7, 1, 0));
    for (let k = 0; k < 5; k++) {
      const c = cone(0.018, 0.14, 6);
      place(c, [sd * (0.17 + k * 0.022), 1.55 + (k % 2) * 0.02, -0.05 + k * 0.025], [0.2 - k * 0.1, 0, -sd * (0.35 + k * 0.12)]);
      rb.add(c, { bone: 'arm_' + sd2S(sd), color: 0xd8ccb0, rough: 0.4 });
    }
  }
  buildSleeves(rb, P, { color: robe, rWrist: 0.12, cuffColor: 0xb04040, tatter: 0.12 });
  buildBareArms(rb, P, { color: skin, r: [0.05, 0.048, 0.044] });
  buildHands(rb, P, { color: skin, clawLen: 0.085, clawColor: 0x141010, curl: 0.7, size: 1.35, thick: 1.3 });
  buildBelt(rb, P, { color: 0x3a2a1a, buckle: 0xd4a040, y: 1.0, r: 0.185, h: 0.08 });
  // 腰前红流苏
  for (let i = -1; i <= 1; i++) {
    rb.add(tube([V(i * 0.05, 0.98, 0.14), V(i * 0.055, 0.8, 0.16), V(i * 0.06, 0.62, 0.16)], (t) => 0.012 * (1 - t * 0.3), 0, 8, 6), {
      weights: () => [['hips', 1]], color: 0x9a1212, rough: 0.8, flex: hang(0.98, 0.36, 0.9),
    });
  }
  buildLegs(rb, P, { color: 0x1a1618, beast: 0x6a5c64, r: [0.09, 0.075, 0.06] });
  furTufts(rb, 'shin_L', V(0.1, 0.25, 0), 10, 0.1, 0.06, fur, 91, V(0.4, -0.3, 0.3));
  furTufts(rb, 'shin_R', V(-0.1, 0.25, 0), 10, 0.1, 0.06, fur, 92, V(-0.4, -0.3, 0.3));
  return rb.build({ kind: 'hou', typeId: 'hou' });
}

// =====================================================================
//  小鬼（成群的矮小恶鬼）
// =====================================================================
export function buildImp() {
  const rb = new RigBuilder('imp');
  const s = 0.62;
  const P = defineSkeleton(rb, s, {
    headC: V(0, 1.64, 0.03), headR: V(0.13, 0.14, 0.13),
    arm: V(0.17, 1.4, 0), fore: V(0.24, 1.1, 0.02), hand: V(0.28, 0.82, 0.03),
  });
  const skin = 0x3f7466;
  buildHead(rb, P, { skin, face: FACE.imp, pointyEars: true, eyeGlow: 0xffc02a, fangs: 0.022 });
  buildNeck(rb, P, skin);
  // 小角
  for (const sd of [1, -1]) {
    const g = horn(0.12 * s, 0.022 * s, 1.2);
    place(g, [sd * 0.05 * s, P.headC.y + 0.1 * s, P.headC.z], [-0.2, 0, -sd * 0.4]);
    rb.add(g, { bone: 'head', color: 0xd8c8a0, rough: 0.4 });
  }
  // 精瘦躯干
  const tp = [[0.11, 0.92], [0.13, 1.05], [0.15, 1.22], [0.17, 1.36], [0.14, 1.44], [0.06, 1.5]].map(([r, y]) => [r * s, y * s]);
  rb.add(lathe(tp, 20, 1, 0.8), {
    weights: (v) => { const tS = sm(1.0 * s, 1.1 * s, v.y), tC = sm(1.18 * s, 1.26 * s, v.y); return [['hips', 1 - tS], ['spine', tS * (1 - tC)], ['chest', tS * tC]]; },
    color: skin, rough: 0.6,
  });
  // 肋骨
  for (let i = 0; i < 4; i++) {
    const g = torus(0.14 * s, 0.006 * s, 4, 16, Math.PI * 0.8);
    place(g, [0, (1.18 + i * 0.05) * s, 0.02 * s], [Math.PI / 2, 0, Math.PI * 0.1 + Math.PI / 2 - Math.PI * 0.4], [1, 0.8, 1]);
    rb.add(g, { bone: 'chest', color: shade(skin, 0.75), rough: 0.7 });
  }
  // 腰布
  rb.add(lathe([[0.14, 0.72], [0.13, 0.85], [0.125, 0.98]].map(([r, y]) => [r * s, y * s]), 20, 1, 0.85), {
    weights: (v) => { const d = sm(0.95 * s, 0.72 * s, v.y) * 0.8; const side = sm(-0.04, 0.04, v.x); return [['hips', 1 - d], ['thigh_L', d * side], ['thigh_R', d * (1 - side)]]; },
    color: 0x7a1a14, pat: 0.8, rough: 0.9,
  });
  rb.add(tatters(0.14 * s, 0.73 * s, 12, 0.03 * s, 0.1 * s, 0.03 * s, 1, 0.85, 17, 0.2), { weights: () => [['hips', 1]], color: 0x5a1210, rough: 0.9, flex: hang(0.74 * s, 0.1 * s, 0.8) });
  buildBareArms(rb, P, { color: skin, r: [0.04, 0.034, 0.03] });
  buildHands(rb, P, { color: skin, clawLen: 0.05, clawColor: 0x1a1a10, curl: 0.6, size: 1.2 });
  // 细腿
  rb.mirror((sd) => {
    const hip = V(P.thigh.x * sd, P.thigh.y, 0), knee = V(P.shin.x * sd, P.shin.y, 0.02 * s), ank = V(P.foot.x * sd, P.foot.y + 0.04 * s, 0);
    return [limb([hip, knee, ank], [0.05 * s, 0.04 * s, 0.032 * s], 10), { chain: legChain(P, sd), color: skin, rough: 0.6 }];
  });
  rb.mirror((sd) => {
    const f = P.foot.clone().setX(P.foot.x * sd);
    const list = [[place(roundedBox(0.08 * s, 0.05 * s, 0.2 * s, 0.022 * s), [f.x, 0.03 * s, f.z + 0.05 * s]), { bone: 'foot_' + sd2S(sd), color: skin, rough: 0.6 }]];
    for (let k = -1; k <= 1; k++) {
      const c = claw(0.04 * s, 0.01 * s, 1.1);
      place(c, [f.x + k * 0.025 * s, 0.02 * s, f.z + 0.15 * s], [Math.PI / 2 + 0.3, 0, 0]);
      list.push([c, { bone: 'foot_' + sd2S(sd), color: 0x1a1a10, rough: 0.3 }]);
    }
    return list;
  });
  // 尾巴
  rb.add(tube([V(0, 0.9 * s, -0.08 * s), V(0, 0.75 * s, -0.25 * s), V(0.05 * s, 0.6 * s, -0.35 * s), V(0.08 * s, 0.7 * s, -0.48 * s)], (t) => 0.025 * s * (1 - t * 0.8), 0, 12, 6), {
    weights: () => [['hips', 1]], color: skin, rough: 0.6, flex: (v) => Math.min(1, Math.max(0, -v.z / (0.5 * s) - 0.2)) * 1.6,
  });
  rb.add(place(cone(0.03 * s, 0.07 * s, 4), [0.08 * s, 0.73 * s, -0.5 * s], [-0.8, 0, 0]), { bone: 'hips', color: 0x7a1a14, rough: 0.6, flex: 1.4 });
  return rb.build({ kind: 'imp', typeId: 'imp' });
}

// =====================================================================
//  纸人（纸扎童男）
// =====================================================================
export function buildPaperMan() {
  const rb = new RigBuilder('paper');
  const P = defineSkeleton(rb, 0.95);
  const s = P.s;
  const skin = 0xf4efe2;
  const robe = 0xc81e2e, trim = 0x1f8a4a;
  buildHead(rb, P, { skin, face: FACE.paper, nose: false, ears: false });
  buildNeck(rb, P, skin);
  // 瓜皮小帽
  const c = P.headC;
  const hat = lathe([[0.09, 0], [0.092, 0.03], [0.07, 0.08], [0.0, 0.1]].map(([r, y]) => [r * s, y * s]), 8, 0.95, 1.05);
  place(hat, [0, c.y + P.headR.y * 0.35, c.z]);
  rb.add(faceted(hat), { bone: 'head', color: 0x1a1a1a, rough: 0.9 });
  rb.add(place(sphere(0.02 * s, 6, 4), [0, c.y + P.headR.y * 0.35 + 0.1 * s, c.z]), { bone: 'head', color: 0xd82020, rough: 0.5 });
  // 纸衣（折面低多边形）
  const tp = [[0.17, 0.62], [0.17, 1.0], [0.19, 1.3], [0.2, 1.4], [0.12, 1.48], [0.06, 1.5]].map(([r, y]) => [r * s, y * s]);
  const tg = lathe(tp, 8, 1, 0.7);
  rb.add(faceted(tg), {
    weights: (v) => { const d = sm(1.0 * s, 0.62 * s, v.y) * 0.4; const tC = sm(1.1 * s, 1.25 * s, v.y); const side = sm(-0.04, 0.04, v.x); return [['hips', (1 - d) * (1 - tC)], ['chest', tC], ['thigh_L', d * side * (1 - tC)], ['thigh_R', d * (1 - side) * (1 - tC)]]; },
    color: robe, rough: 0.95,
  });
  const band = lathe([[0.172, 0.62], [0.172, 0.7]].map(([r, y]) => [r * s, y * s]), 8, 1.01, 0.71);
  rb.add(faceted(band), { weights: () => [['hips', 1]], decal: REGION.paper, color: 0xffffff, rough: 0.9 });
  rb.add(place(roundedBox(0.2 * s, 0.14 * s, 0.01 * s, 0.003), [0, 1.28 * s, 0.14 * s]), { bone: 'chest', color: trim, rough: 0.9 });
  // 手臂（纸筒）
  rb.mirror((sd) => {
    const { a, e, w } = armPts(P, sd);
    return [faceted(loft([a, e, w.clone().add(V(0, -0.03 * s, 0))], [0.06 * s, 0.07 * s, 0.085 * s], { seg: 6, capStart: true })), { chain: armChain(P, sd), color: trim, rough: 0.95 }];
  });
  buildHands(rb, P, { color: skin, curl: 0.1 });
  rb.mirror((sd) => {
    const hip = V(P.thigh.x * sd, P.thigh.y - 0.2 * s, 0), ank = V(P.foot.x * sd, P.foot.y + 0.04 * s, 0);
    return [
      [faceted(loft([hip, P.shin.clone().setX(P.shin.x * sd), ank], [0.06 * s, 0.055 * s, 0.05 * s], { seg: 6, capStart: true })), { chain: legChain(P, sd), color: 0x1a1a1a, rough: 0.95 }],
      [faceted(place(roundedBox(0.09 * s, 0.06 * s, 0.2 * s, 0.01 * s), [P.foot.x * sd, 0.035 * s, 0.04 * s])), { bone: 'foot_' + sd2S(sd), color: 0x1a1a1a, rough: 0.9 }],
    ];
  });
  // 背后竹骨
  rb.add(place(cyl(0.008 * s, 0.008 * s, 1.1 * s, 5), [0, 1.0 * s, -0.12 * s]), { weights: () => [['spine', 1]], color: 0xa89060, rough: 0.8 });
  return rb.build({ kind: 'paper', typeId: 'paper' });
}

// =====================================================================
//  红衣厉鬼
// =====================================================================
export function buildGhost() {
  const rb = new RigBuilder('ghost');
  const P = defineSkeleton(rb, 1, { headR: V(0.072, 0.105, 0.088), arm: V(0.16, 1.43, 0) });
  const s = 1;
  const skin = 0xe8e6f0, robe = 0x8a0c14, hair = 0x08080a;
  buildHead(rb, P, { skin, face: FACE.ghost, nose: true, ears: false });
  buildNeck(rb, P, skin);
  buildTorso(rb, P, { color: robe, bulk: 0.86 });
  // 长裙拖地，下摆撕裂成缕
  const prof = buildSkirt(rb, P, { color: robe, hemY: 0.12, rTop: 0.14, rHem: 0.34, legFollow: 0.15, darkHem: 0.45 });
  rb.add(tatters(0.34, 0.14, 30, 0.1, 0.34, 0.04, 1, 0.74, 23, 0.35), {
    weights: () => [['hips', 1]], colorFn: (v, c) => c.set(robe).multiplyScalar(0.3 + Math.max(0, v.y + 0.2) * 1.2), pat: 0.5, rough: 0.9, flex: hang(0.16, 0.34, 1.6),
  });
  buildHemBand(rb, P, prof, { from: 0.9, to: 0.98, color: 0xe8c860, region: REGION.cuff, legFollow: 0.1, topY: 1.02, hemY: 0.12 });
  buildSleeves(rb, P, { color: robe, rWrist: 0.13, cuffColor: 0xe8c860, extraLen: 0.1, tatter: 0.2 });
  buildHands(rb, P, { color: skin, clawLen: 0.04, clawColor: 0x1a0a10, curl: 0.2 });
  // 长发：头后披散到腰，前额刘海遮面
  const c = P.headC;
  rb.add(place(sphere(1, 20, 14, 1, 1, 1), [c.x, c.y + 0.012, c.z - 0.008], [0, 0, 0], [P.headR.x * 1.1, P.headR.y * 1.08, P.headR.z * 1.08]), { bone: 'head', color: hair, rough: 0.35 });
  for (let i = 0; i < 22; i++) {
    const a = Math.PI * (0.35 + (i / 21) * 1.3);
    const x = Math.sin(a) * 0.08, z = Math.cos(a) * 0.09 + c.z;
    const len = 0.7 + ((i * 7) % 5) * 0.06;
    const pts = [V(x, c.y + 0.05, z), V(x * 1.35, c.y - 0.08, z * 1.2 - 0.03), V(x * 1.7, c.y - 0.3, z * 1.1 - 0.08), V(x * 1.8, c.y - len, z * 1.0 - 0.1)];
    rb.add(tube(pts, (t) => 0.028 * (1 - t * 0.6), 0, 10, 5), {
      weights: (v) => { const t = sm(1.42, 1.58, v.y); return [['head', t], ['chest', 1 - t]]; }, color: hair, rough: 0.35, flex: hang(c.y - 0.05, len, 1.1),
    });
  }
  for (let i = 0; i < 7; i++) {
    const x = (i / 6 - 0.5) * 0.11;
    const pts = [V(x * 0.8, c.y + 0.1, c.z + 0.05), V(x, c.y + 0.04, c.z + 0.1), V(x * 1.1, c.y - 0.08, c.z + 0.105)];
    rb.add(tube(pts, (t) => 0.011 * (1 - t * 0.6), 0, 8, 5), { bone: 'head', color: hair, rough: 0.35 });
  }
  // 发间白花
  rb.add(place(sphere(0.025, 8, 6), [0.07, c.y + 0.07, c.z + 0.02], [0, 0, 0], [1, 1, 0.5]), { bone: 'head', color: 0xf4f4f4, rough: 0.6 });
  return rb.build({ kind: 'ghost', typeId: 'ghost' });
}

// =====================================================================
//  黑白无常
// =====================================================================
function buildTallHat(rb, P, { color, region, scale = 1 }) {
  const c = P.headC, s = P.s * scale;
  const y0 = c.y + P.headR.y * 0.35;
  const hat = lathe([[0.1, 0], [0.105, 0.02], [0.085, 0.2], [0.065, 0.4], [0.05, 0.46], [0.0, 0.47]].map(([r, y]) => [r * s, y * s]), 20, 0.95, 1.05);
  place(hat, [c.x, y0, c.z]);
  rb.add(hat, { bone: 'head', color, rough: 0.9, pat: 0.6 });
  const plate = curvedPlane(0.07 * s, 0.34 * s, 0, 2, 6);
  // 贴合帽体前倾面
  place(plate, [c.x, y0 + 0.2 * s, c.z + 0.078 * s * 1.05], [-0.1, 0, 0]);
  rb.add(plate, { bone: 'head', decal: region, color: 0xffffff, rough: 0.9 });
}

export function buildWuchang(black = false) {
  const rb = new RigBuilder(black ? 'wuBlack' : 'wuWhite');
  const s = 1.2;
  const P = defineSkeleton(rb, s, { headR: V(0.08, 0.115, 0.095) });
  const skin = black ? 0x3a3840 : 0xf4f2f0;
  const robe = black ? 0x121216 : 0xe8e6e0;
  const trim = black ? 0x303038 : 0xc8c8c0;
  buildHead(rb, P, { skin, face: black ? FACE.wuBlack : FACE.wuWhite, brow: black });
  buildNeck(rb, P, skin);
  buildTallHat(rb, P, { color: black ? 0x151518 : 0xf2f0ea, region: black ? REGION.hatBlack : REGION.hatWhite });
  buildTorso(rb, P, { color: robe, bulk: 0.95 });
  buildCollar(rb, P, trim);
  const prof = buildSkirt(rb, P, { color: robe, hemY: 0.1, rHem: 0.32, legFollow: 0.5, darkHem: black ? 0.9 : 0.7 });
  buildHemBand(rb, P, prof, { from: 0.1, to: 0.2, color: black ? 0x6a6a78 : 0x9a9a90, region: REGION.cuff, legFollow: 0.5, hemY: 0.1 });
  buildBelt(rb, P, { color: black ? 0x2a2a30 : 0x6a6a70, buckle: 0x9a9aa0, y: 1.0, r: 0.165, sz: 0.68 });
  // 麻绳腰带垂坠
  rb.add(tube([V(0.06, 0.98 * s, 0.13 * s), V(0.07, 0.8 * s, 0.15 * s), V(0.065, 0.62 * s, 0.15 * s)], 0.01 * s, 0.008 * s, 8, 6), { weights: () => [['hips', 1]], color: 0xc8b890, rough: 0.9, flex: hang(0.98 * s, 0.36 * s, 1) });
  buildSleeves(rb, P, { color: robe, rWrist: 0.15, cuffColor: black ? 0x5a5a66 : 0xd8d8d0, extraLen: 0.05 });
  buildHands(rb, P, { color: skin, clawLen: 0.02, curl: 0.55 });
  buildLegs(rb, P, { color: robe, boot: 0x0e0e10, shoe: 'shoe', sole: 0xd8d4c8 });
  if (!black) {
    // 长舌
    const c = P.headC;
    rb.add(tube([V(0, c.y - 0.07 * s, c.z + 0.085 * s), V(0, c.y - 0.12 * s, c.z + 0.12 * s), V(0, c.y - 0.25 * s, c.z + 0.13 * s), V(0, 1.28 * s, 0.14 * s)], (t) => 0.024 * s * (1 - t * 0.35), 0, 14, 8), {
      weights: (v) => { const t = sm(1.48 * s, 1.58 * s, v.y); return [['head', t], ['chest', 1 - t]]; }, color: 0xc81830, rough: 0.35, flex: hang(1.5 * s, 0.25 * s, 0.35),
    });
    // 哭丧棒（纸条缠绕）
    const hp = V(-P.hand.x, P.hand.y, 0.0);
    rb.add(place(cyl(0.016 * s, 0.018 * s, 1.3 * s, 8), [hp.x, hp.y - 0.05 * s, hp.z + 0.02]), { bone: 'hand_R', color: 0x6a5a40, rough: 0.8 });
    for (let i = 0; i < 12; i++) {
      const y = hp.y + 0.55 * s - i * 0.03 * s;
      const g = curvedPlane(0.05 * s, 0.22 * s, 0.02, 2, 4, 0.1);
      place(g, [hp.x + Math.sin(i * 1.9) * 0.03, y - 0.12 * s, hp.z + 0.02 + Math.cos(i * 1.9) * 0.03], [0, i * 1.9, 0]);
      rb.add(g, { bone: 'hand_R', color: 0xf8f8f4, rough: 0.9, flex: hang(y - 0.01 * s, 0.22 * s, 1.2) });
    }
  } else {
    // 锁链 + 令牌
    const hp = V(-P.hand.x, P.hand.y, 0);
    for (let i = 0; i < 14; i++) {
      const g = torus(0.022 * s, 0.006 * s, 5, 10);
      place(g, [hp.x - 0.01, hp.y - 0.06 * s - i * 0.035 * s, hp.z + 0.03 + Math.sin(i * 0.5) * 0.02], [0, (i % 2) * Math.PI / 2, 0]);
      rb.add(g, { bone: 'hand_R', color: 0x6a6a74, metal: 0.9, rough: 0.35 });
    }
    const lp = V(P.hand.x, P.hand.y, 0);
    const g = new THREE.PlaneGeometry(0.1 * s, 0.16 * s);
    place(g, [lp.x, lp.y - 0.12 * s, lp.z + 0.05], [0, -0.3, 0]);
    rb.add(g, { bone: 'hand_L', decal: REGION.plaque, color: 0xffffff, rough: 0.5, metal: 0.3 });
    rb.add(place(roundedBox(0.012 * s, 0.17 * s, 0.11 * s, 0.004), [lp.x - 0.004, lp.y - 0.12 * s, lp.z + 0.046], [0, -0.3 + Math.PI / 2, 0]), { bone: 'hand_L', color: 0x2a1408, rough: 0.6 });
  }
  return rb.build({ kind: black ? 'wuBlack' : 'wuWhite', typeId: black ? 'wuBlack' : 'wuWhite' });
}

// =====================================================================
//  道长（玩家化身）
// =====================================================================
export function buildPriest() {
  const rb = new RigBuilder('priest');
  const P = defineSkeleton(rb, 1, { headR: V(0.076, 0.108, 0.092) });
  const skin = 0xe0b896, robe = 0xd89a2a, trim = 0x1a1612;
  buildHead(rb, P, { skin, face: FACE.priest });
  buildNeck(rb, P, skin);
  // 道冠：黑色方巾帽 + 八卦
  const c = P.headC;
  const y0 = c.y + P.headR.y * 0.38;
  const cap = lathe([[0.088, 0], [0.09, 0.03], [0.084, 0.07], [0.05, 0.1], [0.0, 0.105]], 24, 0.95, 1.08);
  place(cap, [c.x, y0, c.z - 0.005]);
  rb.add(cap, { bone: 'head', color: 0x121214, rough: 0.8, pat: 0.5 });
  rb.add(place(roundedBox(0.03, 0.05, 0.16, 0.01), [0, y0 + 0.1, c.z - 0.005]), { bone: 'head', color: 0x121214, rough: 0.8 });
  const bg = new THREE.CircleGeometry(0.035, 20);
  place(bg, [0, y0 + 0.045, c.z + 0.09]);
  rb.add(bg, { bone: 'head', decal: REGION.bagua, color: 0xffffff, rough: 0.5, metal: 0.3 });
  // 鬓发
  for (const sd of [1, -1]) rb.add(place(sphere(1, 10, 8), [sd * 0.07, c.y + 0.02, c.z - 0.02], [0, 0, 0], [0.018, 0.05, 0.05]), { bone: 'head', color: 0x141010, rough: 0.5 });
  rb.add(place(sphere(1, 14, 10), [0, c.y + 0.0, c.z - 0.06], [0, 0, 0], [0.074, 0.08, 0.05]), { bone: 'head', color: 0x141010, rough: 0.5 });

  buildTorso(rb, P, { color: robe, pat: 0.7, rough: 0.8 });
  // 交领（右衽黑边）
  rb.add(tube([V(0.06, 1.49, 0.03), V(0.02, 1.42, 0.12), V(-0.06, 1.3, 0.125), V(-0.12, 1.18, 0.112)], 0.012, 0.012, 16, 6), { bone: 'chest', color: trim, rough: 0.8 });
  rb.add(tube([V(-0.06, 1.49, 0.03), V(-0.02, 1.43, 0.11), V(0.02, 1.38, 0.122)], 0.012, 0.012, 10, 6), { bone: 'chest', color: 0xeae4d8, rough: 0.8 });
  const prof = buildSkirt(rb, P, { color: robe, hemY: 0.36, rTop: 0.165, rHem: 0.29, legFollow: 0.9, pat: 0.7, darkHem: 0.8 });
  // 下摆黑边
  const hb = lathe([[profileR(prof, 0.36) * 1.01, 0.36], [profileR(prof, 0.42) * 1.01, 0.42]], 32, 1, 0.74);
  rb.add(hb, {
    weights: (v) => { const d = sm(0.97, 0.36, v.y) * 0.9; const side = sm(-0.06, 0.06, v.x); return [['hips', 1 - d], ['thigh_L', d * side], ['thigh_R', d * (1 - side)]]; },
    color: trim, rough: 0.8, flex: hemFlex(0.36, 1),
  });
  buildSleeves(rb, P, { color: robe, rWrist: 0.13, cuff: true, cuffColor: 0x222222, cuffRegion: REGION.gold });
  buildHands(rb, P, { color: skin, curl: 0.5 });
  buildBelt(rb, P, { color: 0x121212, buckle: 0x7a1a14, y: 1.0, r: 0.165, h: 0.06 });
  // 腰间垂带
  for (const x of [0.03, -0.03]) rb.add(tube([V(x, 0.98, 0.12), V(x * 1.4, 0.8, 0.14), V(x * 1.6, 0.6, 0.14)], 0.014, 0.012, 8, 6), { weights: () => [['hips', 1]], color: 0x121212, rough: 0.8, flex: hang(0.97, 0.38, 1) });
  // 符纸挂袋 + 铜铃
  rb.add(place(roundedBox(0.08, 0.1, 0.04, 0.012), [0.15, 0.93, 0.07], [0, 0.5, 0]), { bone: 'hips', color: 0x5a3a1a, rough: 0.8 });
  for (let i = 0; i < 3; i++) {
    const g = curvedPlane(0.035, 0.09, 0.01, 2, 4);
    place(g, [0.16 + i * 0.012, 0.9, 0.1 + i * 0.004], [0, 0.4, 0.1 - i * 0.1]);
    rb.add(g, { bone: 'hips', decal: REGION.talisman, color: 0xffffff, rough: 0.9, flex: hang(0.945, 0.09, 0.7) });
  }
  rb.add(place(lathe([[0.001, 0.0], [0.02, -0.005], [0.028, -0.04], [0.03, -0.05]], 12), [-0.15, 0.95, 0.06]), { bone: 'hips', color: 0xc8a040, metal: 0.9, rough: 0.3 });
  // 背后桃木剑
  const swordAxis = V(0.55, -1, 0).normalize();
  const hilt = V(-0.18, 1.62, -0.14);
  const tip = hilt.clone().addScaledVector(swordAxis, 0.9);
  rb.add(loft([hilt, hilt.clone().lerp(tip, 0.18)], [0.016, 0.016], { seg: 8, capStart: true, capEnd: true }), { bone: 'chest', color: 0x3a1a0a, rough: 0.7 });
  const bladeStart = hilt.clone().lerp(tip, 0.2);
  const blade = roundedBox(0.012, 0.72, 0.05, 0.005, 2);
  blade.translate(0, -0.36, 0);
  blade.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), hilt.clone().sub(tip).normalize().negate()));
  blade.translate(bladeStart.x, bladeStart.y, bladeStart.z);
  rb.add(blade, { bone: 'chest', color: 0xb0643a, rough: 0.6, pat: 0.4 });
  rb.add(place(roundedBox(0.03, 0.02, 0.12, 0.006), [bladeStart.x, bladeStart.y, bladeStart.z], [0, 0, Math.atan2(swordAxis.x, -swordAxis.y) * -1]), { bone: 'chest', color: 0xc8a040, metal: 0.8, rough: 0.3 });
  rb.add(tube([hilt, hilt.clone().add(V(0.02, -0.06, 0.01)), hilt.clone().add(V(0.05, -0.16, 0.02))], 0.012, 0.004, 8, 5), { bone: 'chest', color: 0xb01818, rough: 0.8 });
  // 背带
  rb.add(tube([V(0.12, 1.45, 0.1), V(0.0, 1.3, 0.128), V(-0.13, 1.08, 0.105)], 0.01, 0.01, 12, 5), { bone: 'chest', color: 0x3a2a1a, rough: 0.8 });
  buildLegs(rb, P, { color: 0x1a1c24, boot: 0x0e0e0e, shoe: 'shoe', sock: 0xeae6dc, sole: 0xe8e4d8 });
  return rb.build({ kind: 'priest', typeId: 'priest' });
}


// =====================================================================
//  v1.2 新角色：阴兵 / 玄阴子（人形 · 尸化）/ 玄清子（师父）
// =====================================================================

// 阴兵：鬼面钵胄、鱼鳞札甲、虎头盾、长枪
export function buildSoldier() {
  const rb = new RigBuilder('soldier');
  const P = defineSkeleton(rb, 1.03, { headR: V(0.075, 0.105, 0.09) });
  const s = P.s;
  const skin = 0x7a8a9a, cloth = 0x1a1f2c, steel = 0x3a3e48, brass = 0xa88a40;
  buildHead(rb, P, { skin, face: FACE.soldier, brow: true, ears: false });
  buildNeck(rb, P, skin);
  const c = P.headC;
  const y0 = c.y + P.headR.y * 0.12;
  const helm = lathe([[0.104, -0.02], [0.108, 0.04], [0.098, 0.1], [0.072, 0.15], [0.032, 0.176], [0.006, 0.18]].map(([r, y]) => [r * s, y * s]), 28, 0.95, 1.05);
  place(helm, [c.x, y0, c.z - 0.005]);
  rb.add(helm, { bone: 'head', color: steel, metal: 0.75, rough: 0.38 });
  rb.add(place(torus(0.106 * s, 0.009 * s, 6, 30), [c.x, y0 - 0.012 * s, c.z - 0.005], [Math.PI / 2, 0, 0], [0.95, 1.05, 1]), { bone: 'head', color: brass, metal: 0.85, rough: 0.3 });
  rb.add(place(cone(0.013 * s, 0.1 * s, 8), [c.x, y0 + 0.23 * s, c.z - 0.005]), { bone: 'head', color: brass, metal: 0.85, rough: 0.3 });
  furTufts(rb, 'head', V(c.x, y0 + 0.19 * s, c.z - 0.005), 16, 0.1 * s, 0.015 * s, 0xa01212, 51, V(0, -1, -0.2), s, 0.9);
  for (const a of [-1.25, -0.6, 0, 0.6, 1.25]) {
    const g = curvedPlane(0.075 * s, 0.11 * s, 0.025, 3, 4);
    place(g, [c.x - Math.sin(a) * 0.104 * s, y0 - 0.07 * s, c.z - Math.cos(a) * 0.104 * s], [0.18, a + Math.PI, 0]);
    rb.add(g, { bone: 'head', decal: REGION.armor, color: 0xffffff, metal: 0.6, rough: 0.45 });
  }
  buildTorso(rb, P, { color: cloth, bulk: 1.06 });
  buildTorsoShell(rb, P, { y0: 0.98, y1: 1.43, bulk: 1.06, grow: 1.045, region: REGION.armor, rough: 0.42, metal: 0.65 });
  buildCollar(rb, P, 0x6a1010, 0.05);
  // 护肩
  for (const sd of [1, -1]) {
    const g = lathe([[0.001, 0.1], [0.075, 0.08], [0.12, 0.02], [0.13, -0.05]], 18, 1, 0.92);
    place(g, [sd * 0.2 * s, 1.44 * s, 0], [0, 0, -sd * 0.45]);
    rb.add(g, { chain: armChain(P, sd, 0.06), decal: REGION.armor, color: 0xffffff, metal: 0.6, rough: 0.42 });
  }
  const prof = buildSkirt(rb, P, { color: cloth, hemY: 0.42, rTop: 0.17, rHem: 0.29, legFollow: 0.75, darkHem: 0.6 });
  buildHemBand(rb, P, prof, { from: 0.5, to: 0.98, region: REGION.armor, color: 0xffffff, rough: 0.45, metal: 0.6, legFollow: 0.75, hemY: 0.42 });
  buildBelt(rb, P, { color: 0x3a1a10, buckle: brass, y: 1.0, r: 0.176, h: 0.07 });
  buildSleeves(rb, P, { color: cloth, rWrist: 0.065, rShoulder: 0.06, cuff: false });
  rb.mirror((sd) => {
    const { e, w } = armPts(P, sd);
    return [loft([e.clone().lerp(w, 0.15), e.clone().lerp(w, 0.95)], [0.052 * s, 0.047 * s], { seg: 14, capStart: true, capEnd: true }), { chain: armChain(P, sd), color: steel, metal: 0.7, rough: 0.4 }];
  });
  buildHands(rb, P, { color: skin, clawLen: 0.012, curl: 0.75 });
  buildLegs(rb, P, { color: cloth, boot: 0x141418 });
  // 虎头盾（左前臂）
  const sh = new THREE.CylinderGeometry(0.34 * s, 0.34 * s, 0.05 * s, 36, 1);
  sh.rotateX(Math.PI / 2);
  const shieldC = V(0.2 * s, 1.08 * s, 0.2 * s);
  place(sh, [shieldC.x, shieldC.y, shieldC.z]);
  rb.add(sh, { bone: 'fore_L', color: 0x3a1a10, rough: 0.6, metal: 0.2 });
  const face = new THREE.CircleGeometry(0.33 * s, 36);
  place(face, [shieldC.x, shieldC.y, shieldC.z + 0.027 * s]);
  rb.add(face, { bone: 'fore_L', decal: REGION.tiger, color: 0xffffff, rough: 0.55, metal: 0.3 });
  rb.add(place(torus(0.34 * s, 0.014 * s, 6, 40), [shieldC.x, shieldC.y, shieldC.z]), { bone: 'fore_L', color: brass, metal: 0.85, rough: 0.3 });
  // 长枪（右手，枪尖朝前）
  const hp = V(-P.hand.x, P.hand.y - 0.04 * s, 0.02);
  rb.add(place(cyl(0.017 * s, 0.017 * s, 2.3 * s, 8), [hp.x, hp.y, hp.z + 0.25 * s], [Math.PI / 2, 0, 0]), { bone: 'hand_R', color: 0x3a2414, rough: 0.7 });
  const tipZ = hp.z + 1.4 * s;
  const blade = new THREE.ConeGeometry(0.035 * s, 0.34 * s, 4);
  blade.rotateX(Math.PI / 2); blade.scale(1, 0.35, 1);
  place(blade, [hp.x, hp.y, tipZ + 0.17 * s]);
  rb.add(blade, { bone: 'hand_R', color: 0xc0c4cc, metal: 0.95, rough: 0.2, emis: 0.15 });
  rb.add(place(cyl(0.028 * s, 0.02 * s, 0.06 * s, 10), [hp.x, hp.y, tipZ - 0.01 * s], [Math.PI / 2, 0, 0]), { bone: 'hand_R', color: brass, metal: 0.85, rough: 0.3 });
  furTufts(rb, 'hand_R', V(hp.x, hp.y - 0.02 * s, tipZ - 0.04 * s), 14, 0.11 * s, 0.02 * s, 0xb01414, 61, V(0, -1, -0.3), s, 1);
  return rb.build({ kind: 'soldier', typeId: 'soldier' });
}

// 玄阴子（人形）：白发高髻、黑玉道冠、玄色道袍紫里、七星黑剑、拂尘、腰悬黑符
export function buildSorcerer() {
  const rb = new RigBuilder('sorcerer');
  const P = defineSkeleton(rb, 1.05, { headR: V(0.074, 0.106, 0.09) });
  const s = P.s;
  const skin = 0xd4d0cc, robe = 0x0d0b12, inner = 0x4a0c3a, hair = 0xe6e4de;
  buildHead(rb, P, { skin, face: FACE.sorcerer, eyeGlow: 0xb050ff, brow: true });
  buildNeck(rb, P, skin);
  const c = P.headC, R = P.headR;
  rb.add(place(sphere(1, 22, 16), [c.x, c.y + 0.016 * s, c.z - 0.012 * s], [0, 0, 0], [R.x * 1.08, R.y * 1.04, R.z * 1.06]), { bone: 'head', color: hair, rough: 0.45 });
  rb.add(place(sphere(1, 16, 12), [c.x, c.y + R.y * 0.98, c.z - 0.02 * s], [0, 0, 0], [0.045 * s, 0.05 * s, 0.045 * s]), { bone: 'head', color: hair, rough: 0.45 });
  const crown = lathe([[0.04, 0], [0.046, 0.02], [0.036, 0.05], [0.014, 0.07], [0.0, 0.072]].map(([r, y]) => [r * s, y * s]), 16, 1.2, 0.8);
  place(crown, [c.x, c.y + R.y * 1.18, c.z - 0.02 * s]);
  rb.add(crown, { bone: 'head', color: 0x101014, rough: 0.2, metal: 0.4 });
  rb.add(place(sphere(0.012 * s, 10, 8), [c.x, c.y + R.y * 1.32, c.z + 0.012 * s]), { bone: 'head', color: 0xa040ff, emis: 2.4, rough: 0.2 });
  rb.add(place(cyl(0.004 * s, 0.004 * s, 0.2 * s, 6), [c.x, c.y + R.y * 1.1, c.z - 0.02 * s], [0, 0, Math.PI / 2]), { bone: 'head', color: 0xc8a040, metal: 0.9, rough: 0.3 });
  // 白发垂背
  for (let i = 0; i < 18; i++) {
    const a = Math.PI * (0.55 + (i / 17) * 0.9);
    const x = Math.sin(a) * 0.075 * s, z = Math.cos(a) * 0.08 * s + c.z;
    const len = (0.5 + ((i * 5) % 4) * 0.05) * s;
    const pts = [V(x, c.y + 0.04 * s, z), V(x * 1.3, c.y - 0.1 * s, z - 0.03 * s), V(x * 1.5, c.y - 0.3 * s, z - 0.07 * s), V(x * 1.5, c.y - len, z - 0.08 * s)];
    rb.add(tube(pts, (t) => 0.02 * s * (1 - t * 0.6), 0, 10, 5), {
      weights: (v) => { const t = sm(1.42 * s, 1.58 * s, v.y); return [['head', t], ['chest', 1 - t]]; }, color: hair, rough: 0.45, flex: hang(c.y - 0.05 * s, len, 1.0),
    });
  }
  // 长须
  for (let i = 0; i < 9; i++) {
    const x = (i / 8 - 0.5) * 0.05 * s;
    const z = c.z + R.z * 0.7;
    const pts = [V(x, c.y - R.y * 0.62, z), V(x * 1.2, c.y - R.y * 0.95, z + 0.02 * s), V(x * 0.8, c.y - 0.2 * s, z + 0.03 * s), V(x * 0.5, c.y - 0.3 * s, z + 0.02 * s)];
    rb.add(tube(pts, (t) => 0.007 * s * (1 - t * 0.7), 0, 8, 4), {
      weights: (v) => { const t = sm(1.48 * s, 1.58 * s, v.y); return [['head', t], ['chest', 1 - t]]; }, color: hair, rough: 0.5, flex: hang(c.y - R.y * 0.7, 0.2 * s, 0.6),
    });
  }
  buildTorso(rb, P, { color: robe, pat: 0.9, rough: 0.7 });
  rb.add(tube([V(0.06, 1.49, 0.03).multiplyScalar(s), V(0.02, 1.42, 0.12).multiplyScalar(s), V(-0.06, 1.3, 0.125).multiplyScalar(s), V(-0.12, 1.16, 0.11).multiplyScalar(s)], 0.016 * s, 0.016 * s, 16, 6), { bone: 'chest', color: inner, rough: 0.6 });
  rb.add(tube([V(0.07, 1.49, 0.03).multiplyScalar(s), V(0.03, 1.42, 0.125).multiplyScalar(s), V(-0.05, 1.3, 0.13).multiplyScalar(s), V(-0.11, 1.16, 0.115).multiplyScalar(s)], 0.006 * s, 0.006 * s, 16, 4), { bone: 'chest', color: 0xc8a040, metal: 0.85, rough: 0.3 });
  buildRankBadge(rb, P, REGION.taiji, 0.17, 0.124);
  const prof = buildSkirt(rb, P, { color: robe, hemY: 0.05, rTop: 0.165, rHem: 0.36, legFollow: 0.55, darkHem: 0.8, pat: 0.9 });
  buildHemBand(rb, P, prof, { from: 0.05, to: 0.16, region: REGION.robeTrim, color: 0xffffff, rough: 0.55, metal: 0.3, legFollow: 0.55, hemY: 0.05 });
  rb.add(tatters(0.36, 0.08, 36, 0.04, 0.14, 0.035, 1, 0.74, 41, 0.3), { weights: () => [['hips', 1]], color: 0x1a0a20, rough: 0.9, flex: hang(0.09, 0.14, 1.4), emis: 0.15 });
  buildSleeves(rb, P, { color: robe, rWrist: 0.17, extraLen: 0.09, cuffColor: 0xffffff, cuffRegion: REGION.robeTrim, tatter: 0.1 });
  buildHands(rb, P, { color: skin, clawLen: 0.028, clawColor: 0x201020, curl: 0.4 });
  buildBelt(rb, P, { color: inner, buckle: 0xa040ff, y: 1.0, r: 0.168, h: 0.06 });
  for (let i = 0; i < 4; i++) {
    const g = curvedPlane(0.04 * s, 0.13 * s, 0.01, 2, 5);
    const a = -0.9 + i * 0.6;
    place(g, [Math.sin(a) * 0.18 * s, 0.91 * s, Math.cos(a) * 0.13 * s], [0, a, 0.05 - i * 0.03]);
    rb.add(g, { bone: 'hips', decal: REGION.talismanBlack, color: 0xffffff, rough: 0.8, emis: 0.4, flex: hang(0.975 * s, 0.13 * s, 1.1) });
  }
  buildLegs(rb, P, { color: robe, boot: 0x0c0c0e, shoe: 'shoe', sole: 0x2a1a30 });
  // 七星黑剑（右手，剑尖朝下 → 抬臂后朝前）
  const hp = V(-P.hand.x, P.hand.y - 0.05 * s, 0.01);
  const bl = roundedBox(0.012 * s, 0.82 * s, 0.05 * s, 0.004 * s, 2);
  place(bl, [hp.x, hp.y - 0.47 * s, hp.z]);
  rb.add(bl, { bone: 'hand_R', color: 0x14141a, metal: 0.9, rough: 0.25 });
  for (const sx of [1, -1]) {
    const pl = new THREE.PlaneGeometry(0.03 * s, 0.7 * s);
    place(pl, [hp.x + sx * 0.0068 * s, hp.y - 0.47 * s, hp.z], [0, sx * Math.PI / 2, 0]);
    rb.add(pl, { bone: 'hand_R', decal: REGION.sevenStar, color: 0xffffff, emis: 1.6, rough: 0.3 });
  }
  rb.add(place(roundedBox(0.03 * s, 0.025 * s, 0.13 * s, 0.006 * s), [hp.x, hp.y - 0.05 * s, hp.z]), { bone: 'hand_R', color: 0x6a40a0, metal: 0.8, rough: 0.3 });
  rb.add(place(cyl(0.014 * s, 0.015 * s, 0.13 * s, 8), [hp.x, hp.y + 0.03 * s, hp.z]), { bone: 'hand_R', color: 0x200c18, rough: 0.7 });
  // 拂尘（左手）
  const lp = V(P.hand.x, P.hand.y - 0.03 * s, 0.02);
  rb.add(place(cyl(0.012 * s, 0.012 * s, 0.32 * s, 8), [lp.x, lp.y + 0.1 * s, lp.z]), { bone: 'hand_L', color: 0x3a2412, rough: 0.6 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const top = V(lp.x + Math.cos(a) * 0.012 * s, lp.y - 0.06 * s, lp.z + Math.sin(a) * 0.012 * s);
    const pts = [top, top.clone().add(V(Math.cos(a) * 0.02 * s, -0.15 * s, Math.sin(a) * 0.02 * s)), top.clone().add(V(Math.cos(a) * 0.03 * s, -0.4 * s, Math.sin(a) * 0.03 * s))];
    rb.add(tube(pts, (t) => 0.006 * s * (1 - t * 0.5), 0, 6, 4), { bone: 'hand_L', color: 0xf4f2ee, rough: 0.6, flex: hangFrom(top, 0.4 * s, 1.2) });
  }
  return rb.build({ kind: 'sorcerer', typeId: 'sorcerer' });
}

// 玄阴子（尸化）：犼血入体，佝偻巨躯、鬼角、灼裂皮肤、利爪兽足
export function buildSorcererBeast() {
  const rb = new RigBuilder('sorcererBeast');
  const P = defineSkeleton(rb, 1.24, { arm: V(0.21, 1.44, 0), fore: V(0.28, 1.15, 0.03), hand: V(0.32, 0.88, 0.05) });
  const s = P.s;
  const skin = 0x55645a, robe = 0x0e0a12, hair = 0xdad8d0;
  buildHead(rb, P, { skin, face: FACE.beast, brow: true, fangs: 0.034, eyeGlow: 0xff3010, pointyEars: true });
  buildNeck(rb, P, skin);
  const c = P.headC;
  for (const sd of [1, -1]) {
    const g = horn(0.26 * s, 0.03 * s, 1.5);
    place(g, [sd * 0.05 * s, c.y + 0.08 * s, c.z + 0.01 * s], [-0.35, 0, -sd * 0.5]);
    rb.add(g, { bone: 'head', color: 0x1a1018, rough: 0.3, metal: 0.2 });
    const g2 = horn(0.14 * s, 0.018 * s, 1.1);
    place(g2, [sd * 0.08 * s, c.y + 0.01 * s, c.z - 0.02 * s], [-0.7, 0, -sd * 1.25]);
    rb.add(g2, { bone: 'head', color: 0x2a1820, rough: 0.3 });
  }
  for (let i = 0; i < 20; i++) {
    const a = Math.PI * (0.3 + (i / 19) * 1.4);
    const x = Math.sin(a) * 0.08 * s, z = Math.cos(a) * 0.085 * s + c.z;
    const len = (0.45 + ((i * 7) % 5) * 0.06) * s;
    const pts = [V(x, c.y + 0.06 * s, z), V(x * 1.6, c.y - 0.05 * s, z - 0.05 * s), V(x * 2.2, c.y - 0.25 * s, z - 0.1 * s), V(x * 2.4, c.y - len, z - 0.12 * s)];
    rb.add(tube(pts, (t) => 0.022 * s * (1 - t * 0.6), 0, 10, 5), {
      weights: (v) => { const t = sm(1.42 * s, 1.6 * s, v.y); return [['head', t], ['chest', 1 - t]]; }, color: hair, rough: 0.5, flex: hang(c.y - 0.04 * s, len, 1.3),
    });
  }
  buildTorso(rb, P, { color: skin, bulk: 1.18, pat: 0.2, rough: 0.6 });
  buildTorsoShell(rb, P, { y0: 0.95, y1: 1.46, bulk: 1.18, grow: 1.012, region: REGION.cracks, emis: 2.6, rough: 0.5 });
  const prof = buildSkirt(rb, P, { color: robe, hemY: 0.38, rTop: 0.19, rHem: 0.32, legFollow: 0.75, darkHem: 0.5 });
  rb.add(tatters(0.32, 0.41, 40, 0.08, 0.3, 0.04, 1, 0.74, 77, 0.3), { weights: (v) => { const sd = sm(-0.06, 0.06, v.x); return [['hips', 0.4], ['thigh_L', 0.6 * sd], ['thigh_R', 0.6 * (1 - sd)]]; }, color: 0x1a0a16, rough: 0.9, flex: hang(0.42, 0.3, 1.2) });
  buildHemBand(rb, P, prof, { from: 0.38, to: 0.5, region: REGION.robeTrim, color: 0xffffff, legFollow: 0.75, hemY: 0.38 });
  for (const sd of [1, -1]) {
    for (let k = 0; k < 6; k++) {
      const cg = cone(0.022 * s, 0.18 * s, 6);
      place(cg, [sd * (0.16 + k * 0.025) * s, (1.52 + (k % 2) * 0.03) * s, (-0.06 + k * 0.02) * s], [0.2 - k * 0.12, 0, -sd * (0.3 + k * 0.14)]);
      rb.add(cg, { bone: 'arm_' + sd2S(sd), color: 0xd8ccb0, rough: 0.4 });
    }
  }
  buildBareArms(rb, P, { color: skin, r: [0.058, 0.054, 0.048] });
  buildHands(rb, P, { color: skin, clawLen: 0.1, clawColor: 0x120a10, curl: 0.75, size: 1.45, thick: 1.4 });
  buildLegs(rb, P, { color: robe, beast: 0x45524a, r: [0.095, 0.08, 0.065] });
  return rb.build({ kind: 'sorcererBeast', typeId: 'sorcererBeast' });
}

// 玄清子：茅山掌教，靛青道袍、偃月冠、白须长眉、手持拂尘
export function buildMaster() {
  const rb = new RigBuilder('master');
  const P = defineSkeleton(rb, 1, { headR: V(0.075, 0.107, 0.09) });
  const s = 1;
  const skin = 0xd8b494, robe = 0x1e2a44, hair = 0xcac8c2;
  buildHead(rb, P, { skin, face: FACE.master });
  buildNeck(rb, P, skin);
  const c = P.headC, R = P.headR;
  rb.add(place(sphere(1, 20, 14), [c.x, c.y + 0.014, c.z - 0.014], [0, 0, 0], [R.x * 1.06, R.y * 1.02, R.z * 1.04]), { bone: 'head', color: hair, rough: 0.5 });
  rb.add(place(sphere(1, 14, 10), [c.x, c.y + R.y * 0.95, c.z - 0.015], [0, 0, 0], [0.04, 0.045, 0.04]), { bone: 'head', color: hair, rough: 0.5 });
  const moon = torus(0.03, 0.009, 6, 14, Math.PI * 1.2);
  place(moon, [c.x, c.y + R.y * 1.12, c.z - 0.01], [0, 0, -Math.PI * 0.1]);
  rb.add(moon, { bone: 'head', color: 0xc8a040, metal: 0.85, rough: 0.3 });
  rb.add(place(cyl(0.004, 0.004, 0.17, 6), [c.x, c.y + R.y * 1.0, c.z - 0.015], [0, 0, Math.PI / 2]), { bone: 'head', color: 0x5a3a1a, rough: 0.6 });
  for (let i = 0; i < 11; i++) {
    const x = (i / 10 - 0.5) * 0.06;
    const z = c.z + R.z * 0.72;
    const pts = [V(x, c.y - R.y * 0.6, z), V(x * 1.1, c.y - R.y * 0.95, z + 0.02), V(x * 0.8, c.y - 0.22, z + 0.03), V(x * 0.4, c.y - 0.34, z + 0.02)];
    rb.add(tube(pts, (t) => 0.008 * (1 - t * 0.7), 0, 8, 4), {
      weights: (v) => { const t = sm(1.46, 1.58, v.y); return [['head', t], ['chest', 1 - t]]; }, color: 0xeeece6, rough: 0.5, flex: hang(c.y - R.y * 0.7, 0.24, 0.6),
    });
  }
  buildTorso(rb, P, { color: robe, pat: 0.8 });
  rb.add(tube([V(0.06, 1.49, 0.03), V(0.02, 1.42, 0.12), V(-0.06, 1.3, 0.125), V(-0.12, 1.18, 0.112)], 0.013, 0.013, 16, 6), { bone: 'chest', color: 0xeae4d8, rough: 0.8 });
  buildRankBadge(rb, P, REGION.taiji, 0.18, 0.124);
  const prof = buildSkirt(rb, P, { color: robe, hemY: 0.12, rTop: 0.165, rHem: 0.32, legFollow: 0.6, darkHem: 0.85 });
  const hb = lathe([[profileR(prof, 0.12) * 1.01, 0.12], [profileR(prof, 0.19) * 1.01, 0.19]], 32, 1, 0.74);
  rb.add(hb, { weights: (v) => { const d = sm(0.97, 0.12, v.y) * 0.6; const sd = sm(-0.06, 0.06, v.x); return [['hips', 1 - d], ['thigh_L', d * sd], ['thigh_R', d * (1 - sd)]]; }, color: 0xeae4d8, rough: 0.8, flex: hemFlex(0.12, 1) });
  buildSleeves(rb, P, { color: robe, rWrist: 0.15, extraLen: 0.06, cuffColor: 0xeae4d8, cuffRegion: REGION.cuff });
  buildHands(rb, P, { color: skin, curl: 0.45 });
  buildBelt(rb, P, { color: 0xeae4d8, buckle: 0x5a8a6a, y: 1.0, r: 0.166, h: 0.05 });
  buildLegs(rb, P, { color: robe, boot: 0x0e0e0e, shoe: 'shoe', sock: 0xeae6dc });
  const lp = V(P.hand.x, P.hand.y - 0.03, 0.02);
  rb.add(place(cyl(0.012, 0.012, 0.3, 8), [lp.x, lp.y + 0.1, lp.z]), { bone: 'hand_L', color: 0x6a4a2a, rough: 0.6 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const top = V(lp.x + Math.cos(a) * 0.012, lp.y - 0.05, lp.z + Math.sin(a) * 0.012);
    const pts = [top, top.clone().add(V(Math.cos(a) * 0.02, -0.15, Math.sin(a) * 0.02)), top.clone().add(V(Math.cos(a) * 0.03, -0.38, Math.sin(a) * 0.03))];
    rb.add(tube(pts, (t) => 0.006 * (1 - t * 0.5), 0, 6, 4), { bone: 'hand_L', color: 0xf4f2ee, rough: 0.6, flex: hangFrom(top, 0.38, 1.2) });
  }
  return rb.build({ kind: 'master', typeId: 'master' });
}

// ---------------------------------------------------------------- 注册
export const CHARACTER_BUILDERS = {
  normal: () => buildJiangshi('normal'),
  purple: () => buildJiangshi('purple'),
  white: () => buildJiangshi('white'),
  green: () => buildJiangshi('green'),
  hairy: () => buildJiangshi('hairy'),
  flying: () => buildJiangshi('flying'),
  drought: () => buildJiangshi('drought'),
  hou: buildHou,
  imp: buildImp,
  paper: buildPaperMan,
  ghost: buildGhost,
  wuWhite: () => buildWuchang(false),
  wuBlack: () => buildWuchang(true),
  priest: buildPriest,
  soldier: buildSoldier,
  sorcerer: buildSorcerer,
  sorcererBeast: buildSorcererBeast,
  master: buildMaster,
};

const _cache = {};
export function getTemplate(id) {
  if (!_cache[id]) _cache[id] = CHARACTER_BUILDERS[id]();
  return _cache[id];
}
