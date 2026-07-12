// ===================== 游戏设定数据 =====================

// 僵尸图鉴（顺序即图鉴排位与出场次序）
export const ZOMBIE_TYPES = {
  normal: {
    id: 'normal', file: '/models/z_normal.glb', name: '伏尸', title: '尸变之始',
    height: 1.72, hp: 80, speed: 2.6, damage: 10, attackRange: 1.7, score: 80,
    hopHeight: 0.45, hopTime: 0.6, restTime: 0.3,
    bulletMult: 1, fireMult: 1, dance: '尸式广播操',
    lore: '新死之尸，阴气初聚，僵而未变。夜半棺响，尸身自动，是为"伏尸"。虽行动迟缓，然人气所引，成群而动，不可轻视。',
  },
  purple: {
    id: 'purple', file: '/models/z_purple.glb', name: '紫僵', title: '淤血初变',
    height: 1.78, hp: 130, speed: 2.9, damage: 14, attackRange: 1.75, score: 130,
    hopHeight: 0.5, hopTime: 0.58, restTime: 0.26,
    bulletMult: 1, fireMult: 1, dance: '紫气摆臂舞',
    lore: '尸变不久，周身淤血未散，尸色发紫。腐气缠身，指爪已利。《子不语》载：尸初变者色紫，触之犹温——此时不除，日久必成大患。',
  },
  white: {
    id: 'white', file: '/models/z_white.glb', name: '白僵', title: '霉毛遍体',
    height: 1.8, hp: 300, speed: 1.7, damage: 20, attackRange: 1.8, score: 220,
    hopHeight: 0.42, hopTime: 0.75, restTime: 0.4,
    bulletMult: 1, fireMult: 2.0, dance: '白毛慢摇',
    lore: '葬久之尸生白毛，是为白僵。行动迟缓，然皮糙肉厚。其性怕光、怕火、怕人气——道家以火符克之，一点即燃。',
  },
  green: {
    id: 'green', file: '/models/z_green.glb', name: '绿僵', title: '尸气凝碧',
    height: 1.84, hp: 240, speed: 3.5, damage: 22, attackRange: 1.8, score: 280,
    hopHeight: 0.6, hopTime: 0.52, restTime: 0.22,
    bulletMult: 1, fireMult: 1.2, dance: '碧尸扭摆',
    lore: '白毛脱而绿毛生，尸气愈重，力大无穷。青绿之躯百步夺命，寻常刀剑已难伤其分毫。乡人夜闻绿僵嘶吼，皆闭户不出。',
  },
  hairy: {
    id: 'hairy', file: '/models/z_hairy.glb', name: '毛僵', title: '刀枪不入',
    height: 1.9, hp: 380, speed: 4.2, damage: 26, attackRange: 1.85, score: 400,
    hopHeight: 0.7, hopTime: 0.46, restTime: 0.18,
    bulletMult: 0.45, fireMult: 1.6, dance: '毛僵甩手舞',
    lore: '遍体生毛，已彻底妖化。毛僵刀枪不入、行动迅猛，寻常枪弹打在身上不过溅起几缕毛屑。唯有道家真火，可燎其妖毛，破其护体。',
  },
  flying: {
    id: 'flying', file: '/models/z_flying.glb', name: '飞僵', title: '腾跃如风',
    height: 1.82, hp: 200, speed: 5.6, damage: 20, attackRange: 1.8, score: 450,
    hopHeight: 1.7, hopTime: 0.55, restTime: 0.12,
    bulletMult: 1, fireMult: 1.2, dance: '腾云蹦迪',
    lore: '僵尸年久，由伏尸、游尸而成飞僵，一跃数丈，快逾奔马。《子不语》谓僵尸随岁月而变，飞僵之上，更有凶物。空中之影掠过，人头已落。',
  },
  drought: {
    id: 'drought', file: '/models/z_drought.glb', name: '旱魃', title: '赤地千里',
    height: 2.15, hp: 800, speed: 2.7, damage: 34, attackRange: 2.1, score: 900,
    hopHeight: 0.55, hopTime: 0.7, restTime: 0.3,
    bulletMult: 0.8, fireMult: 0.5, dance: '赤焰祭舞', aura: { radius: 4, dps: 7 },
    lore: '上古旱神之说，后世以为极高阶尸变。旱魃一出，赤地千里，河井俱涸。其身灼热如炉，近之则皮肉焦枯——切记远战，勿近其身。',
  },
  hou: {
    id: 'hou', file: '/models/z_hou.glb', name: '犼', title: '僵尸之王',
    height: 2.6, hp: 3600, speed: 3.2, damage: 45, attackRange: 2.6, score: 3000,
    hopHeight: 0.8, hopTime: 0.6, restTime: 0.25,
    bulletMult: 0.85, fireMult: 1.0, dance: '尸王战舞', boss: true,
    charge: { windup: 1.1, speed: 13, duration: 0.9, damage: 38, cooldown: 6 },
    lore: '《续子不语》云："犼乃僵尸所变。"僵尸修炼千年，褪尽腐肉，化而为犼——口喷烟火，力撼山岳，连龙王亦惧其三分。此乃尸道之极，妖物之王。',
  },
};

export const CODEX_ORDER = ['normal', 'purple', 'white', 'green', 'hairy', 'flying', 'drought', 'hou'];

// 关卡
export const LEVELS = [
  {
    id: 1, name: '乱葬岗 · 尸动', stars: 1,
    story: '入夜，乱葬岗的新坟接连塌陷。义庄的棺材板"咚、咚"作响。\n师父临行前留话：紫僵初变，尚可枪毙之。守住义庄，天亮为限。',
    waves: [
      { normal: 5 },
      { normal: 4, purple: 3 },
    ],
    ambience: { sky: 0x0a0e14, fog: [22, 100], hemi: 0.8, moon: 0xbfd4ff },
  },
  {
    id: 2, name: '义庄 · 白雾', stars: 2,
    story: '连日阴雨，庄内白雾不散——雾里有白影梭巡，是生了白毛的老尸。\n白僵皮厚，枪弹费力。记住师父的话：白僵怕火，火符一贴即燃。',
    waves: [
      { purple: 5 },
      { white: 3, purple: 3 },
      { white: 5, purple: 4 },
    ],
    ambience: { sky: 0x1a2026, fog: [10, 55], hemi: 1.0, moon: 0xdde4ee },
  },
  {
    id: 3, name: '荒村 · 尸气', stars: 2,
    story: '邻村七日无人出入。推门一看，满村尸气凝成碧雾。\n绿僵力大，切莫近身缠斗。且战且退，借义庄的棺材做掩护。',
    waves: [
      { purple: 4, white: 2 },
      { green: 4, purple: 4 },
      { green: 6, white: 3 },
    ],
    ambience: { sky: 0x0c1710, fog: [14, 70], hemi: 0.85, moon: 0x9fd4a8 },
  },
  {
    id: 4, name: '竹林 · 妖变', stars: 3,
    story: '竹林深处的古墓被盗，墓中之物遍体生毛，已然妖化。\n毛僵刀枪不入！枪弹只能迟滞其行。省着火符，专烧毛僵。',
    waves: [
      { green: 4, purple: 3 },
      { hairy: 2, green: 4 },
      { hairy: 4, green: 3, white: 2 },
    ],
    ambience: { sky: 0x120c1a, fog: [16, 75], hemi: 0.75, moon: 0xb9a8e0 },
  },
  {
    id: 5, name: '夜空 · 飞僵', stars: 3,
    story: '月黑风高，屋脊上黑影一掠数丈——僵尸已成飞僵。\n它们跳得比你跑得快。听风辨位，它落地的一瞬，就是你开枪的时机。',
    waves: [
      { flying: 3, green: 3 },
      { flying: 5, hairy: 2 },
      { flying: 7, hairy: 3 },
    ],
    ambience: { sky: 0x05070d, fog: [24, 110], hemi: 0.65, moon: 0xaebfe8 },
  },
  {
    id: 6, name: '赤地 · 旱魃', stars: 4,
    story: '方圆百里，河井俱涸，禾苗一夜枯死——旱魃出世了。\n它周身灼热，近身即焚。远战！引它撞棺材，用加特林泼弹药。',
    waves: [
      { hairy: 3, flying: 2 },
      { drought: 1, green: 4 },
      { drought: 2, flying: 3, hairy: 2 },
    ],
    ambience: { sky: 0x1f0e06, fog: [18, 85], hemi: 0.9, moon: 0xff9a5c },
  },
  {
    id: 7, name: '决战 · 犼', stars: 5,
    story: '千年古尸褪尽腐肉，化而为犼。天地变色，义庄的符纸尽数自燃。\n师父的桃木剑断了，只剩你手里的枪。道长，成败在此一举。',
    waves: [
      { flying: 3, hairy: 2 },
      { hou: 1 },
    ],
    bossLevel: true,
    ambience: { sky: 0x160608, fog: [20, 90], hemi: 0.7, moon: 0xff6a5c },
  },
];

// 修行（升级）
export const UPGRADES = {
  hp:  { name: '铜皮铁骨', desc: '生命上限 +25', max: 5, base: 150, growth: 1.7, icon: '🛡' },
  spd: { name: '轻功提纵', desc: '移动速度 +7%', max: 5, base: 150, growth: 1.7, icon: '👟' },
  dmg: { name: '百步穿杨', desc: '枪械伤害 +9%', max: 5, base: 200, growth: 1.7, icon: '🎯' },
  fu:  { name: '敕令真火', desc: '火符伤害 +35 · 冷却 -0.8s', max: 5, base: 180, growth: 1.7, icon: '🔥' },
};

export function upgradeCost(key, level) {
  const u = UPGRADES[key];
  return Math.round(u.base * Math.pow(u.growth, level));
}

// 火符基础参数
export const TALISMAN = { damage: 90, radius: 3.2, cooldown: 10, speed: 13 };
