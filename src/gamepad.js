import * as THREE from 'three';

// =====================================================================
//  手柄支持（标准映射 / Xbox 布局）
//  左摇杆移动（推满疾跑）· 右摇杆视角 · RT 射击 · LT 火符 · A 跳 · B 罡步
//  X 换弹 · Y 天师降魔 · LB/RB 切换武器 · R3 / 十字下 闭气 · L3 疾跑 · Start 暂停 · Back 切换视角
//  瞄准辅助：准星靠近敌人时转速降低（摩擦），移动或开火时缓慢吸附（磁性）
// =====================================================================

const _v = new THREE.Vector3();
const dead = (x, d = 0.18) => (Math.abs(x) < d ? 0 : (x - Math.sign(x) * d) / (1 - d));
const curve = (x) => Math.sign(x) * Math.pow(Math.abs(x), 1.7);

export class GamepadInput {
  constructor(game) {
    this.g = game;
    this.prev = [];
    this.active = false;
    this.focus = 0;
    addEventListener('gamepadconnected', () => { this.g.hud.toast('手柄已连接'); });
  }

  _pad() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    return pads.find((p) => p && p.connected && p.mapping === 'standard') || pads.find((p) => p && p.connected) || null;
  }

  // 瞄准辅助目标：准星附近（约 7°）且 35 米内的敌人
  _assist(cam) {
    const fwd = _v.set(0, 0, -1).applyQuaternion(cam.quaternion).clone();
    let best = null, bestA = 0.12;
    for (const e of this.g.enemies.list) {
      if (!e.alive || e.dying || e.spawnT > 0.3) continue;
      const tgt = e.headPos.clone().lerp(this.g.enemies.center(e), 0.5);
      const d = tgt.clone().sub(cam.position);
      const dist = d.length();
      if (dist > 35 || dist < 1) continue;
      const a = Math.acos(Math.min(1, d.dot(fwd) / dist));
      if (a < bestA) { bestA = a; best = { e, tgt, a }; }
    }
    return best;
  }

  poll(dt) {
    const pad = this._pad();
    if (!pad) { this.active = false; return; }
    const b = pad.buttons.map((x) => x.pressed);
    const v = pad.buttons.map((x) => x.value);
    const ax = pad.axes;
    const pressed = (i) => b[i] && !this.prev[i];
    if (b.some(Boolean) || ax.some((a) => Math.abs(a) > 0.35)) this.active = true;
    const g = this.g, P = g.player, st = g.state;
    const inScene = st === 'intro' || st === 'scene' || st === 'ending' || st === 'prologueScene';

    if (st === 'playing') {
      const mx = dead(ax[0]), my = dead(ax[1]);
      P.analog.set(mx, my);
      P.pad.sprint = !!b[10] || Math.hypot(mx, my) > 0.96;
      const lx = dead(ax[2], 0.12), ly = dead(ax[3], 0.12);
      const sens = g.progress.settings.sens;
      const assist = this._assist(g.camera);
      let rate = 3.1 * sens * (assist ? 0.55 : 1);
      P.yaw -= curve(lx) * rate * dt;
      P.pitch -= curve(ly) * rate * 0.65 * dt;
      // 磁性吸附
      if (assist && (Math.hypot(lx, ly) > 0.05 || Math.hypot(mx, my) > 0.1 || g.weapons.triggerDown)) {
        const d = assist.tgt.clone().sub(g.camera.position);
        const wantYaw = Math.atan2(-d.x, -d.z);
        const wantPitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
        let dy = wantYaw - P.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        const k = Math.min(1, dt * 2.6 * (1 - assist.a / 0.12));
        P.yaw += dy * k;
        P.pitch += (wantPitch - P.pitch) * k * 0.6;
      }
      P.pitch = Math.max(-1.5, Math.min(1.5, P.pitch));
      const rt = (v[7] ?? 0) > 0.3;
      if (rt !== this.rt) { this.rt = rt; g.weapons.triggerDown = rt; }
      if (pressed(6)) g.throwFu();
      P.pad.jump = !!b[0];
      if (pressed(1) && P.dash()) { g.effects.dust(P.position.clone().setY(0), 8); g.postfx.zoomBlur(0.35); }
      if (pressed(2)) g.weapons.startReload();
      if (pressed(3) && g.skills.castUlt(P)) { g.priest.cast(); g.hud.banner('天师降魔', '五雷轰顶 · 万邪伏诛', 1800); }
      if (pressed(4)) { g.weapons.cycle(-1); g.priest.setWeapon(g.weapons.current); }
      if (pressed(5)) { g.weapons.cycle(1); g.priest.setWeapon(g.weapons.current); }
      P.pad.breath = !!(b[11] || b[13]);
      if (pressed(8)) { g.view = g.view === 'fps' ? 'tps' : 'fps'; g.applyView(); }
      if (pressed(9)) g.pause();
    } else {
      P.analog.set(0, 0);
      P.pad.jump = P.pad.sprint = P.pad.breath = false;
      if (st === 'cards') {
        const n = g.currentCards?.length || 0;
        if (pressed(14) || (dead(ax[0], 0.5) < 0 && !this.stickHeld)) this.focus = (this.focus - 1 + n) % n;
        if (pressed(15) || (dead(ax[0], 0.5) > 0 && !this.stickHeld)) this.focus = (this.focus + 1) % n;
        this.stickHeld = Math.abs(ax[0]) > 0.5;
        document.querySelectorAll('#card-row .card').forEach((c, i) => c.classList.toggle('focus', i === this.focus && this.active));
        if (pressed(0) && g.currentCards[this.focus]) { g.pickCard(g.currentCards[this.focus]); this.focus = 0; }
        if (pressed(2)) document.getElementById('cd-reroll').click();
        if (pressed(1)) document.getElementById('cd-skip').click();
      } else if (inScene && g.dialogue.active) {
        if (pressed(0)) g.dialogue.advance();
        if (pressed(1) || pressed(9)) { g.dialogue.skip(); if (st === 'intro') g.finishIntro(); }
      } else if (st === 'intro' || st === 'cine') {
        if (pressed(0) || pressed(1)) { if (st === 'intro') g.finishIntro(); else g.cine.stop(); }
      } else if (st === 'paused') {
        if (pressed(9) || pressed(1) || pressed(0)) g.resumePlay();
      } else if (st === 'story') {
        if (pressed(0)) g.beginChapter();
      } else if (st === 'result') {
        if (pressed(0)) g.openDifficulty();
        if (pressed(1)) g.toMenu();
      } else if (st === 'credits') {
        if (pressed(0) || pressed(1)) g.finishCredits();
      } else if (st === 'menu') {
        if (pressed(0)) g.openDifficulty();
      } else if (st === 'diff') {
        if (pressed(0)) g.startRun(g.progress.data.lastDiff || 'normal');
        if (pressed(1)) g.toMenu();
      } else if (pressed(1)) {
        g.toMenu();
      }
    }
    this.prev = b;
  }
}
