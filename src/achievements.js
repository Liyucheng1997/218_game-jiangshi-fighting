import { Audio } from './audio.js';

// =====================================================================
//  成就：本地存档，解锁时弹出提示
// =====================================================================
export const ACHIEVEMENTS = [
  { id: 'ch1', name: '初出茅庐', desc: '通过第一章「义庄 · 尸变」', icon: '🏮' },
  { id: 'ch2', name: '雨夜焚纸', desc: '通过第二章「荒村 · 纸扎」', icon: '☔' },
  { id: 'ch3', name: '屠犼', desc: '击败僵尸之王 · 犼', icon: '🐲' },
  { id: 'clear', name: '逆天伏魔', desc: '击败玄阴子，通关全部章节', icon: '☯' },
  { id: 'trueEnd', name: '师恩如山', desc: '达成真结局', icon: '🌅' },
  { id: 'scrolls', name: '七星归位', desc: '集齐七卷茅山残卷', icon: '📜' },
  { id: 'hard', name: '伏魔真人', desc: '以「伏魔」或更高难度通关', icon: '⚔' },
  { id: 'hell', name: '渡劫', desc: '以「天劫」难度通关', icon: '⚡' },
  { id: 'kills500', name: '百鬼辟易', desc: '单局诛邪 500', icon: '💀' },
  { id: 'kills5000', name: '千尸斩', desc: '累计诛邪 5000', icon: '🗡' },
  { id: 'combo50', name: '连斩如风', desc: '达成 50 连斩', icon: '🌪' },
  { id: 'combo150', name: '一气化三清', desc: '达成 150 连斩', icon: '🔥' },
  { id: 'perfect10', name: '灵台清明', desc: '单局触发 10 次完美闪避', icon: '👁' },
  { id: 'headshot100', name: '百步穿杨', desc: '累计爆头击杀 100', icon: '🎯' },
  { id: 'stagger', name: '一击破绽', desc: '令首领跪地', icon: '🛡' },
  { id: 'nohit', name: '片叶不沾身', desc: '首领战中毫发无伤地击败首领', icon: '🍃' },
  { id: 'breath', name: '龟息', desc: '单局内闭气让 20 只僵尸失去踪迹', icon: '🐢' },
  { id: 'evo', name: '道法进阶', desc: '习得任一进阶道法', icon: '🌩' },
  { id: 'evo4', name: '万法归宗', desc: '单局习得全部四种进阶道法', icon: '✨' },
  { id: 'ult30', name: '五雷轰顶', desc: '一次天师降魔击杀 30 只邪祟', icon: '⛈' },
  { id: 'endless10', name: '轮回不息', desc: '无尽轮回达到第 10 轮', icon: '♾' },
  { id: 'codex', name: '百鬼夜行', desc: '在实战中见过所有邪祟', icon: '📖' },
];

const $ = (id) => document.getElementById(id);

export class Achievements {
  constructor(progress) {
    this.progress = progress;
    this.queue = [];
    this.showing = false;
  }

  has(id) { return !!this.progress.data.achv[id]; }

  unlock(id) {
    if (this.has(id)) return false;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return false;
    this.progress.data.achv[id] = Date.now();
    this.progress.save();
    this.queue.push(a);
    if (!this.showing) this._next();
    return true;
  }

  _next() {
    const a = this.queue.shift();
    const el = $('achv-toast');
    if (!a) { this.showing = false; return; }
    this.showing = true;
    el.innerHTML = `<div class="ic">${a.icon}</div><div><div class="t">成就达成</div><div class="n">${a.name}</div><div class="d">${a.desc}</div></div>`;
    el.classList.add('on');
    Audio.achievement();
    setTimeout(() => { el.classList.remove('on'); setTimeout(() => this._next(), 450); }, 3600);
  }

  get count() { return Object.keys(this.progress.data.achv).length; }
}
