import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.module.js";

let scene, camera, renderer;
let analyser, audioData;
let sigil;

const FFT_SIZE = 1024;
let audioCtx, source;

/* ================= INIT ================= */

init();
animate();

async function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.z = 6;

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMappingExposure = 1.25;

  document.getElementById("canvas-container")?.appendChild(renderer.domElement)
    || document.body.appendChild(renderer.domElement);

  await setupAudio();
  loadSigil();

  window.addEventListener("resize", onResize);
}

/* ================= AUDIO ================= */

async function setupAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  source = audioCtx.createMediaStreamSource(stream);

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0.7;

  source.connect(analyser);
  audioData = new Uint8Array(analyser.frequencyBinCount);
}

/* ================= SIGIL ================= */

function loadSigil() {
  const texture = new THREE.TextureLoader().load("./media/indjoov-sigil.svg");

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    color: new THREE.Color(0.5, 1.0, 1.2)
  });

  material.toneMapped = false;

  const geometry = new THREE.PlaneGeometry(3.4, 3.4);
  sigil = new THREE.Mesh(geometry, material);

  sigil.userData = {
    baseScale: 1,
    snap: 0
  };

  scene.add(sigil);
}

/* ================= ANALYSIS ================= */

function analyse() {
  analyser.getByteFrequencyData(audioData);

  let bass = 0;
  let snap = 0;
  let total = 0;

  for (let i = 0; i < audioData.length; i++) {
    const v = audioData[i];
    total += v;

    if (i < 40) bass += v;           // Bass
    if (i > 90 && i < 180) snap += v; // Snare snap
  }

  bass /= 40;
  snap /= 90;
  total /= audioData.length;

  return {
    bass: bass / 255,
    snap: snap / 255,
    energy: total / 255
  };
}

/* ================= ANIMATE ================= */

function animate() {
  requestAnimationFrame(animate);
  if (!analyser || !sigil) return;

  const { bass, snap, energy } = analyse();

  // Ritual snap memory
  const hit = Math.min(1, bass * 5.5 + snap * 7.2);
  sigil.userData.snap = sigil.userData.snap * 0.82 + hit * 0.9;

  const s = sigil.userData.snap;

  // SCALE — brutal punch
  const scale = 1 + energy * 0.3 + s * 1.25;
  sigil.scale.setScalar(scale);

  // ROTATION — snare driven
  sigil.rotation.z += s * 0.15;

  // OPACITY — never vanish
  sigil.material.opacity = Math.min(1, 0.7 + s * 0.5);

  // COLOR — cyan ↔ purple glow
  const color = new THREE.Color().setHSL(
    0.78 - s * 0.2,
    1.0,
    0.6 + s * 0.25
  );
  color.multiplyScalar(1.4);
  sigil.material.color.copy(color);

  renderer.render(scene, camera);
}

/* ================= RESIZE ================= */

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
