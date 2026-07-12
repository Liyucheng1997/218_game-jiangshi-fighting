// DOM HUD 管理
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'),
      crosshair: $('crosshair'),
      hitmarker: $('hitmarker'),
      hpPanel: $('hp-panel'),
      hpNum: $('hp-num'),
      hpBar: $('hp-bar'),
      weaponName: $('weapon-name'),
      ammoPanel: $('ammo-panel'),
      ammoNum: $('ammo-num'),
      reloadTip: $('reload-tip'),
      slots: Array.from(document.querySelectorAll('.wslot')),
      levelLabel: $('level-label'),
      waveNum: $('wave-num'),
      zombiesLeft: $('zombies-left'),
      scoreNum: $('score-num'),
      killNum: $('kill-num'),
      yangqiHud: $('yangqi-hud'),
      killfeed: $('killfeed'),
      waveBanner: $('wave-banner'),
      dmgOverlay: $('dmg-overlay'),
      burnOverlay: $('burn-overlay'),
      lowhpOverlay: $('lowhp-overlay'),
      bossWrap: $('boss-bar-wrap'),
      bossName: $('boss-name'),
      bossBar: $('boss-bar'),
      skillIcon: $('skill-icon'),
      skillCd: $('skill-cd'),
      pauseHint: $('pause-hint'),
      loading: $('loading-status'),
    };
    this._hitT = null;
  }

  show() { this.el.hud.classList.add('active'); }
  hide() { this.el.hud.classList.remove('active'); this.showBoss(false); }

  setLoading(text) { this.el.loading.textContent = text; }
  setPaused(v) { this.el.pauseHint.style.display = v ? 'block' : 'none'; }

  updateHP(hp, maxHp) {
    this.el.hpNum.textContent = Math.ceil(hp);
    this.el.hpBar.style.width = `${(hp / maxHp) * 100}%`;
    this.el.hpPanel.classList.toggle('low', hp <= maxHp * 0.3);
    this.el.lowhpOverlay.classList.toggle('show', hp > 0 && hp <= maxHp * 0.3);
  }

  updateWeapon(def, state, reloading) {
    this.el.weaponName.textContent = def.name;
    if (def.melee) {
      this.el.ammoNum.innerHTML = '∞';
      this.el.ammoPanel.classList.remove('empty');
      this.el.reloadTip.classList.remove('show');
    } else {
      this.el.ammoNum.innerHTML = `${state.mag} <small>/ ${state.reserve}</small>`;
      this.el.ammoPanel.classList.toggle('empty', state.mag === 0);
      this.el.reloadTip.textContent = reloading ? '换弹中…' : '按 R 换弹';
      this.el.reloadTip.classList.toggle('show', reloading || (state.mag <= 5 && state.reserve > 0));
    }
  }

  updateSlots(current) {
    this.el.slots.forEach((s, i) => s.classList.toggle('on', i === current));
  }

  updateLevel(levelId, levelName, wave, totalWaves, left) {
    this.el.levelLabel.textContent = `第 ${levelId} 关 · ${levelName}`;
    this.el.waveNum.textContent = `${wave} / ${totalWaves} 波`;
    this.el.zombiesLeft.textContent = `僵尸剩余 ${left}`;
  }

  updateScore(score, kills, yangqi) {
    this.el.scoreNum.textContent = score;
    this.el.killNum.textContent = kills;
    this.el.yangqiHud.textContent = `阳气 ${yangqi}`;
  }

  updateSkill(cooldown, maxCooldown) {
    const pct = maxCooldown > 0 ? (cooldown / maxCooldown) * 100 : 0;
    this.el.skillCd.style.height = `${pct}%`;
    this.el.skillIcon.classList.toggle('ready', cooldown <= 0);
  }

  showBoss(v, name) {
    this.el.bossWrap.classList.toggle('show', v);
    if (name) this.el.bossName.textContent = name;
  }
  updateBoss(hp, maxHp) {
    this.el.bossBar.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
  }

  flashHit(headshot) {
    const hm = this.el.hitmarker;
    hm.classList.toggle('headshot', headshot);
    hm.style.opacity = 1;
    this.el.crosshair.classList.add('hit');
    clearTimeout(this._hitT);
    this._hitT = setTimeout(() => {
      hm.style.opacity = 0;
      this.el.crosshair.classList.remove('hit');
    }, 110);
  }

  killFeed(text) {
    const div = document.createElement('div');
    div.className = 'kf-item';
    div.innerHTML = text;
    this.el.killfeed.prepend(div);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
    setTimeout(() => div.remove(), 4000);
  }

  banner(html, duration = 2200) {
    this.el.waveBanner.innerHTML = html;
    this.el.waveBanner.style.opacity = 1;
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => { this.el.waveBanner.style.opacity = 0; }, duration);
  }

  damageFlash() {
    this.el.dmgOverlay.style.opacity = 1;
    clearTimeout(this._dmgT);
    this._dmgT = setTimeout(() => { this.el.dmgOverlay.style.opacity = 0; }, 130);
  }

  setBurning(v) {
    this.el.burnOverlay.style.opacity = v ? 1 : 0;
  }
}
