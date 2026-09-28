import * as THREE from 'three';

// =====================================================================
//  几何体工具：放样管、椭圆车削、布条、爪、辫子……（全部返回新几何体）
// =====================================================================

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// 放置：缩放 → 旋转(欧拉XYZ) → 平移
export function place(geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...(Array.isArray(scale) ? scale : [scale, scale, scale])),
  );
  geo.applyMatrix4(m);
  return geo;
}

/**
 * 放样管：沿折线生成可变半径管
 * @param pts     Vector3[]
 * @param radii   number[] 或 [rx, rz][]（rx 沿首帧法线，rz 沿副法线）
 * @param opt     { seg, capStart, capEnd, refAxis, radialOffset: fn(i,j)->scale }
 */
export function loft(pts, radii, opt = {}) {
  const seg = opt.seg ?? 12;
  const n = pts.length;
  const T = [], N = [], B = [];
  for (let i = 0; i < n; i++) {
    const t = new THREE.Vector3();
    if (i === 0) t.subVectors(pts[1], pts[0]);
    else if (i === n - 1) t.subVectors(pts[n - 1], pts[n - 2]);
    else t.subVectors(pts[i + 1], pts[i - 1]);
    T.push(t.normalize());
  }
  // 初始法线：参考轴投影
  const ref = (opt.refAxis ?? V(1, 0, 0)).clone();
  let n0 = ref.clone().sub(T[0].clone().multiplyScalar(ref.dot(T[0])));
  if (n0.lengthSq() < 1e-6) { const alt = V(0, 0, 1); n0 = alt.sub(T[0].clone().multiplyScalar(alt.dot(T[0]))); }
  N.push(n0.normalize());
  B.push(new THREE.Vector3().crossVectors(T[0], N[0]).normalize());
  for (let i = 1; i < n; i++) {
    // 平行移动
    const axis = new THREE.Vector3().crossVectors(T[i - 1], T[i]);
    const nn = N[i - 1].clone();
    if (axis.lengthSq() > 1e-10) {
      const ang = Math.acos(Math.min(1, Math.max(-1, T[i - 1].dot(T[i]))));
      nn.applyAxisAngle(axis.normalize(), ang);
    }
    N.push(nn);
    B.push(new THREE.Vector3().crossVectors(T[i], nn).normalize());
  }
  // 累计长度作 v
  const lens = [0];
  for (let i = 1; i < n; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = lens[n - 1] || 1;

  const pos = [], nor = [], uv = [], idx = [];
  const tmp = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const r = radii[i];
    const rx = Array.isArray(r) ? r[0] : r, rz = Array.isArray(r) ? r[1] : r;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const k = opt.radialOffset ? opt.radialOffset(i, j, a) : 1;
      tmp.copy(pts[i]).addScaledVector(N[i], ca * rx * k).addScaledVector(B[i], sa * rz * k);
      pos.push(tmp.x, tmp.y, tmp.z);
      nrm.copy(N[i]).multiplyScalar(ca / (rx || 1e-4)).addScaledVector(B[i], sa / (rz || 1e-4)).normalize();
      nor.push(nrm.x, nrm.y, nrm.z);
      uv.push(j / seg, 1 - lens[i] / total);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const cap = (i, flip) => {
    const c = pos.length / 3;
    pos.push(pts[i].x, pts[i].y, pts[i].z);
    const tn = T[i].clone().multiplyScalar(flip ? -1 : 1);
    nor.push(tn.x, tn.y, tn.z);
    uv.push(0.5, 0.5);
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      if (flip) idx.push(c, a + 1, a); else idx.push(c, a, a + 1);
    }
  };
  if (opt.capStart) cap(0, true);
  if (opt.capEnd) cap(n - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (opt.recompute) g.computeVertexNormals();
  return g;
}

// 圆润肢体：两端自动收口的放样（ends 控制收口圆度）
export function limb(pts, radii, seg = 12, round = true) {
  if (!round) return loft(pts, radii, { seg, capStart: true, capEnd: true });
  const P = [], R = [];
  const a = pts[0], b = pts[1];
  const r0 = Array.isArray(radii[0]) ? radii[0] : [radii[0], radii[0]];
  const dir0 = a.clone().sub(b).normalize();
  for (const [f, s] of [[0.92, 0.45], [0.6, 0.85]]) {
    P.push(a.clone().addScaledVector(dir0, r0[0] * f * 0.8)); R.push([r0[0] * s, r0[1] * s]);
  }
  pts.forEach((p, i) => { P.push(p.clone()); R.push(radii[i]); });
  const la = pts[pts.length - 1], lb = pts[pts.length - 2];
  const rl = Array.isArray(radii[radii.length - 1]) ? radii[radii.length - 1] : [radii[radii.length - 1], radii[radii.length - 1]];
  const dir1 = la.clone().sub(lb).normalize();
  for (const [f, s] of [[0.6, 0.85], [0.92, 0.45]]) {
    P.push(la.clone().addScaledVector(dir1, rl[0] * f * 0.8)); R.push([rl[0] * s, rl[1] * s]);
  }
  return loft(P, R, { seg, capStart: true, capEnd: true });
}

// 椭圆车削：profile [[r, y], ...]，sx/sz 缩放截面
export function lathe(profile, seg = 24, sx = 1, sz = 1, phiStart = 0, phiLength = Math.PI * 2) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)), seg, phiStart, phiLength);
  if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}

export function sphere(r, ws = 16, hs = 12, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, ws, hs);
  g.scale(sx, sy, sz);
  return g;
}

export function box(w, h, d, bevel = 0) {
  if (!bevel) return new THREE.BoxGeometry(w, h, d);
  return roundedBox(w, h, d, bevel);
}

// 圆角盒：将细分盒顶点向内收成圆角
export function roundedBox(w, h, d, r, seg = 3) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const p = g.getAttribute('position');
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
    const dlt = v.clone().sub(c);
    if (dlt.lengthSq() > 1e-10) { dlt.setLength(r); v.copy(c).add(dlt); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function cyl(rt, rb, h, seg = 12, open = false) {
  return new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
}

export function cone(r, h, seg = 8) {
  return new THREE.ConeGeometry(r, h, seg);
}

export function torus(r, tube, rs = 8, ts = 24, arc = Math.PI * 2) {
  return new THREE.TorusGeometry(r, tube, rs, ts, arc);
}

// 弯曲的平面（符纸、布条）：宽 w 高 h，沿 z 方向弯曲 bend（正值向前鼓）
export function curvedPlane(w, h, bend = 0, ws = 6, hs = 8, twist = 0) {
  const g = new THREE.PlaneGeometry(w, h, ws, hs);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const ty = (y / h + 0.5);             // 0 底 1 顶
    const z = bend * (1 - ty) * (1 - ty) + (x / w) * twist * (1 - ty);
    p.setZ(i, z);
  }
  g.computeVertexNormals();
  return g;
}

// 环形布条带（破烂袍摆）：在半径 r 的椭圆上生成向下的锯齿布条
export function tatters(r, y, count, lenMin, lenMax, width, sx = 1, sz = 1, seed = 1, flare = 0.15) {
  let s = seed;
  const R = () => { s = (s * 16807) % 2147483647; return (s % 10000) / 10000; };
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + R() * 0.2;
    const len = lenMin + R() * (lenMax - lenMin);
    const wA = width * (0.7 + R() * 0.6);
    const base = pos.length / 3;
    const ca = Math.cos(a), sa = Math.sin(a);
    const tx = -sa, tz = ca;
    const rows = 3;
    for (let k = 0; k <= rows; k++) {
      const t = k / rows;
      const rr = r * (1 + flare * t);
      const ww = wA * (1 - t * 0.85);
      const cx = sa * rr * sx, cz = ca * rr * sz, cy = y - len * t;
      pos.push(cx - tx * ww, cy, cz - tz * ww, cx + tx * ww, cy, cz + tz * ww);
      uv.push(0, 1 - t, 1, 1 - t);
      if (k < rows) { const b = base + k * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 麻花辫：沿路径半径起伏的管
export function braid(pts, r = 0.028, seg = 8, knots = 18) {
  // 路径细分
  const curve = new THREE.CatmullRomCurve3(pts);
  const P = curve.getPoints(knots * 3);
  const R = P.map((_, i) => {
    const t = i / (P.length - 1);
    const bump = 0.78 + 0.22 * Math.abs(Math.sin(i * Math.PI / 3));
    return r * bump * (t > 0.88 ? 1 - (t - 0.88) * 5 : 1);
  });
  return loft(P, R, { seg, capStart: true, capEnd: true });
}

// 平滑曲线放样（Catmull-Rom 取点）
export function tube(pts, r0, r1 = r0, segs = 16, radial = 8, cap = true) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const P = curve.getPoints(segs);
  const R = P.map((_, i) => {
    const t = i / (P.length - 1);
    return typeof r0 === 'function' ? r0(t) : r0 + (r1 - r0) * t;
  });
  return loft(P, R, { seg: radial, capStart: cap, capEnd: cap });
}

// 爪 / 角：弯曲锥
export function claw(len = 0.06, r = 0.008, curl = 0.4, seg = 6) {
  const pts = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    pts.push(V(0, -len * t, Math.sin(t * curl) * len * 0.6 * t));
  }
  const R = pts.map((_, i) => r * (1 - i / 5) + 0.0006);
  return loft(pts, R, { seg, capStart: true, capEnd: true });
}

export function horn(len, r, curl = 1, seg = 8) {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(V(0, Math.sin(t * curl * 1.2) * len * 0.8, -(1 - Math.cos(t * curl)) * len * 0.5 + t * len * 0.15));
  }
  // 以 y 为主方向
  const P = pts.map((p, i) => V(0, (i / 8) * len, p.z));
  const R = P.map((_, i) => r * (1 - i / 8) + 0.001);
  return loft(P, R, { seg, capStart: true, capEnd: true });
}

// 手：掌 + 五指（可带长爪），模型空间下以腕为原点、指尖朝 -Y，掌心朝 -X*side
// curl: 手指弯曲程度；clawLen: 指甲长度
export function hand(side = 1, { palm = [0.085, 0.09, 0.03], finger = 0.07, curl = 0.35, clawLen = 0, spread = 1, thick = 1 } = {}) {
  const parts = [];
  const [pw, ph, pd] = palm;
  const pg = roundedBox(pd * thick, ph, pw * 0.92, pd * thick * 0.49, 3);
  // 掌根收窄、掌心微凹
  const pp = pg.getAttribute('position');
  for (let i = 0; i < pp.count; i++) {
    const y = pp.getY(i) / ph + 0.5;   // 0 指根端 … 1 腕端
    pp.setZ(i, pp.getZ(i) * (1 - y * 0.18));
    pp.setX(i, pp.getX(i) * (1 - Math.abs(pp.getZ(i)) / pw * 0.3));
  }
  pg.computeVertexNormals();
  place(pg, [0, -ph / 2, 0]);
  parts.push({ g: pg, kind: 'skin' });
  const fz = [-0.032, -0.011, 0.011, 0.032].map((z) => z * spread * (pw / 0.085));
  const fl = [0.86, 1.0, 0.95, 0.75];
  for (let k = 0; k < 4; k++) {
    const L = finger * fl[k];
    const pts = [], R = [];
    let p = V(0, -ph + 0.004, fz[k]);
    let ang = 0;
    for (let s = 0; s <= 3; s++) {
      pts.push(p.clone());
      R.push(0.0088 * thick * (1 - s * 0.16));
      ang += curl * 0.5;
      p = p.clone().add(V(-Math.sin(ang) * side * 0 + Math.sin(ang) * L / 3 * -side, -Math.cos(ang) * L / 3, 0));
    }
    parts.push({ g: limb(pts, R, 6), kind: 'skin' });
    if (clawLen > 0) {
      const tip = pts[pts.length - 1];
      const c = claw(clawLen, 0.0065, 0.9);
      place(c, [tip.x, tip.y, tip.z], [0, 0, ang * side * 0.8]);
      parts.push({ g: c, kind: 'claw' });
    }
  }
  // 拇指
  const tpts = [V(0, -0.02, pw * 0.5), V(-0.012 * side, -0.045, pw * 0.62), V(-0.02 * side, -0.07, pw * 0.64)];
  parts.push({ g: limb(tpts, [0.011 * thick, 0.0095 * thick, 0.008 * thick], 6), kind: 'skin' });
  if (clawLen > 0) {
    const c = claw(clawLen * 0.8, 0.006, 0.8);
    place(c, [tpts[2].x, tpts[2].y, tpts[2].z]);
    parts.push({ g: c, kind: 'claw' });
  }
  return parts;
}

// 平移整体几何列表
export function moveAll(list, x, y, z, rot = [0, 0, 0]) {
  for (const it of list) place(it.g ?? it, [x, y, z], rot);
  return list;
}

// 瓦片 / 屋顶等通用：环形挤出（沿 XZ 平面的圆环带，底 y0 顶 y1）
export function band(rTop, rBot, y0, y1, seg = 24, sx = 1, sz = 1) {
  return lathe([[rBot, y0], [rTop, y1]], seg, sx, sz);
}

// 生成非索引几何（产生硬边/纸扎折面）
export function faceted(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}
