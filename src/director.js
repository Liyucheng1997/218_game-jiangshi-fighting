import * as THREE from 'three';
import { CHAPTERS, ENDLESS_WAVE, ENEMIES } from './data.js';
import { ARENA_HALF } from './world.js';

// =====================================================================
//  战役导演：章节 → 限时波次（持续刷怪）→ 首领 → 过关；通关后进入无尽轮回
// =====================================================================
export class Director {
  constructor(enemies, world) {
    this.enemies = enemies;
    this.world = world;
    this.onWaveStart = null;     // (chapter, waveIdx, total)
    this.onBossStart = null;     // (chapter, bosses)
    this.onChapterClear = null;  // (chapter)
    this.reset();
  }

  reset() {
    this.chapter = 0;
    this.wave = 0;
    this.phase = 'idle';
    this.t = 0;
    this.waveT = 0;
    this.acc = 0;
    this.endless = false;
    this.endlessN = 0;
    this.bossList = [];
    this.runTime = 0;
  }

  get chapterDef() { return CHAPTERS[Math.min(this.chapter, CHAPTERS.length - 1)]; }
  get waveDef() { return this.endless ? ENDLESS_WAVE : this.chapterDef.waves[this.wave]; }
  get totalWaves() { return this.endless ? Infinity : this.chapterDef.waves.length; }

  startChapter(idx) {
    this.chapter = idx;
    this.wave = 0;
    this._startWave();
  }

  startEndless() {
    this.endless = true;
    this.endlessN = 0;
    this.chapter = CHAPTERS.length - 1;
    this.wave = 0;
    this._startWave();
  }

  _difficulty() {
    const base = [1, 1.9, 3.1][this.chapter] ?? 3.1;
    const w = this.endless ? this.endlessN : this.wave;
    const endless = this.endless ? Math.pow(1.16, this.endlessN) * 1.25 : 1;
    this.enemies.difficulty = {
      hp: base * (1 + w * 0.1) * endless,
      dmg: (1 + this.chapter * 0.35 + w * 0.05) * (this.endless ? 1 + this.endlessN * 0.06 : 1),
      speed: 1 + Math.min(0.25, this.chapter * 0.05 + (this.endless ? this.endlessN * 0.02 : 0)),
      bossHp: this.endless ? 1.3 * Math.pow(1.12, this.endlessN) : 1,
    };
  }

  _startWave() {
    this.phase = 'wave';
    this.waveT = 0;
    this.acc = 2;
    this._difficulty();
    this.onWaveStart?.(this.chapter, this.wave, this.totalWaves);
  }

  _startBoss() {
    this.phase = 'boss';
    const def = this.chapterDef;
    let types = def.boss;
    if (this.endless) {
      const opts = [['drought'], ['wuWhite', 'wuBlack'], ['hou']];
      types = opts[this.endlessN % opts.length];
    }
    const gate = new THREE.Vector3(0, 0, ARENA_HALF - 5);
    this.bossList = types.map((t, i) => this.enemies.spawn(t, gate.clone().add(new THREE.Vector3((i - (types.length - 1) / 2) * 5, 0, 0)), { hpMult: this.endless ? 1 + this.endlessN * 0.15 : 1 }));
    for (const [t, n] of Object.entries(def.bossEscort || {})) for (let k = 0; k < n; k++) this.spawnOne(t);
    this.onBossStart?.(this.chapter, this.bossList, this.endless ? this.bossList.map((b) => b.cfg.name).join(' · ') : def.bossName);
  }

  pickSpawn(ppos) {
    const pts = this.world.spawnPoints;
    for (let tries = 0; tries < 12; tries++) {
      let p;
      if (Math.random() < 0.55) p = pts[Math.floor(Math.random() * pts.length)].clone();
      else {
        const side = Math.floor(Math.random() * 4), along = (Math.random() - 0.5) * (ARENA_HALF * 2 - 8), e = ARENA_HALF - 3;
        p = side === 0 ? new THREE.Vector3(along, 0, -e) : side === 1 ? new THREE.Vector3(along, 0, e) : side === 2 ? new THREE.Vector3(-e, 0, along) : new THREE.Vector3(e, 0, along);
      }
      p.x += (Math.random() - 0.5) * 2.5; p.z += (Math.random() - 0.5) * 2.5;
      if (Math.hypot(p.x - ppos.x, p.z - ppos.z) < 13) continue;
      if (this.world.obstacles.some((b) => b.containsPoint(p.clone().setY(0.5)))) continue;
      return p;
    }
    return new THREE.Vector3(-ppos.x * 0.8 || 20, 0, -ppos.z * 0.8 || 20);
  }

  spawnOne(type, ppos = new THREE.Vector3(), opt = {}) {
    const p = opt.at || this.pickSpawn(ppos);
    return this.enemies.spawn(type, p, opt);
  }

  _pickType(pool) {
    const entries = Object.entries(pool);
    const tot = entries.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * tot;
    for (const [t, w] of entries) { r -= w; if (r <= 0) return t; }
    return entries[0][0];
  }

  update(dt, ppos) {
    if (this.phase === 'idle' || this.phase === 'cleared') return;
    this.runTime += dt;
    if (this.phase === 'wave') {
      const w = this.waveDef;
      this.waveT += dt;
      const rateK = 1 + this.waveT / w.dur * 0.35;
      this.acc += w.rate * rateK * dt * (this.endless ? 1 + this.endlessN * 0.08 : 1);
      const maxAlive = this.endless ? w.max + this.endlessN * 3 : w.max;
      while (this.acc >= 1 && this.enemies.aliveCount < maxAlive) {
        this.acc -= 1;
        const type = this._pickType(w.pool);
        const cfg = ENEMIES[type];
        const eliteChance = this.chapter === 0 && this.wave < 2 && !this.endless ? 0 : 0.025 + this.wave * 0.01 + this.chapter * 0.01;
        if (type === 'imp' && Math.random() < 0.35) {
          // 小鬼成群
          const at = this.pickSpawn(ppos);
          for (let k = 0; k < 4; k++) this.spawnOne('imp', ppos, { at: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3)) });
        } else {
          this.spawnOne(type, ppos, { elite: !cfg.boss && Math.random() < eliteChance });
        }
      }
      if (this.acc > 3) this.acc = 3;
      if (this.waveT >= w.dur) {
        if (this.endless) {
          this.endlessN++;
          if (this.endlessN % 3 === 0) this._startBoss();
          else this._startWave();
        } else if (this.wave + 1 < this.chapterDef.waves.length) {
          this.wave++;
          this._startWave();
        } else {
          this._startBoss();
        }
      }
    } else if (this.phase === 'boss') {
      // 首领战期间少量护卫持续涌入
      const w = this.endless ? ENDLESS_WAVE : this.chapterDef.waves[this.chapterDef.waves.length - 1];
      this.acc += w.rate * 0.35 * dt;
      while (this.acc >= 1 && this.enemies.aliveCount < w.max * 0.5) { this.acc -= 1; this.spawnOne(this._pickType(w.pool), ppos); }
      if (this.bossList.every((b) => !b.alive || b.dying)) {
        if (this.endless) { this.endlessN++; this._startWave(); }
        else { this.phase = 'cleared'; this.onChapterClear?.(this.chapter); }
      }
    }
  }
}
