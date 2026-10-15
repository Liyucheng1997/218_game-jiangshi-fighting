import { UPGRADES, upgradeCost } from './data.js';

const KEY = 'zombie-strike-save-v1';

// 局外存档：阳气、修行、战绩、成就、残卷、结局、设置（沿用 v1 存档键，旧档自动迁移）
export class Progress {
  constructor() {
    this.data = {
      yangqi: 0, maxLevel: 1, up: {},
      best: { chapter: 0, time: 0, kills: 0, level: 0, endless: 0, combo: 0 },
      runs: 0, cleared: false, seen: {},
      achv: {}, scrolls: {}, endings: {}, clearedDiff: {}, seenScenes: {},
      stats: { kills: 0, headshots: 0, deaths: 0, bosses: 0 },
      lastDiff: 'normal',
      settings: {
        master: 1, sfx: 0.6, music: 0.45, amb: 0.55, voice: 0.6,
        sens: 1, quality: 'high', view: 'tps', fov: 75,
        shake: 1, dmgNums: true, gore: true, subs: true,
      },
    };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        this.data.yangqi = d.yangqi || 0;
        this.data.maxLevel = Math.max(1, d.maxLevel || 1);
        for (const k of ['up', 'best', 'settings', 'seen', 'achv', 'scrolls', 'endings', 'clearedDiff', 'seenScenes', 'stats']) Object.assign(this.data[k], d[k] || {});
        this.data.runs = d.runs || 0;
        this.data.cleared = !!d.cleared;
        this.data.lastDiff = d.lastDiff || 'normal';
      }
    } catch (e) { /* 损坏存档忽略 */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* 忽略 */ }
  }

  get yangqi() { return this.data.yangqi; }
  get settings() { return this.data.settings; }
  get scrollCount() { return Object.keys(this.data.scrolls).length; }
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
  addScroll(id) { if (this.data.scrolls[id]) return false; this.data.scrolls[id] = Date.now(); this.save(); return true; }
  sceneSeen(id) { return !!this.data.seenScenes[id]; }
  markScene(id) { if (!this.data.seenScenes[id]) { this.data.seenScenes[id] = true; this.save(); } }
  record(run) {
    const b = this.data.best;
    b.chapter = Math.max(b.chapter, run.chapter);
    b.time = Math.max(b.time, Math.round(run.time));
    b.kills = Math.max(b.kills, run.kills);
    b.level = Math.max(b.level, run.level);
    b.endless = Math.max(b.endless, run.endless || 0);
    b.combo = Math.max(b.combo || 0, run.combo || 0);
    this.data.runs++;
    if (run.cleared) {
      this.data.cleared = true;
      this.data.clearedDiff[run.diff] = true;
    }
    if (run.ending) this.data.endings[run.ending] = true;
    if (!run.cleared && !run.quit) this.data.stats.deaths++;
    this.save();
  }
}
