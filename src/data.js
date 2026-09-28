// ===================== 游戏设定数据 v1.1 =====================

// 怪物图鉴（顺序即图鉴排位）
// ai: hop 跳尸 / run 小鬼疾奔 / walk 纸人 / caster 厉鬼施法 / wuWhite / wuBlack / hou
export const ENEMIES = {
  normal: {
    id: 'normal', model: 'normal', kind: 'jiangshi', name: '伏尸', title: '尸变之始', category: '僵尸',
    scale: 1, hp: 45, speed: 2.4, damage: 8, radius: 0.42, xp: 1, ai: 'hop',
    hop: { h: 0.42, t: 0.55, rest: 0.28 }, atkRange: 1.6, atkTime: 0.9,
    bulletMult: 1, fireMult: 1.3, tags: ['jiangshi'],
    lore: '新死之尸，阴气初聚，僵而未变。夜半棺响，尸身自动，是为"伏尸"。行动迟缓，然人气所引，成群而动，不可轻视。',
  },
  purple: {
    id: 'purple', model: 'purple', kind: 'jiangshi', name: '紫僵', title: '淤血初变', category: '僵尸',
    scale: 1.02, hp: 80, speed: 2.8, damage: 11, radius: 0.42, xp: 2, ai: 'hop',
    hop: { h: 0.5, t: 0.52, rest: 0.22 }, atkRange: 1.65, atkTime: 0.85,
    bulletMult: 1, fireMult: 1.3, tags: ['jiangshi'],
    lore: '尸变不久，周身淤血未散，尸色发紫。《子不语》载：尸初变者色紫，触之犹温——此时不除，日久必成大患。',
  },
  white: {
    id: 'white', model: 'white', kind: 'jiangshi', name: '白僵', title: '霉毛遍体', category: '僵尸',
    scale: 1.04, hp: 170, speed: 1.9, damage: 16, radius: 0.45, xp: 4, ai: 'hop',
    hop: { h: 0.38, t: 0.7, rest: 0.35 }, atkRange: 1.7, atkTime: 1.0,
    bulletMult: 1, fireMult: 2.2, tags: ['jiangshi'],
    lore: '葬久之尸生白毛，是为白僵。行动迟缓，然皮糙肉厚。其性怕光、怕火、怕人气——火符一点即燃。',
  },
  green: {
    id: 'green', model: 'green', kind: 'jiangshi', name: '绿僵', title: '尸气凝碧', category: '僵尸',
    scale: 1.06, hp: 140, speed: 3.6, damage: 17, radius: 0.45, xp: 4, ai: 'hop',
    hop: { h: 0.6, t: 0.48, rest: 0.18 }, atkRange: 1.75, atkTime: 0.8,
    bulletMult: 1, fireMult: 1.3, tags: ['jiangshi'],
    lore: '白毛脱而绿毛生，尸气愈重，力大无穷。青绿之躯百步夺命。乡人夜闻绿僵嘶吼，皆闭户不出。',
  },
  hairy: {
    id: 'hairy', model: 'hairy', kind: 'jiangshi', name: '毛僵', title: '刀枪不入', category: '僵尸',
    scale: 1.1, hp: 260, speed: 3.9, damage: 21, radius: 0.48, xp: 7, ai: 'hop',
    hop: { h: 0.7, t: 0.44, rest: 0.16 }, atkRange: 1.8, atkTime: 0.75,
    bulletMult: 0.5, fireMult: 1.8, tags: ['jiangshi'],
    lore: '遍体生毛，已然妖化。刀枪不入——枪械只能迟滞其行，唯有道法真火与雷法方能克之。',
  },
  flying: {
    id: 'flying', model: 'flying', kind: 'jiangshi', name: '飞僵', title: '腾跃如风', category: '僵尸',
    scale: 1.05, hp: 130, speed: 5.6, damage: 17, radius: 0.44, xp: 6, ai: 'hop',
    hop: { h: 1.7, t: 0.6, rest: 0.1 }, atkRange: 1.8, atkTime: 0.7,
    bulletMult: 1, fireMult: 1.2, tags: ['jiangshi'],
    lore: '僵尸年久，由伏尸、游尸而成飞僵，一跃数丈，快逾奔马。空中之影掠过，人头已落。',
  },
  drought: {
    id: 'drought', model: 'drought', kind: 'jiangshi', name: '旱魃', title: '赤地千里', category: '首领',
    scale: 1.3, hp: 2600, speed: 2.6, damage: 26, radius: 0.6, xp: 60, ai: 'hop', boss: true,
    hop: { h: 0.55, t: 0.62, rest: 0.25 }, atkRange: 2.2, atkTime: 1.0,
    bulletMult: 0.85, fireMult: 0.4, tags: ['jiangshi'], aura: { radius: 4.2, dps: 6 },
    fireRing: { cd: 6, count: 10, dmg: 14 },
    lore: '上古旱神之说，后世以为极高阶尸变。旱魃一出，赤地千里，河井俱涸。其身灼热如炉，近之则皮肉焦枯——切记远战。',
  },
  imp: {
    id: 'imp', model: 'imp', kind: 'imp', name: '小鬼', title: '阴司走卒', category: '鬼怪',
    scale: 1, hp: 22, speed: 5.4, damage: 5, radius: 0.32, xp: 1, ai: 'run',
    atkRange: 1.1, atkTime: 0.55, bulletMult: 1, fireMult: 1.5, tags: ['ghost'],
    lore: '阎罗殿下供驱使的小鬼，身矮力弱，却成群结队、来去如风。一只不足为惧，一群便能把人啃成白骨。',
  },
  paper: {
    id: 'paper', model: 'paper', kind: 'paper', name: '纸人', title: '纸扎还魂', category: '鬼怪',
    scale: 1, hp: 60, speed: 3.0, damage: 9, radius: 0.36, xp: 2, ai: 'walk',
    atkRange: 1.3, atkTime: 0.7, bulletMult: 0.8, fireMult: 3.0, tags: ['paper'],
    burstOnDeath: true,
    lore: '丧家扎给亡人的童男童女，被怨气附体，竟能自行走动。脸上胭脂一成不变，笑得人心底发凉。纸扎之躯，遇火即焚。',
  },
  ghost: {
    id: 'ghost', model: 'ghost', kind: 'ghost', name: '红衣厉鬼', title: '含冤而死', category: '鬼怪',
    scale: 1, hp: 95, speed: 2.6, damage: 12, radius: 0.4, xp: 4, ai: 'caster', float: 0.35,
    atkRange: 13, atkTime: 1.1, bulletMult: 1, fireMult: 1.2, tags: ['ghost'],
    shot: { speed: 7, dmg: 12, cd: 3.2 },
    lore: '身着红衣含冤自尽者，怨气最重，化为厉鬼。飘忽不定，远远以鬼火伤人，挨了打便瞬息挪移。',
  },
  wuWhite: {
    id: 'wuWhite', model: 'wuWhite', kind: 'wuWhite', name: '白无常', title: '一见生财', category: '首领',
    scale: 1, hp: 2400, speed: 3.2, damage: 20, radius: 0.55, xp: 50, ai: 'wuWhite', boss: true,
    atkRange: 12, atkTime: 1.2, bulletMult: 1, fireMult: 1, tags: ['ghost'],
    chain: { speed: 16, dmg: 18, cd: 3.4 }, summon: { cd: 9, type: 'imp', count: 4 },
    lore: '谢必安，勾魂使者之一。白衣高帽，笑面长舌，帽书"一见生财"。其勾魂索掷出如电，被锁者魂魄离体。',
  },
  wuBlack: {
    id: 'wuBlack', model: 'wuBlack', kind: 'wuBlack', name: '黑无常', title: '天下太平', category: '首领',
    scale: 1, hp: 2800, speed: 3.0, damage: 28, radius: 0.55, xp: 50, ai: 'wuBlack', boss: true,
    atkRange: 2.4, atkTime: 1.0, bulletMult: 1, fireMult: 1, tags: ['ghost'],
    dash: { speed: 17, dmg: 26, cd: 5, windup: 0.8 }, slam: { radius: 4.5, dmg: 22 },
    lore: '范无救，勾魂使者之二。黑衣黑面，帽书"天下太平"。手持锁链令牌，性烈如火，冲锋一击，山石俱碎。',
  },
  hou: {
    id: 'hou', model: 'hou', kind: 'hou', name: '犼', title: '僵尸之王', category: '首领',
    scale: 1.5, hp: 7000, speed: 3.4, damage: 36, radius: 0.85, xp: 200, ai: 'hou', boss: true,
    atkRange: 3.0, atkTime: 1.1, bulletMult: 0.8, fireMult: 1.0, tags: ['jiangshi'],
    charge: { windup: 1.0, speed: 15, duration: 0.95, damage: 34, cd: 7 },
    slam: { radius: 6, dmg: 30, cd: 9 }, summon: { cd: 14, type: 'flying', count: 3 },
    lore: '《续子不语》云："犼乃僵尸所变。"僵尸修炼千年，褪尽腐肉，化而为犼——口喷烟火，力撼山岳，连龙王亦惧其三分。',
  },
};

export const CODEX_ORDER = ['normal', 'purple', 'white', 'green', 'hairy', 'flying', 'imp', 'paper', 'ghost', 'drought', 'wuWhite', 'wuBlack', 'hou'];

// 章节：若干限时波次 + 首领
export const CHAPTERS = [
  {
    id: 1, name: '义庄 · 尸变', en: 'CHAPTER I', stars: 1,
    story: '入夜，乱葬岗的新坟接连塌陷，义庄的棺材板"咚、咚"作响。\n师父云游未归，只留下一沓符纸、一把驳壳枪。\n守住义庄——杀得越多，阳气越盛，道行越深。',
    waves: [
      { dur: 35, rate: 1.1, max: 22, pool: { normal: 8, imp: 3 } },
      { dur: 40, rate: 1.35, max: 28, pool: { normal: 6, purple: 4, imp: 4 } },
      { dur: 45, rate: 1.6, max: 34, pool: { normal: 4, purple: 6, imp: 5, white: 1 } },
      { dur: 45, rate: 1.9, max: 38, pool: { purple: 6, white: 3, imp: 6 } },
    ],
    boss: ['drought'], bossName: '旱魃 · 赤地千里', bossEscort: { purple: 4 },
    ambience: {
      skyTop: 0x04060c, skyHorizon: 0x1a2436, moonColor: 0xf4ecd8, moonLight: 0xbfd0ff, moonIntensity: 1.35, moonSize: 0.045,
      fog: 0x0e1420, fogDensity: 0.016, hemiSky: 0x8aa0c8, hemiGround: 0x2a2418, hemi: 0.75, cloud: 0x283040, sets: [],
    },
  },
  {
    id: 2, name: '荒村 · 纸扎', en: 'CHAPTER II', stars: 3,
    story: '邻村七日无人出入。推门一看，满屋纸扎人齐齐转过头来。\n竹林里阴风阵阵，红衣女子立在井边，一动不动。\n更远处，锁链声响——勾魂的黑白无常，亲自来了。',
    waves: [
      { dur: 40, rate: 1.6, max: 32, pool: { paper: 6, purple: 4, imp: 4 } },
      { dur: 45, rate: 1.9, max: 38, pool: { paper: 5, white: 3, ghost: 2, imp: 5 } },
      { dur: 45, rate: 2.2, max: 42, pool: { green: 4, paper: 4, ghost: 3, imp: 6 } },
      { dur: 50, rate: 2.5, max: 46, pool: { green: 5, white: 3, ghost: 3, paper: 4, imp: 5 } },
    ],
    boss: ['wuWhite', 'wuBlack'], bossName: '黑白无常 · 勾魂使者', bossEscort: { paper: 5 },
    ambience: {
      skyTop: 0x040a08, skyHorizon: 0x14261c, moonColor: 0xd8f0d0, moonLight: 0xa8e0b8, moonIntensity: 1.1, moonSize: 0.04,
      fog: 0x0c1a14, fogDensity: 0.024, hemiSky: 0x88b098, hemiGround: 0x1a2418, hemi: 0.7, cloud: 0x1e3028, sets: ['bamboo'],
      ghostFire: 0x9fffc8, mist: 0xc8ffe0, mountain: 0x08120c,
    },
  },
  {
    id: 3, name: '阴司 · 鬼门', en: 'CHAPTER III', stars: 5,
    story: '七月十五，鬼门大开。血月当空，地缝里渗出岩浆般的红光。\n毛僵、飞僵倾巢而出，小鬼漫山遍野。\n千年古尸褪尽腐肉，化而为犼——道长，成败在此一举。',
    waves: [
      { dur: 45, rate: 2.2, max: 44, pool: { green: 4, hairy: 2, imp: 8, ghost: 2 } },
      { dur: 50, rate: 2.5, max: 50, pool: { hairy: 3, flying: 3, imp: 8, paper: 3 } },
      { dur: 50, rate: 2.8, max: 54, pool: { hairy: 4, flying: 4, ghost: 3, imp: 8 } },
      { dur: 55, rate: 3.1, max: 58, pool: { hairy: 4, flying: 5, green: 3, ghost: 3, imp: 9 } },
    ],
    boss: ['hou'], bossName: '犼 · 僵尸之王', bossEscort: { hairy: 2, flying: 2 },
    ambience: {
      skyTop: 0x0a0204, skyHorizon: 0x3a0c08, moonColor: 0xff5a3a, moonLight: 0xff7a5c, moonIntensity: 1.2, moonSize: 0.075,
      fog: 0x1c0806, fogDensity: 0.02, hemiSky: 0xc08070, hemiGround: 0x2a0e08, hemi: 0.7, cloud: 0x3a1410, sets: ['embers', 'cracks'],
      ghostFire: 0xff8a50, mist: 0xffb0a0, mountain: 0x140404,
    },
  },
];

// 无尽轮回（通关后）：循环第三章怪池并持续加压
export const ENDLESS_WAVE = { dur: 50, rate: 3.2, max: 64, pool: { hairy: 4, flying: 4, green: 3, ghost: 3, imp: 9, paper: 3, white: 2 } };

// 局外修行（阳气永久强化）
export const UPGRADES = {
  hp: { name: '铜皮铁骨', desc: '初始生命 +15', max: 5, base: 120, growth: 1.6, icon: '🛡' },
  spd: { name: '轻功提纵', desc: '移动速度 +5%', max: 5, base: 120, growth: 1.6, icon: '🦶' },
  dmg: { name: '百步穿杨', desc: '枪械伤害 +7%', max: 5, base: 160, growth: 1.6, icon: '🎯' },
  fu: { name: '敕令真火', desc: '火符伤害 +25 · 冷却 -0.6s', max: 5, base: 150, growth: 1.6, icon: '🔥' },
  xp: { name: '悟性通达', desc: '阳气珠经验 +8%', max: 5, base: 140, growth: 1.6, icon: '📿' },
  luck: { name: '福缘深厚', desc: '每局重掷 +1、稀有道法几率提升', max: 3, base: 300, growth: 2.0, icon: '🍀' },
};

export function upgradeCost(key, level) {
  const u = UPGRADES[key];
  return Math.round(u.base * Math.pow(u.growth, level));
}

// 火符基础参数
export const TALISMAN = { damage: 80, radius: 3.4, cooldown: 7, speed: 15 };
