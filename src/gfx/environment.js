import * as THREE from 'three';
import { MOON_DIR } from './fog.js';

// =====================================================================
//  程序化环境光照（IBL）：按章节氛围绘制一张夜空 + 月晕 + 远处灯火的天球，
//  经 PMREM 预过滤后作为 scene.environment —— 金属、湿石板、铜钱、刀刃
//  由此获得可信的反射与环境漫反射。每种氛围只烘焙一次并缓存。
// =====================================================================

export class EnvLighting {
  constructor(renderer) {
    this.renderer = renderer;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.cache = new Map();
    this.scene = new THREE.Scene();
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color() },
        horizon: { value: new THREE.Color() },
        ground: { value: new THREE.Color() },
        moonDir: { value: MOON_DIR.clone() },
        moonColor: { value: new THREE.Color() },
        moonPower: { value: 1 },
        warm: { value: new THREE.Color(0xff7a30) },
        warmK: { value: 1 },
      },
      vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 moonDir; uniform vec3 moonColor; uniform float moonPower;
        uniform vec3 warm; uniform float warmK;
        varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h > 0.0 ? mix(horizon, top, pow(h, 0.5)) : mix(horizon, ground, pow(-h, 0.35));
          float md = max(dot(d, moonDir), 0.0);
          col += moonColor * (pow(md, 220.0) * 1.4 + pow(md, 28.0) * 0.12 + pow(md, 6.0) * 0.025) * moonPower;
          // 地平线附近零星的暖色灯火（义庄灯笼、香火）
          float az = atan(d.z, d.x);
          float band = exp(-abs(h + 0.02) * 22.0);
          float lamps = pow(max(sin(az * 3.0 + 0.7), 0.0), 18.0) + pow(max(sin(az * 5.0 - 1.3), 0.0), 30.0) * 0.6;
          col += warm * band * lamps * 0.35 * warmK;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), this.mat));
  }

  get(a) {
    const key = [a.skyTop, a.skyHorizon, a.hemiGround, a.moonColor, a.moonLight, a.moonIntensity, a.warmLights ?? 1, a.envGround ?? 0].join(',');
    if (this.cache.has(key)) return this.cache.get(key);
    const u = this.mat.uniforms;
    // 环境天球比实际天空略亮，代表来自天空与雾气的散射
    u.top.value.set(a.skyTop).multiplyScalar(2.2);
    u.horizon.value.set(a.skyHorizon).multiplyScalar(1.6);
    u.ground.value.set(a.envGround ?? a.hemiGround).multiplyScalar(0.9);
    u.moonColor.value.set(a.moonLight);
    u.moonPower.value = a.moonIntensity;
    u.warmK.value = a.warmLights ?? 1;
    const rt = this.pmrem.fromScene(this.scene, 0.015);
    this.cache.set(key, rt.texture);
    return rt.texture;
  }
}
