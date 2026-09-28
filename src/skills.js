import * as THREE from 'three';
import { Audio } from './audio.js';
import { TALISMAN } from './data.js';
import { buildPeachSword } from './gfx/guns.js';
import { canvasTexture, talismanTexture, softDotTexture } from './gfx/textures.js';
import { getTemplate } from './gfx/characters.js';
import { instantiate } from './gfx/rig.js';
import { posePaper } from './gfx/anim.js';

// =====================================================================
//  茅山道术：自动施放的道法、被动修身、进阶道法、法宝、火符与天师降魔
// =====================================================================

export const ARTS = {
  thunder: {
    name: '五雷正法', icon: '⚡', color: '#9fd0ff', max: 5,
    desc: (l) => `召天雷劈击 ${[1, 2, 2, 3, 3][l - 1]} 个邪祟，伤害 ${45 + l * 18}，附带短暂麻痹`,
    lore: '掌心雷诀，五雷轰顶，专劈阴邪。',
  },
  swords: {
    name: '桃木剑阵', icon: '🗡', color: '#ffb080', max: 5,
    desc: (l) => `${1 + l} 柄桃木剑环身飞旋，触之即伤 ${20 + l * 7}`,
    lore: '桃木乃五木之精，最能辟邪。',
  },
  coins: {
    name: '铜钱剑', icon: '🪙', color: '#ffd060', max: 5,
    desc: (l) => `自动掷出铜钱剑 ×${[1, 1, 2, 2, 3][l - 1]}，伤害 ${28 + l * 10}，贯穿 ${1 + Math.floor(l / 2)}`,
    lore: '以百枚铜钱红绳串成，聚万人阳气。',
  },
  bagua: {
    name: '八卦镜', icon: '☯', color: '#ffe080', max: 5,
    desc: (l) => `每 ${(7 - l * 0.5).toFixed(1)} 秒照出金光，半径 ${(4.5 + l * 0.6).toFixed(1)} 米，伤害 ${40 + l * 15} 并震退`,
    lore: '八卦照妖，邪祟现形，退避三舍。',
  },
  rice: {
    name: '糯米阵', icon: '🍚', color: '#f4f0e0', max: 5,
    desc: (l) => `撒下糯米，形成 ${1 + Math.floor(l / 3)} 处阵地，每秒伤害 ${14 + l * 6}（僵尸 ×2）并减速`,
    lore: '糯米拔尸毒，僵尸踏之如履火炭。',
  },
  inkline: {
    name: '墨斗线', icon: '〰', color: '#ff6060', max: 5,
    desc: (l) => `弹出 ${2 + l} 道墨斗线，伤害 ${30 + l * 12}，定身 ${(1.2 + l * 0.2).toFixed(1)} 秒`,
    lore: '墨斗弹线，封棺镇尸，尸不敢越。',
  },
  bell: {
    name: '三清铃', icon: '🔔', color: '#e0c080', max: 5,
    desc: (l) => `摇铃震魂，半径 ${(5 + l * 0.5).toFixed(1)} 米内邪祟眩晕 ${(1 + l * 0.2).toFixed(1)} 秒（对鬼怪伤害 ×2）`,
    lore: '三清铃响，魂魄归位，鬼怪丧胆。',
  },
  paperman: {
    name: '纸人替身', icon: '🎎', color: '#ffb0b0', max: 5,
    desc: (l) => `召出纸人替身吸引邪祟 5 秒，随后自焚爆炸造成 ${60 + l * 30} 伤害`,
    lore: '剪纸为人，替主受劫，以邪治邪。',
  },
  beidou: {
    name: '七星剑诀', icon: '✦', color: '#c0b0ff', max: 5,
    desc: (l) => `北斗七星自天而降，每颗星伤害 ${50 + l * 20}${l >= 5 ? '，连降两轮' : ''}`,
    lore: '踏罡步斗，引北斗星力诛邪。',
  },
};

export const PASSIVES = {
  vitality: { name: '金刚护体', icon: '🛡', max: 5, desc: () => '生命上限 +20，并回复 20 点' },
  regen: { name: '净心神咒', icon: '💚', max: 5, desc: () => '每秒回复 0.5 点生命' },
  swift: { name: '神行符', icon: '🦶', max: 5, desc: () => '移动速度 +7%' },
  magnet: { name: '聚阳诀', icon: '🧲', max: 4, desc: () => '阳气珠拾取范围 +35%' },
  blood: { name: '黑狗血弹', icon: '🩸', max: 5, desc: () => '枪械伤害 +12%' },
  quick: { name: '连环手', icon: '✋', max: 5, desc: () => '射速 +8%，换弹 +12%' },
  cinnabar: { name: '朱砂弹头', icon: '🔴', max: 5, desc: () => '暴击率 +7%（暴击 ×2）' },
  eye: { name: '天眼通', icon: '👁', max: 3, desc: () => '爆头伤害 +25%' },
  daoxin: { name: '道心坚定', icon: '🕯', max: 5, desc: () => '道术伤害 +12%' },
  jue: { name: '掐诀如飞', icon: '☝', max: 5, desc: () => '道术冷却 -7%' },
  yang: { name: '吸阳术', icon: '☀', max: 3, desc: () => '每诛一邪回复 0.5 生命' },
  golden: { name: '金光咒', icon: '✨', max: 4, desc: (l) => `金光护体：抵挡一次伤害，${Math.max(6, 16 - l * 2.5).toFixed(1)} 秒重生${l >= 3 ? '，可叠 2 层' : ''}` },
  armor: { name: '铁布衫', icon: '🧱', max: 4, desc: () => '受到伤害 -7%' },
  insight: { name: '悟道', icon: '📿', max: 4, desc: () => '阳气珠经验 +10%' },
  fireFu: { name: '火符精进', icon: '🔥', max: 4, desc: () => '火符伤害 +35，冷却 -0.8 秒' },
  fuMulti: { name: '火符连珠', icon: '📜', max: 3, desc: () => '每次多掷 1 张火符' },
  fuBurn: { name: '三昧真火', icon: '♨', max: 3, desc: (l) => `火符爆炸处留下真火，每秒灼烧 ${15 + l * 10}` },
};

export const WEAPON_CARDS = {
  thompson: { name: '汤姆逊冲锋枪', icon: '🔫', desc: '获得：弹鼓 50 发，高射速' },
  ak47: { name: 'AK-47', icon: '🔫', desc: '获得：威力与射速兼备的突击步枪' },
  shotgun: { name: '双管猎枪', icon: '💥', desc: '获得：9 颗弹丸近距离毁灭打击、强击退' },
  gatling: { name: '加特林', icon: '⚙', desc: '获得：转管预热后倾泻火力（移速降低）' },
};

export const EVOLUTIONS = {
  thunderEvo: { name: '九天应元雷', icon: '🌩', base: 'thunder', need: ['daoxin', 2], desc: '五雷正法进阶：每道天雷弹射 3 次，并额外多劈 2 道' },
  swordsEvo: { name: '万剑归宗', icon: '⚔', base: 'swords', need: ['swift', 1], desc: '桃木剑阵进阶：每 3.5 秒诸剑齐发射向邪祟，伤害翻倍' },
  baguaEvo: { name: '太极两仪镜', icon: '☯', base: 'bagua', need: ['golden', 1], desc: '八卦镜进阶：金光每击中一只邪祟回复 1 生命，并在原地留下持续 3 秒的太极阵' },
  inkEvo: { name: '天罗地网', icon: '🕸', base: 'inkline', need: ['jue', 1], desc: '墨斗线进阶：墨线化网滞留 3 秒，反复定身并伤害越线邪祟' },
};

export const RELICS = {
  zushi: { name: '茅山祖师令', icon: '🔱', desc: '已习得的所有道术 +1 级' },
  tianshi: { name: '天师印', icon: '🟥', desc: '道术伤害 +30%' },
  qixing: { name: '七星续命灯', icon: '🏮', desc: '阵亡时复活一次，回复 60% 生命' },
  hulu: { name: '黑狗血葫芦', icon: '🍶', desc: '枪械伤害 +25%，暴击率 +10%' },
  daopao: { name: '八卦道袍', icon: '☯', desc: '生命上限 +50，受到伤害 -10%' },
  qiankun: { name: '乾坤袋', icon: '👝', desc: '升级时多一个选项，重掷 +2' },
  yinhun: { name: '引魂幡', icon: '🎏', desc: '经验 +30%，拾取范围 +50%' },
  wudi: { name: '五帝钱', icon: '🪙', desc: '火符冷却 -30%，伤害 +50%' },
};

const RARITY = { common: '凡品', rare: '灵品', epic: '仙品', legend: '神品' };

// ---------------------------------------------------------------- 共享资源
function coinTexture() {
  return canvasTexture(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    const gr = g.createRadialGradient(32, 32, 6, 32, 32, 32);
    gr.addColorStop(0, '#ffe8a0'); gr.addColorStop(1, '#b88a2a');
    g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#7a5410'; g.lineWidth = 3; g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.stroke();
    g.clearRect(26, 26, 12, 12);
    g.fillStyle = '#6a4a10'; g.font = 'bold 12px serif'; g.textAlign = 'center';
    g.fillText('乾', 32, 20); g.fillText('隆', 32, 54); g.fillText('通', 16, 36); g.fillText('寶', 48, 36);
  });
}
function riceTexture() {
  return canvasTexture(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,250,235,0.25)'); gr.addColorStop(0.8, 'rgba(255,250,235,0.12)'); gr.addColorStop(1, 'rgba(255,250,235,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1600; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 118;
      g.fillStyle = `rgba(${240 + Math.random() * 15},${236 + Math.random() * 15},${220 + Math.random() * 20},${0.7 + Math.random() * 0.3})`;
      g.beginPath(); g.ellipse(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 2.2, 1.1, Math.random() * 3, 0, Math.PI * 2); g.fill();
    }
  });
}

export class SkillSystem {
  constructor(ctx) {
    this.ctx = ctx;   // { scene, enemies, effects, world, player(), meta }
    this.scene = ctx.scene;
    this._q = [];
    this.projectiles = [];
    this.fields = [];
    this.swordMeshes = [];
    this.coinTex = coinTexture();
    this.riceTex = riceTexture();
    this.fuMat = new THREE.MeshBasicMaterial({ map: talismanTexture(64, 160, true), side: THREE.DoubleSide });
    this.fuGeo = new THREE.PlaneGeometry(0.2, 0.5);
    this.glowTex = softDotTexture();
    this.reset();
  }

  reset(meta = null) {
    for (const p of this.projectiles) this.scene.remove(p.obj);
    for (const f of this.fields) this.scene.remove(f.obj);
    for (const s of this.swordMeshes) this.scene.remove(s);
    if (this.decoyInst) this.decoyInst.forEach((d) => this.scene.remove(d.root));
    this.projectiles = [];
    this.fields = [];
    this.swordMeshes = [];
    this.decoyInst = [];
    this.arts = {};          // id -> level
    this.passives = {};      // id -> level
    this.evos = {};          // id -> true
    this.relics = {};        // id -> true
    this.weapons = { mauser: 0, sword: 0 };  // id -> 升级等级
    this.cd = {};
    this.swordAngle = 0;
    this.swordVolley = 0;
    this.shield = 0;
    this.shieldT = 0;
    this.fuCd = 0;
    this.ult = 0;
    this.revived = false;
    this.meta = meta || this.meta || { up: {} };
    this.rerolls = 1 + (this.meta.up?.luck || 0);
    this.recompute();
  }

  lv(id) { return this.arts[id] || this.passives[id] || 0; }

  // ---------------------------------------------------------------- 属性汇总
  recompute() {
    const P = (k) => this.passives[k] || 0;
    const R = (k) => (this.relics[k] ? 1 : 0);
    const up = this.meta.up || {};
    const s = {
      maxHp: 100 + (up.hp || 0) * 15 + P('vitality') * 20 + R('daopao') * 50,
      regen: P('regen') * 0.5,
      moveMult: (1 + (up.spd || 0) * 0.05) * (1 + P('swift') * 0.07),
      magnet: 3.2 * (1 + P('magnet') * 0.35) * (1 + R('yinhun') * 0.5),
      gunDmg: (1 + (up.dmg || 0) * 0.07) * (1 + P('blood') * 0.12) * (1 + R('hulu') * 0.25),
      fireRate: 1 + P('quick') * 0.08,
      reloadMult: 1 + P('quick') * 0.12,
      crit: P('cinnabar') * 0.07 + R('hulu') * 0.1,
      headMult: 1 + P('eye') * 0.25,
      artDmg: (1 + P('daoxin') * 0.12) * (1 + R('tianshi') * 0.3),
      artCd: Math.pow(0.93, P('jue')),
      lifesteal: P('yang') * 0.5,
      shieldMax: P('golden') ? (P('golden') >= 3 ? 2 : 1) : 0,
      shieldCd: Math.max(6, 16 - P('golden') * 2.5),
      armor: 1 - Math.min(0.6, P('armor') * 0.07 + R('daopao') * 0.1),
      xpMult: (1 + (up.xp || 0) * 0.08) * (1 + P('insight') * 0.1) * (1 + R('yinhun') * 0.3),
      fuDmg: (TALISMAN.damage + (up.fu || 0) * 25 + P('fireFu') * 35) * (1 + R('wudi') * 0.5),
      fuCd: Math.max(2, (TALISMAN.cooldown - (up.fu || 0) * 0.6 - P('fireFu') * 0.8) * (1 - R('wudi') * 0.3)),
      fuCount: 1 + P('fuMulti'),
      fuBurn: P('fuBurn') ? 15 + P('fuBurn') * 10 : 0,
      cards: 3 + R('qiankun'),
      luck: up.luck || 0,
    };
    this.stats = s;
    return s;
  }

  // ---------------------------------------------------------------- 抽卡
  rollCards(n = this.stats.cards, source = 'level') {
    const pool = [];
    const ownedArts = Object.keys(this.arts).length;
    const ownedGuns = Object.keys(this.weapons).filter((w) => w !== 'sword').length;
    for (const [id, a] of Object.entries(ARTS)) {
      const l = this.arts[id] || 0;
      if (l >= a.max) continue;
      if (!l && ownedArts >= 6) continue;
      pool.push({ kind: 'art', id, level: l + 1, w: l ? 12 : 9, rarity: l ? (l >= 3 ? 'epic' : 'rare') : 'rare', name: a.name, icon: a.icon, desc: a.desc(l + 1), color: a.color });
    }
    for (const [id, p] of Object.entries(PASSIVES)) {
      const l = this.passives[id] || 0;
      if (l >= p.max) continue;
      pool.push({ kind: 'passive', id, level: l + 1, w: 7, rarity: 'common', name: p.name, icon: p.icon, desc: p.desc(l + 1) });
    }
    for (const [id, w] of Object.entries(WEAPON_CARDS)) {
      if (this.weapons[id] !== undefined || ownedGuns >= 4) continue;
      pool.push({ kind: 'weapon', id, level: 1, w: 6, rarity: 'epic', name: w.name, icon: w.icon, desc: w.desc });
    }
    for (const id of Object.keys(this.weapons)) {
      const l = this.weapons[id];
      if (l >= 3) continue;
      const nm = { mauser: '驳壳枪', thompson: '汤姆逊', ak47: 'AK-47', shotgun: '双管猎枪', gatling: '加特林', sword: '桃木剑' }[id];
      pool.push({ kind: 'wup', id, level: l + 1, w: 4, rarity: 'rare', name: `${nm} · 改良`, icon: '🔧', desc: id === 'sword' ? '桃木剑伤害 +30%，挥砍范围 +15%' : `${nm} 伤害 +20%，弹容 +25%，换弹更快` });
    }
    for (const [id, e] of Object.entries(EVOLUTIONS)) {
      if (this.evos[id]) continue;
      if ((this.arts[e.base] || 0) >= 5 && (this.passives[e.need[0]] || 0) >= e.need[1]) {
        pool.push({ kind: 'evo', id, level: 1, w: 40, rarity: 'legend', name: e.name, icon: e.icon, desc: e.desc });
      }
    }
    // 幸运加成：提高稀有卡权重
    const luck = this.stats.luck;
    for (const c of pool) if (c.rarity === 'epic' || c.rarity === 'legend') c.w *= 1 + luck * 0.25;
    if (source === 'chest') for (const c of pool) if (c.kind === 'art' || c.kind === 'evo') c.w *= 2;
    const out = [];
    const bag = pool.slice();
    while (out.length < n && bag.length) {
      const tot = bag.reduce((a, c) => a + c.w, 0);
      let r = Math.random() * tot;
      let i = 0;
      for (; i < bag.length; i++) { r -= bag[i].w; if (r <= 0) break; }
      out.push(bag.splice(Math.min(i, bag.length - 1), 1)[0]);
    }
    while (out.length < n) {
      out.push(out.length % 2
        ? { kind: 'heal', id: 'heal', rarity: 'common', name: '回春丹', icon: '💊', desc: '立即回复 40% 生命' }
        : { kind: 'gold', id: 'gold', rarity: 'common', name: '阳气结晶', icon: '🔆', desc: '局后阳气 +60' });
    }
    out.forEach((c) => { c.rarityName = RARITY[c.rarity]; });
    return out;
  }

  rollRelics(n = 3) {
    const ids = Object.keys(RELICS).filter((k) => !this.relics[k]);
    const out = [];
    while (out.length < n && ids.length) {
      const id = ids.splice(Math.floor(Math.random() * ids.length), 1)[0];
      const r = RELICS[id];
      out.push({ kind: 'relic', id, rarity: 'legend', rarityName: '法宝', name: r.name, icon: r.icon, desc: r.desc });
    }
    return out;
  }

  apply(card) {
    const c = card;
    switch (c.kind) {
      case 'art': this.arts[c.id] = (this.arts[c.id] || 0) + 1; this.cd[c.id] ??= 0.5; break;
      case 'passive':
        this.passives[c.id] = (this.passives[c.id] || 0) + 1;
        if (c.id === 'vitality') this.ctx.healPlayer?.(20, true);
        if (c.id === 'golden') this.shield = Math.max(this.shield, 1);
        break;
      case 'weapon': this.weapons[c.id] = 0; this.ctx.onWeaponGained?.(c.id); break;
      case 'wup': this.weapons[c.id] = (this.weapons[c.id] || 0) + 1; this.ctx.onWeaponUpgraded?.(c.id); break;
      case 'evo': this.evos[c.id] = true; break;
      case 'relic':
        this.relics[c.id] = true;
        if (c.id === 'zushi') for (const k of Object.keys(this.arts)) this.arts[k] = Math.min(ARTS[k].max, this.arts[k] + 1);
        if (c.id === 'qiankun') this.rerolls += 2;
        break;
      case 'heal': this.ctx.healPlayer?.(0.4, false, true); break;
      case 'gold': this.ctx.addGold?.(60); break;
    }
    this.recompute();
    this.ctx.onStatsChanged?.();
  }

  // 列表（HUD 显示）
  ownedList() {
    const list = [];
    for (const [id, l] of Object.entries(this.arts)) {
      const evo = Object.entries(EVOLUTIONS).find(([k, e]) => e.base === id && this.evos[k]);
      list.push({ id, icon: evo ? evo[1].icon : ARTS[id].icon, name: evo ? evo[1].name : ARTS[id].name, level: l, max: ARTS[id].max, cd: this.cd[id] || 0, cdMax: this._artCd(id), evo: !!evo, kind: 'art' });
    }
    for (const [id, l] of Object.entries(this.passives)) list.push({ id, icon: PASSIVES[id].icon, name: PASSIVES[id].name, level: l, max: PASSIVES[id].max, kind: 'passive' });
    for (const id of Object.keys(this.relics)) list.push({ id, icon: RELICS[id].icon, name: RELICS[id].name, kind: 'relic' });
    return list;
  }

  _artCd(id) {
    const l = this.arts[id] || 1;
    const base = { thunder: 3.0 - l * 0.2, swords: 0, coins: 1.6 - l * 0.1, bagua: 7 - l * 0.5, rice: 5.5 - l * 0.4, inkline: 8 - l * 0.6, bell: 6 - l * 0.4, paperman: 14 - l, beidou: 10 - l * 0.7 }[id];
    return base * this.stats.artCd;
  }

  dmg(base) {
    const d = base * this.stats.artDmg;
    return d;
  }

  // ---------------------------------------------------------------- 主更新
  update(dt, player) {
    const pos = player.position;
    const feet = new THREE.Vector3(pos.x, 0, pos.z);
    // 护盾
    if (this.stats.shieldMax > 0 && this.shield < this.stats.shieldMax) {
      this.shieldT += dt;
      if (this.shieldT >= this.stats.shieldCd) { this.shieldT = 0; this.shield++; }
    }
    this.fuCd = Math.max(0, this.fuCd - dt);
    for (const id of Object.keys(this.arts)) {
      if (id === 'swords') continue;
      this.cd[id] = (this.cd[id] ?? 0) - dt;
      if (this.cd[id] <= 0) {
        const fired = this._cast(id, feet, player);
        this.cd[id] = fired ? this._artCd(id) : 0.4;
      }
    }
    this._updateSwords(dt, feet, player);
    this._updateProjectiles(dt);
    this._updateFields(dt);
    // 纸人替身
    for (let i = this.decoyInst.length - 1; i >= 0; i--) {
      const d = this.decoyInst[i];
      d.t -= dt;
      d.anim += dt;
      posePaper(d.inst.bones, { t: d.anim, phase: d.anim * 2, speedK: 0.3, atk: -1, seed: 1 });
      d.inst.root.rotation.y += dt * 1.5;
      if (Math.random() < dt * 10) this.ctx.effects.trail(d.inst.root.position.clone().setY(1 + Math.random()), new THREE.Color(1, 0.6, 0.6));
      if (d.t <= 0) {
        const p = d.inst.root.position.clone().setY(0.5);
        this.ctx.effects.fireBurst(p, 4);
        Audio.explosion();
        for (const e of this.ctx.enemies.queryRadius(p, 4)) this.ctx.enemies.damage(e, this.dmg(60 + this.lv('paperman') * 30), { type: 'fire', knock: 0.6, dir: e.root.position.clone().sub(p).setY(0).normalize() });
        this.scene.remove(d.inst.root);
        this.decoyInst.splice(i, 1);
      }
    }
    // 队列（延迟触发，如七星、雷击）
    for (let i = this._q.length - 1; i >= 0; i--) {
      const q = this._q[i];
      q.t -= dt;
      if (q.t <= 0) { q.fn(); this._q.splice(i, 1); }
    }
  }

  later(t, fn) { this._q.push({ t, fn }); }

  _cast(id, feet, player) {
    const E = this.ctx.enemies, FX = this.ctx.effects;
    const l = this.arts[id];
    switch (id) {
      case 'thunder': {
        const evo = this.evos.thunderEvo;
        const n = [1, 2, 2, 3, 3][l - 1] + (evo ? 2 : 0);
        const used = new Set();
        let any = false;
        for (let k = 0; k < n; k++) {
          const e = E.randomNear(feet, 22);
          if (!e || used.has(e)) continue;
          used.add(e); any = true;
          this.later(k * 0.12, () => this._strike(e, this.dmg(45 + l * 18), evo ? 3 : 0, new Set([e])));
        }
        return any;
      }
      case 'coins': {
        const tgt = E.nearest(feet, 24);
        if (!tgt) return false;
        const n = [1, 1, 2, 2, 3][l - 1];
        const from = feet.clone().setY(1.3);
        const dir = E.center(tgt).sub(from).normalize();
        for (let k = 0; k < n; k++) {
          const off = (k - (n - 1) / 2) * 0.22;
          this._coinSword(from, dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), off), this.dmg(28 + l * 10), 1 + Math.floor(l / 2));
        }
        Audio.coin();
        return true;
      }
      case 'bagua': {
        const r = 4.5 + l * 0.6;
        const hits = E.queryRadius(feet, r);
        FX.baguaDecal(feet, r, 0.8);
        FX.shockRing(feet, r, 0xffe080, 0.45);
        FX.flashLight(feet.clone().setY(1.5), 0xffe080, 50, 0.3, r * 2.5);
        Audio.bagua();
        let healed = 0;
        for (const e of hits) {
          const dir = e.root.position.clone().sub(feet).setY(0).normalize();
          E.damage(e, this.dmg(40 + l * 15), { type: 'art', knock: 1.4, dir, slow: 0.4, slowT: 2 });
          if (this.evos.baguaEvo && healed < 20) { healed++; }
        }
        if (healed) this.ctx.healPlayer?.(healed, false);
        if (this.evos.baguaEvo) this._field('taiji', feet.clone(), r * 0.7, 3, { dps: this.dmg(20 + l * 6) });
        return true;
      }
      case 'rice': {
        const n = 1 + Math.floor(l / 3);
        let any = false;
        for (let k = 0; k < n; k++) {
          const e = E.densest(feet, 16) || E.randomNear(feet, 16);
          if (!e) continue;
          any = true;
          const p = e.root.position.clone().setY(0);
          p.x += (Math.random() - 0.5) * 2; p.z += (Math.random() - 0.5) * 2;
          this._field('rice', p, 2.6 + l * 0.2, 4 + l * 0.5, { dps: this.dmg(14 + l * 6) });
        }
        if (any) Audio.ricesplash();
        return any;
      }
      case 'inkline': {
        if (!E.nearest(feet, 12)) return false;
        const n = 2 + l;
        const len = 9 + l;
        const base = Math.random() * Math.PI * 2;
        for (let k = 0; k < n; k++) {
          const a = base + (k / n) * Math.PI * 2;
          const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
          this._inkLine(feet.clone(), dir, len, this.dmg(30 + l * 12), 1.2 + l * 0.2);
        }
        Audio.inkSnap();
        return true;
      }
      case 'bell': {
        const r = 5 + l * 0.5;
        const hits = E.queryRadius(feet, r);
        if (!hits.length) return false;
        FX.shockRing(feet, r, 0xe0c080, 0.6);
        FX.shockRing(feet, r * 0.6, 0xfff0c0, 0.4);
        Audio.bell();
        for (const e of hits) E.damage(e, this.dmg(15 + l * 8), { type: 'art', stun: 1 + l * 0.2, vsTag: { tag: 'ghost', mult: 2 } });
        return true;
      }
      case 'paperman': {
        if (!E.nearest(feet, 18)) return false;
        const n = l >= 5 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const inst = instantiate(getTemplate('paper'));
          const a = Math.random() * Math.PI * 2;
          inst.root.position.set(feet.x + Math.cos(a) * 3, 0, feet.z + Math.sin(a) * 3);
          inst.root.scale.setScalar(1.05);
          for (const m of inst.materials) m.emissive.setHex(0x401010);
          this.scene.add(inst.root);
          this.decoyInst.push({ inst, t: 5, anim: 0 });
          E.decoys.push({ pos: inst.root.position, t: 5 });
          FX.puff(inst.root.position.clone().setY(1), new THREE.Color(1, 0.8, 0.8), 20);
        }
        return true;
      }
      case 'beidou': {
        const c = E.densest(feet, 20);
        if (!c) return false;
        const rounds = l >= 5 ? 2 : 1;
        const pattern = [[0, 0], [1.1, 0.25], [2.0, 0.1], [2.9, 0.35], [3.3, 1.35], [4.4, 1.55], [4.5, 0.4]];
        for (let r = 0; r < rounds; r++) {
          const center = c.root.position.clone().setY(0);
          const rot = Math.random() * Math.PI * 2, sc = 2.2;
          pattern.forEach(([x, z], i) => {
            const px = (x - 2.2) * sc, pz = (z - 0.8) * sc;
            const p = new THREE.Vector3(center.x + px * Math.cos(rot) - pz * Math.sin(rot), 0, center.z + px * Math.sin(rot) + pz * Math.cos(rot));
            this.later(r * 1.0 + i * 0.09, () => this._star(p, this.dmg(50 + l * 20)));
          });
        }
        return true;
      }
    }
    return false;
  }

  _strike(e, dmg, bounces, used) {
    const E = this.ctx.enemies;
    if (!e.alive) return;
    const top = E.center(e).setY(18);
    top.x += (Math.random() - 0.5) * 3;
    const hit = E.center(e);
    this.ctx.effects.bolt(top, hit.clone().setY(e.root.position.y));
    Audio.thunder();
    this.ctx.shake?.(0.15);
    E.damage(e, dmg, { type: 'art', stun: 0.35 });
    for (const o of E.queryRadius(e.root.position, 1.2)) if (o !== e) E.damage(o, dmg * 0.5, { type: 'art', stun: 0.2 });
    if (bounces > 0) {
      let next = null, bd = 64;
      for (const o of E.list) {
        if (!o.alive || used.has(o)) continue;
        const d = o.root.position.distanceToSquared(e.root.position);
        if (d < bd) { bd = d; next = o; }
      }
      if (next) {
        used.add(next);
        this.later(0.08, () => {
          this.ctx.effects.bolt(E.center(e), E.center(next), 0xd0e8ff, 0.08, 0.15);
          this._strike(next, dmg * 0.85, bounces - 1, used);
        });
      }
    }
  }

  _star(p, dmg) {
    const FX = this.ctx.effects, E = this.ctx.enemies;
    const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xd0c0ff, blending: THREE.AdditiveBlending, depthWrite: false }));
    star.scale.setScalar(1.6);
    star.position.set(p.x, 16, p.z);
    this.scene.add(star);
    this.projectiles.push({
      obj: star, life: 0.3, kind: 'star', update: (pr, dt) => {
        pr.obj.position.y -= dt * 55;
        if (pr.obj.position.y <= 0.5 || pr.life <= 0) {
          pr.dead = true;
          FX.pillar(p, 0xc0b0ff, 6, 0.9, 0.45);
          FX.shockRing(p, 2.0, 0xc0b0ff, 0.4);
          FX.flashLight(p.clone().setY(1), 0xb0a0ff, 40, 0.25, 8);
          Audio.thunder();
          for (const e of E.queryRadius(p, 1.9)) E.damage(e, dmg, { type: 'art', stun: 0.3 });
        }
      },
    });
  }

  _coinSword(from, dir, dmg, pierce) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ map: this.coinTex, transparent: true, alphaTest: 0.5, metalness: 0.8, roughness: 0.35, emissive: 0x3a2400, side: THREE.DoubleSide });
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(new THREE.CircleGeometry(0.075, 16), mat);
      c.position.z = -i * 0.1;
      c.rotation.y = Math.PI / 2;
      g.add(c);
    }
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0xb01414 }));
    hilt.rotation.x = Math.PI / 2; hilt.position.z = 0.15; g.add(hilt);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffc040, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(0.7); glow.position.z = -0.4; g.add(glow);
    g.position.copy(from);
    g.lookAt(from.clone().sub(dir));
    this.scene.add(g);
    const hitSet = new Set();
    this.projectiles.push({
      obj: g, life: 1.4, kind: 'coin', vel: dir.clone().multiplyScalar(24), pierce, update: (pr, dt) => {
        pr.obj.position.addScaledVector(pr.vel, dt);
        pr.obj.rotateZ(dt * 14);
        if (Math.random() < dt * 30) this.ctx.effects.trail(pr.obj.position, new THREE.Color(1, 0.75, 0.3));
        for (const e of this.ctx.enemies.queryRadius(pr.obj.position, 0.5)) {
          if (hitSet.has(e)) continue;
          if (Math.abs(this.ctx.enemies.center(e).y - pr.obj.position.y) > e.height * 0.7) continue;
          hitSet.add(e);
          this.ctx.enemies.damage(e, dmg, { type: 'art', knock: 0.2, dir: pr.vel.clone().normalize() });
          this.ctx.effects.gold(pr.obj.position, 6, 0.5);
          if (--pr.pierce < 0) { pr.dead = true; break; }
        }
      },
    });
  }

  _inkLine(from, dir, len, dmg, root) {
    const E = this.ctx.enemies;
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, len), new THREE.MeshBasicMaterial({ color: 0x100404 }));
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, len), new THREE.MeshBasicMaterial({ color: 0xff2a20, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.position.z = glow.position.z = len / 2;
    g.add(core, glow);
    g.position.set(from.x, 0.6, from.z);
    g.lookAt(from.x + dir.x, 0.6, from.z + dir.z);
    this.scene.add(g);
    const evo = this.evos.inkEvo;
    const hitLine = (mult) => {
      for (const e of E.list) {
        if (!e.alive) continue;
        const rel = e.root.position.clone().sub(from).setY(0);
        const t = rel.dot(dir);
        if (t < 0 || t > len) continue;
        const perp = rel.clone().addScaledVector(dir, -t).length();
        if (perp < 0.6 + e.radius) E.damage(e, dmg * mult, { type: 'art', root });
      }
    };
    hitLine(1);
    const life = evo ? 3.2 : 0.6;
    let tick = 0.8;
    this.fields.push({
      obj: g, life, maxLife: life, update: (f, dt) => {
        const k = f.life / f.maxLife;
        glow.material.opacity = 0.9 * Math.min(1, k * 3) * (0.7 + Math.random() * 0.3);
        g.scale.x = g.scale.y = 1 + (1 - k) * 0.3;
        if (evo) { tick -= dt; if (tick <= 0) { tick = 0.8; hitLine(0.35); } }
      },
    });
  }

  _field(kind, pos, r, dur, opt) {
    const E = this.ctx.enemies;
    let obj;
    if (kind === 'rice') {
      obj = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ map: this.riceTex, transparent: true, depthWrite: false }));
      obj.rotation.x = -Math.PI / 2;
      obj.position.set(pos.x, 0.05, pos.z);
      this.ctx.effects.puff(pos.clone().setY(0.4), new THREE.Color(1, 1, 0.95), 12, false);
    } else if (kind === 'taiji' || kind === 'fire') {
      obj = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ map: kind === 'taiji' ? this.ctx.effects._baguaTex : this.glowTex, color: kind === 'taiji' ? 0xffe8a0 : 0xff6020, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      obj.rotation.x = -Math.PI / 2;
      obj.position.set(pos.x, 0.06, pos.z);
    }
    this.scene.add(obj);
    let tick = 0;
    this.fields.push({
      obj, life: dur, maxLife: dur, update: (f, dt) => {
        const k = f.life / f.maxLife;
        obj.material.opacity = Math.min(1, k * 4) * (kind === 'fire' ? 0.8 : 1);
        if (kind === 'taiji') obj.rotation.z += dt * 2;
        if (kind === 'fire' && Math.random() < dt * 25) this.ctx.effects.fire(pos, r * 0.8, 2);
        tick -= dt;
        if (tick <= 0) {
          tick = 0.5;
          for (const e of E.queryRadius(pos, r)) {
            if (kind === 'rice') E.damage(e, opt.dps * 0.5, { type: 'art', slow: 0.55, slowT: 0.8, vsTag: { tag: 'jiangshi', mult: 2 }, dot: true });
            else if (kind === 'taiji') E.damage(e, opt.dps * 0.5, { type: 'art', slow: 0.3, slowT: 0.8, dot: true });
            else E.damage(e, opt.dps * 0.5, { type: 'fire', dot: true });
          }
        }
      },
    });
  }

  _updateSwords(dt, feet, player) {
    const l = this.arts.swords || 0;
    const n = l ? 1 + l : 0;
    while (this.swordMeshes.length < n) {
      const s = buildPeachSword();
      s.scale.setScalar(1.25);
      s.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffa060, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
      glow.scale.setScalar(0.6); glow.position.z = -0.35; s.add(glow);
      s.userData.hit = new Map();
      this.scene.add(s);
      this.swordMeshes.push(s);
    }
    if (!n) return;
    const E = this.ctx.enemies;
    const r = 2.4 + l * 0.12;
    this.swordAngle += dt * (2.6 + l * 0.15);
    const dmg = this.dmg(20 + l * 7);
    const evo = this.evos.swordsEvo;
    if (evo) {
      this.swordVolley -= dt;
      if (this.swordVolley <= 0 && E.nearest(feet, 16)) {
        this.swordVolley = 3.5;
        this.swordMeshes.forEach((s, i) => {
          const tgt = E.randomNear(feet, 16);
          if (!tgt) return;
          s.userData.fly = { t: 0, from: s.position.clone(), to: E.center(tgt), i };
        });
        Audio.whoosh();
      }
    }
    this.swordMeshes.forEach((s, i) => {
      const a = this.swordAngle + (i / n) * Math.PI * 2;
      const home = new THREE.Vector3(feet.x + Math.cos(a) * r, 1.0 + Math.sin(this.swordAngle * 2 + i) * 0.15, feet.z + Math.sin(a) * r);
      const fly = s.userData.fly;
      if (fly) {
        fly.t += dt / 0.7;
        const k = fly.t < 0.5 ? fly.t * 2 : 2 - fly.t * 2;
        s.position.lerpVectors(home, fly.to, Math.sin(k * Math.PI / 2));
        s.lookAt(fly.t < 0.5 ? fly.to : home);
        s.rotateY(Math.PI);
        if (fly.t >= 1) s.userData.fly = null;
      } else {
        s.position.copy(home);
        // 剑尖沿切线方向
        const tan = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
        s.lookAt(home.clone().sub(tan));
      }
      const hitMap = s.userData.hit;
      for (const [e, t] of hitMap) { if (t - dt <= 0) hitMap.delete(e); else hitMap.set(e, t - dt); }
      for (const e of E.queryRadius(s.position, 0.55)) {
        if (hitMap.has(e)) continue;
        hitMap.set(e, 0.45);
        const dir = e.root.position.clone().sub(feet).setY(0).normalize();
        E.damage(e, dmg * (fly ? 2 : 1), { type: 'art', knock: 0.35, dir });
        Audio.swordHit();
        this.ctx.effects.sparks(s.position, 4);
      }
    });
    void player;
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.update?.(p, dt);
      if (p.life <= 0 || p.dead) { this.scene.remove(p.obj); this.projectiles.splice(i, 1); }
    }
  }

  _updateFields(dt) {
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i];
      f.life -= dt;
      f.update?.(f, dt);
      if (f.life <= 0) { this.scene.remove(f.obj); this.fields.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------- 火符（手动）
  get fuReady() { return this.fuCd <= 0; }

  throwTalisman(origin, dir) {
    if (!this.fuReady) return false;
    this.fuCd = this.stats.fuCd;
    const n = this.stats.fuCount;
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * 0.16;
      const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), off);
      const mesh = new THREE.Mesh(this.fuGeo, this.fuMat);
      mesh.position.copy(origin).addScaledVector(d, 0.6);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.setScalar(0.9); mesh.add(glow);
      this.scene.add(mesh);
      const vel = d.clone().multiplyScalar(TALISMAN.speed);
      vel.y += 2.4;
      this.projectiles.push({
        obj: mesh, life: 3, kind: 'fu', vel, update: (pr, dt) => {
          pr.vel.y -= 12 * dt;
          pr.obj.position.addScaledVector(pr.vel, dt);
          pr.obj.rotation.x += dt * 9; pr.obj.rotation.y += dt * 5;
          if (Math.random() < dt * 40) this.ctx.effects.ember(pr.obj.position);
          let boom = pr.obj.position.y <= 0.1 || pr.life <= 0.05;
          if (!boom) {
            for (const e of this.ctx.enemies.list) {
              if (!e.alive) continue;
              const dd = Math.hypot(e.root.position.x - pr.obj.position.x, e.root.position.z - pr.obj.position.z);
              const dy = pr.obj.position.y - e.root.position.y;
              if (dd < e.radius + 0.4 && dy > -0.2 && dy < e.height + 0.3) { boom = true; break; }
            }
          }
          if (!boom && this.ctx.world.obstacles.some((b) => b.containsPoint(pr.obj.position))) boom = true;
          if (boom) { pr.dead = true; this._fuExplode(pr.obj.position.clone().setY(Math.max(0.1, pr.obj.position.y))); }
        },
      });
    }
    Audio.whoosh();
    return true;
  }

  _fuExplode(p) {
    const r = TALISMAN.radius;
    const E = this.ctx.enemies;
    const hits = E.queryRadius(p, r);
    for (const e of hits) E.damage(e, this.stats.fuDmg, { type: 'fire', knock: 0.5, dir: e.root.position.clone().sub(p).setY(0).normalize(), burn: 8, burnT: 2 });
    this.ctx.effects.fireBurst(p, r);
    Audio.explosion();
    this.ctx.shake?.(0.25);
    if (this.stats.fuBurn) this._field('fire', p.clone().setY(0), r * 0.8, 3, { dps: this.stats.fuBurn });
    this.ctx.onFuHit?.(hits.length);
  }

  // ---------------------------------------------------------------- 天师降魔（大招）
  get ultReady() { return this.ult >= 100; }

  addUlt(v) { this.ult = Math.min(100, this.ult + v); }

  castUlt(player) {
    if (!this.ultReady) return false;
    this.ult = 0;
    const E = this.ctx.enemies, FX = this.ctx.effects;
    const feet = new THREE.Vector3(player.position.x, 0, player.position.z);
    FX.baguaDecal(feet, 10, 2.2, 0xffe080);
    FX.shockRing(feet, 26, 0xffe080, 1.2);
    FX.pillar(feet, 0xffe8a0, 30, 2.5, 1.2);
    Audio.gong();
    this.ctx.shake?.(0.6);
    const targets = E.list.filter((e) => e.alive && e.root.position.distanceTo(feet) < 28);
    targets.sort(() => Math.random() - 0.5);
    targets.forEach((e, i) => {
      this.later(0.2 + (i % 20) * 0.06, () => {
        if (!e.alive) return;
        FX.bolt(E.center(e).setY(20), E.center(e).setY(e.root.position.y), 0xffe8a0, 0.2, 0.3);
        Audio.thunder();
        E.damage(e, this.dmg(e.boss ? 400 : 260), { type: 'art', stun: 1.5 });
      });
    });
    this.ctx.healPlayer?.(0.3, false, true);
    return true;
  }

  // 伤害抵挡（金光咒）
  absorb() {
    if (this.shield > 0) { this.shield--; this.shieldT = 0; Audio.shieldBreak(); return true; }
    return false;
  }
}
