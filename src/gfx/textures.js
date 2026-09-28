import * as THREE from 'three';

// =====================================================================
//  程序化纹理：角色贴图图集（脸谱 / 符纸 / 补子 / 海水江崖 / 帽文）+ 暗花锦缎
//  全部用 Canvas 实时绘制，无外部图片资源。
// =====================================================================

export const ATLAS_SIZE = 1024;

// 图集分区（像素，左上角原点）
export const REGION = {
  face: (i) => [(i % 4) * 256, Math.floor(i / 4) * 256, 256, 256],
  talisman: [0, 512, 128, 256],
  crane: [128, 512, 256, 256],
  bagua: [384, 512, 256, 256],
  sun: [640, 512, 256, 256],
  hatWhite: [0, 768, 96, 256],
  hatBlack: [96, 768, 96, 256],
  waves: [192, 768, 576, 128],
  cuff: [192, 896, 576, 64],
  paper: [192, 960, 576, 64],
  gold: [768, 768, 128, 128],
  flame: [896, 512, 128, 256],
  plaque: [768, 896, 256, 128],
};

export const FACE = {
  jiangshi: 0, priest: 1, imp: 2, ghost: 3, wuWhite: 4, wuBlack: 5, hou: 6, paper: 7,
};

function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

// ---------------------------------------------------------------- 脸谱
function ellipse(g, x, y, rx, ry, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function radial(g, x, y, r, c0, c1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, c0);
  gr.addColorStop(1, c1);
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

// 脸部 UV：面壳为前半球（phi 0..π），u=0.5 为正脸中线；theta 0..π 纵向，赤道(128)为眼线
function drawFace(g, kind) {
  const W = 256;
  g.save();
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, W);
  const cx = 128, eyeY = 124, eyeDX = 30;
  const R = rand(kind * 97 + 11);

  // 通用：轻微肤色起伏
  for (let i = 0; i < 220; i++) {
    const v = 232 + R() * 23;
    g.fillStyle = `rgba(${v},${v},${v},0.35)`;
    g.fillRect(R() * W, R() * W, 3 + R() * 6, 3 + R() * 6);
  }

  const socket = (dark = 'rgba(40,20,40,0.75)', r = 26) => {
    for (const s of [-1, 1]) radial(g, cx + s * eyeDX, eyeY + 2, r, dark, 'rgba(255,255,255,0)');
  };
  const cheekHollow = (a = 0.35) => {
    for (const s of [-1, 1]) radial(g, cx + s * 40, eyeY + 42, 26, `rgba(80,60,80,${a})`, 'rgba(255,255,255,0)');
  };
  const eyes = (white, iris, pupil, rx = 11, ry = 6, lid = true) => {
    for (const s of [-1, 1]) {
      ellipse(g, cx + s * eyeDX, eyeY, rx, ry);
      g.fillStyle = white; g.fill();
      if (iris) { ellipse(g, cx + s * eyeDX, eyeY, ry * 0.95, ry * 0.95); g.fillStyle = iris; g.fill(); }
      if (pupil) { ellipse(g, cx + s * eyeDX, eyeY, ry * 0.45, ry * 0.45); g.fillStyle = pupil; g.fill(); }
      if (lid) {
        g.strokeStyle = 'rgba(30,15,15,0.85)'; g.lineWidth = 2.2;
        g.beginPath(); g.ellipse(cx + s * eyeDX, eyeY, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      }
    }
  };
  const brows = (color, w = 5, angle = 0.12, y = eyeY - 16, len = 17) => {
    g.strokeStyle = color; g.lineCap = 'round'; g.lineWidth = w;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + s * (eyeDX - len), y + s * 0 + len * angle);
      g.quadraticCurveTo(cx + s * eyeDX, y - 4, cx + s * (eyeDX + len), y + len * angle * -0.2);
      g.stroke();
    }
  };
  const nostrils = (c = 'rgba(60,30,30,0.7)') => {
    for (const s of [-1, 1]) { ellipse(g, cx + s * 6, eyeY + 33, 3.2, 2.2); g.fillStyle = c; g.fill(); }
  };
  const mouth = (c, w = 24, curve = 0, thick = 3) => {
    g.strokeStyle = c; g.lineWidth = thick; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - w, eyeY + 52); g.quadraticCurveTo(cx, eyeY + 52 + curve, cx + w, eyeY + 52); g.stroke();
  };
  const veins = (c, n = 14) => {
    g.strokeStyle = c; g.lineWidth = 1.2;
    for (let i = 0; i < n; i++) {
      let x = cx + (R() - 0.5) * 150, y = eyeY - 40 + R() * 110;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (R() - 0.5) * 18; y += (R() - 0.3) * 14; g.lineTo(x, y); }
      g.stroke();
    }
  };

  switch (kind) {
    case FACE.jiangshi: {
      socket('rgba(50,20,60,0.85)', 28);
      cheekHollow(0.45);
      eyes('#e9e2cf', '#c9c1a6', null, 10, 5.5);
      // 翻白眼的尸目
      for (const s of [-1, 1]) { ellipse(g, cx + s * eyeDX, eyeY - 3, 4, 2.5); g.fillStyle = 'rgba(90,70,60,.8)'; g.fill(); }
      brows('rgba(20,15,15,0.9)', 4, 0.3);
      nostrils();
      // 乌紫嘴唇 + 两颗尖牙
      ellipse(g, cx, eyeY + 53, 20, 5); g.fillStyle = 'rgba(70,30,60,0.85)'; g.fill();
      g.fillStyle = '#f4efe0';
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(cx + s * 10, eyeY + 53); g.lineTo(cx + s * 13, eyeY + 64); g.lineTo(cx + s * 16, eyeY + 53); g.fill();
      }
      veins('rgba(70,40,90,0.35)');
      // 额角尸斑
      for (let i = 0; i < 6; i++) radial(g, cx + (R() - 0.5) * 130, eyeY - 60 + R() * 140, 8 + R() * 10, 'rgba(90,70,110,.35)', 'rgba(255,255,255,0)');
      break;
    }
    case FACE.priest: {
      socket('rgba(120,80,60,0.35)', 22);
      eyes('#f4f0e6', '#3a2618', '#0c0806', 11, 6);
      nostrils('rgba(110,60,40,0.6)');
      // 法令纹
      g.strokeStyle = 'rgba(120,70,50,0.45)'; g.lineWidth = 2;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 12, eyeY + 30); g.quadraticCurveTo(cx + s * 24, eyeY + 44, cx + s * 22, eyeY + 58); g.stroke(); }
      mouth('rgba(130,60,50,0.9)', 18, 2, 3.2);
      // 胡茬
      for (let i = 0; i < 380; i++) {
        const a = R() * Math.PI, rr = 40 + R() * 22;
        const x = cx + Math.cos(a) * rr * 0.9, y = eyeY + 30 + Math.sin(a) * rr * 0.75;
        g.fillStyle = 'rgba(40,30,25,0.18)'; g.fillRect(x, y, 1.6, 1.6);
      }
      // 一字眉（林正英招牌）
      g.strokeStyle = '#120c08'; g.lineWidth = 9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - 48, eyeY - 12); g.quadraticCurveTo(cx, eyeY - 26, cx + 48, eyeY - 12); g.stroke();
      // 眉心朱砂
      ellipse(g, cx, eyeY - 34, 4, 5); g.fillStyle = '#c0161a'; g.fill();
      break;
    }
    case FACE.imp: {
      socket('rgba(30,10,10,0.9)', 30);
      eyes('#ffd84a', '#ff9a1a', '#1a0500', 15, 10, false);
      g.strokeStyle = 'rgba(20,5,5,.9)'; g.lineWidth = 6;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 12, eyeY - 12); g.lineTo(cx + s * 48, eyeY - 26); g.stroke(); }
      nostrils('rgba(20,5,5,.8)');
      // 咧嘴獠牙
      g.fillStyle = '#300808';
      g.beginPath(); g.moveTo(cx - 40, eyeY + 42); g.quadraticCurveTo(cx, eyeY + 82, cx + 40, eyeY + 42); g.quadraticCurveTo(cx, eyeY + 58, cx - 40, eyeY + 42); g.fill();
      g.fillStyle = '#f5f0d8';
      for (let i = -3; i <= 3; i++) {
        const x = cx + i * 10;
        g.beginPath(); g.moveTo(x - 4, eyeY + 50 + Math.abs(i) * -1.5); g.lineTo(x, eyeY + 60); g.lineTo(x + 4, eyeY + 50 + Math.abs(i) * -1.5); g.fill();
      }
      veins('rgba(20,40,20,0.3)', 10);
      break;
    }
    case FACE.ghost: {
      socket('rgba(20,0,10,0.95)', 30);
      eyes('#fbfbfb', null, '#000', 10, 7, false);
      // 血泪
      g.strokeStyle = 'rgba(150,0,0,0.9)'; g.lineWidth = 3;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * eyeDX, eyeY + 7); g.lineTo(cx + s * (eyeDX + 2), eyeY + 55); g.stroke(); }
      nostrils('rgba(80,60,70,.45)');
      // 朱唇
      g.fillStyle = '#9a0c14';
      g.beginPath(); g.moveTo(cx - 14, eyeY + 52); g.quadraticCurveTo(cx, eyeY + 44, cx + 14, eyeY + 52); g.quadraticCurveTo(cx, eyeY + 60, cx - 14, eyeY + 52); g.fill();
      break;
    }
    case FACE.wuWhite: {
      socket('rgba(60,60,80,0.4)', 22);
      // 眯眼笑
      g.strokeStyle = '#111'; g.lineWidth = 4; g.lineCap = 'round';
      for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * eyeDX, eyeY + 6, 12, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
      brows('#222', 4, -0.25, eyeY - 22);
      nostrils('rgba(60,60,60,.5)');
      // 大笑口（舌头由几何体伸出）
      g.fillStyle = '#2a0a0a';
      g.beginPath(); g.moveTo(cx - 30, eyeY + 44); g.quadraticCurveTo(cx, eyeY + 80, cx + 30, eyeY + 44); g.quadraticCurveTo(cx, eyeY + 52, cx - 30, eyeY + 44); g.fill();
      // 腮红
      for (const s of [-1, 1]) radial(g, cx + s * 44, eyeY + 28, 16, 'rgba(230,120,130,.55)', 'rgba(255,255,255,0)');
      break;
    }
    case FACE.wuBlack: {
      socket('rgba(0,0,0,0.6)', 26);
      eyes('#f0e8d0', '#aa1a10', '#000', 12, 6.5);
      g.strokeStyle = '#000'; g.lineWidth = 8; g.lineCap = 'round';
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 8, eyeY - 10); g.lineTo(cx + s * 50, eyeY - 30); g.stroke(); }
      nostrils('rgba(0,0,0,.7)');
      mouth('#000', 26, -10, 5);
      // 虬髯
      for (let i = 0; i < 500; i++) {
        const a = R() * Math.PI, rr = 45 + R() * 30;
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(cx + Math.cos(a) * rr, eyeY + 38 + Math.sin(a) * rr * 0.9, 2, 4);
      }
      break;
    }
    case FACE.hou: {
      // 鬼面纹
      g.fillStyle = 'rgba(40,0,0,0.25)'; g.fillRect(0, 0, W, W);
      socket('rgba(0,0,0,0.95)', 34);
      eyes('#ff3010', '#ffd040', '#300', 13, 7, false);
      g.strokeStyle = 'rgba(160,10,10,0.9)'; g.lineWidth = 5;
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(cx + s * 6, eyeY - 60); g.quadraticCurveTo(cx + s * 30, eyeY - 30, cx + s * 70, eyeY - 40); g.stroke();
        g.beginPath(); g.moveTo(cx + s * 50, eyeY + 10); g.lineTo(cx + s * 70, eyeY + 50); g.stroke();
      }
      nostrils('#000');
      g.fillStyle = '#1a0000';
      g.beginPath(); g.moveTo(cx - 44, eyeY + 40); g.quadraticCurveTo(cx, eyeY + 90, cx + 44, eyeY + 40); g.quadraticCurveTo(cx, eyeY + 56, cx - 44, eyeY + 40); g.fill();
      g.fillStyle = '#f0e8c8';
      for (let i = -4; i <= 4; i++) {
        const x = cx + i * 9, big = Math.abs(i) === 3;
        g.beginPath(); g.moveTo(x - 4, eyeY + 46); g.lineTo(x, eyeY + (big ? 72 : 58)); g.lineTo(x + 4, eyeY + 46); g.fill();
      }
      break;
    }
    case FACE.paper: {
      // 纸扎人：平涂五官、两团胭脂
      for (const s of [-1, 1]) radial(g, cx + s * 42, eyeY + 26, 22, 'rgba(235,60,80,.95)', 'rgba(235,60,80,0)');
      for (const s of [-1, 1]) {
        ellipse(g, cx + s * eyeDX, eyeY, 7, 9); g.fillStyle = '#111'; g.fill();
        ellipse(g, cx + s * eyeDX + 2, eyeY - 3, 2, 2.5); g.fillStyle = '#fff'; g.fill();
      }
      g.strokeStyle = '#111'; g.lineWidth = 3;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 18, eyeY - 22); g.lineTo(cx + s * 44, eyeY - 18); g.stroke(); }
      g.fillStyle = '#d0101a';
      ellipse(g, cx, eyeY + 50, 9, 5); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 2;
      g.beginPath(); g.arc(cx, eyeY + 40, 22, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
      // 纸纹
      for (let i = 0; i < 18; i++) { g.strokeStyle = 'rgba(160,150,130,.25)'; g.beginPath(); const y = R() * W; g.moveTo(0, y); g.lineTo(W, y + (R() - 0.5) * 20); g.stroke(); }
      break;
    }
  }
  g.restore();
}

// ---------------------------------------------------------------- 符纸
export function drawTalisman(g, w, h, withGlow = false) {
  g.fillStyle = '#e8c64e'; g.fillRect(0, 0, w, h);
  const R = rand(7);
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(160,110,20,${R() * 0.18})`; g.fillRect(R() * w, R() * h, 2 + R() * 5, 1 + R() * 3); }
  g.strokeStyle = '#b3141a'; g.lineWidth = w * 0.035;
  g.strokeRect(w * 0.08, h * 0.03, w * 0.84, h * 0.94);
  g.fillStyle = '#b3141a';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${Math.round(w * 0.42)}px "KaiTi","STKaiti","SimSun",serif`;
  g.fillText('敕', w / 2, h * 0.14);
  g.fillText('令', w / 2, h * 0.3);
  g.lineWidth = w * 0.05; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(w / 2, h * 0.38);
  g.bezierCurveTo(w * 0.15, h * 0.46, w * 0.85, h * 0.54, w * 0.3, h * 0.62);
  g.bezierCurveTo(w * 0.75, h * 0.68, w * 0.25, h * 0.76, w * 0.6, h * 0.82);
  g.lineTo(w * 0.45, h * 0.92);
  g.stroke();
  // 三清印
  g.lineWidth = w * 0.025;
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(w * (0.3 + i * 0.2), h * 0.44, w * 0.06, 0, Math.PI * 2); g.stroke(); }
  if (withGlow) {
    g.globalCompositeOperation = 'lighter';
    radial(g, w / 2, h / 2, h * 0.6, 'rgba(255,200,80,.25)', 'rgba(255,200,80,0)');
    g.globalCompositeOperation = 'source-over';
  }
}

// 补子：仙鹤祥云
function drawCrane(g, w, h) {
  g.fillStyle = '#1b2233'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#d9b24c'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
  g.strokeStyle = '#8a6a22'; g.lineWidth = 3; g.strokeRect(18, 18, w - 36, h - 36);
  // 海水
  const waveC = ['#2d6fa8', '#e8e0c8', '#3aa0a0'];
  for (let r = 0; r < 4; r++) {
    g.strokeStyle = waveC[r % 3]; g.lineWidth = 4;
    for (let x = 24; x < w - 24; x += 22) { g.beginPath(); g.arc(x + 11, h - 40 - r * 9, 10, Math.PI, 0); g.stroke(); }
  }
  // 太阳
  radial(g, w * 0.75, h * 0.25, 22, '#ff5a2a', 'rgba(255,90,42,0.1)');
  // 祥云
  g.strokeStyle = '#6cc0d8'; g.lineWidth = 4;
  for (const [x, y] of [[60, 60], [190, 110], [80, 150]]) {
    g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 1.6); g.arc(x + 16, y - 4, 8, Math.PI, Math.PI * 2.6); g.stroke();
  }
  // 仙鹤
  g.fillStyle = '#f5f2ea';
  g.beginPath(); g.ellipse(w * 0.45, h * 0.5, 38, 18, -0.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(w * 0.35, h * 0.5); g.quadraticCurveTo(w * 0.1, h * 0.25, w * 0.2, h * 0.35); g.quadraticCurveTo(w * 0.35, h * 0.35, w * 0.5, h * 0.48); g.fill();
  g.beginPath(); g.moveTo(w * 0.55, h * 0.45); g.quadraticCurveTo(w * 0.9, h * 0.2, w * 0.85, h * 0.4); g.quadraticCurveTo(w * 0.7, h * 0.5, w * 0.55, h * 0.52); g.fill();
  g.strokeStyle = '#f5f2ea'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(w * 0.36, h * 0.56); g.quadraticCurveTo(w * 0.22, h * 0.62, w * 0.2, h * 0.75); g.stroke();
  ellipse(g, w * 0.19, h * 0.77, 6, 5); g.fillStyle = '#d42020'; g.fill();
  g.strokeStyle = '#222'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(w * 0.5, h * 0.6); g.lineTo(w * 0.52, h * 0.78); g.moveTo(w * 0.46, h * 0.6); g.lineTo(w * 0.42, h * 0.77); g.stroke();
}

function drawSun(g, w, h) {
  g.fillStyle = '#3a1608'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#e0a040'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
  radial(g, w / 2, h / 2, 70, '#ffcc40', 'rgba(200,80,20,0.2)');
  g.strokeStyle = '#ffb030'; g.lineWidth = 5;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 44, h / 2 + Math.sin(a) * 44);
    g.lineTo(w / 2 + Math.cos(a + 0.1) * 100, h / 2 + Math.sin(a + 0.1) * 100); g.stroke();
  }
  g.fillStyle = '#8a1a08';
  g.beginPath(); g.arc(w / 2, h / 2, 28, 0, Math.PI * 2); g.fill();
}

function drawBagua(g, w, h) {
  g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, R = w * 0.46;
  g.fillStyle = '#1a1208';
  g.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
  g.closePath(); g.fill();
  g.strokeStyle = '#e6c25a'; g.lineWidth = 5; g.stroke();
  // 卦爻
  const tri = ['111', '110', '101', '100', '011', '010', '001', '000'];
  g.fillStyle = '#e6c25a';
  for (let i = 0; i < 8; i++) {
    g.save(); g.translate(cx, cy); g.rotate((i / 8) * Math.PI * 2);
    for (let k = 0; k < 3; k++) {
      const y = -R * 0.86 + k * 12, bw = R * 0.5;
      if (tri[i][k] === '1') g.fillRect(-bw / 2, y, bw, 7);
      else { g.fillRect(-bw / 2, y, bw * 0.42, 7); g.fillRect(bw * 0.08, y, bw * 0.42, 7); }
    }
    g.restore();
  }
  // 太极
  const r = R * 0.42;
  g.fillStyle = '#f2ead8'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#111';
  g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2); g.arc(cx, cy + r / 2, r / 2, Math.PI / 2, -Math.PI / 2, true); g.arc(cx, cy - r / 2, r / 2, Math.PI / 2, -Math.PI / 2); g.fill();
  g.fillStyle = '#f2ead8'; g.beginPath(); g.arc(cx, cy + r / 2, r / 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#111'; g.beginPath(); g.arc(cx, cy - r / 2, r / 7, 0, Math.PI * 2); g.fill();
}

// 海水江崖（袍摆纹带）
function drawWaves(g, w, h, rep = 6) {
  g.clearRect(0, 0, w, h);
  const seg = w / rep;
  const cols = ['#3c6fa0', '#f4ecd8', '#2f8f8a', '#c89a3a', '#6a4a8a'];
  for (let r = 0; r < 5; r++) {
    const y0 = h * 0.62 + r * (h * 0.075);
    g.strokeStyle = cols[r % cols.length]; g.lineWidth = h * 0.05;
    for (let x = 0; x < w; x += seg / 5) { g.beginPath(); g.arc(x + seg / 10, y0, seg / 10, Math.PI, 0); g.stroke(); }
  }
  // 竖立水脚
  for (let i = 0; i < rep * 6; i++) {
    const x = (i / (rep * 6)) * w;
    g.strokeStyle = cols[i % 3]; g.lineWidth = w / (rep * 6) * 0.35;
    g.beginPath(); g.moveTo(x, h); g.lineTo(x + w / (rep * 12), h * 0.95); g.stroke();
  }
  // 江崖山石
  for (let i = 0; i < rep; i++) {
    const x = (i + 0.5) * seg;
    g.fillStyle = '#c89a3a';
    g.beginPath(); g.moveTo(x - seg * 0.12, h * 0.62); g.lineTo(x, h * 0.2); g.lineTo(x + seg * 0.12, h * 0.62); g.fill();
    g.fillStyle = '#2f6f9a';
    g.beginPath(); g.moveTo(x - seg * 0.06, h * 0.62); g.lineTo(x, h * 0.36); g.lineTo(x + seg * 0.06, h * 0.62); g.fill();
    // 浪花卷云
    g.strokeStyle = '#f4ecd8'; g.lineWidth = 3;
    for (const s of [-1, 1]) { g.beginPath(); g.arc(x + s * seg * 0.25, h * 0.45, seg * 0.07, 0, Math.PI * 1.5); g.stroke(); }
  }
  // 上缘金线
  g.fillStyle = '#d9b24c'; g.fillRect(0, 0, w, h * 0.06);
}

function drawCuff(g, w, h) {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d9b24c'; g.fillRect(0, 0, w, h * 0.12); g.fillRect(0, h * 0.88, w, h * 0.12);
  g.strokeStyle = '#4a7ab0'; g.lineWidth = 3;
  for (let x = 0; x < w; x += 32) {
    g.beginPath(); g.arc(x + 16, h / 2, h * 0.24, 0, Math.PI * 1.6); g.stroke();
    g.beginPath(); g.moveTo(x, h / 2); g.lineTo(x + 32, h / 2); g.stroke();
  }
}

// 纸扎衣料
function drawPaper(g, w, h) {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  const cols = ['#d8263a', '#f0c030', '#2a9a5a', '#3060c0'];
  for (let x = 0; x < w; x += 24) {
    g.fillStyle = cols[(x / 24) % 4];
    g.beginPath(); g.moveTo(x, h); g.lineTo(x + 12, h * 0.3); g.lineTo(x + 24, h); g.fill();
    g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(x + 10, 4, 4, 8);
  }
}

// 高帽文字（白无常「一见生财」/ 黑无常「天下太平」）
function drawHatText(g, w, h, text, fg, bg) {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${Math.round(w * 0.62)}px "KaiTi","STKaiti","SimSun",serif`;
  const chars = text.split('');
  const step = (h * 0.92) / chars.length;
  chars.forEach((c, i) => g.fillText(c, w / 2, h * 0.06 + step * (i + 0.5)));
}

function drawGold(g, w, h) {
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, '#fff2c0'); gr.addColorStop(0.5, '#d8a840'); gr.addColorStop(1, '#8a5a18');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}

function drawFlame(g, w, h) {
  g.clearRect(0, 0, w, h);
  const gr = g.createRadialGradient(w / 2, h * 0.72, 4, w / 2, h * 0.6, h * 0.55);
  gr.addColorStop(0, 'rgba(255,255,220,1)');
  gr.addColorStop(0.3, 'rgba(255,200,80,.95)');
  gr.addColorStop(0.65, 'rgba(255,90,20,.6)');
  gr.addColorStop(1, 'rgba(255,40,0,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(w / 2, 0);
  g.bezierCurveTo(w * 0.9, h * 0.45, w, h * 0.8, w / 2, h);
  g.bezierCurveTo(0, h * 0.8, w * 0.1, h * 0.45, w / 2, 0);
  g.fill();
}

function drawPlaque(g, w, h) {
  g.fillStyle = '#1a0d06'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#d4a840'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = '#e8c860'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 64px "KaiTi","STKaiti","SimSun",serif';
  g.fillText('令', w / 2, h / 2 + 4);
}

let _atlas = null;
export function getAtlas() {
  if (_atlas) return _atlas;
  const cv = document.createElement('canvas');
  cv.width = cv.height = ATLAS_SIZE;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  const inRegion = (r, fn) => { g.save(); g.translate(r[0], r[1]); g.beginPath(); g.rect(0, 0, r[2], r[3]); g.clip(); fn(g, r[2], r[3]); g.restore(); };
  for (let i = 0; i < 8; i++) inRegion(REGION.face(i), (gg) => drawFace(gg, i));
  inRegion(REGION.talisman, (gg, w, h) => drawTalisman(gg, w, h));
  inRegion(REGION.crane, drawCrane);
  inRegion(REGION.bagua, drawBagua);
  inRegion(REGION.sun, drawSun);
  inRegion(REGION.hatWhite, (gg, w, h) => drawHatText(gg, w, h, '一見生財', '#1a1a1a', '#f4f2ec'));
  inRegion(REGION.hatBlack, (gg, w, h) => drawHatText(gg, w, h, '天下太平', '#f0e8d8', '#16161a'));
  inRegion(REGION.waves, drawWaves);
  inRegion(REGION.cuff, drawCuff);
  inRegion(REGION.paper, drawPaper);
  inRegion(REGION.gold, drawGold);
  inRegion(REGION.flame, drawFlame);
  inRegion(REGION.plaque, drawPlaque);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  _atlas = tex;
  _atlas.userData.canvas = cv;
  return tex;
}

// 暗花锦缎（灰度，接近白，乘以顶点色）
let _damask = null;
export function getDamask() {
  if (_damask) return _damask;
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, S, S);
  // 织物经纬
  for (let y = 0; y < S; y += 2) { g.fillStyle = `rgba(0,0,0,${0.03 + ((y / 2) % 2) * 0.03})`; g.fillRect(0, y, S, 1); }
  for (let x = 0; x < S; x += 3) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x, 0, 1, S); }
  // 团花祥云纹（平铺四方连续）
  const motif = (x, y, s) => {
    g.strokeStyle = 'rgba(40,40,40,0.22)'; g.lineWidth = 3;
    g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(x, y, s * 0.55, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.beginPath(); g.arc(x + Math.cos(a) * s * 0.78, y + Math.sin(a) * s * 0.78, s * 0.22, a, a + Math.PI * 1.4); g.stroke();
    }
  };
  for (const [x, y] of [[64, 64], [192, 192], [192, 64 - 256], [64, 192 - 256]]) {
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) motif(x + ox, y + oy + (y < 0 ? 256 : 0), 34);
  }
  const cloud = (x, y) => {
    g.strokeStyle = 'rgba(40,40,40,0.16)'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(x, y, 9, Math.PI * 0.2, Math.PI * 1.8); g.stroke();
    g.beginPath(); g.arc(x + 14, y - 3, 7, Math.PI, Math.PI * 2.7); g.stroke();
  };
  for (const [x, y] of [[192, 64], [64, 192], [0, 0], [128, 128]]) cloud(x, y);
  // 做旧斑驳
  const R = rand(3);
  for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(0,0,0,${R() * 0.06})`; g.fillRect(R() * S, R() * S, 1 + R() * 4, 1 + R() * 4); }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  _damask = tex;
  return tex;
}

// 通用工具：画布纹理
export function canvasTexture(w, h, draw, repeatX = 1, repeatY = 1, srgb = true) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.userData.canvas = cv;
  return tex;
}

// 由高度画布生成法线贴图（Sobel）
export function normalFromHeight(srcCanvas, strength = 2, repeatX = 1, repeatY = 1) {
  const w = srcCanvas.width, h = srcCanvas.height;
  const src = srcCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const out = g.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const nz = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * w + x) * 4;
      out.data[i] = (-dx * nz * 0.5 + 0.5) * 255;
      out.data[i + 1] = (dy * nz * 0.5 + 0.5) * 255;
      out.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  return tex;
}

export function talismanTexture(w = 64, h = 160, glow = false) {
  return canvasTexture(w, h, (g) => drawTalisman(g, w, h, glow), 1, 1);
}

export function flameTexture() {
  return canvasTexture(128, 256, (g, w, h) => drawFlame(g, w, h));
}

export function softDotTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return canvasTexture(64, 64, (g) => radial(g, 32, 32, 32, inner, outer));
}

export function baguaTexture() {
  return canvasTexture(256, 256, (g, w, h) => drawBagua(g, w, h));
}
