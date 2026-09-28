import { UPGRADES, upgradeCost } from './data.js';

const KEY = 'zombie-strike-save-v1';

// 局外存档：阳气、修行等级、最佳战绩、设置
export class Progress {
  constructor() {
    this.data = {
      yangqi: 0, maxLevel: 1, up: {},
      best: { chapter: 0, time: 0, kills: 0, level: 0, endless: 0 },
      runs: 0, cleared: false, seen: {},
      settings: { sfx: 0.55, music: 0.35, sens: 1, quality: 'high', view: 'tps', fov: 75 },
    };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        this.data.yangqi = d.yangqi || 0;
        this.data.maxLevel = Math.max(1, d.maxLevel || 1);
        Object.assign(this.data.up, d.up || {});
        Object.assign(this.data.best, d.best || {});
        Object.assign(this.data.settings, d.settings || {});
        Object.assign(this.data.seen, d.seen || {});
        this.data.runs = d.runs || 0;
        this.data.cleared = !!d.cleared;
      }
    } catch (e) { /* 损坏存档忽略 */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* 忽略 */ }
  }

  get yangqi() { return this.data.yangqi; }
  get settings() { return this.data.settings; }
  addYangqi(n) { this.data.yangqi += Math.round(n); this.save(); }
  upLevel(key) { return this.data.up[key] || 0; }
  canBuy(key) {
    const lv = this.upLevel(key);
    return lv < UPGRADES[key].max && this.data.yangqi >= upgradeCost(key, lv);
  }
  buy(key) {
    if (!this.canBuy(key)) return false;
    this.data.yangqi -= upgradeCost(key, this.upLevel(key));
    this.data.up[key] = this.upLevel(key) + 1;
    this.save();
    return true;
  }
  markSeen(type) { if (!this.data.seen[type]) { this.data.seen[type] = true; this.save(); } }
  record(run) {
    const b = this.data.best;
    b.chapter = Math.max(b.chapter, run.chapter);
    b.time = Math.max(b.time, Math.round(run.time));
    b.kills = Math.max(b.kills, run.kills);
    b.level = Math.max(b.level, run.level);
    b.endless = Math.max(b.endless, run.endless || 0);
    this.data.runs++;
    if (run.cleared) this.data.cleared = true;
    this.save();
  }
}
