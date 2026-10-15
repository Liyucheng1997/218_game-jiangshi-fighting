// =====================================================================
//  音频引擎 v2 —— 全部程序合成，无外部音频资源
//  · 总线混音：音效 / 枪械（软削波）/ 音乐（可闪避压低）/ 环境 / 语音 / 界面
//  · 程序生成的卷积混响（义庄庭院、竹林、阴司洞窟各一）
//  · HRTF 空间声：僵尸蹦跳、鬼哭、首领咆哮都有方位与距离
//  · 章节环境声：夜风、虫鸣、乌鸦、檐铃、夜雨、雷声、地火、阴风鬼哭
//  · 自适应配乐：古琴（Karplus-Strong 拨弦）、琵琶轮指、二胡、箫、
//    堂鼓、梆子、锣、钹、人声合唱；按战斗强度分层淡入淡出
// =====================================================================

let ctx = null;
const B = {};
const vol = { master: 1, sfx: 0.6, music: 0.45, amb: 0.55, voice: 0.6 };
const _last = {};

function ensureCtx() {
  if (!ctx) init();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function throttle(key, ms) {
  const now = performance.now();
  if (_last[key] && now - _last[key] < ms) return false;
  _last[key] = now;
  return true;
}

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------------- 初始化与总线
function init() {
  ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -9; limiter.knee.value = 8; limiter.ratio.value = 10;
  limiter.attack.value = 0.002; limiter.release.value = 0.22;
  limiter.connect(ctx.destination);
  B.muffle = ctx.createBiquadFilter();
  B.muffle.type = 'lowpass'; B.muffle.frequency.value = 20000; B.muffle.Q.value = 0.4;
  B.muffle.connect(limiter);
  B.master = ctx.createGain();
  B.master.gain.value = vol.master;
  B.master.connect(B.muffle);
  B.reverb = ctx.createConvolver();
  B.reverb.buffer = makeIR(2.4, 2.6, 0.55);
  B.reverbOut = ctx.createGain();
  B.reverbOut.gain.value = 0.85;
  B.reverb.connect(B.reverbOut).connect(B.master);
  const bus = (v, send) => {
    const g = ctx.createGain();
    g.gain.value = v;
    g.connect(B.master);
    if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s).connect(B.reverb); g.send = s; }
    return g;
  };
  B.sfx = bus(vol.sfx, 0.16);
  B.music = bus(vol.music, 0.3);
  B.amb = bus(vol.amb, 0.25);
  B.ui = bus(vol.sfx * 0.8, 0.04);
  B.voice = bus(vol.voice, 0.1);
  // 纯湿声（枪声尾音、远雷）
  B.wet = ctx.createGain(); B.wet.gain.value = 1; B.wet.connect(B.reverb);
  // 枪械子总线：软削波压出冲击力
  B.gun = ctx.createGain(); B.gun.gain.value = 0.9;
  const shaper = ctx.createWaveShaper(); shaper.curve = softClip(2.2); shaper.oversample = '2x';
  B.gun.connect(shaper).connect(B.sfx);
  // 音乐闪避
  B.musicIn = ctx.createGain(); B.musicIn.gain.value = 1;
  B.musicIn.connect(B.music);
  B.ambIn = ctx.createGain(); B.ambIn.gain.value = 1;
  B.ambIn.connect(B.amb);
  B.irCache = {};
}

function softClip(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); }
  return c;
}

// 程序生成脉冲响应：早期反射 + 指数衰减尾音，尾音随时间逐渐变暗
function makeIR(seconds, decay, damp = 0.5) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const x = (Math.random() * 2 - 1) * Math.pow(1 - k, decay);
      const a = 0.95 - damp * 0.85 * Math.sqrt(k);
      y += a * (x - y);
      d[i] = y * (i < sr * 0.004 ? i / (sr * 0.004) : 1);
    }
    for (let r = 0; r < 9; r++) {
      const idx = Math.floor(rnd(0.008, 0.085) * sr);
      d[idx] += (Math.random() < 0.5 ? -1 : 1) * 0.55 * (1 - r / 9);
    }
  }
  return buf;
}

let NOISE = null;
function noiseBuf() {
  if (NOISE) return NOISE;
  const n = ctx.sampleRate * 3;
  NOISE = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = NOISE.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return NOISE;
}
let PINK = null;
function pinkBuf() {
  if (PINK) return PINK;
  const n = ctx.sampleRate * 6;
  PINK = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = PINK.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return PINK;
}

// 噪声脉冲：滤波 + 指数包络
function nb(t, dur, type, f0, f1, gain, dest, q = 1, attack = 0.002) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf();
  const f = ctx.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 2.5, dur + 0.05);
  return g;
}

// 振荡音：可滑音
function tn(type, f0, t, dur, gain, dest, { f1 = f0, attack = 0.004, glide = dur } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + glide);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
  return o;
}

// 空间定位：HRTF 声像 + 距离衰减
function at(pos, bus = null, ref = 3, roll = 1.15) {
  if (!pos) return bus || B.sfx;
  const p = ctx.createPanner();
  p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
  p.refDistance = ref; p.maxDistance = 120; p.rolloffFactor = roll;
  p.positionX.value = pos.x; p.positionY.value = pos.y ?? 1; p.positionZ.value = pos.z;
  p.connect(bus || B.sfx);
  return p;
}

// ---------------------------------------------------------------- 拨弦：Karplus-Strong 预计算缓冲
const KS = new Map();
function ksBuffer(freq, dur = 3, bright = 0.5, decay = 0.9975) {
  const key = `${Math.round(freq * 10)}|${dur}|${bright}|${decay}`;
  if (KS.has(key)) return KS.get(key);
  const sr = ctx.sampleRate, n = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const N = Math.max(2, Math.round(sr / freq));
  const ring = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) { lp += (1 - bright * 0.9) * ((Math.random() * 2 - 1) - lp); ring[i] = lp; }
  let idx = 0, dc = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[idx], b = ring[(idx + 1) % N];
    ring[idx] = decay * (0.5 * (a + b));
    dc += 0.0015 * (a - dc);
    d[i] = (a - dc) * 2.2;
    idx = (idx + 1) % N;
  }
  // 起音处一点拨片噪声
  for (let i = 0; i < Math.min(n, sr * 0.006); i++) d[i] += (Math.random() * 2 - 1) * 0.25 * (1 - i / (sr * 0.006));
  KS.set(key, buf);
  return buf;
}

// 古琴：低沉悠长 + 吟猱（揉弦颤音）+ 偶尔上下滑音
function guqin(freq, t, dur, gain, dest, { slide = 0, vib = true } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = ksBuffer(freq, Math.min(4, dur + 1.6), 0.35, 0.9985);
  const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 180; body.Q.value = 1.2; body.gain.value = 5;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.35);
  src.connect(body).connect(lp).connect(g).connect(dest);
  const pr = src.playbackRate;
  pr.setValueAtTime(1, t);
  if (slide) pr.setTargetAtTime(Math.pow(2, slide / 12), t + dur * 0.35, dur * 0.15);
  if (vib) {
    const l = ctx.createOscillator(); l.frequency.value = 5.2;
    const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(0.006, t + 0.4);
    l.connect(lg).connect(pr); l.start(t); l.stop(t + dur + 1.5);
  }
  src.start(t); src.stop(t + dur + 1.6);
}

// 琵琶：明亮短促（轮指由多次拨弦组成）
function pipa(freq, t, gain, dest, dur = 0.6) {
  const src = ctx.createBufferSource();
  src.buffer = ksBuffer(freq, 1.2, 0.8, 0.994);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 160;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.12);
  src.connect(hp).connect(g).connect(dest);
  src.start(t); src.stop(t + 1.2);
}

// 二胡：锯齿 + 共振峰 + 渐入颤音 + 弓噪；可从前一音滑入
function erhu(freq, t, dur, gain, dest, { from = 0, vib = 1 } = {}) {
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  if (from) {
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + Math.min(0.18, dur * 0.3));
  } else {
    o.frequency.setValueAtTime(freq * 0.985, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
  }
  const l = ctx.createOscillator(); l.frequency.value = rnd(5.2, 6.2);
  const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(freq * 0.012 * vib, t + Math.min(0.5, dur * 0.6));
  l.connect(lg).connect(o.frequency);
  const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 900; f1.Q.value = 1.6;
  const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 2600; f2.Q.value = 2.2;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200;
  const mix = ctx.createGain(); mix.gain.value = 1;
  o.connect(f1).connect(mix); o.connect(f2).connect(mix);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.09);
  g.gain.setValueAtTime(gain, t + Math.max(0.1, dur - 0.12));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
  mix.connect(lp).connect(g).connect(dest);
  // 弓噪
  nb(t, dur, 'bandpass', 2400, 2200, gain * 0.08, dest, 3, 0.08);
  o.start(t); o.stop(t + dur + 0.2); l.start(t); l.stop(t + dur + 0.2);
}

// 箫：正弦 + 气声
function xiao(freq, t, dur, gain, dest) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
  const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = freq * 2;
  const l = ctx.createOscillator(); l.frequency.value = 4.8;
  const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(freq * 0.008, t + dur * 0.5);
  l.connect(lg).connect(o.frequency);
  const g2 = ctx.createGain(); g2.gain.value = 0.12;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.12);
  g.gain.setValueAtTime(gain, t + Math.max(0.13, dur - 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
  o.connect(g); o2.connect(g2).connect(g); g.connect(dest);
  nb(t, dur + 0.2, 'bandpass', freq * 2.2, freq * 2, gain * 0.25, dest, 2, 0.1);
  o.start(t); o2.start(t); l.start(t);
  o.stop(t + dur + 0.3); o2.stop(t + dur + 0.3); l.stop(t + dur + 0.3);
}

// 打击乐
function bigDrum(t, gain, dest, f = 92) {
  tn('sine', f * 1.5, t, 0.6, gain, dest, { f1: f * 0.55, glide: 0.16, attack: 0.002 });
  tn('triangle', f * 2.2, t, 0.12, gain * 0.35, dest, { f1: f, attack: 0.001 });
  nb(t, 0.09, 'lowpass', 900, 200, gain * 0.5, dest, 0.7);
}
function smallDrum(t, gain, dest) {
  tn('sine', 260, t, 0.18, gain * 0.6, dest, { f1: 170, attack: 0.001 });
  nb(t, 0.14, 'bandpass', 1800, 1200, gain * 0.7, dest, 1.2);
}
function woodblock(t, gain, dest, f = 1050) {
  tn('sine', f, t, 0.07, gain, dest, { f1: f * 0.92, attack: 0.001 });
  nb(t, 0.02, 'bandpass', f * 2.5, f * 2.5, gain * 0.5, dest, 8);
}
function gongHit(t, gain, dest, base = 110, bend = 0.97) {
  [1, 1.48, 2.03, 2.57, 3.31, 4.2].forEach((r, i) => tn('sine', base * r, t, 3.6 - i * 0.45, gain / (1 + i * 0.7), dest, { f1: base * r * bend, attack: 0.008, glide: 2.5 }));
  nb(t, 1.6, 'bandpass', 900, 500, gain * 0.25, dest, 0.8, 0.01);
}
function cymbal(t, gain, dest, dur = 1.6) {
  nb(t, dur, 'highpass', 5200, 3800, gain, dest, 0.6, 0.003);
  nb(t, dur * 0.7, 'bandpass', 7800, 6400, gain * 0.6, dest, 1.5, 0.003);
}
function bellTone(f, t, gain, dest, dur = 2.2) {
  const nyq = ctx.sampleRate * 0.45;
  [1, 2.0, 2.76, 5.4, 8.9].forEach((r, i) => { if (f * r < nyq) tn('sine', f * r, t, dur / (1 + i * 0.5), gain / (1 + i * 1.2), dest, { attack: 0.002 }); });
}

// 人声合唱：锯齿和弦 + 元音共振峰，慢起慢收
function choir(freqs, t, dur, gain, dest, vowel = 'a') {
  const F = { a: [730, 1090, 2440], o: [570, 840, 2410], u: [440, 1020, 2240] }[vowel];
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(gain, t + Math.min(1.2, dur * 0.4));
  out.gain.setValueAtTime(gain, t + dur * 0.7);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const sum = ctx.createGain(); sum.gain.value = 1 / freqs.length;
  for (const f of freqs) {
    for (const det of [-6, 5]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      const l = ctx.createOscillator(); l.frequency.value = rnd(4.5, 5.5);
      const lg = ctx.createGain(); lg.gain.value = f * 0.006;
      l.connect(lg).connect(o.frequency);
      o.connect(sum);
      o.start(t); o.stop(t + dur + 0.1); l.start(t); l.stop(t + dur + 0.1);
    }
  }
  F.forEach((ff, i) => {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = 6;
    const bg = ctx.createGain(); bg.gain.value = [1, 0.6, 0.25][i];
    sum.connect(bp).connect(bg).connect(out);
  });
  out.connect(dest);
}

// 低音铺底：失谐锯齿 + 缓慢扫频
function droneNode(freq, gain, dest) {
  const g = ctx.createGain(); g.gain.value = 0.0001;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 280; lp.Q.value = 0.8;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
  const lfg = ctx.createGain(); lfg.gain.value = 120;
  lfo.connect(lfg).connect(lp.frequency);
  const nodes = [lfo];
  for (const [r, det] of [[1, -7], [1, 6], [1.5, 0], [0.5, 3]]) {
    const o = ctx.createOscillator(); o.type = r === 0.5 ? 'sine' : 'sawtooth'; o.frequency.value = freq * r; o.detune.value = det;
    o.connect(lp); o.start(); nodes.push(o);
  }
  lfo.start();
  lp.connect(g).connect(dest);
  g.gain.setTargetAtTime(gain, ctx.currentTime, 1.5);
  return { g, nodes };
}

// ---------------------------------------------------------------- 乐谱
// 羽调式（D 小调五声）：D F G A C
const D_PENTA = [73.42, 87.31, 98.0, 110.0, 130.81, 146.83, 174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0, 440.0, 523.25, 587.33, 698.46, 783.99, 880.0];
// 宫调式（C 大调五声，用于黎明终章）：C D E G A
const C_PENTA = [65.41, 73.42, 82.41, 98.0, 110.0, 130.81, 146.83, 164.81, 196.0, 220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.26, 783.99];

const PHR = {
  qinCalm: [
    [[10, 1], [11, 0.5], [12, 0.5], [13, 2], [12, 1], [11, 1], [10, 2], [-1, 1], [8, 1], [10, 1], [11, 1], [10, 3, -2]],
    [[13, 1.5], [14, 0.5], [13, 1], [12, 1], [13, 2], [11, 1], [10, 1], [8, 2], [-1, 2], [7, 1], [8, 1], [10, 4]],
    [[10, 0.5], [11, 0.5], [10, 1], [8, 1], [7, 1], [8, 2], [-1, 1], [11, 1], [12, 1], [13, 1], [15, 2, -2], [13, 1], [12, 1], [10, 4]],
    [[5, 2], [6, 1], [7, 1], [8, 2], [7, 1], [6, 1], [5, 4], [-1, 4]],
    [[8, 1], [10, 1], [8, 1], [7, 1], [6, 2], [7, 1], [8, 1], [10, 3, 2], [-1, 1], [11, 2], [10, 2], [8, 4]],
  ],
  xiao: [
    [[15, 3], [13, 1], [14, 2], [13, 2], [12, 4], [-1, 4]],
    [[13, 2], [15, 2], [16, 3], [15, 1], [13, 4], [-1, 4]],
  ],
  erhu: [
    [[13, 2], [12, 1], [13, 1], [15, 3], [14, 1], [13, 2], [12, 2], [10, 4]],
    [[10, 1], [11, 1], [12, 2], [13, 2], [11, 1], [10, 1], [8, 4], [-1, 2], [13, 1], [15, 1], [16, 3], [15, 1], [13, 4]],
    [[15, 2], [16, 1], [15, 1], [13, 2], [12, 1], [13, 1], [10, 6], [-1, 2]],
    [[8, 2], [10, 2], [11, 3], [10, 1], [8, 2], [7, 2], [8, 4]],
  ],
  dawn: [
    [[10, 1], [11, 1], [12, 2], [13, 1], [12, 1], [10, 2], [9, 2], [10, 4]],
    [[13, 2], [14, 1], [13, 1], [12, 2], [10, 2], [11, 2], [9, 2], [10, 4]],
    [[8, 1], [9, 1], [10, 2], [12, 2], [13, 3], [12, 1], [10, 4]],
  ],
};
// 邪道主题（含半音的阴森动机）
const VILLAIN = [[293.66, 1.5], [311.13, 0.5], [293.66, 1], [220, 2], [207.65, 2], [233.08, 1], [220, 3], [-1, 1]];

const DRUMS = {
  battle: { big: [0, 6, 8, 11, 14], small: [12], wood: [2, 4, 10] },
  battle2: { big: [0, 3, 6, 8, 11, 14], small: [4, 12, 15], wood: [2, 6, 10, 14] },
  boss: { big: [0, 3, 6, 8, 10, 11, 14], small: [4, 12, 13, 15], wood: [2, 7, 10] },
};

class Line {
  constructor(phrases, scale, play, { restBars = [0, 1], octave = 0 } = {}) {
    this.phrases = phrases; this.scale = scale; this.play = play;
    this.restBars = restBars; this.octave = octave;
    this.queue = []; this.nextBeat = 0; this.lastPhrase = -1; this.prevFreq = 0;
  }
  // 在 [beat, beat+0.25) 内安排音符
  step(beat, time, spb, active) {
    while (this.nextBeat < beat + 0.25 - 1e-6) {
      if (!this.queue.length) {
        let i = Math.floor(Math.random() * this.phrases.length);
        if (i === this.lastPhrase) i = (i + 1) % this.phrases.length;
        this.lastPhrase = i;
        this.queue = this.phrases[i].slice();
        const rest = this.restBars[0] + Math.floor(Math.random() * (this.restBars[1] - this.restBars[0] + 1));
        if (rest > 0) this.queue.unshift([-1, rest * 4]);
      }
      const [deg, len, slide] = this.queue.shift();
      if (deg >= 0 && active) {
        const t = time + (this.nextBeat - beat) * spb;
        const f = (typeof deg === 'number' && deg < 40 ? this.scale[Math.min(this.scale.length - 1, deg)] : deg) * Math.pow(2, this.octave);
        this.play(f, Math.max(0, t), len * spb, slide || 0, this.prevFreq);
        this.prevFreq = f;
      }
      this.nextBeat += len;
    }
  }
}

const MOODS = {
  calm: { bpm: 62, scale: D_PENTA, drone: 73.42, layers: ['qin', 'xiao', 'wood'] },
  battle: { bpm: 100, scale: D_PENTA, drone: 73.42, layers: ['drums', 'pipa', 'erhu', 'perc'] },
  boss: { bpm: 116, scale: D_PENTA, drone: 73.42, layers: ['drums', 'pipa', 'erhu', 'perc', 'choir'], boss: true },
  final: { bpm: 112, scale: D_PENTA, drone: 73.42, layers: ['drums', 'pipa', 'villain', 'perc', 'choir'], boss: true },
  dread: { bpm: 70, scale: D_PENTA, drone: 55, layers: ['qin', 'choir'], dread: true },
  dawn: { bpm: 70, scale: C_PENTA, drone: 65.41, layers: ['qinDawn', 'xiaoDawn'] },
};

class Score {
  constructor(mood) {
    const M = MOODS[mood] || MOODS.calm;
    this.mood = mood; this.M = M;
    this.spb = 60 / M.bpm;
    this.out = ctx.createGain(); this.out.gain.value = 0.0001;
    this.out.connect(B.musicIn);
    this.out.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
    this.layer = {};
    for (const k of M.layers) { const g = ctx.createGain(); g.gain.value = 0; g.connect(this.out); this.layer[k] = g; }
    this.drone = droneNode(M.drone, M.dread ? 0.07 : 0.045, this.out);
    this.intensity = mood === 'calm' || mood === 'dawn' || mood === 'dread' ? 1 : 0.35;
    this.step16 = 0;
    this.next = ctx.currentTime + 0.12;
    const L = this.layer, sc = M.scale;
    this.lines = [];
    if (L.qin) this.lines.push(['qin', new Line(PHR.qinCalm, sc, (f, t, d, sl) => guqin(f, t, d, 0.32, L.qin, { slide: sl }), { restBars: [0, 1] })]);
    if (L.qinDawn) this.lines.push(['qinDawn', new Line(PHR.dawn, sc, (f, t, d, sl) => guqin(f, t, d, 0.32, L.qinDawn, { slide: sl }), { restBars: [0, 0] })]);
    if (L.xiao) this.lines.push(['xiao', new Line(PHR.xiao, sc, (f, t, d) => xiao(f, t, d, 0.12, L.xiao), { restBars: [2, 4] })]);
    if (L.xiaoDawn) this.lines.push(['xiaoDawn', new Line(PHR.xiao, sc, (f, t, d) => xiao(f, t, d, 0.1, L.xiaoDawn), { restBars: [1, 3] })]);
    if (L.erhu) this.lines.push(['erhu', new Line(PHR.erhu, sc, (f, t, d, sl, prev) => erhu(f, t, d * 0.96, 0.13, L.erhu, { from: prev && Math.random() < 0.5 ? prev : 0 }), { restBars: [0, 1] })]);
    if (L.villain) this.lines.push(['villain', new Line([VILLAIN], sc, (f, t, d, sl, prev) => erhu(f, t, d * 0.96, 0.14, L.villain, { from: prev && Math.random() < 0.6 ? prev : 0, vib: 1.4 }), { restBars: [0, 0] })]);
    this.timer = setInterval(() => this.tick(), 40);
  }

  setIntensity(x) { this.intensity = Math.max(0, Math.min(1, x)); }

  _layerTarget(k) {
    const I = this.intensity;
    switch (k) {
      case 'qin': case 'qinDawn': return 1;
      case 'xiao': case 'xiaoDawn': return 1;
      case 'wood': return 0.6;
      case 'drums': return 0.55 + 0.45 * Math.min(1, I * 1.5);
      case 'pipa': return I > 0.3 ? Math.min(1, (I - 0.3) * 4) : 0;
      case 'erhu': case 'villain': return I > 0.5 ? Math.min(1, (I - 0.5) * 4) : (this.M.boss ? 0.6 : 0);
      case 'perc': return I > 0.78 ? Math.min(1, (I - 0.78) * 6) : 0;
      case 'choir': return this.M.dread ? 0.8 : 0.4 + 0.6 * I;
      default: return 1;
    }
  }

  tick() {
    if (!this.on && this.on !== undefined) return;
    const now = ctx.currentTime;
    for (const k in this.layer) this.layer[k].gain.setTargetAtTime(this._layerTarget(k), now, 0.6);
    const s16 = this.spb / 4;
    while (this.next < now + 0.3) {
      this._schedule(this.step16, this.next, s16);
      this.next += s16;
      this.step16++;
    }
  }

  _schedule(i, t, s16) {
    const M = this.M, L = this.layer, s = i % 16, bar = Math.floor(i / 16);
    const beat = i / 4;
    for (const [k, line] of this.lines) line.step(beat, t, this.spb, this._layerTarget(k) > 0.02);
    if (L.wood && s === 0 && bar % 2 === 0) woodblock(t, 0.08, L.wood, 520);
    if (L.drums) {
      const pat = M.boss ? DRUMS.boss : (this.intensity > 0.65 ? DRUMS.battle2 : DRUMS.battle);
      if (pat.big.includes(s)) bigDrum(t, s === 0 ? 0.55 : 0.38, L.drums, M.boss ? 80 : 92);
      if (pat.small.includes(s)) smallDrum(t, 0.22, L.drums);
      if (pat.wood.includes(s)) woodblock(t, 0.06, L.drums);
      if (s === 0 && bar % 8 === 0) gongHit(t, 0.22, L.drums, M.boss ? 98 : 110);
    }
    if (L.pipa) {
      const root = M.scale[5], fifth = M.scale[8];
      const ostinato = [root, 0, fifth, 0, root * 2, 0, fifth, root, root, 0, fifth, 0, M.scale[9], 0, fifth, M.scale[7]];
      const f = ostinato[s];
      if (f) {
        pipa(f, t, 0.12, L.pipa, 0.25);
        if (s % 4 === 0 && this.intensity > 0.55) for (let k = 1; k < 4; k++) pipa(f, t + k * s16 / 4, 0.06, L.pipa, 0.1);
      }
    }
    if (L.perc) {
      if (s === 0 && bar % 4 === 0) cymbal(t, 0.12, L.perc, 2.2);
      if (s % 2 === 1) smallDrum(t, 0.08, L.perc);
    }
    if (L.choir && s === 0 && bar % 2 === 0) {
      const prog = M.dread
        ? [[73.42, 110, 155.56], [69.3, 103.83, 146.83]]
        : [[146.83, 220, 293.66, 349.23], [130.81, 196, 261.63, 349.23], [116.54, 174.61, 233.08, 293.66], [110, 164.81, 220, 277.18]];
      const ch = prog[(bar / 2) % prog.length];
      choir(ch, t, this.spb * 8, M.dread ? 0.12 : 0.09, L.choir, bar % 4 === 0 ? 'a' : 'o');
    }
  }

  stop(fade = 1.2) {
    this.on = false;
    clearInterval(this.timer);
    const now = ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(0.0001, now, fade / 3);
    const nodes = this.drone.nodes;
    setTimeout(() => { for (const n of nodes) { try { n.stop(); } catch (e) { /* 已停 */ } } this.out.disconnect(); }, fade * 1000 + 600);
  }
}

// ---------------------------------------------------------------- 环境声
const AMB = {
  yizhuang: { wind: 0.5, windF: 420, crickets: true, crows: true, chimes: true, ir: [2.4, 2.6, 0.55] },
  village: { wind: 0.16, windF: 600, rain: 0.34, crows: true, bamboo: true, ir: [1.6, 2.2, 0.7] },
  underworld: { wind: 0.4, windF: 260, rumble: 0.32, lava: true, wails: true, ir: [4.2, 2.0, 0.35] },
  gate: { wind: 0.45, windF: 220, rumble: 0.4, wails: true, chains: true, ir: [4.8, 1.8, 0.3] },
  dawn: { wind: 0.12, windF: 700, birds: true, ir: [2.0, 2.8, 0.6] },
  shrine: { wind: 0.06, windF: 380, ir: [3.0, 2.4, 0.4] },
};

class Ambience {
  constructor(key) {
    const A = AMB[key] || AMB.yizhuang;
    this.A = A; this.key = key; this.on = true;
    this.out = ctx.createGain(); this.out.gain.value = 0.0001;
    this.out.connect(B.ambIn);
    this.out.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
    this.nodes = [];
    this.timers = [];
    if (A.wind) this._wind(A.wind, A.windF);
    if (A.rain) this._rain(A.rain);
    if (A.rumble) this._rumble(A.rumble);
    const loop = (fn, a, b) => { const go = () => { if (!this.on) return; fn(); this.timers.push(setTimeout(go, rnd(a, b) * 1000)); }; this.timers.push(setTimeout(go, rnd(a, b) * 500)); };
    if (A.crickets) loop(() => this._cricket(), 0.25, 1.4);
    if (A.crows) loop(() => this._crow(), 9, 22);
    if (A.chimes) loop(() => this._chime(), 6, 15);
    if (A.bamboo) loop(() => this._bamboo(), 3, 8);
    if (A.thunder) loop(() => Audio.thunderDistant(rnd(0.2, 1.4)), 18, 40);
    if (A.lava) loop(() => this._lava(), 0.4, 1.6);
    if (A.wails) loop(() => this._wail(), 6, 14);
    if (A.chains) loop(() => this._chains(), 5, 11);
    if (A.birds) loop(() => this._bird(), 1.5, 4.5);
  }

  _src(buf, loop = true) {
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = loop; s.start(0, Math.random() * 3);
    this.nodes.push(s);
    return s;
  }

  _wind(gain, f) {
    const s = this._src(pinkBuf());
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 0.9;
    const g = ctx.createGain(); g.gain.value = gain;
    const l1 = ctx.createOscillator(); l1.frequency.value = 0.09; const l1g = ctx.createGain(); l1g.gain.value = f * 0.6; l1.connect(l1g).connect(bp.frequency);
    const l2 = ctx.createOscillator(); l2.frequency.value = 0.053; const l2g = ctx.createGain(); l2g.gain.value = gain * 0.6; l2.connect(l2g).connect(g.gain);
    l1.start(); l2.start(); this.nodes.push(l1, l2);
    s.connect(bp).connect(g).connect(this.out);
  }

  _rain(gain) {
    const s = this._src(noiseBuf());
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.value = gain * 0.5;
    s.connect(hp).connect(lp).connect(g).connect(this.out);
    const s2 = this._src(pinkBuf());
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 500;
    const g2 = ctx.createGain(); g2.gain.value = gain * 0.6;
    s2.connect(lp2).connect(g2).connect(this.out);
    const drip = () => {
      if (!this.on) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 4; i++) tn('sine', rnd(1800, 4200), t + Math.random() * 0.25, 0.03, rnd(0.01, 0.03), this._pan(), { f1: rnd(900, 1600), attack: 0.001 });
      this.timers.push(setTimeout(drip, rnd(60, 200)));
    };
    drip();
  }

  _rumble(gain) {
    const s = this._src(pinkBuf());
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140;
    const g = ctx.createGain(); g.gain.value = gain;
    s.connect(lp).connect(g).connect(this.out);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 41;
    const og = ctx.createGain(); og.gain.value = gain * 0.25;
    const l = ctx.createOscillator(); l.frequency.value = 0.13; const lg = ctx.createGain(); lg.gain.value = gain * 0.2; l.connect(lg).connect(og.gain);
    o.connect(og).connect(this.out); o.start(); l.start(); this.nodes.push(o, l);
  }

  _pan(v = null) {
    const p = ctx.createStereoPanner(); p.pan.value = v ?? rnd(-0.9, 0.9);
    p.connect(this.out);
    return p;
  }

  _cricket() {
    const t = ctx.currentTime, f = rnd(4300, 5200), p = this._pan(), n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) tn('sine', f, t + i * 0.055, 0.035, rnd(0.015, 0.035), p, { attack: 0.004 });
  }
  _crow() {
    const t = ctx.currentTime, p = this._pan(), n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const tt = t + i * 0.42;
      o.frequency.setValueAtTime(rnd(820, 980), tt); o.frequency.exponentialRampToValueAtTime(rnd(520, 620), tt + 0.28);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 3;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.035, tt + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.32);
      o.connect(f).connect(g).connect(p); o.start(tt); o.stop(tt + 0.35);
    }
  }
  _chime() {
    const t = ctx.currentTime, p = this._pan(rnd(-0.5, 0.5));
    const notes = [1046.5, 1174.66, 1396.9, 1567.98, 1760];
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) bellTone(pick(notes), t + i * rnd(0.15, 0.4), 0.012, p, 2.6);
  }
  _bamboo() {
    const t = ctx.currentTime, p = this._pan();
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) woodblock(t + i * rnd(0.08, 0.25), 0.02, p, rnd(380, 620));
    if (Math.random() < 0.4) tn('sine', rnd(180, 260), t, 0.6, 0.012, p, { f1: rnd(140, 200) });
  }
  _lava() {
    const t = ctx.currentTime, p = this._pan();
    tn('sine', rnd(60, 120), t, 0.25, rnd(0.03, 0.07), p, { f1: rnd(30, 50), attack: 0.01 });
    nb(t, 0.15, 'lowpass', 600, 120, 0.04, p, 1);
  }
  _wail() {
    const t = ctx.currentTime, p = this._pan();
    const o = ctx.createOscillator(); o.type = 'sine';
    const f0 = rnd(380, 620);
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 1.5, t + 1.2); o.frequency.linearRampToValueAtTime(f0 * 0.8, t + 3.2);
    const l = ctx.createOscillator(); l.frequency.value = 6; const lg = ctx.createGain(); lg.gain.value = 14; l.connect(lg).connect(o.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    o.connect(g).connect(p); o.start(t); o.stop(t + 3.5); l.start(t); l.stop(t + 3.5);
  }
  _chains() {
    const t = ctx.currentTime, p = this._pan();
    for (let i = 0; i < 6; i++) tn('square', rnd(1800, 2900), t + i * rnd(0.04, 0.09), 0.05, 0.01, p, { f1: rnd(1200, 1800), attack: 0.001 });
  }
  _bird() {
    const t = ctx.currentTime, p = this._pan();
    const f = rnd(2400, 3600);
    for (let i = 0; i < 2 + Math.floor(Math.random() * 4); i++) tn('sine', f * rnd(0.9, 1.15), t + i * 0.11, 0.08, 0.02, p, { f1: f * rnd(1.1, 1.4), attack: 0.005 });
  }

  stop() {
    this.on = false;
    for (const tm of this.timers) clearTimeout(tm);
    const now = ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(0.0001, now, 0.6);
    const nodes = this.nodes;
    setTimeout(() => { for (const n of nodes) { try { n.stop(); } catch (e) { /* 已停 */ } } this.out.disconnect(); }, 3000);
  }
}

// ---------------------------------------------------------------- 枪械参数
const GUNS = {
  pistol: { crack: 3200, crackG: 0.45, crackD: 0.035, body: 1500, bodyG: 0.55, bodyD: 0.11, thump: 150, thumpG: 0.75, tailG: 0.3, tailD: 0.7, mech: 2600 },
  smg: { crack: 3600, crackG: 0.36, crackD: 0.03, body: 1800, bodyG: 0.42, bodyD: 0.075, thump: 170, thumpG: 0.55, tailG: 0.16, tailD: 0.4, mech: 3000 },
  ak: { crack: 2800, crackG: 0.55, crackD: 0.04, body: 1100, bodyG: 0.65, bodyD: 0.13, thump: 110, thumpG: 0.95, tailG: 0.32, tailD: 0.8, mech: 2200 },
  gatling: { crack: 4200, crackG: 0.3, crackD: 0.025, body: 2200, bodyG: 0.32, bodyD: 0.055, thump: 190, thumpG: 0.42, tailG: 0.09, tailD: 0.28, mech: 3600 },
  shotgun: { crack: 2200, crackG: 0.65, crackD: 0.05, body: 700, bodyG: 0.95, bodyD: 0.22, thump: 70, thumpG: 1.1, tailG: 0.42, tailD: 1.2, mech: 1800, sub: true },
};

// 角色嗓音（对话打字音）：基频与元音共振峰
const VOICES = {
  zhenli: { f: 150, formants: [[700, 1200], [500, 1500], [350, 2000], [600, 900]], type: 'sawtooth' },
  master: { f: 110, formants: [[650, 1000], [480, 1300], [380, 1800]], type: 'sawtooth' },
  villain: { f: 92, formants: [[600, 950], [420, 1100], [300, 1700]], type: 'sawtooth', growl: true },
  wuWhite: { f: 210, formants: [[800, 1400], [560, 1700], [400, 2300]], type: 'triangle', eerie: true },
  wuBlack: { f: 85, formants: [[580, 900], [420, 1050]], type: 'sawtooth', growl: true },
  ghost: { f: 330, formants: [[900, 1600], [500, 2200]], type: 'sine', eerie: true },
  villager: { f: 230, formants: [[750, 1300], [520, 1800], [360, 2300]], type: 'triangle' },
  narrator: { f: 120, formants: [[600, 1000], [450, 1300]], type: 'triangle' },
};

let music = null;
let amb = null;
let spin = null;
let heart = null;

export const Audio = {
  unlock() { ensureCtx(); },
  get ctx() { return ctx; },

  // ---------------- 混音控制
  setVolume(sfxV, musicV, ambV, voiceV) {
    vol.sfx = sfxV; vol.music = musicV;
    if (ambV !== undefined) vol.amb = ambV;
    if (voiceV !== undefined) vol.voice = voiceV;
    if (!ctx) return;
    B.sfx.gain.value = vol.sfx; B.ui.gain.value = vol.sfx * 0.8;
    B.music.gain.value = vol.music; B.amb.gain.value = vol.amb; B.voice.gain.value = vol.voice;
  },
  setMaster(v) { vol.master = v; if (ctx) B.master.gain.value = v; },

  // 混音监测（调试 / 电平检查用）
  analyser() {
    ensureCtx();
    if (!B.an) { B.an = ctx.createAnalyser(); B.an.fftSize = 2048; B.muffle.connect(B.an); }
    return B.an;
  },
  levels() {
    const an = this.analyser();
    const d = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(d);
    let peak = 0, sum = 0;
    for (const x of d) { peak = Math.max(peak, Math.abs(x)); sum += x * x; }
    return { peak, rms: Math.sqrt(sum / d.length) };
  },

  setListener(pos, fwd, up) {
    if (!ctx) return;
    const L = ctx.listener;
    if (L.positionX) {
      const t = ctx.currentTime;
      L.positionX.setValueAtTime(pos.x, t); L.positionY.setValueAtTime(pos.y, t); L.positionZ.setValueAtTime(pos.z, t);
      L.forwardX.setValueAtTime(fwd.x, t); L.forwardY.setValueAtTime(fwd.y, t); L.forwardZ.setValueAtTime(fwd.z, t);
      L.upX.setValueAtTime(up.x, t); L.upY.setValueAtTime(up.y, t); L.upZ.setValueAtTime(up.z, t);
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  },

  // 低通“闷住”：暂停、阵亡、闭气
  setMuffle(k) {
    if (!ctx) return;
    const f = k <= 0 ? 20000 : 20000 * Math.pow(0.02, k);
    B.muffle.frequency.setTargetAtTime(Math.max(300, f), ctx.currentTime, 0.12);
  },

  // 音乐闪避：重大事件时压低配乐
  duck(amount = 0.5, dur = 1.2) {
    if (!ctx) return;
    const g = B.musicIn.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(1 - amount, t, 0.05);
    g.setTargetAtTime(1, t + dur, 0.6);
  },

  setReverb(key) {
    ensureCtx();
    const A = AMB[key] || AMB.yizhuang;
    if (!B.irCache[key]) B.irCache[key] = makeIR(...A.ir);
    B.reverb.buffer = B.irCache[key];
  },

  // ---------------- 枪械
  gunshot(type = 'smg') {
    const c = ensureCtx(), t = c.currentTime;
    const G = GUNS[type] || GUNS.smg;
    const v = rnd(0.94, 1.06);
    nb(t, G.crackD, 'highpass', G.crack * v, G.crack * 0.7 * v, G.crackG, B.gun, 0.7, 0.0008);
    nb(t, G.bodyD, 'lowpass', G.body * 2.4 * v, G.body * 0.45, G.bodyG, B.gun, 0.8, 0.001);
    tn('sine', G.thump * v, t, 0.11, G.thumpG, B.gun, { f1: 38, glide: 0.09, attack: 0.001 });
    tn('triangle', G.thump * 2.1 * v, t, 0.05, G.thumpG * 0.3, B.gun, { f1: G.thump, attack: 0.001 });
    nb(t + 0.018, 0.014, 'bandpass', G.mech * v, G.mech, 0.08, B.sfx, 5, 0.001);
    nb(t + 0.01, G.tailD, 'lowpass', 1100, 160, G.tailG, B.wet, 0.5, 0.01);
    if (G.sub) tn('sine', 54, t, 0.32, 0.85, B.gun, { f1: 30, attack: 0.002 });
  },

  setMinigunSpin(level) {
    if (!ctx && level <= 0.02) return;
    const c = ensureCtx();
    if (level <= 0.02) {
      if (spin) {
        const s = spin; spin = null;
        s.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.08);
        setTimeout(() => { try { s.o.stop(); s.o2.stop(); } catch (e) { /* 已停 */ } }, 500);
      }
      return;
    }
    if (!spin) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      const o2 = c.createOscillator(); o2.type = 'square';
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 2;
      const g = c.createGain(); g.gain.value = 0;
      const g2 = c.createGain(); g2.gain.value = 0.25;
      o.connect(f); o2.connect(g2).connect(f); f.connect(g).connect(B.sfx);
      o.start(); o2.start();
      spin = { o, o2, g, f };
    }
    spin.o.frequency.setTargetAtTime(32 + level * 120, c.currentTime, 0.05);
    spin.o2.frequency.setTargetAtTime(64 + level * 240, c.currentTime, 0.05);
    spin.f.frequency.setTargetAtTime(400 + level * 1400, c.currentTime, 0.05);
    spin.g.gain.setTargetAtTime(0.025 + level * 0.07, c.currentTime, 0.05);
  },

  knifeSwing() {
    const c = ensureCtx(), t = c.currentTime;
    nb(t, 0.22, 'bandpass', 500, 2600, 0.32, B.sfx, 1.8, 0.05);
    nb(t + 0.04, 0.12, 'highpass', 4000, 6000, 0.06, B.sfx, 1, 0.03);
  },

  reload(type = 'pistol') {
    const c = ensureCtx(), t = c.currentTime;
    const click = (dt, f, g = 0.18, q = 6) => { nb(t + dt, 0.03, 'bandpass', f, f * 0.9, g, B.sfx, q, 0.001); tn('square', f / 6, t + dt, 0.03, g * 0.3, B.sfx, { attack: 0.001 }); };
    if (type === 'shotgun') { click(0, 1200, 0.2); click(0.35, 900, 0.16); click(0.7, 1600, 0.25); return; }
    if (type === 'gatling') { click(0, 800); nb(t + 0.2, 0.6, 'bandpass', 1400, 2400, 0.06, B.sfx, 2); click(1.0, 1100, 0.25); return; }
    click(0, 1800, 0.14); click(0.18, 900, 0.18); nb(t + 0.22, 0.08, 'lowpass', 1200, 400, 0.08, B.sfx);
    click(0.55, 1300, 0.2); click(0.72, 2400, 0.28);
  },

  switchWeapon() {
    const c = ensureCtx(), t = c.currentTime;
    nb(t, 0.06, 'bandpass', 1400, 1100, 0.12, B.sfx, 4);
    nb(t + 0.09, 0.04, 'bandpass', 2200, 2000, 0.1, B.sfx, 6);
  },

  dryFire() {
    const c = ensureCtx(), t = c.currentTime;
    nb(t, 0.02, 'bandpass', 2600, 2400, 0.2, B.sfx, 8, 0.001);
  },

  // ---------------- 命中反馈
  hitMarker(headshot = false) {
    if (!throttle('hit' + headshot, 30)) return;
    const c = ensureCtx(), t = c.currentTime;
    if (headshot) {
      tn('sine', 2100, t, 0.09, 0.14, B.ui, { f1: 1700, attack: 0.001 });
      tn('triangle', 3200, t, 0.05, 0.05, B.ui, { attack: 0.001 });
    } else {
      tn('sine', 1300, t, 0.05, 0.09, B.ui, { f1: 900, attack: 0.001 });
    }
  },

  hitFlesh(pos, heavy = false) {
    if (!throttle('flesh', 25)) return;
    const c = ensureCtx(), t = c.currentTime, d = at(pos);
    nb(t, heavy ? 0.12 : 0.07, 'lowpass', heavy ? 900 : 1400, 200, heavy ? 0.4 : 0.25, d, 0.8, 0.001);
    tn('sine', heavy ? 90 : 130, t, 0.08, heavy ? 0.3 : 0.15, d, { f1: 50, attack: 0.001 });
  },

  killConfirm(headshot = false) {
    if (!throttle('kc', 40)) return;
    const c = ensureCtx(), t = c.currentTime;
    tn('sine', headshot ? 520 : 380, t, 0.14, headshot ? 0.12 : 0.07, B.ui, { f1: headshot ? 260 : 190, attack: 0.002 });
    if (headshot) nb(t, 0.18, 'bandpass', 3800, 2400, 0.06, B.ui, 3);
  },

  // ---------------- 敌人（带方位）
  growl(pos) {
    if (!throttle('growl', 350)) return;
    const c = ensureCtx(), t = c.currentTime, d = at(pos);
    const o = c.createOscillator(); o.type = 'sawtooth';
    const base = rnd(55, 95);
    o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 1.6, t + 0.25); o.frequency.linearRampToValueAtTime(base * 0.8, t + 0.7);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = rnd(380, 520); f.Q.value = 1.5;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    const l = c.createOscillator(); l.frequency.value = rnd(9, 15); const lg = c.createGain(); lg.gain.value = 16; l.connect(lg).connect(o.frequency);
    o.connect(f).connect(g).connect(d); o.start(t); o.stop(t + 0.85); l.start(t); l.stop(t + 0.85);
    nb(t, 0.6, 'bandpass', 900, 500, 0.05, d, 2, 0.1);
  },

  hop(pos, heavy = false) {
    if (!throttle('hop', heavy ? 40 : 70)) return;
    const c = ensureCtx(), t = c.currentTime, d = at(pos, null, 2.5, 1.4);
    tn('sine', heavy ? 70 : 110, t, heavy ? 0.22 : 0.1, heavy ? 0.5 : 0.16, d, { f1: 40, attack: 0.001 });
    nb(t, 0.06, 'lowpass', 700, 200, heavy ? 0.3 : 0.1, d, 0.7);
  },

  zombieDie(pos, kind = 'jiangshi') {
    if (!throttle('die', 60)) return;
    const c = ensureCtx(), t = c.currentTime, d = at(pos);
    if (kind === 'paper') { nb(t, 0.5, 'highpass', 2500, 1200, 0.2, d, 0.8, 0.01); this.fireball(pos); return; }
    if (kind === 'ghost' || kind === 'wuWhite' || kind === 'wuBlack') {
      tn('sine', 900, t, 0.9, 0.06, d, { f1: 300, attack: 0.02 });
      nb(t, 0.8, 'bandpass', 2000, 600, 0.08, d, 2, 0.05);
      return;
    }
    if (kind === 'imp') { tn('square', 900, t, 0.2, 0.05, d, { f1: 300 }); nb(t, 0.15, 'bandpass', 1800, 900, 0.08, d, 3); return; }
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(rnd(120, 150), t); o.frequency.exponentialRampToValueAtTime(35, t + 0.6);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = c.createGain(); g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    o.connect(f).connect(g).connect(d); o.start(t); o.stop(t + 0.7);
    tn('sine', 80, t + 0.35, 0.18, 0.25, d, { f1: 40, attack: 0.002 });
  },

  impChatter(pos) {
    if (!throttle('imp', 260)) return;
    const c = ensureCtx(), t = c.currentTime, d = at(pos);
    for (let i = 0; i < 3; i++) tn('square', rnd(700, 1300), t + i * 0.07, 0.05, 0.025, d, { f1: rnd(500, 900), attack: 0.002 });
  },

  paperRustle(pos) {
    if (!throttle('paper', 300)) return;
    const c = ensureCtx(), t = c.currentTime, d = at(pos);
    for (let i = 0; i < 4; i++) nb(t + i * rnd(0.03, 0.08), 0.05, 'highpass', 3500, 2500, 0.05, d, 1);
  },

  ghostWail(pos) {
    if (!throttle('wail', 450)) return;
    const c = ensureCtx(), t = c.currentTime, d = at(pos, null, 4, 0.9);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(700, t); o.frequency.linearRampToValueAtTime(1150, t + 0.3); o.frequency.linearRampToValueAtTime(480, t + 0.95);
    const l = c.createOscillator(); l.frequency.value = 7; const lg = c.createGain(); lg.gain.value = 30; l.connect(lg).connect(o.frequency);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    o.connect(g).connect(d); o.start(t); o.stop(t + 1.05); l.start(t); l.stop(t + 1.05);
  },

  playerHurt() {
    const c = ensureCtx(), t = c.currentTime;
    tn('triangle', 220, t, 0.25, 0.3, B.sfx, { f1: 70, attack: 0.002 });
    nb(t, 0.12, 'lowpass', 1200, 300, 0.35, B.sfx, 0.7);
    tn('sine', 60, t, 0.3, 0.4, B.sfx, { f1: 35 });
  },

  // 低血量心跳（持续）
  setLowHp(k) {
    if (!ctx) return;
    if (k <= 0.01) { if (heart) { clearInterval(heart.timer); heart = null; } return; }
    if (!heart) {
      heart = { k, timer: setInterval(() => {
        const t = ctx.currentTime, g = 0.25 + heart.k * 0.35;
        tn('sine', 58, t, 0.16, g, B.ui, { f1: 40, attack: 0.004 });
        tn('sine', 52, t + 0.2, 0.18, g * 0.7, B.ui, { f1: 38, attack: 0.004 });
      }, 820) };
    }
    heart.k = k;
  },

  waveHorn() {
    const c = ensureCtx(), t = c.currentTime;
    [0, 0.02].forEach((off, i) => {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(i ? 98 : 65.4, t + off);
      o.frequency.linearRampToValueAtTime(i ? 103 : 68, t + off + 1.0);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1100, t); f.frequency.exponentialRampToValueAtTime(220, t + 1.6);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + off); g.gain.exponentialRampToValueAtTime(0.22, t + off + 0.2);
      g.gain.setValueAtTime(0.22, t + off + 1.0); g.gain.exponentialRampToValueAtTime(0.001, t + off + 1.7);
      o.connect(f).connect(g).connect(B.sfx); o.start(t + off); o.stop(t + off + 1.8);
    });
    bigDrum(t, 0.5, B.sfx, 70);
    bigDrum(t + 0.45, 0.4, B.sfx, 70);
  },

  footstep(running = false) {
    if (!throttle('step', 120)) return;
    const c = ensureCtx(), t = c.currentTime;
    nb(t, 0.05, 'bandpass', rnd(380, 520), 300, running ? 0.12 : 0.08, B.sfx, 1.2, 0.002);
    nb(t + 0.01, 0.03, 'highpass', 2500, 2000, running ? 0.03 : 0.02, B.sfx, 1);
  },

  // ---------------- 道术与法器
  thunder(pos = null) {
    if (!throttle('thunder', 55)) return;
    const c = ensureCtx(), t = c.currentTime, d = pos ? at(pos, null, 6, 0.8) : B.sfx;
    nb(t, 0.08, 'highpass', 3000, 2000, 0.6, d, 0.7, 0.001);
    nb(t, 0.5, 'lowpass', 4500, 200, 0.6, d, 0.8);
    nb(t + 0.05, 1.5, 'lowpass', 600, 60, 0.45, B.wet, 0.7);
    tn('sine', 70, t, 0.6, 0.45, d, { f1: 30 });
  },

  thunderDistant(delay = 0.6) {
    const c = ensureCtx(), t = c.currentTime + delay;
    nb(t, 2.6, 'lowpass', 300, 50, 0.32, B.ambIn, 0.6, 0.25);
    nb(t + 0.2, 2.0, 'lowpass', 160, 40, 0.24, B.wet, 0.6, 0.3);
  },

  bell() {
    const c = ensureCtx(), t = c.currentTime;
    for (let k = 0; k < 3; k++) bellTone(1320, t + k * 0.09, 0.08, B.sfx, 1.6);
    tn('triangle', 660, t, 1.2, 0.08, B.sfx);
  },
  swordHit() {
    if (!throttle('swordHit', 40)) return;
    const c = ensureCtx(), t = c.currentTime;
    nb(t, 0.12, 'bandpass', 3000, 1200, 0.22, B.sfx, 3, 0.001);
    tn('triangle', 900, t, 0.08, 0.09, B.sfx, { f1: 500 });
    tn('sine', 120, t, 0.08, 0.2, B.sfx, { f1: 60 });
  },
  coin() {
    if (!throttle('coin', 60)) return;
    const c = ensureCtx(), t = c.currentTime;
    tn('square', 2400, t, 0.06, 0.04, B.sfx, { f1: 2600 }); bellTone(3100, t + 0.03, 0.025, B.sfx, 0.4);
  },
  whoosh() {
    if (!throttle('whoosh', 110)) return;
    const c = ensureCtx(), t = c.currentTime;
    nb(t, 0.35, 'bandpass', 400, 2000, 0.22, B.sfx, 1.5, 0.08);
  },
  bagua() {
    const c = ensureCtx(), t = c.currentTime;
    tn('sine', 220, t, 0.7, 0.22, B.sfx, { f1: 440 }); tn('triangle', 330, t + 0.05, 0.8, 0.12, B.sfx, { f1: 660 });
    nb(t, 0.6, 'highpass', 3000, 6000, 0.07, B.sfx);
    bellTone(880, t, 0.04, B.sfx, 1.4);
  },
  ricesplash() { const t = ensureCtx().currentTime; for (let i = 0; i < 6; i++) nb(t + i * 0.03, 0.08, 'highpass', 5000, 3000, 0.06, B.sfx); },
  inkSnap() { const t = ensureCtx().currentTime; nb(t, 0.08, 'bandpass', 2000, 800, 0.38, B.sfx, 4, 0.001); tn('square', 180, t, 0.12, 0.12, B.sfx, { f1: 90 }); },
  fireball(pos = null) {
    if (!throttle('fireball', 90)) return;
    const c = ensureCtx(), t = c.currentTime, d = pos ? at(pos) : B.sfx;
    nb(t, 0.7, 'lowpass', 1600, 300, 0.32, d, 0.7, 0.03);
    nb(t, 0.5, 'bandpass', 3000, 1500, 0.06, d, 1, 0.04);
  },
  explosion(pos = null) {
    if (!throttle('boom', 55)) return;
    const c = ensureCtx(), t = c.currentTime, d = pos ? at(pos, null, 5, 0.7) : B.sfx;
    nb(t, 0.05, 'highpass', 2500, 1500, 0.5, d, 0.6, 0.001);
    nb(t, 0.9, 'lowpass', 2600, 70, 0.75, d, 0.8);
    tn('sine', 95, t, 0.55, 0.7, d, { f1: 28 });
    nb(t + 0.05, 1.6, 'lowpass', 500, 60, 0.3, B.wet, 0.6);
  },
  pickup() {
    if (!throttle('pickup', 35)) return;
    const c = ensureCtx(), t = c.currentTime;
    const f = pick([1046.5, 1174.66, 1396.9, 1567.98, 1760, 2093]);
    tn('sine', f, t, 0.12, 0.05, B.ui, { attack: 0.002 }); tn('sine', f * 2, t, 0.06, 0.015, B.ui);
  },
  levelUp() {
    const c = ensureCtx(), t = c.currentTime;
    [293.66, 349.23, 392, 440, 587.33, 698.46].forEach((f, i) => pipa(f, t + i * 0.065, 0.16, B.ui, 0.5));
    bellTone(1174.66, t + 0.4, 0.06, B.ui, 2.4);
    gongHit(t, 0.08, B.ui, 220);
    this.duck(0.4, 1.2);
  },
  cardPick() { const t = ensureCtx().currentTime; pipa(587.33, t, 0.18, B.ui); pipa(880, t + 0.06, 0.12, B.ui); nb(t, 0.2, 'highpass', 5000, 8000, 0.04, B.ui); },
  cardHover() { if (!throttle('hover', 50)) return; const t = ensureCtx().currentTime; tn('sine', 1760, t, 0.04, 0.02, B.ui, { attack: 0.002 }); },
  uiClick() { const t = ensureCtx().currentTime; woodblock(t, 0.08, B.ui, 900); },
  chest() { const t = ensureCtx().currentTime; [392, 523.25, 659.26, 784, 1046.5].forEach((f, i) => bellTone(f, t + i * 0.06, 0.05, B.ui, 1.2)); cymbal(t + 0.3, 0.05, B.ui, 1.2); },
  heal() { const t = ensureCtx().currentTime; tn('sine', 440, t, 0.4, 0.12, B.ui, { f1: 880 }); tn('sine', 660, t + 0.06, 0.4, 0.08, B.ui, { f1: 1320 }); },
  shieldBreak() { const t = ensureCtx().currentTime; nb(t, 0.3, 'highpass', 3000, 1000, 0.3, B.sfx); tn('sine', 1600, t, 0.3, 0.12, B.sfx, { f1: 400 }); bellTone(1200, t, 0.05, B.sfx, 0.8); },
  dash() { const t = ensureCtx().currentTime; nb(t, 0.25, 'bandpass', 800, 3000, 0.3, B.sfx, 1.2, 0.03); tn('sine', 300, t, 0.15, 0.06, B.sfx, { f1: 900 }); },
  // 完美闪避：清越剑鸣 + 时间凝滞
  perfectDodge() {
    const c = ensureCtx(), t = c.currentTime;
    bellTone(2093, t, 0.16, B.ui, 1.8);
    tn('sine', 1046.5, t, 1.4, 0.12, B.ui, { f1: 1060 });
    nb(t, 0.5, 'bandpass', 900, 2600, 0.12, B.ui, 1.5, 0.01);
    nb(t, 0.6, 'highpass', 6000, 9000, 0.05, B.ui, 0.8, 0.01);
    this.duck(0.5, 0.9);
  },
  chain(pos = null) { const t = ensureCtx().currentTime, d = pos ? at(pos) : B.sfx; for (let i = 0; i < 6; i++) tn('square', rnd(1600, 2600), t + i * 0.035, 0.04, 0.045, d, { f1: 1500, attack: 0.001 }); },
  slam(pos = null) {
    const c = ensureCtx(), t = c.currentTime, d = pos ? at(pos, null, 6, 0.7) : B.sfx;
    nb(t, 0.8, 'lowpass', 900, 45, 0.85, d, 0.8);
    tn('sine', 62, t, 0.65, 0.8, d, { f1: 24 });
    nb(t + 0.03, 1.4, 'lowpass', 400, 50, 0.35, B.wet, 0.6);
  },
  bossRoar(pos = null) {
    if (!throttle('roar', 700)) return;
    const c = ensureCtx(), t = c.currentTime, d = pos ? at(pos, null, 10, 0.5) : B.sfx;
    for (const [f, dl] of [[62, 0], [93, 0.02], [124, 0.04], [186, 0.06]]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t + dl); o.frequency.linearRampToValueAtTime(f * 1.45, t + 0.45); o.frequency.linearRampToValueAtTime(f * 0.65, t + 1.7);
      const fl = c.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 600; fl.Q.value = 0.9;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.42, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      const l = c.createOscillator(); l.frequency.value = 22; const lg = c.createGain(); lg.gain.value = f * 0.08; l.connect(lg).connect(o.frequency);
      o.connect(fl).connect(g).connect(d); o.start(t + dl); o.stop(t + 1.9); l.start(t); l.stop(t + 1.9);
    }
    nb(t, 1.5, 'bandpass', 380, 160, 0.35, d, 0.8, 0.08);
    nb(t, 1.8, 'lowpass', 300, 60, 0.3, B.wet, 0.6, 0.1);
    this.duck(0.55, 1.6);
  },
  gong() {
    const t = ensureCtx().currentTime;
    gongHit(t, 0.32, B.sfx, 110);
    this.duck(0.35, 2);
  },
  bossIntro() {
    const t = ensureCtx().currentTime;
    for (let i = 0; i < 12; i++) bigDrum(t + i * (0.24 - i * 0.012), 0.2 + i * 0.03, B.sfx, 70);
    gongHit(t + 1.9, 0.4, B.sfx, 82, 0.94);
    cymbal(t + 1.9, 0.14, B.sfx, 3);
    choir([73.42, 110, 146.83, 174.61], t + 1.9, 3.2, 0.12, B.sfx);
    this.duck(0.85, 3.5);
  },
  victory() {
    const t = ensureCtx().currentTime;
    gongHit(t, 0.35, B.ui, 130.81);
    [293.66, 392, 440, 587.33, 783.99, 880].forEach((f, i) => guqin(f, t + 0.3 + i * 0.12, 1.8, 0.28, B.ui, { vib: false }));
    cymbal(t + 1.0, 0.08, B.ui, 3);
    this.duck(0.9, 3);
  },
  defeat() {
    const t = ensureCtx().currentTime;
    gongHit(t, 0.4, B.ui, 73.42, 0.9);
    erhu(440, t + 0.6, 2.2, 0.12, B.ui, { from: 523.25 });
    erhu(293.66, t + 2.6, 2.6, 0.1, B.ui, { from: 349.23 });
    this.duck(1, 5);
  },
  achievement() {
    const t = ensureCtx().currentTime;
    [587.33, 783.99, 1174.66].forEach((f, i) => bellTone(f, t + i * 0.1, 0.05, B.ui, 1.6));
  },
  scroll() {
    const t = ensureCtx().currentTime;
    nb(t, 0.4, 'highpass', 2000, 4000, 0.08, B.ui, 1, 0.08);
    guqin(392, t + 0.1, 1.6, 0.24, B.ui); guqin(587.33, t + 0.3, 1.8, 0.2, B.ui);
  },
  comboTick(n) {
    if (!throttle('combo', 60)) return;
    const t = ensureCtx().currentTime;
    const f = D_PENTA[Math.min(18, 8 + (n % 10))];
    pipa(f * 2, t, 0.06, B.ui, 0.2);
  },
  breathIn() { const t = ensureCtx().currentTime; nb(t, 0.6, 'bandpass', 1200, 700, 0.08, B.ui, 1.2, 0.2); },
  gasp() { const t = ensureCtx().currentTime; nb(t, 0.45, 'bandpass', 900, 1600, 0.16, B.ui, 1.4, 0.02); nb(t + 0.35, 0.4, 'bandpass', 800, 500, 0.08, B.ui, 1.2, 0.1); },
  ultCast() {
    const t = ensureCtx().currentTime;
    choir([146.83, 220, 293.66, 440], t, 2.6, 0.14, B.sfx, 'o');
    gongHit(t, 0.35, B.sfx, 98, 0.95);
    for (let i = 0; i < 3; i++) bellTone(1760, t + 0.3 + i * 0.15, 0.04, B.sfx, 1.4);
    this.duck(0.8, 2.6);
  },
  hordeWarn() {
    const t = ensureCtx().currentTime;
    for (let i = 0; i < 3; i++) bigDrum(t + i * 0.32, 0.55, B.sfx, 64);
    gongHit(t + 1.0, 0.24, B.sfx, 92, 0.93);
  },
  stagger() {
    const t = ensureCtx().currentTime;
    nb(t, 0.2, 'highpass', 3000, 1500, 0.3, B.sfx, 1);
    bellTone(660, t, 0.08, B.sfx, 1.4);
    tn('sine', 140, t, 0.4, 0.4, B.sfx, { f1: 50 });
  },

  // 对话打字音（元音共振峰嗓音）
  voice(id) {
    if (!throttle('voice', 55)) return;
    const c = ensureCtx(), t = c.currentTime;
    const V = VOICES[id] || VOICES.narrator;
    const [f1, f2] = pick(V.formants);
    const o = c.createOscillator(); o.type = V.type;
    const p = V.f * rnd(0.92, 1.12);
    o.frequency.setValueAtTime(p, t); o.frequency.linearRampToValueAtTime(p * rnd(0.9, 1.05), t + 0.08);
    const a = c.createBiquadFilter(); a.type = 'bandpass'; a.frequency.value = f1; a.Q.value = 5;
    const b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f2; b.Q.value = 7;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(V.eerie ? 0.5 : 0.7, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(a).connect(g); o.connect(b).connect(g);
    g.connect(B.voice);
    if (V.growl) { const l = c.createOscillator(); l.frequency.value = 30; const lg = c.createGain(); lg.gain.value = p * 0.15; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + 0.1); }
    if (V.eerie) { const l = c.createOscillator(); l.frequency.value = 8; const lg = c.createGain(); lg.gain.value = p * 0.05; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + 0.1); }
    o.start(t); o.stop(t + 0.1);
  },

  // ---------------- 配乐与环境
  startMusic(mood = 'calm') {
    ensureCtx();
    if (music && music.mood === mood) return;
    this.stopMusic();
    music = new Score(mood);
  },
  stopMusic(fade = 1.2) { if (music) { music.stop(fade); music = null; } },
  setIntensity(x) { if (music) music.setIntensity(x); },

  setAmbience(key) {
    ensureCtx();
    if (amb && amb.key === key) return;
    if (amb) amb.stop();
    amb = key ? new Ambience(key) : null;
    if (key) this.setReverb(key);
  },
};
