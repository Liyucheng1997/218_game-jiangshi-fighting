import * as THREE from 'three';
import { LITE } from './lite.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getAtlas, getDamask, ATLAS_W, ATLAS_H } from './textures.js';

// =====================================================================
//  程序化蒙皮角色构建器
//  —— 骨骼由代码定义（绑定姿态下骨骼无旋转），网格部件在模型空间搭建后
//     按"刚性 / 关节平滑过渡 / 自定义函数"三种方式自动写入蒙皮权重。
//     因此权重永远正确，动画只需直接旋转骨骼。
//  —— 同一模板的所有实例共享几何体；每实例 2 个 draw call（布料体 + 贴花）。
// =====================================================================

const _v = new THREE.Vector3();
const _c = new THREE.Color();

function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------- 超级材质 v2
// 顶点属性 pbr = (roughness, metalness, emissive, patternMix)，flex = 布料/纸/发丝的柔性权重
// 全局 uniform：时间、月光轮廓光；每实例 uniform：溶解、溶解边缘色、随机种子、腾空（袍摆鼓起）、风速、额外轮廓光
export const UBER_SHARED = {
  uTime: { value: 0 },
  uRimColor: { value: new THREE.Color(0.32, 0.42, 0.68) },
  uRimStrength: { value: 0.55 },
  uMoonView: { value: new THREE.Vector3(0, 1, 0) },
};

export function makeUberUniforms() {
  return {
    uDissolve: { value: 0 },
    uDissolveColor: { value: new THREE.Color(1.0, 0.42, 0.12) },
    uSeed: { value: Math.random() },
    uAir: { value: 0 },
    uWind: { value: 0 },
    uRimExtra: { value: new THREE.Color(0, 0, 0) },
    uPulse: { value: 1 },
  };
}

const UBER_VERT_HEAD = /* glsl */`#include <common>
attribute vec4 pbr;
attribute float flex;
varying vec4 vPbr;
varying vec3 vModelPos;
uniform float uTime; uniform float uSeed; uniform float uAir; uniform float uWind;`;

const UBER_VERT_FLEX = /* glsl */`#include <skinning_vertex>
if ( flex > 0.0 ) {
  float ph = uTime * 5.2 + uSeed * 6.2831;
  vec3 p0 = position;
  float amp = flex * ( 1.0 + uWind );
  transformed.x += sin( ph + p0.y * 11.0 + p0.z * 5.0 ) * 0.016 * amp;
  transformed.z += cos( ph * 0.77 + p0.y * 8.0 + p0.x * 6.0 ) * 0.02 * amp;
  transformed.y += uAir * flex * 0.075;
}`;

const UBER_FRAG_HEAD = /* glsl */`#include <common>
varying vec4 vPbr;
varying vec3 vModelPos;
uniform float uTime; uniform float uDissolve; uniform vec3 uDissolveColor;
uniform vec3 uRimColor; uniform float uRimStrength; uniform vec3 uRimExtra; uniform float uPulse; uniform vec3 uMoonView;
float ubHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float ubNoise( vec3 x ) {
  vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( ubHash( i ), ubHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( ubHash( i + vec3( 0, 1, 0 ) ), ubHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( ubHash( i + vec3( 0, 0, 1 ) ), ubHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( ubHash( i + vec3( 0, 1, 1 ) ), ubHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}`;

const UBER_FRAG_MAP = /* glsl */`
float ubEdge = 0.0;
if ( uDissolve > 0.001 ) {
  float dv = ubNoise( vModelPos * 15.0 ) * 0.5 + ubNoise( vModelPos * 4.5 ) * 0.5;
  dv = dv * 0.82 + ( 1.0 - clamp( vModelPos.y * 0.5, 0.0, 1.0 ) ) * 0.18;
  float cut = uDissolve * 1.12;
  if ( dv < cut ) discard;
  ubEdge = 1.0 - smoothstep( cut, cut + 0.07, dv );
}
#ifdef USE_MAP
  vec4 texelColor = texture2D( map, vMapUv );
  diffuseColor.rgb *= mix( vec3( 1.0 ), texelColor.rgb, vPbr.w );
  diffuseColor.a *= mix( 1.0, texelColor.a, vPbr.w );
#endif`;

const UBER_FRAG_EMIS = /* glsl */`#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * vPbr.z * ( 0.85 + 0.15 * sin( uTime * 4.0 + vModelPos.y * 3.0 ) ) * uPulse;
totalEmissiveRadiance += uDissolveColor * ubEdge * 7.0;`;

const UBER_FRAG_RIM = /* glsl */`{
  float rimF = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );
  float rimLit = 0.2 + 0.8 * saturate( dot( normal, uMoonView ) * 0.8 + 0.2 );
  outgoingLight += uRimColor * uRimStrength * pow( rimF, 3.0 ) * rimLit + uRimExtra * pow( rimF, 2.0 );
}
#include <opaque_fragment>`;

function patchUber(material, perMat) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, UBER_SHARED, perMat);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', UBER_VERT_HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPbr = pbr;\nvModelPos = position;')
      .replace('#include <skinning_vertex>', UBER_VERT_FLEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', UBER_FRAG_HEAD)
      .replace('#include <map_fragment>', UBER_FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vPbr.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vPbr.y;')
      .replace('#include <emissivemap_fragment>', UBER_FRAG_EMIS)
      .replace('#include <opaque_fragment>', UBER_FRAG_RIM);
  };
  material.customProgramCacheKey = () => 'uber-v2' + (material.map ? material.map.uuid : '');
  material.userData.uber = perMat;
  return material;
}

let _base = null;
export function baseMaterials() {
  if (_base) return _base;
  // 一体机头显（LITE）：角色直接用 Lambert —— uber 补丁挂的都是两种材质共有的着色器片段
  const body = patchUber(LITE
    ? new THREE.MeshLambertMaterial({ vertexColors: true, map: getDamask(), side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ vertexColors: true, map: getDamask(), side: THREE.DoubleSide, roughness: 0.8, metalness: 0 }), makeUberUniforms());
  const decal = patchUber(LITE
    ? new THREE.MeshLambertMaterial({ vertexColors: true, map: getAtlas(), side: THREE.DoubleSide, alphaTest: 0.35 })
    : new THREE.MeshStandardMaterial({ vertexColors: true, map: getAtlas(), side: THREE.DoubleSide, alphaTest: 0.35, roughness: 0.7 }), makeUberUniforms());
  _base = { body, decal };
  return _base;
}

// ---------------------------------------------------------------- 构建器
export class RigBuilder {
  constructor(name) {
    this.name = name;
    this.bones = [];
    this.index = {};
    this.parts = { body: [], decal: [] };
  }

  bone(name, parent, x, y, z) {
    this.index[name] = this.bones.length;
    this.bones.push({ name, parent: parent == null ? -1 : this.index[parent], pos: new THREE.Vector3(x, y, z) });
    return this;
  }

  has(name) { return name in this.index; }
  p(name) { return this.bones[this.index[name]].pos.clone(); }

  /**
   * 添加部件
   * opt.bone    刚性绑定骨骼
   * opt.chain   ['boneA', ['boneB', at:Vector3, dir:Vector3, width], ...] 链式平滑过渡
   * opt.weights (v) => [[boneName, w], ...]
   * opt.color / rough / metal / emis / pat
   * opt.decal   atlas 区域 [x,y,w,h]（使用贴花材质，UV 重映射到该区域）
   * opt.uvScale [su, sv] 对布料纹理 UV 缩放
   */
  add(geo, opt = {}) {
    let g = geo.index ? geo : geo;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    if (!g.index) {
      const n = g.getAttribute('position').count;
      const idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      g.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    // 统一属性集合
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.morphAttributes = {};
    const n = g.getAttribute('position').count;
    const pos = g.getAttribute('position');

    // UV
    const uv = g.getAttribute('uv');
    if (opt.decal) {
      const [rx, ry, rw, rh] = opt.decal;
      const inset = 1.5;
      for (let i = 0; i < n; i++) {
        let u = uv.getX(i), v = uv.getY(i);
        if (opt.uvFlipU) u = 1 - u;
        u = Math.min(1, Math.max(0, u)); v = Math.min(1, Math.max(0, v));
        uv.setXY(i, (rx + inset + u * (rw - inset * 2)) / ATLAS_W, 1 - (ry + inset + (1 - v) * (rh - inset * 2)) / ATLAS_H);
      }
    } else if (opt.uvScale) {
      for (let i = 0; i < n; i++) uv.setXY(i, uv.getX(i) * opt.uvScale[0], uv.getY(i) * opt.uvScale[1]);
    }

    // 颜色 & PBR & 柔性
    const col = new Float32Array(n * 3);
    const pbr = new Float32Array(n * 4);
    const flex = new Float32Array(n);
    _c.set(opt.color ?? 0xffffff);
    const colorFn = opt.colorFn;
    const flexFn = typeof opt.flex === 'function' ? opt.flex : null;
    const flexK = typeof opt.flex === 'number' ? opt.flex : 0;
    for (let i = 0; i < n; i++) {
      if (colorFn || flexFn) _v.fromBufferAttribute(pos, i);
      if (colorFn) colorFn(_v, _c);
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      pbr[i * 4] = opt.rough ?? 0.8;
      pbr[i * 4 + 1] = opt.metal ?? 0;
      pbr[i * 4 + 2] = opt.emis ?? 0;
      pbr[i * 4 + 3] = opt.pat ?? (opt.decal ? 1 : 0);
      flex[i] = flexFn ? Math.max(0, flexFn(_v)) : flexK;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('pbr', new THREE.BufferAttribute(pbr, 4));
    g.setAttribute('flex', new THREE.BufferAttribute(flex, 1));

    // 蒙皮
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const tmp = [];
    for (let i = 0; i < n; i++) {
      _v.fromBufferAttribute(pos, i);
      tmp.length = 0;
      if (opt.weights) {
        for (const [b, w] of opt.weights(_v)) if (w > 1e-4) tmp.push([this.index[b], w]);
      } else if (opt.chain) {
        const ch = opt.chain;
        let carry = 1;
        for (let k = 0; k < ch.length; k++) {
          const name = typeof ch[k] === 'string' ? ch[k] : ch[k][0];
          let tNext = 0;
          if (k + 1 < ch.length) {
            const [, at, dir, width] = ch[k + 1];
            const s = _v.clone().sub(at).dot(dir);
            tNext = smooth(-width, width, s);
          }
          const w = carry * (1 - tNext);
          if (w > 1e-4) tmp.push([this.index[name], w]);
          carry *= tNext;
        }
      } else {
        tmp.push([this.index[opt.bone ?? this.bones[0].name], 1]);
      }
      if (tmp.some(([b]) => b === undefined)) throw new Error(`[rig ${this.name}] unknown bone in part`);
      tmp.sort((a, b) => b[1] - a[1]);
      let sum = 0;
      for (let k = 0; k < Math.min(4, tmp.length); k++) sum += tmp[k][1];
      for (let k = 0; k < 4; k++) {
        if (k < tmp.length) { si[i * 4 + k] = tmp[k][0]; sw[i * 4 + k] = tmp[k][1] / sum; }
      }
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    this.parts[opt.decal ? 'decal' : 'body'].push(g);
    return this;
  }

  // 左右对称添加：fn(side) 返回 [geo, opt]；side = 1 为左（+X），-1 为右
  mirror(fn) {
    for (const s of [1, -1]) {
      const r = fn(s, s > 0 ? 'L' : 'R');
      if (Array.isArray(r[0])) r.forEach(([g, o]) => this.add(g, o));
      else this.add(r[0], r[1]);
    }
    return this;
  }

  build(extra = {}) {
    const geos = {};
    for (const k of ['body', 'decal']) {
      if (!this.parts[k].length) continue;
      const m = mergeGeometries(this.parts[k], false);
      if (!m) throw new Error(`[rig ${this.name}] merge failed (${k})`);
      m.computeBoundingBox();
      m.computeBoundingSphere();
      geos[k] = m;
    }
    const inverses = this.bones.map((b) => new THREE.Matrix4().makeTranslation(-b.pos.x, -b.pos.y, -b.pos.z));
    let height = 0;
    for (const k in geos) height = Math.max(height, geos[k].boundingBox.max.y);
    return { name: this.name, bones: this.bones.map((b) => ({ ...b, pos: b.pos.clone() })), inverses, geos, height, ...extra };
  }
}

// ---------------------------------------------------------------- 实例化
export function instantiate(template, { ownMaterials = true, shadows = true } = {}) {
  const root = new THREE.Group();
  root.name = template.name;
  const bones = template.bones.map((b) => { const o = new THREE.Bone(); o.name = b.name; return o; });
  template.bones.forEach((b, i) => {
    if (b.parent < 0) { bones[i].position.copy(b.pos); root.add(bones[i]); }
    else { bones[i].position.copy(b.pos).sub(template.bones[b.parent].pos); bones[b.parent].add(bones[i]); }
  });
  const skeleton = new THREE.Skeleton(bones, template.inverses.map((m) => m.clone()));
  const base = baseMaterials();
  const meshes = [];
  const materials = [];
  // 同一实例的两个材质共享一组 uniform，便于整体控制溶解 / 鼓风 / 轮廓光
  const uber = ownMaterials ? makeUberUniforms() : base.body.userData.uber;
  for (const k of ['body', 'decal']) {
    const geo = template.geos[k];
    if (!geo) continue;
    let mat = base[k];
    if (ownMaterials) {
      mat = base[k].clone();
      patchUber(mat, uber);
    }
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.bind(skeleton, new THREE.Matrix4());
    mesh.frustumCulled = false;
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    root.add(mesh);
    meshes.push(mesh);
    materials.push(mat);
  }
  const map = {};
  bones.forEach((b) => { map[b.name] = b; });
  return { root, bones: map, skeleton, meshes, materials, template, uber };
}

// 用于命中/武器挂点：取骨骼世界坐标
export function boneWorld(bone, out = new THREE.Vector3()) {
  return bone.getWorldPosition(out);
}

export function resetPose(bones) {
  for (const k in bones) bones[k].rotation.set(0, 0, 0);
}
