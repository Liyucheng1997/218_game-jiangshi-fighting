import * as THREE from 'three';

export const ARENA_HALF = 42;   // 竞技场半径（正方形一半）

// 画布程序纹理 ---------------------------------------------------------
function canvasTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// 青石板地面
function stoneSlabTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#565d5e'; g.fillRect(0, 0, w, h);
    const s = 64;
    for (let y = 0; y < h; y += s) {
      for (let x = 0; x < w; x += s) {
        const v = 78 + Math.random() * 22;
        g.fillStyle = `rgb(${v},${v + 4},${v + 3})`;
        g.fillRect(x + 2, y + 2, s - 4, s - 4);
        // 石板内噪点
        for (let i = 0; i < 40; i++) {
          const nv = v - 18 + Math.random() * 30;
          g.fillStyle = `rgba(${nv},${nv},${nv},.5)`;
          g.fillRect(x + 2 + Math.random() * (s - 6), y + 2 + Math.random() * (s - 6), 2, 2);
        }
      }
    }
    g.fillStyle = 'rgba(28,30,30,.9)';
    for (let y = 0; y < h; y += s) g.fillRect(0, y, w, 3);
    for (let x = 0; x < w; x += s) g.fillRect(x, 0, 3, h);
  }, 22, 22);
}

// 青砖墙
function greyBrickTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#6c7476'; g.fillRect(0, 0, w, h);
    const bh = 20, bw = 56;
    for (let y = 0; y < h; y += bh) {
      const off = ((y / bh) % 2) * bw / 2;
      for (let x = -bw; x < w; x += bw) {
        const v = 100 + Math.random() * 24;
        g.fillStyle = `rgb(${v},${v + 5},${v + 6})`;
        g.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
      }
    }
    g.strokeStyle = 'rgba(38,42,44,.85)'; g.lineWidth = 3;
    for (let y = 0; y < h; y += bh) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  }, 4, 1.6);
}

// 白灰泥墙（带斑驳）
function plasterTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#b9b3a4'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) {
      const v = 150 + Math.random() * 40;
      g.fillStyle = `rgba(${v},${v - 4},${v - 14},.35)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    // 底部污渍
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(90,85,70,${0.08 + Math.random() * 0.12})`;
      const x = Math.random() * w;
      g.fillRect(x, h - 40 - Math.random() * 40, 12 + Math.random() * 26, 40 + Math.random() * 40);
    }
  }, 2, 1);
}

// 深色木板
function woodTexture(base = '#4a382a') {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      const v = 58 + Math.random() * 20;
      g.fillStyle = `rgb(${v},${v * 0.72},${v * 0.5})`;
      g.fillRect(x + 1, 0, 30, h);
      g.strokeStyle = 'rgba(30,20,12,.7)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
      // 木纹
      g.strokeStyle = `rgba(${v * 0.6},${v * 0.42},${v * 0.3},.6)`;
      g.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        const yy = Math.random() * h;
        g.moveTo(x, yy); g.bezierCurveTo(x + 10, yy + 8, x + 20, yy - 8, x + 31, yy + 4);
        g.stroke();
      }
    }
  }, 2, 1);
}

// 瓦片屋顶
function roofTileTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#2e3438'; g.fillRect(0, 0, w, h);
    const rows = 8, cols = 8;
    const rh = h / rows, cw = w / cols;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = 52 + Math.random() * 16;
        g.fillStyle = `rgb(${v},${v + 6},${v + 10})`;
        g.fillRect(c * cw + 1, r * rh + 1, cw - 2, rh - 2);
        // 瓦楞弧线
        g.strokeStyle = 'rgba(20,24,28,.8)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(c * cw + cw / 2, r * rh + rh, cw / 2 - 1, Math.PI, 0);
        g.stroke();
      }
    }
  }, 4, 3);
}

// 木格窗（透暖光）
function latticeWindowTexture(lit = true) {
  return canvasTexture(128, 160, (g, w, h) => {
    g.fillStyle = lit ? '#e8b45c' : '#1d1f16';
    g.fillRect(0, 0, w, h);
    if (lit) {
      const grd = g.createRadialGradient(w / 2, h / 2, 8, w / 2, h / 2, w * 0.7);
      grd.addColorStop(0, 'rgba(255,236,170,.9)');
      grd.addColorStop(1, 'rgba(190,120,40,.9)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    }
    g.strokeStyle = '#2b1d10'; g.lineWidth = 7;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.lineWidth = 5;
    for (let x = w / 4; x < w; x += w / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = h / 5; y < h; y += h / 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
}

// 木门
function doorTexture() {
  return canvasTexture(128, 192, (g, w, h) => {
    g.fillStyle = '#3a2417'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#241207'; g.lineWidth = 4;
    for (let x = 0; x < w; x += 22) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    // 门环
    g.strokeStyle = '#a8842f'; g.lineWidth = 4;
    g.beginPath(); g.arc(w * 0.3, h * 0.45, 9, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(w * 0.7, h * 0.45, 9, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#a8842f';
    g.fillRect(w * 0.3 - 4, h * 0.38, 8, 6); g.fillRect(w * 0.7 - 4, h * 0.38, 8, 6);
  });
}

// 中文牌匾 / 告示
function signTexture(text, fg = '#e8d9a0', bg = '#26170c', vertical = false) {
  const W = vertical ? 128 : 512, H = vertical ? 512 : 128;
  return canvasTexture(W, H, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6;
    g.strokeRect(7, 7, w - 14, h - 14);
    g.fillStyle = fg;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (vertical) {
      g.font = 'bold 72px "Microsoft YaHei", serif';
      const chars = text.split('');
      const step = (h - 40) / chars.length;
      chars.forEach((c, i) => g.fillText(c, w / 2, 24 + step * (i + 0.5)));
    } else {
      g.font = 'bold 76px "Microsoft YaHei", serif';
      g.fillText(text, w / 2, h / 2 + 6);
    }
  });
}

// 符纸（贴在棺材/墙上）
function talismanTexture() {
  return canvasTexture(64, 160, (g, w, h) => {
    g.fillStyle = '#e3c554'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b71f1f'; g.lineWidth = 4;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#b71f1f';
    g.font = 'bold 30px serif'; g.textAlign = 'center';
    g.fillText('敕', w / 2, 34);
    g.fillText('令', w / 2, 64);
    // 咒符曲线
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(w / 2, 76);
    g.bezierCurveTo(w * 0.2, 95, w * 0.8, 110, w * 0.35, 128);
    g.bezierCurveTo(w * 0.7, 138, w * 0.4, 146, w * 0.55, 152);
    g.stroke();
  });
}

// -----------------------------------------------------------------------
export class World {
  constructor(scene) {
    this.scene = scene;
    this.obstacles = [];       // Box3 列表，供碰撞与弹道
    this.spawnPoints = [];
    this.build();
  }

  addObstacleBox(objOrBox, pad = 0) {
    let box;
    if (objOrBox.isBox3) box = objOrBox.clone();
    else {
      objOrBox.updateWorldMatrix(true, false);
      box = new THREE.Box3().setFromObject(objOrBox);
    }
    box.min.x -= pad; box.min.z -= pad;
    box.max.x += pad; box.max.z += pad;
    this.obstacles.push(box);
  }

  build() {
    const scene = this.scene;

    // ---- 夜色 / 雾 / 光照 ----
    scene.background = new THREE.Color(0x0a0e14);
    scene.fog = new THREE.Fog(0x0a0e14, 20, 100);

    const hemi = new THREE.HemisphereLight(0x8fa8c0, 0x232a20, 0.8);
    scene.add(hemi);
    this.hemi = hemi;

    const moon = new THREE.DirectionalLight(0xbfd4ff, 1.15);
    moon.position.set(-30, 48, -20);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -60; moon.shadow.camera.right = 60;
    moon.shadow.camera.top = 60; moon.shadow.camera.bottom = -60;
    moon.shadow.camera.far = 150;
    moon.shadow.bias = -0.0004;
    scene.add(moon);
    this.moon = moon;

    const moonBall = new THREE.Mesh(
      new THREE.SphereGeometry(4.5, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xf5ecd8, fog: false })
    );
    moonBall.position.set(-120, 150, -90);
    scene.add(moonBall);

    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < 550; i++) {
      const r = 350, a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI * 0.45 + 0.08;
      starPos.push(r * Math.cos(a) * Math.cos(e), r * Math.sin(e), r * Math.sin(a) * Math.cos(e));
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xaabbdd, size: 1.2, fog: false, sizeAttenuation: false })));

    // ---- 地面：青石板 ----
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_HALF * 2 + 40, ARENA_HALF * 2 + 40),
      new THREE.MeshStandardMaterial({ map: stoneSlabTexture(), roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // ---- 材质库 ----
    this.mats = {
      greyBrick: new THREE.MeshStandardMaterial({ map: greyBrickTexture(), roughness: 0.92 }),
      plaster: new THREE.MeshStandardMaterial({ map: plasterTexture(), roughness: 0.95 }),
      wood: new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.85 }),
      roof: new THREE.MeshStandardMaterial({ map: roofTileTexture(), roughness: 0.8 }),
      darkWood: new THREE.MeshStandardMaterial({ color: 0x2f2015, roughness: 0.85 }),
      redPillar: new THREE.MeshStandardMaterial({ color: 0x8c1f1a, roughness: 0.6 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x6b6f6b, roughness: 0.9 }),
      jar: new THREE.MeshStandardMaterial({ color: 0x54402e, roughness: 0.7 }),
      coffin: new THREE.MeshStandardMaterial({ map: woodTexture(), color: 0x9a7a55, roughness: 0.8 }),
    };

    // ---- 周界：青砖围墙 + 瓦顶 ----
    this.buildPerimeter();

    // ---- 牌坊（义庄大门）----
    this.buildPaifang(0, -30);

    // ---- 民居 ----
    this.buildHouse(-26, -22, 13, 9, 0);
    this.buildHouse(26, -24, 11, 10, Math.PI);
    this.buildHouse(-27, 20, 11, 12, Math.PI / 2);
    this.buildHouse(26, 24, 13, 9, -Math.PI / 2);

    // ---- 义庄棺材 ----
    const coffins = [
      [-6, -14, 0.3], [-4.6, -13.2, 1.2], [14, 6, -0.4], [4, 18, 0.8], [-16, 6, 2.2], [18, -10, 0.15],
    ];
    for (const [x, z, ry] of coffins) this.buildCoffin(x, z, ry);

    // ---- 大水缸 ----
    [[-12, -6], [12, 14], [-20, 14], [8, -20], [22, 4]].forEach(([x, z]) => {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.42, 1.05, 12), this.mats.jar);
      jar.position.set(x, 0.52, z);
      jar.castShadow = jar.receiveShadow = true;
      scene.add(jar);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 8, 14), this.mats.darkWood);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(x, 1.05, z);
      scene.add(rim);
      this.addObstacleBox(jar);
    });

    // ---- 木箱（保留掩体）----
    const crateMat = this.mats.wood;
    const crates = [
      [-8, 8], [-6.4, 8], [-7.2, 9.4, 1.6], [12, -12], [20, 18], [21.6, 18], [20.8, 19.4], [20.8, 18.6, 1.6],
      [-20, -12], [8, 14], [-2, 24],
    ];
    for (const [x, z, y = 0.8] of crates) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), crateMat);
      m.position.set(x, y, z);
      m.rotation.y = Math.random() * 1.5;
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
      if (y < 1) this.addObstacleBox(m);
    }

    // ---- 石灯笼 ----
    [[-16, -16], [16, -16], [-16, 16], [16, 16], [-6, 2]].forEach(([x, z]) => this.buildStoneLantern(x, z));

    // ---- 坟丘 + 墓碑（僵尸从这里爬出的氛围）----
    const S = ARENA_HALF - 5;
    const gravePlots = [
      [-S + 2, -S + 4], [-S + 6, -S + 2], [S - 3, -S + 5], [S - 7, -S + 2],
      [-S + 3, S - 4], [S - 4, S - 3], [0, -S + 3], [-S + 4, 10], [S - 3, -8],
    ];
    for (const [x, z] of gravePlots) this.buildGrave(x, z);

    // ---- 挂灯笼的木杆 + 灯笼串 ----
    [[-16, -16], [16, -16], [-16, 16], [16, 16]].forEach(([x, z]) => this.buildLanternPole(x + 2.2, z - 2.2));

    // ---- 匾额 / 告示 ----
    const signs = [
      { text: '義莊重地 生人勿近', x: 0, z: -ARENA_HALF + 0.8, ry: 0, w: 8 },
      { text: '驅邪鎮煞', x: -ARENA_HALF + 0.8, z: 6, ry: Math.PI / 2, w: 5 },
      { text: '亂葬崗 · 止步', x: ARENA_HALF - 0.8, z: -6, ry: -Math.PI / 2, w: 6.4 },
    ];
    for (const s of signs) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(s.w, s.w / 4),
        new THREE.MeshBasicMaterial({ map: signTexture(s.text) })
      );
      m.position.set(s.x, 3.6, s.z);
      m.rotation.y = s.ry;
      scene.add(m);
    }

    // ---- 僵尸出生点（坟场与围墙边）----
    this.spawnPoints = [
      new THREE.Vector3(-S, 0, -S), new THREE.Vector3(0, 0, -S + 2), new THREE.Vector3(S, 0, -S),
      new THREE.Vector3(-S, 0, 0), new THREE.Vector3(S, 0, 0),
      new THREE.Vector3(-S, 0, S), new THREE.Vector3(0, 0, S), new THREE.Vector3(S, 0, S),
      new THREE.Vector3(-S, 0, 12), new THREE.Vector3(S, 0, -12),
    ];
  }

  buildPerimeter() {
    const L = ARENA_HALF, wallH = 4.2, wallT = 1.1;
    const mk = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), this.mats.greyBrick);
      m.position.set(x, wallH / 2, z);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      this.addObstacleBox(m);
      // 瓦顶压边
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.35, d + 0.5), this.mats.roof);
      cap.position.set(x, wallH + 0.17, z);
      cap.castShadow = true;
      this.scene.add(cap);
    };
    mk(L * 2 + wallT * 2, wallT, 0, -L - wallT / 2);
    mk(L * 2 + wallT * 2, wallT, 0, L + wallT / 2);
    mk(wallT, L * 2, -L - wallT / 2, 0);
    mk(wallT, L * 2, L + wallT / 2, 0);
  }

  // 牌坊
  buildPaifang(x, z) {
    const g = new THREE.Group();
    const pillarGeo = new THREE.CylinderGeometry(0.35, 0.42, 7.2, 10);
    for (const px of [-4, 4]) {
      const p = new THREE.Mesh(pillarGeo, this.mats.redPillar);
      p.position.set(px, 3.6, 0);
      p.castShadow = true;
      g.add(p);
      // 柱础
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.5, 10), this.mats.stone);
      base.position.set(px, 0.25, 0);
      g.add(base);
      this.addObstacleBox(new THREE.Box3(
        new THREE.Vector3(x + px - 0.7, 0, z - 0.7),
        new THREE.Vector3(x + px + 0.7, 7, z + 0.7)
      ));
    }
    // 横梁两层
    const beam1 = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.55, 0.8), this.mats.redPillar);
    beam1.position.set(0, 6.0, 0); beam1.castShadow = true; g.add(beam1);
    const beam2 = new THREE.Mesh(new THREE.BoxGeometry(11, 0.5, 0.9), this.mats.darkWood);
    beam2.position.set(0, 7.0, 0); beam2.castShadow = true; g.add(beam2);
    // 顶部瓦檐（中间高两边低）
    const roofC = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.5, 2.0), this.mats.roof);
    roofC.position.set(0, 7.8, 0); roofC.castShadow = true; g.add(roofC);
    const roofC2 = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.4, 1.6), this.mats.roof);
    roofC2.position.set(0, 8.25, 0); g.add(roofC2);
    for (const px of [-4, 4]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.45, 1.8), this.mats.roof);
      r.position.set(px, 6.8, 0);
      r.castShadow = true;
      g.add(r);
    }
    // 匾额
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.0),
      new THREE.MeshBasicMaterial({ map: signTexture('義 莊', '#e8d9a0', '#141414') })
    );
    plaque.position.set(0, 6.55, 0.47);
    g.add(plaque);
    const plaque2 = plaque.clone();
    plaque2.position.z = -0.47;
    plaque2.rotation.y = Math.PI;
    g.add(plaque2);
    // 挂红灯笼
    for (const px of [-4, 4]) this.addLantern(g, px, 5.4, 0.0);

    g.position.set(x, 0, z);
    this.scene.add(g);
  }

  // 民居：灰泥墙 + 木门窗 + 坡屋顶
  buildHouse(x, z, w, d, ry) {
    const g = new THREE.Group();
    const bodyH = 3.4;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, d), this.mats.plaster);
    body.position.y = bodyH / 2;
    body.castShadow = body.receiveShadow = true;
    g.add(body);

    // 砖砌墙基
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.15, 0.8, d + 0.15), this.mats.greyBrick);
    base.position.y = 0.4;
    base.receiveShadow = true;
    g.add(base);

    // 坡屋顶：两块斜板 + 正脊
    const roofL = w + 1.6;
    const slope = new THREE.Mesh(new THREE.BoxGeometry(roofL, 0.22, d * 0.62), this.mats.roof);
    slope.position.set(0, bodyH + 0.75, -d * 0.25);
    slope.rotation.x = 0.42;
    slope.castShadow = true;
    g.add(slope);
    const slope2 = slope.clone();
    slope2.position.z = d * 0.25;
    slope2.rotation.x = -0.42;
    g.add(slope2);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(roofL, 0.3, 0.5), this.mats.darkWood);
    ridge.position.set(0, bodyH + 1.28, 0);
    ridge.castShadow = true;
    g.add(ridge);
    // 山墙（三角封口，用薄盒近似）
    for (const sx of [-1, 1]) {
      const gable = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.15, d * 0.72), this.mats.plaster);
      gable.position.set(sx * (w / 2 - 0.1), bodyH + 0.55, 0);
      g.add(gable);
    }

    // 门（正面中间）
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.3), new THREE.MeshBasicMaterial({ map: doorTexture() }));
    door.position.set(0, 1.16, d / 2 + 0.03);
    g.add(door);
    // 门框
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.5, 0.12), this.mats.darkWood);
    frame.position.set(0, 1.25, d / 2 + 0.01);
    g.add(frame);
    door.position.z = d / 2 + 0.09;

    // 窗（正反两面）
    const litTex = latticeWindowTexture(true), darkTex = latticeWindowTexture(false);
    for (const side of [1, -1]) {
      for (const wx of [-w / 3.2, w / 3.2]) {
        if (side === 1 && Math.abs(wx) < 1.2) continue;   // 避开门
        const lit = Math.random() < 0.5;
        const win = new THREE.Mesh(
          new THREE.PlaneGeometry(1.1, 1.35),
          new THREE.MeshBasicMaterial({ map: lit ? litTex : darkTex })
        );
        win.position.set(wx, 1.7, side * (d / 2 + 0.03));
        if (side === -1) win.rotation.y = Math.PI;
        g.add(win);
        if (lit) {
          const glow = new THREE.PointLight(0xffb45e, 5, 7, 2);
          glow.position.set(wx, 1.8, side * (d / 2 + 0.5));
          g.add(glow);
        }
      }
    }

    // 屋檐下红灯笼
    this.addLantern(g, -w / 2 + 0.8, bodyH + 0.15, d / 2 + 0.35);
    this.addLantern(g, w / 2 - 0.8, bodyH + 0.15, d / 2 + 0.35);

    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.scene.add(g);

    // 碰撞体（含墙基）
    g.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(body);
    this.addObstacleBox(box, 0.12);
  }

  // 红灯笼（挂件）
  addLantern(parent, x, y, z) {
    const lantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xc82020, emissive: 0xb01212, emissiveIntensity: 1.1, roughness: 0.5 })
    );
    lantern.scale.y = 0.8;
    lantern.position.set(x, y, z);
    parent.add(lantern);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.1, 8), this.mats.darkWood);
    cap.position.set(x, y + 0.3, z);
    parent.add(cap);
    // 穗子
    const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.22, 6),
      new THREE.MeshStandardMaterial({ color: 0xd8b430, roughness: 0.6 }));
    tassel.position.set(x, y - 0.36, z);
    parent.add(tassel);
    const light = new THREE.PointLight(0xff5a30, 9, 11, 1.9);
    light.position.set(x, y - 0.1, z);
    parent.add(light);
  }

  // 灯笼木杆
  buildLanternPole(x, z) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.6, 8), this.mats.darkWood);
    pole.position.set(x, 2.3, z);
    pole.castShadow = true;
    this.scene.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.08), this.mats.darkWood);
    arm.position.set(x + 0.5, 4.4, z);
    this.scene.add(arm);
    const holder = new THREE.Group();
    this.scene.add(holder);
    this.addLantern(holder, x + 1.0, 4.1, z);
    this.addObstacleBox(pole, 0.05);
  }

  // 石灯笼
  buildStoneLantern(x, z) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.5, 8), this.mats.stone);
    base.position.y = 0.25; g.add(base);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.1, 8), this.mats.stone);
    stem.position.y = 1.05; g.add(stem);
    const cage = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.5, 0.56), this.mats.stone);
    cage.position.y = 1.85; g.add(cage);
    const flame = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.4), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
    flame.position.y = 1.85; g.add(flame);
    const capRoof = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.42, 4), this.mats.stone);
    capRoof.position.y = 2.3; capRoof.rotation.y = Math.PI / 4; g.add(capRoof);
    g.children.forEach((c) => { c.castShadow = true; });
    g.position.set(x, 0, z);
    this.scene.add(g);
    const light = new THREE.PointLight(0xffc06a, 15, 15, 1.9);
    light.position.set(x, 1.9, z);
    this.scene.add(light);
    this.addObstacleBox(g, 0.02);
  }

  // 棺材
  buildCoffin(x, z, ry) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 0.85), this.mats.coffin);
    body.position.y = 0.38;
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    // 头大尾小的楔形感：加一块前宽板
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.95, 1.05), this.mats.coffin);
    head.position.set(-1.05, 0.48, 0);
    head.castShadow = true;
    g.add(head);
    // 盖子（歪斜半开）
    const lid = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.14, 0.9), this.mats.coffin);
    lid.position.set(0.12, 0.85, Math.random() * 0.25 - 0.1);
    lid.rotation.z = 0.06 + Math.random() * 0.08;
    lid.rotation.y = (Math.random() - 0.5) * 0.25;
    lid.castShadow = true;
    g.add(lid);
    // 封棺符
    const fu = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.62), new THREE.MeshBasicMaterial({ map: talismanTexture(), transparent: true }));
    fu.position.set(-1.24, 0.55, 0);
    fu.rotation.y = -Math.PI / 2;
    fu.rotation.z = 0.1;
    g.add(fu);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.scene.add(g);
    g.updateWorldMatrix(true, true);
    this.addObstacleBox(new THREE.Box3().setFromObject(body), 0.05);
  }

  // 坟丘 + 墓碑
  buildGrave(x, z) {
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x3d3a2c, roughness: 1 })
    );
    mound.scale.set(1, 0.55, 1);
    mound.position.set(x, 0, z);
    mound.castShadow = mound.receiveShadow = true;
    this.scene.add(mound);
    const stone = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.12), this.mats.stone);
    stone.position.set(x, 0.5, z - 0.85);
    stone.rotation.x = -0.06 + Math.random() * 0.12;
    stone.rotation.z = (Math.random() - 0.5) * 0.15;
    stone.castShadow = true;
    this.scene.add(stone);
  }

  // 关卡氛围：天色 / 雾 / 光照
  setAmbience(a) {
    if (!a) return;
    this.scene.background.set(a.sky);
    this.scene.fog.color.set(a.sky);
    this.scene.fog.near = a.fog[0];
    this.scene.fog.far = a.fog[1];
    this.hemi.intensity = a.hemi;
    this.moon.color.set(a.moon);
  }

  /**
   * 圆柱碰撞体 vs 场景 AABB。
   * @param pos      碰撞体中心（会被原地修正）
   * @param radius   半径
   * @param feetY    脚底世界高度
   * @param height   碰撞体总高
   */
  collide(pos, radius, feetY = 0, height = 1.7) {
    const stepAllow = 0.35;   // 低于脚踝的台阶不阻挡
    for (let iter = 0; iter < 2; iter++) {
      for (const box of this.obstacles) {
        if (box.max.y <= feetY + stepAllow || box.min.y >= feetY + height) continue;
        const cx = Math.max(box.min.x, Math.min(pos.x, box.max.x));
        const cz = Math.max(box.min.z, Math.min(pos.z, box.max.z));
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          if (d2 < 1e-8) {
            // 中心陷入盒内：沿最近面推出
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
    // 场地边界
    const lim = ARENA_HALF - radius - 0.6;
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.z = Math.max(-lim, Math.min(lim, pos.z));
    return pos;
  }
}
