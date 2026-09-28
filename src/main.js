import * as THREE from 'three';
import { World } from './world.js';
import { Player, EYE_HEIGHT } from './player.js';
import { WeaponSystem, WEAPON_DEFS } from './weapons.js';
import { EnemyManager } from './enemies.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { CHAPTERS, ENEMIES, CODEX_ORDER, UPGRADES, upgradeCost } from './data.js';
import { Progress } from './progress.js';
import { Priest } from './priest.js';
import { SkillSystem, ARTS, PASSIVES, RELICS, EVOLUTIONS } from './skills.js';
import { Codex } from './codex.js';
import { Director } from './director.js';
import { Pickups } from './pickups.js';
import { PostFX } from './postfx.js';
import { CHARACTER_BUILDERS, getTemplate } from './gfx/characters.js';
import { instantiate } from './gfx/rig.js';
import { poseDance, poseJiangshi, zeroPose } from './gfx/anim.js';
import { getAtlas } from './gfx/textures.js';

const $ = (id) => document.getElementById(id);
const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const TEST = new URLSearchParams(location.search).has('test');
const xpNeed = (lv) => Math.round(5 + lv * 3.5 + Math.pow(lv, 1.6) * 1.2);

class Game {
  constructor() {
    this.progress = new Progress();
    this.hud = new HUD();
    const S = this.progress.settings;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    $('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(S.fov, innerWidth / innerHeight, 0.05, 600);
    this.scene.add(this.camera);

    this.world = new World(this.scene);
    this.effects = new Effects(this.scene);
    this.enemies = new EnemyManager(this.scene, this.world, this.effects);
    this.pickups = new Pickups(this.scene);
    this.player = new Player(this.camera, this.world, this.renderer.domElement);
    this.priest = new Priest(this.scene);
    this.weapons = new WeaponSystem(this.camera, this.scene, this.effects, (o, d, w, f) => this.handleShot(o, d, w, f), (d) => this.handleMelee(d));
    this.skills = new SkillSystem({
      scene: this.scene, enemies: this.enemies, effects: this.effects, world: this.world,
      healPlayer: (v, flat, frac) => this.healPlayer(v, frac),
      addGold: (v) => { this.gold += v; },
      onWeaponGained: (id) => { this.weapons.addWeapon(id); this.priest.setWeapon(this.weapons.current); this.hud.toast(`获得 ${WEAPON_DEFS[id].name}！按 ${this.weapons.owned.indexOf(id) + 1} 切换`); },
      onWeaponUpgraded: (id) => this.weapons.upgrade(id),
      onStatsChanged: () => this.applyStats(),
      shake: (v) => { this.shake = Math.min(1, this.shake + v); },
      onFuHit: (n) => { if (n >= 5) this.hud.feed(`<b style="color:#ff9a50">敕令真火</b> 燎中 ${n} 只`); },
    });
    this.director = new Director(this.enemies, this.world);
    this.codex = new Codex(this.renderer);
    this.postfx = new PostFX(this.renderer, this.scene, this.camera);
    this.effects.setViewportHeight(innerHeight);
    this.pickups.setViewportHeight(innerHeight);

    this.state = 'loading';
    this.view = S.view || 'tps';
    this.clock = new THREE.Clock();
    this.shake = 0;
    this.hurt = 0;
    this.timeScale = 1;
    this.menuT = 0;

    this.bindUI();
    this.bindInput();
    this.wire();
    this.applySettings();
    this.renderer.setAnimationLoop(() => this.tick());
    this.load();
  }

  // ================================================================ 加载
  async load() {
    const ids = Object.keys(CHARACTER_BUILDERS);
    const fill = $('ld-fill'), text = $('ld-text');
    const names = { priest: '道长', normal: '伏尸', purple: '紫僵', white: '白僵', green: '绿僵', hairy: '毛僵', flying: '飞僵', drought: '旱魃', hou: '犼', imp: '小鬼', paper: '纸人', ghost: '红衣厉鬼', wuWhite: '白无常', wuBlack: '黑无常' };
    getAtlas();
    for (let i = 0; i < ids.length; i++) {
      text.textContent = `塑造 ${names[ids[i]] || ids[i]} 法身…… (${i + 1}/${ids.length})`;
      fill.style.width = ((i / ids.length) * 80).toFixed(0) + '%';
      await new Promise((r) => setTimeout(r, 0));
      getTemplate(ids[i]);
    }
    text.textContent = '点燃灯火……';
    fill.style.width = '90%';
    await new Promise((r) => setTimeout(r, 0));
    this.buildMenuActors();
    this.priest.setWeapon('mauser');
    try { this.renderer.compile(this.scene, this.camera); } catch (e) { /* ignore */ }
    fill.style.width = '100%';
    await new Promise((r) => setTimeout(r, 150));
    $('loading').classList.add('hidden');
    this.toMenu();
  }

  buildMenuActors() {
    this.menuActors = [];
    const spots = [['normal', -3.5, -4, 0.3], ['purple', 3.8, -5, -0.4], ['imp', -6, -1, 0.8], ['ghost', 6.2, -2, -0.9], ['white', 0.5, -8, 0]];
    for (const [type, x, z, ry] of spots) {
      const inst = instantiate(getTemplate(ENEMIES[type].model));
      inst.root.position.set(x, 0, z);
      inst.root.rotation.y = ry;
      inst.root.scale.setScalar(ENEMIES[type].scale);
      this.scene.add(inst.root);
      this.menuActors.push({ inst, type, seed: Math.random() * 10 });
    }
  }

  setMenuActors(v) { for (const a of this.menuActors || []) a.inst.root.visible = v; }

  // ================================================================ 界面
  showScreen(id) {
    for (const s of ['menu', 'story', 'upgrade', 'settings', 'help', 'cards', 'pause', 'result']) $(s).classList.toggle('hidden', s !== id);
    $('codex-ui').classList.toggle('hidden', id !== 'codex');
  }

  toMenu() {
    this.state = 'menu';
    this.hud.hide();
    this.enemies.clear();
    this.pickups.clear();
    this.effects.clear();
    this.skills.reset(this.progress.data);
    this.hud.clearDamageNumbers();
    this.setMenuActors(true);
    this.world.setAmbience(CHAPTERS[0].ambience);
    this.priest.setVisible(true);
    this.priest.revive();
    this.priest.setWeapon('sword');
    this.weapons.rig.visible = false;
    const b = this.progress.data.best;
    $('menu-foot').innerHTML = `阳气 <b>${this.progress.yangqi}</b>　·　最远 <b>${b.chapter ? CHAPTERS[Math.min(2, b.chapter - 1)].name : '—'}</b>　·　最久 <b>${fmt(b.time)}</b>　·　最多诛邪 <b>${b.kills}</b>${b.endless ? `　·　无尽 <b>${b.endless}</b> 轮` : ''}`;
    this.showScreen('menu');
    Audio.startMusic('calm');
  }

  openUpgrades() {
    this.state = 'upgrade';
    const list = $('up-list');
    list.innerHTML = '';
    $('up-yangqi').innerHTML = `现有阳气 <b>${this.progress.yangqi}</b>`;
    for (const key of Object.keys(UPGRADES)) {
      const u = UPGRADES[key];
      const lv = this.progress.upLevel(key);
      const full = lv >= u.max;
      const cost = full ? 0 : upgradeCost(key, lv);
      const row = document.createElement('div');
      row.className = 'up-row';
      row.innerHTML = `<div class="ic">${u.icon}</div><div><div class="nm">${u.name}</div><div class="ds">${u.desc}</div><div class="pips">${'◆'.repeat(lv)}${'◇'.repeat(u.max - lv)}</div></div>
        <div class="buy ${full || !this.progress.canBuy(key) ? 'dis' : ''}">${full ? '已圆满' : `阳气 ${cost}`}</div>`;
      row.querySelector('.buy').addEventListener('click', () => { if (this.progress.buy(key)) { Audio.cardPick(); this.openUpgrades(); } });
      list.appendChild(row);
    }
    this.showScreen('upgrade');
  }

  openSettings(from) {
    this.settingsFrom = from;
    const S = this.progress.settings;
    $('s-sfx').value = S.sfx; $('s-music').value = S.music; $('s-sens').value = S.sens; $('s-fov').value = S.fov;
    for (const seg of ['s-quality', 's-view']) {
      const key = seg === 's-quality' ? 'quality' : 'view';
      $(seg).querySelectorAll('span').forEach((sp) => sp.classList.toggle('on', sp.dataset.v === S[key]));
    }
    this.showScreen('settings');
  }

  applySettings() {
    const S = this.progress.settings;
    Audio.setVolume(S.sfx, S.music);
    this.player.sensitivity = S.sens;
    this.camera.fov = S.fov;
    this.camera.updateProjectionMatrix();
    const q = S.quality;
    this.renderer.setPixelRatio(q === 'low' ? 0.8 : q === 'medium' ? 1 : Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.world.moon.castShadow = q !== 'low';
    this.world.moon.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    if (this.world.moon.shadow.map) { this.world.moon.shadow.map.dispose(); this.world.moon.shadow.map = null; }
    this.postfx.setQuality(q);
    this.postfx.setSize(innerWidth, innerHeight);
  }

  openCodex() {
    this.state = 'codex';
    this.codex.build();
    const list = $('cx-list');
    list.innerHTML = CODEX_ORDER.map((t, i) => `<span data-i="${i}" class="${this.progress.data.seen[t] ? '' : 'unseen'}">${ENEMIES[t].name}</span>`).join('');
    list.querySelectorAll('span').forEach((s) => s.addEventListener('click', () => this.codex.select(+s.dataset.i)));
    this.codex.onSelect = (type) => {
      const c = ENEMIES[type];
      const catColor = { 僵尸: '#ff9a50', 鬼怪: '#8ec8ff', 首领: '#ff5040' }[c.category];
      $('cx-cat').textContent = c.category; $('cx-cat').style.color = catColor; $('cx-cat').style.borderColor = catColor;
      $('cx-name').textContent = c.name;
      $('cx-sub').textContent = c.title;
      $('cx-lore').textContent = c.lore;
      $('cx-stats').innerHTML = `<div>生命 <b>${c.hp}</b></div><div>速度 <b>${c.speed}</b></div><div>伤害 <b>${c.damage}</b></div><div>阳气 <b>${c.xp}</b></div>`;
      const tr = [];
      if (c.bulletMult < 1) tr.push(`刀枪不入 · 枪伤 ×${c.bulletMult}`);
      if (c.fireMult > 1.4) tr.push(`畏火 · 火伤 ×${c.fireMult}`);
      if (c.fireMult < 1) tr.push('耐火');
      if (c.aura) tr.push('灼烧光环');
      if (c.ai === 'caster') tr.push('远程鬼火 · 瞬移');
      if (c.chain) tr.push('勾魂索 · 召唤小鬼');
      if (c.dash) tr.push('冲锋 · 砸地');
      if (c.charge) tr.push('蓄力冲撞 · 震地 · 召唤飞僵');
      if (c.hop?.h > 1) tr.push('腾跃');
      if (c.tags.includes('jiangshi')) tr.push('怕糯米');
      if (c.tags.includes('ghost')) tr.push('畏三清铃');
      if (c.boss) tr.push('首领');
      $('cx-traits').innerHTML = tr.map((t) => `<span>${t}</span>`).join('');
      list.querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', i === this.codex.selected));
    };
    this.codex.select(this.codex.selected);
    this.showScreen('codex');
  }

  // ================================================================ 对局
  startRun() {
    Audio.unlock();
    this.setMenuActors(false);
    this.enemies.clear();
    this.pickups.clear();
    this.effects.clear();
    this.hud.clearDamageNumbers();
    this.skills.reset(this.progress.data);
    this.weapons.resetRun();
    this.director.reset();
    this.level = 1; this.xp = 0; this.pendingLevels = 0; this.pendingChest = 0;
    this.kills = 0; this.gold = 0; this.runTime = 0; this.chapterIdx = 0;
    this.applyStats();
    this.player.reset();
    this.player.hp = this.player.maxHp;
    this.priest.revive();
    this.priest.setWeapon(this.weapons.current);
    this.openStory(0);
  }

  applyStats() {
    const s = this.skills.stats;
    const oldMax = this.player.maxHp;
    this.player.maxHp = Math.round(s.maxHp);
    if (this.player.maxHp > oldMax && this.state === 'playing') this.player.hp += this.player.maxHp - oldMax;
    this.player.hp = Math.min(this.player.hp, this.player.maxHp);
    Object.assign(this.weapons.stats, { gunDmg: s.gunDmg, fireRate: s.fireRate, reloadMult: s.reloadMult, crit: s.crit, headMult: s.headMult });
  }

  openStory(ch) {
    this.state = 'story';
    this.chapterIdx = ch;
    const c = CHAPTERS[ch];
    $('st-ch').textContent = c.en;
    $('st-name').textContent = c.name;
    $('st-stars').textContent = '☠'.repeat(c.stars);
    $('st-text').textContent = c.story;
    this.world.setAmbience(c.ambience);
    this.showScreen('story');
  }

  beginChapter() {
    const ch = this.chapterIdx;
    this.showScreen('none');
    this.hud.show();
    this.world.setAmbience(CHAPTERS[ch].ambience);
    this.state = 'playing';
    this.player.enabled = true;
    this.player.position.set(0, EYE_HEIGHT, 8);
    this.player.velocity.set(0, 0, 0);
    this.player.yaw = 0; this.player.pitch = -0.05;
    this.applyView();
    this.hud.setBosses([]);
    this.lock();
    this.clock.getDelta();
    this.enemies.warm(Object.keys(CHAPTERS[ch].waves.reduce((a, w) => Object.assign(a, w.pool), {})));
    this.director.startChapter(ch);
    this.hud.banner(CHAPTERS[ch].name, CHAPTERS[ch].en, 2600);
    Audio.gong();
    Audio.startMusic('battle');
  }

  lock() {
    if (TEST) { this.player.locked = true; return; }
    const p = this.renderer.domElement.requestPointerLock?.();
    if (p?.catch) p.catch(() => { $('click-hint').classList.remove('hidden'); });
  }

  applyView() {
    const fps = this.view === 'fps';
    this.weapons.rig.visible = fps;
    this.priest.setVisible(!fps);
    $('crosshair').style.display = '';
  }

  healPlayer(v, frac = false) {
    const amt = frac ? this.player.maxHp * v : v;
    this.player.heal(amt);
    if (amt >= 5) {
      this.effects.heal(this.player.position);
      this.hud.damageNumber(this.player.position.clone().add(new THREE.Vector3(0, 0.2, 0)), '+' + Math.round(amt), 'heal');
    }
  }

  gainXp(v) {
    this.xp += v * this.skills.stats.xpMult;
    Audio.pickup();
    while (this.xp >= xpNeed(this.level)) {
      this.xp -= xpNeed(this.level);
      this.level++;
      this.pendingLevels++;
      this.effects.levelUp(this.player.position);
    }
  }

  openCards(source = 'level') {
    const cards = source === 'relic' ? this.skills.rollRelics(3) : this.skills.rollCards(this.skills.stats.cards, source);
    this.cardSource = source;
    this.state = 'cards';
    this.player.enabled = false;
    this.weapons.triggerDown = false;
    Audio.setMinigunSpin(0);
    if (document.pointerLockElement) document.exitPointerLock();
    $('cd-title').textContent = source === 'relic' ? '过关 · 择一法宝' : source === 'chest' ? '镇尸宝箱' : '道行精进';
    $('cd-sub').textContent = source === 'relic' ? '祖师显灵，赐下法宝一件' : source === 'chest' ? '箱中灵光三道，择其一' : `道行升至 ${this.level - this.pendingLevels + 1} 重 · 择一道法修习`;
    $('cd-reroll').textContent = `重掷 (${this.skills.rerolls})`;
    $('cd-reroll').classList.toggle('disabled', this.skills.rerolls <= 0);
    $('cd-reroll').classList.toggle('hidden', source === 'relic');
    $('cd-skip').classList.toggle('hidden', source === 'relic');
    const row = $('card-row');
    row.innerHTML = '';
    const kindName = { art: '道术', passive: '修身', weapon: '兵器', wup: '兵器', evo: '进阶', relic: '法宝', heal: '丹药', gold: '阳气' };
    cards.forEach((c, i) => {
      const d = document.createElement('div');
      d.className = `card r-${c.rarity}`;
      const max = c.kind === 'art' ? ARTS[c.id].max : c.kind === 'passive' ? PASSIVES[c.id].max : c.kind === 'wup' ? 3 : 0;
      const lvs = max ? '★'.repeat(c.level) + '☆'.repeat(max - c.level) : '';
      const isNew = (c.kind === 'art' || c.kind === 'passive') && c.level === 1;
      d.innerHTML = `${isNew ? '<div class="new">新</div>' : ''}<div class="kind">${kindName[c.kind]}</div><div class="num">${i + 1}</div><div class="rar">${c.rarityName}</div><div class="ic">${c.icon}</div><div class="nm">${c.name}</div><div class="lvs">${lvs}</div><div class="ds">${c.desc}</div>`;
      d.addEventListener('click', () => this.pickCard(c));
      row.appendChild(d);
    });
    this.currentCards = cards;
    this.showScreen('cards');
    Audio.levelUp();
  }

  pickCard(c) {
    if (this.state !== 'cards') return;
    Audio.cardPick();
    if (c) {
      this.skills.apply(c);
      this.priest.setWeapon(this.weapons.current);
      const label = c.kind === 'evo' ? `进阶 · ${c.name}` : c.kind === 'relic' ? `法宝 · ${c.name}` : `${c.name}${c.level ? ' ' + c.level + ' 重' : ''}`;
      this.hud.feed(`<b style="color:#ffd060">${label}</b>`);
      if (c.kind === 'evo') this.hud.banner(c.name, '道法进阶', 2200);
    }
    const src = this.cardSource;
    if (src === 'level') this.pendingLevels--;
    if (src === 'chest') this.pendingChest--;
    if (src === 'relic') { this.afterRelic(); return; }
    this.resumePlay();
  }

  resumePlay() {
    this.showScreen('none');
    this.state = 'playing';
    this.player.enabled = true;
    this.lock();
    this.clock.getDelta();
  }

  onChapterClear(ch) {
    this.gold += 150 * (ch + 1);
    this.hud.banner('除祟功成', `${CHAPTERS[ch].name} · 阳气 +${150 * (ch + 1)}`, 3000);
    Audio.gong();
    this.pickups.vacuum();
    this.clearTimer = 3.2;
  }

  afterRelic() {
    this.player.hp = this.player.maxHp;
    this.weapons.refillAll();
    const next = this.chapterIdx + 1;
    if (next < CHAPTERS.length) {
      this.enemies.clear();
      this.hud.setBosses([]);
      this.state = 'story';
      this.openStory(next);
      this.hud.hide();
    } else {
      this.endRun(true);
    }
  }

  endRun(victory) {
    this.state = 'result';
    this.player.enabled = false;
    this.weapons.triggerDown = false;
    Audio.setMinigunSpin(0);
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud.hide();
    const chReached = this.director.endless ? 3 : this.chapterIdx + (victory ? 1 : 0);
    const gain = Math.round(this.gold + this.kills * 1.5 + this.runTime * 0.5);
    this.progress.addYangqi(gain);
    this.progress.record({ chapter: Math.max(1, chReached), time: this.runTime, kills: this.kills, level: this.level, endless: this.director.endlessN, cleared: victory });
    const rt = $('rs-title');
    rt.textContent = victory ? (this.director.endless ? '轮回圆满' : '三界肃清') : '道长阵亡';
    rt.className = victory ? 'win' : 'lose';
    $('rs-sub').textContent = victory ? '千年犼王伏诛，天下太平' : `止步于 ${this.director.endless ? `无尽轮回 第 ${this.director.endlessN + 1} 轮` : CHAPTERS[this.chapterIdx].name}`;
    $('rs-grid').innerHTML = `<div>存活时间<b>${fmt(this.runTime)}</b></div><div>诛邪<b>${this.kills}</b></div><div>道行<b>${this.level}</b></div>
      <div>章节<b>${Math.min(3, this.chapterIdx + 1)} / 3</b></div><div>无尽轮次<b>${this.director.endlessN}</b></div><div>获得阳气<b style="color:#ffd060">+${gain}</b></div>`;
    $('rs-build').innerHTML = this.skills.ownedList().map((s) => `<span>${s.icon} ${s.name}${s.level ? ' ' + s.level : ''}</span>`).join('');
    $('rs-endless').classList.toggle('hidden', !(victory && !this.director.endless));
    this.showScreen('result');
    Audio.startMusic('calm');
  }

  continueEndless() {
    this.showScreen('none');
    this.hud.show();
    this.state = 'playing';
    this.player.enabled = true;
    this.player.hp = this.player.maxHp;
    this.lock();
    this.director.startEndless();
    this.hud.banner('无尽轮回', '邪祟无穷，道心不灭', 2600);
    Audio.startMusic('battle');
  }

  // ================================================================ 战斗
  handleShot(origin, dir, def, first) {
    const hit = this.enemies.raycast(origin, dir, def.range);
    const wHit = this.world.raycast(origin, dir, def.range);
    let end = origin.clone().addScaledVector(dir, def.range);
    if (hit && (!wHit || hit.point.distanceToSquared(origin) < wHit.distanceToSquared(origin))) {
      end = hit.point;
      const s = this.skills.stats;
      const crit = Math.random() < s.crit;
      let dmg = def.damage * s.gunDmg * (hit.headshot ? def.headMult * s.headMult : 1) * (crit ? 2 : 1);
      const e = hit.enemy;
      const died = this.enemies.damage(e, dmg, { type: 'bullet', knock: def.knock, dir, point: hit.point, crit, headshot: hit.headshot });
      Audio.hitMarker(hit.headshot);
      this.hud.hit(hit.headshot, died);
      this.bloodFx(e, hit.point, dir, died);
    } else if (wHit) {
      end = wHit;
      this.effects.sparks(wHit);
    }
    if (first || def.pellets) {
      const muzzle = this.muzzlePoint(origin, dir);
      if (!def.pellets || Math.random() < 0.5) this.effects.tracer(muzzle, end, 0xffd8a0, def.id === 'gatling' ? 0.8 : 1);
    }
  }

  muzzlePoint(origin, dir) {
    if (this.view === 'tps') return this.priest.muzzleWorld();
    const vm = this.weapons.viewmodels[this.weapons.current];
    if (!vm) return origin.clone().addScaledVector(dir, 0.6);
    const mp = vm.userData.muzzle.clone().applyEuler(vm.rotation).add(vm.position);
    return mp.applyMatrix4(this.camera.matrixWorld);
  }

  bloodFx(e, p, dir, died) {
    const k = e.cfg.kind;
    if (k === 'ghost' || k === 'wuWhite' || k === 'wuBlack') this.effects.ichor(p, new THREE.Color(0.5, 0.7, 1));
    else if (k === 'paper') this.effects.puff(p, new THREE.Color(0.9, 0.85, 0.7), 6, false);
    else if (k === 'imp') this.effects.ichor(p, new THREE.Color(0.3, 1, 0.4));
    else if (died) this.effects.bigBlood(p);
    else this.effects.blood(p, 10, dir);
  }

  handleMelee(def) {
    const fwd = new THREE.Vector3(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
    const feet = new THREE.Vector3(this.player.position.x, 0, this.player.position.z);
    this.priest.swingT = 0;
    let n = 0;
    for (const e of this.enemies.queryRadius(feet, def.range)) {
      const to = e.root.position.clone().sub(feet).setY(0);
      const d = to.length();
      if (d > 0.3 && to.normalize().dot(fwd) < Math.cos(def.arc / 2)) continue;
      const crit = Math.random() < this.skills.stats.crit;
      const died = this.enemies.damage(e, def.damage * this.skills.stats.gunDmg * (crit ? 2 : 1), { type: 'melee', knock: def.knock, dir: to, crit });
      this.bloodFx(e, this.enemies.center(e), to, died);
      n++;
    }
    const arcP = feet.clone().addScaledVector(fwd, 1.4).setY(1.2);
    for (let i = 0; i < 16; i++) {
      const a = (i / 15 - 0.5) * def.arc;
      const d = fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      const p = feet.clone().addScaledVector(d, 1.6).setY(1.1 + (i / 15) * 0.4);
      this.effects.add.emit(p.x, p.y, p.z, d.x * 2, 0, d.z * 2, 1, 0.7, 0.45, 0.22, 0.25, 0, 3, -0.5, 0.9);
    }
    if (n) { Audio.swordHit(); this.hud.hit(false, false); this.shake = Math.min(1, this.shake + 0.1); }
    void arcP;
  }

  onPlayerHit(dmg, from, kind) {
    if (this.state !== 'playing' || !this.player.alive) return;
    if (kind === 'aura') {
      this.player.hp = Math.max(0, this.player.hp - dmg * this.skills.stats.armor);
      this._burning = true;
      if (this.player.hp <= 0) this.player.alive = false;
      return;
    }
    if (this.player.invuln > 0 || this.player.dashing) return;
    if (this.skills.absorb()) {
      this.effects.shockRing(new THREE.Vector3(this.player.position.x, 0, this.player.position.z), 2, 0xffe080, 0.35);
      this.hud.damageNumber(this.player.position.clone(), '金光', 'crit');
      this.player.invuln = 0.4;
      return;
    }
    const d = dmg * this.skills.stats.armor;
    if (this.player.takeDamage(d)) {
      this.hurt = 1;
      this.shake = Math.min(1, this.shake + 0.35);
      this.priest.hurt();
      this.hud.damageNumber(this.player.position.clone().add(new THREE.Vector3(0, -0.3, 0)), '-' + Math.round(d), 'player');
    }
  }

  onDeath() {
    if (this.skills.relics.qixing && !this.skills.revived) {
      this.skills.revived = true;
      this.player.alive = true;
      this.player.hp = this.player.maxHp * 0.6;
      this.player.invuln = 2.5;
      const feet = new THREE.Vector3(this.player.position.x, 0, this.player.position.z);
      this.effects.fireBurst(feet, 6);
      this.effects.baguaDecal(feet, 6, 1.5);
      for (const e of this.enemies.queryRadius(feet, 7)) this.enemies.damage(e, 200, { type: 'art', knock: 2, dir: e.root.position.clone().sub(feet).setY(0).normalize() });
      this.hud.banner('七星续命', '灯不灭，命不绝', 2200);
      Audio.gong();
      return;
    }
    this.state = 'dying';
    this.dyingT = 0;
    this.priest.die();
    this.player.enabled = false;
    this.weapons.triggerDown = false;
    Audio.setMinigunSpin(0);
    if (this.view === 'fps') { this.view = 'tps'; this.applyView(); this._forcedTps = true; }
  }

  wire() {
    this.enemies.onKill = (e) => {
      this.kills++;
      const p = e.root.position.clone();
      const xp = e.cfg.xp * (e.elite ? 5 : 1);
      this.pickups.dropXp(p, xp);
      this.gold += Math.ceil(e.cfg.xp * (e.elite ? 3 : 1));
      this.skills.addUlt(e.boss ? 35 : e.elite ? 6 : 1.4);
      if (this.skills.stats.lifesteal) this.player.heal(this.skills.stats.lifesteal);
      if (e.elite) { this.pickups.dropChest(p); this.hud.feed(`诛灭精英 <b style="color:#ff9a40">${e.cfg.name}</b>`); }
      else if (Math.random() < 0.012) this.pickups.dropHeal(p);
      if (e.boss) {
        this.pickups.dropChest(p.clone().add(new THREE.Vector3(1.5, 0, 0)));
        this.pickups.vacuum();
        this.hud.feed(`<b style="color:#ff5040">${e.cfg.name}</b> 伏诛！`);
        this.effects.fireBurst(p, 5);
        this.shake = 1;
        this.timeScale = 0.25;
        this.slowT = 0.6;
      }
      this.progress.markSeen(e.type);
    };
    this.enemies.onDamage = (e, dmg, pos, info) => {
      if (info.dot && dmg < 4) return;
      const cls = info.crit ? 'crit' : info.type === 'fire' ? 'fire' : info.type === 'art' ? 'art' : '';
      this.hud.damageNumber(pos, info.crit ? dmg + '!' : String(dmg), cls);
    };
    this.enemies.onPlayerHit = (dmg, from, kind) => this.onPlayerHit(dmg, from, kind);
    this.enemies.onSummon = (type, pos) => { const e = this.director.spawnOne(type, this.player.position, { at: pos }); this.effects.puff(pos.clone().setY(1), new THREE.Color(0.6, 0.4, 1), 12); return e; };
    this.director.onWaveStart = (ch, w, total) => {
      if (this.director.endless) this.hud.banner(`无尽 · 第 ${this.director.endlessN + 1} 轮`, '邪祟愈发凶悍', 2000);
      else if (w > 0) this.hud.banner(`第 ${w + 1} / ${total} 波`, '邪祟来袭', 1800);
      Audio.waveHorn();
    };
    this.director.onBossStart = (ch, list, name) => {
      this.hud.setBosses(list);
      this.hud.banner(name.split(' · ')[0], '首领降临', 3000);
      Audio.bossRoar();
      Audio.startMusic('boss');
      this.shake = 0.6;
      for (const b of list) this.progress.markSeen(b.type);
    };
    this.director.onChapterClear = (ch) => this.onChapterClear(ch);
  }

  // ================================================================ 输入
  bindUI() {
    const on = (id, fn) => $(id).addEventListener('click', () => { Audio.unlock(); fn(); });
    on('m-start', () => this.startRun());
    on('m-upgrade', () => this.openUpgrades());
    on('m-codex', () => this.openCodex());
    on('m-settings', () => { this.state = 'settings'; this.openSettings('menu'); });
    on('m-help', () => { this.state = 'help'; this.showScreen('help'); });
    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => this.toMenu()));
    on('cx-back', () => this.toMenu());
    on('cx-prev', () => this.codex.select(this.codex.selected - 1));
    on('cx-next', () => this.codex.select(this.codex.selected + 1));
    on('st-go', () => { if (this.state === 'story') this.beginChapter(); });
    on('cd-reroll', () => {
      if (this.skills.rerolls <= 0 || this.cardSource === 'relic') return;
      this.skills.rerolls--;
      this.openCards(this.cardSource);
    });
    on('cd-skip', () => { this.gold += 30; this.pickCard(null); });
    on('p-resume', () => this.resumePlay());
    on('p-settings', () => this.openSettings('pause'));
    on('p-quit', () => this.endRun(false));
    on('rs-again', () => this.startRun());
    on('rs-menu', () => this.toMenu());
    on('rs-endless', () => this.continueEndless());
    on('s-back', () => {
      this.progress.save();
      if (this.settingsFrom === 'pause') this.showScreen('pause'); else this.toMenu();
    });
    const S = this.progress.settings;
    const range = (id, key) => $(id).addEventListener('input', (e) => { S[key] = parseFloat(e.target.value); this.applySettings(); });
    range('s-sfx', 'sfx'); range('s-music', 'music'); range('s-sens', 'sens'); range('s-fov', 'fov');
    for (const seg of ['s-quality', 's-view']) {
      const key = seg === 's-quality' ? 'quality' : 'view';
      $(seg).querySelectorAll('span').forEach((sp) => sp.addEventListener('click', () => {
        S[key] = sp.dataset.v;
        $(seg).querySelectorAll('span').forEach((x) => x.classList.toggle('on', x === sp));
        if (key === 'view') this.view = S.view;
        this.applySettings();
      }));
    }
  }

  bindInput() {
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.postfx.setSize(innerWidth, innerHeight);
      this.codex.resize(innerWidth, innerHeight);
      this.effects.setViewportHeight(innerHeight);
      this.pickups.setViewportHeight(innerHeight);
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      this.player.locked = locked || TEST;
      if (locked) $('click-hint').classList.add('hidden');
      if (!locked && this.state === 'playing' && !TEST) this.pause();
    });
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.player.locked) this.lock();
    });
    document.addEventListener('mousedown', (e) => {
      if (this.state === 'codex' && e.target.tagName === 'CANVAS') { this.codex.dragging = true; this._dragX = e.clientX; return; }
      if (this.state !== 'playing' || !this.player.locked) return;
      if (e.button === 0) this.weapons.triggerDown = true;
      if (e.button === 2) this.throwFu();
    });
    document.addEventListener('mousemove', (e) => {
      if (this.state === 'codex' && this.codex.dragging) { this.codex.rotate(e.clientX - this._dragX); this._dragX = e.clientX; }
    });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.weapons.triggerDown = false; this.codex.dragging = false; });
    document.addEventListener('keydown', (e) => {
      if (this.state === 'codex') {
        if (e.code === 'ArrowLeft') this.codex.select(this.codex.selected - 1);
        if (e.code === 'ArrowRight') this.codex.select(this.codex.selected + 1);
        if (e.code === 'Escape') this.toMenu();
        return;
      }
      if (this.state === 'cards') {
        const m = e.code.match(/^Digit([1-4])$/);
        if (m && this.currentCards[+m[1] - 1]) this.pickCard(this.currentCards[+m[1] - 1]);
        return;
      }
      if (this.state === 'paused' && e.code === 'Escape') { this.resumePlay(); return; }
      if (this.state !== 'playing') return;
      if (e.code === 'Escape' && TEST) this.pause();
      if (e.code === 'KeyR') this.weapons.startReload();
      if (e.code === 'KeyV') { this.view = this.view === 'fps' ? 'tps' : 'fps'; this.applyView(); }
      if (e.code === 'KeyQ') this.throwFu();
      if (e.code === 'KeyE') { if (this.player.dash()) this.effects.dust(this.player.position.clone().setY(0), 8); }
      if (e.code === 'KeyF') { if (this.skills.castUlt(this.player)) { this.priest.cast(); this.hud.banner('天师降魔', '五雷轰顶 · 万邪伏诛', 1800); } }
      const m = e.code.match(/^Digit([1-6])$/);
      if (m) { this.weapons.switchTo(+m[1] - 1); this.priest.setWeapon(this.weapons.current); }
    });
    document.addEventListener('wheel', (e) => {
      if (this.state !== 'playing') return;
      this.weapons.cycle(e.deltaY > 0 ? 1 : -1);
      this.priest.setWeapon(this.weapons.current);
    });
  }

  pause() {
    this.state = 'paused';
    this.weapons.triggerDown = false;
    Audio.setMinigunSpin(0);
    $('pause-build').innerHTML = this.skills.ownedList().map((s) => `<span>${s.icon} ${s.name}${s.level ? ' ' + s.level : ''}</span>`).join('');
    this.showScreen('pause');
  }

  throwFu() {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const origin = this.view === 'fps' ? this.camera.getWorldPosition(new THREE.Vector3()) : this.player.position.clone().add(new THREE.Vector3(0, -0.2, 0));
    if (this.skills.throwTalisman(origin, dir)) this.priest.cast();
  }

  // ================================================================ 主循环
  tick() {
    const rawDt = Math.min(0.05, this.clock.getDelta());
    if (this.slowT > 0) { this.slowT -= rawDt; if (this.slowT <= 0) this.timeScale = 1; }
    const dt = rawDt * this.timeScale;
    this.world.update(rawDt);

    if (this.state === 'playing' || this.state === 'dying') this.tickGame(dt, rawDt);
    else if (this.state === 'codex') {
      this.codex.update(rawDt);
      this.postfx.grade.uniforms.hurt.value = 0;
      this.postfx.render(this.codex.scene, this.codex.camera, rawDt);
      return;
    } else if (this.state === 'cards' || this.state === 'paused' || this.state === 'result' || this.state === 'story') {
      this.effects.update(rawDt * 0.2);
      if (this.state === 'story' || this.state === 'result') this.tickMenuCamera(rawDt);
    } else {
      this.tickMenuCamera(rawDt);
    }
    this.hurt = Math.max(0, this.hurt - rawDt * 2.5);
    this.postfx.grade.uniforms.hurt.value = this.hurt * 0.8 + (this.state === 'playing' && this.player.hp / this.player.maxHp < 0.3 ? 0.25 : 0);
    this.postfx.grade.uniforms.desat.value = this.state === 'dying' ? Math.min(0.8, this.dyingT) : 0;
    this.postfx.render(this.scene, this.camera, rawDt);
  }

  tickMenuCamera(dt) {
    this.menuT += dt;
    const t = 0.35 + Math.sin(this.menuT * 0.05) * 0.35;
    const r = this.state === 'menu' ? 4.2 : 9;
    this.camera.position.set(Math.sin(t) * r, 1.55 + Math.sin(this.menuT * 0.2) * 0.1, Math.cos(t) * r);
    const side = new THREE.Vector3(Math.cos(t), 0, -Math.sin(t));
    this.camera.lookAt(new THREE.Vector3(0, 1.25, 0).addScaledVector(side, this.state === 'menu' ? -1.5 : 0));
    // 菜单舞台：道长持剑而立，群尸环伺
    if (this.priest.group.visible && this.state === 'menu') {
      this.priest.update(dt, { pos: new THREE.Vector3(0, EYE_HEIGHT, 0), yaw: 0.2 + Math.sin(this.menuT * 0.4) * 0.3, pitch: 0, vel: new THREE.Vector3(), running: false, swingT: -1 });
    }
    for (const a of this.menuActors || []) {
      if (!a.inst.root.visible) continue;
      zeroPose(a.inst.bones);
      const kind = ENEMIES[a.type].kind;
      if (kind === 'jiangshi') {
        const ph = (this.menuT * 1.4 + a.seed) % 1;
        poseJiangshi(a.inst.bones, { t: this.menuT, seed: a.seed, atk: -1, hit: 0, air: ph < 0.6 ? ph / 0.6 : -1, landT: ph < 0.6 ? 0 : (ph - 0.6), style: '' });
        a.inst.root.position.y = ph < 0.6 ? Math.sin(ph / 0.6 * Math.PI) * 0.35 : 0;
      } else {
        a.inst.root.position.y = poseDance(kind, a.inst.bones, this.menuT, a.seed);
      }
    }
    this.effects.update(dt);
  }

  tickGame(dt, rawDt) {
    const P = this.player, W = this.weapons, S = this.skills.stats;
    if (this.state === 'dying') {
      this.dyingT += rawDt;
      this.enemies.update(dt * 0.3, P);
      this.effects.update(dt);
      this.priest.update(rawDt, { pos: P.position, yaw: P.yaw, pitch: 0, vel: new THREE.Vector3(), running: false, swingT: -1 });
      this.placeCamera(rawDt, true);
      if (this.dyingT > 2.2) { if (this._forcedTps) { this._forcedTps = false; } this.endRun(false); }
      return;
    }
    this.runTime += dt;
    const slow = W.def().moveSlow && (W.triggerDown || W.spin > 0.15) ? W.def().moveSlow : 1;
    P.speedMult = S.moveMult * slow;
    P.update(dt);
    if (S.regen) P.heal(S.regen * dt);

    // 视角
    this.placeCamera(dt);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    void fwd;

    if (this.priest.swingT >= 0) { this.priest.swingT += dt / 0.3; if (this.priest.swingT >= 1) this.priest.swingT = -1; }
    this.priest.update(dt, { pos: P.position, yaw: P.yaw, pitch: P.pitch, vel: P.velocity, running: P.isRunning, swingT: this.priest.swingT ?? -1, dashing: P.dashing });
    W.setMoveState(P.moving, P.isRunning);
    W.update(dt, true, this.view, () => this.priest.muzzleWorld());
    this.skills.update(dt, P);
    this._burning = false;
    this.enemies.update(dt, P);
    this.director.update(dt, P.position);
    this.pickups.update(dt, P, S.magnet, (v) => this.gainXp(v), (kind, pos) => {
      if (kind === 'heal') { this.healPlayer(25); Audio.heal(); }
      if (kind === 'chest') { this.pendingChest++; Audio.chest(); this.effects.gold(pos.clone().setY(0.6), 40, 1.5); }
    });
    this.effects.update(dt);
    if (!P.alive) { this.onDeath(); }

    // 过关倒计时
    if (this.clearTimer > 0) {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) {
        if (this.pendingLevels > 0 || this.pendingChest > 0) this.clearTimer = 0.01;
        else { this.openCards('relic'); return; }
      }
    }
    // 升级 / 宝箱选卡
    if (this.state === 'playing' && this.pendingLevels > 0) this.openCards('level');
    else if (this.state === 'playing' && this.pendingChest > 0) this.openCards('chest');

    // HUD
    const H = this.hud;
    const ch = CHAPTERS[this.chapterIdx];
    const D = this.director;
    let line, prog;
    if (D.endless) { line = `无尽轮回 · 第 ${D.endlessN + 1} 轮`; prog = D.phase === 'wave' ? D.waveT / D.waveDef.dur : 1; }
    else if (D.phase === 'boss') { line = '首领现身'; prog = 1; }
    else if (D.phase === 'cleared') { line = '除祟功成'; prog = 1; }
    else { line = `第 ${D.wave + 1} / ${ch.waves.length} 波 · ${fmt(Math.max(0, D.waveDef.dur - D.waveT))}`; prog = D.waveT / D.waveDef.dur; }
    H.chapter(D.endless ? '无尽轮回' : ch.name, line, prog);
    H.xp(this.level, this.xp, xpNeed(this.level));
    H.stats(this.kills, this.gold, this.runTime);
    H.hp(P.hp, P.maxHp);
    H.shield(this.skills.shield);
    H.skills(this.skills.ownedList());
    H.abilities(this.skills.fuCd, S.fuCd, S.fuCount, this.skills.ult, P.dashCd, 2.2);
    H.weapon(W.def(), W.ammo, W.reloading > 0, W.owned, W.current);
    H.crosshair(W.def().spread * (P.moving ? 1.5 : 1) + W.kick * 0.02);
    H.updateBosses();
    H.burn(this._burning);
    H.updateDamageNumbers(rawDt, this.camera);
    this._radarT = (this._radarT || 0) - rawDt;
    if (this._radarT <= 0) { this._radarT = 0.1; H.radar(P.position, P.yaw, this.enemies.list, this.pickups.items); }
  }

  placeCamera(dt, dying = false) {
    const P = this.player;
    const W = this.weapons;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const tr = Math.min(1, W.trauma * 0.7 + this.shake);
    if (this.view === 'tps' || dying) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(dying ? -0.5 : P.pitch, P.yaw, 0, 'YXZ'));
      this.camera.quaternion.copy(q);
      const back = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const pivot = P.position.clone().add(new THREE.Vector3(0, 0.25, 0)).addScaledVector(right, 0.65);
      const dist = dying ? 5 : 3.3;
      const hit = this.world.raycast(pivot, back, dist + 0.3, true);
      const d = hit ? Math.max(0.6, pivot.distanceTo(hit) - 0.3) : dist;
      this.camera.position.copy(pivot).addScaledVector(back, d);
      if (this.camera.position.y < 0.3) this.camera.position.y = 0.3;
    } else {
      this.camera.position.y += P.bob || 0;
    }
    if (tr > 0.01) {
      const t = tr * tr;
      this.camera.rotation.x += (Math.random() - 0.5) * t * 0.06;
      this.camera.rotation.y += (Math.random() - 0.5) * t * 0.06;
      this.camera.rotation.z += (Math.random() - 0.5) * t * 0.03;
    }
    if (W.recoilKick > 0 && !dying) P.pitch += W.recoilKick * dt * 6;
  }
}

window.game = new Game();

// ---------------- 自动化测试钩子（仅 ?test）：快进模拟 + 简易自动战斗
if (TEST) {
  const g = window.game;
  g._bot = () => {
    const P = g.player;
    const e = g.enemies.nearest(P.position, 40);
    P.keys = {};
    if (e) {
      const c = g.enemies.center(e);
      const d = c.clone().sub(g.camera.getWorldPosition(new THREE.Vector3()));
      P.yaw = Math.atan2(-d.x, -d.z);
      P.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      g.weapons.triggerDown = !g.weapons.triggerDown || g.weapons.def().auto;
      const dist = Math.hypot(d.x, d.z);
      if (dist < 6) P.keys.KeyS = true;
      P.keys[(Math.floor(g.runTime / 3) % 2) ? 'KeyA' : 'KeyD'] = true;
      if (Math.random() < 0.02) g.throwFu();
      if (g.skills.ultReady) g.skills.castUlt(P);
    } else g.weapons.triggerDown = false;
  };
  window.sim = (sec, bot = true, god = false) => {
    const n = Math.round(sec * 30);
    for (let i = 0; i < n; i++) {
      if (god) g.player.hp = g.player.maxHp;
      if (g.state === 'playing') { if (bot) g._bot(); g.tickGame(1 / 30, 1 / 30); }
      else if (g.state === 'dying') g.tickGame(1 / 30, 1 / 30);
      else if (g.state === 'cards') g.pickCard(g.currentCards[0]);
      else if (g.state === 'story') g.beginChapter();
      else break;
    }
    return { state: g.state, t: Math.round(g.runTime), ch: g.chapterIdx, wave: g.director.wave, phase: g.director.phase, lvl: g.level, kills: g.kills, hp: Math.round(g.player.hp), alive: g.enemies.aliveCount, owned: g.skills.ownedList().map((x) => x.name + (x.level || '')).join(','), weapons: g.weapons.owned.join(',') };
  };
}
void RELICS; void EVOLUTIONS;
