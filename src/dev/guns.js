import * as THREE from 'three';
import { GUN_BUILDERS } from '../gfx/guns.js';
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(innerWidth, innerHeight); r.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x505458);
scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 1.5));
const d = new THREE.DirectionalLight(0xffffff, 3); d.position.set(3, 4, 2); scene.add(d);
const pm = new THREE.PMREMGenerator(r); scene.environment = pm.fromScene(new (await import('three/addons/environments/RoomEnvironment.js')).RoomEnvironment(), 0.04).texture;
const ids = Object.keys(GUN_BUILDERS);
ids.forEach((id, i) => {
  const g = GUN_BUILDERS[id]();
  g.rotation.y = Math.PI / 2;
  g.position.set((i % 3 - 1) * 1.0, 0.6 - Math.floor(i / 3) * 0.55, 0);
  scene.add(g);
});
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 50);
cam.position.set(0, 0.5, 2.6); cam.lookAt(0, 0.33, 0);
r.render(scene, cam); window.done = true;
