import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// 暗角 + 胶片颗粒 + 受伤红晕 + 色调分级
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 1.15 }, grain: { value: 0.022 },
    hurt: { value: 0 }, tint: { value: new THREE.Color(1, 1, 1) }, desat: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float vignette; uniform float grain; uniform float hurt; uniform vec3 tint; uniform float desat;
    varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb = mix(c.rgb, vec3(l), desat);
      c.rgb *= tint;
      vec2 d = vUv - 0.5;
      float v = 1.0 - dot(d, d) * vignette;
      c.rgb *= clamp(v, 0.0, 1.0);
      c.rgb = mix(c.rgb, c.rgb * vec3(1.4, 0.35, 0.3), hurt * smoothstep(0.15, 0.7, length(d)));
      c.rgb += (rnd(vUv * 900.0) - 0.5) * grain;
      gl_FragColor = c;
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.enabled = true;
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.45, 0.45, 0.86);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }
  setSize(w, h) { this.composer.setSize(w, h); this.bloom.resolution.set(w / 2, h / 2); }
  setQuality(q) { this.enabled = q !== 'low'; this.bloom.enabled = q === 'high' || q === 'medium'; }
  render(scene, camera, dt) {
    if (!this.enabled) { this.renderer.render(scene, camera); return; }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.grade.uniforms.time.value += dt;
    this.composer.render(dt);
  }
}
