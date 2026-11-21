import * as THREE from 'three';
import { installHeightFog, MOON_DIR } from './gfx/fog.js';
import { EnvLighting } from './gfx/environment.js';
import { UBER_SHARED, instantiate } from './gfx/rig.js';
import { QUALITY, PostFX } from './postfx.js';
import { World } from './world.js';
import { Player, EYE_HEIGHT } from './player.js';
import { WeaponSystem, WEAPON_DEFS } from './weapons.js';
import { EnemyManager } from './enemies.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { CHAPTERS, ENEMIES, CODEX_ORDER, UPGRADES, upgradeCost, DIFFICULTY, DAWN_AMBIENCE } from './data.js';
import { Progress } from './progress.js';
import { Priest } from './priest.js';
import { SkillSystem, ARTS, PASSIVES, EVOLUTIONS } from './skills.js';
import { Codex } from './codex.js';
import { Director } from './director.js';
import { Pickups } from './pickups.js';
import { CHARACTER_BUILDERS, getTemplate } from './gfx/characters.js';
import { poseDance, poseJiangshi, poseMaster, poseSorcerer, zeroPose } from './gfx/anim.js';
import { getAtlas } from './gfx/textures.js';
import { Dialogue } from './dialogue.js';
import { Cinematic } from './cinematic.js';
import { Achievements, ACHIEVEMENTS } from './achievements.js';
import { SCENES, BARKS, SCROLLS, TIPS, EPIGRAPH, CREDITS } from './story.js';
import { GamepadInput } from './gamepad.js';
import { VRMode } from './vr.js';

installHeightFog();

const $ = (id) => document.getElementById(id);
const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const TEST = new URLSearchParams(location.search).has('test');
const xpNeed = (lv) => Math.round(5 + lv * 3.5 + Math.pow(lv, 1.6) * 1.2);
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const CH_NUM = ['一', '二', '三', '四'];

// 剧情镜头机位
const CAM = {
  coffins: { pos: V3([-5.4, 1.15, -4.4]), look: V3([-8, 0.7, -8]) },
  yard: { pos: V3([7, 11, 29]), look: V3([0, 1, -8]) },
  rain: { pos: V3([-15, 3, 21]), look: V3([-3, 5, 0]) },
  well: { pos: V3([15.2, 1.7, 19.0]), look: V3([18, 0.6, 22]) },
  moon: { pos: V3([5, 1.8, 14]), look: V3([-18, 22, -38]) },
  cracks: { pos: V3([12, 7, 12]), look: V3([0, 0, -4]) },
  gate: { pos: V3([0, 3.5, 2]), look: V3([0, 14, -40]) },
  master: { pos: V3([1.2, 5.2, -14.5]), look: V3([0, 4.6, -22.5]) },
  villain: { pos: V3([2.2, 2.0, -7.2]), look: V3([0, 1.7, -12]) },
};
const COMBO_GRADE = [[150, '仙'], [100, '圣'], [50, '神'], [25, '绝'], [10, '妙']];

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

    this.env = new EnvLighting(this.renderer);
    this.world = new World(this.scene, { env: this.env });
    this.effects = new Effects(this.scene);
    this.enemies = new EnemyManager(this.scene, this.world, this.effects);
    this.pickups = new Pickups(this.scene);
    this.player = new Player(this.camera, this.world, this.renderer.domElement);
    this.priest = new Priest(this.scene);
    this.weapons = new WeaponSystem(this.camera, this.scene, this.effects, (o, d, w, f) => this.handleShot(o, d, w, f), (d) => this.handleMelee(d));
    this.skills = new SkillSystem({
      scene: this.scene, enemies: this.enemies, effects: this.effects, world: this.world, camera: this.camera,
      healPlayer: (v, flat, frac) => this.healPlayer(v, frac),
      addGold: (v) => { this.gold += v; },
      onWeaponGained: (id) => { this.weapons.addWeapon(id); this.priest.setWeapon(this.weapons.current); this.hud.toast(`获得 ${WEAPON_DEFS[id].name}！按 ${this.weapons.owned.indexOf(id) + 1} 切换`); },
      onWeaponUpgraded: (id) => this.weapons.upgrade(id),
      onStatsChanged: () => this.applyStats(),
      shake: (v) => this.addShake(v),
      onFuHit: (n) => { if (n >= 5) this.hud.feed(`<b style="color:#ff9a50">敕令真火</b> 燎中 ${n} 只`); },
      onUlt: () => { this.ultWindow = 3; this.ultKills = 0; this.postfx.flash(0xfff0c0, 0.55, 2); this.postfx.zoomBlur(0.8); },
    });
    this.director = new Director(this.enemies, this.world);
    this.codex = new Codex(this.renderer);
    this.postfx = new PostFX(this.renderer, this.scene, this.camera);
    this.dialogue = new Dialogue();
    this.cine = new Cinematic(this.camera);
    this.achv = new Achievements(this.progress);
    this.pad = new GamepadInput(this);
    this.vr = new VRMode(this);
    this.effects.setViewportHeight(innerHeight);
    this.pickups.setViewportHeight(innerHeight);

    this.state = 'loading';
    this.view = S.view || 'tps';
    // 帧计时（替代已弃用的 THREE.Clock）
    this.clock = { last: performance.now(), getDelta() { const n = performance.now(); const d = (n - this.last) / 1000; this.last = n; return d; } };
    this.shake = 0;
    this.hurt = 0;
    this.timeScale = 1;
    this.worldScale = 1;
    this.slowT = 0;
    this.hitstopT = 0;
    this.menuT = 0;
    this.diff = DIFFICULTY[this.progress.data.lastDiff] || DIFFICULTY.normal;
    this.chapterIdx = 0;
    this.combo = { n: 0, t: 0 };
    this.run = {};

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
    const names = { priest: '道长', normal: '伏尸', purple: '紫僵', white: '白僵', green: '绿僵', hairy: '毛僵', flying: '飞僵', drought: '旱魃', hou: '犼', imp: '小鬼', paper: '纸人', ghost: '红衣厉鬼', wuWhite: '白无常', wuBlack: '黑无常', soldier: '阴兵', sorcerer: '玄阴子', sorcererBeast: '尸化玄阴', master: '玄清子' };
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    $('ld-tip').innerHTML = `<b>道长须知</b>${tip}`;
    getAtlas();
    for (let i = 0; i < ids.length; i++) {
      text.textContent = `塑造 ${names[ids[i]] || ids[i]} 法身…… (${i + 1}/${ids.length})`;
      fill.style.width = ((i / ids.length) * 80).toFixed(0) + '%';
      await new Promise((r) => setTimeout(r, 0));
      getTemplate(ids[i]);
    }
    text.textContent = '点燃灯火……';
    fill.style.width = '90%';
    // 预热书法字体：章节名 / 首领名 / 题诗 / 横幅用字提前拉取字库分片，
    // "犼"这类书法字体没有的字也提前确定回退字体——否则首次登场的名帖会空白一瞬
    try {
      const txt = [...CHAPTERS.map((c) => c.name + (c.bossName || '')), ...Object.values(ENEMIES).map((e) => (e.name || '') + (e.title || '')), ...EPIGRAPH, ...CH_NUM,
        '首领勾魂使者除祟功成鬼门大开尸化犼血入体魂锁光束殊死一搏怒天师降魔五雷轰顶第章茅山残卷道行精进百鬼图鉴'].join('');
      await Promise.race([document.fonts.load('40px "Ma Shan Zheng"', txt), new Promise((r) => setTimeout(r, 2500))]);
    } catch (e) { /* 字体加载失败不影响游戏 */ }
    this.buildMenuActors();
    this.buildSetPieces();
    this.priest.setWeapon('mauser');
    try { this.renderer.compile(this.scene, this.camera); } catch (e) { /* ignore */ }
    fill.style.width = '100%';
    await new Promise((r) => setTimeout(r, 150));
    $('loading').classList.add('hidden');
    this.toMenu();
  }

  buildMenuActors() {
    this.menuActors = [];
    const spots = [['normal', -3.5, -4, 0.3], ['purple', 3.8, -5, -0.4], ['imp', -6, -1, 0.8], ['ghost', 6.2, -2, -0.9], ['white', 0.5, -8, 0], ['soldier', -1.8, -10.5, 0.15]];
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

  // 剧情布景：被锁魂链吊在鬼门前的师父魂魄 + 尚未出手的玄阴子
  buildSetPieces() {
    const m = instantiate(getTemplate('master'));
    m.root.position.set(0, 4.6, -22.5);
    m.root.visible = false;
    m.uber.uRimExtra.value.set(0x3a70ff);
    m.uber.uDissolveColor.value.set(0x9ad0ff);
    for (const mat of m.materials) { mat.transparent = true; mat.opacity = 0.82; mat.emissive.set(0x0a1a3a); }
    this.scene.add(m.root);
    const chains = new THREE.Group();
    const cm = new THREE.MeshStandardMaterial({ color: 0x6a6a7a, metalness: 0.9, roughness: 0.3, emissive: 0x2a0a40 });
    for (const [x, y] of [[-6, 14], [6, 14], [-3, 20], [3, 20]]) {
      const a = new THREE.Vector3(0, 5.4, -22.5), b = new THREE.Vector3(x, y, -36);
      const len = a.distanceTo(b);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6), cm);
      c.position.copy(a).lerp(b, 0.5);
      c.lookAt(b); c.rotateX(Math.PI / 2);
      chains.add(c);
    }
    chains.visible = false;
    this.scene.add(chains);
    this.masterProp = { inst: m, chains, mode: 'meditate', t: 0 };
    const v = instantiate(getTemplate('sorcerer'));
    v.root.position.set(0, 0.35, -12);
    v.root.visible = false;
    this.scene.add(v.root);
    this.villainProp = { inst: v, t: 0 };
  }

  // spirit = 魂魄形态（半透明、幽蓝、飘散灵光）；否则为生人
  showMaster(v, mode = 'meditate', spirit = true) {
    const M = this.masterProp;
    M.inst.root.visible = v; M.chains.visible = v && mode === 'meditate'; M.mode = mode; M.spirit = spirit;
    if (!v) return;
    M.inst.uber.uDissolve.value = 0;
    M.inst.root.position.set(0, 4.6, -22.5);
    M.inst.root.rotation.set(0, 0, 0);
    M.inst.uber.uRimExtra.value.set(spirit ? 0x3a70ff : 0x000000);
    for (const mat of M.inst.materials) { mat.transparent = spirit; mat.opacity = spirit ? 0.82 : 1; mat.emissive.set(spirit ? 0x0a1a3a : 0x000000); mat.needsUpdate = true; }
  }

  updateSetPieces(dt) {
    const M = this.masterProp;
    if (M?.inst.root.visible) {
      M.t += dt;
      zeroPose(M.inst.bones);
      poseMaster(M.inst.bones, M.t, M.mode);
      if (M.mode === 'meditate') M.inst.root.position.y = 4.6 + Math.sin(M.t * 1.2) * 0.12;
      if (M.spirit && Math.random() < dt * 8) this.effects.add.emit(M.inst.root.position.x + (Math.random() - 0.5), M.inst.root.position.y + Math.random() * 1.6, M.inst.root.position.z + (Math.random() - 0.5), 0, 0.5, 0, 0.5, 0.75, 1, 0.12, 1, -0.2, 0.3, 0);
    }
    const Vp = this.villainProp;
    if (Vp?.inst.root.visible) {
      Vp.t += dt;
      zeroPose(Vp.inst.bones);
      poseSorcerer(Vp.inst.bones, { t: Vp.t, seed: 1, mode: 'idle', modeT: 0, atk: -1 });
      Vp.inst.root.position.y = 0.35 + Math.sin(Vp.t * 1.4) * 0.12;
      Vp.inst.root.rotation.y = 0;
    }
  }

  // ================================================================ 氛围
  applyAmbience(a) {
    this.ambience = a;
    this.world.setAmbience(a);
    this.postfx.setGrade(a.grade || {});
    UBER_SHARED.uRimColor.value.set(a.rim ?? 0x5a78b8);
    UBER_SHARED.uRimStrength.value = a.rimK ?? 0.55;
    if (a.audio && Audio.ctx) Audio.setAmbience(a.audio);
  }

  // ================================================================ 界面
  showScreen(id) {
    for (const s of ['menu', 'story', 'upgrade', 'settings', 'help', 'cards', 'pause', 'result', 'diff', 'journal', 'achvs', 'credits']) $(s).classList.toggle('hidden', s !== id);
    $('codex-ui').classList.toggle('hidden', id !== 'codex');
  }

  toMenu() {
    this.flowTok = (this.flowTok || 0) + 1;
    $('fade').classList.remove('on');
    this.state = 'menu';
    this.cine.stop(false);
    this.dialogue.close();
    this.dialogue.clearBarks();
    this.hud.hide();
    this.enemies.clear();
    this.pickups.clear();
    this.effects.clear();
    this.effects.clearDecals();
    this.skills.reset(this.progress.data);
    this.hud.clearDamageNumbers();
    this.setMenuActors(true);
    this.showMaster(false);
    if (this.villainProp) this.villainProp.inst.root.visible = false;
    this.applyAmbience(CHAPTERS[0].ambience);
    this.priest.setVisible(true);
    this.priest.revive();
    this.priest.setWeapon('sword');
    this.weapons.rig.visible = false;
    this.enemies.showPlayerBlob = false;
    this.camera.fov = this.progress.settings.fov; this.camera.updateProjectionMatrix();
    const b = this.progress.data.best;
    const sc = this.progress.scrollCount;
    $('menu-foot').innerHTML = `阳气 <b>${this.progress.yangqi}</b>　·　最远 <b>${b.chapter ? CHAPTERS[Math.min(3, b.chapter - 1)].name : '—'}</b>　·　最多诛邪 <b>${b.kills}</b>　·　最高连斩 <b>${b.combo || 0}</b><br/>残卷 <b>${sc} / 7</b>　·　成就 <b>${this.achv.count} / ${ACHIEVEMENTS.length}</b>${b.endless ? `　·　无尽 <b>${b.endless}</b> 轮` : ''}`;
    $('m-jr-badge').classList.toggle('hidden', sc === 0);
    $('m-jr-badge').textContent = sc;
    this.showScreen('menu');
    Audio.setMuffle(0);
    if (Audio.ctx) { Audio.startMusic('calm'); Audio.setAmbience('yizhuang'); }
  }

  openDifficulty() {
    this.state = 'diff';
    const row = $('diff-row');
    row.innerHTML = '';
    for (const d of Object.values(DIFFICULTY)) {
      const locked = d.unlock && !this.progress.data.clearedDiff[d.unlock] && !this.progress.data.clearedDiff.hell;
      const el = document.createElement('div');
      el.className = `dcard d-${d.id} ${locked ? 'locked' : ''}`;
      el.innerHTML = `${this.progress.data.clearedDiff[d.id] ? '<div class="clr">✦ 已通关</div>' : ''}<div class="d-name">${d.name}</div><div class="d-tag">${d.tag}</div><div class="d-desc">${d.desc}</div><div class="d-rew">阳气收益 ×${d.reward}</div>`;
      el.addEventListener('click', () => { Audio.cardPick(); this.startRun(d.id); });
      el.addEventListener('mouseenter', () => Audio.cardHover());
      row.appendChild(el);
    }
    this.showScreen('diff');
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

  openJournal(sel = null) {
    this.state = 'journal';
    const list = $('jr-list');
    const owned = this.progress.data.scrolls;
    list.innerHTML = SCROLLS.map((s) => `<span data-id="${s.id}" class="${owned[s.id] ? '' : 'lock'}">${owned[s.id] ? s.title : '残卷 · ？？？'}</span>`).join('');
    const pick = (id) => {
      const s = SCROLLS.find((x) => x.id === id);
      list.querySelectorAll('span').forEach((sp) => sp.classList.toggle('on', +sp.dataset.id === id));
      $('jr-title').textContent = owned[id] ? `茅山残卷 · ${s.title}` : '残卷未得';
      $('jr-text').textContent = owned[id] ? s.text : (s.from === 'elite' ? '此卷散落于精英邪祟之手。诛之，或可得之。' : `此卷为${ENEMIES[s.from].name}所携。`);
    };
    list.querySelectorAll('span').forEach((sp) => sp.addEventListener('click', () => { Audio.uiClick(); pick(+sp.dataset.id); }));
    const first = sel ?? (SCROLLS.find((s) => owned[s.id])?.id || 1);
    pick(first);
    $('jr-count').textContent = `已得 ${this.progress.scrollCount} / 7 卷${this.progress.scrollCount >= 7 ? '　·　七星归位，结局或将改写' : ''}`;
    this.showScreen('journal');
  }

  openAchievements() {
    this.state = 'achvs';
    const A = this.progress.data.achv;
    $('av-count').textContent = `已达成 ${this.achv.count} / ${ACHIEVEMENTS.length}`;
    $('av-grid').innerHTML = ACHIEVEMENTS.map((a) => `<div class="av ${A[a.id] ? '' : 'lock'}"><div class="ic">${a.icon}</div><div><div class="n">${a.name}</div><div class="d">${a.desc}</div></div></div>`).join('');
    this.showScreen('achvs');
  }

  rollCredits(onDone) {
    this.state = 'credits';
    const roll = $('cr-roll');
    roll.innerHTML = CREDITS.map(([k, v], i) => (i === 0 ? `<div class="r"><div class="big">${k}</div></div>` : `<div class="r"><div class="k">${k}</div><div class="v">${v}</div></div>`)).join('');
    this.showScreen('credits');
    this.creditsT = 0;
    this.creditsDone = onDone;
    roll.style.top = '100%';
  }

  openSettings(from) {
    this.settingsFrom = from;
    const S = this.progress.settings;
    for (const k of ['master', 'sfx', 'music', 'amb', 'voice', 'sens', 'fov', 'shake']) $('s-' + k).value = S[k];
    const segs = { 's-quality': 'quality', 's-view': 'view', 's-dmgNums': 'dmgNums', 's-gore': 'gore', 's-subs': 'subs' };
    for (const [seg, key] of Object.entries(segs)) {
      const v = typeof S[key] === 'boolean' ? (S[key] ? '1' : '0') : S[key];
      $(seg).querySelectorAll('span').forEach((sp) => sp.classList.toggle('on', sp.dataset.v === v));
    }
    this.showScreen('settings');
  }

  applySettings() {
    const S = this.progress.settings;
    Audio.setVolume(S.sfx, S.music, S.amb, S.voice);
    Audio.setMaster(S.master);
    this.player.sensitivity = S.sens;
    this.camera.fov = S.fov;
    this.camera.updateProjectionMatrix();
    this.hud.showNumbers = S.dmgNums !== false;
    this.effects.gore = S.gore !== false;
    const vr = !!this.vr?.wantVR;
    const q = vr ? 'vr' : QUALITY[S.quality] ? S.quality : 'high';
    const Q = vr ? { ...QUALITY.vr, shadows: this.vr.shadows ? 1024 : 0 } : QUALITY[q];
    const ratio = Math.min(devicePixelRatio || 1, Q.ratio);
    const presenting = this.renderer.xr.isPresenting;
    if (vr) this.hud.showNumbers = false;
    if (!presenting) this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = Q.shadows > 0;
    this.world.moon.castShadow = Q.shadows > 0;
    if (Q.shadows) {
      this.world.moon.shadow.mapSize.set(Q.shadows, Q.shadows);
      this.world.setShadowExtent(q === 'ultra' ? 30 : q === 'high' ? 28 : 26);
    }
    if (this.world.moon.shadow.map) { this.world.moon.shadow.map.dispose(); this.world.moon.shadow.map = null; }
    this.postfx.setQuality(q);
    if (presenting) return;
    this.postfx.setPixelRatio(ratio);
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
      if (c.shield) tr.push('虎头盾 · 正面挡枪');
      if (c.fireMult > 1.4) tr.push(`畏火 · 火伤 ×${c.fireMult}`);
      if (c.fireMult < 1) tr.push('耐火');
      if (c.aura) tr.push('灼烧光环');
      if (c.ai === 'caster') tr.push('远程鬼火 · 瞬移');
      if (c.chain) tr.push('勾魂索 · 召唤小鬼');
      if (c.dash) tr.push('冲锋 · 砸地');
      if (c.charge) tr.push('冲撞 · 震地 · 喷火 · 跃击');
      if (c.ai === 'sorcerer') tr.push('掌心雷 · 飞剑 · 尸化 · 魂锁光束');
      if (c.hop?.h > 1) tr.push('腾跃');
      if (c.tags.includes('jiangshi')) tr.push('怕糯米 · 闭气可避');
      if (c.tags.includes('ghost')) tr.push('畏三清铃');
      if (c.phases) tr.push(`${c.phases.length + 1} 阶段`);
      if (c.boss) tr.push('首领');
      $('cx-traits').innerHTML = tr.map((t) => `<span>${t}</span>`).join('');
      list.querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', i === this.codex.selected));
    };
    this.codex.select(this.codex.selected);
    this.showScreen('codex');
  }

  // ================================================================ 对局流程
  startRun(diffId = 'normal') {
    Audio.unlock();
    this.flowTok = (this.flowTok || 0) + 1;
    this.diff = DIFFICULTY[diffId] || DIFFICULTY.normal;
    this.progress.data.lastDiff = this.diff.id;
    this.progress.save();
    this.director.reset();
    this.director.setDifficulty(this.diff.id);
    this.setMenuActors(false);
    this.enemies.clear();
    this.pickups.clear();
    this.effects.clear();
    this.effects.clearDecals();
    this.hud.clearDamageNumbers();
    this.skills.reset(this.progress.data);
    this.weapons.resetRun();
    this.level = 1; this.xp = 0; this.pendingLevels = 0; this.pendingChest = 0;
    this.kills = 0; this.gold = 0; this.runTime = 0; this.chapterIdx = 0;
    this.combo = { n: 0, t: 0 };
    this.run = { headshots: 0, perfect: 0, maxCombo: 0, scrolls: [], bossHit: false, ultKills: 0, ending: null };
    // 局内计时全部归零（避免上一局的过关倒计时等泄漏到新一局）
    this.clearTimer = 0; this.ultWindow = 0; this.ultKills = 0;
    this.timeScale = 1; this.slowT = 0; this.worldScale = 1; this.worldSlowT = 0; this.hitstopT = 0; this.perfectCd = 0;
    this.lightningT = 12; this.dawnT = 0; this.sealT = 0; this.masterDissolve = 0;
    this.enemies.freezeAll = 0;
    this.enemies.lostCount = 0;
    const up = this.progress.data.up;
    this.player.breathMax = 3.2 + (up.breath || 0) * 0.8;
    this.player.dashCdMax = 2.2 - (up.dash || 0) * 0.2;
    this.applyStats();
    this.player.reset();
    this.player.hp = this.player.maxHp;
    this.priest.revive();
    this.priest.setWeapon(this.weapons.current);
    if (!this.progress.sceneSeen('prologue') && !TEST) this.playPrologue();
    else this.openStory(0);
  }

  playPrologue() {
    this.state = 'prologueScene';
    this.showScreen('none');
    this.applyAmbience(CHAPTERS[0].ambience);
    this.showMaster(true, 'stand', false);
    this.masterProp.inst.root.position.set(1.2, 0, 3);
    this.masterProp.inst.root.rotation.y = -0.6;
    this.priest.setVisible(true);
    this.cine.play([{ dur: 9999, from: { pos: V3([-2.2, 1.8, 7.8]), look: V3([0.6, 1.45, 3]) }, to: { pos: V3([-1.6, 1.7, 7.0]), look: V3([0.6, 1.45, 3]) } }]);
    this.effects.keyLight(V3([-0.4, 2.7, 5.6]), 0xffe2c0, 16, 9999, 9);
    $('dlg-skip').classList.remove('hidden');
    this.dialogue.play(SCENES.prologue, {
      onLine: (L, i) => { if (L.fx === 'gong') { Audio.gong(); this.showMaster(false); this.effects.keyOff(); } void i; },
      onDone: () => {
        $('dlg-skip').classList.add('hidden');
        this.progress.markScene('prologue');
        this.cine.stop(false);
        this.effects.keyOff();
        this.showMaster(false);
        this.openStory(0);
      },
    });
    Audio.startMusic('calm');
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
    $('st-ch').textContent = `第${CH_NUM[ch]}章 · ${c.en}`;
    $('st-name').textContent = c.name;
    $('st-stars').textContent = '☠'.repeat(c.stars);
    $('st-poem').textContent = EPIGRAPH[ch] || '';
    $('st-text').textContent = c.story;
    $('st-diff').textContent = `难度 · ${this.diff.name}`;
    this.applyAmbience(c.ambience);
    this.showMaster(false);
    this.hud.hide();
    this.showScreen('story');
    Audio.startMusic(ch >= 2 ? 'dread' : 'calm');
  }

  beginChapter() {
    const ch = this.chapterIdx;
    this.showScreen('none');
    this.hud.show();
    this.hud.setCine(true);
    this.applyAmbience(CHAPTERS[ch].ambience);
    this.player.enabled = false;
    this.player.position.set(0, EYE_HEIGHT, 8);
    this.player.velocity.set(0, 0, 0);
    this.player.yaw = 0; this.player.pitch = -0.05;
    this.applyView();
    this.hud.setBosses([]);
    this.hud.difficulty(`难度 · ${this.diff.name}`);
    this.enemies.warm(Object.keys(CHAPTERS[ch].waves.reduce((a, w) => Object.assign(a, w.pool), {})).concat(CHAPTERS[ch].boss));
    this.showMaster(ch === 3, 'meditate');
    if (this.villainProp) this.villainProp.inst.root.visible = ch === 3;
    this.lock();
    this.clock.getDelta();
    if (TEST) { this.startPlay(); return; }
    const key = `ch${ch + 1}Intro`;
    const full = !this.progress.sceneSeen(key);
    this.state = 'intro';
    Audio.startMusic(ch >= 2 ? 'dread' : 'calm');
    const hero = this.heroCam();
    if (full) {
      const lines = SCENES[key];
      const first = CAM[lines[0].cam] || CAM.yard;
      const push = { pos: first.pos.clone().lerp(first.look, 0.12), look: first.look };
      this.cine.play([{ dur: 4.5, from: first, to: push, ease: 'linear', holdEnd: true }]);
      $('dlg-skip').classList.remove('hidden');
      this.dialogue.play(lines, {
        auto: true,
        onLine: (L, i) => {
          if (L.cam && i > 0) this.cine.goTo(L.cam === 'hero' ? hero : (CAM[L.cam] || CAM.yard), L.cam === 'hero' ? 3.2 : 3.8);
          if (L.fx === 'gong') Audio.gong();
          this.dialogueKeyLight(L.cam);
        },
        onDone: () => { this.progress.markScene(key); this.finishIntro(); },
      });
    } else {
      this.cine.play([
        { dur: 3.2, from: CAM.yard, to: { pos: hero.pos.clone().add(new THREE.Vector3(0, 2.5, 5)), look: hero.look } },
        { dur: 1.2, to: hero },
      ], { onDone: () => this.finishIntro() });
      this.cine.titleCard(CHAPTERS[ch].name, `第${CH_NUM[ch]}章`, { dur: 3.4 });
    }
  }

  heroCam() {
    return { pos: new THREE.Vector3(0.65, 2.05, 11.3), look: new THREE.Vector3(0.65, 1.75, 0) };
  }

  // 对白特写的主光：给说话的人一盏斜前上方的柔光
  dialogueKeyLight(cam) {
    if (cam === 'villain' && this.villainProp?.inst.root.visible) {
      this.effects.keyLight(this.villainProp.inst.root.position.clone().add(new THREE.Vector3(1.8, 2.8, 2.6)), 0xd0b0ff, 24, 6, 9);
    } else if (cam === 'master' && this.masterProp?.inst.root.visible) {
      this.effects.keyLight(this.masterProp.inst.root.position.clone().add(new THREE.Vector3(1.4, 1.6, 2.4)), 0xa8c8ff, 18, 6, 8);
    } else if (cam === 'hero') {
      this.effects.keyLight(new THREE.Vector3(1.6, 3.2, 10.2), 0xffe0b8, 14, 4.5, 8);
    }
  }

  finishIntro() {
    if (this.state !== 'intro') return;
    $('dlg-skip').classList.add('hidden');
    this.dialogue.close();
    this.cine.stop(false);
    this.effects.keyOff();
    this.startPlay();
  }

  startPlay() {
    const ch = this.chapterIdx;
    this.state = 'playing';
    this.hud.setCine(false);
    this.player.enabled = true;
    this.player.invuln = 1.0;
    if (this.villainProp) this.villainProp.inst.root.visible = ch === 3;
    this.director.startChapter(ch);
    this.cine.titleCard(CHAPTERS[ch].name, `第${CH_NUM[ch]}章　${CHAPTERS[ch].en}`, { dur: 3.2, seal: this.diff.name });
    Audio.gong();
    Audio.startMusic('battle');
    this.lock();
  }

  lock() {
    if (TEST) { this.player.locked = true; return; }
    if (this.vr.active) return;
    const p = this.renderer.domElement.requestPointerLock?.();
    if (p?.catch) p.catch(() => { if (this.state === 'playing') $('click-hint').classList.remove('hidden'); });
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  applyView() {
    const fps = this.view === 'fps';
    this.weapons.rig.visible = fps;
    this.priest.setVisible(!fps);
    this.enemies.showPlayerBlob = !fps;
    $('crosshair').style.display = '';
  }

  healPlayer(v, frac = false) {
    const amt = (frac ? this.player.maxHp * v : v) * (this.diff.heal > 0 ? Math.max(0.5, this.diff.heal) : 0.5);
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
    this.unlock();
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
      d.addEventListener('mouseenter', () => Audio.cardHover());
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
      if (c.kind === 'evo') {
        this.hud.banner(c.name, '道法进阶', 2200);
        this.achv.unlock('evo');
        if (Object.keys(this.skills.evos).length >= Object.keys(EVOLUTIONS).length) this.achv.unlock('evo4');
      }
    }
    const src = this.cardSource;
    if (src === 'level') this.pendingLevels--;
    if (src === 'chest') this.pendingChest--;
    if (src === 'relic') { this.afterRelic(); return; }
    this.resumePlay();
  }

  resumePlay() {
    this.showScreen('none');
    if (this.player.invuln > 100) this.player.invuln = 0.5;
    this.state = 'playing';
    this.player.enabled = true;
    this.lock();
    this.clock.getDelta();
  }

  // 首领伏诛 → 余孽尽散 → 剧情对白 → 法宝 / 结局
  onChapterClear(ch) {
    const bonus = Math.round(150 * (ch + 1) * this.diff.reward);
    this.gold += bonus;
    this.hud.banner('除祟功成', `${CHAPTERS[ch].name} · 阳气 +${bonus}`, 3000);
    Audio.victory();
    this.pickups.vacuum();
    this.pickups.attract('scroll');
    this.clearTimer = 3.4;
    this.achv.unlock(['ch1', 'ch2', 'ch3', 'clear'][ch]);
    // 一道金光扫过，余孽灰飞烟灭
    const feet = new THREE.Vector3(this.player.position.x, 0, this.player.position.z);
    this.effects.shockRing(feet, 40, 0xffe8a0, 1.6);
    this.postfx.flash(0xfff0c8, 0.5, 1.5);
    // 首领已伏诛：撤销尚未落下的天火雷击、清除场地危险与弹幕，道长此刻无敌
    this.enemies.events.length = 0;
    this.enemies.hazards.forEach((h) => { h.active = false; });
    for (const t of this.enemies.telegraphs) this.enemies._dropTelegraph(t);
    this.enemies.telegraphs.length = 0;
    for (const pr of this.enemies.projectiles) this.scene.remove(pr.obj);
    this.enemies.projectiles.length = 0;
    this.player.invuln = 999;
    for (const e of this.enemies.list) if (e.alive && !e.dying && !e.boss) this.enemies.later(0.2 + e.root.position.distanceTo(feet) / 30, () => this.enemies.kill(e, { type: 'art' }));
  }

  playClearScene() {
    const ch = this.chapterIdx;
    this.state = 'scene';
    this.player.enabled = false;
    this.weapons.triggerDown = false;
    Audio.setMinigunSpin(0);
    this.unlock();
    this.hud.setCine(true);
    this.dialogue.clearBarks();
    if (ch === 3) { this.playEnding(); return; }
    const key = `ch${ch + 1}Clear`;
    const P = this.player.position.clone().setY(1.2);
    this.cine.play([{ dur: 40, holdEnd: true, orbit: { center: P, radius: 4.2, height: 0.6, from: this.player.yaw + Math.PI * 0.8, to: this.player.yaw + Math.PI * 1.8, lookY: 0.2 } }]);
    this.priest.setVisible(true);
    $('dlg-skip').classList.remove('hidden');
    Audio.startMusic('calm');
    this.dialogue.play(SCENES[key], {
      onLine: (L) => { if (L.fx === 'burnout') this.effects.puff(this.player.position.clone(), new THREE.Color(0.6, 0.8, 1), 20); },
      onDone: () => {
        $('dlg-skip').classList.add('hidden');
        this.progress.markScene(key);
        this.cine.stop(false);
        this.hud.setCine(false);
        this.applyView();
        this.openCards('relic');
      },
    });
  }

  afterRelic() {
    this.player.hp = this.player.maxHp;
    this.weapons.refillAll();
    const next = this.chapterIdx + 1;
    if (next < CHAPTERS.length) {
      this.enemies.clear();
      this.hud.setBosses([]);
      this.openStory(next);
    } else {
      this.endRun(true);
    }
  }

  // ---------------------------------------------------------------- 结局
  playEnding() {
    this.state = 'ending';
    this.enemies.clear();
    this.hud.setBosses([]);
    this.hud.hide();
    const trueEnd = this.progress.scrollCount >= 7;
    this.run.ending = trueEnd ? 'true' : 'normal';
    const lines = SCENES.endingCommon.concat(trueEnd ? SCENES.endingTrue : SCENES.endingNormal);
    this.showMaster(true, 'meditate');
    this.villainProp.inst.root.visible = false;
    this.priest.setVisible(true);
    this.player.position.set(0, EYE_HEIGHT, -8);
    this.player.yaw = 0;
    this.priest.update(0.016, { pos: this.player.position, yaw: 0, pitch: 0, vel: new THREE.Vector3(), running: false, swingT: -1 });
    this.cine.play([{ dur: 70, holdEnd: true, orbit: { center: new THREE.Vector3(0, 3, -16), radius: 13, height: 1.5, from: 0.5, to: -0.5, lookY: 0.5 } }]);
    $('dlg-skip').classList.remove('hidden');
    Audio.startMusic('dread');
    this.dialogue.play(lines, {
      onLine: (L) => this.endingFx(L.fx, trueEnd),
      onDone: () => {
        $('dlg-skip').classList.add('hidden');
        this.endingFx('dawn', trueEnd);
        this.progress.markScene('ending');
        this.progress.data.endings[this.run.ending] = true;
        if (trueEnd) this.achv.unlock('trueEnd');
        if (this.diff.id === 'hard' || this.diff.id === 'hell') this.achv.unlock('hard');
        if (this.diff.id === 'hell') this.achv.unlock('hell');
        const tok = this.flowTok;
        setTimeout(() => {
          if (tok !== this.flowTok || this.state !== 'ending') return;
          $('fade').classList.add('on');
          setTimeout(() => {
            $('fade').classList.remove('on');
            if (tok !== this.flowTok || this.state !== 'ending') return;
            this.cine.stop(false);
            this.rollCredits(() => this.endRun(true));
          }, 1000);
        }, 2500);
      },
    });
  }

  endingFx(fx, trueEnd) {
    if (!fx) return;
    if (fx === 'quake') { this.cine.shake = 1.4; Audio.slam(); this.effects.debris(new THREE.Vector3(0, 0, -16), 40, 2); }
    if (fx === 'stars') {
      const pts = [[-6, -20], [-3.5, -15], [0, -13], [3, -15.5], [5, -19], [7.5, -22], [9, -18]];
      pts.forEach(([x, z], i) => setTimeout(() => {
        const p = new THREE.Vector3(x, 0, z);
        this.effects.pillar(p, 0xd8c8ff, 30, 0.9, 1.6);
        this.effects.shockRing(p, 3, 0xd0c0ff, 0.6);
        this.effects.bolt(p.clone().setY(30), p.clone().setY(0.2), 0xe0d8ff, 0.12, 0.4);
        Audio.bell();
      }, i * 380));
    }
    if (fx === 'seal') {
      this.postfx.flash(0xfff8e8, 0.9, 0.8);
      Audio.gong();
      this.sealT = 0.001;
      if (!trueEnd) this.masterDissolve = 0.001;
      else { this.showMaster(true, 'stand', false); this.masterProp.inst.root.position.set(1.4, 0, -6.5); this.masterProp.inst.root.rotation.y = -0.5; }
    }
    if (fx === 'dawn' && !this.dawnT) {
      this.dawnT = 0.001;
      this.dawnFrom = this.ambience;
      Audio.startMusic('dawn');
      Audio.setAmbience('dawn');
    }
  }

  updateEnding(dt) {
    if (this.sealT > 0) {
      this.sealT += dt;
      if (this.world.gateU) this.world.gateU.power.value = Math.max(0, 1 - this.sealT / 3);
      if (this.sealT > 3.2) { this.world.chapterSets.gate.visible = false; this.sealT = 0; }
    }
    if (this.masterDissolve > 0) {
      this.masterDissolve += dt / 4;
      this.masterProp.inst.uber.uDissolve.value = Math.min(1, this.masterDissolve);
      this.masterProp.chains.visible = false;
      if (Math.random() < dt * 30) this.effects.embersBurst(this.masterProp.inst.root.position.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Color(0.6, 0.8, 1), 2, 0.5);
      if (this.masterDissolve >= 1) { this.masterDissolve = 0; this.showMaster(false); }
    }
    if (this.dawnT > 0) {
      this.dawnT += dt / 6;
      const k = Math.min(1, this.dawnT);
      this.world.blendAmbience(this.dawnFrom, DAWN_AMBIENCE, k * k * (3 - 2 * k));
      this.postfx.setGrade(k > 0.5 ? DAWN_AMBIENCE.grade : this.dawnFrom.grade);
      UBER_SHARED.uRimColor.value.set(this.dawnFrom.rim).lerp(new THREE.Color(DAWN_AMBIENCE.rim), k);
      if (k >= 1) { this.dawnT = 0; this.applyAmbience(DAWN_AMBIENCE); }
    }
  }

  endRun(victory) {
    this.state = 'result';
    this.player.enabled = false;
    this.weapons.triggerDown = false;
    Audio.setMinigunSpin(0);
    Audio.setLowHp(0);
    Audio.setMuffle(0);
    this.cine.stop(false);
    this.dialogue.close();
    this.dialogue.clearBarks();
    this.unlock();
    this.hud.hide();
    this.showMaster(false);
    this.dawnT = 0; this.sealT = 0; this.masterDissolve = 0;
    if (this.world.gateU) this.world.gateU.power.value = 1;
    if (this.villainProp) this.villainProp.inst.root.visible = false;
    const chReached = this.director.endless ? 4 : this.chapterIdx + (victory ? 1 : 0);
    const gain = Math.round((this.gold + this.kills * 1.5 + this.runTime * 0.5) * this.diff.reward);
    this.progress.addYangqi(gain);
    this.progress.data.stats.kills += this.kills;
    this.progress.data.stats.headshots += this.run.headshots || 0;
    this.progress.record({ chapter: Math.max(1, chReached), time: this.runTime, kills: this.kills, level: this.level, endless: this.director.endlessN, cleared: victory, diff: this.diff.id, combo: this.run.maxCombo, ending: this.run.ending, quit: this._quit });
    this._quit = false;
    if (this.progress.data.stats.kills >= 5000) this.achv.unlock('kills5000');
    if (this.progress.data.stats.headshots >= 100) this.achv.unlock('headshot100');
    const rt = $('rs-title');
    rt.textContent = victory ? (this.director.endless ? '轮回圆满' : this.run.ending === 'true' ? '师恩如山' : '三界肃清') : '道长阵亡';
    rt.className = victory ? 'win' : 'lose';
    $('rs-sub').textContent = victory ? (this.run.ending === 'true' ? '七星锁魂，师徒同归' : this.director.endless ? '邪祟无穷，道心不灭' : '鬼门永闭，一灯长明') : `止步于 ${this.director.endless ? `无尽轮回 第 ${this.director.endlessN + 1} 轮` : CHAPTERS[this.chapterIdx].name}`;
    $('rs-grid').innerHTML = `<div>存活时间<b>${fmt(this.runTime)}</b></div><div>诛邪<b>${this.kills}</b></div><div>道行<b>${this.level}</b></div>
      <div>最高连斩<b>${this.run.maxCombo || 0}</b></div><div>完美闪避<b>${this.run.perfect || 0}</b></div><div>获得阳气<b style="color:#ffd060">+${gain}</b></div>
      <div>难度<b>${this.diff.name}</b></div><div>章节<b>${Math.min(4, this.chapterIdx + 1)} / 4</b></div><div>残卷<b>${this.progress.scrollCount} / 7</b></div>`;
    $('rs-build').innerHTML = this.skills.ownedList().map((s) => `<span>${s.icon} ${s.name}${s.level ? ' ' + s.level : ''}</span>`).join('');
    $('rs-endless').classList.toggle('hidden', !(victory && !this.director.endless));
    this.showScreen('result');
    if (!victory) Audio.defeat();
    Audio.startMusic(victory ? 'dawn' : 'calm');
  }

  continueEndless() {
    this.showScreen('none');
    this.hud.show();
    this.state = 'playing';
    this.applyAmbience(CHAPTERS[3].ambience);
    this.player.enabled = true;
    this.player.hp = this.player.maxHp;
    this.player.position.set(0, EYE_HEIGHT, 8);
    this.applyView();
    this.lock();
    this.director.startEndless();
    this.hud.banner('无尽轮回', '邪祟无穷，道心不灭', 2600);
    Audio.startMusic('battle');
  }

  // ================================================================ 战斗手感
  addShake(v) { this.shake = Math.min(1.2, this.shake + v * (this.progress.settings.shake ?? 1)); }
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); }
  slowmo(scale, dur) { this.timeScale = Math.min(this.timeScale, scale); this.slowT = Math.max(this.slowT, dur); }

  handleShot(origin, dir, def, first) {
    const hit = this.enemies.raycast(origin, dir, def.range);
    const wHit = this.world.raycast(origin, dir, def.range);
    let end = origin.clone().addScaledVector(dir, def.range);
    if (hit && (!wHit || hit.point.distanceToSquared(origin) < wHit.distanceToSquared(origin))) {
      end = hit.point;
      const s = this.skills.stats;
      const crit = Math.random() < s.crit;
      const dmg = def.damage * s.gunDmg * (hit.headshot ? def.headMult * s.headMult : 1) * (crit ? 2 : 1);
      const e = hit.enemy;
      const info = { type: 'bullet', knock: def.knock, dir, point: hit.point, crit, headshot: hit.headshot };
      const died = this.enemies.damage(e, dmg, info);
      if (info.blocked) {
        this.effects.sparks(hit.point, 10);
        this.hud.hit(false, false, true);
        Audio.swordHit();
      } else {
        Audio.hitMarker(hit.headshot);
        Audio.hitFlesh(hit.point, def.id === 'shotgun' || def.id === 'ak47');
        this.hud.hit(hit.headshot, died);
        this.bloodFx(e, hit.point, dir, died);
      }
      if (died) {
        Audio.killConfirm(hit.headshot);
        this.hitstop(hit.headshot ? 0.06 : 0.03);
        if (hit.headshot) this.run.headshots++;
      }
    } else if (wHit) {
      end = wHit;
      this.effects.sparks(wHit);
      if (Math.random() < 0.5) this.effects.dust(wHit, 2);
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
    return mp.applyMatrix4(this.weapons.rig.matrixWorld);
  }

  bloodFx(e, p, dir, died) {
    const k = e.cfg.kind;
    if (k === 'ghost' || k === 'wuWhite' || k === 'wuBlack' || k === 'soldier') this.effects.ichor(p, new THREE.Color(0.5, 0.7, 1));
    else if (k === 'paper') this.effects.puff(p, new THREE.Color(0.9, 0.85, 0.7), 6, false);
    else if (k === 'imp') this.effects.ichor(p, new THREE.Color(0.3, 1, 0.4));
    else if (k === 'sorcerer') this.effects.ichor(p, new THREE.Color(0.7, 0.3, 1));
    else if (!this.effects.gore) this.effects.puff(p, new THREE.Color(0.3, 0.3, 0.3), 4, false);
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
    for (let i = 0; i < 16; i++) {
      const a = (i / 15 - 0.5) * def.arc;
      const d = fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      const p = feet.clone().addScaledVector(d, 1.6).setY(1.1 + (i / 15) * 0.4);
      this.effects.add.emit(p.x, p.y, p.z, d.x * 2, 0, d.z * 2, 1, 0.7, 0.45, 0.22, 0.25, 0, 3, -0.5, 0.9);
    }
    if (n) { Audio.swordHit(); this.hud.hit(false, false); this.addShake(0.1); this.hitstop(0.05); }
  }

  onPlayerHit(dmg, from, kind) {
    if (this.state !== 'playing' || !this.player.alive) return;
    if (kind === 'aura') {
      this.player.hp = Math.max(0, this.player.hp - dmg * this.skills.stats.armor);
      this._burning = true;
      this.run.bossHit = true;
      if (this.player.hp <= 0) this.player.alive = false;
      return;
    }
    // 罡步闪避中被击：完美闪避
    if (this.player.dashing) { this.perfectDodge(from); return; }
    if (this.player.invuln > 0) return;
    if (this.skills.absorb()) {
      this.effects.shockRing(new THREE.Vector3(this.player.position.x, 0, this.player.position.z), 2, 0xffe080, 0.35);
      this.hud.damageNumber(this.player.position.clone(), '金光', 'crit');
      this.player.invuln = 0.4;
      return;
    }
    const d = dmg * this.skills.stats.armor;
    if (this.player.takeDamage(d)) {
      this.hurt = 1;
      this.addShake(0.3 + Math.min(0.4, d / 60));
      this.priest.hurt();
      this.hud.damageNumber(this.player.position.clone().add(new THREE.Vector3(0, -0.3, 0)), '-' + Math.round(d), 'player');
      this.hud.damageDir(from, this.camera);
      this.postfx.aberrate(0.8);
      this.director.playerHurt(d / this.player.maxHp);
      this.run.bossHit = true;
      if (this.combo.n >= 10) this.hud.feed(`<span style="color:#ff8060">连斩中断 · ${this.combo.n}</span>`);
      this.combo.n = 0;
      if (!this.run.lowHpBark && this.player.hp / this.player.maxHp < 0.35) { this.run.lowHpBark = true; this.bark(BARKS.lowHp); }
    }
  }

  perfectDodge(from) {
    if (this.perfectCd > 0) return;
    this.perfectCd = 1.6;
    this.run.perfect++;
    this.worldScale = 0.3;
    this.worldSlowT = 1.3;
    this.player.dashCd = 0;
    this.skills.addUlt(6);
    this.player.invuln = Math.max(this.player.invuln, 0.5);
    this.hud.perfect();
    this.postfx.flash(0xd8ecff, 0.35, 3);
    this.postfx.zoomBlur(0.7);
    this.postfx.aberrate(1.2);
    Audio.perfectDodge();
    this.effects.shockRing(new THREE.Vector3(this.player.position.x, 0.1, this.player.position.z), 4, 0x9ad0ff, 0.6);
    if (this.run.perfect === 1) this.bark(BARKS.perfect);
    if (this.run.perfect >= 10) this.achv.unlock('perfect10');
    void from;
  }

  bark(list, vars = {}) {
    if (!this.progress.settings.subs) return;
    const L = Array.isArray(list) ? list : [list];
    for (const b of L) this.dialogue.bark(b.who, b.text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ''));
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
    Audio.stopMusic(2);
    this.slowmo(0.35, 1.2);
    this.bark(BARKS.death);
    if (this.view === 'fps') { this.view = 'tps'; this.applyView(); this._forcedTps = true; }
  }

  // 首领登场过场
  playBossIntro(list) {
    const boss = list[0];
    const ch = this.chapterIdx;
    const key = this.director.endless ? null : `ch${ch + 1}Boss`;
    const short = !key || this.progress.sceneSeen(key) || TEST;
    if (this.villainProp?.inst.root.visible && boss.cfg.kind === 'sorcerer') {
      this.villainProp.inst.root.visible = false;
      boss.spawnT = 0;
      boss.root.position.copy(this.villainProp.inst.root.position);
    }
    this.enemies.freezeAll = 99;
    this.state = 'cine';
    this.hud.setCine(true);
    this.player.enabled = false;
    this.weapons.triggerDown = false;
    const P = this.player.position;
    const bp = boss.root.position;
    const dir = new THREE.Vector3(P.x - bp.x, 0, P.z - bp.z).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const h = boss.height || 2;
    // 首领此刻还在地下（破土升起中），机位按它站定后的高度取景
    const baseY = boss.floatY ?? 0;
    const look = () => new THREE.Vector3(bp.x, baseY + h * 0.62, bp.z);
    const near = { pos: bp.clone().addScaledVector(dir, 3.2 + h).addScaledVector(side, 1.2).setY(baseY + h * 0.45 + 0.4), look: look() };
    const far = { pos: bp.clone().addScaledVector(dir, 6.5 + h * 1.5).addScaledVector(side, 2.2).setY(baseY + h * 0.6 + 1.2), look: look() };
    const back = this.gameplayCamPose();
    const names = list.map((b) => b.cfg.name).join(' · ');
    const titles = list.length > 1 ? '勾魂使者' : boss.cfg.title;
    const total = short ? 2.6 : 5.2;
    // 登场主光：斜前上方打亮首领轮廓（夜景里首领不再是一团剪影）
    const keyCol = { sorcerer: 0xc8a8ff, hou: 0xffa868, jiangshi: 0xffb878, wuWhite: 0xc8d8ff, wuBlack: 0xc8d8ff }[boss.cfg.kind] ?? 0xffd8b0;
    this.effects.keyLight(new THREE.Vector3(bp.x, 0, bp.z).addScaledVector(dir, 2.4 + h * 0.5).addScaledVector(side, 1.8).setY(baseY + h * 1.1 + 0.8), keyCol, 26 + h * 8, total + 1, 10 + h * 3);
    this.cine.play([
      { dur: 0.9, to: far, ease: 'out' },
      { dur: total - 1.8, from: far, to: near, ease: 'linear', fov: (this.camera.fov || 75) * 0.82, fovFrom: this.camera.fov },
      { dur: 0.9, to: back },
    ], { onDone: () => this.endBossIntro() });
    setTimeout(() => this.cine.titleCard(names, titles, { dur: total - 1.1, kind: 'boss', seal: '首领' }), 450);
    if (!short) { this.bark(SCENES[key]); this.progress.markScene(key); }
    Audio.bossIntro();
    setTimeout(() => Audio.bossRoar(bp), 900);
    Audio.startMusic(boss.cfg.kind === 'sorcerer' ? 'final' : 'boss');
  }

  // 首领伏诛：慢镜头环绕特写
  killCam(e) {
    this.state = 'cine';
    this.hud.setCine(true);
    this.player.enabled = false;
    this.weapons.triggerDown = false;
    Audio.setMinigunSpin(0);
    const c = e.root.position.clone();
    c.y = Math.max(0.8, e.height * 0.45);
    const yaw0 = Math.atan2(this.camera.position.x - c.x, this.camera.position.z - c.z);
    const r = 4.2 + e.height * 1.2;
    this.effects.keyLight(c.clone().add(new THREE.Vector3(Math.sin(yaw0 + 0.6) * 3, e.height * 0.9 + 1, Math.cos(yaw0 + 0.6) * 3)), 0xffe2c0, 22 + e.height * 6, 3.6, 12);
    this.cine.play([
      { dur: 2.7, ease: 'out', orbit: { center: c, radius: r, height: 0.5, from: yaw0, to: yaw0 + 1.15, lookY: 0 } },
      { dur: 0.8, to: this.gameplayCamPose() },
    ], { onDone: () => this.endBossIntro() });
    this.slowmo(0.3, 2.4);
  }

  endBossIntro() {
    if (this.state !== 'cine') return;
    this.enemies.freezeAll = 0;
    this.state = 'playing';
    this.hud.setCine(false);
    this.player.enabled = true;
    this.camera.fov = this.progress.settings.fov;
    this.camera.updateProjectionMatrix();
  }

  gameplayCamPose() {
    const P = this.player;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(P.pitch, P.yaw, 0, 'YXZ'));
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const pivot = P.position.clone().add(new THREE.Vector3(0, 0.25, 0)).addScaledVector(right, 0.65);
    const pos = this.view === 'tps' ? pivot.clone().addScaledVector(back, 3.3) : P.position.clone();
    const look = pos.clone().addScaledVector(back, -10);
    return { pos, look };
  }

  wire() {
    this.enemies.onKill = (e, info) => {
      this.kills++;
      const p = e.root.position.clone();
      // 连斩
      this.combo.n++; this.combo.t = 3.2;
      this.run.maxCombo = Math.max(this.run.maxCombo, this.combo.n);
      if (this.combo.n % 10 === 0) Audio.comboTick(this.combo.n);
      if (this.combo.n >= 50) this.achv.unlock('combo50');
      if (this.combo.n >= 150) this.achv.unlock('combo150');
      const comboK = 1 + Math.min(0.5, this.combo.n * 0.01);
      const xp = e.cfg.xp * (e.elite ? 5 : 1);
      this.pickups.dropXp(p, xp);
      this.gold += Math.ceil(e.cfg.xp * (e.elite ? 3 : 1) * comboK);
      this.skills.addUlt((e.boss ? 35 : e.elite ? 6 : 1.4) * (1 + Math.min(0.5, this.combo.n * 0.008)));
      if (this.skills.stats.lifesteal) this.player.heal(this.skills.stats.lifesteal);
      if (this.ultWindow > 0) { this.ultKills++; if (this.ultKills >= 30) this.achv.unlock('ult30'); }
      if (this.kills >= 500) this.achv.unlock('kills500');
      if (e.elite) {
        this.pickups.dropChest(p);
        this.hud.feed(`诛灭精英 <b style="color:#ff9a40">${e.label || e.cfg.name}</b>`);
        if (Math.random() < 0.24) this.dropScroll(p.clone().add(new THREE.Vector3(1.2, 0, 0)), 'elite');
        if (!this.run.firstElite) { this.run.firstElite = true; }
      } else if (this.diff.heal > 0 && Math.random() < 0.012 * this.diff.heal) this.pickups.dropHeal(p);
      if (e.boss) {
        this.progress.data.stats.bosses++;
        this.pickups.dropChest(p.clone().add(new THREE.Vector3(1.5, 0, 0)));
        this.pickups.vacuum();
        this.hud.feed(`<b style="color:#ff5040">${e.cfg.name}</b> 伏诛！`);
        this.effects.fireBurst(p, 5);
        this.addShake(1);
        this.slowmo(0.22, 1.1);
        this.postfx.flash(0xffe0c0, 0.4, 2);
        this.dropScroll(p.clone().add(new THREE.Vector3(-1.5, 0, 0)), e.cfg.id);
        if (!this.run.bossHit && !this.director.endless) this.achv.unlock('nohit');
        const remaining = this.enemies.list.filter((b) => b.boss && b.alive && !b.dying);
        if (!remaining.length && this.state === 'playing') this.killCam(e);
      }
      this.progress.markSeen(e.type);
      if (CODEX_ORDER.every((t) => this.progress.data.seen[t])) this.achv.unlock('codex');
      void info;
    };
    this.enemies.onDamage = (e, dmg, pos, info) => {
      if (info.dot && dmg < 4) return;
      if (info.immune) { this.hud.damageNumber(pos, '免疫', 'block'); return; }
      if (info.warded) { this.hud.damageNumber(pos, '符护', 'ward'); return; }
      const cls = info.blocked ? 'block' : info.crit ? 'crit' : info.type === 'fire' ? 'fire' : info.type === 'art' ? 'art' : '';
      this.hud.damageNumber(pos, info.blocked ? '格挡' : info.crit ? dmg + '!' : String(dmg), cls);
      if (e.elite && !this.run.eliteBark) { this.run.eliteBark = true; this.bark(BARKS.firstElite); }
    };
    this.enemies.onPlayerHit = (dmg, from, kind) => this.onPlayerHit(dmg, from, kind);
    this.enemies.onSummon = (type, pos) => { const e = this.director.spawnOne(type, this.player.position, { at: pos }); this.effects.puff(pos.clone().setY(1), new THREE.Color(0.6, 0.4, 1), 12); return e; };
    this.enemies.onShake = (v) => this.addShake(v);
    this.enemies.onStagger = (e) => {
      this.hud.banner('破绽', `${e.cfg.name} 跪地 · 伤害 ×1.6`, 1600);
      this.hitstop(0.14);
      this.addShake(0.4);
      this.postfx.flash(0xfff0c0, 0.25, 4);
      this.achv.unlock('stagger');
      if (e.staggers === 1) this.bark(BARKS.stagger);
    };
    this.enemies.onPhase = (e, ph) => {
      const k = e.cfg.kind;
      this.addShake(0.5);
      if (ph === 'partner') { this.bark(BARKS.bossHalf.partner); return; }
      if (k === 'sorcerer') {
        this.bark(ph === 1 ? BARKS.bossHalf.sorcerer1 : BARKS.bossHalf.sorcerer2);
        this.hud.banner(ph === 1 ? '尸化' : '鬼门大开', ph === 1 ? '犼血入体' : '魂锁光束', 2400);
        this.postfx.flash(0xb050ff, 0.35, 1.5);
        this.world.lightning(1.4);
        if (ph === 2 && this.world.gateU) this.world.gateU.power.value = 2.2;
        return;
      }
      if (k === 'jiangshi' && ph === 1) this.bark(BARKS.bossHalf.drought);
      else if (k === 'hou' && ph === 1) this.bark(BARKS.bossHalf.hou);
      this.hud.banner(ph >= 2 ? '殊死一搏' : '怒', `${e.cfg.name} 进入第 ${ph + 1} 阶段`, 1800);
    };
    this.enemies.onWardBreak = () => this.hud.toast('符护已破！');
    this.director.onWaveStart = (ch, w, total) => {
      const B = BARKS['ch' + (ch + 1)];
      if (this.director.endless) {
        this.hud.banner(`无尽 · 第 ${this.director.endlessN + 1} 轮`, '邪祟愈发凶悍', 2000);
        if (this.director.endlessN >= 10) this.achv.unlock('endless10');
      } else if (w > 0) {
        this.hud.banner(`第 ${w + 1} / ${total} 波`, '邪祟来袭', 1800);
        if (B?.['wave' + (w + 1)]) this.bark(B['wave' + (w + 1)]);
      } else if (B?.wave1) {
        setTimeout(() => { if (this.state === 'playing' && this.chapterIdx === ch) this.bark(B.wave1); }, 6000);
      }
      Audio.waveHorn();
    };
    this.director.onBossStart = (ch, list, name) => {
      this.hud.setBosses(list);
      this.run.bossHit = false;
      for (const b of list) this.progress.markSeen(b.type);
      this.addShake(0.6);
      if (this.state === 'playing') this.playBossIntro(list);
      void name;
    };
    this.director.onHorde = (dirName, pos) => {
      this.hud.banner('尸潮将至', `自${dirName}方涌来`, 2400);
      Audio.hordeWarn();
      this.bark(BARKS.horde, { dir: dirName });
      this.effects.shockRing(pos, 6, 0xff3020, 1.2);
      this.addShake(0.25);
    };
    this.director.onChapterClear = (ch) => this.onChapterClear(ch);
    this.player.onBreath = (ev) => {
      if (ev === 'start') Audio.breathIn();
      if (ev === 'gasp') { Audio.gasp(); this.hud.toast('气竭！'); }
    };
  }

  dropScroll(pos, from) {
    let s = null;
    if (from === 'elite') {
      const cands = SCROLLS.filter((x) => x.from === 'elite' && !this.progress.data.scrolls[x.id] && !this.run.scrolls.includes(x.id));
      if (!cands.length) return;
      s = cands[Math.floor(Math.random() * cands.length)];
    } else {
      s = SCROLLS.find((x) => x.from === from && !this.progress.data.scrolls[x.id]);
      if (!s && from === 'wuBlack') s = SCROLLS.find((x) => x.from === 'wuWhite' && !this.progress.data.scrolls[x.id]);
      if (!s) return;
    }
    if (this.run.scrolls.includes(s.id)) return;
    this.run.scrolls.push(s.id);
    this.pickups.dropScroll(pos, s.id);
  }

  pickScroll(id) {
    const s = SCROLLS.find((x) => x.id === id);
    if (!s) return;
    this.progress.addScroll(id);
    Audio.scroll();
    this.hud.banner(`茅山残卷 · ${s.title}`, `已得 ${this.progress.scrollCount} / 7 卷 · 可于主菜单「茅山残卷」查阅`, 3200, { queue: true });
    this.bark(BARKS.scroll);
    this.effects.gold(this.player.position.clone(), 40, 1.5);
    if (this.progress.scrollCount >= 7) this.achv.unlock('scrolls');
  }

  // ================================================================ 输入
  bindUI() {
    const on = (id, fn) => $(id).addEventListener('click', () => { Audio.unlock(); Audio.uiClick(); fn(); });
    on('m-start', () => this.openDifficulty());
    on('m-upgrade', () => this.openUpgrades());
    on('m-codex', () => this.openCodex());
    on('m-journal', () => this.openJournal());
    on('m-achv', () => this.openAchievements());
    on('m-settings', () => { this.state = 'settings'; this.openSettings('menu'); });
    on('m-help', () => { this.state = 'help'; this.showScreen('help'); });
    on('m-credits', () => this.rollCredits(() => this.toMenu()));
    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { Audio.uiClick(); this.toMenu(); }));
    document.querySelectorAll('.menu-btns .btn').forEach((b) => b.addEventListener('mouseenter', () => Audio.cardHover()));
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
    on('p-quit', () => { this._quit = true; this.endRun(false); });
    on('rs-again', () => this.openDifficulty());
    on('rs-menu', () => this.toMenu());
    on('rs-endless', () => this.continueEndless());
    on('s-back', () => {
      this.progress.save();
      if (this.settingsFrom === 'pause') this.showScreen('pause'); else this.toMenu();
    });
    $('credits').addEventListener('click', () => this.finishCredits());
    $('set-tabs').querySelectorAll('span').forEach((t) => t.addEventListener('click', () => {
      $('set-tabs').querySelectorAll('span').forEach((x) => x.classList.toggle('on', x === t));
      document.querySelectorAll('#settings [data-tab]').forEach((d) => d.classList.toggle('hidden', d.dataset.tab !== t.dataset.t));
    }));
    const S = this.progress.settings;
    const range = (id, key) => $(id).addEventListener('input', (e) => { S[key] = parseFloat(e.target.value); this.applySettings(); });
    for (const k of ['master', 'sfx', 'music', 'amb', 'voice', 'sens', 'fov', 'shake']) range('s-' + k, k);
    const segs = { 's-quality': 'quality', 's-view': 'view', 's-dmgNums': 'dmgNums', 's-gore': 'gore', 's-subs': 'subs' };
    for (const [seg, key] of Object.entries(segs)) {
      $(seg).querySelectorAll('span').forEach((sp) => sp.addEventListener('click', () => {
        S[key] = (key === 'dmgNums' || key === 'gore' || key === 'subs') ? sp.dataset.v === '1' : sp.dataset.v;
        $(seg).querySelectorAll('span').forEach((x) => x.classList.toggle('on', x === sp));
        if (key === 'view') this.view = S.view;
        this.applySettings();
      }));
    }
  }

  finishCredits() {
    if (this.state !== 'credits') return;
    const cb = this.creditsDone;
    this.creditsDone = null;
    if (cb) cb(); else this.toMenu();
  }

  bindInput() {
    addEventListener('resize', () => {
      if (this.renderer.xr.isPresenting) return;
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.postfx.setSize(innerWidth, innerHeight);
      this.codex.resize(innerWidth, innerHeight);
      this.effects.setViewportHeight(innerHeight);
      this.pickups.setViewportHeight(innerHeight);
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    // 浏览器要求用户交互后才能出声：首次点击 / 按键时唤醒音频并奏响主菜单配乐
    const wake = () => {
      const first = !Audio.ctx;
      Audio.unlock();
      if (first && (this.state === 'menu' || this.state === 'diff')) { Audio.startMusic('calm'); Audio.setAmbience('yizhuang'); }
      removeEventListener('pointerdown', wake, true); removeEventListener('keydown', wake, true);
    };
    addEventListener('pointerdown', wake, true);
    addEventListener('keydown', wake, true);
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      this.player.locked = locked || TEST;
      if (locked) $('click-hint').classList.add('hidden');
      if (!locked && this.state === 'playing' && !TEST) this.pause();
      if (!locked && this.state === 'intro') this.finishIntro();
    });
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.player.locked) this.lock();
    });
    const inScene = () => this.state === 'intro' || this.state === 'scene' || this.state === 'ending' || this.state === 'prologueScene';
    document.addEventListener('mousedown', (e) => {
      if (this.state === 'codex' && e.target.tagName === 'CANVAS') { this.codex.dragging = true; this._dragX = e.clientX; return; }
      if (inScene() && this.dialogue.active && e.target.tagName === 'CANVAS') { this.dialogue.advance(); return; }
      if (this.state !== 'playing' || !this.player.locked) return;
      if (e.button === 0) this.weapons.triggerDown = true;
      if (e.button === 2) this.throwFu();
    });
    document.addEventListener('mousemove', (e) => {
      if (this.state === 'codex' && this.codex.dragging) { this.codex.rotate(e.clientX - this._dragX); this._dragX = e.clientX; }
    });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.weapons.triggerDown = false; this.codex.dragging = false; });
    document.addEventListener('keydown', (e) => {
      if (this.state === 'credits') { if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') this.finishCredits(); return; }
      if (this.dialogue.active && inScene()) {
        if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.dialogue.advance(); }
        if (e.code === 'Escape') { this.dialogue.skip(); if (this.state === 'intro') this.finishIntro(); }
        return;
      }
      if (this.state === 'intro' && (e.code === 'Escape' || e.code === 'Space')) { this.finishIntro(); return; }
      if (this.state === 'cine' && (e.code === 'Escape' || e.code === 'Space')) { this.cine.stop(); return; }
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
      if (['diff', 'upgrade', 'help', 'journal', 'achvs'].includes(this.state) && e.code === 'Escape') { this.toMenu(); return; }
      if (this.state !== 'playing') return;
      if (e.code === 'Escape' && TEST) this.pause();
      if (e.code === 'KeyR') this.weapons.startReload();
      if (e.code === 'KeyV') { this.view = this.view === 'fps' ? 'tps' : 'fps'; this.applyView(); }
      if (e.code === 'KeyQ') this.throwFu();
      if (e.code === 'KeyE') { if (this.player.dash()) { this.effects.dust(this.player.position.clone().setY(0), 8); this.postfx.zoomBlur(0.35); } }
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
    $('pause-info').textContent = `${CHAPTERS[this.chapterIdx].name}　·　难度 ${this.diff.name}　·　${fmt(this.runTime)}`;
    $('pause-build').innerHTML = this.skills.ownedList().map((s) => `<span>${s.icon} ${s.name}${s.level ? ' ' + s.level : ''}</span>`).join('');
    this.showScreen('pause');
  }

  throwFu() {
    const ray = this.vr.active ? this.vr.handRay('left') : null;
    if (ray) { if (this.skills.throwTalisman(ray.origin, ray.dir)) this.priest.cast(); return; }
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const origin = this.view === 'fps' ? this.camera.getWorldPosition(new THREE.Vector3()) : this.player.position.clone().add(new THREE.Vector3(0, -0.2, 0));
    if (this.skills.throwTalisman(origin, dir)) this.priest.cast();
  }

  // ================================================================ 主循环
  tick() {
    const rawDt = Math.min(0.05, this.clock.getDelta());
    let gdt = rawDt;
    if (this.hitstopT > 0) { this.hitstopT -= rawDt; gdt = rawDt * 0.05; }
    if (this.slowT > 0) { this.slowT -= rawDt; if (this.slowT <= 0) this.timeScale = 1; }
    if (this.worldSlowT > 0) { this.worldSlowT -= rawDt; if (this.worldSlowT <= 0) this.worldScale = 1; }
    const dt = gdt * this.timeScale;
    UBER_SHARED.uTime.value += dt * this.worldScale;
    this.world.update(rawDt, this.camera.position);
    this.dialogue.update(rawDt);
    this.cine.update(rawDt);
    this.updateSetPieces(rawDt);
    this.pad.poll(rawDt);
    this.vr.preUpdate(rawDt);
    this.perfectCd = Math.max(0, (this.perfectCd || 0) - rawDt);

    const st = this.state;
    if (st !== this._lastState) {
      this._lastState = st;
      if (st !== 'playing') $('click-hint').classList.add('hidden');
    }
    if (st === 'playing' || st === 'dying') this.tickGame(dt, rawDt);
    else if (st === 'codex') {
      this.codex.update(rawDt);
      // 图鉴有自己的布光：轮廓光减弱，方向取自图鉴相机
      UBER_SHARED.uRimStrength.value = 0.22;
      UBER_SHARED.uMoonView.value.set(-0.4, 0.55, -0.7).normalize().transformDirection(this.codex.camera.matrixWorldInverse);
      this.postfx.u.hurt.value = 0;
      this.postfx.render(this.codex.scene, this.codex.camera, rawDt, true);
      return;
    } else if (st === 'intro' || st === 'cine' || st === 'scene' || st === 'ending' || st === 'prologueScene') {
      this.tickCinematic(dt, rawDt);
    } else if (st === 'credits') {
      this.creditsT += rawDt;
      const roll = $('cr-roll');
      const h = roll.offsetHeight + innerHeight;
      roll.style.top = (innerHeight - this.creditsT * 55) + 'px';
      if (this.creditsT * 55 > h + 60) this.finishCredits();
      this.tickMenuCamera(rawDt);
    } else if (st === 'cards' || st === 'paused' || st === 'result' || st === 'story') {
      this.effects.update(rawDt * 0.2);
      if (st === 'story' || st === 'result') this.tickMenuCamera(rawDt);
    } else {
      this.tickMenuCamera(rawDt);
    }
    // 音频：监听者 / 闷音 / 心跳 / 战斗强度
    if (Audio.ctx) {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      Audio.setListener(this.camera.position, fwd, up);
      const hpK = this.player.hp / this.player.maxHp;
      const playing = st === 'playing';
      Audio.setMuffle(st === 'paused' || st === 'cards' ? 0.55 : st === 'dying' ? 0.7 : playing && this.player.holding ? 0.35 : playing && hpK < 0.25 ? 0.15 : 0);
      Audio.setLowHp(playing && hpK < 0.3 ? (0.3 - hpK) / 0.3 : 0);
      if (playing) Audio.setIntensity(this.director.phase === 'boss' ? 1 : this.director.intensity);
    }
    this.hurt = Math.max(0, this.hurt - rawDt * 2.5);
    UBER_SHARED.uMoonView.value.copy(MOON_DIR).transformDirection(this.camera.matrixWorldInverse);
    this.postfx.u.hurt.value = this.hurt * 0.8 + (st === 'playing' && this.player.hp / this.player.maxHp < 0.3 ? 0.25 : 0);
    this.vr.postUpdate(rawDt);
    this.postfx.u.desat.value = st === 'dying' ? Math.min(0.85, this.dyingT) : this.player.holding && st === 'playing' ? 0.35 : 0;
    this.postfx.render(this.scene, this.camera, rawDt);
  }

  tickCinematic(dt, rawDt) {
    const st = this.state;
    const P = this.player;
    if (st === 'cine' || st === 'scene' || st === 'ending') this.enemies.update(dt, P);
    this.effects.update(dt);
    this.pickups.update(dt, P, 999, (v) => this.gainXp(v), () => {});
    if (this.priest.group.visible) this.priest.update(rawDt, { pos: P.position, yaw: P.yaw, pitch: 0, vel: new THREE.Vector3(), running: false, swingT: -1 });
    this.world.focusShadow(P.position.x, P.position.z);
    if (st === 'ending') this.updateEnding(rawDt);
    if (st === 'cine' && !this.cine.active) this.endBossIntro();
    if (st === 'intro' && !this.cine.active && !this.dialogue.active) this.finishIntro();
  }

  tickMenuCamera(dt) {
    this.menuT += dt;
    this.world.focusShadow(0, -2);
    const t = 0.35 + Math.sin(this.menuT * 0.05) * 0.35;
    const r = this.state === 'menu' || this.state === 'diff' ? 4.2 : 9;
    this.camera.position.set(Math.sin(t) * r, 1.55 + Math.sin(this.menuT * 0.2) * 0.1, Math.cos(t) * r);
    const side = new THREE.Vector3(Math.cos(t), 0, -Math.sin(t));
    this.camera.lookAt(new THREE.Vector3(0, 1.25, 0).addScaledVector(side, r < 5 ? -1.5 : 0));
    if (this.priest.group.visible && (this.state === 'menu' || this.state === 'diff')) {
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
        a.inst.uber.uAir.value = ph < 0.6 ? Math.sin(ph / 0.6 * Math.PI) : 0;
      } else {
        a.inst.root.position.y = poseDance(kind, a.inst.bones, this.menuT, a.seed);
      }
    }
    this.effects.update(dt);
  }

  tickGame(dt, rawDt) {
    const P = this.player, W = this.weapons, S = this.skills.stats;
    const wdt = dt * this.worldScale;
    if (this.state === 'dying') {
      this.dyingT += rawDt;
      this.enemies.update(wdt * 0.3, P);
      this.effects.update(wdt);
      this.priest.update(rawDt, { pos: P.position, yaw: P.yaw, pitch: 0, vel: new THREE.Vector3(), running: false, swingT: -1 });
      this.placeCamera(rawDt, true);
      this.world.focusShadow(P.position.x, P.position.z);
      if (this.dyingT > 2.6) { this._forcedTps = false; this.endRun(false); }
      return;
    }
    this.runTime += dt;
    const slow = W.def().moveSlow && (W.triggerDown || W.spin > 0.15) ? W.def().moveSlow : 1;
    P.speedMult = S.moveMult * slow;
    P.update(dt);
    if (S.regen) P.heal(S.regen * dt * Math.max(0.3, this.diff.heal));

    this.placeCamera(dt);
    this.world.focusShadow(P.position.x, P.position.z);

    if (this.priest.swingT >= 0) { this.priest.swingT += dt / 0.3; if (this.priest.swingT >= 1) this.priest.swingT = -1; }
    this.priest.update(dt, { pos: P.position, yaw: P.yaw, pitch: P.pitch, vel: P.velocity, running: P.isRunning, swingT: this.priest.swingT ?? -1, dashing: P.dashing });
    W.setMoveState(P.moving && !this.vr.active, P.isRunning && !this.vr.active);
    W.update(dt, true, this.view, () => this.priest.muzzleWorld());
    this.skills.update(dt, P);
    this._burning = false;
    this.enemies.update(wdt, P);
    this.director.update(wdt, P.position, P.hp / P.maxHp);
    this.pickups.update(wdt, P, S.magnet, (v) => this.gainXp(v), (kind, pos, it) => {
      if (kind === 'heal') { this.healPlayer(25); Audio.heal(); }
      if (kind === 'chest') { this.pendingChest++; Audio.chest(); this.effects.gold(pos.clone().setY(0.6), 40, 1.5); }
      if (kind === 'scroll') this.pickScroll(it.id);
    });
    this.effects.update(wdt);
    if (!P.alive) { this.onDeath(); }
    if (this.ultWindow > 0) this.ultWindow -= dt;
    if (this.enemies.lostCount >= 20) this.achv.unlock('breath');

    // 连斩计时
    if (this.combo.n > 0) { this.combo.t -= dt; if (this.combo.t <= 0) this.combo.n = 0; }

    // 雨夜溅水与闪电
    if (this.ambience?.rain) {
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 14;
        this.effects.norm.emit(P.position.x + Math.cos(a) * r, 0.03, P.position.z + Math.sin(a) * r, 0, 1.2, 0, 0.7, 0.75, 0.8, 0.04, 0.18, 8, 0, 0.1, 0.6);
      }
    }
    this.lightningT = (this.lightningT ?? 12) - dt;
    if (this.lightningT <= 0) {
      const ch = this.chapterIdx;
      this.lightningT = ch === 1 ? 14 + Math.random() * 18 : 30 + Math.random() * 30;
      if (ch >= 1 || this.director.endless) { this.world.lightning(ch === 1 ? 1 : 0.6); Audio.thunderDistant(0.4 + Math.random() * 1.4); }
    }

    // 过关倒计时
    if (this.clearTimer > 0) {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) {
        if (this.pendingLevels > 0 || this.pendingChest > 0) this.clearTimer = 0.01;
        else { this.playClearScene(); return; }
      }
    }
    if (this.state === 'playing' && this.pendingLevels > 0) this.openCards('level');
    else if (this.state === 'playing' && this.pendingChest > 0) this.openCards('chest');

    // HUD
    const H = this.hud;
    const ch = CHAPTERS[this.chapterIdx];
    const D = this.director;
    let line, prog, obj;
    if (D.endless) { line = `无尽轮回 · 第 ${D.endlessN + 1} 轮`; prog = D.phase === 'wave' ? D.waveT / D.waveDef.dur : 1; obj = '坚守到底'; }
    else if (D.phase === 'boss') { line = '首领现身'; prog = 1; obj = this.chapterIdx === 3 ? '击败玄阴子，救出师父' : '击败首领'; }
    else if (D.phase === 'cleared') { line = '除祟功成'; prog = 1; obj = '拾取阳气与宝物'; }
    else { line = `第 ${D.wave + 1} / ${ch.waves.length} 波 · ${fmt(Math.max(0, D.waveDef.dur - D.waveT))}`; prog = D.waveT / D.waveDef.dur; obj = ['守住义庄', '护住阿秀，焚尽纸人', '闯过鬼门', '斩断锁魂链'][this.chapterIdx]; }
    H.chapter(D.endless ? '无尽轮回' : ch.name, line, prog);
    H.objective(obj);
    H.xp(this.level, this.xp, xpNeed(this.level));
    H.stats(this.kills, this.gold, this.runTime);
    H.hp(P.hp, P.maxHp);
    H.shield(this.skills.shield);
    H.skills(this.skills.ownedList());
    H.abilities(this.skills.fuCd, S.fuCd, S.fuCount, this.skills.ult, P.dashCd, P.dashCdMax);
    H.weapon(W.def(), W.ammo, W.reloading > 0, W.owned, W.current);
    H.crosshair(W.def().spread * (P.moving ? 1.5 : 1) + W.kick * 0.02);
    H.updateBosses();
    H.burn(this._burning);
    H.breath(P.breath / P.breathMax, P.holding, P.breathLock > 0);
    const grade = (COMBO_GRADE.find(([n]) => this.combo.n >= n) || [0, ''])[1];
    H.combo(this.combo.n, this.combo.t / 3.2, grade);
    H.updateDamageNumbers(rawDt, this.camera);
    H.eliteLabels(this.enemies.list, this.camera);
    this._radarT = (this._radarT || 0) - rawDt;
    if (this._radarT <= 0) { this._radarT = 0.1; H.radar(P.position, P.yaw, this.enemies.list, this.pickups.items); }
  }

  placeCamera(dt, dying = false) {
    const P = this.player;
    const W = this.weapons;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const tr = Math.min(1, W.trauma * 0.7 * (this.progress.settings.shake ?? 1) + this.shake);
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
    if (W.recoilKick > 0 && !dying) { P.pitch += W.recoilKick * dt * 6; P.yaw += (W.recoilYaw || 0) * dt * 6; }
  }
}

// 开发用：?xremu 在桌面浏览器里模拟一台 VR 头显（IWER），用来调试 VR 模式
if (import.meta.env.DEV && new URLSearchParams(location.search).has('xremu')) {
  const { XRDevice, metaQuest3 } = await import('iwer');
  const dev = new XRDevice(metaQuest3);
  dev.installRuntime({ forceInstall: true });
  dev.position.set(0, 1.7, 0);
  window.xrdev = dev;
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
      else if (g.state === 'cine') g.cine.stop();
      else if (g.state === 'scene') g.dialogue.skip();
      else if (g.state === 'intro') g.finishIntro();
      else break;
    }
    return { state: g.state, t: Math.round(g.runTime), ch: g.chapterIdx, wave: g.director.wave, phase: g.director.phase, lvl: g.level, kills: g.kills, hp: Math.round(g.player.hp), alive: g.enemies.aliveCount, owned: g.skills.ownedList().map((x) => x.name + (x.level || '')).join(','), weapons: g.weapons.owned.join(','), combo: g.run.maxCombo };
  };
}
