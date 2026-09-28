import * as THREE from 'three';
import { canvasTexture, normalFromHeight } from './textures.js';
import { roundedBox, loft, V, lathe } from './shapes.js';

// =====================================================================
//  精细枪械建模（全部代码生成）：侧视轮廓挤出 + 倒角、车削枪管、
//  散热片、准星照门、扳机护圈……枪口朝 -Z，握把原点附近。
// =====================================================================

let _M = null;
export function gunMaterials() {
  if (_M) return _M;
  const grain = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#7a4524'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const y = Math.random() * h;
      g.strokeStyle = `rgba(${50 + Math.random() * 40},${22 + Math.random() * 20},8,${0.25 + Math.random() * 0.35})`;
      g.lineWidth = 0.6 + Math.random() * 2.2;
      g.beginPath(); g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 14, w * 0.7, y + (Math.random() - 0.5) * 14, w, y + (Math.random() - 0.5) * 6);
      g.stroke();
    }
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = 'rgba(40,18,6,.4)'; g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 8 + Math.random() * 10, 3, 0, 0, Math.PI * 2); g.stroke();
    }
  });
  const woodN = normalFromHeight(grain.userData.canvas, 1.2);
  const metalNoise = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { const v = 100 + Math.random() * 60; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1); }
  }, 2, 2, false);
  _M = {
    steel: new THREE.MeshStandardMaterial({ color: 0x2c2f35, metalness: 0.85, roughness: 0.38, roughnessMap: metalNoise }),
    blued: new THREE.MeshStandardMaterial({ color: 0x1a1d26, metalness: 0.9, roughness: 0.3, roughnessMap: metalNoise }),
    dark: new THREE.MeshStandardMaterial({ color: 0x121316, metalness: 0.7, roughness: 0.5 }),
    bright: new THREE.MeshStandardMaterial({ color: 0x8a9098, metalness: 0.95, roughness: 0.25, roughnessMap: metalNoise }),
    wood: new THREE.MeshStandardMaterial({ map: grain, normalMap: woodN, roughness: 0.55, color: 0xa87a60 }),
    woodDark: new THREE.MeshStandardMaterial({ map: grain, normalMap: woodN, roughness: 0.6, color: 0x8a6a5a }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc89a3a, metalness: 0.95, roughness: 0.28 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe0b050, metalness: 1, roughness: 0.22 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
    peach: new THREE.MeshStandardMaterial({ map: grain, normalMap: woodN, color: 0xffb08a, roughness: 0.5 }),
    red: new THREE.MeshStandardMaterial({ color: 0xb01414, roughness: 0.7 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x3a2014, roughness: 0.95 }),
    talis: new THREE.MeshStandardMaterial({ color: 0xe8c64e, roughness: 0.9, emissive: 0x3a2800 }),
  };
  return _M;
}

// 侧视轮廓挤出：pts 为 [前向距离u, 高度v]，thickness 为左右厚度
function prof(pts, thickness, mat, bevel = 0.004, curveSeg = 3) {
  const sh = new THREE.Shape();
  pts.forEach(([u, v], i) => (i ? sh.lineTo(u, v) : sh.moveTo(u, v)));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {
    depth: Math.max(0.0005, thickness - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: curveSeg, curveSegments: 8,
  });
  g.translate(0, 0, -(thickness - bevel * 2) / 2);
  g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  return m;
}
// 平滑曲线轮廓（二次贝塞尔点序列）
function profCurve(build, thickness, mat, bevel = 0.004) {
  const sh = new THREE.Shape();
  build(sh);
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.0005, thickness - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -(thickness - bevel * 2) / 2);
  g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}
// 沿 -Z 的圆柱（u0 → u1 前向距离）
function barrel(r0, r1, u0, u1, y, mat, seg = 16, x = 0) {
  const len = u1 - u0;
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, -(u0 + len / 2));
  return m;
}
function rbox(w, h, d, r, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(roundedBox(w, h, d, r, 2), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  return m;
}
// 扳机护圈（半环，位于 YZ 平面）
function triggerGuard(u, y, r, mat, tube = 0.004) {
  const g = new THREE.TorusGeometry(r, tube, 6, 18, Math.PI);
  const m = new THREE.Mesh(g, mat);
  m.rotation.set(0, Math.PI / 2, Math.PI);
  m.position.set(0, y, -u);
  return m;
}
function trigger(u, y, mat) {
  const g = new THREE.TorusGeometry(0.012, 0.0035, 5, 10, Math.PI * 0.6);
  const m = new THREE.Mesh(g, mat);
  m.rotation.set(0, Math.PI / 2, Math.PI * 1.1);
  m.position.set(0, y, -u);
  return m;
}
function finalize(group) {
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return group;
}

// ---------------------------------------------------------------- 驳壳枪（毛瑟 C96）
export function buildMauser() {
  const M = gunMaterials();
  const g = new THREE.Group();
  // 机匣（侧轮廓）
  g.add(prof([[-0.1, 0.0], [0.12, 0.0], [0.13, 0.012], [0.13, 0.045], [0.02, 0.045], [-0.02, 0.05], [-0.1, 0.048], [-0.115, 0.03]], 0.028, M.blued, 0.003));
  // 枪管
  g.add(barrel(0.011, 0.0095, 0.12, 0.3, 0.032, M.blued, 18));
  g.add(barrel(0.013, 0.013, 0.12, 0.14, 0.032, M.steel, 18));
  // 准星
  g.add(prof([[0.285, 0.04], [0.298, 0.04], [0.296, 0.052], [0.289, 0.052]], 0.004, M.blued, 0.0006));
  // 表尺
  g.add(rbox(0.012, 0.01, 0.05, 0.002, M.steel, 0, 0.052, -0.06));
  // 弹仓（扳机前）
  g.add(prof([[0.02, 0.0], [0.09, 0.0], [0.088, -0.07], [0.028, -0.07]], 0.03, M.blued, 0.003));
  g.add(rbox(0.032, 0.008, 0.065, 0.002, M.steel, 0, -0.072, -0.058));
  // 扫帚柄握把
  g.add(profCurve((s) => {
    s.moveTo(-0.02, 0.0); s.lineTo(-0.1, 0.005);
    s.quadraticCurveTo(-0.13, -0.04, -0.125, -0.1);
    s.quadraticCurveTo(-0.115, -0.13, -0.085, -0.125);
    s.quadraticCurveTo(-0.07, -0.06, -0.03, -0.02); s.closePath();
  }, 0.03, M.blued, 0.004));
  // 木握片 + 横槽
  for (const sx of [1, -1]) {
    const w = profCurve((s) => {
      s.moveTo(-0.035, -0.012); s.lineTo(-0.095, -0.006);
      s.quadraticCurveTo(-0.118, -0.045, -0.114, -0.098);
      s.quadraticCurveTo(-0.1, -0.118, -0.087, -0.114);
      s.quadraticCurveTo(-0.075, -0.06, -0.035, -0.012);
    }, 0.006, M.woodDark, 0.002);
    w.position.x = sx * 0.016;
    g.add(w);
    for (let i = 0; i < 9; i++) g.add(rbox(0.002, 0.003, 0.03, 0.001, M.dark, sx * 0.0195, -0.02 - i * 0.0095, 0.085 + i * 0.0035, -0.25));
  }
  // 握把底环
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0025, 6, 12), M.steel);
  ring.position.set(0, -0.13, 0.108); ring.rotation.y = Math.PI / 2;
  g.add(ring);
  // 扳机 + 护圈
  g.add(triggerGuard(0.0, -0.003, 0.022, M.blued));
  g.add(trigger(0.0, -0.005, M.steel));
  // 击锤
  g.add(prof([[-0.115, 0.03], [-0.1, 0.035], [-0.11, 0.075], [-0.125, 0.07]], 0.01, M.steel, 0.002));
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.003, 6, 12), M.steel).translateY(0.07).translateZ(0.117).rotateY(Math.PI / 2));
  // 拉机柄
  g.add(rbox(0.024, 0.01, 0.018, 0.003, M.steel, 0, 0.052, 0.085));
  return finalize(Object.assign(g, { userData: { muzzle: V(0, 0.032, -0.31), grip: V(0, -0.06, 0.1), fore: null, eject: V(0.02, 0.05, -0.02) } }));
}

// ---------------------------------------------------------------- 汤姆逊（M1928 弹鼓）
export function buildThompson() {
  const M = gunMaterials();
  const g = new THREE.Group();
  // 机匣
  g.add(prof([[-0.12, 0.0], [0.16, 0.0], [0.16, 0.058], [-0.1, 0.058], [-0.12, 0.045]], 0.036, M.blued, 0.004));
  g.add(rbox(0.03, 0.012, 0.2, 0.004, M.steel, 0, 0.062, -0.02));
  // 散热片枪管
  g.add(barrel(0.013, 0.013, 0.16, 0.4, 0.03, M.blued, 16));
  for (let i = 0; i < 16; i++) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.005, 18), M.steel);
    f.rotation.x = Math.PI / 2; f.position.set(0, 0.03, -(0.17 + i * 0.011));
    g.add(f);
  }
  // 卡兹补偿器
  g.add(barrel(0.017, 0.017, 0.38, 0.44, 0.03, M.steel, 14));
  for (let i = 0; i < 3; i++) g.add(rbox(0.005, 0.02, 0.006, 0.001, M.dark, 0, 0.042, -(0.395 + i * 0.013)));
  // 准星
  g.add(prof([[0.425, 0.045], [0.435, 0.045], [0.433, 0.058], [0.428, 0.058]], 0.004, M.blued, 0.0006));
  // 立式前握把（木）
  g.add(profCurve((s) => {
    s.moveTo(0.19, 0.005); s.lineTo(0.255, 0.005);
    s.quadraticCurveTo(0.26, -0.04, 0.245, -0.1); s.lineTo(0.205, -0.1);
    s.quadraticCurveTo(0.2, -0.05, 0.19, 0.005);
  }, 0.03, M.wood, 0.006));
  for (let i = 0; i < 4; i++) g.add(rbox(0.032, 0.003, 0.03, 0.001, M.woodDark, 0, -0.02 - i * 0.02, -0.225));
  // 弹鼓
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.034, 32), M.blued);
  drum.rotation.z = Math.PI / 2; drum.position.set(0, -0.055, -0.07);
  g.add(drum);
  const drumCap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 24), M.steel);
  drumCap.rotation.z = Math.PI / 2; drumCap.position.copy(drum.position);
  g.add(drumCap);
  const key = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.006, 0.02), M.steel);
  key.position.set(0.024, -0.055, -0.07); g.add(key);
  // 握把（木）
  g.add(profCurve((s) => {
    s.moveTo(-0.02, 0.0); s.lineTo(-0.075, 0.0);
    s.quadraticCurveTo(-0.1, -0.06, -0.095, -0.12); s.lineTo(-0.055, -0.12);
    s.quadraticCurveTo(-0.055, -0.06, -0.02, 0.0);
  }, 0.03, M.wood, 0.006));
  g.add(triggerGuard(-0.005, -0.004, 0.022, M.blued));
  g.add(trigger(-0.005, -0.006, M.steel));
  // 枪托（木）
  g.add(profCurve((s) => {
    s.moveTo(-0.115, 0.05); s.lineTo(-0.12, 0.0);
    s.quadraticCurveTo(-0.25, -0.03, -0.39, -0.07); s.lineTo(-0.4, 0.045);
    s.quadraticCurveTo(-0.26, 0.05, -0.115, 0.05);
  }, 0.036, M.wood, 0.007));
  g.add(prof([[-0.39, -0.072], [-0.405, -0.072], [-0.405, 0.048], [-0.39, 0.048]], 0.038, M.steel, 0.003));
  // 拉机柄（顶部圆钮）
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), M.bright);
  knob.position.set(0, 0.072, -0.03); g.add(knob);
  return finalize(Object.assign(g, { userData: { muzzle: V(0, 0.03, -0.45), grip: V(0, -0.06, 0.08), fore: V(0, -0.05, -0.225), eject: V(0.02, 0.05, -0.05) } }));
}

// ---------------------------------------------------------------- AK-47
export function buildAK() {
  const M = gunMaterials();
  const g = new THREE.Group();
  g.add(prof([[-0.12, 0.0], [0.17, 0.0], [0.17, 0.05], [0.02, 0.058], [-0.12, 0.052]], 0.034, M.steel, 0.004));
  g.add(profCurve((s) => { s.moveTo(-0.12, 0.052); s.lineTo(0.08, 0.058); s.quadraticCurveTo(0.12, 0.07, 0.17, 0.058); s.lineTo(0.17, 0.05); s.lineTo(-0.12, 0.05); }, 0.036, M.blued, 0.003));
  // 木护木（上下）
  g.add(profCurve((s) => { s.moveTo(0.17, -0.005); s.lineTo(0.37, 0.0); s.quadraticCurveTo(0.38, 0.03, 0.37, 0.045); s.lineTo(0.17, 0.045); }, 0.042, M.wood, 0.008));
  g.add(profCurve((s) => { s.moveTo(0.18, 0.058); s.lineTo(0.34, 0.058); s.quadraticCurveTo(0.35, 0.075, 0.33, 0.08); s.lineTo(0.19, 0.08); }, 0.032, M.wood, 0.006));
  for (let i = 0; i < 3; i++) g.add(rbox(0.044, 0.004, 0.03, 0.001, M.woodDark, 0, 0.012 + i * 0.01, -(0.22 + i * 0.03)));
  // 导气管 & 枪管
  g.add(barrel(0.009, 0.009, 0.33, 0.44, 0.07, M.blued, 12));
  g.add(barrel(0.011, 0.01, 0.37, 0.6, 0.03, M.blued, 16));
  g.add(prof([[0.44, 0.03], [0.46, 0.03], [0.46, 0.085], [0.44, 0.085]], 0.022, M.blued, 0.002));
  g.add(prof([[0.555, 0.03], [0.575, 0.03], [0.572, 0.085], [0.558, 0.085]], 0.018, M.blued, 0.002));
  g.add(barrel(0.015, 0.012, 0.6, 0.64, 0.03, M.steel, 12));
  // 表尺
  g.add(rbox(0.02, 0.012, 0.05, 0.002, M.blued, 0, 0.068, -0.19));
  // 弯弹匣（曲线）
  g.add(profCurve((s) => {
    s.moveTo(0.02, 0.0); s.lineTo(0.1, 0.0);
    s.quadraticCurveTo(0.14, -0.1, 0.19, -0.2);
    s.lineTo(0.12, -0.225);
    s.quadraticCurveTo(0.07, -0.11, 0.02, 0.0);
  }, 0.03, M.dark, 0.004));
  for (let i = 0; i < 4; i++) g.add(rbox(0.032, 0.004, 0.012, 0.001, M.steel, 0, -0.04 - i * 0.04, -(0.08 + i * 0.022), -0.45));
  // 握把
  g.add(profCurve((s) => { s.moveTo(-0.03, 0.0); s.lineTo(-0.075, 0.0); s.quadraticCurveTo(-0.11, -0.07, -0.105, -0.115); s.lineTo(-0.07, -0.115); s.quadraticCurveTo(-0.07, -0.06, -0.03, 0.0); }, 0.03, M.woodDark, 0.006));
  g.add(triggerGuard(-0.005, -0.002, 0.024, M.blued));
  g.add(trigger(-0.005, -0.004, M.steel));
  // 木托
  g.add(profCurve((s) => {
    s.moveTo(-0.12, 0.05); s.lineTo(-0.12, 0.005);
    s.quadraticCurveTo(-0.3, -0.04, -0.44, -0.075); s.lineTo(-0.45, 0.035);
    s.quadraticCurveTo(-0.3, 0.035, -0.12, 0.05);
  }, 0.04, M.wood, 0.008));
  g.add(prof([[-0.44, -0.078], [-0.455, -0.078], [-0.455, 0.037], [-0.44, 0.037]], 0.042, M.steel, 0.003));
  // 拉机柄
  g.add(rbox(0.024, 0.01, 0.014, 0.004, M.bright, 0.022, 0.045, -0.12));
  return finalize(Object.assign(g, { userData: { muzzle: V(0, 0.03, -0.65), grip: V(0, -0.06, 0.085), fore: V(0, 0.01, -0.27), eject: V(0.02, 0.05, -0.05) } }));
}

// ---------------------------------------------------------------- 双管猎枪
export function buildShotgun() {
  const M = gunMaterials();
  const g = new THREE.Group();
  // 机匣（带金色雕花）
  g.add(prof([[-0.05, -0.01], [0.09, -0.01], [0.1, 0.02], [0.1, 0.05], [-0.05, 0.05]], 0.05, M.bright, 0.006));
  for (const sx of [1, -1]) {
    const eng = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0015, 4, 16), M.gold);
    eng.rotation.y = Math.PI / 2; eng.position.set(sx * 0.026, 0.02, -0.02);
    g.add(eng);
    const eng2 = eng.clone(); eng2.scale.setScalar(0.6); eng2.position.z = -0.05; g.add(eng2);
  }
  // 双管
  for (const sx of [1, -1]) {
    g.add(barrel(0.015, 0.014, 0.08, 0.62, 0.035, M.blued, 18, sx * 0.0145));
    g.add(barrel(0.017, 0.017, 0.6, 0.62, 0.035, M.steel, 18, sx * 0.0145));
  }
  g.add(rbox(0.008, 0.008, 0.52, 0.002, M.blued, 0, 0.052, -0.35));
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), M.brass);
  bead.position.set(0, 0.058, -0.6); g.add(bead);
  // 木前托
  g.add(profCurve((s) => { s.moveTo(0.1, 0.0); s.lineTo(0.3, 0.005); s.quadraticCurveTo(0.31, 0.02, 0.3, 0.03); s.lineTo(0.1, 0.03); }, 0.05, M.wood, 0.01));
  // 枪托（手枪式握颈）
  g.add(profCurve((s) => {
    s.moveTo(-0.05, 0.05); s.lineTo(-0.05, -0.01);
    s.quadraticCurveTo(-0.08, -0.07, -0.12, -0.075);
    s.quadraticCurveTo(-0.3, -0.09, -0.45, -0.11);
    s.lineTo(-0.46, 0.035);
    s.quadraticCurveTo(-0.25, 0.04, -0.05, 0.05);
  }, 0.044, M.wood, 0.01));
  g.add(prof([[-0.45, -0.113], [-0.47, -0.113], [-0.47, 0.037], [-0.45, 0.037]], 0.046, M.rubber, 0.004));
  g.add(triggerGuard(-0.02, -0.012, 0.022, M.bright));
  g.add(trigger(-0.02, -0.014, M.gold));
  g.add(trigger(-0.005, -0.014, M.gold));
  // 双击锤
  for (const sx of [1, -1]) g.add(rbox(0.006, 0.02, 0.012, 0.002, M.steel, sx * 0.014, 0.058, 0.04, -0.4));
  return finalize(Object.assign(g, { userData: { muzzle: V(0, 0.035, -0.63), grip: V(0, -0.045, 0.1), fore: V(0, 0.01, -0.2), eject: V(0.02, 0.06, 0.0) } }));
}

// ---------------------------------------------------------------- 加特林
export function buildGatling() {
  const M = gunMaterials();
  const g = new THREE.Group();
  // 主机体
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.26, 24), M.dark);
  body.rotation.x = Math.PI / 2; body.position.set(0, 0, 0.06); g.add(body);
  g.add(rbox(0.1, 0.05, 0.22, 0.015, M.steel, 0, 0.08, 0.06));
  // 电机
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 16), M.steel);
  motor.rotation.z = Math.PI / 2; motor.position.set(-0.08, 0.02, 0.1); g.add(motor);
  // 提把
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.009, 8, 20, Math.PI), M.rubber);
  handle.position.set(0, 0.105, 0.06); handle.rotation.y = Math.PI / 2; g.add(handle);
  // 后握把
  g.add(rbox(0.035, 0.1, 0.045, 0.012, M.rubber, 0, -0.08, 0.17, -0.25));
  // 旋转管束
  const spin = new THREE.Group();
  spin.position.set(0, 0, -0.07);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = barrel(0.012, 0.011, 0.0, 0.5, 0, M.blued, 10, 0);
    b.position.x = Math.cos(a) * 0.042; b.position.y = Math.sin(a) * 0.042;
    spin.add(b);
    const tip = barrel(0.014, 0.014, 0.47, 0.5, 0, M.steel, 10, 0);
    tip.position.x = b.position.x; tip.position.y = b.position.y;
    spin.add(tip);
  }
  for (const u of [0.05, 0.25, 0.44]) {
    const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.022, 6), M.steel);
    clamp.rotation.x = Math.PI / 2; clamp.position.z = -u; spin.add(clamp);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), M.bright);
  hub.rotation.x = Math.PI / 2; hub.position.z = -0.25; spin.add(hub);
  g.add(spin);
  // 弹箱 + 弹链
  g.add(rbox(0.12, 0.13, 0.16, 0.01, M.dark, 0.02, -0.14, 0.05));
  g.add(rbox(0.125, 0.02, 0.165, 0.005, M.steel, 0.02, -0.07, 0.05));
  for (let i = 0; i < 8; i++) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.045, 6), M.brass);
    r.position.set(0.01, -0.06 + i * 0.008, 0.0 - i * 0.004); r.rotation.z = Math.PI / 2; r.rotation.x = 0.3;
    g.add(r);
  }
  return finalize(Object.assign(g, { userData: { muzzle: V(0, 0, -0.58), grip: V(0, -0.07, 0.17), fore: V(0, 0.105, 0.06), eject: V(0.06, -0.05, 0.05), spin } }));
}

// ---------------------------------------------------------------- 桃木剑
export function buildPeachSword() {
  const M = gunMaterials();
  const g = new THREE.Group();
  // 剑身（带剑尖的挤出，刃面朝 ±X）
  g.add(prof([[0.0, -0.017], [0.56, -0.017], [0.62, 0.0], [0.56, 0.017], [0.0, 0.017]], 0.012, M.peach, 0.003));
  // 符咒刻纹 + 七星铜钉
  for (const sx of [1, -1]) {
    for (let i = 0; i < 7; i++) {
      const st = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 6, 5), M.brass);
      st.position.set(sx * 0.0062, (i % 2 ? 0.006 : -0.006), -(0.08 + i * 0.065));
      g.add(st);
    }
    const line = rbox(0.001, 0.003, 0.42, 0.0005, M.gold, sx * 0.0062, 0, -0.3);
    g.add(line);
  }
  // 护手
  g.add(rbox(0.026, 0.1, 0.022, 0.006, M.brass, 0, 0, 0.0));
  // 缠绳剑柄
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.13, 10), M.cloth);
  hilt.rotation.x = Math.PI / 2; hilt.position.z = 0.075; g.add(hilt);
  for (let i = 0; i < 6; i++) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.0155, 0.002, 4, 12), M.red);
    w.position.z = 0.02 + i * 0.02; g.add(w);
  }
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), M.brass);
  pommel.position.z = 0.145; g.add(pommel);
  // 红穗
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.1, 10, 1, true), M.red);
  tassel.position.set(0, -0.05, 0.16); g.add(tassel);
  return finalize(Object.assign(g, { userData: { muzzle: V(0, 0, -0.6), grip: V(0, 0, 0.07), fore: null, eject: V() } }));
}

export const GUN_BUILDERS = {
  mauser: buildMauser, thompson: buildThompson, ak47: buildAK, shotgun: buildShotgun, gatling: buildGatling, sword: buildPeachSword,
};

// 第一人称手臂：道袍黄袖 + 手（从屏幕外延伸到握点）
export function buildFpsArm(from, to, side = 1) {
  const M = gunMaterials();
  const grp = new THREE.Group();
  const sleeveMat = new THREE.MeshStandardMaterial({ color: 0xd89a2a, roughness: 0.85 });
  const cuffMat = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0b896, roughness: 0.6 });
  const dir = to.clone().sub(from);
  const len = dir.length();
  dir.normalize();
  const wrist = to.clone().addScaledVector(dir, -0.06);
  const sleeve = new THREE.Mesh(loft([from, from.clone().lerp(wrist, 0.6), wrist], [0.075, 0.07, 0.062], { seg: 14, capStart: true }), sleeveMat);
  grp.add(sleeve);
  const cuff = new THREE.Mesh(loft([wrist.clone().addScaledVector(dir, -0.03), wrist.clone().addScaledVector(dir, 0.005)], [0.064, 0.066], { seg: 14 }), cuffMat);
  grp.add(cuff);
  const fore = new THREE.Mesh(loft([wrist.clone().addScaledVector(dir, -0.02), to.clone().addScaledVector(dir, -0.015)], [0.028, 0.03], { seg: 10, capEnd: true }), skin);
  grp.add(fore);
  const fist = new THREE.Mesh(roundedBox(0.05, 0.06, 0.07, 0.02, 2), skin);
  fist.position.copy(to);
  fist.lookAt(to.clone().add(dir));
  grp.add(fist);
  grp.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  void len; void side; void M; void lathe;
  return grp;
}
