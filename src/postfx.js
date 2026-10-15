import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { MOON_DIR } from './gfx/fog.js';

// =====================================================================
//  后期管线：MSAA 场景渲染 → 月光体积光（屏幕空间径向散射）→ Bloom →
//  色调映射 → 显示空间调色（分离色调 / 对比 / 饱和 / 暗角 / 颗粒 /
//  受伤红晕 / 色差 / 冲刺径向模糊 / 闪白）
// =====================================================================

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';

// ---------------------------------------------------------------- 体积光
class GodRaysPass extends Pass {
  constructor() {
    super();
    const opt = { type: THREE.HalfFloatType, depthBuffer: false };
    this.rtA = new THREE.WebGLRenderTarget(4, 4, opt);
    this.rtB = new THREE.WebGLRenderTarget(4, 4, opt);
    this.sun = new THREE.Vector2(0.5, 0.5);
    this.aspect = 1;
    this.intensity = 0;
    this.strength = 1;
    this.color = new THREE.Color(1, 1, 1);
    this.extract = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, sun: { value: this.sun }, aspect: { value: 1 } },
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform vec2 sun; uniform float aspect; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          vec2 d = vUv - sun; d.x *= aspect;
          float w = smoothstep(0.26, 0.0, length(d));
          gl_FragColor = vec4(c * smoothstep(0.55, 1.8, l) * w, 1.0);
        }`,
    });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tInput: { value: null }, sun: { value: this.sun }, stepScale: { value: 1 } },
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tInput; uniform vec2 sun; uniform float stepScale; varying vec2 vUv;
        void main(){
          vec2 delta = (vUv - sun) * stepScale / 40.0;
          vec2 uv = vUv; vec3 acc = vec3(0.0); float decay = 1.0; float tot = 0.0;
          for (int i = 0; i < 40; i++) { acc += texture2D(tInput, uv).rgb * decay; tot += decay; uv -= delta; decay *= 0.962; }
          gl_FragColor = vec4(acc / tot * 1.4, 1.0);
        }`,
    });
    this.comp = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tRays: { value: null }, intensity: { value: 0 }, color: { value: this.color } },
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform sampler2D tRays; uniform float intensity; uniform vec3 color; varying vec2 vUv;
        void main(){
          vec4 base = texture2D(tDiffuse, vUv);
          vec3 rays = texture2D(tRays, vUv).rgb;
          gl_FragColor = vec4(base.rgb + rays * color * intensity, base.a);
        }`,
    });
    this.quad = new FullScreenQuad(null);
  }

  setSize(w, h) {
    this.rtA.setSize(Math.max(4, w >> 1), Math.max(4, h >> 1));
    this.rtB.setSize(Math.max(4, w >> 1), Math.max(4, h >> 1));
    this.aspect = w / h;
  }

  render(renderer, writeBuffer, readBuffer) {
    this.extract.uniforms.tDiffuse.value = readBuffer.texture;
    this.extract.uniforms.aspect.value = this.aspect;
    this.quad.material = this.extract;
    renderer.setRenderTarget(this.rtA); this.quad.render(renderer);
    this.quad.material = this.blur;
    this.blur.uniforms.tInput.value = this.rtA.texture; this.blur.uniforms.stepScale.value = 1.0;
    renderer.setRenderTarget(this.rtB); this.quad.render(renderer);
    this.blur.uniforms.tInput.value = this.rtB.texture; this.blur.uniforms.stepScale.value = 0.3;
    renderer.setRenderTarget(this.rtA); this.quad.render(renderer);
    this.comp.uniforms.tDiffuse.value = readBuffer.texture;
    this.comp.uniforms.tRays.value = this.rtA.texture;
    this.comp.uniforms.intensity.value = this.intensity * this.strength * 0.32;
    this.quad.material = this.comp;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

// ---------------------------------------------------------------- 显示空间调色
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 1.1 }, grain: { value: 0.03 },
    hurt: { value: 0 }, desat: { value: 0 }, saturation: { value: 1 }, contrast: { value: 1.06 }, gain: { value: 1 },
    shadowTint: { value: new THREE.Color(0.1, 0.25, 0.45) }, highTint: { value: new THREE.Color(0.55, 0.35, 0.1) }, splitK: { value: 1 },
    ca: { value: 0 }, zoom: { value: 0 }, flash: { value: 0 }, flashColor: { value: new THREE.Color(1, 1, 1) },
    tint: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float time; uniform float vignette; uniform float grain; uniform float hurt; uniform float desat;
    uniform float saturation; uniform float contrast; uniform float gain; uniform vec3 shadowTint; uniform vec3 highTint; uniform float splitK;
    uniform float ca; uniform float zoom; uniform float flash; uniform vec3 flashColor; uniform vec3 tint;
    varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time * 7.13) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      float r = length(d);
      vec3 c;
      if (ca > 0.001) {
        vec2 dir = d / max(r, 1e-4);
        float k = ca * 0.014 * r;
        c = vec3(texture2D(tDiffuse, uv - dir * k).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv + dir * k).b);
      } else {
        c = texture2D(tDiffuse, uv).rgb;
      }
      if (zoom > 0.001) {
        vec3 acc = c;
        for (int i = 1; i < 9; i++) acc += texture2D(tDiffuse, uv - d * zoom * 0.07 * float(i) / 8.0).rgb;
        c = mix(c, acc / 9.0, smoothstep(0.05, 0.45, r));
      }
      c *= gain * tint;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5;
      c += (shadowTint - 0.5) * (1.0 - smoothstep(0.0, 0.45, l)) * 0.1 * splitK;
      c += (highTint - 0.5) * smoothstep(0.45, 1.0, l) * 0.12 * splitK;
      c = mix(c, vec3(l), desat);
      float v = 1.0 - dot(d, d) * vignette;
      c *= clamp(v, 0.0, 1.0);
      c = mix(c, c * vec3(1.5, 0.28, 0.22), hurt * smoothstep(0.1, 0.75, r));
      c = mix(c, flashColor, flash);
      c += (rnd(uv * 900.0) - 0.5) * grain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export const QUALITY = {
  low: { ratio: 0.75, shadows: 0, msaa: 0, bloom: false, rays: false, post: false },
  medium: { ratio: 1, shadows: 1024, msaa: 2, bloom: true, rays: false, post: true },
  high: { ratio: 1.5, shadows: 2048, msaa: 4, bloom: true, rays: true, post: true },
  ultra: { ratio: 2, shadows: 4096, msaa: 4, bloom: true, rays: true, post: true },
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.enabled = true;
    this.q = QUALITY.high;
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    this.rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, this.rt);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.rays = new GodRaysPass();
    this.composer.addPass(this.rays);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.5, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.output = new OutputPass();
    this.composer.addPass(this.output);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.u = this.grade.uniforms;
    this._v = new THREE.Vector3();
    this._fx = { flash: 0, flashDecay: 4, ca: 0, zoom: 0 };
    this.raysStrength = 1;
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
  }

  setQuality(name) {
    const q = QUALITY[name] || QUALITY.high;
    this.q = q;
    this.enabled = q.post;
    this.bloom.enabled = q.bloom;
    this.rays.enabled = q.rays;
    this.composer.renderTarget1.samples = q.msaa;
    this.composer.renderTarget2.samples = q.msaa;
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
  }

  // 章节调色
  setGrade(g = {}) {
    const u = this.u;
    u.saturation.value = g.saturation ?? 1;
    u.contrast.value = g.contrast ?? 1.06;
    u.gain.value = g.gain ?? 1;
    u.shadowTint.value.set(g.shadow ?? 0x1a4070);
    u.highTint.value.set(g.high ?? 0x8a5a20);
    u.splitK.value = g.split ?? 1;
    u.vignette.value = g.vignette ?? 1.1;
    this.bloom.strength = g.bloom ?? 0.5;
    this.raysStrength = g.rays ?? 1;
    this.rays.color.set(g.raysColor ?? 0xbfd0ff);
  }

  flash(color = 0xffffff, amount = 0.6, decay = 4) {
    this.u.flashColor.value.set(color);
    this._fx.flash = Math.max(this._fx.flash, amount);
    this._fx.flashDecay = decay;
  }
  aberrate(v) { this._fx.ca = Math.max(this._fx.ca, v); }
  zoomBlur(v) { this._fx.zoom = Math.max(this._fx.zoom, v); }

  // 月亮在屏幕上的位置 → 体积光强度
  _updateRays(camera) {
    if (!this.q.rays) { this.rays.enabled = false; return; }
    const p = this._v.copy(MOON_DIR).multiplyScalar(300).add(camera.position);
    p.project(camera);
    const behind = p.z > 1;
    const sx = p.x * 0.5 + 0.5, sy = p.y * 0.5 + 0.5;
    const out = Math.max(0, Math.max(-sx, sx - 1, -sy, sy - 1));
    const vis = behind ? 0 : Math.max(0, 1 - out / 0.35);
    this.rays.sun.set(sx, sy);
    this.rays.intensity = vis;
    this.rays.strength = this.raysStrength;
    this.rays.enabled = vis > 0.01;
  }

  setPixelRatio(pr) { this.composer.setPixelRatio(pr); }

  render(scene, camera, dt, noRays = false) {
    const fx = this._fx;
    fx.flash = Math.max(0, fx.flash - dt * fx.flashDecay);
    fx.ca = Math.max(0, fx.ca - dt * 3);
    fx.zoom = Math.max(0, fx.zoom - dt * 3.5);
    if (!this.enabled) { this.renderer.render(scene, camera); return; }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    if (noRays) this.rays.enabled = false; else this._updateRays(camera);
    const u = this.u;
    u.time.value += dt;
    u.flash.value = Math.min(1, fx.flash);
    u.ca.value = fx.ca + u.hurt.value * 0.6;
    u.zoom.value = fx.zoom;
    this.composer.render(dt);
  }
}
