import * as THREE from 'three';
import { getTemplate } from '../gfx/characters.js';
import { instantiate } from '../gfx/rig.js';

const q = new URLSearchParams(location.search);
const ids = (q.get('ids') || 'priest,normal,purple,white,green,hairy,flying').split(',');
const pose = q.get('pose') || 'none';
const yaw = parseFloat(q.get('yaw') || '0');
const zoom = parseFloat(q.get('zoom') || '1');
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(innerWidth, innerHeight);
r.toneMapping = THREE.ACESFilmicToneMapping;
r.shadowMap.enabled = true;
document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6a6e74);
scene.add(new THREE.HemisphereLight(0xdde6ff, 0x3a3228, 1.6));
const d = new THREE.DirectionalLight(0xffffff, 2.4); d.position.set(3, 6, 5); d.castShadow = true; scene.add(d);
const gnd = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x55585c })); gnd.rotation.x = -Math.PI / 2; gnd.receiveShadow = true; scene.add(gnd);
const gap = 1.0;
const insts = [];
ids.forEach((id, i) => {
  const t = getTemplate(id);
  const inst = instantiate(t);
  inst.root.position.x = (i - (ids.length - 1) / 2) * gap;
  inst.root.rotation.y = yaw;
  scene.add(inst.root);
  insts.push(inst);
  const b = inst.bones;
  if (pose === 'hop') {
    import('../gfx/anim.js').then(() => {});
  }
  if (pose === 'zombie') {
    for (const s of ['L', 'R']) { b['arm_' + s].rotation.x = -1.45; b['arm_' + s].rotation.z = s === 'L' ? -0.25 : 0.25; b['hand_' + s].rotation.x = 0.5; }
  } else if (pose === 'walk') {
    b.thigh_L.rotation.x = -0.6; b.shin_L.rotation.x = 0.5; b.thigh_R.rotation.x = 0.5; b.shin_R.rotation.x = 0.3;
    b.arm_L.rotation.x = 0.5; b.arm_R.rotation.x = -0.5; b.fore_R.rotation.x = -0.6; b.spine.rotation.y = 0.2; b.head.rotation.y = 0.4;
  }
});
const w = ids.length * gap;
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 100);
const dist = Math.max(4.2, w * 1.25) / zoom;
const ty = parseFloat(q.get('ty') || (zoom > 1 ? '1.35' : '1.0'));
cam.position.set(parseFloat(q.get('cx') || '0'), ty + 0.1, dist);
cam.lookAt(0, ty, 0);
r.render(scene, cam);
window.done = true;
