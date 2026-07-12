// 程序化合成音效：无需外部音频资源
let ctx = null;
let master = null;

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(duration) {
  const c = ensureCtx();
  const len = Math.max(1, Math.floor(c.sampleRate * duration));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
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
};
