import { CAST } from './story.js';
import { getAtlas, REGION, FACE } from './gfx/textures.js';
import { Audio } from './audio.js';

// =====================================================================
//  对白系统：阻塞式剧情对白（立绘 + 打字机 + 角色嗓音）与非阻塞战斗字幕
//  立绘由角色脸谱图集程序绘制：水墨底 + 脸谱 + 发冠剪影 + 朱印
// =====================================================================

const $ = (id) => document.getElementById(id);

const PORTRAIT = {
  priest: { face: FACE.priest, skin: '#e0b896', hat: 'priest', robe: '#d89a2a' },
  master: { face: FACE.master, skin: '#d8b494', hat: 'master', robe: '#1e2a44' },
  sorcerer: { face: FACE.sorcerer, skin: '#d4d0cc', hat: 'sorcerer', robe: '#141018' },
  wuWhite: { face: FACE.wuWhite, skin: '#f4f2f0', hat: 'tallWhite', robe: '#e8e6e0' },
  wuBlack: { face: FACE.wuBlack, skin: '#3a3840', hat: 'tallBlack', robe: '#121216' },
  villager: { face: FACE.paper, skin: '#f0d8c0', hat: 'buns', robe: '#a83040', girl: true },
};

const _cache = {};
function portrait(key) {
  if (_cache[key]) return _cache[key];
  const P = PORTRAIT[key];
  const cv = document.createElement('canvas');
  cv.width = cv.height = 200;
  const g = cv.getContext('2d');
  // 水墨晕染底
  const bg = g.createRadialGradient(100, 96, 10, 100, 100, 100);
  bg.addColorStop(0, 'rgba(70,52,38,0.95)'); bg.addColorStop(0.7, 'rgba(26,18,14,0.95)'); bg.addColorStop(1, 'rgba(10,8,6,0)');
  g.fillStyle = bg; g.beginPath(); g.arc(100, 100, 100, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.beginPath(); g.arc(Math.random() * 200, Math.random() * 200, 6 + Math.random() * 24, 0, Math.PI * 2); g.fill(); }
  if (!P) { _cache[key] = cv; return cv; }
  // 衣领
  g.fillStyle = P.robe;
  g.beginPath(); g.moveTo(28, 200); g.quadraticCurveTo(40, 150, 100, 146); g.quadraticCurveTo(160, 150, 172, 200); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(84, 150); g.lineTo(108, 200); g.moveTo(118, 150); g.lineTo(92, 182); g.stroke();
  // 脖颈
  g.fillStyle = P.skin; g.fillRect(84, 128, 32, 26);
  // 脸谱（取图集中的脸部区域，椭圆裁切，乘以肤色）
  const atlas = getAtlas().userData.canvas;
  const [rx, ry] = REGION.face(P.face);
  g.save();
  g.beginPath(); g.ellipse(100, 98, 46, 58, 0, 0, Math.PI * 2); g.clip();
  g.drawImage(atlas, rx + 36, ry + 30, 184, 210, 54, 40, 92, 116);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = P.skin; g.fillRect(50, 36, 100, 124);
  g.globalCompositeOperation = 'source-over';
  const sh = g.createRadialGradient(100, 90, 20, 100, 98, 60);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = sh; g.fillRect(50, 36, 100, 124);
  g.restore();
  // 发冠 / 帽子剪影
  const hat = P.hat;
  if (hat === 'priest') {
    g.fillStyle = '#121214';
    g.beginPath(); g.ellipse(100, 52, 48, 22, 0, Math.PI, 0); g.fill();
    g.fillRect(52, 50, 96, 10);
    g.fillStyle = '#e6c25a'; g.beginPath(); g.arc(100, 48, 7, 0, Math.PI * 2); g.fill();
  } else if (hat === 'master' || hat === 'sorcerer') {
    const hair = hat === 'master' ? '#cac8c2' : '#ecebe6';
    g.fillStyle = hair;
    g.beginPath(); g.ellipse(100, 58, 50, 28, 0, Math.PI, 0); g.fill();
    g.beginPath(); g.arc(100, 26, 14, 0, Math.PI * 2); g.fill();
    if (hat === 'master') { g.strokeStyle = '#c8a040'; g.lineWidth = 4; g.beginPath(); g.arc(100, 20, 10, Math.PI * 0.9, Math.PI * 2.1); g.stroke(); }
    else { g.fillStyle = '#101014'; g.fillRect(90, 6, 20, 16); g.fillStyle = '#a040ff'; g.beginPath(); g.arc(100, 12, 4, 0, Math.PI * 2); g.fill(); }
    if (hat === 'sorcerer') { g.fillStyle = hair; g.fillRect(50, 58, 10, 90); g.fillRect(140, 58, 10, 90); }
  } else if (hat === 'tallWhite' || hat === 'tallBlack') {
    g.fillStyle = hat === 'tallWhite' ? '#f2f0ea' : '#151518';
    g.beginPath(); g.moveTo(54, 58); g.lineTo(70, -10); g.lineTo(130, -10); g.lineTo(146, 58); g.closePath(); g.fill();
    g.fillStyle = hat === 'tallWhite' ? '#1a1a1a' : '#f0e8d8';
    g.font = 'bold 18px "KaiTi","SimSun",serif'; g.textAlign = 'center';
    const txt = hat === 'tallWhite' ? '一见生财' : '天下太平';
    for (let i = 0; i < 2; i++) g.fillText(txt[i], 100, 20 + i * 20);
  } else if (hat === 'buns') {
    g.fillStyle = '#141010';
    g.beginPath(); g.ellipse(100, 60, 50, 26, 0, Math.PI, 0); g.fill();
    for (const s of [-1, 1]) { g.beginPath(); g.arc(100 + s * 38, 40, 14, 0, Math.PI * 2); g.fill(); g.fillStyle = '#c02030'; g.fillRect(100 + s * 38 - 8, 50, 16, 4); g.fillStyle = '#141010'; }
  }
  // 朱印
  g.save(); g.translate(166, 168); g.rotate(-0.1);
  g.fillStyle = '#b8161a'; g.fillRect(-16, -16, 32, 32);
  g.fillStyle = '#f8e8d0'; g.font = 'bold 22px "Ma Shan Zheng","KaiTi",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText({ priest: '真', master: '清', sorcerer: '阴', wuWhite: '谢', wuBlack: '范', villager: '秀' }[key] || '', 0, 1);
  g.restore();
  _cache[key] = cv;
  return cv;
}

export class Dialogue {
  constructor() {
    this.box = $('dialogue');
    this.portraitEl = $('dlg-portrait');
    this.pctx = this.portraitEl.getContext('2d');
    this.nameEl = $('dlg-name');
    this.titleEl = $('dlg-title');
    this.textEl = $('dlg-text');
    this.nextEl = $('dlg-next');
    this.subEl = $('subtitle');
    this.lines = null;
    this.i = 0;
    this.shown = 0;
    this.full = '';
    this.onLine = null;
    this.barks = [];
    this.barkT = 0;
    this.cps = 34;
    this.box.addEventListener('click', () => this.advance());
  }

  get active() { return !!this.lines; }

  // 阻塞式对白
  play(lines, { onDone = null, onLine = null, auto = false } = {}) {
    this.lines = lines;
    this.i = -1;
    this.onDone = onDone;
    this.onLine = onLine;
    this.auto = auto;
    this.box.classList.remove('hidden');
    requestAnimationFrame(() => this.box.classList.add('on'));
    this._next();
  }

  _next() {
    this.i++;
    if (!this.lines || this.i >= this.lines.length) { this.close(); return; }
    const L = this.lines[this.i];
    const C = CAST[L.who] || CAST.narrator;
    this.box.classList.toggle('narr', !C.name);
    this.nameEl.textContent = C.name;
    this.nameEl.style.color = C.color;
    this.titleEl.textContent = C.title;
    this.pctx.clearRect(0, 0, 200, 200);
    if (C.portrait) this.pctx.drawImage(portrait(C.portrait), 0, 0);
    this.portraitEl.style.display = C.portrait ? '' : 'none';
    this.full = L.text;
    this.shown = 0;
    this.textEl.textContent = '';
    this.voice = C.voice;
    this.lineT = 0;
    this.nextEl.style.opacity = '0';
    this.onLine?.(L, this.i);
  }

  advance() {
    if (!this.lines) return;
    if (this.shown < this.full.length) { this.shown = this.full.length; this.textEl.textContent = this.full; return; }
    Audio.uiClick();
    this._next();
  }

  skip() {
    if (!this.lines) return;
    const rest = this.lines.slice(this.i + 1);
    for (const L of rest) this.onLine?.(L, -1);
    this.close();
  }

  close() {
    if (!this.lines) return;
    this.lines = null;
    this.box.classList.remove('on');
    setTimeout(() => { if (!this.lines) this.box.classList.add('hidden'); }, 260);
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }

  // 非阻塞字幕（战斗中的台词）
  bark(who, text, dur = 4) {
    if (this.barks.length > 2) this.barks.shift();
    this.barks.push({ who, text, dur });
    if (!this.cur) this._nextBark();
  }

  _nextBark() {
    const b = this.barks.shift();
    this.cur = b || null;
    if (!b) { this.subEl.classList.remove('on'); return; }
    const C = CAST[b.who] || CAST.narrator;
    this.subEl.innerHTML = `${C.name ? `<b style="color:${C.color}">${C.name}</b>` : ''}<span>${b.text}</span>`;
    this.subEl.classList.add('on');
    this.barkT = b.dur + b.text.length * 0.06;
    for (let k = 0; k < Math.min(8, b.text.length / 2); k++) setTimeout(() => Audio.voice(C.voice), k * 70);
  }

  clearBarks() { this.barks.length = 0; this.cur = null; this.subEl.classList.remove('on'); }

  update(dt) {
    if (this.lines && this.shown < this.full.length) {
      const before = Math.floor(this.shown);
      this.shown = Math.min(this.full.length, this.shown + dt * this.cps);
      const now = Math.floor(this.shown);
      if (now > before) {
        this.textEl.textContent = this.full.slice(0, now);
        const ch = this.full[now - 1];
        if (now % 2 === 0 && !'，。！？…—（）、'.includes(ch)) Audio.voice(this.voice);
      }
    } else if (this.lines) {
      this.nextEl.style.opacity = '1';
      if (this.auto) { this.lineT += dt; if (this.lineT > 1.6 + this.full.length * 0.05) this._next(); }
    }
    if (this.cur) {
      this.barkT -= dt;
      if (this.barkT <= 0) this._nextBark();
    }
  }
}

export { portrait };
