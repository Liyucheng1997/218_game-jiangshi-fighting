import * as THREE from 'three';
import { AFFIXES } from './data.js';

const $ = (id) => document.getElementById(id);
const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const _p = new THREE.Vector3();
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

// DOM HUD：经验条、血条、道术栏、雷达、首领血条与破绽、伤害飘字、连斩、闭气、精英标签、受击方向……
export class HUD {
  constructor() {
    this.root = $('hud');
    this.el = {};
    for (const id of ['xp-fill', 'lv-num', 'ch-name', 'wave-line', 'wave-fill', 'kills', 'gold', 'timer', 'bosses', 'feed', 'crosshair', 'hitm', 'dmgs',
      'hp-num', 'hp-fill', 'hp-lag', 'shield', 'skills', 'ab-fu', 'ab-fu-n', 'ab-ult', 'ab-dash', 'wp-name', 'ammo', 'reload', 'slots', 'banner', 'toast', 'lowhp', 'burn', 'radar',
      'objective', 'diff-tag', 'combo', 'breath', 'elabels', 'dmgdir', 'stealth', 'perfect']) {
      this.el[id] = $(id);
    }
    this.radarCtx = this.el.radar.getContext('2d');
    this.dmgPool = [];
    this.dmgActive = [];
    this._cache = {};
    this._bossEls = [];
    this.showNumbers = true;
    this.labelPool = [];
    this.dirEls = [];
    for (let i = 0; i < 4; i++) { const d = document.createElement('div'); d.className = 'ddir'; this.el.dmgdir.appendChild(d); this.dirEls.push({ el: d, t: 0, ang: 0 }); }
    this.comboEls = { g: this.el.combo.querySelector('.cg'), n: this.el.combo.querySelector('.cn'), t: this.el.combo.querySelector('.ct i') };
    this.breathFill = this.el.breath.querySelector('i');
  }

  show() { this.root.classList.add('on'); }
  hide() { this.root.classList.remove('on'); this.setCine(false); }
  setCine(v) { this.root.classList.toggle('cine', v); }

  _set(key, val, fn) { if (this._cache[key] !== val) { this._cache[key] = val; fn(val); } }

  xp(level, xp, need) {
    this._set('lv', level, (v) => { this.el['lv-num'].textContent = v; });
    this._set('xpw', Math.round((xp / need) * 1000), (v) => { this.el['xp-fill'].style.width = v / 10 + '%'; });
  }

  chapter(name, line, prog) {
    this._set('chn', name, (v) => { this.el['ch-name'].textContent = v; });
    this._set('wl', line, (v) => { this.el['wave-line'].textContent = v; });
    this._set('wf', Math.round(prog * 200), (v) => { this.el['wave-fill'].style.width = v / 2 + '%'; });
  }

  objective(text) { this._set('obj', text, (v) => { this.el.objective.textContent = v; this.el.objective.style.display = v ? '' : 'none'; }); }
  difficulty(text) { this._set('dt', text, (v) => { this.el['diff-tag'].textContent = v; }); }

  stats(kills, gold, time) {
    this._set('k', kills, (v) => { this.el.kills.textContent = v; });
    this._set('g', gold, (v) => { this.el.gold.textContent = v; });
    this._set('t', Math.floor(time), () => { this.el.timer.textContent = fmt(time); });
  }

  hp(hp, max) {
    const w = Math.max(0, hp / max) * 100;
    this._set('hp', Math.ceil(hp) + '/' + max, () => {
      this.el['hp-num'].textContent = Math.ceil(hp);
      this.el['hp-fill'].style.width = w + '%';
      this.el['hp-lag'].style.width = w + '%';
    });
    this._set('low', hp / max < 0.3, (v) => this.el.lowhp.classList.toggle('on', v));
  }

  shield(n) { this._set('sh', n, (v) => { this.el.shield.innerHTML = '<span></span>'.repeat(v); }); }

  skills(list) {
    const key = list.map((s) => `${s.id}${s.level}${s.evo ? 'e' : ''}`).join(',');
    if (this._cache.sk !== key) {
      this._cache.sk = key;
      this.el.skills.innerHTML = list.map((s) => `<div class="sk ${s.kind === 'passive' ? 'p' : s.kind === 'relic' ? 'p r' : ''} ${s.evo ? 'evo' : ''}" title="${s.name}">${s.icon}${s.kind === 'art' ? '<div class="cdm"></div>' : ''}${s.level ? `<span class="lvl">${s.level}</span>` : ''}</div>`).join('');
      this._skEls = [...this.el.skills.querySelectorAll('.sk')];
    }
    list.forEach((s, i) => {
      if (s.kind !== 'art' || !this._skEls[i]) return;
      const m = this._skEls[i].querySelector('.cdm');
      const k = s.cdMax > 0 ? Math.max(0, Math.min(1, s.cd / s.cdMax)) : 0;
      m.style.height = (k * 100).toFixed(0) + '%';
    });
  }

  abilities(fuCd, fuMax, fuN, ult, dashCd, dashMax) {
    const fk = fuCd > 0 ? fuCd / fuMax : 0;
    this.el['ab-fu'].querySelector('.cdm').style.height = (fk * 100).toFixed(0) + '%';
    this.el['ab-fu'].classList.toggle('ready', fk <= 0);
    this._set('fun', fuN, (v) => { this.el['ab-fu-n'].textContent = v > 1 ? '×' + v : ''; });
    this.el['ab-ult'].querySelector('.cdm').style.height = (100 - ult).toFixed(0) + '%';
    this.el['ab-ult'].classList.toggle('ready', ult >= 100);
    const dk = dashCd / dashMax;
    this.el['ab-dash'].querySelector('.cdm').style.height = (dk * 100).toFixed(0) + '%';
    this.el['ab-dash'].classList.toggle('ready', dk <= 0);
  }

  weapon(def, ammo, reloading, owned, current) {
    this._set('wn', def.name, (v) => { this.el['wp-name'].textContent = v; });
    const a = def.melee ? '∞' : `${ammo.mag}<small> / ${def.mag}</small>`;
    this._set('am', a, (v) => { this.el.ammo.innerHTML = v; });
    this._set('ame', !def.melee && ammo.mag === 0, (v) => this.el.ammo.classList.toggle('empty', v));
    this._set('rl', reloading, (v) => { this.el.reload.textContent = v ? '换弹中……' : ''; });
    const names = { mauser: '驳壳', thompson: '汤姆逊', ak47: 'AK', shotgun: '猎枪', gatling: '加特林', sword: '桃木剑' };
    const key = owned.join(',') + current;
    this._set('sl', key, () => { this.el.slots.innerHTML = owned.map((w, i) => `<span class="${w === current ? 'on' : ''}">${i + 1} ${names[w]}</span>`).join(''); });
  }

  crosshair(spread) {
    const s = Math.round(spread * 400);
    this._set('ch', s, (v) => {
      const c = this.el.crosshair;
      c.style.width = c.style.height = 30 + v + 'px';
    });
  }

  hit(head, kill, blocked = false) {
    const h = this.el.hitm;
    h.className = blocked ? 'block' : head ? 'head' : kill ? 'kill' : '';
    h.style.opacity = '1';
    clearTimeout(this._hitT);
    this._hitT = setTimeout(() => { h.style.opacity = '0'; }, 110);
  }

  // ---------------- 闭气 / 连斩 / 完美闪避
  breath(k, holding, locked) {
    const on = holding || k < 0.999 || locked;
    this._set('bon', on, (v) => this.el.breath.classList.toggle('on', v));
    this._set('blk', locked, (v) => this.el.breath.classList.toggle('lock', v));
    this._set('bk', Math.round(k * 100), (v) => { this.breathFill.style.width = v + '%'; });
    this._set('stl', holding, (v) => this.el.stealth.classList.toggle('on', v));
  }

  combo(n, timerK, grade) {
    this._set('con', n >= 3, (v) => this.el.combo.classList.toggle('on', v));
    if (n < 3) return;
    this._set('cn', n, (v) => {
      this.comboEls.n.textContent = v;
      this.el.combo.classList.add('bump');
      clearTimeout(this._cbT);
      this._cbT = setTimeout(() => this.el.combo.classList.remove('bump'), 90);
    });
    this._set('cg', grade, (v) => { this.comboEls.g.textContent = v; });
    this.comboEls.t.style.width = (timerK * 100).toFixed(0) + '%';
  }

  perfect() {
    const p = this.el.perfect;
    p.classList.add('on');
    clearTimeout(this._pfT);
    this._pfT = setTimeout(() => p.classList.remove('on'), 900);
  }

  // 受击方向（屏幕边缘红弧）
  damageDir(fromPos, camera) {
    if (!fromPos) return;
    const cam = camera.position;
    const fwd = _p.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const yawCam = Math.atan2(fwd.x, fwd.z);
    const yawHit = Math.atan2(fromPos.x - cam.x, fromPos.z - cam.z);
    const ang = -(yawHit - yawCam);
    const slot = this.dirEls.reduce((a, b) => (a.t < b.t ? a : b));
    slot.t = performance.now();
    slot.el.style.transform = `rotate(${ang}rad)`;
    slot.el.style.transition = 'none';
    slot.el.style.opacity = '1';
    void slot.el.offsetWidth;
    slot.el.style.transition = 'opacity .9s';
    slot.el.style.opacity = '0';
  }

  // ---------------- 伤害飘字
  damageNumber(pos, text, cls = '') {
    if (!this.showNumbers && cls !== 'player' && cls !== 'heal') return;
    let el = this.dmgPool.pop();
    if (!el) { el = document.createElement('div'); this.el.dmgs.appendChild(el); }
    el.className = 'dn ' + cls;
    el.textContent = text;
    el.style.display = 'block';
    this.dmgActive.push({ el, pos: pos.clone(), t: 0, vx: (Math.random() - 0.5) * 30 });
    if (this.dmgActive.length > 60) { const o = this.dmgActive.shift(); o.el.style.display = 'none'; this.dmgPool.push(o.el); }
  }

  updateDamageNumbers(dt, camera) {
    const W = innerWidth, H = innerHeight;
    for (let i = this.dmgActive.length - 1; i >= 0; i--) {
      const d = this.dmgActive[i];
      d.t += dt;
      if (d.t > 0.85) { d.el.style.display = 'none'; this.dmgPool.push(d.el); this.dmgActive.splice(i, 1); continue; }
      _p.copy(d.pos); _p.y += d.t * 1.2;
      _p.project(camera);
      if (_p.z > 1) { d.el.style.opacity = 0; continue; }
      const x = (_p.x * 0.5 + 0.5) * W + d.vx * d.t, y = (-_p.y * 0.5 + 0.5) * H;
      const sc = d.t < 0.1 ? 0.6 + d.t * 6 : 1.2 - Math.min(0.4, d.t * 0.4);
      d.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) scale(${sc.toFixed(2)})`;
      d.el.style.opacity = d.t > 0.55 ? ((0.85 - d.t) / 0.3).toFixed(2) : 1;
    }
  }

  clearDamageNumbers() { for (const d of this.dmgActive) { d.el.style.display = 'none'; this.dmgPool.push(d.el); } this.dmgActive.length = 0; }

  // ---------------- 精英标签（头顶词缀 + 血条）
  eliteLabels(enemies, camera) {
    const W = innerWidth, H = innerHeight;
    let n = 0;
    for (const e of enemies) {
      if (!e.alive || e.dying || !e.elite || e.spawnT > 0.3) continue;
      _p.copy(e.headPos); _p.y += 0.45 * e.scale;
      const dist = _p.distanceTo(camera.position);
      if (dist > 30) continue;
      _p.project(camera);
      if (_p.z > 1 || Math.abs(_p.x) > 1.1 || Math.abs(_p.y) > 1.1) continue;
      let L = this.labelPool[n];
      if (!L) {
        const el = document.createElement('div');
        el.className = 'el';
        el.innerHTML = '<span></span><i><b></b></i>';
        this.el.elabels.appendChild(el);
        L = this.labelPool[n] = { el, span: el.querySelector('span'), bar: el.querySelector('i'), fill: el.querySelector('b'), key: '' };
      }
      n++;
      if (L.key !== e.label) { L.key = e.label; L.span.textContent = e.label; L.el.style.color = hex(AFFIXES[e.affixes[0]]?.color ?? 0xffc080); }
      L.el.style.display = 'block';
      L.el.style.transform = `translate(${((_p.x * 0.5 + 0.5) * W).toFixed(0)}px,${((-_p.y * 0.5 + 0.5) * H).toFixed(0)}px) translate(-50%,-100%) scale(${Math.max(0.7, 1.25 - dist / 40).toFixed(2)})`;
      L.el.style.left = '0'; L.el.style.top = '0';
      const warded = e.ward > 0;
      L.bar.classList.toggle('w', warded);
      L.fill.style.width = ((warded ? e.ward / e.wardMax : e.hp / e.maxHp) * 100).toFixed(0) + '%';
    }
    for (let i = n; i < this.labelPool.length; i++) this.labelPool[i].el.style.display = 'none';
  }

  // ---------------- 首领血条（阶段刻度 + 破绽槽）
  setBosses(list) {
    this.el.bosses.innerHTML = '';
    this._bossEls = list.map((b) => {
      const d = document.createElement('div');
      d.className = 'boss';
      const ticks = (b.cfg.phases || []).map((p) => `<div class="tick" style="left:${(p * 100).toFixed(1)}%"></div>`).join('');
      d.innerHTML = `<div class="bn">${b.cfg.name} · ${b.cfg.title}</div><div class="bb"><div class="bl"></div><div class="bf"></div>${ticks}</div>${b.postureMax ? '<div class="bp"><div class="bpf"></div></div><div class="bpl">破 绽</div>' : ''}`;
      this.el.bosses.appendChild(d);
      return { b, fill: d.querySelector('.bf'), lag: d.querySelector('.bl'), post: d.querySelector('.bpf'), d };
    });
  }
  updateBosses() {
    for (const x of this._bossEls) {
      const k = Math.max(0, x.b.hp / x.b.maxHp);
      const w = (k * 100).toFixed(1) + '%';
      x.fill.style.width = w;
      x.lag.style.width = w;
      if (x.post) {
        const stag = x.b.staggerT > 0;
        x.d.classList.toggle('stag', stag);
        x.post.style.width = stag ? (Math.min(1, x.b.staggerT / 4.2) * 100).toFixed(0) + '%' : (Math.min(1, x.b.posture / x.b.postureMax) * 100).toFixed(0) + '%';
      }
      if (!x.b.alive || x.b.dying) x.d.style.opacity = '0.3';
    }
  }

  // ---------------- 雷达
  radar(ppos, yaw, enemies, pickups) {
    const g = this.radarCtx, R = 66, range = 30;
    g.clearRect(0, 0, 132, 132);
    g.save();
    g.translate(R, R);
    g.strokeStyle = 'rgba(232,194,106,.18)'; g.lineWidth = 1;
    g.beginPath(); g.arc(0, 0, R * 0.5, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(-R, 0); g.lineTo(R, 0); g.moveTo(0, -R); g.lineTo(0, R); g.stroke();
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const plot = (x, z, color, r) => {
      const dx = x - ppos.x, dz = z - ppos.z;
      const rx = dx * c - dz * s, rz = dx * s + dz * c;
      let px = rx / range * R, py = rz / range * R;
      const d = Math.hypot(px, py);
      if (d > R - 4) { px *= (R - 4) / d; py *= (R - 4) / d; r *= 0.7; }
      g.fillStyle = color; g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
    };
    for (const it of pickups) plot(it.obj.position.x, it.obj.position.z, it.kind === 'chest' ? '#ffd060' : it.kind === 'scroll' ? '#ffffff' : '#60ff90', 3.5);
    for (const e of enemies) {
      if (!e.alive || e.dying) continue;
      plot(e.root.position.x, e.root.position.z, e.boss ? '#ff3020' : e.elite ? '#ff9a40' : e.lost ? 'rgba(120,180,255,.7)' : 'rgba(255,90,70,.85)', e.boss ? 5 : 2.2);
    }
    g.fillStyle = '#ffe8b0';
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.closePath(); g.fill();
    g.restore();
  }

  // queue: 若当前有横幅在显示，则排队等它结束（残卷、成就之类不必抢占首领阶段 / 尸潮等紧急提示）
  banner(title, sub = '', dur = 2400, { queue = false } = {}) {
    if (queue && performance.now() < (this._bUntil || 0)) { (this._bQ ||= []).push([title, sub, dur]); return; }
    const b = this.el.banner;
    b.querySelector('.bt').textContent = title;
    b.querySelector('.bs').textContent = sub;
    b.style.opacity = '1';
    this._bUntil = performance.now() + dur;
    clearTimeout(this._bT);
    this._bT = setTimeout(() => {
      b.style.opacity = '0';
      // 出队放在真正显示时，被紧急横幅抢占也不会丢
      if (this._bQ?.length) this._bT = setTimeout(() => { const n = this._bQ.shift(); if (n) this.banner(...n); }, 500);
    }, dur);
  }

  toast(text, dur = 1800) {
    const t = this.el.toast;
    t.textContent = text;
    t.style.opacity = '1';
    clearTimeout(this._tT);
    this._tT = setTimeout(() => { t.style.opacity = '0'; }, dur);
  }

  feed(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    this.el.feed.prepend(d);
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
    setTimeout(() => d.remove(), 3500);
  }

  burn(v) { this._set('burn', v, (x) => { this.el.burn.style.opacity = x ? '1' : '0'; }); }
}
