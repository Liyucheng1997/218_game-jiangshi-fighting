import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 林正英：第三人称可见的玩家化身（程序化骨骼走路动画）
export class Priest {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.bones = {};
    this.walkT = 0;
    this.loaded = false;
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync('/models/priest.glb');
    const inst = gltf.scene;
    inst.updateMatrixWorld(true);
    const box = new THREE.Box3();
    inst.traverse((n) => {
      if (n.isMesh || n.isSkinnedMesh) {
        n.geometry.computeBoundingBox();
        box.union(n.geometry.boundingBox.clone().applyMatrix4(n.matrixWorld));
      }
    });
    const size = box.getSize(new THREE.Vector3());
    const s = 1.72 / (size.y || 1);
    inst.scale.setScalar(s);
    inst.position.y = -box.min.y * s;
    inst.rotation.y = -Math.PI / 2;   // Tripo 模型面朝 +X → 校正为 +Z
    inst.traverse((n) => {
      if (n.isMesh || n.isSkinnedMesh) { n.castShadow = true; n.frustumCulled = false; }
    });
    this.group.add(inst);
    for (const name of ['L_Thigh', 'R_Thigh', 'L_Calf', 'R_Calf', 'L_Upperarm', 'R_Upperarm', 'Spine01', 'Head']) {
      const b = inst.getObjectByName(name);
      if (b) {
        b.userData.baseQuat = b.quaternion.clone();
        this.bones[name] = b;
      }
    }
    this.loaded = true;
  }

  _rot(name, x, y = 0, z = 0) {
    const b = this.bones[name];
    if (!b) return;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
    b.quaternion.copy(b.userData.baseQuat).multiply(q);
  }

  /** 每帧同步：位置/朝向来自玩家，腿部摆动由移动速度驱动 */
  update(dt, playerPos, yaw, moving, running) {
    if (!this.loaded) return;
    this.group.position.set(playerPos.x, playerPos.y - 1.65, playerPos.z);
    this.group.rotation.y = yaw + Math.PI;   // 玩家 yaw=0 面向 -Z，模型面向 +Z

    if (moving) {
      this.walkT += dt * (running ? 11 : 7);
      const sw = Math.sin(this.walkT) * (running ? 0.6 : 0.42);
      // Tripo 骨骼：局部 +X = 前摆（与僵尸手臂同轴向）
      this._rot('L_Thigh', sw, 0, 0);
      this._rot('R_Thigh', -sw, 0, 0);
      this._rot('L_Calf', -Math.max(0, -sw) * 0.9, 0, 0);
      this._rot('R_Calf', -Math.max(0, sw) * 0.9, 0, 0);
      this._rot('L_Upperarm', -sw * 0.45, 0, 0);
      this._rot('R_Upperarm', sw * 0.45, 0, 0);
      this._rot('Spine01', 0.06, 0, 0);
    } else {
      this.walkT = 0;
      const breathe = Math.sin(performance.now() * 0.0016) * 0.02;
      this._rot('L_Thigh', 0, 0, 0);
      this._rot('R_Thigh', 0, 0, 0);
      this._rot('L_Calf', 0, 0, 0);
      this._rot('R_Calf', 0, 0, 0);
      this._rot('L_Upperarm', 0, 0, 0);
      this._rot('R_Upperarm', 0, 0, 0);
      this._rot('Spine01', breathe, 0, 0);
    }
  }

  setVisible(v) { this.group.visible = v; }
}
