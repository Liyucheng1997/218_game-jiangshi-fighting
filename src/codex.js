import * as THREE from 'three';
import { ZOMBIE_TYPES, CODEX_ORDER } from './data.js';
import { JIANGSHI_MODEL_YAW, createZombieRig, animateZombieDance } from './zombies.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// 3D 僵尸图鉴：昏暗灵堂，八口立棺一字排开，僵尸立于棺中
export class Codex {
  constructor(renderer, zombieManager) {
    this.renderer = renderer;
    this.zm = zombieManager;   // 复用其已加载的模型资产
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
    this.raycaster = new THREE.Raycaster();
    this.built = false;
    this.selected = -1;
    this.entries = [];         // { typeId, group, hitMesh, inst, spot }
    this.onSelect = null;      // (typeId) => void
    this._t = 0;
  }

  async build() {
    if (this.built) return;
    this.built = true;
    await this.zm.load(CODEX_ORDER);

    const s = this.scene;
    s.background = new THREE.Color(0x07070c);
    s.fog = new THREE.Fog(0x07070c, 10, 40);
    s.add(new THREE.HemisphereLight(0x7a8ba8, 0x2a2018, 1.4));
    s.add(new THREE.AmbientLight(0x30281c, 0.8));

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 30),
      new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);

    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 14),
      new THREE.MeshStandardMaterial({ color: 0x17151b, roughness: 1 })
    );
    wall.position.set(0, 7, -2.6);
    s.add(wall);

    const coffinMat = new THREE.MeshStandardMaterial({ color: 0x5c432c, roughness: 0.8 });
    const coffinDark = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.85 });

    const gap = 3.4;
    CODEX_ORDER.forEach((typeId, i) => {
      const cfg = ZOMBIE_TYPES[typeId];
      const x = (i - (CODEX_ORDER.length - 1) / 2) * gap;
      const group = new THREE.Group();
      group.position.set(x, 0, 0);

      // 立棺（背板 + 侧框），微后倾
      const H = Math.max(2.3, cfg.height + 0.55);
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.25, H, 0.18), coffinMat);
      back.position.set(0, H / 2 + 0.05, -0.32);
      group.add(back);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.45, H + 0.25, 0.14), coffinDark);
      frame.position.set(0, H / 2 + 0.05, -0.42);
      group.add(frame);
      for (const sx of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.16, H, 0.42), coffinDark);
        side.position.set(sx * 0.68, H / 2 + 0.05, -0.18);
        group.add(side);
      }
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.28, 0.9), coffinDark);
      base.position.set(0, 0.14, -0.15);
      group.add(base);
      group.rotation.x = -0.06;

      // 僵尸模型立于棺中
      const asset = this.zm.assets[typeId];
      const inst = SkeletonUtils.clone(asset.scene);
      const size = new THREE.Vector3();
      asset.box.getSize(size);
      const sc = cfg.height / (size.y || 1);
      inst.scale.setScalar(sc);
      inst.position.set(0, -asset.box.min.y * sc + 0.28, 0.05);
      inst.rotation.y = JIANGSHI_MODEL_YAW;
      const rig = createZombieRig(inst);
      group.add(inst);

      // 点击判定
      const hitMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, H + 0.3, 1),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitMesh.position.set(0, H / 2, 0);
      hitMesh.userData.codexIndex = i;
      group.add(hitMesh);

      // 每棺一盏顶光
      const spot = new THREE.SpotLight(0xffe8c8, 40, 12, Math.PI / 6, 0.5, 1.2);
      spot.position.set(0, H + 2.2, 1.6);
      spot.target = inst;
      group.add(spot);
      group.add(spot.target);

      s.add(group);
      this.entries.push({ typeId, group, hitMesh, inst, rig, spot, baseY: inst.position.y });
    });

    // 地面红烛点缀
    for (let i = 0; i < CODEX_ORDER.length; i++) {
      const x = (i - (CODEX_ORDER.length - 1) / 2) * gap;
      const candle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.06, 0.35, 8),
        new THREE.MeshStandardMaterial({ color: 0xa02020, emissive: 0x300000 })
      );
      candle.position.set(x + 1.1, 0.18, 1.4);
      s.add(candle);
      const flame = new THREE.PointLight(0xff8040, 2.5, 3.5, 2);
      flame.position.set(x + 1.1, 0.5, 1.4);
      s.add(flame);
    }

    this.select(0);
  }

  select(i) {
    if (i < 0) i = this.entries.length - 1;
    if (i >= this.entries.length) i = 0;
    this.selected = i;
    this.entries.forEach((e, k) => {
      e.spot.intensity = k === i ? 90 : 28;
      e.spot.color.set(k === i ? 0xfff2d0 : 0x9aa4c0);
    });
    this.onSelect?.(this.entries[i].typeId);
  }

  // 点击拾取
  pick(ndcX, ndcY) {
    this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    const hits = this.raycaster.intersectObjects(this.entries.map((e) => e.hitMesh), false);
    if (hits.length) this.select(hits[0].object.userData.codexIndex);
  }

  update(dt) {
    this._t += dt;
    // 相机缓动对准当前选中
    const e = this.entries[this.selected];
    if (e) {
      const tx = e.group.position.x;
      const want = new THREE.Vector3(tx * 0.92, 1.7, 4.6);
      this.camera.position.lerp(want, Math.min(1, dt * 3.5));
      this.camera.lookAt(tx, 1.35, 0);
    }
    // 八种僵尸各自循环一段专属舞步；选中者动作更完整，邻棺保持低幅伴舞。
    this.entries.forEach((en, k) => {
      const intensity = k === this.selected ? 1 : 0.32;
      const bob = animateZombieDance(en.rig, en.typeId, this._t, intensity);
      en.inst.position.y = en.baseY + bob;
    });
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
