import * as THREE from 'three';
import { EYE_HEIGHT } from './player.js';
import { Audio } from './audio.js';
import { CAST } from './story.js';
import { VRPerf } from './vrperf.js';
import { LITE } from './gfx/lite.js';

// =====================================================================
//  VR 模式（WebXR）：头显第一人称
//  · 以「偏移参考空间」移动玩家：相机 / 手柄始终是世界坐标，游戏逻辑无需改动
//  · 右手持枪瞄准射击，左手掷符；左摇杆移动，右摇杆分段转向
//  · DOM 界面在沉浸模式里看不见 —— 菜单 / 选卡 / 结算画到世界里的画布面板上，
//    手柄射线点选；血量弹药、横幅、对白画在随头的小面板上
// =====================================================================

const $ = (id) => document.getElementById(id);
const FONT = '"Noto Serif SC","Source Han Serif SC","Noto Serif CJK SC","SimSun",serif';
const BRUSH = `"Ma Shan Zheng","KaiTi","STKaiti",${FONT}`;
const GOLD = '#e8c26a';
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const PLAYER_STATES = new Set(['playing', 'cards', 'paused']);
const SCENE_STATES = new Set(['intro', 'scene', 'ending', 'prologueScene']);
const HIDE_PANEL = new Set(['playing', 'dying', 'cine', 'loading', ...SCENE_STATES]);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const txt = (id) => ($(id)?.textContent || '').trim();

function wrap(g, text, maxW) {
  const lines = [];
  let cur = '';
  for (const ch of String(text)) {
    if (ch === '\n') { lines.push(cur); cur = ''; continue; }
    if (cur && g.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

class Panel {
  constructor(w, h, mw, mh) {
    this.w = w; this.h = h; this.mw = mw; this.mh = mh;
    this.cv = document.createElement('canvas');
    this.cv.width = w; this.cv.height = h;
    this.g = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.generateMipmaps = false;
    this.tex.minFilter = THREE.LinearFilter;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
    this.mesh.renderOrder = 1000;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.sig = null;
  }
  clear() { this.g.clearRect(0, 0, this.w, this.h); }
  commit() { this.tex.needsUpdate = true; }
}

export class VRMode {
  constructor(game) {
    this.g = game;
    this.r = game.renderer;
    this.active = false;
    // APK 启动（?vr）：从一开始就用 VR 画质（不走后期管线，头显浏览器的平面页也能稳定出画面）
    this.auto = new URLSearchParams(location.search).has('vr');
    this.wantVR = this.auto;
    this.shadows = false;
    this.supported = false;
    this.session = null;
    this.base = null;
    this.rigPos = new THREE.Vector3();
    this.rigYaw = 0;
    this.h = new THREE.Vector3(0, 1.6, 0);       // 头部在参考空间内的位置
    this.hq = new THREE.Quaternion();
    this.hYaw = 0; this.hPitch = 0;
    this.hPrev = new THREE.Vector3();
    this.home = new THREE.Vector3(0, 1.6, 0);
    this.homeYaw = 0;
    this.heightOff = 0;
    this.calibrated = false;
    this.wasPlayerMode = false;
    this.camSetP = new THREE.Vector3();
    this.camSetQ = new THREE.Quaternion();
    this.prev = { left: [], right: [] };
    this.axPrev = { left: [0, 0], right: [0, 0] };
    this.note = { title: '', sub: '', until: 0 };
    this.toastN = { text: '', until: 0 };
    this.page = '';
    this.buttons = [];
    this.hover = { left: -1, right: -1 };
    this.panelLocal = { pos: new THREE.Vector3(), yaw: 0, state: null };
    this.uiT = 0; this.hudT = 0;
    this.fps = 0; this._fpsN = 0; this._fpsT = 0;

    this.perf = new VRPerf(game);
    this.vpScale = 1;
    if (!navigator.xr) return;
    this.r.xr.enabled = true;
    this._build();
    this._patch();
    navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
      this.supported = ok;
      if (ok) this._makeButton();
    }).catch(() => {});
  }

  // ------------------------------------------------------------ 搭建
  _build() {
    const g = this.g, scene = g.scene;
    this.ctrl = [0, 1].map((i) => {
      const c = this.r.xr.getController(i);
      c.userData.hand = null;
      c.addEventListener('connected', (e) => { c.userData.hand = e.data.handedness; this._assignGun(); });
      c.addEventListener('disconnected', () => { c.userData.hand = null; });
      const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
      const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.7, fog: false, toneMapped: false }));
      line.frustumCulled = false; line.visible = false;
      c.add(line);
      c.userData.line = line;
      // 左手：一张悬着的符
      const fu = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.12), new THREE.MeshBasicMaterial({ color: 0xffd040, side: THREE.DoubleSide, fog: false }));
      fu.rotation.x = -Math.PI / 2; fu.position.set(0, 0, -0.06); fu.visible = false;
      c.add(fu);
      c.userData.fu = fu;
      scene.add(c);
      return c;
    });
    this.gunMount = new THREE.Group();
    this.ctrl[0].add(this.gunMount);
    // 枪口激光（替代准星）
    const sg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.25), new THREE.Vector3(0, 0, -40)]);
    this.sight = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xff5030, transparent: true, opacity: 0.35, fog: false, toneMapped: false }));
    this.sight.frustumCulled = false; this.sight.visible = false;
    this.gunMount.add(this.sight);
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff4020, fog: false, toneMapped: false, depthTest: false, transparent: true, opacity: 0.9 }));
    this.dot.renderOrder = 998; this.dot.visible = false;
    scene.add(this.dot);

    // 世界面板（菜单类）
    this.main = new Panel(1280, 800, 1.92, 1.2);
    scene.add(this.main.mesh);
    this.cursor = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.012, 16), new THREE.MeshBasicMaterial({ color: 0xfff0c0, depthTest: false, fog: false, toneMapped: false }));
      m.renderOrder = 1002; m.visible = false;
      this.main.mesh.add(m);
      return m;
    });

    // 随头面板
    this.head = new THREE.Group();
    this.head.visible = false;
    g.camera.add(this.head);
    const Z = -1.4;
    this.top = new Panel(1024, 224, 0.92, 0.2);
    this.top.mesh.position.set(0, 0.36, Z); this.top.mesh.lookAt(0, 0, 0);
    this.sub = new Panel(1024, 256, 1.0, 0.25);
    this.sub.mesh.position.set(0, -0.36, Z); this.sub.mesh.lookAt(0, 0, 0);
    this.hud = new Panel(1024, 176, 0.9, 0.155);
    this.hud.mesh.position.set(0, -0.62, Z); this.hud.mesh.lookAt(0, 0, 0);
    this.head.add(this.top.mesh, this.sub.mesh, this.hud.mesh);
    // 受伤红晕 / 闪白
    const vc = document.createElement('canvas'); vc.width = vc.height = 128;
    const vg = vc.getContext('2d');
    const grad = vg.createRadialGradient(64, 64, 22, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(1, 'rgba(255,255,255,1)');
    vg.fillStyle = grad; vg.fillRect(0, 0, 128, 128);
    const mk = (map, color) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
      m.position.z = -0.6; m.renderOrder = 990; m.frustumCulled = false; m.visible = false;
      this.head.add(m);
      return m;
    };
    this.hurtQuad = mk(new THREE.CanvasTexture(vc), 0xc01810);
    this.flashQuad = mk(null, 0xffffff);
  }

  // 截获 DOM 提示（横幅 / 提示 / 章节卡），在 VR 里重画
  _patch() {
    const g = this.g, hud = g.hud, cine = g.cine, W = g.weapons;
    const banner = hud.banner.bind(hud);
    hud.banner = (title, sub = '', dur = 2400, opt = {}) => {
      const queued = opt.queue && performance.now() < (hud._bUntil || 0);
      banner(title, sub, dur, opt);
      if (!queued) this.note = { title, sub, until: performance.now() + dur };
    };
    const toast = hud.toast.bind(hud);
    hud.toast = (text, dur = 1800) => { toast(text, dur); this.toastN = { text, until: performance.now() + dur }; };
    const card = cine.titleCard.bind(cine);
    cine.titleCard = (main, sub = '', o = {}) => { card(main, sub, o); this.note = { title: main, sub, until: performance.now() + (o.dur ?? 3.4) * 1000 }; };
    const fire = W._fire.bind(W);
    W._fire = (...a) => { fire(...a); if (this.active) this.pulse('right', Math.min(1, 0.35 + a[0].shake), 45); };
  }

  _makeButton() {
    const auto = this.auto;
    const b = document.createElement('div');
    b.id = 'vr-enter';
    b.textContent = auto ? '扣动扳机 · 进入 VR' : '进入 VR';
    b.style.cssText = `position:fixed;z-index:200;left:50%;transform:translateX(-50%);cursor:pointer;font-family:${FONT};color:#1a1008;background:linear-gradient(#f4d488,#c89838);border:2px solid #fff0c0;border-radius:10px;box-shadow:0 6px 30px rgba(0,0,0,.7);letter-spacing:6px;font-weight:900;display:none;`
      + (auto ? 'top:50%;margin-top:-70px;padding:46px 90px;font-size:44px;' : 'top:18px;padding:12px 34px;font-size:20px;');
    b.addEventListener('click', (e) => { e.stopPropagation(); this.enter(); });
    document.body.appendChild(b);
    this.btn = b;
    setInterval(() => {
      const st = this.g.state;
      b.style.display = !this.active && (st === 'menu' || (auto && st !== 'loading')) ? 'block' : 'none';
    }, 250);
  }

  // ------------------------------------------------------------ 进入 / 退出
  async enter() {
    if (this.active || this.entering || !this.supported) return;
    this.entering = true;
    const g = this.g;
    Audio.unlock();
    this.wantVR = true;
    g.applySettings();
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
      let type = 'local-floor', base;
      try { base = await session.requestReferenceSpace('local-floor'); } catch (e) { type = 'local'; base = await session.requestReferenceSpace('local'); }
      this.r.xr.setReferenceSpaceType(type);
      // 注意：PICO 浏览器在缩放系数 ≠ 1 时深度附件尺寸不跟着变，帧缓冲不完整（整屏黑）。默认保持 1
      this.r.xr.setFramebufferScaleFactor(parseFloat(new URLSearchParams(location.search).get('xrscale')) || 1);
      await this._setSession(session);
      try { this.r.xr.setFoveation(1); } catch (e) { /* ignore */ }
      this.session = session; this.base = base; this.floor = type === 'local-floor';
      session.addEventListener('end', () => this._onEnd());
      session.addEventListener('visibilitychange', () => { if (session.visibilityState !== 'visible' && g.state === 'playing') g.pause(); });
      this._onStart();
    } catch (e) {
      console.error('[VR] enter failed', e);
      this.wantVR = this.auto;
      g.applySettings();
      g.hud.toast('无法进入 VR：' + (e?.message || e));
    }
    this.entering = false;
  }

  exit() { this.session?.end().catch(() => {}); }

  // three 在支持 WebXR Layers 的浏览器上会走 XRProjectionLayer + 自建多重采样帧缓冲。
  // 这条路是按 Quest 浏览器写的；PICO 浏览器（Chromium 105）上帧缓冲不完整、整屏发黑。
  // 没有 WEBGL_multisampled_render_to_texture 的设备一律退回经典的 XRWebGLLayer。
  async _setSession(session) {
    const gl = this.r.getContext();
    const q = new URLSearchParams(location.search).get('xrlayers');
    const legacy = q === '0' || (q !== '1' && !gl.getExtension('WEBGL_multisampled_render_to_texture'));
    const proto = typeof XRWebGLBinding !== 'undefined' ? XRWebGLBinding.prototype : null;
    const desc = legacy && proto ? Object.getOwnPropertyDescriptor(proto, 'createProjectionLayer') : null;
    if (desc) delete proto.createProjectionLayer;
    try { await this.r.xr.setSession(session); } finally { if (desc) Object.defineProperty(proto, 'createProjectionLayer', desc); }
  }

  _onStart() {
    const g = this.g;
    this.active = true;
    this._ax = NaN;
    this.calibrated = false;
    this.wasPlayerMode = false;
    this.panelLocal.state = null;
    this.rigPos.copy(g.camera.position).setY(0);
    this.rigYaw = 0;
    this.perf.setup();
    this.gunMount.add(g.weapons.rig);
    this._assignGun();
    g.weapons.aimObj = this.gunMount;
    this.head.visible = true;
    if (Audio.ctx && (g.state === 'menu' || g.state === 'diff')) { Audio.startMusic('calm'); Audio.setAmbience('yizhuang'); }
    const rs = this.session.renderState;
    const h = rs.baseLayer?.framebufferHeight || rs.layers?.[0]?.textureHeight || 1500;
    g.effects.setViewportHeight(h * 0.55);
    g.pickups.setViewportHeight(h * 0.55);
    if (g.state === 'playing') { g.view = 'fps'; g.applyView(); }
  }

  _onEnd() {
    const g = this.g;
    this.active = false;
    this.wantVR = this.auto;
    this.session = null;
    if (!LITE) this.perf.restore();
    g.weapons.aimObj = null;
    g.camera.add(g.weapons.rig);
    g.weapons.rig.position.set(0, 0, 0);
    for (const vm of Object.values(g.weapons.viewmodels)) for (const c of vm.children) c.visible = true;
    g.weapons.triggerDown = false;
    g.player.analog.set(0, 0);
    g.player.pad.jump = g.player.pad.sprint = g.player.pad.breath = false;
    this.head.visible = false;
    this.main.mesh.visible = false;
    this.sight.visible = false; this.dot.visible = false;
    for (const c of this.ctrl) { c.userData.line.visible = false; c.userData.fu.visible = false; }
    if (g.state === 'playing') g.pause();
    g.view = g.progress.settings.view || 'tps';
    if (g.state === 'paused' || g.state === 'cards') g.applyView();
    g.applySettings();
    g.effects.setViewportHeight(innerHeight);
    g.pickups.setViewportHeight(innerHeight);
    dispatchEvent(new Event('resize'));
  }

  _assignGun() {
    const right = this.ctrl.find((c) => c.userData.hand === 'right') || this.ctrl.find((c) => c.userData.hand !== 'left') || this.ctrl[0];
    if (this.gunMount.parent !== right) right.add(this.gunMount);
  }

  _ctrl(hand) { return this.ctrl.find((c) => c.userData.hand === hand && c.visible) || null; }

  handRay(hand) {
    const c = this._ctrl(hand);
    if (!c) return null;
    return { origin: c.position.clone(), dir: new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion) };
  }

  pulse(hand, v = 0.5, ms = 40) {
    if (!this.session) return;
    for (const s of this.session.inputSources) {
      if (hand !== 'both' && s.handedness !== hand) continue;
      try { s.gamepad?.hapticActuators?.[0]?.pulse(v, ms); } catch (e) { /* ignore */ }
    }
  }

  calibrate() {
    this.home.copy(this.h);
    this.homeYaw = this.hYaw;
    // 坐着玩 / 无地面参考：补足到站立视线高度
    this.heightOff = this.h.y < 1.3 ? 1.6 - this.h.y : 0;
    this.hPrev.copy(this.h);
    this.calibrated = true;
    this.panelLocal.state = null;
  }

  // ------------------------------------------------------------ 每帧（逻辑前）
  preUpdate(dt) {
    if (!this.active) {
      // 一体机：加载完就把轻量材质 / 合批 / 关灯做好，进入 VR 时不再卡顿重编译着色器
      if (LITE && this.g.state !== 'loading') { if (!this._prepped) { this._prepped = true; this.perf.setup(); } this.perf.update(dt); }
      return;
    }
    const g = this.g, P = g.player;
    this.perf.update(dt);
    this._fpsN++; this._fpsT += dt;
    if (this._fpsT >= 1) {
      this.fps = Math.round(this._fpsN / this._fpsT); this._fpsN = 0; this._fpsT = 0;
      // 动态分辨率：掉帧就缩小渲染视口，帧率富余再放回来
      const hz = this.session.frameRate || 72;
      if (this.fps < hz * 0.8) this.vpScale = Math.max(0.6, this.vpScale - 0.08);
      else if (this.fps > hz * 0.95) this.vpScale = Math.min(1, this.vpScale + 0.04);
    }
    const frame = this.r.xr.getFrame();
    const pose = frame?.getViewerPose(this.base);
    if (pose) {
      if (this.vpScale !== this._vpApplied || this.vpScale < 1) { this._vpApplied = this.vpScale; for (const vw of pose.views) vw.requestViewportScale?.(this.vpScale); }
      const t = pose.transform;
      this.h.set(t.position.x, t.position.y, t.position.z);
      this.hq.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
      _v.set(0, 0, -1).applyQuaternion(this.hq);
      if (Math.hypot(_v.x, _v.z) > 0.2) this.hYaw = Math.atan2(-_v.x, -_v.z);
      this.hPitch = Math.asin(Math.max(-1, Math.min(1, _v.y)));
      if (!this.calibrated) this.calibrate();
      // 菜单 / 剧情镜头：「原点」缓慢跟随头部——戴上头显后挪了位置、坐下站起，都会自己对回机位
      else if (!PLAYER_STATES.has(g.state)) this.home.lerp(this.h, 1 - Math.exp(-dt * 1.5));
    }
    const st = g.state;
    const playerMode = PLAYER_STATES.has(st);
    if (playerMode) {
      if (g.view !== 'fps') { g.view = 'fps'; g.applyView(); }
      if (!this.wasPlayerMode) {
        this.rigYaw = P.yaw - this.hYaw; this.hPrev.copy(this.h);
        this.heightOff = this.h.y < 1.3 ? 1.6 - this.h.y : 0;
      }
      // 现实中走动 → 角色跟着走
      _v.set(this.h.x - this.hPrev.x, 0, this.h.z - this.hPrev.z);
      if (_v.lengthSq() < 0.25) { _v.applyAxisAngle(Y_AXIS, this.rigYaw); P.position.x += _v.x; P.position.z += _v.z; }
      this.hPrev.copy(this.h);
    }
    this.wasPlayerMode = playerMode;
    this._input(dt, st);
    if (playerMode) { P.yaw = this.rigYaw + this.hYaw; P.pitch = this.hPitch; }
    // 把相机先摆到真实头部位姿，供本帧逻辑读取
    const cam = g.camera;
    cam.position.copy(this.h).applyAxisAngle(Y_AXIS, this.rigYaw).add(this.rigPos);
    cam.quaternion.setFromAxisAngle(Y_AXIS, this.rigYaw).multiply(this.hq);
    this.camSetP.copy(cam.position); this.camSetQ.copy(cam.quaternion);
    // 枪
    const W = g.weapons, vm = W.viewmodels[W.current];
    if (vm) {
      const b = vm.userData.base, m = vm.userData.muzzle;
      W.rig.position.set(-(b.x + m.x), -(b.y + m.y), -b.z + 0.08);
      for (const c of vm.children) if (c !== vm.userData.gun) c.visible = false;
    }
    this.gunMount.updateWorldMatrix(true, true);
  }

  // ------------------------------------------------------------ 每帧（渲染前）
  postUpdate(dt) {
    if (!this.active) return;
    const g = this.g, P = g.player, cam = g.camera, st = g.state;
    if (PLAYER_STATES.has(st)) {
      _v.set(this.h.x, 0, this.h.z).applyAxisAngle(Y_AXIS, this.rigYaw);
      this.rigPos.set(P.position.x - _v.x, P.position.y - EYE_HEIGHT + this.heightOff, P.position.z - _v.z);
    } else if (!cam.position.equals(this.camSetP) || !cam.quaternion.equals(this.camSetQ)) {
      // 剧情 / 菜单镜头：玩家「站」到机位上，朝向取镜头水平方向
      _v.set(0, 0, -1).applyQuaternion(cam.quaternion);
      const yawD = Math.hypot(_v.x, _v.z) > 0.15 ? Math.atan2(-_v.x, -_v.z) : this.rigYaw + this.homeYaw;
      this.rigYaw = yawD - this.homeYaw;
      _v.copy(this.home).applyAxisAngle(Y_AXIS, this.rigYaw);
      this.rigPos.set(cam.position.x - _v.x, Math.max(-0.4, cam.position.y - this.home.y), cam.position.z - _v.z);
    }
    this._applyRig();
    this._updateUI(dt, st);
    // 受伤红晕 / 闪白
    const hurt = g.postfx.u.hurt.value;
    this.hurtQuad.visible = hurt > 0.02; this.hurtQuad.material.opacity = Math.min(0.8, hurt);
    const fl = g.postfx._fx.flash;
    this.flashQuad.visible = fl > 0.02; this.flashQuad.material.opacity = Math.min(0.6, fl * 0.7);
    if (fl > 0.02) this.flashQuad.material.color.copy(g.postfx.u.flashColor.value);
    if (g.hurt > (this._hurtPrev || 0) + 0.3) this.pulse('both', 0.9, 120);
    this._hurtPrev = g.hurt;
  }

  _applyRig() {
    const p = this.rigPos, y = this.rigYaw;
    if (this._ax === p.x && this._ay === p.y && this._az === p.z && this._ayaw === y) return;
    this._ax = p.x; this._ay = p.y; this._az = p.z; this._ayaw = y;
    _v.copy(p).negate().applyAxisAngle(Y_AXIS, -y);
    _q.setFromAxisAngle(Y_AXIS, -y);
    const space = this.base.getOffsetReferenceSpace(new XRRigidTransform({ x: _v.x, y: _v.y, z: _v.z, w: 1 }, { x: _q.x, y: _q.y, z: _q.z, w: _q.w }));
    this.r.xr.setReferenceSpace(space);
  }

  // ------------------------------------------------------------ 输入
  _input(dt, st) {
    const g = this.g, P = g.player, W = g.weapons;
    const pads = {};
    for (const s of this.session.inputSources) if (s.gamepad && (s.handedness === 'left' || s.handedness === 'right')) pads[s.handedness] = s.gamepad;
    const cur = { left: [], right: [] }, ax = { left: [0, 0], right: [0, 0] };
    for (const hd of ['left', 'right']) {
      const p = pads[hd];
      if (!p) continue;
      cur[hd] = p.buttons.map((b) => b.pressed || b.value > 0.55);
      const a = p.axes;
      ax[hd] = a.length >= 4 ? [a[2], a[3]] : [a[0] || 0, a[1] || 0];
    }
    const down = (hd, i) => !!cur[hd][i];
    const hit = (hd, i) => !!cur[hd][i] && !this.prev[hd][i];
    const flick = (hd, k, dir) => (dir > 0 ? ax[hd][k] > 0.7 && this.axPrev[hd][k] <= 0.7 : ax[hd][k] < -0.7 && this.axPrev[hd][k] >= -0.7);
    const dz = (x) => (Math.abs(x) < 0.15 ? 0 : (x - Math.sign(x) * 0.15) / 0.85);
    const anyTrig = hit('left', 0) || hit('right', 0);

    if (st === 'playing') {
      P.analog.set(dz(ax.left[0]), dz(ax.left[1]));
      P.pad.sprint = down('left', 3);
      P.pad.jump = down('right', 4);
      P.pad.breath = down('left', 1);
      W.triggerDown = down('right', 0);
      if (flick('right', 0, 1)) this.rigYaw -= Math.PI / 6;
      if (flick('right', 0, -1)) this.rigYaw += Math.PI / 6;
      if (flick('right', 1, -1)) { W.cycle(-1); g.priest.setWeapon(W.current); }
      if (flick('right', 1, 1)) { W.cycle(1); g.priest.setWeapon(W.current); }
      if (hit('right', 1)) W.startReload();
      if (hit('right', 5) && P.dash()) { g.effects.dust(P.position.clone().setY(0), 8); this.pulse('both', 0.5, 60); }
      if (hit('left', 0)) g.throwFu();
      if (hit('left', 4) && g.skills.castUlt(P)) { g.priest.cast(); g.hud.banner('天师降魔', '五雷轰顶 · 万邪伏诛', 1800); this.pulse('both', 1, 300); }
      if (hit('left', 5)) g.pause();
      if (hit('right', 3)) this.calibrate();
    } else {
      P.analog.set(0, 0);
      P.pad.jump = P.pad.sprint = P.pad.breath = false;
      if (W.triggerDown) W.triggerDown = false;
      const inScene = SCENE_STATES.has(st);
      if (inScene && g.dialogue.active) {
        if (anyTrig || hit('right', 4) || hit('left', 4)) g.dialogue.advance();
        if (hit('right', 5) || hit('left', 5)) { g.dialogue.skip(); if (st === 'intro') g.finishIntro(); }
      } else if (st === 'intro') {
        if (anyTrig || hit('right', 4) || hit('right', 5)) g.finishIntro();
      } else if (st === 'cine') {
        if (hit('right', 5) || hit('left', 5)) g.cine.stop();
      } else if (!HIDE_PANEL.has(st)) {
        for (const hd of ['left', 'right']) {
          if (hit(hd, 0) && this.hover[hd] >= 0) this._click(this.buttons[this.hover[hd]]);
        }
        if (st === 'paused' && hit('left', 5)) g.resumePlay();
        if (st === 'cards' && this.main.mesh.visible) {
          // 选卡时可分段转身看面板
          if (flick('right', 0, 1)) this.rigYaw -= Math.PI / 6;
          if (flick('right', 0, -1)) this.rigYaw += Math.PI / 6;
        }
      }
    }
    this.prev = cur;
    this.axPrev = ax;
  }

  _click(b) {
    if (!b || b.disabled) return;
    Audio.unlock();
    this.pulse('both', 0.4, 30);
    try { b.on(); } catch (e) { console.error('[VR] click', e); }
    this.main.sig = null;
  }

  // ------------------------------------------------------------ 界面
  _updateUI(dt, st) {
    const g = this.g;
    const showMain = !HIDE_PANEL.has(st) && this.calibrated;
    const M = this.main;
    // 世界面板：打开时放到玩家正前方，之后固定在游玩空间里
    if (showMain) {
      const key = st + '|' + this.page;
      if (this.panelLocal.state !== key) {
        if (this.panelLocal.state === null || !this._facing()) {
          const yaw = this.hYaw;
          this.panelLocal.pos.set(this.h.x - Math.sin(yaw) * 1.9, this.h.y - 0.08, this.h.z - Math.cos(yaw) * 1.9);
          this.panelLocal.yaw = yaw;
        }
        this.panelLocal.state = key;
        M.sig = null;
      }
      M.mesh.position.copy(this.panelLocal.pos).applyAxisAngle(Y_AXIS, this.rigYaw).add(this.rigPos);
      M.mesh.rotation.set(0, this.rigYaw + this.panelLocal.yaw, 0);
      M.mesh.updateMatrixWorld(true);
    } else {
      this.panelLocal.state = null;
      if (st !== 'menu') this.page = '';
    }
    M.mesh.visible = showMain;

    // 手柄射线
    let hoverChanged = false;
    for (let i = 0; i < 2; i++) {
      const c = this.ctrl[i], hd = c.userData.hand, line = c.userData.line, cur = this.cursor[i];
      let hov = -1, len = 0;
      if (showMain && hd && c.visible) {
        const o = M.mesh.worldToLocal(_v.copy(c.position));
        const d = _v2.set(0, 0, -1).applyQuaternion(c.quaternion).add(c.position);
        M.mesh.worldToLocal(d).sub(o);
        if (d.z < -1e-4 && o.z > 0) {
          const t = -o.z / d.z;
          const x = o.x + d.x * t, y = o.y + d.y * t;
          if (Math.abs(x) <= M.mw / 2 && Math.abs(y) <= M.mh / 2) {
            len = t * d.length();
            cur.position.set(x, y, 0.003);
            const px = (x / M.mw + 0.5) * M.w, py = (0.5 - y / M.mh) * M.h;
            hov = this.buttons.findIndex((b) => !b.disabled && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
          }
        }
      }
      line.visible = showMain && !!hd && c.visible;
      line.scale.z = len || 1.2;
      line.material.opacity = len ? 0.75 : 0.25;
      cur.visible = len > 0;
      if (hd && this.hover[hd] !== hov) { this.hover[hd] = hov; hoverChanged = true; if (hov >= 0) { Audio.cardHover(); this.pulse(hd, 0.2, 15); } }
      c.userData.fu.visible = st === 'playing' && hd === 'left' && g.skills.fuReady;
    }
    this.uiT -= dt;
    if (showMain && (M.sig === null || hoverChanged || this.uiT <= 0)) {
      this.uiT = 0.5;
      M.sig = 1;
      this._drawMain(st);
    }

    // 激光瞄准
    const W = g.weapons;
    const aiming = st === 'playing' && !W.def().melee && this.gunMount.parent?.visible;
    this.sight.visible = aiming;
    this.dot.visible = false;
    if (aiming) {
      const o = this.gunMount.getWorldPosition(_v);
      const d = _v2.set(0, 0, -1).applyQuaternion(this.gunMount.getWorldQuaternion(_q));
      const eh = g.enemies.raycast(o, d, 60);
      const wh = g.world.raycast(o, d, 60);
      let dist = 0;
      if (eh) dist = eh.point.distanceTo(o);
      if (wh) { const dw = wh.distanceTo(o); if (!dist || dw < dist) dist = dw; }
      if (dist > 0.5) {
        this.dot.position.copy(o).addScaledVector(d, dist - 0.03);
        this.dot.scale.setScalar(Math.max(0.012, dist * 0.006));
        this.dot.material.color.set(eh && (!wh || eh.point.distanceTo(o) <= dist + 0.01) ? 0xff3020 : 0xffd080);
        this.dot.visible = true;
      }
    }

    // 随头面板
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.15;
      this._drawHud(st);
      this._drawTop(st);
    }
    this._drawSub(st);
  }

  _facing() {
    // 面板是否仍大致在玩家视线前方
    const dx = this.panelLocal.pos.x - this.h.x, dz = this.panelLocal.pos.z - this.h.z;
    const yawTo = Math.atan2(-dx, -dz);
    let d = yawTo - this.hYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const dist = Math.hypot(dx, dz);
    return Math.abs(d) < 0.7 && dist > 1.2 && dist < 2.8;
  }

  // ---------------- 画布工具
  _frame(g, W, H) {
    g.clearRect(0, 0, W, H);
    rr(g, 6, 6, W - 12, H - 12, 22);
    g.fillStyle = 'rgba(16,11,8,0.93)'; g.fill();
    g.lineWidth = 3; g.strokeStyle = 'rgba(232,194,106,0.75)'; g.stroke();
    rr(g, 16, 16, W - 32, H - 32, 16);
    g.lineWidth = 1; g.strokeStyle = 'rgba(232,194,106,0.25)'; g.stroke();
  }

  _text(g, s, x, y, { size = 28, color = '#e8dcc0', align = 'center', font = FONT, weight = '400', maxW = 0, lh = 1.35, maxLines = 99 } = {}) {
    g.font = `${weight} ${size}px ${font}`;
    g.fillStyle = color; g.textAlign = align; g.textBaseline = 'top';
    if (!maxW) { g.fillText(s, x, y); return y + size * lh; }
    const lines = wrap(g, s, maxW).slice(0, maxLines);
    for (const L of lines) { g.fillText(L, x, y); y += size * lh; }
    return y;
  }

  _btn(g, label, x, y, w, h, on, { disabled = false, size = 30, sub = '' } = {}) {
    const idx = this.buttons.length;
    const hot = !disabled && (this.hover.left === idx || this.hover.right === idx);
    this.buttons.push({ x, y, w, h, on, disabled });
    rr(g, x, y, w, h, 12);
    g.fillStyle = disabled ? 'rgba(60,50,40,0.5)' : hot ? 'rgba(232,194,106,0.95)' : 'rgba(70,48,24,0.9)';
    g.fill();
    g.lineWidth = hot ? 4 : 2; g.strokeStyle = disabled ? 'rgba(120,110,90,0.4)' : hot ? '#fff4d0' : 'rgba(232,194,106,0.7)'; g.stroke();
    const col = disabled ? '#7a7060' : hot ? '#1a1008' : '#f4e2b0';
    if (sub) {
      this._text(g, label, x + w / 2, y + h / 2 - size * 0.95, { size, color: col, weight: '700' });
      this._text(g, sub, x + w / 2, y + h / 2 + size * 0.2, { size: size * 0.62, color: disabled ? '#6a6050' : hot ? '#3a2810' : '#c8b88a' });
    } else this._text(g, label, x + w / 2, y + h / 2 - size * 0.55, { size, color: col, weight: '700' });
    return hot;
  }

  // ---------------- 世界面板内容
  _drawMain(st) {
    const M = this.main, g = M.g, W = M.w, H = M.h, G = this.g;
    this.buttons = [];
    this._frame(g, W, H);
    const cx = W / 2;
    const T = (s, y, o) => this._text(g, s, cx, y, o);
    const dom = (sel) => [...document.querySelectorAll(sel)];
    const q = (el, s) => (el.querySelector(s)?.textContent || '').trim();

    if (st === 'menu' && this.page === 'help') {
      T('VR 操作说明', 40, { size: 50, color: GOLD, font: BRUSH });
      const rows = [
        ['右手 扳机', '开枪 / 挥剑（枪口朝哪打哪）'], ['右手 握键', '换弹'], ['右手 摇杆 ←→', '分段转身'], ['右手 摇杆 ↑↓', '切换武器'],
        ['右手 A', '跳'], ['右手 B', '罡步冲刺（被击瞬间 = 完美闪避）'], ['右手 按下摇杆', '重置站位 / 高度'],
        ['左手 摇杆', '移动（方向跟随头部；按下摇杆疾跑）'], ['左手 扳机', '掷火符（朝左手所指）'], ['左手 握键', '按住闭气（僵尸闻不到你）'],
        ['左手 X', '天师降魔（大招）'], ['左手 Y', '暂停'], ['剧情对白', '扳机继续 · B / Y 跳过'],
      ];
      rows.forEach(([k, v], i) => {
        const y = 118 + i * 43;
        this._text(g, k, 250, y, { size: 26, color: '#ffd890', align: 'right', weight: '700' });
        this._text(g, v, 290, y, { size: 26, align: 'left' });
      });
      this._btn(g, '返回', cx - 140, 700, 280, 68, () => { this.page = ''; });
    } else if (st === 'menu') {
      T('真理斗僵尸', 46, { size: 96, color: GOLD, font: BRUSH });
      T('茅山伏魔录 · VR', 160, { size: 30, color: '#c8a868' });
      const items = [
        ['开始除祟', () => G.openDifficulty()], ['道行修炼', () => G.openUpgrades()],
        ['操作说明', () => { this.page = 'help'; }], ['退出 VR', () => this.exit()],
      ];
      items.forEach(([label, on], i) => this._btn(g, label, cx - 210, 238 + i * 96, 420, 76, on, { size: 34 }));
      const foot = ($('menu-foot')?.innerHTML || '').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
      this._text(g, foot, cx, 650, { size: 22, color: '#a89878', maxW: W - 120 });
      T(`${this.fps} FPS`, 748, { size: 16, color: '#5a5040' });
    } else if (st === 'diff') {
      T('择 难 度', 40, { size: 58, color: GOLD, font: BRUSH });
      const cards = dom('#diff-row .dcard');
      const cw = Math.min(280, (W - 100) / Math.max(1, cards.length) - 20), gap = 20;
      const x0 = cx - (cards.length * (cw + gap) - gap) / 2;
      cards.forEach((el, i) => {
        const x = x0 + i * (cw + gap), y = 150, h = 460;
        const locked = el.classList.contains('locked');
        const hot = this._btn(g, '', x, y, cw, h, () => el.click(), { disabled: locked });
        const c1 = locked ? '#7a7060' : hot ? '#1a1008' : '#ffe2a0', c2 = locked ? '#6a6050' : hot ? '#2a1c0c' : '#d8ccb0';
        this._text(g, q(el, '.d-name'), x + cw / 2, y + 30, { size: 46, color: c1, font: BRUSH });
        this._text(g, q(el, '.d-tag'), x + cw / 2, y + 100, { size: 22, color: c2 });
        this._text(g, q(el, '.d-desc'), x + cw / 2, y + 150, { size: 22, color: c2, maxW: cw - 36, maxLines: 8 });
        this._text(g, locked ? '未解锁' : q(el, '.d-rew'), x + cw / 2, y + h - 80, { size: 22, color: locked ? '#8a6050' : hot ? '#5a2808' : '#ffc060' });
        if (el.querySelector('.clr')) this._text(g, '✦ 已通关', x + cw / 2, y + h - 44, { size: 20, color: hot ? '#3a2810' : '#9ad0a0' });
      });
      this._btn(g, '返回', cx - 140, 690, 280, 68, () => G.toMenu());
    } else if (st === 'story') {
      T(txt('st-ch'), 44, { size: 26, color: '#c8a868' });
      T(txt('st-name'), 84, { size: 84, color: GOLD, font: BRUSH });
      T(txt('st-stars'), 190, { size: 26, color: '#c04030' });
      T(txt('st-poem'), 236, { size: 28, color: '#d8c8a0', font: BRUSH });
      this._text(g, txt('st-text'), cx, 300, { size: 26, maxW: W - 200, maxLines: 9, lh: 1.5 });
      T(txt('st-diff'), 640, { size: 22, color: '#a89878' });
      this._btn(g, '启 程', cx - 170, 686, 340, 76, () => { if (G.state === 'story') G.beginChapter(); }, { size: 36 });
    } else if (st === 'cards') {
      T(txt('cd-title'), 30, { size: 56, color: GOLD, font: BRUSH });
      T(txt('cd-sub'), 104, { size: 24, color: '#c8b890' });
      const cards = dom('#card-row .card');
      const n = Math.max(1, cards.length), gap = 22;
      const cw = Math.min(300, (W - 80 - gap * (n - 1)) / n);
      const x0 = cx - (n * (cw + gap) - gap) / 2;
      const RC = { common: '#b8b0a0', rare: '#6ab0ff', epic: '#c080ff', legend: '#ffb040', evo: '#ff6040', relic: '#ffd060' };
      cards.forEach((el, i) => {
        const x = x0 + i * (cw + gap), y = 150, h = 510;
        const rar = ([...el.classList].find((c) => c.startsWith('r-')) || 'r-common').slice(2);
        const rc = RC[rar] || GOLD;
        const hot = this._btn(g, '', x, y, cw, h, () => el.click());
        rr(g, x + 5, y + 5, cw - 10, h - 10, 10); g.lineWidth = 2; g.strokeStyle = rc; g.stroke();
        const c1 = hot ? '#1a1008' : '#ffe8b0', c2 = hot ? '#2a1c0c' : '#d8ccb0';
        this._text(g, `${q(el, '.kind')} · ${q(el, '.rar')}`, x + cw / 2, y + 22, { size: 20, color: hot ? '#3a2810' : rc });
        this._text(g, q(el, '.ic'), x + cw / 2, y + 62, { size: 84, color: c1 });
        this._text(g, q(el, '.nm'), x + cw / 2, y + 176, { size: 34, color: c1, weight: '700', maxW: cw - 24, maxLines: 2 });
        this._text(g, q(el, '.lvs'), x + cw / 2, y + 268, { size: 22, color: hot ? '#5a3808' : '#ffc850' });
        this._text(g, q(el, '.ds'), x + cw / 2, y + 306, { size: 21, color: c2, maxW: cw - 32, maxLines: 7, lh: 1.4 });
        if (el.querySelector('.new')) this._text(g, '新', x + cw - 30, y + 16, { size: 22, color: '#ff5040', weight: '900' });
      });
      const re = $('cd-reroll'), sk = $('cd-skip');
      const hasRe = !re.classList.contains('hidden'), hasSk = !sk.classList.contains('hidden');
      if (hasRe) this._btn(g, txt('cd-reroll'), cx - 300, 694, 270, 66, () => re.click(), { disabled: re.classList.contains('disabled') });
      if (hasSk) this._btn(g, '跳过（阳气 +30）', cx + 30, 694, 270, 66, () => sk.click(), { size: 26 });
    } else if (st === 'paused') {
      T('暂 停', 44, { size: 72, color: GOLD, font: BRUSH });
      T(txt('pause-info'), 140, { size: 24, color: '#c8b890' });
      this._text(g, dom('#pause-build span').map((s) => s.textContent.trim()).join('　'), cx, 184, { size: 22, color: '#a89878', maxW: W - 160, maxLines: 3 });
      const items = [
        ['继续', () => G.resumePlay()],
        ['重置站位 / 高度', () => this.calibrate()],
        [`阴影：${this.shadows ? '开' : '关'}（关更流畅）`, () => { this.shadows = !this.shadows; G.applySettings(); }],
        ['放弃本局', () => $('p-quit').click()],
        ['退出 VR', () => this.exit()],
      ];
      items.forEach(([label, on], i) => this._btn(g, label, cx - 230, 290 + i * 86, 460, 70, on, { size: 30 }));
      T(`${this.fps} FPS`, 748, { size: 16, color: '#5a5040' });
    } else if (st === 'result') {
      const win = $('rs-title').classList.contains('win');
      T(txt('rs-title'), 36, { size: 84, color: win ? GOLD : '#c84030', font: BRUSH });
      T(txt('rs-sub'), 142, { size: 26, color: '#c8b890' });
      dom('#rs-grid > div').forEach((el, i) => {
        const x = 250 + (i % 3) * 390, y = 210 + Math.floor(i / 3) * 104;
        const b = el.querySelector('b');
        const label = (el.childNodes[0]?.textContent || '').trim();
        this._text(g, label, x, y, { size: 22, color: '#a89878' });
        this._text(g, (b?.textContent || '').trim(), x, y + 32, { size: 40, color: '#ffe8b0', weight: '700' });
      });
      this._text(g, dom('#rs-build span').map((s) => s.textContent.trim()).join('　'), cx, 530, { size: 20, color: '#a89878', maxW: W - 140, maxLines: 4 });
      const btns = [['再战一局', () => G.openDifficulty()], ['主菜单', () => G.toMenu()]];
      if (!$('rs-endless').classList.contains('hidden')) btns.push(['无尽轮回', () => G.continueEndless()]);
      const bw = 290, gap = 30, x0 = cx - (btns.length * (bw + gap) - gap) / 2;
      btns.forEach(([label, on], i) => this._btn(g, label, x0 + i * (bw + gap), 686, bw, 72, on, { size: 32 }));
    } else if (st === 'upgrade') {
      T('道行修炼', 30, { size: 56, color: GOLD, font: BRUSH });
      T(txt('up-yangqi'), 100, { size: 26, color: '#ffd890' });
      const rows = dom('#up-list .up-row');
      const per = Math.ceil(rows.length / 2), rh = Math.min(96, 520 / Math.max(1, per));
      rows.forEach((el, i) => {
        const col = i < per ? 0 : 1, k = i < per ? i : i - per;
        const x = 50 + col * 600, y = 150 + k * rh;
        const buy = el.querySelector('.buy');
        const dis = buy.classList.contains('dis');
        const hot = this._btn(g, '', x, y, 580, rh - 10, () => buy.click(), { disabled: dis });
        const c1 = dis ? '#9a9080' : hot ? '#1a1008' : '#ffe8b0', c2 = dis ? '#7a7060' : hot ? '#2a1c0c' : '#c8bca0';
        this._text(g, q(el, '.ic'), x + 40, y + rh / 2 - 26, { size: 34, color: c1 });
        this._text(g, `${q(el, '.nm')}  ${q(el, '.pips')}`, x + 80, y + 10, { size: 24, color: c1, align: 'left', weight: '700' });
        this._text(g, q(el, '.ds'), x + 80, y + 44, { size: 18, color: c2, align: 'left', maxW: 350, maxLines: 2, lh: 1.25 });
        this._text(g, buy.textContent.trim(), x + 560, y + rh / 2 - 18, { size: 22, color: dis ? '#7a7060' : hot ? '#5a2808' : '#ffc060', align: 'right' });
      });
      this._btn(g, '返回', cx - 140, 700, 280, 66, () => G.toMenu());
    } else if (st === 'credits') {
      T('制作人员', 40, { size: 56, color: GOLD, font: BRUSH });
      const rows = dom('#cr-roll .r').map((r) => r.textContent.trim().replace(/\s+/g, '  ')).slice(0, 14);
      rows.forEach((s, i) => this._text(g, s, cx, 130 + i * 38, { size: 24, color: i === 0 ? GOLD : '#d8ccb0', maxW: W - 160, maxLines: 1 }));
      this._btn(g, '跳过', cx - 140, 700, 280, 66, () => G.finishCredits());
    } else {
      T('此页面请在平面模式查看', 300, { size: 40, color: GOLD });
      this._btn(g, '返回主菜单', cx - 180, 420, 360, 76, () => G.toMenu());
    }
    M.commit();
  }

  // ---------------- 随头：血量 / 弹药 / 技能
  _drawHud(st) {
    const P = this.hud, G = this.g;
    const on = st === 'playing';
    P.mesh.visible = on;
    if (!on) return;
    const g = P.g, W = P.w, H = P.h;
    g.clearRect(0, 0, W, H);
    rr(g, 2, 2, W - 4, H - 4, 18); g.fillStyle = 'rgba(10,8,6,0.55)'; g.fill();
    const pl = G.player, Wp = G.weapons, def = Wp.def(), S = G.skills;
    // 血条
    const k = Math.max(0, pl.hp / pl.maxHp);
    rr(g, 24, 22, 420, 34, 8); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fill();
    if (k > 0) { rr(g, 24, 22, Math.max(16, 420 * k), 34, 8); g.fillStyle = k < 0.3 ? '#e03020' : '#c8402c'; g.fill(); }
    this._text(g, `${Math.ceil(pl.hp)} / ${pl.maxHp}`, 234, 25, { size: 24, color: '#fff', weight: '700' });
    if (S.shield > 0) this._text(g, '◈'.repeat(Math.min(6, S.shield)), 456, 22, { size: 26, color: '#ffe080', align: 'left' });
    // 闭气
    const bk = pl.breath / pl.breathMax;
    if (bk < 0.999 || pl.holding) {
      rr(g, 24, 62, 420, 8, 4); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fill();
      rr(g, 24, 62, Math.max(8, 420 * bk), 8, 4); g.fillStyle = pl.breathLock > 0 ? '#806060' : '#8ec8ff'; g.fill();
    }
    // 技能冷却
    const abil = [['符', S.fuCd > 0 ? 1 - S.fuCd / S.stats.fuCd : 1, '#ffb040'], ['罡', 1 - pl.dashCd / pl.dashCdMax, '#8ec8ff'], ['雷', S.ult / 100, '#ffe060']];
    abil.forEach(([name, v, col], i) => {
      const x = 24 + i * 146, y = 84;
      const ready = v >= 0.999;
      rr(g, x, y, 130, 68, 10); g.fillStyle = 'rgba(0,0,0,0.55)'; g.fill();
      rr(g, x, y + 68 * (1 - Math.max(0, Math.min(1, v))), 130, 68 * Math.max(0.001, Math.min(1, v)), 10); g.fillStyle = ready ? col : 'rgba(120,110,90,0.55)'; g.fill();
      this._text(g, name, x + 65, y + 12, { size: 38, color: ready ? '#1a1008' : '#d8ccb0', font: BRUSH });
    });
    // 武器
    this._text(g, def.name, W - 28, 16, { size: 28, color: '#e8d8b0', align: 'right' });
    const ammo = def.melee ? '∞' : Wp.reloading > 0 ? '换弹…' : `${Wp.ammo.mag} / ${def.mag}`;
    this._text(g, ammo, W - 28, 52, { size: 64, color: !def.melee && Wp.ammo.mag === 0 ? '#ff5040' : '#fff4d8', align: 'right', weight: '900' });
    // 波次
    this._text(g, txt('ch-name'), 500, 62, { size: 24, color: GOLD, align: 'left' });
    this._text(g, txt('wave-line'), 500, 94, { size: 22, color: '#d8ccb0', align: 'left' });
    this._text(g, `道行 ${G.level}　诛邪 ${G.kills}${G.combo.n >= 3 ? `　连斩 ${G.combo.n}` : ''}`, 500, 126, { size: 22, color: '#a89878', align: 'left' });
    P.commit();
  }

  // ---------------- 随头：首领血条 + 横幅
  _drawTop(st) {
    const P = this.top, G = this.g;
    const now = performance.now();
    const bosses = st === 'playing' || st === 'cine' ? G.hud._bossEls.filter((x) => x.b.alive && !x.b.dying) : [];
    const note = now < this.note.until ? this.note : null;
    const toast = now < this.toastN.until ? this.toastN.text : '';
    const sig = `${bosses.map((x) => x.b.cfg.name + Math.round(x.b.hp / x.b.maxHp * 100) + (x.b.staggerT > 0 ? 's' : '')).join()}|${note ? note.title + note.sub : ''}|${toast}`;
    const on = bosses.length > 0 || !!note || !!toast;
    P.mesh.visible = on;
    if (!on || sig === P.sig) return;
    P.sig = sig;
    const g = P.g, W = P.w;
    P.clear();
    let y = 4;
    if (bosses.length) {
      const bw = (W - 40 - (bosses.length - 1) * 20) / bosses.length;
      bosses.forEach((x, i) => {
        const bx = 20 + i * (bw + 20), k = Math.max(0, x.b.hp / x.b.maxHp);
        this._text(g, `${x.b.cfg.name}${x.b.staggerT > 0 ? ' · 破绽！' : ''}`, bx + bw / 2, y, { size: 26, color: x.b.staggerT > 0 ? '#ffe060' : '#ff8060', weight: '700' });
        rr(g, bx, y + 36, bw, 20, 6); g.fillStyle = 'rgba(0,0,0,0.7)'; g.fill();
        if (k > 0) { rr(g, bx, y + 36, Math.max(10, bw * k), 20, 6); g.fillStyle = '#d83020'; g.fill(); }
      });
      y += 66;
    }
    if (note) {
      g.shadowColor = '#000'; g.shadowBlur = 10;
      this._text(g, note.title, W / 2, y + 2, { size: bosses.length ? 54 : 76, color: GOLD, font: BRUSH });
      if (note.sub) this._text(g, note.sub, W / 2, y + (bosses.length ? 66 : 96), { size: 28, color: '#f0e4c8' });
      g.shadowBlur = 0;
    } else if (toast) {
      g.shadowColor = '#000'; g.shadowBlur = 8;
      this._text(g, toast, W / 2, y + 30, { size: 36, color: '#ffe0a0' });
      g.shadowBlur = 0;
    }
    P.commit();
  }

  // ---------------- 随头：对白 / 战斗字幕
  _drawSub(st) {
    const P = this.sub, D = this.g.dialogue;
    let name = '', color = '#fff', text = '', hint = '';
    if (D.active && SCENE_STATES.has(st)) {
      const L = D.lines[D.i];
      const C = CAST[L?.who] || CAST.narrator;
      const n = Math.floor(D.shown);
      name = C.name || ''; color = C.color || '#fff';
      text = D.full.slice(0, n >= D.full.length ? n : n - (n % 3));
      hint = '扳机 继续　·　B / Y 跳过';
    } else if (D.cur && st === 'playing' || D.cur && st === 'cine') {
      const C = CAST[D.cur.who] || CAST.narrator;
      name = C.name || ''; color = C.color || '#fff'; text = D.cur.text;
    } else if (st === 'intro' || st === 'cine') {
      hint = st === 'intro' ? '扳机 跳过' : '';
    }
    const sig = name + '|' + text + '|' + hint;
    const on = !!(text || hint);
    P.mesh.visible = on;
    if (!on || sig === P.sig) return;
    P.sig = sig;
    const g = P.g, W = P.w, H = P.h;
    P.clear();
    if (text) {
      rr(g, 4, 4, W - 8, H - 8, 18); g.fillStyle = 'rgba(10,8,6,0.78)'; g.fill();
      g.lineWidth = 2; g.strokeStyle = 'rgba(232,194,106,0.4)'; g.stroke();
      let y = 22;
      if (name) { this._text(g, name, 40, y, { size: 32, color, align: 'left', weight: '700', font: BRUSH }); y += 48; }
      this._text(g, text, 40, y, { size: 30, color: '#f0e8d8', align: 'left', maxW: W - 80, maxLines: 4, lh: 1.4 });
    }
    if (hint) this._text(g, hint, W - 36, H - 40, { size: 20, color: 'rgba(232,194,106,0.75)', align: 'right' });
    P.commit();
  }
}
