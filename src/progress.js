import { UPGRADES, upgradeCost } from './data.js';

const KEY = 'zombie-strike-save-v1';

export class Progress {
  constructor() {
    this.data = { yangqi: 0, maxLevel: 1, up: { hp: 0, spd: 0, dmg: 0, fu: 0 } };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        this.data.yangqi = d.yangqi || 0;
        this.data.maxLevel = Math.max(1, d.maxLevel || 1);
        Object.assign(this.data.up, d.up || {});
      }
    } catch (e) { /* 损坏存档忽略 */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* 忽略 */ }
  }

  get yangqi() { return this.data.yangqi; }
  addYangqi(n) { this.data.yangqi += Math.round(n); this.save(); }

  unlockLevel(n) {
    if (n > this.data.maxLevel) { this.data.maxLevel = n; this.save(); }
  }

  upLevel(key) { return this.data.up[key] || 0; }

  canBuy(key) {
    const lv = this.upLevel(key);
    return lv < UPGRADES[key].max && this.data.yangqi >= upgradeCost(key, lv);
  }

  buy(key) {
    if (!this.canBuy(key)) return false;
    this.data.yangqi -= upgradeCost(key, this.upLevel(key));
    this.data.up[key]++;
    this.save();
    return true;
  }

  // 各项加成
  get maxHpBonus() { return this.upLevel('hp') * 25; }
  get speedMult() { return 1 + this.upLevel('spd') * 0.07; }
  get damageMult() { return 1 + this.upLevel('dmg') * 0.09; }
  get talismanDmgBonus() { return this.upLevel('fu') * 35; }
  get talismanCdBonus() { return this.upLevel('fu') * 0.8; }
}
