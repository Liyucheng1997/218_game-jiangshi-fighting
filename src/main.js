import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { World } from './world.js';
import { Player } from './player.js';
import { WeaponSystem, WEAPONS } from './weapons.js';
import { ZombieManager, WaveDirector } from './zombies.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { LEVELS, ZOMBIE_TYPES, UPGRADES, upgradeCost } from './data.js';
import { Progress } from './progress.js';
import { Priest } from './priest.js';
import { TalismanSkill } from './skills.js';
import { Codex } from './codex.js';

const $ = (id) => document.getElementById(id);

class Game {
  constructor() {
    this.hud = new HUD();
    this.progress = new Progress();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 400);
    this.scene.add(this.camera);

    this.world = new World(this.scene);
    this.player = new Player(this.camera, this.world, this.renderer.domElement);
    this.effects = new Effects(this.scene);
    this.zombies = new ZombieManager(this.scene, this.world);
    this.waves = new WaveDirector(this.zombies, this.world.spawnPoints);
    this.weapons = new WeaponSystem(this.camera, this.scene, (o, d, w, first) => this.handleShot(o, d, w, first));
    this.skill = new TalismanSkill(this.scene, this.world, this.zombies, this.effects, this.progress);
    this.priest = new Priest(this.scene);
    this.codex = new Codex(this.renderer, this.zombies);

    // 手电筒
    this.flashlight = new THREE.SpotLight(0xfff2d8, 26, 40, Math.PI / 5.5, 0.5, 1.4);
    this.camera.add(this.flashlight);
    this.flashlight.position.set(0, 0, 0.1);
    this.flashTarget = new THREE.Object3D();
    this.camera.add(this.flashTarget);
    this.flashTarget.position.set(0, 0, -10);
    this.flashlight.target = this.flashTarget;

    // 状态：loading | menu | levelselect | upgrade | codex | story | playing | paused | victory | gameover
    this.state = 'loading';
    this.view = 'fps';        // fps | tps
    this.levelIndex = 0;      // 当前关卡（0 基）
    this.score = 0;
    this.kills = 0;
    this._burning = false;
    this.clock = new THREE.Clock();

    this.bindEvents();
    this.wireWaves();
    this.load();

    this.renderer.setAnimationLoop(() => this.tick());
  }

  async load() {
    try {
      this.hud.setLoading('正在加载武器与道长…');
      const loader = new GLTFLoader();
      const [shaun, sam, matt] = await Promise.all([
        loader.loadAsync('/models/Characters_Shaun_SingleWeapon.gltf'),
        loader.loadAsync('/models/Characters_Sam_SingleWeapon.gltf'),
        loader.loadAsync('/models/Characters_Matt_SingleWeapon.gltf'),
        this.priest.load(),
      ]);
      const findNode = (root, name) => {
        let found = null;
        root.traverse((n) => { if (!found && n.name === name) found = n; });
        return found;
      };
      this.weapons.buildViewmodels({
        smg: findNode(shaun.scene, 'SMG'),
        pistol: findNode(sam.scene, 'Pistol'),
        knife: findNode(matt.scene, 'Knife'),
      });
      this.weapons.rig.visible = false;

      this.state = 'menu';
      this.hud.setLoading('资源加载完成 ✓');
      this.refreshMenu();
    } catch (err) {
      console.error(err);
      this.hud.setLoading('资源加载失败：' + err.message);
    }
  }

  // ---------------- 界面切换 ----------------
  showScreen(id) {
    for (const s of ['menu-screen', 'level-screen', 'upgrade-screen', 'story-screen', 'gameover-screen', 'victory-screen']) {
      $(s).classList.toggle('hidden', s !== id);
    }
    $('codex-ui').classList.toggle('active', id === 'codex');
  }

  refreshMenu() {
    $('menu-yangqi').textContent = `阳气 ${this.progress.yangqi} · 已通 ${this.progress.data.maxLevel - 1} 关`;
  }

  openLevelSelect() {
    this.state = 'levelselect';
    const grid = $('level-grid');
    grid.innerHTML = '';
    LEVELS.forEach((lv, i) => {
      const locked = lv.id > this.progress.data.maxLevel;
      const card = document.createElement('div');
      card.className = 'level-card' + (locked ? ' locked' : '');
      card.innerHTML = `
        <div class="lv-num">第 ${lv.id} 关</div>
        <div class="lv-name">${lv.name}</div>
        <div class="lv-stars">${'★'.repeat(lv.stars)}${'☆'.repeat(5 - lv.stars)}</div>
        ${locked ? '<div class="lv-lock">🔒</div>' : ''}`;
      if (!locked) card.addEventListener('click', () => this.openStory(i));
      grid.appendChild(card);
    });
    this.showScreen('level-screen');
  }

  openUpgrades() {
    this.state = 'upgrade';
    const list = $('upgrade-list');
    list.innerHTML = '';
    $('upgrade-yangqi').textContent = `阳气 ${this.progress.yangqi}`;
    for (const key of Object.keys(UPGRADES)) {
      const u = UPGRADES[key];
      const lv = this.progress.upLevel(key);
      const full = lv >= u.max;
      const cost = full ? 0 : upgradeCost(key, lv);
      const row = document.createElement('div');
      row.className = 'up-row';
      row.innerHTML = `
        <div class="up-icon">${u.icon}</div>
        <div class="up-info">
          <div class="up-name">${u.name}</div>
          <div class="up-desc">${u.desc}</div>
          <div class="up-pips">${'●'.repeat(lv)}${'○'.repeat(u.max - lv)}</div>
        </div>
        <div class="up-buy ${full || !this.progress.canBuy(key) ? 'disabled' : ''}">${full ? '已圆满' : `阳气 ${cost}`}</div>`;
      if (!full) {
        row.querySelector('.up-buy').addEventListener('click', () => {
          if (this.progress.buy(key)) { Audio.hitMarker(false); this.openUpgrades(); this.refreshMenu(); }
        });
      }
      list.appendChild(row);
    }
    this.showScreen('upgrade-screen');
  }

  async openCodex() {
    this.state = 'codexloading';
    this.hud.setLoading('正在开棺……');
    this.showScreen('menu-screen');
    await this.codex.build();
    this.codex.onSelect = (typeId) => {
      const c = ZOMBIE_TYPES[typeId];
      $('codex-name').innerHTML = `${c.name} <small>${c.title}</small>`;
      $('codex-lore').textContent = c.lore;
      const tags = [];
      tags.push(`生命 <b>${c.hp}</b>`);
      tags.push(`速度 <b>${c.speed}</b>`);
      tags.push(`伤害 <b>${c.damage}</b>`);
      tags.push(`舞步 <b>${c.dance}</b>`);
      if (c.bulletMult < 1) tags.push(`<b>刀枪不入</b>（枪械 ×${c.bulletMult}）`);
      if (c.fireMult > 1) tags.push(`<b>怕火</b>（火符 ×${c.fireMult}）`);
      if (c.aura) tags.push(`<b>灼烧光环</b> ${c.aura.radius} 米`);
      if (c.boss) tags.push('<b>首领</b>');
      $('codex-stats').innerHTML = tags.map((t) => `<span>${t}</span>`).join('');
    };
    this.codex.select(this.codex.selected < 0 ? 0 : this.codex.selected);
    this.state = 'codex';
    this.showScreen('codex');
  }

  backToMenu() {
    this.state = 'menu';
    this.refreshMenu();
    this.showScreen('menu-screen');
  }

  openStory(levelIndex) {
    this.levelIndex = levelIndex;
    const lv = LEVELS[levelIndex];
    this.state = 'story';
    $('story-level').textContent = `第 ${lv.id} 关`;
    $('story-name').textContent = lv.name;
    $('story-text').textContent = lv.story;
    this.showScreen('story-screen');
  }

  // ---------------- 关卡流程 ----------------
  async startLevel() {
    const lv = LEVELS[this.levelIndex];
    this.state = 'loadinglevel';
    $('story-start').textContent = '开 坛 作 法 …';
    const types = new Set();
    for (const w of lv.waves) for (const t of Object.keys(w)) if (!t.startsWith('__')) types.add(t);
    await this.zombies.load([...types]);
    $('story-start').textContent = '开 始 除 祟';

    // 重置战场
    this.zombies.clear();
    this.effects.clear();
    this.skill.clear();
    this.player.reset();
    this.player.maxHp = 100 + this.progress.maxHpBonus;
    this.player.hp = this.player.maxHp;
    this.score = 0;
    this.kills = 0;
    WEAPONS.forEach((w, i) => {
      this.weapons.state[i].mag = w.magSize;
      this.weapons.state[i].reserve = w.reserve;
    });
    this.switchWeapon(0);
    this.world.setAmbience(lv.ambience);

    this.showScreen('none');
    this.hud.show();
    this.hud.updateScore(0, 0, this.progress.yangqi);

    this.state = 'playing';
    this.player.enabled = true;
    this.weapons.rig.visible = this.view === 'fps';
    this.priest.setVisible(this.view === 'tps');
    this.renderer.domElement.requestPointerLock();
    this.clock.getDelta();
    this.waves.startLevel(lv.waves);
  }

  endLevel(victory) {
    const lv = LEVELS[this.levelIndex];
    this.state = victory ? 'victory' : 'gameover';
    this.player.enabled = false;
    this.weapons.triggerDown = false;
    this.weapons.spin = 0;
    Audio.setMinigunSpin(0);
    this.weapons.rig.visible = false;
    this.priest.setVisible(false);
    document.exitPointerLock();
    this.hud.hide();
    this.hud.setPaused(false);

    const gain = victory
      ? Math.round(this.score / 10) + lv.id * 80
      : Math.round(this.score / 25);
    this.progress.addYangqi(gain);
    if (victory) this.progress.unlockLevel(lv.id + 1);

    const stats = `${lv.name}<br/>消灭僵尸 <b>${this.kills}</b> 只 · 得分 <b>${this.score}</b><br/>获得阳气 <b>+${gain}</b>`;
    if (victory) {
      $('vc-stats').innerHTML = stats;
      $('vc-next').style.display = this.levelIndex + 1 < LEVELS.length ? '' : 'none';
      this.showScreen('victory-screen');
    } else {
      $('go-stats').innerHTML = stats;
      this.showScreen('gameover-screen');
    }
  }

  // ---------------- 事件 ----------------
  bindEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.codex.resize(window.innerWidth, window.innerHeight);
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    $('btn-battle').addEventListener('click', () => { if (this.state === 'menu') { Audio.unlock(); this.openLevelSelect(); } });
    $('btn-upgrade').addEventListener('click', () => { if (this.state === 'menu') { Audio.unlock(); this.openUpgrades(); } });
    $('btn-codex').addEventListener('click', () => { if (this.state === 'menu') { Audio.unlock(); this.openCodex(); } });
    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => this.backToMenu()));
    $('codex-back').addEventListener('click', () => this.backToMenu());
    $('codex-prev').addEventListener('click', () => this.codex.select(this.codex.selected - 1));
    $('codex-next').addEventListener('click', () => this.codex.select(this.codex.selected + 1));
    $('story-start').addEventListener('click', () => { if (this.state === 'story') this.startLevel(); });
    $('go-retry').addEventListener('click', () => { if (this.state === 'gameover') this.openStory(this.levelIndex); });
    $('go-back').addEventListener('click', () => { if (this.state === 'gameover') this.backToMenu(); });
    $('vc-next').addEventListener('click', () => { if (this.state === 'victory') this.openStory(this.levelIndex + 1); });
    $('vc-back').addEventListener('click', () => { if (this.state === 'victory') this.backToMenu(); });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      this.player.locked = locked;
      if (!locked && this.state === 'playing') {
        this.state = 'paused';
        this.hud.setPaused(true);
        this.weapons.triggerDown = false;
        this.weapons.spin = 0;
        Audio.setMinigunSpin(0);
      } else if (locked && this.state === 'paused') {
        this.state = 'playing';
        this.hud.setPaused(false);
        this.clock.getDelta();
      }
    });
    document.addEventListener('click', () => {
      if (this.state === 'paused') this.renderer.domElement.requestPointerLock();
    });

    document.addEventListener('mousedown', (e) => {
      if (this.state === 'codex' && e.target.tagName === 'CANVAS') {
        const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
        const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
        this.codex.pick(ndcX, ndcY);
        return;
      }
      if (this.state !== 'playing') return;
      if (e.button === 0) this.weapons.triggerDown = true;
      if (e.button === 2) this.throwTalisman();
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.weapons.triggerDown = false;
    });

    document.addEventListener('keydown', (e) => {
      if (this.state === 'codex') {
        if (e.code === 'ArrowLeft') this.codex.select(this.codex.selected - 1);
        if (e.code === 'ArrowRight') this.codex.select(this.codex.selected + 1);
        if (e.code === 'Escape') this.backToMenu();
        return;
      }
      if (this.state !== 'playing') return;
      if (e.code === 'KeyR') this.weapons.startReload();
      if (e.code === 'KeyV') this.toggleView();
      if (e.code === 'KeyQ') this.throwTalisman();
      const m = e.code.match(/^Digit([1-6])$/);
      if (m) this.switchWeapon(Number(m[1]) - 1);
    });
    document.addEventListener('wheel', (e) => {
      if (this.state !== 'playing') return;
      const n = WEAPONS.length;
      const next = (this.weapons.current + (e.deltaY > 0 ? 1 : n - 1)) % n;
      this.switchWeapon(next);
    });
  }

  toggleView() {
    this.view = this.view === 'fps' ? 'tps' : 'fps';
    this.weapons.rig.visible = this.view === 'fps';
    this.priest.setVisible(this.view === 'tps');
  }

  throwTalisman() {
    if (!this.skill.ready) return;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const origin = this.view === 'fps'
      ? this.camera.getWorldPosition(new THREE.Vector3())
      : this.player.position.clone().add(new THREE.Vector3(0, 0.2, 0));
    this.skill.throw(origin, dir);
  }

  switchWeapon(i) {
    this.weapons.switchTo(i);
    this.hud.updateSlots(i);
  }

  wireWaves() {
    this.waves.onWaveStart = (n, total, count) => {
      Audio.waveHorn();
      this.hud.banner(`第 ${n} / ${total} 波来袭<small>邪祟 ${count} 只</small>`);
    };
    this.waves.onWaveClear = (n) => {
      this.player.heal(20);
      this.weapons.refillAll();
      this.hud.banner(`第 ${n} 波已肃清<small>生命 +20 · 弹药补满</small>`, 2800);
    };
    this.waves.onLevelClear = () => this.endLevel(true);

    this.zombies.onKill = (z, headshot) => {
      this.kills++;
      const pts = Math.round(z.cfg.score * (headshot ? 1.5 : 1));
      this.score += pts;
      this.hud.killFeed(`${headshot ? '<b>爆头</b> ' : ''}诛灭 ${z.cfg.name} <b>+${pts}</b>`);
      if (z.cfg.boss) this.hud.showBoss(false);
    };
    this.zombies.onBossHp = (hp, maxHp) => {
      this.hud.showBoss(true, '犼 · 僵尸之王');
      this.hud.updateBoss(hp, maxHp);
    };
    this.skill.onHit = (hits) => {
      if (hits > 0) this.hud.killFeed(`<b>敕令真火</b> 燎中 ${hits} 只`);
    };
  }

  // ---------------- 射击 ----------------
  handleShot(origin, dir, wdef, first = true) {
    const zHit = this.zombies.raycastShot(origin, dir, wdef.range);
    const wHit = this.raycastWorld(origin, dir, wdef.range);

    let end = origin.clone().addScaledVector(dir, wdef.range);
    if (zHit && (!wHit || zHit.point.distanceToSquared(origin) < wHit.distanceToSquared(origin))) {
      end = zHit.point;
      const dmg = wdef.damage * (zHit.headshot ? wdef.headshotMult : 1) * this.progress.damageMult;
      const dmgType = wdef.melee ? 'melee' : 'bullet';
      const died = this.zombies.applyDamage(zHit.zombie, dmg, zHit.headshot, wdef.knockback || 0, dir, dmgType);
      Audio.hitMarker(zHit.headshot);
      this.hud.flashHit(zHit.headshot);
      if (died) this.effects.bigBlood(zHit.point);
      else this.effects.blood(zHit.point);
    } else if (wHit) {
      end = wHit;
      this.effects.sparks(wHit);
    }

    if (!wdef.melee && this.view === 'fps') {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const down = new THREE.Vector3(0, -1, 0).applyQuaternion(this.camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      const muzzle = origin.clone().addScaledVector(dir, 0.7).addScaledVector(right, 0.18).addScaledVector(down, 0.14);
      this.effects.tracer(muzzle, end);
      if (first) {
        const ejectPos = origin.clone().addScaledVector(dir, 0.4).addScaledVector(right, 0.24).addScaledVector(down, 0.16);
        const vel = right.clone().multiplyScalar(1.4 + Math.random())
          .addScaledVector(up, 1.6 + Math.random() * 0.8)
          .addScaledVector(dir, -0.3);
        this.effects.casing(ejectPos, vel);
      }
    } else if (!wdef.melee) {
      // 第三人称：曳光从角色位置发出
      const muzzle = this.player.position.clone().add(new THREE.Vector3(0, -0.15, 0));
      this.effects.tracer(muzzle, end);
    }
  }

  raycastWorld(origin, dir, range) {
    let best = null;
    let bestT = range;
    if (dir.y < -0.001) {
      const t = -origin.y / dir.y;
      if (t > 0 && t < bestT) {
        bestT = t;
        best = origin.clone().addScaledVector(dir, t);
      }
    }
    for (const box of this.world.obstacles) {
      let tmin = 0, tmax = range;
      let ok = true;
      for (const axis of ['x', 'y', 'z']) {
        const o = origin[axis], d = dir[axis];
        const mn = box.min[axis], mx = box.max[axis];
        if (Math.abs(d) < 1e-8) {
          if (o < mn || o > mx) { ok = false; break; }
        } else {
          let t1 = (mn - o) / d, t2 = (mx - o) / d;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { ok = false; break; }
        }
      }
      if (ok && tmin > 0.01 && tmin < bestT) {
        bestT = tmin;
        best = origin.clone().addScaledVector(dir, tmin);
      }
    }
    return best;
  }

  // ---------------- 主循环 ----------------
  tick() {
    const dt = Math.min(0.05, this.clock.getDelta());

    if (this.state === 'playing') {
      if (!this.player.alive) { this.endLevel(false); this.renderer.render(this.scene, this.camera); return; }

      const w = this.weapons;
      const gatlingSlow = (w.def.moveSlow && (w.triggerDown || w.spin > 0.15)) ? w.def.moveSlow : 1;
      this.player.speedMult = gatlingSlow * this.progress.speedMult;
      this.player.update(dt);

      // 第三人称相机
      if (this.view === 'tps') {
        const back = new THREE.Vector3(0, 0, 1).applyQuaternion(this.camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        this.camera.position.copy(this.player.position)
          .addScaledVector(back, 3.2)
          .addScaledVector(right, 0.7)
          .add(new THREE.Vector3(0, 0.55, 0));
        if (this.camera.position.y < 0.35) this.camera.position.y = 0.35;
      }
      this.priest.update(dt, this.player.position, this.player.yaw, this.player.moving, this.player.isRunning);

      w.setMoveState(this.player.moving, this.player.isRunning);
      w.update(dt, true);
      this.skill.update(dt);

      if (w.trauma > 0.005) {
        const t = w.trauma * w.trauma;
        this.camera.rotation.x += (Math.random() - 0.5) * t * 0.05;
        this.camera.rotation.y += (Math.random() - 0.5) * t * 0.05;
        this.camera.rotation.z += (Math.random() - 0.5) * t * 0.025;
      }

      this._burning = false;
      this.zombies.update(dt, this.player.position, this.player.alive, (dmg, silent) => {
        if (silent) {
          this.player.hp = Math.max(0, this.player.hp - dmg);
          if (this.player.hp <= 0) this.player.alive = false;
          this._burning = true;
        } else {
          this.player.takeDamage(dmg);
          this.hud.damageFlash();
        }
        if (!this.player.alive) this.endLevel(false);
      });
      this.hud.setBurning(this._burning);

      // 玩家与僵尸实体碰撞
      for (const z of this.zombies.zombies) {
        if (!z.alive) continue;
        const dx = this.player.position.x - z.group.position.x;
        const dz = this.player.position.z - z.group.position.z;
        const minD = 0.75;
        const d2 = dx * dx + dz * dz;
        if (d2 < minD * minD && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (minD - d);
          this.player.position.x += (dx / d) * push * 0.7;
          this.player.position.z += (dz / d) * push * 0.7;
          z.group.position.x -= (dx / d) * push * 0.3;
          z.group.position.z -= (dz / d) * push * 0.3;
        }
      }

      this.waves.update(dt, this.player.position);
      this.effects.update(dt);

      const lv = LEVELS[this.levelIndex];
      this.hud.updateHP(this.player.hp, this.player.maxHp);
      this.hud.updateWeapon(w.def, w.ammo, w.reloading > 0);
      this.hud.updateLevel(lv.id, lv.name, this.waves.wave, lv.waves.length, this.zombies.aliveCount + this.waves.pending.length);
      this.hud.updateScore(this.score, this.kills, this.progress.yangqi);
      this.hud.updateSkill(this.skill.cooldown, this.skill.maxCooldown);

      if (w.recoilKick > 0) this.player.pitch += w.recoilKick * dt * 6;

      this.renderer.render(this.scene, this.camera);
    } else if (this.state === 'codex') {
      this.codex.update(dt);
      this.codex.render();
    } else {
      // 菜单类状态：主场景缓慢旋转做背景
      const t = performance.now() * 0.0001;
      this.camera.position.set(Math.sin(t) * 24, 8, Math.cos(t) * 24);
      this.camera.lookAt(0, 2, 0);
      this.effects.update(dt);
      this.renderer.render(this.scene, this.camera);
    }
  }
}

window.game = new Game();
