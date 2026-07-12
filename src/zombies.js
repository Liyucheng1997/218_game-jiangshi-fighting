import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Audio } from './audio.js';
import { ZOMBIE_TYPES } from './data.js';

// GLB 模型的朝向校正：Tripo 模型的脸朝本地 +X，旋转 -90° 使其面向组的 +Z
export const JIANGSHI_MODEL_YAW = -Math.PI / 2;

// 旧版直接旋转 Upperarm。Tripo 导出的 Upperarm/Forearm 只是骨骼层级中的
// 空节点，并不是 skin.joints；伏尸的袖口权重又与其它模型不同，因此会被拉成尖刺。
// 保留导出以兼容旧调用，新姿态统一由 createZombieRig 驱动真正参与蒙皮的锁骨关节。
export const JIANGSHI_POSE = {};

function findBone(root, name) {
  return root.getObjectByName(name) || null;
}

// 这批 Tripo 模型的 Upperarm/Forearm 只是层级空节点，衣袖又有一批顶点漏绑或
// 错绑到 Root。按绑定姿态下离有效手臂 joint 的距离补齐权重，让网格真正跟骨骼动。
function repairArmWeights(root) {
  root.updateMatrixWorld(true);
  root.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const pos = mesh.geometry.getAttribute('position');
    const skinIndex = mesh.geometry.getAttribute('skinIndex');
    const skinWeight = mesh.geometry.getAttribute('skinWeight');
    if (!pos || !skinIndex || !skinWeight) return;

    const wanted = ['L_Clavicle', 'L_UpperarmTwist01', 'L_ForearmTwist01', 'L_Hand',
      'R_Clavicle', 'R_UpperarmTwist01', 'R_ForearmTwist01', 'R_Hand'];
    const jointIds = new Map();
    mesh.skeleton.bones.forEach((bone, i) => jointIds.set(bone.name, i));
    if (wanted.some((name) => !jointIds.has(name))) return;

    const invMesh = mesh.matrixWorld.clone().invert();
    const jointPoints = wanted.map((name) => {
      const id = jointIds.get(name);
      const point = mesh.skeleton.bones[id].getWorldPosition(new THREE.Vector3()).applyMatrix4(invMesh);
      return { id, point, side: name[0] };
    });
    const armIds = new Set(jointPoints.map((j) => j.id));
    const vertex = new THREE.Vector3();
    const candidates = [];
    let repaired = 0;

    for (let i = 0; i < pos.count; i++) {
      let existingArmWeight = 0;
      for (let k = 0; k < 4; k++) {
        const id = skinIndex.getComponent(i, k);
        if (armIds.has(id)) existingArmWeight += skinWeight.getComponent(i, k);
      }
      if (existingArmWeight >= 0.72) continue;

      vertex.fromBufferAttribute(pos, i);
      candidates.length = 0;
      for (const joint of jointPoints) {
        const d2 = vertex.distanceToSquared(joint.point);
        candidates.push({ ...joint, d2 });
      }
      candidates.sort((a, b) => a.d2 - b.d2);
      const a = candidates[0];
      const b = candidates.find((j) => j.side === a.side && j.id !== a.id);
      // 模型归一化高度约为 1；0.135 只覆盖袖管，不碰躯干、帽子和袍摆。
      if (!b || a.d2 > 0.135 * 0.135) continue;
      const da = Math.sqrt(a.d2) + 0.008;
      const db = Math.sqrt(b.d2) + 0.008;
      const wa = db / (da + db);
      skinIndex.setXYZW(i, a.id, b.id, 0, 0);
      skinWeight.setXYZW(i, wa, 1 - wa, 0, 0);
      repaired++;
    }
    if (repaired > 0) {
      skinIndex.needsUpdate = true;
      skinWeight.needsUpdate = true;
      mesh.geometry.userData.armWeightsRepaired = repaired;
    }
  });
}

export function applyPose(root, pose, blend = 1) {
  for (const [name, rot] of Object.entries(pose)) {
    const b = findBone(root, name);
    if (!b) continue;
    if (!b.userData.baseQuat) b.userData.baseQuat = b.quaternion.clone();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0] * blend, rot[1] * blend, rot[2] * blend));
    b.quaternion.copy(b.userData.baseQuat).multiply(q);
  }
}

const _vStart = new THREE.Vector3();
const _vEnd = new THREE.Vector3();
const _vCurrent = new THREE.Vector3();
const _vTarget = new THREE.Vector3();
const _vModelUp = new THREE.Vector3();
const _vAimUp = new THREE.Vector3();
const _vDesiredUp = new THREE.Vector3();
const _qRoot = new THREE.Quaternion();
const _qBone = new THREE.Quaternion();
const _qParent = new THREE.Quaternion();
const _qDelta = new THREE.Quaternion();
const _qTwist = new THREE.Quaternion();
const _qExtra = new THREE.Quaternion();
const _vDanceDir = new THREE.Vector3();
const AIM_UP_CANDIDATES = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];

function aimedLocalQuaternion(root, bone, end, modelDirection) {
  if (!bone || !end || !bone.parent) return bone?.quaternion.clone() || new THREE.Quaternion();
  root.updateMatrixWorld(true);
  bone.getWorldPosition(_vStart);
  end.getWorldPosition(_vEnd);
  _vCurrent.subVectors(_vEnd, _vStart).normalize();
  root.getWorldQuaternion(_qRoot);
  _vTarget.copy(modelDirection).normalize().applyQuaternion(_qRoot);
  _vModelUp.set(0, 1, 0).applyQuaternion(_qRoot);
  bone.getWorldQuaternion(_qBone);
  bone.parent.getWorldQuaternion(_qParent);

  // 骨链只对准长度轴时，绕长度轴仍有一个自由度，镜像骨很容易翻转 180°。
  // 首次求解时，从绑定姿态的局部 X/Z 轴中记住最朝上的袖面轴。
  if (!bone.userData.aimUpAxis) {
    let bestDot = -Infinity;
    let bestAxis = AIM_UP_CANDIDATES[0];
    for (const axis of AIM_UP_CANDIDATES) {
      const dot = _vAimUp.copy(axis).applyQuaternion(_qBone).dot(_vModelUp);
      if (dot > bestDot) { bestDot = dot; bestAxis = axis; }
    }
    bone.userData.aimUpAxis = bestAxis.clone();
  }

  // swing：先把上臂/前臂的长度方向对准目标。
  _qDelta.setFromUnitVectors(_vCurrent, _vTarget);
  _qBone.premultiply(_qDelta);

  // twist：再绕目标方向校正滚转，让绑定姿态的袖面始终朝模型上方。
  _vAimUp.copy(bone.userData.aimUpAxis).applyQuaternion(_qBone);
  _vAimUp.addScaledVector(_vTarget, -_vAimUp.dot(_vTarget));
  _vDesiredUp.copy(_vModelUp).addScaledVector(_vTarget, -_vModelUp.dot(_vTarget));
  if (_vAimUp.lengthSq() > 1e-8 && _vDesiredUp.lengthSq() > 1e-8) {
    _vAimUp.normalize();
    _vDesiredUp.normalize();
    _qTwist.setFromUnitVectors(_vAimUp, _vDesiredUp);
    _qBone.premultiply(_qTwist);
  }
  return _qParent.invert().multiply(_qBone).clone();
}

// 生成一套不会破坏蒙皮的运行时骨骼控制器。
export function createZombieRig(inst) {
  const bones = {
    spine: findBone(inst, 'Spine02') || findBone(inst, 'Spine01'),
    head: findBone(inst, 'Head'),
    lArm: findBone(inst, 'L_Clavicle'),
    rArm: findBone(inst, 'R_Clavicle'),
    lForearm: findBone(inst, 'L_Forearm'),
    rForearm: findBone(inst, 'R_Forearm'),
    lHand: findBone(inst, 'L_Hand'),
    rHand: findBone(inst, 'R_Hand'),
  };
  const base = {};
  for (const [name, bone] of Object.entries(bones)) {
    if (bone) base[name] = bone.quaternion.clone();
  }
  const poses = { stance: {}, windup: {}, strike: {} };

  // 分别校准上臂和前臂，而不是只让“肩到手”的总向量朝前。后者会保留模型
  // 原始的内扣肘姿态，形成截图中的爱心袖/双手交叉。两段骨链同向才是真正平行。
  const makeArmPose = (poseName, side, upperDir, foreDir) => {
    const armKey = `${side}Arm`;
    const foreKey = `${side}Forearm`;
    const handKey = `${side}Hand`;
    const arm = bones[armKey];
    const forearm = bones[foreKey];
    const hand = bones[handKey];
    if (!arm || !forearm || !hand) return;
    arm.quaternion.copy(base[armKey]);
    forearm.quaternion.copy(base[foreKey]);
    inst.updateMatrixWorld(true);
    poses[poseName][armKey] = aimedLocalQuaternion(inst, arm, forearm, upperDir);
    arm.quaternion.copy(poses[poseName][armKey]);
    inst.updateMatrixWorld(true);
    poses[poseName][foreKey] = aimedLocalQuaternion(inst, forearm, hand, foreDir);
    arm.quaternion.copy(base[armKey]);
    forearm.quaternion.copy(base[foreKey]);
  };

  const forwardL = new THREE.Vector3(1, -0.08, -0.28);
  const forwardR = new THREE.Vector3(1, -0.08, 0.28);
  // 模型的肩点异常靠近中线，左右各留少量外展补偿；正面看是肩宽平行，手掌不重叠。
  makeArmPose('stance', 'l', forwardL, forwardL);
  makeArmPose('stance', 'r', forwardR, forwardR);
  // 蓄力：双臂略微上收；出击：上臂和前臂重新拉直，形成向前抓人的动作。
  makeArmPose('windup', 'l', new THREE.Vector3(0.72, 0.55, -0.22), new THREE.Vector3(0.4, 0.9, -0.22));
  makeArmPose('windup', 'r', new THREE.Vector3(0.72, 0.55, 0.22), new THREE.Vector3(0.4, 0.9, 0.22));
  makeArmPose('strike', 'l', new THREE.Vector3(1, -0.03, -0.2), new THREE.Vector3(1, -0.03, -0.2));
  makeArmPose('strike', 'r', new THREE.Vector3(1, -0.03, 0.2), new THREE.Vector3(1, -0.03, 0.2));
  const rig = { inst, bones, base, poses };
  applyZombieStance(rig);
  return rig;
}

export function applyZombieStance(rig) {
  for (const side of ['lArm', 'rArm', 'lForearm', 'rForearm']) {
    if (rig.bones[side] && rig.poses.stance[side]) rig.bones[side].quaternion.copy(rig.poses.stance[side]);
  }
}

function setParallelArms(rig, direction, spread = 0.28) {
  for (const side of ['l', 'r']) {
    const armKey = `${side}Arm`;
    const foreKey = `${side}Forearm`;
    const handKey = `${side}Hand`;
    const arm = rig.bones[armKey];
    const forearm = rig.bones[foreKey];
    const hand = rig.bones[handKey];
    if (!arm || !forearm || !hand) continue;
    arm.quaternion.copy(rig.poses.stance[armKey]);
    forearm.quaternion.copy(rig.poses.stance[foreKey]);
    rig.inst.updateMatrixWorld(true);
    const sideDirection = direction.clone();
    sideDirection.z += side === 'l' ? -spread : spread;
    arm.quaternion.copy(aimedLocalQuaternion(rig.inst, arm, forearm, sideDirection));
    rig.inst.updateMatrixWorld(true);
    forearm.quaternion.copy(aimedLocalQuaternion(rig.inst, forearm, hand, sideDirection));
  }
}

function setRigPose(rig, pose, amount) {
  for (const side of ['lArm', 'rArm', 'lForearm', 'rForearm']) {
    const bone = rig.bones[side];
    const from = rig.poses.stance[side];
    const to = rig.poses[pose][side];
    if (bone && from && to) bone.quaternion.copy(from).slerp(to, amount);
  }
}

// 三段式爪击：抬手蓄力 -> 双爪下劈 -> 收回。攻击由手臂主导，身体只轻微借力。
export function applyClawAttack(rig, t) {
  if (t < 0.34) setRigPose(rig, 'windup', THREE.MathUtils.smoothstep(t / 0.34, 0, 1));
  else if (t < 0.62) setRigPose(rig, 'strike', THREE.MathUtils.smoothstep((t - 0.34) / 0.28, 0, 1));
  else setRigPose(rig, 'strike', 1 - THREE.MathUtils.smoothstep((t - 0.62) / 0.38, 0, 1));
}

const DANCE_STYLE = {
  normal:  { speed: 2.0, arm: 0.34, sway: 0.15, bob: 0.025, phase: 0.0,  mode: 0 }, // 尸式广播操
  purple:  { speed: 2.8, arm: 0.48, sway: 0.11, bob: 0.035, phase: 0.7,  mode: 1 }, // 紫气摆臂舞
  white:   { speed: 1.45,arm: 0.25, sway: 0.22, bob: 0.018, phase: 1.2,  mode: 2 }, // 白毛慢摇
  green:   { speed: 3.2, arm: 0.38, sway: 0.18, bob: 0.045, phase: 1.8,  mode: 3 }, // 碧尸扭摆
  hairy:   { speed: 3.8, arm: 0.52, sway: 0.13, bob: 0.055, phase: 2.3,  mode: 1 }, // 毛僵甩手舞
  flying:  { speed: 4.3, arm: 0.42, sway: 0.2,  bob: 0.075, phase: 2.9,  mode: 3 }, // 腾云蹦迪
  drought: { speed: 1.8, arm: 0.4,  sway: 0.1,  bob: 0.035, phase: 3.5,  mode: 2 }, // 赤焰祭舞
  hou:     { speed: 2.35,arm: 0.58, sway: 0.12, bob: 0.045, phase: 4.1,  mode: 0 }, // 尸王战舞
};

// 图鉴专属舞步。只在安全关节上叠加小角度旋转，每一种的节奏和左右手编排不同。
export function animateZombieDance(rig, typeId, time, intensity = 1) {
  const s = DANCE_STYLE[typeId] || DANCE_STYLE.normal;
  const p = time * s.speed + s.phase;
  const wave = Math.sin(p);
  const beat = Math.sin(p * 2);
  const arms = [rig.bones.lArm, rig.bones.rArm];
  const bases = [rig.poses.stance.lArm, rig.poses.stance.rArm];
  arms.forEach((bone, i) => {
    if (!bone || !bases[i]) return;
    if (s.mode === 0) return; // mode 0 在脊柱动作完成后按世界方向重新校准双臂
    const side = i ? 1 : -1;
    let x = 0, y = 0, z = 0;
    if (s.mode === 1) { x = (i ? -wave : wave) * s.arm; y = side * beat * s.arm * 0.35; }
    if (s.mode === 2) { y = wave * s.arm * side; z = beat * s.arm * 0.45; }
    if (s.mode === 3) { x = Math.abs(wave) * s.arm; z = side * beat * s.arm * 0.7; }
    _qExtra.setFromEuler(new THREE.Euler(x * intensity, y * intensity, z * intensity));
    bone.quaternion.copy(bases[i]).multiply(_qExtra);
  });
  if (rig.bones.spine && rig.base.spine) {
    _qExtra.setFromEuler(new THREE.Euler(0, beat * s.sway * intensity, wave * s.sway * intensity));
    rig.bones.spine.quaternion.copy(rig.base.spine).multiply(_qExtra);
  }
  if (rig.bones.head && rig.base.head) {
    _qExtra.setFromEuler(new THREE.Euler(0, -beat * s.sway * 0.7 * intensity, 0));
    rig.bones.head.quaternion.copy(rig.base.head).multiply(_qExtra);
  }
  if (s.mode === 0) {
    // 镜像骨的局部轴相反，不能给左右肩乘同一个局部欧拉角；每帧统一对准
    // 同一个模型空间方向，才能保证广播操/尸王战舞全程真正平行。
    _vDanceDir.set(1, -0.08 + beat * s.arm * 0.2 * intensity, wave * s.arm * 0.12 * intensity);
    setParallelArms(rig, _vDanceDir);
  }
  return Math.max(0, wave) * s.bob * intensity;
}

// ===================== 管理器 =====================
export class ZombieManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.assets = {};        // typeId -> { scene, box }
    this.zombies = [];
    this.raycaster = new THREE.Raycaster();
    this._growlTimer = 2;
    this.onKill = null;
    this.onBossHp = null;    // (hp, maxHp) => void  BOSS 血条
  }

  // 按需加载一组类型
  async load(typeIds, onProgress) {
    const loader = new GLTFLoader();
    const need = typeIds.filter((t) => !this.assets[t]);
    let done = 0;
    await Promise.all(need.map(async (t) => {
      const cfg = ZOMBIE_TYPES[t];
      const gltf = await loader.loadAsync(cfg.file);
      gltf.scene.updateMatrixWorld(true);
      repairArmWeights(gltf.scene);
      // 用几何包围盒（绑定姿态）而非 setFromObject：蒙皮顶点路径遇坏骨骼会产出 NaN
      const box = new THREE.Box3();
      gltf.scene.traverse((n) => {
        if (n.isMesh || n.isSkinnedMesh) {
          n.castShadow = true;
          n.frustumCulled = false;
          if (n.material) n.material.roughness = 0.85;
          n.geometry.computeBoundingBox();
          box.union(n.geometry.boundingBox.clone().applyMatrix4(n.matrixWorld));
        }
      });
      this.assets[t] = { scene: gltf.scene, box };
      done++;
      onProgress?.(done / need.length);
    }));
  }

  // 构建实例（含骨骼克隆 + 僵尸姿态）
  buildModel(typeId) {
    const cfg = ZOMBIE_TYPES[typeId];
    const asset = this.assets[typeId];
    const inst = SkeletonUtils.clone(asset.scene);
    const size = new THREE.Vector3();
    asset.box.getSize(size);
    const s = cfg.height / (size.y || 1);
    inst.scale.setScalar(s);
    inst.position.y = -asset.box.min.y * s;
    inst.rotation.y = JIANGSHI_MODEL_YAW;
    const rig = createZombieRig(inst);

    const body = new THREE.Group();
    body.add(inst);
    const model = new THREE.Group();
    model.add(body);
    return { model, parts: { body, inst, bones: rig.bones, rig } };
  }

  spawn(typeId, position) {
    const cfg = ZOMBIE_TYPES[typeId];
    if (!cfg || !this.assets[typeId]) return null;
    const { model, parts } = this.buildModel(typeId);

    const group = new THREE.Group();
    group.add(model);
    group.position.copy(position);
    this.scene.add(group);

    const r = Math.max(0.32, 0.42 * (cfg.height / 1.75));
    const hitMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, cfg.height, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitMesh.position.y = cfg.height / 2;
    group.add(hitMesh);

    // 旱魃灼烧光环可视化
    let auraMesh = null;
    if (cfg.aura) {
      auraMesh = new THREE.Mesh(
        new THREE.RingGeometry(cfg.aura.radius - 0.25, cfg.aura.radius, 36),
        new THREE.MeshBasicMaterial({ color: 0xff5a20, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      );
      auraMesh.rotation.x = -Math.PI / 2;
      auraMesh.position.y = 0.06;
      group.add(auraMesh);
      const heat = new THREE.PointLight(0xff5020, 8, cfg.aura.radius + 2, 1.6);
      heat.position.y = 1.5;
      group.add(heat);
    }

    const z = {
      type: typeId, cfg, group, model, parts, hitMesh, auraMesh,
      hp: cfg.hp, maxHp: cfg.hp,
      state: 'chase',
      hopPhase: 'rest', hopT: Math.random() * cfg.restTime,
      hopDir: new THREE.Vector3(),
      attackT: 0, attackDealt: false, attackDur: 0.85,
      hitT: 0, deadT: 0, hitPunch: 0,
      // 犼冲撞
      chargeCd: cfg.charge ? cfg.charge.cooldown * 0.5 : 0,
      chargeT: 0, chargeDir: new THREE.Vector3(), chargeHit: false,
      speedJitter: 0.9 + Math.random() * 0.25,
      headY: cfg.height * 0.72,
      alive: true,
      swayT: Math.random() * 10,
    };
    hitMesh.userData.zombie = z;
    this.zombies.push(z);
    if (cfg.boss) this.onBossHp?.(z.hp, z.maxHp);
    return z;
  }

  get aliveCount() {
    return this.zombies.filter((z) => z.alive).length;
  }

  update(dt, playerPos, playerAlive, onPlayerDamage) {
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      z.swayT += dt;

      // 受击缩放冲击回弹
      if (z.hitPunch > 0) {
        z.hitPunch = Math.max(0, z.hitPunch - dt * 6);
        const s = 1 + z.hitPunch * 0.07;
        z.model.scale.set(s, 2 - s, s);
      } else if (z.model.scale.x !== 1) {
        z.model.scale.set(1, 1, 1);
      }

      if (z.state === 'dead') {
        z.deadT += dt;
        const fall = Math.min(1, z.deadT / 0.55);
        z.model.rotation.x = -fall * fall * (Math.PI / 2 - 0.06);
        z.model.position.y = 0;
        if (z.auraMesh) z.auraMesh.visible = false;
        if (z.deadT > 2.4) {
          z.group.position.y -= dt * 0.55;
          if (z.deadT > 3.8) {
            this.scene.remove(z.group);
            this.zombies.splice(i, 1);
          }
        }
        continue;
      }

      const toPlayer = new THREE.Vector3().subVectors(playerPos, z.group.position);
      toPlayer.y = 0;
      const dist = toPlayer.length();

      // 旱魃灼烧光环
      if (z.cfg.aura && playerAlive && dist < z.cfg.aura.radius) {
        onPlayerDamage(z.cfg.aura.dps * dt, true);   // true = 持续伤害（不触发大红闪）
      }

      // 面向玩家（空中/冲撞中转向受限）
      if (dist > 0.01 && z.state !== 'hit' && z.state !== 'charging') {
        const targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
        let d = targetYaw - z.group.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const turnRate = z.hopPhase === 'air' ? 0.8 : 5;
        z.group.rotation.y += d * Math.min(1, turnRate * dt);
      }

      switch (z.state) {
        case 'chase': {
          if (!playerAlive) { this.animateIdle(z, dt); break; }
          // 犼：冷却好且中距离时发动冲撞
          if (z.cfg.charge) {
            z.chargeCd -= dt;
            if (z.chargeCd <= 0 && dist > 5 && dist < 22 && z.hopPhase !== 'air') {
              z.state = 'windup';
              z.chargeT = 0;
              Audio.growl();
              break;
            }
          }
          if (dist <= z.cfg.attackRange && z.hopPhase !== 'air') {
            z.state = 'attack';
            z.attackT = 0;
            z.attackDealt = false;
            break;
          }
          this.animateHop(z, dt, toPlayer, dist);
          break;
        }
        case 'windup': {   // 犼冲撞蓄力（前兆）
          z.chargeT += dt;
          const t = z.chargeT / z.cfg.charge.windup;
          z.parts.body.rotation.x = 0.3 * Math.sin(t * Math.PI * 3) * (1 - t) - 0.25 * t;
          z.model.position.y = 0;
          if (t >= 1) {
            z.state = 'charging';
            z.chargeT = 0;
            z.chargeHit = false;
            z.chargeDir.copy(toPlayer).normalize();
            Audio.waveHorn();
          }
          break;
        }
        case 'charging': {   // 犼冲撞
          z.chargeT += dt;
          const c = z.cfg.charge;
          z.parts.body.rotation.x = -0.35;
          z.group.position.x += z.chargeDir.x * c.speed * dt;
          z.group.position.z += z.chargeDir.z * c.speed * dt;
          this.world.collide(z.group.position, 0.5, 0, z.cfg.height);
          if (!z.chargeHit && playerAlive) {
            const d2 = Math.hypot(playerPos.x - z.group.position.x, playerPos.z - z.group.position.z);
            if (d2 < 1.6) {
              z.chargeHit = true;
              onPlayerDamage(c.damage);
            }
          }
          if (z.chargeT >= c.duration) {
            z.state = 'chase';
            z.chargeCd = c.cooldown;
            z.parts.body.rotation.x = 0;
          }
          break;
        }
        case 'attack': {
          z.attackT += dt;
          const t = z.attackT / z.attackDur;
          applyClawAttack(z.parts.rig, Math.min(1, t));
          // 身体仅在出爪瞬间轻微借力，不再用头和躯干撞击。
          const push = Math.sin(THREE.MathUtils.clamp((t - 0.32) / 0.55, 0, 1) * Math.PI);
          z.parts.body.rotation.x = push * 0.07;
          z.parts.body.position.z = push * 0.16;
          if (!z.attackDealt && t >= 0.55) {
            z.attackDealt = true;
            if (playerAlive && dist <= z.cfg.attackRange + 0.6) onPlayerDamage(z.cfg.damage);
          }
          if (t >= 1) {
            z.parts.body.rotation.x = 0;
            z.parts.body.position.z = 0;
            applyZombieStance(z.parts.rig);
            z.state = 'chase';
          }
          break;
        }
        case 'hit': {
          z.hitT -= dt;
          z.parts.body.rotation.x = -0.25 * Math.max(0, z.hitT / 0.35);
          if (z.hitT <= 0) {
            z.parts.body.rotation.x = 0;
            z.state = 'chase';
          }
          break;
        }
      }

      // 分离 + 场景碰撞
      if (z.state !== 'dead' && z.state !== 'charging') {
        for (const other of this.zombies) {
          if (other === z || !other.alive) continue;
          const dx = z.group.position.x - other.group.position.x;
          const dz = z.group.position.z - other.group.position.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 0.8 && d2 > 0.0001) {
            const d = Math.sqrt(d2);
            z.group.position.x += (dx / d) * (0.9 - d) * dt * 3;
            z.group.position.z += (dz / d) * (0.9 - d) * dt * 3;
          }
        }
        this.world.collide(z.group.position, 0.4, 0, z.cfg.height);
      }

      if (z.cfg.boss) this.onBossHp?.(Math.max(0, z.hp), z.maxHp);
    }

    this._growlTimer -= dt;
    if (this._growlTimer <= 0) {
      this._growlTimer = 1.5 + Math.random() * 2.5;
      const near = this.zombies.find((zz) => zz.alive && zz.group.position.distanceTo(playerPos) < 16);
      if (near) Audio.growl();
    }
  }

  animateHop(z, dt, toPlayer, dist) {
    const cfg = z.cfg;
    z.hopT += dt;
    if (z.hopPhase === 'rest') {
      const t = z.hopT / cfg.restTime;
      const crouch = Math.sin(Math.min(1, t) * Math.PI) * 0.12;
      z.parts.body.scale.y = 1 - crouch;
      z.parts.body.rotation.x = crouch * 0.6;
      z.model.position.y = 0;
      if (z.hopT >= cfg.restTime) {
        z.hopPhase = 'air';
        z.hopT = 0;
        z.hopDir.copy(toPlayer).normalize();
        Audio.footstep();
      }
    } else {
      const airTime = cfg.hopTime;
      const t = Math.min(1, z.hopT / airTime);
      z.model.position.y = cfg.hopHeight * 4 * t * (1 - t);
      z.parts.body.scale.y = 1 + Math.sin(t * Math.PI) * 0.05;
      z.parts.body.rotation.x = -0.12 * Math.sin(t * Math.PI);
      const cycle = cfg.hopTime + cfg.restTime;
      const hopLen = Math.min(cfg.speed * cycle * z.speedJitter, Math.max(0.2, dist - 0.6));
      const v = hopLen / airTime;
      z.group.position.x += z.hopDir.x * v * dt;
      z.group.position.z += z.hopDir.z * v * dt;
      if (z.hopT >= airTime) {
        z.hopPhase = 'rest';
        z.hopT = 0;
        z.model.position.y = 0;
        Audio.footstep();
      }
    }
  }

  animateIdle(z, dt) {
    z.model.position.y = 0;
    z.parts.body.scale.y = 1;
    z.parts.body.rotation.x = Math.sin(z.swayT * 1.2) * 0.03;
  }

  raycastShot(origin, dir, range) {
    this.raycaster.set(origin, dir);
    this.raycaster.far = range;
    const meshes = [];
    for (const z of this.zombies) {
      if (z.alive) meshes.push(z.hitMesh);
    }
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const hit = hits[0];
    const z = hit.object.userData.zombie;
    const localY = hit.point.y - z.group.position.y - z.model.position.y;
    return { zombie: z, point: hit.point, headshot: localY >= z.headY };
  }

  /**
   * @param dmgType 'bullet' | 'fire' | 'melee' —— 按僵尸设定加成/减免
   */
  applyDamage(z, dmg, headshot, knock = 0, knockDir = null, dmgType = 'bullet') {
    if (!z.alive) return false;
    const mult = dmgType === 'bullet' ? (z.cfg.bulletMult ?? 1)
      : dmgType === 'fire' ? (z.cfg.fireMult ?? 1) : 1;
    z.hp -= dmg * mult;
    z.hitPunch = 1;
    if (knock > 0 && knockDir && !z.cfg.boss) {
      const mass = Math.pow(1.75 / z.cfg.height, 1.5);
      z.group.position.x += knockDir.x * knock * mass;
      z.group.position.z += knockDir.z * knock * mass;
      this.world.collide(z.group.position, 0.4, 0, z.cfg.height);
    }
    if (z.hp <= 0) {
      z.alive = false;
      z.state = 'dead';
      z.deadT = 0;
      z.parts.body.rotation.x = 0;
      z.parts.body.position.z = 0;
      z.parts.body.scale.y = 1;
      Audio.zombieDie();
      this.onKill?.(z, headshot);
      return true;
    }
    if (z.state === 'chase' && z.hopPhase !== 'air' && !z.cfg.boss && (headshot || Math.random() < 0.3)) {
      z.state = 'hit';
      z.hitT = 0.35;
    }
    return false;
  }

  // 火符 AOE
  fireExplosion(center, radius, damage) {
    let hits = 0;
    for (const z of this.zombies) {
      if (!z.alive) continue;
      const d = Math.hypot(z.group.position.x - center.x, z.group.position.z - center.z);
      if (d < radius + 0.4) {
        const dir = new THREE.Vector3(z.group.position.x - center.x, 0, z.group.position.z - center.z).normalize();
        this.applyDamage(z, damage, false, 0.6, dir, 'fire');
        hits++;
      }
    }
    return hits;
  }

  clear() {
    for (const z of this.zombies) this.scene.remove(z.group);
    this.zombies.length = 0;
  }
}

// ===================== 关卡波次 =====================
export class WaveDirector {
  constructor(zombieManager, spawnPoints) {
    this.zm = zombieManager;
    this.spawnPoints = spawnPoints;
    this.levelWaves = [];     // 本关的波次定义
    this.wave = 0;
    this.pending = [];
    this.spawnTimer = 0;
    this.betweenWaves = false;
    this.waveDelay = 0;
    this.finished = false;    // 全部波次清完
    this.onWaveStart = null;
    this.onWaveClear = null;
    this.onLevelClear = null;
  }

  startLevel(waves) {
    this.levelWaves = waves;
    this.wave = 0;
    this.pending = [];
    this.betweenWaves = false;
    this.waveDelay = 0;
    this.finished = false;
    this.startNextWave();
  }

  composeWave(def) {
    const list = [];
    for (const [type, count] of Object.entries(def)) {
      if (type.startsWith('__')) continue;
      for (let i = 0; i < count; i++) list.push(type);
    }
    // 打乱出场顺序
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  startNextWave() {
    if (this.wave >= this.levelWaves.length) return;
    this.wave++;
    this.pending = this.composeWave(this.levelWaves[this.wave - 1]);
    this.spawnTimer = 0;
    this.betweenWaves = false;
    this.onWaveStart?.(this.wave, this.levelWaves.length, this.pending.length);
  }

  update(dt, playerPos) {
    if (this.finished) return;
    if (this.betweenWaves) {
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) this.startNextWave();
      return;
    }
    if (this.pending.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 0.5 + Math.random() * 0.5;
        this.zm.spawn(this.pending.shift(), this.pickSpawn(playerPos));
      }
    } else if (this.zm.aliveCount === 0 && this.zm.zombies.length === 0) {
      if (this.wave >= this.levelWaves.length) {
        this.finished = true;
        this.onLevelClear?.();
      } else {
        this.betweenWaves = true;
        this.waveDelay = 4;
        this.onWaveClear?.(this.wave);
      }
    }
  }

  pickSpawn(playerPos) {
    const sorted = [...this.spawnPoints].sort(
      (a, b) => b.distanceToSquared(playerPos) - a.distanceToSquared(playerPos)
    );
    const idx = Math.floor(Math.random() * Math.min(5, sorted.length));
    const base = sorted[idx];
    return new THREE.Vector3(
      base.x + (Math.random() - 0.5) * 4,
      0,
      base.z + (Math.random() - 0.5) * 4
    );
  }
}
