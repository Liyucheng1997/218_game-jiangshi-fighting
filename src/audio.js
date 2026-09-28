// 程序化合成音效：无需外部音频资源
let ctx = null;
let out = null;       // 总输出（压缩器后）
let master = null;    // 音效总线
let music = null;     // 音乐总线
const vol = { sfx: 0.55, music: 0.35 };
const _last = {};

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(ctx.destination);
    out = comp;
    master = ctx.createGain();
    master.gain.value = vol.sfx;
    master.connect(out);
    music = ctx.createGain();
    music.gain.value = vol.music;
    music.connect(out);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// 同类音效节流，避免成群死亡时爆音
function throttle(key, ms) {
  const now = performance.now();
  if (_last[key] && now - _last[key] < ms) return false;
  _last[key] = now;
  return true;
}

function tone(type, f0, f1, dur, gain, delay = 0, bus = null) {
  const c = ensureCtx();
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus || master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, filterType, f0, f1, gain, delay = 0, q = 1) {
  const c = ensureCtx();
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const f = c.createBiquadFilter();
  f.type = filterType; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

function noiseBuffer(duration) {
  const c = ensureCtx();
  const len = Math.max(1, Math.floor(c.sampleRate * duration));
  const key = len;
  if (noiseBuffer.cache?.[key]) return noiseBuffer.cache[key];
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  (noiseBuffer.cache ||= {})[key] = buf;
  return buf;
}

export const Audio = {
  unlock() { ensureCtx(); },

  // 枪声：短促噪声爆裂 + 低频冲击
  gunshot(type = 'smg') {
    const c = ensureCtx();
    const t = c.currentTime;
    const cfg = {
      smg:     { dur: 0.12, freq: 900,  boomFreq: 110, gain: 0.55 },
      pistol:  { dur: 0.16, freq: 700,  boomFreq: 90,  gain: 0.7 },
      ak:      { dur: 0.17, freq: 550,  boomFreq: 75,  gain: 0.85 },
      gatling: { dur: 0.07, freq: 1300, boomFreq: 130, gain: 0.4 },
      shotgun: { dur: 0.32, freq: 380,  boomFreq: 55,  gain: 1.0 },
    }[type] || { dur: 0.12, freq: 900, boomFreq: 110, gain: 0.55 };

    const src = c.createBufferSource();
    src.buffer = noiseBuffer(cfg.dur);
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(cfg.freq * 4, t);
    filt.frequency.exponentialRampToValueAtTime(cfg.freq, t + cfg.dur);
    const g = c.createGain();
    g.gain.setValueAtTime(cfg.gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + cfg.dur);
    src.connect(filt).connect(g).connect(master);
    src.start(t);

    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(cfg.boomFreq, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.09);
    const og = c.createGain();
    og.gain.setValueAtTime(cfg.gain * 0.9, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(og).connect(master);
    osc.start(t); osc.stop(t + 0.12);

    // 霰弹枪追加超低频胸腔感
    if (type === 'shotgun') {
      const sub = c.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(52, t);
      sub.frequency.exponentialRampToValueAtTime(30, t + 0.25);
      const sg = c.createGain();
      sg.gain.setValueAtTime(0.8, t);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      sub.connect(sg).connect(master);
      sub.start(t); sub.stop(t + 0.3);
    }
  },

  // 加特林电机声（持续，随转速变化）
  setMinigunSpin(level) {
    const c = ensureCtx();
    if (level <= 0.02) {
      if (this._spinOsc) {
        this._spinGain.gain.setTargetAtTime(0, c.currentTime, 0.08);
        const osc = this._spinOsc;
        setTimeout(() => { try { osc.stop(); } catch (e) { /* 已停止 */ } }, 400);
        this._spinOsc = null;
        this._spinGain = null;
      }
      return;
    }
    if (!this._spinOsc) {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      const filt = c.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 500;
      const g = c.createGain();
      g.gain.value = 0;
      osc.connect(filt).connect(g).connect(master);
      osc.start();
      this._spinOsc = osc;
      this._spinGain = g;
    }
    this._spinOsc.frequency.setTargetAtTime(35 + level * 130, c.currentTime, 0.05);
    this._spinGain.gain.setTargetAtTime(0.03 + level * 0.09, c.currentTime, 0.05);
  },

  knifeSwing() {
    const c = ensureCtx();
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(0.18);
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(600, t);
    filt.frequency.exponentialRampToValueAtTime(2400, t + 0.15);
    filt.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(filt).connect(g).connect(master);
    src.start(t);
  },

  reload() {
    const c = ensureCtx();
    const click = (dt, f, gain = 0.25) => {
      const t = c.currentTime + dt;
      const osc = c.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.connect(g).connect(master);
      osc.start(t); osc.stop(t + 0.06);
    };
    click(0, 320); click(0.15, 220); click(0.55, 260); click(0.72, 420, 0.35);
  },

  dryFire() {
    const c = ensureCtx();
    const t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc.connect(g).connect(master);
    osc.start(t); osc.stop(t + 0.05);
  },

  // 击中反馈
  hitMarker(headshot = false) {
    if (!throttle('hit' + headshot, 35)) return;
    const c = ensureCtx();
    const t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(headshot ? 1500 : 1050, t);
    osc.frequency.exponentialRampToValueAtTime(headshot ? 900 : 700, t + 0.07);
    const g = c.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(g).connect(master);
    osc.start(t); osc.stop(t + 0.09);
  },

  // 僵尸低吼
  growl() {
    if (!throttle('growl', 400)) return;
    const c = ensureCtx();
    const t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    const base = 55 + Math.random() * 40;
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.linearRampToValueAtTime(base * 1.6, t + 0.25);
    osc.frequency.linearRampToValueAtTime(base * 0.8, t + 0.7);
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 400;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    // 颤音
    const lfo = c.createOscillator();
    lfo.frequency.value = 9 + Math.random() * 6;
    const lfoG = c.createGain();
    lfoG.gain.value = 14;
    lfo.connect(lfoG).connect(osc.frequency);
    osc.connect(filt).connect(g).connect(master);
    osc.start(t); osc.stop(t + 0.85);
    lfo.start(t); lfo.stop(t + 0.85);
  },

  zombieDie() {
    if (!throttle('die', 70)) return;
    const c = ensureCtx();
    const t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.6);
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 350;
    const g = c.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    osc.connect(filt).connect(g).connect(master);
    osc.start(t); osc.stop(t + 0.7);
  },

  playerHurt() {
    const c = ensureCtx();
    const t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.25);
    const g = c.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g).connect(master);
    osc.start(t); osc.stop(t + 0.32);
  },

  waveHorn() {
    const c = ensureCtx();
    const t = c.currentTime;
    [0, 0.02].forEach((off, i) => {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(i ? 98 : 65, t + off);
      const filt = c.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(900, t);
      filt.frequency.exponentialRampToValueAtTime(200, t + 1.4);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t + off);
      g.gain.exponentialRampToValueAtTime(0.25, t + off + 0.15);
      g.gain.setValueAtTime(0.25, t + off + 0.9);
      g.gain.exponentialRampToValueAtTime(0.001, t + off + 1.5);
      osc.connect(filt).connect(g).connect(master);
      osc.start(t + off); osc.stop(t + off + 1.6);
    });
  },

  footstep() {
    const c = ensureCtx();
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(0.05);
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 300;
    const g = c.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(filt).connect(g).connect(master);
    src.start(t);
  },

  setVolume(sfxV, musicV) {
    vol.sfx = sfxV; vol.music = musicV;
    if (master) { master.gain.value = sfxV; music.gain.value = musicV; }
  },

  thunder() {
    if (!throttle('thunder', 60)) return;
    noise(0.5, 'lowpass', 4000, 200, 0.7);
    noise(1.4, 'lowpass', 600, 60, 0.5, 0.05);
    tone('sine', 70, 30, 0.6, 0.5);
  },
  bell() {
    [1320, 1980, 2640, 3520].forEach((f, i) => tone('sine', f, f * 0.998, 1.4 - i * 0.2, 0.18 / (i + 1)));
    tone('triangle', 660, 660, 1.2, 0.12);
  },
  swordHit() {
    if (!throttle('swordHit', 45)) return;
    noise(0.12, 'bandpass', 3000, 1200, 0.25, 0, 3);
    tone('triangle', 900, 500, 0.08, 0.1);
  },
  coin() {
    if (!throttle('coin', 60)) return;
    tone('square', 2400, 2600, 0.06, 0.05); tone('sine', 3200, 3100, 0.12, 0.06, 0.03);
  },
  whoosh() {
    if (!throttle('whoosh', 120)) return;
    noise(0.35, 'bandpass', 400, 2000, 0.22, 0, 1.5);
  },
  bagua() {
    tone('sine', 220, 440, 0.6, 0.25); tone('triangle', 330, 660, 0.7, 0.15, 0.05);
    noise(0.6, 'highpass', 3000, 6000, 0.08);
  },
  ricesplash() { noise(0.4, 'highpass', 4000, 2000, 0.18); },
  inkSnap() { noise(0.08, 'bandpass', 2000, 800, 0.4, 0, 4); tone('square', 180, 90, 0.12, 0.15); },
  fireball() {
    if (!throttle('fireball', 100)) return;
    noise(0.6, 'lowpass', 1500, 300, 0.35);
  },
  explosion() {
    if (!throttle('boom', 60)) return;
    noise(0.8, 'lowpass', 2400, 80, 0.8);
    tone('sine', 90, 30, 0.5, 0.7);
  },
  pickup() {
    if (!throttle('pickup', 40)) return;
    const f = 1200 + Math.random() * 500;
    tone('sine', f, f * 1.5, 0.08, 0.06);
  },
  levelUp() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, f, 0.5, 0.14, i * 0.07));
    tone('sine', 262, 262, 1.2, 0.12);
  },
  cardPick() { tone('triangle', 784, 1175, 0.18, 0.15); noise(0.2, 'highpass', 5000, 8000, 0.06); },
  chest() { [392, 523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.25, 0.05, i * 0.05)); },
  heal() { tone('sine', 440, 880, 0.4, 0.12); tone('sine', 660, 1320, 0.4, 0.08, 0.06); },
  shieldBreak() { noise(0.3, 'highpass', 3000, 1000, 0.3); tone('sine', 1600, 400, 0.3, 0.12); },
  dash() { noise(0.25, 'bandpass', 800, 3000, 0.3, 0, 1.2); },
  ghostWail() {
    if (!throttle('wail', 500)) return;
    const c = ensureCtx(); const t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(700, t); o.frequency.linearRampToValueAtTime(1100, t + 0.3); o.frequency.linearRampToValueAtTime(500, t + 0.9);
    const l = c.createOscillator(); l.frequency.value = 7; const lg = c.createGain(); lg.gain.value = 30; l.connect(lg).connect(o.frequency);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    o.connect(g).connect(master); o.start(t); o.stop(t + 1.05); l.start(t); l.stop(t + 1.05);
  },
  chain() { for (let i = 0; i < 5; i++) tone('square', 1800 + Math.random() * 800, 1500, 0.04, 0.05, i * 0.04); },
  slam() { noise(0.7, 'lowpass', 900, 50, 0.9); tone('sine', 60, 25, 0.6, 0.8); },
  bossRoar() {
    if (!throttle('roar', 800)) return;
    const c = ensureCtx(); const t = c.currentTime;
    for (const [f, d] of [[70, 0], [105, 0.02], [140, 0.04]]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t + d); o.frequency.linearRampToValueAtTime(f * 1.4, t + 0.4); o.frequency.linearRampToValueAtTime(f * 0.7, t + 1.5);
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 700;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(fl).connect(g).connect(master); o.start(t + d); o.stop(t + 1.7);
    }
    noise(1.4, 'bandpass', 300, 150, 0.3, 0, 0.8);
  },
  gong() {
    const c = ensureCtx();
    [110, 165.5, 221, 277, 331].forEach((f, i) => tone('sine', f, f * 0.985, 3.5 - i * 0.4, 0.22 / (i + 1)));
    noise(0.15, 'lowpass', 2000, 200, 0.3);
    void c;
  },

  // ---------------- 背景音乐：五声音阶的古琴拨弦 + 低沉鼓点 + 持续低音
  startMusic(mood = 'calm') {
    const c = ensureCtx();
    this.stopMusic();
    const scales = {
      calm: [146.8, 164.8, 196, 220, 246.9, 293.7, 329.6, 392],
      battle: [130.8, 155.6, 174.6, 196, 233.1, 261.6, 311.1, 349.2],
      boss: [110, 130.8, 146.8, 164.8, 196, 220, 261.6, 293.7],
    };
    const sc = scales[mood] || scales.calm;
    const bpm = mood === 'boss' ? 118 : mood === 'battle' ? 96 : 66;
    const beat = 60 / bpm;
    const st = { on: true, next: c.currentTime + 0.1, step: 0, mood };
    // 持续低音
    const drone = c.createOscillator(); drone.type = 'sawtooth'; drone.frequency.value = sc[0] / 2;
    const dl = c.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 260;
    const dg = c.createGain(); dg.gain.value = 0.05;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.1; const lg = c.createGain(); lg.gain.value = 80; lfo.connect(lg).connect(dl.frequency);
    drone.connect(dl).connect(dg).connect(music); drone.start(); lfo.start();
    st.nodes = [drone, lfo];
    const pluck = (f, t, g = 0.12) => {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f, t);
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.setValueAtTime(f * 2.01, t);
      const gg = c.createGain(); gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(g, t + 0.005); gg.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      const g2 = c.createGain(); g2.gain.value = 0.3;
      o.connect(gg); o2.connect(g2).connect(gg); gg.connect(music);
      o.start(t); o2.start(t); o.stop(t + 1.9); o2.stop(t + 1.9);
    };
    const drum = (t, g = 0.3, f = 90) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
      const gg = c.createGain(); gg.gain.setValueAtTime(g, t); gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(gg).connect(music); o.start(t); o.stop(t + 0.4);
    };
    const wood = (t) => {
      const o = c.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(1200, t);
      const gg = c.createGain(); gg.gain.setValueAtTime(0.03, t); gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(gg).connect(music); o.start(t); o.stop(t + 0.06);
    };
    let phrase = [];
    const tick = () => {
      if (!st.on) return;
      while (st.next < c.currentTime + 0.3) {
        const s = st.step % 16;
        if (s === 0) { phrase = Array.from({ length: 16 }, () => (Math.random() < (mood === 'calm' ? 0.35 : 0.5) ? sc[Math.floor(Math.random() * sc.length)] : 0)); }
        if (phrase[s]) pluck(phrase[s] * (Math.random() < 0.2 ? 2 : 1), st.next, mood === 'calm' ? 0.09 : 0.11);
        if (mood !== 'calm') {
          if (s % 4 === 0) drum(st.next, mood === 'boss' ? 0.4 : 0.3);
          if (s % 8 === 6) drum(st.next, 0.2, 120);
          if (s % 2 === 1) wood(st.next);
        } else if (s === 0) drum(st.next, 0.15, 70);
        st.next += beat / 2;
        st.step++;
      }
      st.timer = setTimeout(tick, 100);
    };
    tick();
    this._music = st;
  },
  stopMusic() {
    const st = this._music;
    if (!st) return;
    st.on = false;
    clearTimeout(st.timer);
    for (const n of st.nodes) { try { n.stop(); } catch (e) { /* ignore */ } }
    this._music = null;
  },
};
