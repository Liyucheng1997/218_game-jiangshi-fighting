import * as THREE from 'three';
import { CHAPTERS, ENDLESS_WAVE, ENEMIES, DIFFICULTY } from './data.js';
import { ARENA_HALF } from './world.js';

// =====================================================================
//  战役导演：章节 → 限时波次 → 首领 → 过关；通关后无尽轮回
//  · 难度模式（入道 / 修行 / 伏魔 / 天劫）缩放血量、伤害、刷怪、精英、预警时长
//  · AI 导演：根据玩家压力（受伤、残血、近身敌数）调节节奏——
//    蓄势 → 高潮 → 喘息，保证张弛有度；并在波次中段掀起"尸潮"
// =====================================================================
export class Director {
  constructor(enemies, world) {
    this.enemies = enemies;
    this.world = world;
    this.onWaveStart = null;     // (chapter, waveIdx, total)
    this.onBossStart = null;     // (chapter, bosses, name)
    this.onChapterClear = null;  // (chapter)
    this.onHorde = null;         // (dirName, pos)
    this.mode = DIFFICULTY.normal;
    this.reset();
  }

  setDifficulty(id) { this.mode = DIFFICULTY[id] || DIFFICULTY.normal; }

  reset() {
    this.chapter = 0;
    this.wave = 0;
    this.phase = 'idle';
    this.waveT = 0;
    this.acc = 0;
    this.endless = false;
    this.endlessN = 0;
    this.bossList = [];
    this.runTime = 0;
    this.stress = 0;
    this.tempo = 'build';
    this.tempoT = 0;
    this.intensity = 0.3;
    this.horde = null;
    this.paused = false;
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

  // 玩家受伤时调用：压力上升
  playerHurt(frac) { this.stress = Math.min(1.5, this.stress + frac * 2.2); }

  _difficulty() {
    const M = this.mode;
    const base = [1, 1.9, 3.1, 4.0][this.chapter] ?? 4.0;
    const w = this.endless ? this.endlessN : this.wave;
    const endless = this.endless ? Math.pow(1.16, this.endlessN) * 1.25 : 1;
    Object.assign(this.enemies.difficulty, {
      hp: base * (1 + w * 0.1) * endless * M.hp,
      dmg: (1 + this.chapter * 0.32 + w * 0.05) * (this.endless ? 1 + this.endlessN * 0.06 : 1) * M.dmg,
      speed: 1 + Math.min(0.25, this.chapter * 0.05 + (this.endless ? this.endlessN * 0.02 : 0)),
      bossHp: (this.endless ? 1.3 * Math.pow(1.12, this.endlessN) : 1) * M.bossHp,
      aggro: M.aggro * (1 + this.chapter * 0.04),
      tele: M.tele,
      affixes: M.affixes + (this.endless && this.endlessN >= 4 ? 1 : 0),
    });
  }

  _startWave() {
    this.phase = 'wave';
    this.waveT = 0;
    this.acc = 2;
    this._difficulty();
    const w = this.waveDef;
    // 第二波起，波次中段必有一次尸潮
    this.horde = (this.wave >= 1 || this.endless) ? { at: w.dur * (0.35 + Math.random() * 0.3), done: false } : null;
    this.onWaveStart?.(this.chapter, this.wave, this.totalWaves);
  }

  _startBoss() {
    this.phase = 'boss';
    const def = this.chapterDef;
    let types = def.boss;
    if (this.endless) {
      const opts = [['drought'], ['wuWhite', 'wuBlack'], ['hou'], ['sorcerer']];
      types = opts[Math.floor(this.endlessN / 3 - 1) % opts.length] || opts[0];
    }
    this._difficulty();
    const gate = def.bossAt && !this.endless ? new THREE.Vector3(def.bossAt[0], 0, def.bossAt[1]) : new THREE.Vector3(0, 0, ARENA_HALF - 7);
    this.bossList = types.map((t, i) => this.enemies.spawn(t, gate.clone().add(new THREE.Vector3((i - (types.length - 1) / 2) * 5, 0, 0)), { hpMult: this.endless ? 1 + this.endlessN * 0.15 : 1, instant: false }));
    for (const [t, n] of Object.entries(def.bossEscort || {})) for (let k = 0; k < n; k++) this.spawnOne(t);
    this.onBossStart?.(this.chapter, this.bossList, this.endless ? this.bossList.map((b) => b.cfg.name).join(' · ') : def.bossName);
  }

  pickSpawn(ppos, side = -1) {
    const pts = this.world.spawnPoints;
    for (let tries = 0; tries < 14; tries++) {
      let p;
      if (side < 0 && Math.random() < 0.55) p = pts[Math.floor(Math.random() * pts.length)].clone();
      else {
        const sd = side >= 0 ? side : Math.floor(Math.random() * 4), along = (Math.random() - 0.5) * (ARENA_HALF * 2 - 8), e = ARENA_HALF - 3;
        p = sd === 0 ? new THREE.Vector3(along, 0, -e) : sd === 1 ? new THREE.Vector3(along, 0, e) : sd === 2 ? new THREE.Vector3(-e, 0, along) : new THREE.Vector3(e, 0, along);
      }
      p.x += (Math.random() - 0.5) * 2.5; p.z += (Math.random() - 0.5) * 2.5;
      if (Math.hypot(p.x - ppos.x, p.z - ppos.z) < 13) continue;
      if (this.world.obstacles.some((b) => b.containsPoint(p.clone().setY(0.5)))) continue;
      return p;
    }
    return new THREE.Vector3(-ppos.x * 0.8 || 20, 0, -ppos.z * 0.8 || 20);
  }

  spawnOne(type, ppos = new THREE.Vector3(), opt = {}) {
    const p = opt.at || this.pickSpawn(ppos, opt.side ?? -1);
    return this.enemies.spawn(type, p, opt);
  }

  _pickType(pool) {
    const entries = Object.entries(pool);
    const tot = entries.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * tot;
    for (const [t, w] of entries) { r -= w; if (r <= 0) return t; }
    return entries[0][0];
  }

  // AI 导演：压力模型
  _tempo(dt, ppos, hpFrac) {
    let near = 0;
    for (const e of this.enemies.list) {
      if (!e.alive || e.dying) continue;
      const d = Math.hypot(e.root.position.x - ppos.x, e.root.position.z - ppos.z);
      if (d < 8) near += e.boss ? 3 : e.elite ? 2 : 1;
    }
    const target = Math.min(1.2, near / 14 + (1 - hpFrac) * 0.5);
    this.stress += (target - this.stress) * Math.min(1, dt * 0.6);
    this.stress = Math.max(0, this.stress - dt * 0.03);
    this.tempoT += dt;
    if (this.tempo === 'build' && (this.stress > 0.85 || this.tempoT > 26)) { this.tempo = 'peak'; this.tempoT = 0; }
    else if (this.tempo === 'peak' && this.tempoT > 7 + Math.random() * 3) { this.tempo = 'relax'; this.tempoT = 0; }
    else if (this.tempo === 'relax' && this.tempoT > 5.5 && this.stress < 0.55) { this.tempo = 'build'; this.tempoT = 0; }
    const want = this.phase === 'boss' ? 0.85 + this.stress * 0.15 : Math.min(1, 0.25 + near / 18 + this.stress * 0.45 + (this.tempo === 'peak' ? 0.15 : 0));
    this.intensity += (want - this.intensity) * Math.min(1, dt * 0.8);
    return this.tempo === 'relax' ? 0.35 : this.tempo === 'peak' ? 1.25 : 1.0;
  }

  update(dt, ppos, hpFrac = 1) {
    if (this.phase === 'idle' || this.phase === 'cleared' || this.paused) return;
    this.runTime += dt;
    const tempoK = this._tempo(dt, ppos, hpFrac);
    const M = this.mode;
    if (this.phase === 'wave') {
      const w = this.waveDef;
      this.waveT += dt;
      const rateK = 1 + this.waveT / w.dur * 0.35;
      this.acc += w.rate * rateK * dt * (this.endless ? 1 + this.endlessN * 0.08 : 1) * M.spawn * tempoK;
      const maxAlive = Math.round((this.endless ? w.max + this.endlessN * 3 : w.max) * Math.min(1.25, M.spawn));
      while (this.acc >= 1 && this.enemies.aliveCount < maxAlive) {
        this.acc -= 1;
        const type = this._pickType(w.pool);
        const cfg = ENEMIES[type];
        const eliteChance = (this.chapter === 0 && this.wave < 2 && !this.endless ? 0 : 0.025 + this.wave * 0.01 + this.chapter * 0.01) * M.elite;
        if (type === 'imp' && Math.random() < 0.35) {
          const at = this.pickSpawn(ppos);
          for (let k = 0; k < 4; k++) this.spawnOne('imp', ppos, { at: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3)) });
        } else if (type === 'soldier' && Math.random() < 0.5) {
          // 阴兵三人成列
          const at = this.pickSpawn(ppos);
          const side = new THREE.Vector3(-(at.z - ppos.z), 0, at.x - ppos.x).normalize();
          for (let k = -1; k <= 1; k++) this.spawnOne('soldier', ppos, { at: at.clone().addScaledVector(side, k * 1.3) });
        } else {
          this.spawnOne(type, ppos, { elite: !cfg.boss && Math.random() < eliteChance });
        }
      }
      if (this.acc > 3) this.acc = 3;
      // 尸潮
      if (this.horde && !this.horde.done && this.waveT >= this.horde.at) {
        this.horde.done = true;
        const side = Math.floor(Math.random() * 4);
        const names = ['北', '南', '西', '东'];
        const e = ARENA_HALF - 3;
        const dirPos = [new THREE.Vector3(0, 0, -e), new THREE.Vector3(0, 0, e), new THREE.Vector3(-e, 0, 0), new THREE.Vector3(e, 0, 0)][side];
        this.onHorde?.(names[side], dirPos);
        const n = Math.round((10 + this.chapter * 3 + (this.endless ? this.endlessN : 0)) * Math.min(1.3, M.spawn));
        for (let k = 0; k < n; k++) {
          this.enemies.later(2.5 + k * 0.12, () => {
            const t = this._pickType(w.pool);
            this.spawnOne(t, ppos, { side, elite: k === 0 && this.chapter > 0 });
          });
        }
      }
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
      const w = this.endless ? ENDLESS_WAVE : this.chapterDef.waves[this.chapterDef.waves.length - 1];
      this.acc += w.rate * 0.3 * dt * M.spawn * tempoK;
      while (this.acc >= 1 && this.enemies.aliveCount < w.max * 0.45) { this.acc -= 1; this.spawnOne(this._pickType(w.pool), ppos); }
      if (this.bossList.every((b) => !b.alive || b.dying)) {
        if (this.endless) { this.endlessN++; this._startWave(); }
        else { this.phase = 'cleared'; this.onChapterClear?.(this.chapter); }
      }
    }
  }
}
