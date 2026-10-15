import * as THREE from 'three';

// =====================================================================
//  过场镜头：机位推拉 / 环绕 / 跟随，遮幅黑边，书法章节卡
// =====================================================================
const $ = (id) => document.getElementById(id);
const P = (x) => (typeof x === 'function' ? x() : x);
const smooth = (k) => k * k * (3 - 2 * k);

export class Cinematic {
  constructor(camera) {
    this.camera = camera;
    this.active = false;
    this.letterbox = $('letterbox');
    this.title = $('titlecard');
    this._p = new THREE.Vector3();
    this._l = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this.shake = 0;
  }

  // 镜头序列：[{ dur, from:{pos,look}, to:{pos,look}, fov, ease, orbit:{center,radius,height,from,to}, onStart }]
  play(shots, { onDone = null, letterbox = true } = {}) {
    this.shots = shots;
    this.idx = 0;
    this.t = 0;
    this.active = true;
    this.onDone = onDone;
    this.baseFov = this.camera.fov;
    this._look.copy(this.camera.position).add(new THREE.Vector3(0, 0, -10).applyQuaternion(this.camera.quaternion));
    if (letterbox) this.bars(true);
    this._start(shots[0]);
  }

  _start(s) {
    if (!s) return;
    if (!s.from) s._from = { pos: this.camera.position.clone(), look: this._look.clone() };
    s.onStart?.();
  }

  // 从当前镜头平滑过渡到目标机位（用于对白驱动的镜头切换）
  goTo(target, dur = 2.6, fov = null) {
    const shot = { dur, to: target, fov };
    if (!this.active) { this.play([shot], { letterbox: true }); return; }
    this.shots = [shot]; this.idx = 0; this.t = 0;
    this._start(shot);
  }

  hold() { this.shots = [{ dur: 9999, to: { pos: this.camera.position.clone(), look: this._look.clone() } }]; this.idx = 0; this.t = 0; this._start(this.shots[0]); }

  bars(on) { this.letterbox.classList.toggle('on', on); }

  stop(callback = true) {
    if (!this.active) return;
    this.active = false;
    this.bars(false);
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    const cb = this.onDone;
    this.onDone = null;
    if (callback) cb?.();
  }

  update(dt) {
    if (!this.active) return;
    const s = this.shots[this.idx];
    this.t += dt;
    const k = Math.min(1, this.t / s.dur);
    const e = s.ease === 'linear' ? k : s.ease === 'out' ? 1 - Math.pow(1 - k, 3) : smooth(k);
    if (s.orbit) {
      const o = s.orbit;
      const c = P(o.center);
      const a = THREE.MathUtils.lerp(o.from, o.to, e);
      this._p.set(c.x + Math.sin(a) * o.radius, c.y + o.height, c.z + Math.cos(a) * o.radius);
      this._l.copy(c).add(new THREE.Vector3(0, o.lookY ?? 0, 0));
    } else {
      const from = s.from ? P(s.from) : s._from;
      const to = P(s.to);
      this._p.lerpVectors(from.pos, to.pos, e);
      this._l.lerpVectors(from.look, to.look, e);
    }
    this.camera.position.copy(this._p);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.5);
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.3;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.3;
    }
    this._look.copy(this._l);
    this.camera.lookAt(this._l);
    if (s.fov) {
      this.camera.fov = THREE.MathUtils.lerp(s.fovFrom ?? this.baseFov, s.fov, e);
      this.camera.updateProjectionMatrix();
    }
    if (k >= 1 && s.dur < 9000) {
      this.idx++;
      this.t = 0;
      if (this.idx >= this.shots.length) {
        if (s.holdEnd) { this.shots = [{ dur: 9999, to: { pos: this._p.clone(), look: this._l.clone() } }]; this.idx = 0; this._start(this.shots[0]); }
        else this.stop();
      } else this._start(this.shots[this.idx]);
    }
  }

  // 书法章节卡 / 首领名帖
  titleCard(main, sub = '', { dur = 3.4, kind = 'chapter', seal = '' } = {}) {
    const t = this.title;
    t.className = 'tc-' + kind;
    t.innerHTML = `${seal ? `<div class="tc-seal">${seal}</div>` : ''}<div class="tc-main">${main.split('').map((c, i) => `<span style="animation-delay:${(i * 0.09).toFixed(2)}s">${c}</span>`).join('')}</div>${sub ? `<div class="tc-sub">${sub}</div>` : ''}`;
    void t.offsetWidth;
    t.classList.add('on');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.remove('on'), dur * 1000);
  }
}
