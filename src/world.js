import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture, normalFromHeight, talismanTexture, softDotTexture, flameTexture } from './gfx/textures.js';
import { loft, lathe, roundedBox, tube, V } from './gfx/shapes.js';

export const ARENA_HALF = 36;

// ---------------------------------------------------------------- 纹理
function rnd(seed) { let s = Math.abs(Math.floor(seed)) % 2147483646 + 1; return () => { s = (s * 16807) % 2147483647; return (s % 100000) / 100000; }; }

function stoneTex() {
  const R = rnd(5);
  const h = canvasTexture(512, 512, (g, w, H) => {
    g.fillStyle = '#6a6a6a'; g.fillRect(0, 0, w, H);
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      const y = (r / rows) * H, rh = H / rows;
      let x = -R() * 60;
      while (x < w) {
        const cw = 50 + R() * 70;
        const v = 95 + R() * 45;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x + 3, y + 3, cw - 6, rh - 6);
        for (let i = 0; i < 26; i++) { const nv = v - 25 + R() * 40; g.fillStyle = `rgba(${nv},${nv},${nv},.6)`; g.fillRect(x + 4 + R() * (cw - 10), y + 4 + R() * (rh - 10), 2 + R() * 6, 2 + R() * 4); }
        x += cw;
      }
    }
  }, 1, 1, false);
  const color = canvasTexture(512, 512, (g, w, H) => {
    g.drawImage(h.userData.canvas, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = '#8a9290'; g.fillRect(0, 0, w, H);
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(40,55,35,${R() * 0.25})`; g.beginPath(); g.arc(R() * w, R() * H, 6 + R() * 20, 0, Math.PI * 2); g.fill(); }
  });
  return { map: color, normalMap: normalFromHeight(h.userData.canvas, 3) };
}

function dirtTex() {
  const R = rnd(9);
  const c = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#3e3a2e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { const v = 40 + R() * 40; g.fillStyle = `rgba(${v + 8},${v + 4},${v - 6},.5)`; g.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 3); }
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(50,70,35,${0.2 + R() * 0.3})`; g.beginPath(); g.arc(R() * w, R() * h, 3 + R() * 12, 0, Math.PI * 2); g.fill(); }
  }, 1, 1);
  return { map: c, normalMap: normalFromHeight(c.userData.canvas, 1.5) };
}

function brickTex() {
  const h = canvasTexture(256, 256, (g, w, H) => {
    g.fillStyle = '#404040'; g.fillRect(0, 0, w, H);
    const bh = 16, bw = 48;
    for (let y = 0; y < H; y += bh) {
      const off = ((y / bh) % 2) * bw / 2;
      for (let x = -bw; x < w; x += bw) { const v = 150 + Math.random() * 60; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x + off + 2, y + 2, bw - 4, bh - 4); }
    }
  }, 1, 1, false);
  const c = canvasTexture(256, 256, (g, w, H) => {
    g.drawImage(h.userData.canvas, 0, 0);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = '#6f7a7e'; g.fillRect(0, 0, w, H);
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(30,40,30,${Math.random() * 0.2})`; g.fillRect(Math.random() * w, Math.random() * H, 20 + Math.random() * 40, 10 + Math.random() * 30); }
  });
  return { map: c, normalMap: normalFromHeight(h.userData.canvas, 2.5) };
}

function plasterTex() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#c4bca8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) { const v = 150 + Math.random() * 50; g.fillStyle = `rgba(${v},${v - 5},${v - 16},.3)`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 2 + Math.random() * 4); }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(80,74,60,${0.06 + Math.random() * 0.12})`; const x = Math.random() * w; g.fillRect(x, h - 30 - Math.random() * 90, 8 + Math.random() * 24, 60 + Math.random() * 60); }
    // 剥落露砖
    for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(110,100,90,.6)'; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 18, 6 + Math.random() * 10, Math.random(), 0, Math.PI * 2); g.fill(); }
  });
}

function roofTileTex() {
  const h = canvasTexture(256, 256, (g, w, H) => {
    const cols = 8, rows = 6;
    const cw = w / cols, rh = H / rows;
    for (let c = 0; c < cols; c++) {
      const gr = g.createLinearGradient(c * cw, 0, (c + 1) * cw, 0);
      const up = c % 2 === 0;
      gr.addColorStop(0, up ? '#303030' : '#909090'); gr.addColorStop(0.5, up ? '#f0f0f0' : '#404040'); gr.addColorStop(1, up ? '#303030' : '#909090');
      g.fillStyle = gr; g.fillRect(c * cw, 0, cw, H);
    }
    for (let r = 0; r < rows; r++) { g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, r * rh, w, 3); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(0, r * rh + 3, w, 3); }
  }, 1, 1, false);
  const c = canvasTexture(256, 256, (g, w, H) => {
    g.drawImage(h.userData.canvas, 0, 0);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = '#4a5258'; g.fillRect(0, 0, w, H);
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(40,60,30,${Math.random() * 0.25})`; g.fillRect(Math.random() * w, Math.random() * H, 10 + Math.random() * 30, 6); }
  });
  return { map: c, normalMap: normalFromHeight(h.userData.canvas, 4) };
}

function woodTex(base = '#4a3222') {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(${20 + Math.random() * 30},${12 + Math.random() * 16},6,${0.3 + Math.random() * 0.4})`;
      g.lineWidth = 0.5 + Math.random() * 2;
      const x = Math.random() * w;
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, h * 0.3, x - 6, h * 0.7, x + 3, h); g.stroke();
    }
  });
}

function latticeTex(lit) {
  return canvasTexture(128, 192, (g, w, h) => {
    if (lit) {
      const gr = g.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w * 0.8);
      gr.addColorStop(0, '#ffe8a8'); gr.addColorStop(1, '#c07028');
      g.fillStyle = gr;
    } else g.fillStyle = '#151710';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2a1a0e'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
    g.lineWidth = 4;
    // 冰裂纹窗格
    for (let x = 16; x < w; x += 20) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 16; y < h; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.lineWidth = 3;
    for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(Math.random() * w, Math.random() * h); g.lineTo(Math.random() * w, Math.random() * h); g.stroke(); }
  });
}

function doorTex() {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#3a1c10'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1e0c06'; g.lineWidth = 4;
    g.strokeRect(6, 6, w / 2 - 8, h - 12); g.strokeRect(w / 2 + 2, 6, w / 2 - 8, h - 12);
    g.fillStyle = '#b8902a';
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      g.beginPath(); g.arc(14 + c * 18, 40 + r * 40, 3, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(w / 2 + 14 + c * 18, 40 + r * 40, 3, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = '#c8a040'; g.lineWidth = 3;
    g.beginPath(); g.arc(w / 2 - 12, h / 2, 8, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(w / 2 + 12, h / 2, 8, 0, Math.PI * 2); g.stroke();
    // 门神残符
    g.fillStyle = 'rgba(200,40,30,.8)'; g.fillRect(14, 60, 30, 70); g.fillRect(w - 44, 60, 30, 70);
  });
}

function signTex(text, fg = '#e8d090', bg = '#1c0e06', vertical = false) {
  const W = vertical ? 128 : 512, H = vertical ? 512 : 160;
  return canvasTexture(W, H, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    g.lineWidth = 2; g.strokeRect(16, 16, w - 32, h - 32);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${vertical ? 76 : 88}px "Ma Shan Zheng","KaiTi","STKaiti","SimSun",serif`;
    if (vertical) { const cs = text.split(''); const st = (h - 40) / cs.length; cs.forEach((c, i) => g.fillText(c, w / 2, 20 + st * (i + 0.5))); }
    else g.fillText(text, w / 2, h / 2 + 4);
  });
}

function barkTex() {
  const h = canvasTexture(128, 256, (g, w, H) => {
    g.fillStyle = '#707070'; g.fillRect(0, 0, w, H);
    for (let i = 0; i < 60; i++) { const x = Math.random() * w; g.strokeStyle = `rgba(20,20,20,${0.3 + Math.random() * 0.5})`; g.lineWidth = 1 + Math.random() * 3; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 8, H / 3, x - 8, H * 0.6, x + 4, H); g.stroke(); }
  }, 1, 1, false);
  const c = canvasTexture(128, 256, (g, w, H) => { g.drawImage(h.userData.canvas, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = '#4a3c30'; g.fillRect(0, 0, w, H); });
  return { map: c, normalMap: normalFromHeight(h.userData.canvas, 3) };
}

// ---------------------------------------------------------------- 天空
function makeSky() {
  const geo = new THREE.SphereGeometry(380, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x05070d) }, horizon: { value: new THREE.Color(0x1a2230) },
      moonDir: { value: new THREE.Vector3(-0.5, 0.45, -0.75).normalize() }, moonColor: { value: new THREE.Color(0xf4ecd8) },
      moonSize: { value: 0.035 }, time: { value: 0 }, cloudColor: { value: new THREE.Color(0x2a3040) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 moonDir; uniform vec3 moonColor; uniform float moonSize; uniform float time; uniform vec3 cloudColor;
      varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(horizon, top, pow(max(h,0.0), 0.55));
        // 星
        vec2 sp = d.xz / (d.y + 1.2) * 180.0;
        float st = step(0.9965, hash(floor(sp))) * smoothstep(0.05, 0.3, d.y);
        col += st * 0.8 * vec3(0.8,0.85,1.0);
        // 月亮 + 光晕
        float md = dot(d, moonDir);
        float disk = smoothstep(cos(moonSize * 1.04), cos(moonSize * 0.96), md);
        float crater = fbm(d.xy * 160.0) * 0.28;
        col = mix(col, moonColor * (1.05 - crater), disk);
        col += moonColor * pow(max(md, 0.0), 900.0) * 0.5 + moonColor * pow(max(md,0.0), 40.0) * 0.1;
        // 流云
        vec2 cp = d.xz / max(d.y + 0.15, 0.05) * 1.6 + vec2(time * 0.01, time * 0.004);
        float c = smoothstep(0.45, 0.85, fbm(cp));
        float lit = pow(max(md,0.0), 6.0);
        col = mix(col, cloudColor + moonColor * lit * 0.35, c * 0.75 * smoothstep(0.0, 0.25, d.y));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

// ---------------------------------------------------------------- 曲面屋顶（悬山，带起翘）
function curvedRoof(w, d, rise, overhang, lift, mat, { hip = false } = {}) {
  const hw = w / 2 + overhang, hd = d / 2 + overhang;
  const nx = 24, nt = 10;
  const geos = [];
  for (const sgn of [1, -1]) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= nt; i++) {
      const t = i / nt;          // 0 檐口 → 1 屋脊
      for (let j = 0; j <= nx; j++) {
        const u = j / nx;
        const x = -hw + u * hw * 2;
        const ex = Math.pow(Math.abs(x) / hw, 4);
        const z = sgn * hd * (1 - t) * (1 - (hip ? ex * 0.12 * (1 - t) : 0));
        const y = rise * Math.pow(t, 1.7) + lift * ex * Math.pow(1 - t, 2.2) - (1 - t) * 0.0;
        pos.push(x, y, z);
        uv.push(x / 1.6, t * hd / 1.3);
      }
    }
    for (let i = 0; i < nt; i++) for (let j = 0; j < nx; j++) {
      const a = i * (nx + 1) + j, b = a + nx + 1;
      if (sgn > 0) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(g);
  }
  const roof = new THREE.Mesh(mergeGeometries(geos), mat);
  roof.castShadow = true; roof.receiveShadow = true;
  return roof;
}

// 正脊 + 鸱吻
function ridge(w, y, mat, accent) {
  const g = new THREE.Group();
  const r = new THREE.Mesh(roundedBox(w, 0.34, 0.36, 0.08, 2), mat);
  r.position.y = y + 0.1; r.castShadow = true;
  g.add(r);
  for (const s of [1, -1]) {
    const pts = [V(s * w / 2, y + 0.1, 0), V(s * (w / 2 + 0.25), y + 0.35, 0), V(s * (w / 2 + 0.35), y + 0.75, 0), V(s * (w / 2 + 0.2), y + 0.95, 0)];
    const horn = new THREE.Mesh(tube(pts, (t) => 0.16 * (1 - t * 0.75), 0, 12, 8), accent || mat);
    horn.castShadow = true;
    g.add(horn);
  }
  return g;
}

// ---------------------------------------------------------------- 世界
export class World {
  constructor(scene) {
    this.scene = scene;
    this.obstacles = [];
    this.spawnPoints = [];
    this.animated = [];   // { update(dt,t) }
    this.chapterSets = {};
    this.camBoxes = [];   // 仅用于相机遮挡的体积（屋檐等）
    this.time = 0;
    this.build();
  }

  addObstacleBox(objOrBox, pad = 0) {
    let box;
    if (objOrBox.isBox3) box = objOrBox.clone();
    else { objOrBox.updateWorldMatrix(true, true); box = new THREE.Box3().setFromObject(objOrBox); }
    box.min.x -= pad; box.min.z -= pad; box.max.x += pad; box.max.z += pad;
    this.obstacles.push(box);
    return box;
  }
  boxAt(x, z, w, d, h = 3) {
    return this.addObstacleBox(new THREE.Box3(new THREE.Vector3(x - w / 2, 0, z - d / 2), new THREE.Vector3(x + w / 2, h, z + d / 2)));
  }

  build() {
    const scene = this.scene;
    scene.fog = new THREE.FogExp2(0x0c1018, 0.018);
    this.sky = makeSky();
    this.sky.userData.dynamic = true;
    scene.add(this.sky);
    scene.background = new THREE.Color(0x0c1018);

    this.hemi = new THREE.HemisphereLight(0x8aa0c8, 0x2a2418, 0.75);
    scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0xc8d8ff, 1.35);
    this.moon.position.set(-36, 44, -48);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    const sc = this.moon.shadow.camera;
    sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 1; sc.far = 160;
    this.moon.shadow.bias = -0.0005;
    this.moon.shadow.normalBias = 0.03;
    scene.add(this.moon);
    this.rim = new THREE.DirectionalLight(0xff9a60, 0.25);
    this.rim.position.set(30, 10, 40);
    scene.add(this.rim);

    const stone = stoneTex(), dirt = dirtTex(), brick = brickTex(), roof = roofTileTex(), bark = barkTex();
    stone.map.repeat.set(10, 10); stone.normalMap.repeat.set(10, 10);
    dirt.map.repeat.set(24, 24); dirt.normalMap.repeat.set(24, 24);
    this.mats = {
      stoneFloor: new THREE.MeshStandardMaterial({ map: stone.map, normalMap: stone.normalMap, roughness: 0.92, normalScale: new THREE.Vector2(0.8, 0.8) }),
      dirt: new THREE.MeshStandardMaterial({ map: dirt.map, normalMap: dirt.normalMap, roughness: 1 }),
      brick: new THREE.MeshStandardMaterial({ map: brick.map, normalMap: brick.normalMap, roughness: 0.95 }),
      plaster: new THREE.MeshStandardMaterial({ map: plasterTex(), roughness: 0.95 }),
      roof: new THREE.MeshStandardMaterial({ map: roof.map, normalMap: roof.normalMap, roughness: 0.75, side: THREE.DoubleSide }),
      roofDark: new THREE.MeshStandardMaterial({ color: 0x2a2e32, roughness: 0.8 }),
      wood: new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 0.85 }),
      darkWood: new THREE.MeshStandardMaterial({ map: woodTex('#2a1a10'), roughness: 0.85 }),
      red: new THREE.MeshStandardMaterial({ map: woodTex('#7a1810'), roughness: 0.6 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x6e706c, roughness: 0.9, map: stone.map }),
      bronze: new THREE.MeshStandardMaterial({ color: 0x5a4a2a, metalness: 0.8, roughness: 0.45 }),
      coffin: new THREE.MeshStandardMaterial({ map: woodTex('#3a1c10'), color: 0xc0a090, roughness: 0.55 }),
      bark: new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, roughness: 0.95 }),
      lantern: new THREE.MeshStandardMaterial({ color: 0xd02018, emissive: 0xff2a10, emissiveIntensity: 1.6, roughness: 0.6 }),
      lanternW: new THREE.MeshStandardMaterial({ color: 0xf0e8d0, emissive: 0xffe0a0, emissiveIntensity: 1.2, roughness: 0.6 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 0.9, roughness: 0.35 }),
      candle: new THREE.MeshBasicMaterial({ color: 0xffd080 }),
      talisman: new THREE.MeshStandardMaterial({ map: talismanTexture(64, 160), roughness: 0.9, side: THREE.DoubleSide }),
    };

    // 地面：中央青石广场 + 外圈泥地
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), this.mats.dirt);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_HALF * 2 - 8, ARENA_HALF * 2 - 8), this.mats.stoneFloor);
    plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.01;
    plaza.receiveShadow = true;
    scene.add(plaza);
    // 石板路边沿
    const curb = new THREE.Mesh(new THREE.BoxGeometry(ARENA_HALF * 2 - 7.6, 0.08, 0.4), this.mats.stone);
    for (const [x, z, ry] of [[0, ARENA_HALF - 4, 0], [0, -ARENA_HALF + 4, 0], [ARENA_HALF - 4, 0, Math.PI / 2], [-ARENA_HALF + 4, 0, Math.PI / 2]]) {
      const c = curb.clone(); c.position.set(x, 0.04, z); c.rotation.y = ry; c.receiveShadow = true; scene.add(c);
    }

    this.buildPerimeter();
    this.buildHall(0, -ARENA_HALF + 6.5);
    this.buildPaifang(0, ARENA_HALF - 1.5);
    this.buildHouse(-ARENA_HALF + 6, -12, 10, 7, Math.PI / 2);
    this.buildHouse(-ARENA_HALF + 6, 12, 10, 7, Math.PI / 2);
    this.buildHouse(ARENA_HALF - 6, 14, 10, 7, -Math.PI / 2);
    this.buildGraveyard(ARENA_HALF - 10, -ARENA_HALF + 10);
    this.buildIncenseBurner(0, -18);
    this.buildWell(18, 22);
    for (const [x, z, r] of [[-8, -8, 0.4], [9, 6, 2.1], [-12, 18, 1.2], [14, -6, -0.3], [-18, -24, 0.9], [4, 24, 1.8]]) this.buildCoffin(x, z, r);
    for (const [x, z] of [[-10, -12], [10, -12], [-10, 12], [10, 12]]) this.buildStoneLantern(x, z);
    for (const [x, z, s] of [[-24, -27, 1.3], [26, 26, 1.1], [-26, 27, 1.0], [27, -4, 0.9]]) this.buildDeadTree(x, z, s);
    for (const [x, z, r] of [[-20, 4, 0.2], [22, 2, 1.0], [-4, 16, 0.5], [16, -20, 1.3], [-22, -4, 0.7]]) this.buildCrates(x, z, r);
    for (const [x, z] of [[-15, -22], [15, 18], [-20, 22], [24, -12]]) this.buildJar(x, z);
    for (const [x, z, ry] of [[-5, ARENA_HALF - 5, 0], [5, ARENA_HALF - 5, 0]]) this.buildLanternPole(x, z, ry);
    this.buildPaperMoney();
    this.buildOuterScenery();
    this.buildMist();
    this.buildGhostFires();
    this.buildBamboo();      // 第二章专属
    this.buildEmbers();      // 第三章专属

    this.bakeStatic();

    const S = ARENA_HALF - 3;
    this.spawnPoints = [
      new THREE.Vector3(0, 0, S - 1), new THREE.Vector3(-6, 0, S - 2), new THREE.Vector3(6, 0, S - 2),
      new THREE.Vector3(S - 3, 0, -S + 4), new THREE.Vector3(S - 8, 0, -S + 3), new THREE.Vector3(S - 3, 0, -S + 9),
      new THREE.Vector3(-S + 1, 0, 0), new THREE.Vector3(S - 1, 0, 0), new THREE.Vector3(-S + 3, 0, S - 3),
      new THREE.Vector3(S - 3, 0, S - 4), new THREE.Vector3(-S + 3, 0, -S + 3), new THREE.Vector3(-12, 0, -S + 12),
      new THREE.Vector3(12, 0, -S + 12),
    ];
  }

  // ---------------- 围墙
  buildPerimeter() {
    const L = ARENA_HALF, H = 3.6, T = 0.9;
    const wm = this.mats.brick.map.clone(), wn = this.mats.brick.normalMap.clone();
    wm.repeat.set(16, 1); wn.repeat.set(16, 1);
    wm.needsUpdate = wn.needsUpdate = true;
    this.wallMat = new THREE.MeshStandardMaterial({ map: wm, normalMap: wn, roughness: 0.95 });
    const wallSeg = (len, x, z, ry) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, H, T), this.wallMat);
      m.position.y = H / 2; m.castShadow = m.receiveShadow = true;
      g.add(m);
      const cap = curvedRoof(len, T, 0.35, 0.35, 0.0, this.mats.roof);
      cap.position.y = H; g.add(cap);
      const rid = new THREE.Mesh(new THREE.BoxGeometry(len + 0.2, 0.16, 0.2), this.mats.roofDark);
      rid.position.y = H + 0.42; g.add(rid);
      g.position.set(x, 0, z); g.rotation.y = ry;
      this.scene.add(g);
      const box = new THREE.Box3();
      if (Math.abs(Math.sin(ry)) < 0.5) box.set(new THREE.Vector3(x - len / 2, 0, z - T / 2), new THREE.Vector3(x + len / 2, H, z + T / 2));
      else box.set(new THREE.Vector3(x - T / 2, 0, z - len / 2), new THREE.Vector3(x + T / 2, H, z + len / 2));
      this.obstacles.push(box);
    };
    const full = L * 2 + T * 2;
    wallSeg(full, 0, -L - T / 2, 0);
    // 南墙中间留牌坊门
    const gap = 7;
    const segLen = (full - gap) / 2;
    wallSeg(segLen, -(gap / 2 + segLen / 2), L + T / 2, 0);
    wallSeg(segLen, gap / 2 + segLen / 2, L + T / 2, 0);
    wallSeg(L * 2, -L - T / 2, 0, Math.PI / 2);
    wallSeg(L * 2, L + T / 2, 0, Math.PI / 2);
    // 墙上贴符
    for (let i = 0; i < 16; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.7), this.mats.talisman);
      const side = i % 4;
      const k = (Math.floor(i / 4) - 1.5) * 14 + (Math.random() - 0.5) * 4;
      const off = L - 0.02;
      if (side === 0) { f.position.set(k, 1.8, -off); }
      else if (side === 1) { f.position.set(-off, 1.8, k); f.rotation.y = Math.PI / 2; }
      else if (side === 2) { f.position.set(off, 1.8, k); f.rotation.y = -Math.PI / 2; }
      else { if (Math.abs(k) < 5) continue; f.position.set(k, 1.8, off); f.rotation.y = Math.PI; }
      f.rotation.z = (Math.random() - 0.5) * 0.2;
      this.scene.add(f);
    }
    // 围墙外的挡板（阻止越界）
    this.bounds = L - 0.2;
  }

  // ---------------- 义庄大殿
  buildHall(x, z) {
    const g = new THREE.Group();
    const W = 16, D = 8, H = 4.4, baseH = 0.55;
    // 台基
    const base = new THREE.Mesh(new THREE.BoxGeometry(W + 1.6, baseH, D + 2.6), this.mats.stone);
    base.position.set(0, baseH / 2, 0.5); base.receiveShadow = true; base.castShadow = true; g.add(base);
    // 台阶
    for (let i = 0; i < 3; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(5, baseH / 3, 0.45), this.mats.stone);
      st.position.set(0, baseH / 6 + (i * baseH) / 3, D / 2 + 1.8 + 0.45 * (2 - i) - 0.2);
      st.receiveShadow = true; g.add(st);
    }
    // 墙体（后、侧）
    const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.4), this.mats.plaster);
    back.position.set(0, baseH + H / 2, -D / 2); back.castShadow = back.receiveShadow = true; g.add(back);
    for (const s of [1, -1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.4, H, D), this.mats.plaster);
      side.position.set(s * W / 2, baseH + H / 2, 0); side.castShadow = true; g.add(side);
    }
    // 正面：隔扇门（半开）+ 暗室
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, H), new THREE.MeshBasicMaterial({ color: 0x050302 }));
    inner.position.set(0, baseH + H / 2, -D / 2 + 0.25); g.add(inner);
    const doorMat = new THREE.MeshStandardMaterial({ map: latticeTex(false), roughness: 0.8 });
    const litMat = new THREE.MeshStandardMaterial({ map: latticeTex(true), emissive: 0xffa040, emissiveIntensity: 0.9, emissiveMap: latticeTex(true), roughness: 0.8 });
    for (let i = 0; i < 8; i++) {
      const px = -W / 2 + 1 + i * ((W - 2) / 7);
      if (Math.abs(px) < 2.5) continue;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.7, H - 0.6, 0.08), i % 3 === 1 ? litMat : doorMat);
      panel.position.set(px, baseH + (H - 0.6) / 2, D / 2 - 0.6);
      g.add(panel);
    }
    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(W, 0.6, 0.3), this.mats.darkWood);
    frontWall.position.set(0, baseH + H - 0.3, D / 2 - 0.6); g.add(frontWall);
    // 檐柱
    for (let i = 0; i < 6; i++) {
      const px = -W / 2 + 0.4 + i * ((W - 0.8) / 5);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, H, 14), this.mats.red);
      col.position.set(px, baseH + H / 2, D / 2 + 0.6); col.castShadow = true; g.add(col);
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.25, 12), this.mats.stone);
      plinth.position.set(px, baseH + 0.12, D / 2 + 0.6); g.add(plinth);
      // 斗拱
      const brk = new THREE.Mesh(roundedBox(0.6, 0.25, 0.6, 0.05), this.mats.darkWood);
      brk.position.set(px, baseH + H + 0.1, D / 2 + 0.6); g.add(brk);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.4, 0.35), this.mats.red);
    beam.position.set(0, baseH + H - 0.1, D / 2 + 0.6); g.add(beam);
    // 彩绘额枋
    const paint = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.35), new THREE.MeshStandardMaterial({ map: canvasTexture(512, 32, (gg, w, h) => {
      gg.fillStyle = '#1a3a5a'; gg.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 64) { gg.fillStyle = '#2a7a6a'; gg.beginPath(); gg.ellipse(x + 32, h / 2, 26, 10, 0, 0, Math.PI * 2); gg.fill(); gg.strokeStyle = '#e0c060'; gg.lineWidth = 2; gg.stroke(); }
    }), roughness: 0.7 }));
    paint.position.set(0, baseH + H - 0.1, D / 2 + 0.78); g.add(paint);
    // 屋顶
    const r = curvedRoof(W + 0.4, D + 1.4, 2.6, 1.3, 0.8, this.mats.roof, { hip: true });
    r.position.set(0, baseH + H + 0.2, 0.3); g.add(r);
    g.add(Object.assign(ridge(W + 0.2, baseH + H + 2.8, this.mats.roofDark, this.mats.roofDark), {}));
    // 山墙封板
    for (const s of [1, -1]) {
      const tri = new THREE.Shape();
      tri.moveTo(-(D + 1.4) / 2, 0); tri.lineTo((D + 1.4) / 2, 0); tri.lineTo(0, 2.6); tri.closePath();
      const tg = new THREE.Mesh(new THREE.ShapeGeometry(tri), this.mats.plaster);
      tg.rotation.y = Math.PI / 2; tg.position.set(s * (W / 2 + 0.15), baseH + H + 0.2, 0.3);
      tg.material.side = THREE.DoubleSide;
      g.add(tg);
    }
    // 匾额「義莊」
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.1), new THREE.MeshStandardMaterial({ map: signTex('義 莊', '#f0d070', '#1a0a04'), roughness: 0.5, emissive: 0x3a2000, emissiveIntensity: 0.4 }));
    plaque.position.set(0, baseH + H + 0.55, D / 2 + 0.85); plaque.rotation.x = -0.12; g.add(plaque);
    // 楹联
    for (const [s, txt] of [[1, '陰陽兩隔路'], [-1, '生死一線天']]) {
      const cp = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.6), new THREE.MeshStandardMaterial({ map: signTex(txt, '#e8c060', '#6a0e08', true), roughness: 0.6 }));
      cp.position.set(s * 2.2, baseH + 2.2, D / 2 + 0.85); g.add(cp);
    }
    // 殿内：灵台、牌位、蜡烛、停棺
    const altar = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.0, 1.0), this.mats.darkWood);
    altar.position.set(0, baseH + 0.5, -D / 2 + 1.2); g.add(altar);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshStandardMaterial({ color: 0x8a1010, roughness: 0.9 }));
    cloth.position.set(0, baseH + 0.5, -D / 2 + 1.71); g.add(cloth);
    for (let i = 0; i < 7; i++) {
      const tab = new THREE.Mesh(roundedBox(0.28, 0.7 - Math.abs(i - 3) * 0.06, 0.06, 0.02), this.mats.darkWood);
      tab.position.set((i - 3) * 0.45, baseH + 1.35, -D / 2 + 1.0); g.add(tab);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.5), new THREE.MeshBasicMaterial({ color: 0xb09040 }));
      face.position.set((i - 3) * 0.45, baseH + 1.35, -D / 2 + 1.035); g.add(face);
    }
    for (const s of [1, -1]) {
      const cnd = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35, 8), new THREE.MeshStandardMaterial({ color: 0xc81818 }));
      cnd.position.set(s * 1.5, baseH + 1.18, -D / 2 + 1.4); g.add(cnd);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), this.mats.candle);
      fl.scale.y = 1.8; fl.position.set(s * 1.5, baseH + 1.42, -D / 2 + 1.4); fl.userData.dynamic = true; g.add(fl);
      this.animated.push({ update: (dt, t) => { fl.scale.y = 1.6 + Math.sin(t * 13 + s) * 0.3; } });
    }
    const altarLight = new THREE.PointLight(0xffa040, 18, 12, 1.8);
    altarLight.position.set(0, baseH + 1.8, -D / 2 + 2.2); g.add(altarLight);
    this.animated.push({ update: (dt, t) => { altarLight.intensity = 16 + Math.sin(t * 9) * 2 + Math.sin(t * 23) * 1.5; } });
    for (const s of [1, -1]) {
      const cf = this.makeCoffin();
      cf.position.set(s * 4.5, baseH, -D / 2 + 2.2); cf.rotation.y = Math.PI / 2; g.add(cf);
      const cf2 = this.makeCoffin();
      cf2.position.set(s * 6.2, baseH, -D / 2 + 2.2); cf2.rotation.y = Math.PI / 2; g.add(cf2);
    }
    // 檐下灯笼
    for (const px of [-5.5, 5.5, -2.2, 2.2]) this.addLantern(g, px, baseH + H - 0.55, D / 2 + 1.0, Math.abs(px) > 3, Math.abs(px) < 3);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.boxAt(x, z + 0.5, W + 1.6, D + 2.6, baseH + H);
    this.camBoxes.push(new THREE.Box3(new THREE.Vector3(x - W / 2 - 1.6, baseH + H - 0.4, z - D / 2 - 1.6), new THREE.Vector3(x + W / 2 + 1.6, baseH + H + 3, z + D / 2 + 2.4)));
  }

  // ---------------- 牌坊
  buildPaifang(x, z) {
    const g = new THREE.Group();
    const cols = [-3.6, -1.4, 1.4, 3.6];
    for (const px of cols) {
      const h = Math.abs(px) > 2 ? 5.2 : 6.6;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, h, 12), this.mats.red);
      c.position.set(px, h / 2, 0); c.castShadow = true; g.add(c);
      const b = new THREE.Mesh(roundedBox(0.9, 0.9, 1.2, 0.08), this.mats.stone);
      b.position.set(px, 0.45, 0); b.castShadow = true; g.add(b);
      if (Math.abs(px) > 2) this.boxAt(x + px, z, 1, 1.3, 5);
    }
    const beam = (w, y, px) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, 0.5), this.mats.red); m.position.set(px, y, 0); m.castShadow = true; g.add(m); };
    beam(3.4, 5.9, 0); beam(3.2, 4.6, -2.5); beam(3.2, 4.6, 2.5);
    const topR = curvedRoof(3.6, 1.1, 0.7, 0.6, 0.35, this.mats.roof);
    topR.position.set(0, 6.6, 0); g.add(topR);
    g.add(ridge(3.4, 7.3, this.mats.roofDark));
    for (const s of [1, -1]) {
      const r2 = curvedRoof(2.6, 1.0, 0.55, 0.5, 0.3, this.mats.roof);
      r2.position.set(s * 2.6, 5.2, 0); g.add(r2);
      const rr = ridge(2.4, 5.75, this.mats.roofDark); rr.position.x = s * 2.6; g.add(rr);
    }
    for (const face of [1, -1]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.8), new THREE.MeshStandardMaterial({ map: signTex(face > 0 ? '鎮 邪' : '義 莊', '#f0d070', '#1a0a04'), roughness: 0.5 }));
      pl.position.set(0, 5.25, face * 0.27); if (face < 0) pl.rotation.y = Math.PI; g.add(pl);
    }
    this.addLantern(g, -1.4, 4.1, 0.35, true);
    this.addLantern(g, 1.4, 4.1, 0.35, false);
    g.position.set(x, 0, z);
    this.scene.add(g);
  }

  // ---------------- 民居
  buildHouse(x, z, w, d, ry) {
    const g = new THREE.Group();
    const H = 3.2;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.7, d + 0.3), this.mats.brick);
    base.position.y = 0.35; base.receiveShadow = true; g.add(base);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), this.mats.plaster);
    body.position.y = H / 2 + 0.1; body.castShadow = body.receiveShadow = true; g.add(body);
    // 木构架外露
    for (let i = 0; i <= 4; i++) {
      const px = -w / 2 + (i / 4) * w;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, H, 0.22), this.mats.darkWood);
      post.position.set(px, H / 2 + 0.1, d / 2 + 0.02); g.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, 0.25), this.mats.darkWood);
    lintel.position.set(0, H - 0.1, d / 2 + 0.03); g.add(lintel);
    // 门窗
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.3), new THREE.MeshStandardMaterial({ map: doorTex(), roughness: 0.8 }));
    door.position.set(0, 1.25, d / 2 + 0.06); g.add(door);
    const lit = new THREE.MeshStandardMaterial({ map: latticeTex(true), emissiveMap: latticeTex(true), emissive: 0xffa040, emissiveIntensity: 1.0 });
    const dark = new THREE.MeshStandardMaterial({ map: latticeTex(false), roughness: 0.8 });
    for (const px of [-w / 3, w / 3]) {
      const on = Math.random() < 0.55;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.3), on ? lit : dark);
      win.position.set(px, 1.8, d / 2 + 0.06); g.add(win);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.2), this.mats.darkWood);
      sill.position.set(px, 1.1, d / 2 + 0.1); g.add(sill);
    }
    // 对联 & 门楣符
    for (const s of [1, -1]) {
      const cp = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 1.6), new THREE.MeshStandardMaterial({ map: signTex(s > 0 ? '平安' : '驅邪', '#e8c060', '#7a1008', true) }));
      cp.position.set(s * 1.05, 1.3, d / 2 + 0.07); g.add(cp);
    }
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.6), this.mats.talisman);
    f.position.set(0, 2.62, d / 2 + 0.07); g.add(f);
    // 曲面屋顶 + 正脊
    const roof = curvedRoof(w, d, 1.9, 0.9, 0.55, this.mats.roof);
    roof.position.y = H + 0.1; g.add(roof);
    g.add(ridge(w + 0.4, H + 2.0, this.mats.roofDark));
    for (const s of [1, -1]) {
      const tri = new THREE.Shape();
      tri.moveTo(-d / 2 - 0.2, 0); tri.lineTo(d / 2 + 0.2, 0); tri.lineTo(0, 1.9); tri.closePath();
      const tg = new THREE.Mesh(new THREE.ShapeGeometry(tri), this.mats.plaster);
      tg.material = this.mats.plaster;
      tg.rotation.y = Math.PI / 2; tg.position.set(s * (w / 2 - 0.02), H + 0.1, 0);
      const tg2 = tg.clone(); tg2.rotation.y = -Math.PI / 2;
      g.add(tg, tg2);
    }
    this.addLantern(g, -w / 2 + 1.0, H - 0.4, d / 2 + 0.7, true);
    this.addLantern(g, w / 2 - 1.0, H - 0.4, d / 2 + 0.7, false);
    // 檐下杂物：竹竿晾晒的纸钱、箩筐
    const basket = new THREE.Mesh(lathe([[0.01, 0], [0.4, 0.02], [0.48, 0.35], [0.5, 0.4]], 16), this.mats.wood);
    basket.position.set(w / 2 - 1.2, 0.7, d / 2 + 0.9); g.add(basket);
    g.position.set(x, 0, z); g.rotation.y = ry;
    this.scene.add(g);
    const sw = Math.abs(Math.sin(ry)) > 0.5;
    this.boxAt(x, z, sw ? d + 0.4 : w + 0.4, sw ? w + 0.4 : d + 0.4, H);
    const rw = (sw ? d : w) + 2.2, rd = (sw ? w : d) + 2.2;
    this.camBoxes.push(new THREE.Box3(new THREE.Vector3(x - rw / 2, H - 0.3, z - rd / 2), new THREE.Vector3(x + rw / 2, H + 2.2, z + rd / 2)));
  }

  // 灯笼（可选点光源）
  addLantern(parent, x, y, z, withLight = false, white = false) {
    const lg = new THREE.Group();
    const body = new THREE.Mesh(lathe([[0.1, -0.3], [0.28, -0.2], [0.34, 0], [0.28, 0.2], [0.1, 0.3]], 16), white ? this.mats.lanternW : this.mats.lantern);
    lg.add(body);
    for (let i = 0; i < 8; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.008, 4, 16, Math.PI), this.mats.darkWood);
      rib.rotation.set(0, (i / 8) * Math.PI, Math.PI / 2);
      rib.scale.set(0.95, 0.95, 1);
      lg.add(rib);
    }
    for (const yy of [0.32, -0.32]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12), this.mats.darkWood);
      cap.position.y = yy; lg.add(cap);
    }
    const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0xd8b030, roughness: 0.7 }));
    tassel.position.y = -0.5; tassel.rotation.x = Math.PI; lg.add(tassel);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), this.mats.darkWood);
    str.position.y = 0.55; lg.add(str);
    if (white) {
      const tx = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: signTex('奠', '#111', '#f0e8d0'), transparent: true, opacity: 0.9 }));
      tx.position.z = 0.335; lg.add(tx);
    }
    lg.position.set(x, y, z);
    lg.userData.dynamic = true;
    parent.add(lg);
    const seed = Math.random() * 10;
    this.animated.push({ update: (dt, t) => { lg.rotation.z = Math.sin(t * 1.3 + seed) * 0.06; lg.rotation.x = Math.sin(t * 0.9 + seed) * 0.04; } });
    if (withLight) {
      const l = new THREE.PointLight(white ? 0xffe0b0 : 0xff5a28, 9, 10, 1.8);
      l.position.set(x, y - 0.1, z + 0.3);
      parent.add(l);
      this.animated.push({ update: (dt, t) => { l.intensity = 8.5 + Math.sin(t * 7 + seed) * 0.8; } });
    }
  }

  buildLanternPole(x, z) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.6, 8), this.mats.darkWood);
    pole.position.set(x, 2.3, z); pole.castShadow = true; this.scene.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), this.mats.darkWood);
    arm.position.set(x + 0.5, 4.3, z); this.scene.add(arm);
    const grp = new THREE.Group(); this.scene.add(grp);
    this.addLantern(grp, x + 1.0, 3.7, z, false, true);
    this.addObstacleBox(pole, 0.1);
  }

  makeCoffin() {
    const g = new THREE.Group();
    // 前高后低的中式棺
    const shape = new THREE.Shape();
    shape.moveTo(-1.1, 0); shape.lineTo(1.1, 0); shape.lineTo(1.12, 0.62); shape.quadraticCurveTo(0, 0.78, -1.15, 0.92); shape.closePath();
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.72, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2 }), this.mats.coffin);
    body.geometry.translate(0, 0, -0.36);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    const lid = new THREE.Mesh(roundedBox(2.4, 0.14, 0.9, 0.05, 2), this.mats.coffin);
    lid.position.set(0, 0.88, 0); lid.rotation.z = -0.06; lid.castShadow = true; g.add(lid);
    const head = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.7), new THREE.MeshStandardMaterial({ map: signTex('壽', '#e0b040', '#5a0a06'), roughness: 0.6 }));
    head.position.set(-1.19, 0.5, 0); head.rotation.y = -Math.PI / 2; g.add(head);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.55), this.mats.talisman);
    f.position.set(0.2, 0.97, 0.2); f.rotation.x = -Math.PI / 2; f.rotation.z = 0.3; g.add(f);
    // 墨斗线
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.95), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
      l.position.set(-0.8 + i * 0.5, 0.965, 0); g.add(l);
    }
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.9), this.mats.darkWood);
    for (const bx of [-0.8, 0.8]) { const b = bench.clone(); b.position.set(bx, -0.17, 0); g.add(b); }
    g.children.forEach((c) => { if (c !== head) c.position.y += 0.35; });
    head.position.y += 0.35;
    return g;
  }

  buildCoffin(x, z, ry) {
    const c = this.makeCoffin();
    c.position.set(x, 0, z); c.rotation.y = ry;
    this.scene.add(c);
    this.addObstacleBox(c, 0.02);
  }

  buildStoneLantern(x, z) {
    const g = new THREE.Group();
    const parts = [
      [new THREE.CylinderGeometry(0.42, 0.5, 0.3, 8), 0.15],
      [new THREE.CylinderGeometry(0.16, 0.22, 1.0, 8), 0.8],
      [new THREE.CylinderGeometry(0.4, 0.3, 0.16, 8), 1.36],
    ];
    for (const [geo, y] of parts) { const m = new THREE.Mesh(geo, this.mats.stone); m.position.y = y; m.castShadow = true; g.add(m); }
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.46, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0x5a5c58, roughness: 0.9, side: THREE.DoubleSide, alphaTest: 0.5, map: canvasTexture(64, 64, (gg) => { gg.fillStyle = '#fff'; gg.fillRect(0, 0, 64, 64); gg.clearRect(14, 10, 36, 44); }) }));
    cage.position.y = 1.67; g.add(cage);
    const fire = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc070 }));
    fire.position.y = 1.62; fire.scale.y = 1.4; fire.userData.dynamic = true; g.add(fire);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.58, 0.45, 6), this.mats.stone);
    roof.position.y = 2.1; roof.castShadow = true; g.add(roof);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), this.mats.stone);
    knob.position.y = 2.38; g.add(knob);
    g.position.set(x, 0, z);
    this.scene.add(g);
    const l = new THREE.PointLight(0xffb060, 10, 12, 1.8);
    l.position.set(x, 1.7, z); this.scene.add(l);
    const seed = x * 3.1 + z;
    this.animated.push({ update: (dt, t) => { l.intensity = 9 + Math.sin(t * 11 + seed) * 1.2; fire.scale.y = 1.3 + Math.sin(t * 15 + seed) * 0.15; } });
    this.addObstacleBox(new THREE.Box3(new THREE.Vector3(x - 0.5, 0, z - 0.5), new THREE.Vector3(x + 0.5, 2.4, z + 0.5)));
  }

  buildIncenseBurner(x, z) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(lathe([[0.01, 0.5], [0.9, 0.55], [1.05, 0.9], [1.0, 1.35], [1.15, 1.45], [1.1, 1.5]], 24), this.mats.bronze);
    body.castShadow = true; g.add(body);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(tube([V(Math.cos(a) * 0.7, 0.6, Math.sin(a) * 0.7), V(Math.cos(a) * 0.85, 0.3, Math.sin(a) * 0.85), V(Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8)], 0.1, 0.13, 8, 8), this.mats.bronze);
      g.add(leg);
    }
    for (const s of [1, -1]) {
      const ear = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 12, Math.PI), this.mats.bronze);
      ear.position.set(s * 0.95, 1.5, 0); ear.rotation.y = Math.PI / 2; g.add(ear);
    }
    // 香
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 4), new THREE.MeshStandardMaterial({ color: 0x8a2a1a }));
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.5;
      s.position.set(Math.cos(a) * r, 1.75, Math.sin(a) * r); s.rotation.set((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3);
      g.add(s);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), new THREE.MeshBasicMaterial({ color: 0xff6020 }));
      tip.position.set(s.position.x, 2.1, s.position.z); g.add(tip);
    }
    // 袅袅青烟
    const smokeTex = softDotTexture('rgba(200,200,210,0.5)', 'rgba(200,200,210,0)');
    const puffs = [];
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0.3 }));
      sp.userData.t = i / 14;
      g.add(sp); puffs.push(sp);
    }
    this.animated.push({ update: (dt, t) => {
      for (const p of puffs) {
        p.userData.t = (p.userData.t + dt * 0.12) % 1;
        const k = p.userData.t;
        p.position.set(Math.sin(k * 6 + t * 0.5) * 0.3 * k, 2.1 + k * 4.5, Math.cos(k * 5) * 0.2 * k);
        p.scale.setScalar(0.3 + k * 2.2);
        p.material.opacity = 0.35 * Math.sin(k * Math.PI);
      }
    } });
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.boxAt(x, z, 2.2, 2.2, 1.6);
  }

  buildWell(x, z) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(lathe([[0.75, 0], [0.95, 0], [0.95, 0.85], [0.75, 0.85]], 20), this.mats.stone);
    ring.castShadow = true; g.add(ring);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.75, 20), new THREE.MeshStandardMaterial({ color: 0x051010, roughness: 0.05, metalness: 0.6 }));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.5; g.add(water);
    for (const s of [1, -1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.2, 0.14), this.mats.darkWood);
      p.position.set(s * 0.9, 1.1, 0); g.add(p);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.0, 8), this.mats.wood);
    bar.rotation.z = Math.PI / 2; bar.position.y = 1.9; g.add(bar);
    const roof = curvedRoof(2.2, 1.2, 0.5, 0.3, 0.2, this.mats.roof);
    roof.position.y = 2.2; roof.rotation.y = Math.PI / 2; g.add(roof);
    const bucket = new THREE.Mesh(lathe([[0.001, 0], [0.18, 0], [0.22, 0.3]], 12), this.mats.wood);
    bucket.position.set(1.3, 0, 0.6); g.add(bucket);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.boxAt(x, z, 2.1, 2.0, 1);
  }

  buildJar(x, z) {
    const jar = new THREE.Mesh(lathe([[0.001, 0], [0.4, 0.02], [0.6, 0.4], [0.62, 0.7], [0.45, 1.0], [0.42, 1.08]], 18), new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.35 }));
    jar.position.set(x, 0, z); jar.castShadow = jar.receiveShadow = true;
    this.scene.add(jar);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.06, 16), this.mats.wood);
    lid.position.set(x, 1.1, z); this.scene.add(lid);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.5), this.mats.talisman);
    f.position.set(x, 0.75, z + 0.6); f.rotation.x = -0.15; this.scene.add(f);
    this.addObstacleBox(jar);
  }

  buildCrates(x, z, ry) {
    const g = new THREE.Group();
    const mk = (px, py, pz, s = 1.1, r = 0) => {
      const c = new THREE.Mesh(roundedBox(s, s, s, 0.04, 2), this.mats.wood);
      c.position.set(px, py + s / 2, pz); c.rotation.y = r; c.castShadow = c.receiveShadow = true; g.add(c);
      const band = new THREE.Mesh(new THREE.BoxGeometry(s + 0.02, 0.08, s + 0.02), this.mats.darkWood);
      band.position.copy(c.position); band.rotation.y = r; g.add(band);
    };
    mk(0, 0, 0); mk(1.15, 0, 0.1, 1.0, 0.2); mk(0.5, 1.1, 0.05, 0.9, -0.3);
    const straw = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a7440, roughness: 1 }));
    straw.position.set(-1.1, 0, 0.5); straw.scale.y = 0.7; g.add(straw);
    g.position.set(x, 0, z); g.rotation.y = ry;
    this.scene.add(g);
    this.addObstacleBox(new THREE.Box3().setFromObject(g), -0.05);
  }

  buildGraveyard(cx, cz) {
    const g = new THREE.Group();
    const mound = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const moundMat = new THREE.MeshStandardMaterial({ map: this.mats.dirt.map, color: 0x6a5a48, roughness: 1 });
    const spots = [[-5, -3], [-1.5, -4.5], [2.5, -3.5], [-4, 1.5], [0, 0.5], [4, 0], [-2, 4.5], [2.5, 4]];
    spots.forEach(([x, z], i) => {
      const m = new THREE.Mesh(mound, moundMat);
      m.scale.set(1.3, 0.7, 1.8); m.position.set(x, 0, z); m.receiveShadow = true; g.add(m);
      const stoneG = new THREE.Mesh(roundedBox(0.8, 1.1, 0.16, 0.05, 2), this.mats.stone);
      stoneG.position.set(x, 0.55, z - 1.8); stoneG.rotation.set((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.2);
      stoneG.castShadow = true; g.add(stoneG);
      const ins = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.9), new THREE.MeshStandardMaterial({ map: signTex(['故人之墓', '先考之墓', '無名氏', '亡妻之墓', '佚名'][i % 5], '#c8c0b0', '#3a3a3a', true), roughness: 0.9 }));
      ins.position.set(0, 0, 0.09); stoneG.add(ins);
      if (i % 2 === 0) {
        // 裂开的坟土
        const crack = new THREE.Mesh(new THREE.CircleGeometry(0.5, 10), new THREE.MeshBasicMaterial({ color: 0x0a0806 }));
        crack.rotation.x = -Math.PI / 2; crack.position.set(x, 0.72, z); crack.scale.set(1, 1.6, 1); g.add(crack);
      }
      this.addObstacleBox(new THREE.Box3(new THREE.Vector3(cx + x - 0.45, 0, cz + z - 1.9), new THREE.Vector3(cx + x + 0.45, 1.1, cz + z - 1.7)));
    });
    // 招魂幡
    for (const [x, z] of [[-6, 3.5], [5.5, -5]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 4, 6), this.mats.darkWood);
      pole.position.set(x, 2, z); g.add(pole);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.2, 1, 8), new THREE.MeshStandardMaterial({ color: 0xe8e4d8, side: THREE.DoubleSide, roughness: 0.9 }));
      banner.position.set(x + 0.27, 2.7, z); banner.userData.dynamic = true; g.add(banner);
      const pos = banner.geometry.getAttribute('position');
      const base = pos.array.slice();
      this.animated.push({ update: (dt, t) => {
        for (let i = 0; i < pos.count; i++) { const y = base[i * 3 + 1]; pos.setZ(i, Math.sin(t * 2.2 + y * 2 + x) * 0.15 * (1.1 - y / 2.2)); }
        pos.needsUpdate = true;
      } });
    }
    g.position.set(cx, 0, cz);
    this.scene.add(g);
  }

  buildDeadTree(x, z, s = 1) {
    const geos = [];
    const R = rnd(Math.floor(x * 100 + z * 7) + 17);
    const branch = (p, dir, len, r, depth) => {
      const pts = [p.clone()];
      let cur = p.clone(), d = dir.clone();
      for (let i = 0; i < 4; i++) {
        d.add(V((R() - 0.5) * 0.5, (R() - 0.3) * 0.3, (R() - 0.5) * 0.5)).normalize();
        cur = cur.clone().addScaledVector(d, len / 4);
        pts.push(cur);
      }
      geos.push(tube(pts, (t) => r * (1 - t * 0.65), 0, 8, 7));
      if (depth > 0) {
        const n = depth > 2 ? 3 : 2;
        for (let k = 0; k < n; k++) {
          const nd = d.clone().add(V((R() - 0.5) * 1.6, R() * 0.6, (R() - 0.5) * 1.6)).normalize();
          branch(pts[4 - Math.floor(R() * 2)], nd, len * 0.68, r * 0.55, depth - 1);
        }
      }
    };
    branch(V(0, -0.3, 0), V(0.1, 1, 0), 3.4 * s, 0.32 * s, 4);
    // 根
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; geos.push(tube([V(0, 0.4, 0), V(Math.cos(a) * 0.6, 0.1, Math.sin(a) * 0.6), V(Math.cos(a) * 1.1, -0.1, Math.sin(a) * 1.1)], 0.18 * s, 0.05, 6, 6)); }
    const tree = new THREE.Mesh(mergeGeometries(geos), this.mats.bark);
    tree.castShadow = true;
    tree.position.set(x, 0, z);
    this.scene.add(tree);
    // 挂着的乌鸦 / 布条
    const crow = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.4 }));
    crow.scale.set(1, 0.9, 1.6); crow.position.set(x + 0.8 * s, 3.3 * s, z + 0.2); this.scene.add(crow);
    this.addObstacleBox(new THREE.Box3(new THREE.Vector3(x - 0.4, 0, z - 0.4), new THREE.Vector3(x + 0.4, 3, z + 0.4)));
  }

  buildPaperMoney() {
    const tex = canvasTexture(32, 32, (g) => { g.fillStyle = '#e8dcb0'; g.fillRect(0, 0, 32, 32); g.strokeStyle = '#a08030'; g.lineWidth = 3; g.beginPath(); g.arc(16, 16, 8, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#a08030'; g.fillRect(12, 12, 8, 8); g.clearRect(14, 14, 4, 4); });
    const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 });
    const geo = new THREE.PlaneGeometry(0.16, 0.16);
    const n = 420;
    const inst = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * (ARENA_HALF - 2);
      e.set(-Math.PI / 2 + (Math.random() - 0.5) * 0.3, 0, Math.random() * 6);
      q.setFromEuler(e);
      m.compose(V(Math.cos(a) * r, 0.02 + Math.random() * 0.01, Math.sin(a) * r), q, V(1, 1, 1));
      inst.setMatrixAt(i, m);
    }
    inst.receiveShadow = true;
    this.scene.add(inst);
    // 飘落纸钱
    const fall = new THREE.InstancedMesh(geo, mat, 60);
    const st = [];
    for (let i = 0; i < 60; i++) st.push({ p: V((Math.random() - 0.5) * 60, Math.random() * 14, (Math.random() - 0.5) * 60), r: Math.random() * 6, s: 0.3 + Math.random() * 0.4 });
    this.scene.add(fall);
    this.animated.push({ update: (dt, t) => {
      for (let i = 0; i < st.length; i++) {
        const o = st[i];
        o.p.y -= dt * o.s; o.p.x += Math.sin(t * 0.7 + i) * dt * 0.6; o.r += dt * 2;
        if (o.p.y < 0) { o.p.y = 14; o.p.x = (Math.random() - 0.5) * 60; o.p.z = (Math.random() - 0.5) * 60; }
        e.set(o.r, o.r * 0.7, o.r * 0.3); q.setFromEuler(e);
        m.compose(o.p, q, V(1, 1, 1)); fall.setMatrixAt(i, m);
      }
      fall.instanceMatrix.needsUpdate = true;
    } });
  }

  // 墙外远景：树影 + 远山
  buildOuterScenery() {
    const trunk = new THREE.CylinderGeometry(0.2, 0.35, 7, 6);
    trunk.translate(0, 3.5, 0);
    const crown = new THREE.ConeGeometry(2.4, 6, 7);
    crown.translate(0, 8, 0);
    const treeGeo = mergeGeometries([trunk, crown]);
    const mat = new THREE.MeshStandardMaterial({ color: 0x0e1612, roughness: 1 });
    const n = 90;
    const inst = new THREE.InstancedMesh(treeGeo, mat, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.05;
      const r = ARENA_HALF + 5 + Math.random() * 18;
      const s = 0.7 + Math.random() * 0.8;
      m.compose(V(Math.cos(a) * r, 0, Math.sin(a) * r), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.random() * 6), V(s, s * (0.8 + Math.random() * 0.5), s));
      inst.setMatrixAt(i, m);
    }
    this.scene.add(inst);
    // 远山剪影
    const pos = [];
    const seg = 90;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const h = 25 + Math.sin(a * 3) * 12 + Math.sin(a * 7 + 1) * 8 + Math.sin(a * 13) * 4;
      const r = 200;
      pos.push(Math.cos(a) * r, -5, Math.sin(a) * r, Math.cos(a) * r, h, Math.sin(a) * r);
    }
    const idx = [];
    for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    mg.setIndex(idx);
    this.mountains = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: 0x0a0e16, side: THREE.DoubleSide, fog: true }));
    this.scene.add(this.mountains);
  }

  buildMist() {
    const tex = softDotTexture('rgba(190,200,215,0.55)', 'rgba(190,200,215,0)');
    this.mist = [];
    for (let i = 0; i < 26; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.07, fog: true }));
      const a = Math.random() * Math.PI * 2, r = Math.random() * ARENA_HALF;
      sp.position.set(Math.cos(a) * r, 0.9, Math.sin(a) * r);
      sp.scale.set(12 + Math.random() * 8, 3, 1);
      sp.userData.v = V((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6);
      this.scene.add(sp);
      this.mist.push(sp);
    }
    this.animated.push({ update: (dt) => {
      for (const s of this.mist) {
        s.position.addScaledVector(s.userData.v, dt);
        if (Math.abs(s.position.x) > ARENA_HALF) s.userData.v.x *= -1;
        if (Math.abs(s.position.z) > ARENA_HALF) s.userData.v.z *= -1;
      }
    } });
  }

  buildGhostFires() {
    const tex = softDotTexture('rgba(120,200,255,1)', 'rgba(60,120,255,0)');
    this.ghostFires = [];
    for (let i = 0; i < 12; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x9fd8ff }));
      const home = V(ARENA_HALF - 10 + (Math.random() - 0.5) * 12, 0.8 + Math.random(), -ARENA_HALF + 10 + (Math.random() - 0.5) * 12);
      if (i >= 8) home.set((Math.random() - 0.5) * 60, 1, (Math.random() - 0.5) * 60);
      sp.userData.home = home;
      sp.scale.setScalar(0.5);
      this.scene.add(sp);
      this.ghostFires.push(sp);
    }
    this.animated.push({ update: (dt, t) => {
      this.ghostFires.forEach((s, i) => {
        const h = s.userData.home;
        s.position.set(h.x + Math.sin(t * 0.5 + i) * 1.5, h.y + Math.sin(t * 1.3 + i * 2) * 0.4, h.z + Math.cos(t * 0.4 + i) * 1.5);
        s.material.opacity = 0.55 + Math.sin(t * 5 + i) * 0.25;
      });
    } });
  }

  // 第二章：竹林环绕
  buildBamboo() {
    const g = new THREE.Group();
    const stemTex = canvasTexture(32, 256, (gg, w, h) => {
      const gr = gg.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#2a4a20'); gr.addColorStop(0.5, '#5a8a40'); gr.addColorStop(1, '#2a4a20');
      gg.fillStyle = gr; gg.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 64) { gg.fillStyle = '#c8d8a0'; gg.fillRect(0, y, w, 3); gg.fillStyle = '#1a2a10'; gg.fillRect(0, y + 3, w, 2); }
    }, 1, 4);
    const stem = new THREE.CylinderGeometry(0.07, 0.09, 9, 7);
    stem.translate(0, 4.5, 0);
    const stems = new THREE.InstancedMesh(stem, new THREE.MeshStandardMaterial({ map: stemTex, roughness: 0.6 }), 220);
    const leafTex = canvasTexture(64, 64, (gg) => {
      gg.fillStyle = '#3a6a2a';
      for (let i = 0; i < 7; i++) { gg.save(); gg.translate(32, 32); gg.rotate((i / 7) * Math.PI * 2); gg.beginPath(); gg.ellipse(0, -16, 4, 16, 0, 0, Math.PI * 2); gg.fill(); gg.restore(); }
    });
    const leafGeo = new THREE.PlaneGeometry(2.2, 2.2);
    const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }), 440);
    const m = new THREE.Matrix4(); let k = 0, kl = 0;
    const place = (x, z) => {
      const s = 0.7 + Math.random() * 0.6;
      m.compose(V(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.12, 0, (Math.random() - 0.5) * 0.12)), V(1, s, 1));
      stems.setMatrixAt(k++, m);
      for (let j = 0; j < 2; j++) {
        m.compose(V(x + (Math.random() - 0.5), 6 * s + j * 1.5, z + (Math.random() - 0.5)), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, 0)), V(1, 1, 1));
        leaves.setMatrixAt(kl++, m);
      }
    };
    for (let i = 0; i < 220; i++) {
      const side = i % 4;
      const along = (Math.random() - 0.5) * ARENA_HALF * 2;
      const depth = 1.5 + Math.random() * 5;
      if (side === 0) place(along, -ARENA_HALF - depth);
      else if (side === 1) place(along, ARENA_HALF + depth);
      else if (side === 2) place(-ARENA_HALF - depth, along);
      else place(ARENA_HALF + depth, along);
    }
    stems.count = k; leaves.count = kl;
    g.add(stems, leaves);
    // 场内几丛
    const inner = new THREE.InstancedMesh(stem, stems.material, 40);
    let ki = 0;
    for (const [cx, cz] of [[-22, -18], [23, 8], [-24, 20], [8, -24]]) {
      for (let i = 0; i < 10; i++) {
        m.compose(V(cx + (Math.random() - 0.5) * 2.2, 0, cz + (Math.random() - 0.5) * 2.2), new THREE.Quaternion(), V(1, 0.5 + Math.random() * 0.5, 1));
        inner.setMatrixAt(ki++, m);
      }
      this.chapterObstacle ??= {};
      (this.chapterObstacle.bamboo ??= []).push(new THREE.Box3(V(cx - 1.3, 0, cz - 1.3), V(cx + 1.3, 5, cz + 1.3)));
    }
    g.add(inner);
    g.visible = false;
    g.userData.dynamic = true;
    this.scene.add(g);
    this.chapterSets.bamboo = g;
  }

  // 第三章：余烬与血月
  buildEmbers() {
    const n = 400;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const spd = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 80; pos[i * 3 + 1] = Math.random() * 20; pos[i * 3 + 2] = (Math.random() - 0.5) * 80; spd[i] = 0.5 + Math.random() * 1.5; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xff7a30, size: 0.12, map: softDotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.visible = false;
    this.scene.add(pts);
    this.chapterSets.embers = pts;
    this.animated.push({ update: (dt, t) => {
      if (!pts.visible) return;
      for (let i = 0; i < n; i++) {
        pos[i * 3 + 1] += spd[i] * dt;
        pos[i * 3] += Math.sin(t + i) * dt * 0.4;
        if (pos[i * 3 + 1] > 20) pos[i * 3 + 1] = 0;
      }
      geo.attributes.position.needsUpdate = true;
    } });
    // 地裂熔光
    const crackTex = canvasTexture(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = '#ff5a10'; g.lineCap = 'round';
      for (let i = 0; i < 14; i++) {
        let x = Math.random() * w, y = Math.random() * h;
        g.lineWidth = 1 + Math.random() * 3;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 50; y += (Math.random() - 0.5) * 50; g.lineTo(x, y); }
        g.stroke();
      }
    }, 5, 5);
    const cracks = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xff6a20 }));
    cracks.rotation.x = -Math.PI / 2; cracks.position.y = 0.03;
    cracks.visible = false;
    cracks.userData.dynamic = true;
    this.scene.add(cracks);
    this.chapterSets.cracks = cracks;
    this.animated.push({ update: (dt, t) => { if (cracks.visible) cracks.material.opacity = 0.55 + Math.sin(t * 1.5) * 0.25; } });
  }

  // ---------------- 静态网格合批：同材质的静态网格烘焙进世界坐标合并，大幅减少 draw call
  bakeStatic() {
    const scene = this.scene;
    scene.updateMatrixWorld(true);
    const buckets = new Map();
    const victims = [];
    const visit = (obj) => {
      if (obj.userData.dynamic) return;
      if (obj.isMesh && !obj.isInstancedMesh && !obj.isSkinnedMesh && obj.material && !Array.isArray(obj.material) && obj.visible) {
        const g = obj.geometry;
        if (g.getAttribute('position') && !g.morphAttributes.position) {
          const key = obj.material.uuid + '|' + (obj.castShadow ? 1 : 0) + (obj.receiveShadow ? 1 : 0);
          if (!buckets.has(key)) buckets.set(key, { mat: obj.material, cast: obj.castShadow, recv: obj.receiveShadow, geos: [] });
          let ng = g.index ? g.toNonIndexed() : g.clone();
          for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
          if (!ng.getAttribute('normal')) ng.computeVertexNormals();
          if (!ng.getAttribute('uv')) ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(ng.getAttribute('position').count * 2), 2));
          ng.applyMatrix4(obj.matrixWorld);
          buckets.get(key).geos.push(ng);
          victims.push(obj);
        }
      }
      for (const c of obj.children) visit(c);
    };
    for (const c of scene.children) visit(c);
    for (const v of victims) {
      // 仅移除网格本身；其子节点（灯光、动态件）挂回其父节点并保持世界变换
      const parent = v.parent;
      for (const ch of [...v.children]) { parent.attach(ch); }
      parent.remove(v);
    }
    for (const b of buckets.values()) {
      if (!b.geos.length) continue;
      const merged = mergeGeometries(b.geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, b.mat);
      m.castShadow = b.cast; m.receiveShadow = b.recv;
      m.matrixAutoUpdate = false;
      scene.add(m);
    }
    this.bakedBuckets = buckets.size;
  }

  // ---------------- 章节氛围
  setAmbience(a) {
    if (!a) return;
    const u = this.sky.material.uniforms;
    u.top.value.set(a.skyTop); u.horizon.value.set(a.skyHorizon);
    u.moonColor.value.set(a.moonColor); u.moonSize.value = a.moonSize ?? 0.035;
    u.cloudColor.value.set(a.cloud ?? 0x2a3040);
    this.scene.fog.color.set(a.fog);
    this.scene.fog.density = a.fogDensity;
    this.scene.background.set(a.fog);
    this.hemi.color.set(a.hemiSky); this.hemi.groundColor.set(a.hemiGround); this.hemi.intensity = a.hemi;
    this.moon.color.set(a.moonLight); this.moon.intensity = a.moonIntensity;
    this.mountains.material.color.set(a.mountain ?? 0x0a0e16);
    for (const k in this.chapterSets) this.chapterSets[k].visible = (a.sets || []).includes(k);
    // 章节专属碰撞
    this.obstacles = this.obstacles.filter((b) => !b.userData?.chapter);
    for (const set of a.sets || []) {
      for (const b of (this.chapterObstacle?.[set] || [])) { b.userData = { chapter: true }; this.obstacles.push(b); }
    }
    for (const gf of this.ghostFires) gf.material.color.set(a.ghostFire ?? 0x9fd8ff);
    for (const m of this.mist) m.material.color.set(a.mist ?? 0xffffff);
  }

  update(dt) {
    this.time += dt;
    this.sky.material.uniforms.time.value = this.time;
    for (const a of this.animated) a.update(dt, this.time);
  }

  /** 圆柱碰撞体 vs 场景 AABB */
  collide(pos, radius, feetY = 0, height = 1.7) {
    const stepAllow = 0.35;
    for (let iter = 0; iter < 2; iter++) {
      for (const box of this.obstacles) {
        if (box.max.y <= feetY + stepAllow || box.min.y >= feetY + height) continue;
        const cx = Math.max(box.min.x, Math.min(pos.x, box.max.x));
        const cz = Math.max(box.min.z, Math.min(pos.z, box.max.z));
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          if (d2 < 1e-8) {
            const pushL = pos.x - box.min.x + radius, pushR = box.max.x - pos.x + radius;
            const pushB = pos.z - box.min.z + radius, pushF = box.max.z - pos.z + radius;
            const m = Math.min(pushL, pushR, pushB, pushF);
            if (m === pushL) pos.x = box.min.x - radius;
            else if (m === pushR) pos.x = box.max.x + radius;
            else if (m === pushB) pos.z = box.min.z - radius;
            else pos.z = box.max.z + radius;
          } else {
            const d = Math.sqrt(d2);
            const push = radius - d;
            pos.x += (dx / d) * push;
            pos.z += (dz / d) * push;
          }
        }
      }
    }
    const lim = ARENA_HALF - radius - 0.5;
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.z = Math.max(-lim, Math.min(lim, pos.z));
    return pos;
  }

  // 射线 vs 地面/障碍（返回命中点或 null）；camera=true 时同时检测屋檐体积
  raycast(origin, dir, range, camera = false) {
    let best = null, bestT = range;
    const boxes = camera ? this.obstacles.concat(this.camBoxes) : this.obstacles;
    if (dir.y < -0.001) {
      const t = -origin.y / dir.y;
      if (t > 0 && t < bestT) { bestT = t; best = origin.clone().addScaledVector(dir, t); }
    }
    for (const box of boxes) {
      let tmin = 0, tmax = bestT, ok = true;
      for (const ax of ['x', 'y', 'z']) {
        const o = origin[ax], d = dir[ax], mn = box.min[ax], mx = box.max[ax];
        if (Math.abs(d) < 1e-8) { if (o < mn || o > mx) { ok = false; break; } }
        else {
          let t1 = (mn - o) / d, t2 = (mx - o) / d;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
          if (tmin > tmax) { ok = false; break; }
        }
      }
      if (ok && tmin > 0.01 && tmin < bestT) { bestT = tmin; best = origin.clone().addScaledVector(dir, tmin); }
    }
    return best;
  }

  // 两点间视线是否被遮挡（用于远程怪）
  blocked(a, b) {
    const d = b.clone().sub(a);
    const len = d.length();
    d.divideScalar(len);
    const hit = this.raycast(a, d, len);
    return !!hit && hit.y > 0.05;
  }
}

export { flameTexture };
