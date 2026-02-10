import * as THREE from "three";
import { AudioEngine } from "./audio/AudioEngine.js";

// Postprocessing
import { EffectComposer } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "https://unpkg.com/three@0.160.0/examples/jsm/shaders/FXAAShader.js";

// Performance Art Postprocessing
import { AfterimagePass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/AfterimagePass.js";
import { GlitchPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/GlitchPass.js";
import { RGBShiftShader } from "https://unpkg.com/three@0.160.0/examples/jsm/shaders/RGBShiftShader.js";

/* ================= BASIC SETUP ================= */

const canvas = document.getElementById("viz");
const stageEl = canvas.closest(".stage");

const srText = document.getElementById("srText");
const sens = document.getElementById("sens");
const palette = document.getElementById("palette");

const micBtn = document.getElementById("micBtn");
const fileBtn = document.getElementById("fileBtn");
const demoBtn = document.getElementById("demoBtn");
const fileInput = document.getElementById("fileInput");

// a11y live region
if (srText) {
  srText.setAttribute("aria-live", "polite");
  srText.setAttribute("role", "status");
}
function setStatus(msg) {
  if (srText) srText.textContent = msg;
}

/* ================= OVERLAY ================= */

const overlay = document.createElement("div");
overlay.id = "intro-overlay";
overlay.style.cssText = `
  position:fixed; inset:0; z-index:3000;
  display:flex; align-items:center; justify-content:center;
  padding: calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));
  background: rgba(0,0,0,0.92);
  cursor:pointer;
`;
overlay.innerHTML = `
  <div style="
    width: min(92vw, 560px);
    text-align:center;
    color:white;
    font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    background: rgba(5,5,5,0.94);
    padding: clamp(22px, 6vw, 56px);
    border-radius: 22px;
    border: 1px solid rgba(0,212,255,0.55);
    box-shadow: 0 0 70px rgba(0,212,255,.22);
  ">
    <h1 style="
      margin:0 0 12px;
      letter-spacing: clamp(6px, 2.6vw, 14px);
      font-size: clamp(22px, 6.5vw, 44px);
      line-height: 1.05;
    ">SONIC<br/>INCLUSION</h1>

    <p style="
      margin:0;
      opacity:.65;
      letter-spacing: clamp(2px, 1.2vw, 6px);
      font-size: clamp(11px, 3.2vw, 14px);
    ">CLICK TO INITIALIZE</p>
  </div>
`;
document.body.appendChild(overlay);

/* ================= ENGINE (AUDIO) ================= */

const engine = new AudioEngine();
let raf = null;

let analyser = null;
let dataFreq = null;

let inputGain = null;
let monitorGain = null;

let currentMode = "idle";
let bufferSrc = null;
let micStream = null;
let micSourceNode = null;

/* ================= THREE STATE ================= */

let renderer = null;
let scene = null;
let camera = null;

let composer = null;
let bloomPass = null;
let fxaaPass = null;

let world = null;       
let starPoints = null;  
let morphMesh = null;   

// Performance Art State
let coreLight = null;       
let afterimagePass = null;  
let rgbShiftPass = null;    
let glitchPass = null;      
let sparkPool = [];         
let sparkCursor = 0;
let baseFov = 55;           

// Sigil layers
let sigilGroup = null;
let sigilBase = null;
let sigilGlow = null;
let sigilBaseBack = null; 
let sigilGlowBack = null; 

let sigilBaseTex = null;
let sigilGlowTex = null;

// Pools
let ringPool = [];
let ringCursor = 0;
let ghostPool = [];
let ghostCursor = 0;

/* ================= A11Y / REDUCED MOTION ================= */

let reducedMotion = false;

/* ================= MIC MONITOR ================= */

let micMonitor = false;
let micMonitorVol = 0.35;
let feedbackMuted = false;

function applyMicMonitorGain() {
  if (!monitorGain) return;
  const want = currentMode === "mic" && micMonitor && !feedbackMuted ? micMonitorVol : 0;
  monitorGain.gain.value = want;
}

/* ================= MODERN HUD ================= */

function removeLegacyUI() {
  document.getElementById("si-hud")?.remove();
  document.getElementById("si-enginePanel")?.remove();
}
removeLegacyUI();

const hud = document.createElement("div");
hud.id = "si-hud";
hud.style.cssText = `
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom));
  z-index: 2000;
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
  box-sizing: border-box;
  max-width: 980px;
  margin: 0 auto;
`;

const recBtn = document.createElement("button");
recBtn.id = "si-recBtn";
recBtn.type = "button";
recBtn.textContent = "⏺ RECORD";
recBtn.style.cssText = `
  pointer-events: auto;
  background: #ff2b5a;
  color: #111;
  border: 1px solid rgba(255,255,255,0.15);
  padding: 12px 16px;
  border-radius: 999px;
  font-weight: 900;
  letter-spacing: 0.5px;
  box-shadow: 0 12px 30px rgba(255,43,90,0.25);
  display: inline-flex;
  align-items: center;
  gap: 10px;
`;

const engineToggle = document.createElement("button");
engineToggle.id = "si-engineToggle";
engineToggle.type = "button";
engineToggle.textContent = "⚙️ ENGINE";
engineToggle.style.cssText = `
  pointer-events: auto;
  flex: 0 0 auto;
  background: rgba(10,10,10,0.85);
  color: #8feaff;
  border: 1px solid rgba(0,212,255,0.65);
  padding: 12px 16px;
  border-radius: 999px;
  font-weight: 900;
  letter-spacing: 2px;
  box-shadow: 0 0 0 1px rgba(0,212,255,0.15), 0 16px 40px rgba(0,212,255,0.12);
`;

hud.appendChild(recBtn);
hud.appendChild(engineToggle);
document.body.appendChild(hud);

/* ================= ENGINE PANEL ================= */

const enginePanel = document.createElement("div");
enginePanel.id = "si-enginePanel";
enginePanel.style.cssText = `
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(74px + env(safe-area-inset-bottom));
  z-index: 2001;
  max-width: 980px;
  margin: 0 auto;
  background: rgba(10,10,10,0.92);
  border: 1px solid rgba(0,212,255,0.65);
  border-radius: 18px;
  padding: 14px 14px 12px;
  color: #fff;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  backdrop-filter: blur(12px);
  box-shadow: 0 18px 60px rgba(0,0,0,0.55);
  display: none;
  box-sizing: border-box;
`;

enginePanel.innerHTML = `
  <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px;">
    <div style="display:flex; align-items:center; gap:10px;">
      <div style="width:36px; height:36px; border-radius:12px; border:1px solid rgba(0,212,255,0.5);
                  display:flex; align-items:center; justify-content:center; color:#8feaff;">⚙️</div>
      <div>
        <div style="font-weight:900; letter-spacing:3px; color:#8feaff;">ENGINE</div>
        <div style="font-size:12px; opacity:0.65;">Swipe down to close</div>
      </div>
    </div>
    <button id="si-engineClose" type="button" style="
      background: transparent; border: 1px solid rgba(255,255,255,0.18);
      color: #fff; border-radius: 12px; padding: 8px 10px; cursor: pointer; font-weight: 900;
    ">✕</button>
  </div>

  <div style="display:grid; gap:10px;">
    <div style="display:grid; gap:8px; padding:10px; border:1px solid rgba(255,255,255,0.10); border-radius:14px;">
      <div style="font-weight:900; letter-spacing:2px; font-size:12px; opacity:0.85;">CHAPTER</div>
      <div style="display:flex; gap:8px;">
        <button id="chapInv" type="button" style="flex:1; border-radius:12px; padding:10px; cursor:pointer;">INVOCATION</button>
        <button id="chapPos" type="button" style="flex:1; border-radius:12px; padding:10px; cursor:pointer;">POSSESSION</button>
        <button id="chapAsc" type="button" style="flex:1; border-radius:12px; padding:10px; cursor:pointer;">ASCENSION</button>
      </div>
    </div>

    <label style="font-size:12px; opacity:0.8;">
      STARS (amount)
      <input id="partAmount" type="range" min="0" max="30" value="10" style="width:100%; margin-top:6px;">
    </label>

    <label style="font-size:12px; opacity:0.8;">
      BASS ZOOM (object)
      <input id="zoomInt" type="range" min="0" max="100" value="18" style="width:100%; margin-top:6px;">
    </label>

    <label style="font-size:12px; opacity:0.8;">
      HUE
      <input id="hueShift" type="range" min="0" max="360" value="280" style="width:100%; margin-top:6px;">
    </label>

    <label style="font-size:12px; display:flex; align-items:center; gap:10px;">
      <input id="reducedMotion" type="checkbox">
      Reduced Motion
    </label>

    <div style="padding-top:10px; border-top:1px solid rgba(255,255,255,0.12);">
      <label style="font-size:12px; display:flex; align-items:center; gap:10px;">
        <input id="micMonitor" type="checkbox">
        <span>Mic Monitor</span>
      </label>

      <label style="font-size:12px; opacity:0.8; display:block; margin-top:10px;">
        Monitor Volume
        <input id="micMonitorVol" type="range" min="0" max="100" value="35" style="width:100%; margin-top:6px;">
      </label>

      <div id="feedbackWarn" style="display:none; margin-top:10px; font-size:12px; color:#ff2b5a; font-weight:900;">
        🔇 Feedback risk detected — mic monitor muted
      </div>
    </div>
  </div>
`;
document.body.appendChild(enginePanel);

let engineOpen = false;
function setEngineOpen(open) {
  engineOpen = open;
  enginePanel.style.display = open ? "block" : "none";
}
engineToggle.addEventListener("click", () => setEngineOpen(!engineOpen));
enginePanel.querySelector("#si-engineClose").addEventListener("click", () => setEngineOpen(false));

let touchStartY = null;
enginePanel.addEventListener("touchstart", (e) => {
  touchStartY = e.touches?.[0]?.clientY ?? null;
}, { passive: true });
enginePanel.addEventListener("touchmove", (e) => {
  if (touchStartY == null) return;
  const dy = (e.touches?.[0]?.clientY ?? touchStartY) - touchStartY;
  if (dy > 50) {
    setEngineOpen(false);
    touchStartY = null;
  }
}, { passive: true });

const partEl = enginePanel.querySelector("#partAmount");
const zoomEl = enginePanel.querySelector("#zoomInt");
const hueEl  = enginePanel.querySelector("#hueShift");

enginePanel.querySelector("#reducedMotion").addEventListener("change", (e) => reducedMotion = !!e.target.checked);

const micMonitorEl = enginePanel.querySelector("#micMonitor");
const micMonitorVolEl = enginePanel.querySelector("#micMonitorVol");
const feedbackWarnEl = enginePanel.querySelector("#feedbackWarn");

micMonitorEl.checked = micMonitor;
micMonitorVolEl.value = String(Math.round(micMonitorVol * 100));

micMonitorEl.addEventListener("change", (e) => {
  micMonitor = !!e.target.checked;
  feedbackMuted = false;
  feedbackWarnEl.style.display = "none";
  applyMicMonitorGain();
  setStatus(micMonitor ? "🎙️ Mic monitor ON" : "🎙️ Mic monitor OFF");
});

micMonitorVolEl.addEventListener("input", (e) => {
  micMonitorVol = Math.max(0, Math.min(1, parseInt(e.target.value, 10) / 100));
  applyMicMonitorGain();
});

/* ================= CHAPTER SYSTEM ================= */

const CHAPTERS = {
  INVOCATION: {
    starsOpacity: 0.16, cageOpacityBase: 0.22, sigilInk: 0.90, glowBase: 0.28,
    glowBass: 0.35, glowSnap: 0.55, jitter: 0.010, ringStrength: 0.75,
    ghostCount: 2, bloomStrength: 0.65, bloomRadius: 0.45, bloomThreshold: 0.18,
  },
  POSSESSION: {
    starsOpacity: 0.20, cageOpacityBase: 0.26, sigilInk: 0.88, glowBase: 0.38,
    glowBass: 0.55, glowSnap: 0.95, jitter: 0.020, ringStrength: 1.00,
    ghostCount: 3, bloomStrength: 0.95, bloomRadius: 0.55, bloomThreshold: 0.14,
  },
  ASCENSION: {
    starsOpacity: 0.24, cageOpacityBase: 0.30, sigilInk: 0.84, glowBase: 0.50,
    glowBass: 0.85, glowSnap: 1.05, jitter: 0.016, ringStrength: 1.15,
    ghostCount: 4, bloomStrength: 1.25, bloomRadius: 0.65, bloomThreshold: 0.10,
  },
};

let chapter = "POSSESSION";
let P = CHAPTERS[chapter];

function applyChapter(name) {
  if (!CHAPTERS[name]) return;
  chapter = name;
  P = CHAPTERS[chapter];
  if (bloomPass) {
    bloomPass.strength = P.bloomStrength;
    bloomPass.radius = P.bloomRadius;
    bloomPass.threshold = P.bloomThreshold;
  }
  setStatus(`🔮 Chapter: ${chapter}`);
}

enginePanel.querySelector("#chapInv").addEventListener("click", () => applyChapter("INVOCATION"));
enginePanel.querySelector("#chapPos").addEventListener("click", () => applyChapter("POSSESSION"));
enginePanel.querySelector("#chapAsc").addEventListener("click", () => applyChapter("ASCENSION"));

/* ================= RESIZE ================= */

function fitRendererToStage() {
  if (!renderer || !camera) return;
  const rect = (stageEl || canvas).getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  const dpr = Math.max(1, Math.min(2.6, window.devicePixelRatio || 1));
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  composer?.setSize(w, h);
  if (fxaaPass) {
    fxaaPass.material.uniforms["resolution"].value.set(1 / (w * dpr), 1 / (h * dpr));
  }
}
const ro = new ResizeObserver(() => fitRendererToStage());
if (stageEl) ro.observe(stageEl);
window.addEventListener("resize", fitRendererToStage);

/* ================= THREE INIT ================= */

function initThree() {
  if (renderer) return;

  renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true,
    powerPreference: "high-performance"
  });
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.4)); 

  camera = new THREE.PerspectiveCamera(baseFov, 1, 0.1, 260);
  camera.position.set(0, 0, 18);

  coreLight = new THREE.PointLight(0x00d4ff, 0, 50); 
  coreLight.position.set(0, 0, 0);
  scene.add(coreLight);

  world = new THREE.Group();
  scene.add(world);

  starPoints = makeStars(1900, 120);
  scene.add(starPoints);

  makeMorphingCage();
  initRings();
  initGhosts();
  initSparks();
  loadSigilLayers("media/indjoov-sigil.svg");

  const rt = new THREE.WebGLRenderTarget(1, 1, { samples: renderer.capabilities.isWebGL2 ? 4 : 0 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));

  afterimagePass = new AfterimagePass();
  afterimagePass.uniforms["damp"].value = 0.85; 
  composer.addPass(afterimagePass);

  const rect = (stageEl || canvas).getBoundingClientRect();
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(Math.max(1, rect.width), Math.max(1, rect.height)),
    1.0, 0.55, 0.12
  );
  composer.addPass(bloomPass);

  rgbShiftPass = new ShaderPass(RGBShiftShader);
  rgbShiftPass.uniforms['amount'].value = 0.0015; 
  composer.addPass(rgbShiftPass);

  glitchPass = new GlitchPass();
  glitchPass.goWild = false; 
  glitchPass.enabled = false; 
  composer.addPass(glitchPass);

  fxaaPass = new ShaderPass(FXAAShader);
  composer.addPass(fxaaPass);

  fitRendererToStage();
  applyChapter(chapter);
}

/* ================= IMPROVED STARS (WARP FIELD) ================= */

let starGeo = null;

function makeStars(count, spread) {
  starGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = []; 

  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    positions[ix] = (Math.random() - 0.5) * spread * 1.5; 
    positions[ix + 1] = (Math.random() - 0.5) * spread * 1.5;
    positions[ix + 2] = (Math.random() - 0.5) * spread * 2; 
    velocities.push(0.05 + Math.random() * 0.25);
  }

  starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  
  const mat = new THREE.PointsMaterial({
    color: 0x8feaff, 
    size: 0.08,      
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  
  starGeo.userData = { velocities: velocities, spread: spread };
  return new THREE.Points(starGeo, mat);
}

function updateStars(delta) {
  if (!starPoints || !starGeo) return;
  
  const positions = starGeo.attributes.position.array;
  const vels = starGeo.userData.velocities;
  const spread = starGeo.userData.spread;
  
  const warpSpeed = 1 + (bassSm * 8); 

  for (let i = 0; i < vels.length; i++) {
    const ix = i * 3;
    positions[ix + 2] += vels[i] * warpSpeed * delta * 20;

    if (positions[ix + 2] > 20) {
      positions[ix + 2] = -150; 
      positions[ix] = (Math.random() - 0.5) * spread * 1.5;
      positions[ix + 1] = (Math.random() - 0.5) * spread * 1.5;
    }
  }
  
  starGeo.attributes.position.needsUpdate = true;
}

/* ================= MORPHING CAGE (TRUE MORPH) ================= */

function makeMorphingCage() {
  if (morphMesh) {
    world.remove(morphMesh);
    morphMesh.geometry.dispose();
  }

  const baseGeo = new THREE.IcosahedronGeometry(5.0, 5); 
  const posAttribute = baseGeo.attributes.position;
  
  const cubePositions = [];
  const spikePositions = [];
  const vec = new THREE.Vector3();

  for (let i = 0; i < posAttribute.count; i++) {
    vec.fromBufferAttribute(posAttribute, i);
    
    const norm = vec.clone().normalize();
    const maxVal = Math.max(Math.abs(norm.x), Math.abs(norm.y), Math.abs(norm.z));
    const cubeVec = norm.divideScalar(maxVal).multiplyScalar(4.5); 
    cubePositions.push(cubeVec.x, cubeVec.y, cubeVec.z);

    const noise = Math.sin(vec.x * 0.5) * Math.cos(vec.y * 0.5) * Math.sin(vec.z * 0.5);
    const spikeScale = 1.0 + Math.abs(noise) * 1.5; 
    const spikeVec = vec.clone().multiplyScalar(spikeScale);
    spikePositions.push(spikeVec.x, spikeVec.y, spikeVec.z);
  }

  baseGeo.morphAttributes.position = [
    new THREE.Float32BufferAttribute(cubePositions, 3),  
    new THREE.Float32BufferAttribute(spikePositions, 3)  
  ];

  const mat = new THREE.MeshBasicMaterial({
    color: 0x00d4ff,
    wireframe: true, 
    transparent: true,
    opacity: 0.35,
    morphTargets: true, 
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false 
  });

  morphMesh = new THREE.Mesh(baseGeo, mat);
  world.add(morphMesh);
}

/* ================= RITUAL RINGS ================= */

function initRings() {
  ringPool.forEach(r => {
    world?.remove(r.mesh);
    r.mesh.geometry.dispose();
    r.mesh.material.dispose();
  });
  ringPool = [];
  ringCursor = 0;

  for (let i = 0; i < 8; i++) {
    const g = new THREE.RingGeometry(2.6, 2.9, 120);
    const m = new THREE.MeshBasicMaterial({
      color: 0x8feaff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(0, 0, 0.25);
    mesh.rotation.x = -0.18; mesh.rotation.y = 0.22;
    world?.add(mesh);
    ringPool.push({ mesh, t: 999, life: 0.55, baseScale: 1.0 });
  }
}

function triggerRingPulse(intensity = 1) {
  if (!ringPool.length) return;
  const r = ringPool[ringCursor % ringPool.length];
  ringCursor++;
  r.t = 0; r.life = 0.48; r.baseScale = 0.92 + 0.22 * intensity;
  const col = (Math.random() < 0.5) ? 0x00d4ff : 0x7c4dff;
  r.mesh.material.color.setHex(col);
  r.mesh.material.opacity = 0.85 * P.ringStrength;
}

/* ================= GHOST TRAILS ================= */

function initGhosts() {
  ghostPool.forEach(g => {
    world?.remove(g.group);
    g.group.traverse(o => {
      o.geometry?.dispose?.();
      if (o.material) o.material.dispose?.();
    });
  });
  ghostPool = [];
  ghostCursor = 0;

  for (let i = 0; i < 18; i++) {
    const group = new THREE.Group();
    group.visible = false;
    group.position.set(0, 0, 0.2);
    group.rotation.x = -0.18; group.rotation.y = 0.22;

    const plane = new THREE.PlaneGeometry(6.9, 6.9);
    const inkMat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.NormalBlending
    });
    const glowMat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, color: new THREE.Color(0x00d4ff),
      depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });

    const glow = new THREE.Mesh(plane, glowMat);
    glow.scale.set(1.08, 1.08, 1.08);
    const ink = new THREE.Mesh(plane, inkMat);
    group.add(glow); group.add(ink);
    world?.add(group);

    ghostPool.push({
      group, glow, ink, t: 999, life: 0.45,
      vx: 0, vy: 0, spin: 0, baseScale: 1
    });
  }
}

function spawnGhostBurst(count = 3, intensity = 1, snapFlash = 1) {
  if (!ghostPool.length || !sigilBaseTex || !sigilGlowTex) return;
  const useCount = Math.max(1, Math.min(6, count));
  for (let k = 0; k < useCount; k++) {
    const g = ghostPool[ghostCursor % ghostPool.length];
    ghostCursor++;
    g.t = 0; g.life = 0.28 + Math.random() * 0.25;
    g.vx = (Math.random() - 0.5) * (0.22 + intensity * 0.25);
    g.vy = (Math.random() - 0.5) * (0.18 + intensity * 0.22);
    g.spin = (Math.random() - 0.5) * (0.12 + intensity * 0.18);
    g.baseScale = 1.02 + k * 0.04;
    g.group.visible = true;
    g.group.position.set(0, 0, 0.21 + 0.01 * k);
    g.group.rotation.x = -0.18; g.group.rotation.y = 0.22;
    g.ink.material.map = sigilBaseTex;
    g.glow.material.map = sigilGlowTex;
    const cyan = new THREE.Color(0x00d4ff);
    const purple = new THREE.Color(0x7c4dff);
    const col = cyan.clone().lerp(purple, Math.min(1, 0.45 + snapFlash * 0.65));
    g.glow.material.color.copy(col);
    g.ink.material.opacity = 0.22 + 0.20 * intensity;
    g.glow.material.opacity = 0.40 + 0.55 * snapFlash;
    g.glow.scale.set(1.12, 1.12, 1.12);
    g.group.scale.set(g.baseScale, g.baseScale, g.baseScale);
  }
}

/* ================= EMISSIVE SPARKS ================= */

function initSparks() {
  const sparkGeo = new THREE.TetrahedronGeometry(0.15, 0);
  const sparkMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending
  });

  for (let i = 0; i < 60; i++) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    sparkPool.push({
      mesh: mesh,
      active: false,
      life: 0,
      maxLife: 0,
      velocity: new THREE.Vector3(),
      spin: new THREE.Vector3()
    });
  }
}

function fireSparks(intensity) {
  if (!sparkPool.length) return;
  const count = Math.floor(intensity * 10); 
  
  for (let i = 0; i < count; i++) {
    const s = sparkPool[sparkCursor % sparkPool.length];
    sparkCursor++;

    s.active = true;
    s.life = 0;
    s.maxLife = 0.5 + Math.random() * 0.5; 
    
    s.mesh.position.set((Math.random()-0.5), (Math.random()-0.5), 0);
    s.mesh.scale.set(1, 1, 1);
    s.mesh.visible = true;
    s.mesh.material.opacity = 1.0;
    
    const col = intensity > 0.8 ? 0xffffff : (Math.random() > 0.5 ? 0xff2b5a : 0x00d4ff);
    s.mesh.material.color.setHex(col);

    const speed = 5 + intensity * 15;
    s.velocity.set(
      (Math.random() - 0.5) * speed,
      (Math.random() - 0.5) * speed,
      (Math.random() - 0.5) * speed + 5 
    );
    
    s.spin.set(Math.random(), Math.random(), Math.random()).multiplyScalar(0.2);
  }
}

/* ================= SIGIL LAYERS ================= */

function loadSigilLayers(url) {
  if (sigilGroup) {
    world.remove(sigilGroup);
    sigilGroup = null;
  }
  fetch(url)
    .then(r => { if (!r.ok) throw new Error(); return r.text(); })
    .then(svgText => {
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const size = 1024;
        const base = document.createElement("canvas");
        base.width = size; base.height = size;
        const ctx = base.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, size, size);
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        
        const imgData = ctx.getImageData(0, 0, size, size);
        const d = imgData.data; const thr = 245;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] >= thr && d[i + 1] >= thr && d[i + 2] >= thr) d[i + 3] = 0;
        }
        ctx.putImageData(imgData, 0, 0);

        const glow = document.createElement("canvas");
        glow.width = size; glow.height = size;
        const gctx = glow.getContext("2d");
        gctx.filter = "blur(10px)"; gctx.globalAlpha = 1; gctx.drawImage(base, 0, 0);
        gctx.filter = "blur(22px)"; gctx.globalAlpha = 0.85; gctx.drawImage(base, 0, 0);
        gctx.filter = "none";

        sigilBaseTex = new THREE.CanvasTexture(base);
        sigilBaseTex.colorSpace = THREE.SRGBColorSpace;
        sigilGlowTex = new THREE.CanvasTexture(glow);
        sigilGlowTex.colorSpace = THREE.SRGBColorSpace;

        const plane = new THREE.PlaneGeometry(6.9, 6.9);
        
        const inkMat = new THREE.MeshBasicMaterial({
          map: sigilBaseTex, transparent: true, opacity: 0.90,
          depthWrite: false, depthTest: false,
          blending: THREE.NormalBlending,
          side: THREE.DoubleSide 
        });
        const glowMat = new THREE.MeshBasicMaterial({
          map: sigilGlowTex, transparent: true, opacity: 0.50, color: new THREE.Color(0x00d4ff),
          depthWrite: false, depthTest: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide 
        });

        sigilBase = new THREE.Mesh(plane, inkMat);
        sigilGlow = new THREE.Mesh(plane, glowMat);
        sigilGlow.scale.set(1.08, 1.08, 1.08);

        sigilBaseBack = sigilBase.clone();
        sigilBaseBack.rotation.y = Math.PI; 
        
        sigilGlowBack = sigilGlow.clone();
        sigilGlowBack.rotation.y = Math.PI; 

        sigilGroup = new THREE.Group();
        sigilGroup.add(sigilGlow);
        sigilGroup.add(sigilBase);
        sigilGroup.add(sigilGlowBack); 
        sigilGroup.add(sigilBaseBack); 

        sigilGroup.position.set(0, 0, 0.22);
        sigilGroup.rotation.x = -0.18; sigilGroup.rotation.y = 0.22;
        world.add(sigilGroup);
        setStatus("✅ Sigil loaded (ink + glow)");
      };
      img.src = dataUrl;
    })
    .catch(() => setStatus("⚠️ Sigil SVG fetch failed (path/case?)"));
}

/* ================= INIT AUDIO ENGINE ================= */

let audioRecordDest = null;
async function initEngine() {
  initThree();
  setStatus("⏳ Initializing engine…");
  try { await engine.init(); } catch (e) { console.error(e); }

  analyser = engine.ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.85;
  dataFreq = new Uint8Array(analyser.frequencyBinCount);

  inputGain = engine.ctx.createGain();
  monitorGain = engine.ctx.createGain();
  monitorGain.gain.value = 0;
  inputGain.connect(analyser);
  inputGain.connect(monitorGain);
  monitorGain.connect(engine.master);

  audioRecordDest = engine.ctx.createMediaStreamDestination();
  try { engine.master.connect(audioRecordDest); } catch {}

  overlay.style.display = "none";
  setStatus("✅ Engine ready (Demo / File / Mic)");
  if (!raf) loop();
}
overlay.onclick = initEngine;

/* ================= CLEAN STOP ================= */

async function stopAll({ suspend = true } = {}) {
  if (bufferSrc) {
    try { bufferSrc.stop(0); bufferSrc.disconnect(); } catch {}
    bufferSrc = null;
  }
  if (micSourceNode) {
    try { micSourceNode.disconnect(); } catch {}
    micSourceNode = null;
  }
  if (micStream) {
    try { micStream.getTracks().forEach(t => t.stop()); } catch {}
    micStream = null;
  }
  currentMode = "idle";
  if (micBtn) micBtn.textContent = "🎙️ Use Microphone";
  feedbackMuted = false;
  feedbackWarnEl.style.display = "none";
  if (monitorGain) monitorGain.gain.value = 0;
  if (suspend) try { await engine.ctx.suspend(); } catch {}
}

/* ================= INPUT SOURCES ================= */

async function playDemo(path) {
  await initEngine();
  await stopAll({ suspend: false });
  setStatus("⏳ Loading demo…");
  const buf = await fetch(path).then(r => r.arrayBuffer());
  const audio = await engine.ctx.decodeAudioData(buf);
  await engine.resume();
  currentMode = "demo";
  if (monitorGain) monitorGain.gain.value = 1;
  bufferSrc = engine.ctx.createBufferSource();
  bufferSrc.buffer = audio;
  bufferSrc.connect(inputGain);
  bufferSrc.onended = async () => { await stopAll({ suspend: true }); setStatus("✅ Demo finished"); };
  bufferSrc.start(0);
  setStatus("🎧 Demo playing");
}
demoBtn?.addEventListener("click", () => playDemo("media/kasubo hoerprobe.mp3"));

fileBtn?.addEventListener("click", async () => { await initEngine(); fileInput?.click(); });
fileInput?.addEventListener("change", async (e) => {
  try {
    await initEngine();
    const file = e.target.files?.[0];
    if (!file) return;
    await stopAll({ suspend: false });
    setStatus("⏳ Decoding file…");
    const arrayBuf = await file.arrayBuffer();
    const audio = await engine.ctx.decodeAudioData(arrayBuf);
    await engine.resume();
    currentMode = "file";
    if (monitorGain) monitorGain.gain.value = 1;
    bufferSrc = engine.ctx.createBufferSource();
    bufferSrc.buffer = audio;
    bufferSrc.connect(inputGain);
    bufferSrc.onended = async () => { await stopAll({ suspend: true }); setStatus("✅ File finished"); };
    bufferSrc.start(0);
    setStatus(`🎵 Playing: ${file.name}`);
  } catch { setStatus("❌ File error"); }
  finally { if (fileInput) fileInput.value = ""; }
});

micBtn?.addEventListener("click", async () => {
  await initEngine();
  if (currentMode === "mic") {
    await stopAll({ suspend: true });
    setStatus("⏹ Mic stopped");
    return;
  }
  try {
    await stopAll({ suspend: false });
    setStatus("⏳ Requesting mic…");
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }
    });
    await engine.resume();
    currentMode = "mic";
    micSourceNode = engine.ctx.createMediaStreamSource(micStream);
    micSourceNode.connect(inputGain);
    micBtn.textContent = "⏹ Stop Microphone";
    applyMicMonitorGain();
    setStatus("🎙️ Mic active");
  } catch { setStatus("❌ Mic error"); await stopAll({ suspend: true }); }
});

window.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") setEngineOpen(false);
  if (e.key === " ") {
    e.preventDefault();
    if (currentMode !== "idle") { await stopAll({ suspend: true }); setStatus("⏹ Stopped"); }
  }
});

/* ================= AUDIO ANALYSIS ================= */

function hzToBin(hz) {
  if (!engine?.ctx || !analyser) return 0;
  const nyquist = engine.ctx.sampleRate / 2;
  const idx = Math.round((hz / nyquist) * (analyser.frequencyBinCount - 1));
  return Math.max(0, Math.min(analyser.frequencyBinCount - 1, idx));
}
function bandEnergy(freqData, hzLo, hzHi) {
  const a = hzToBin(hzLo), b = hzToBin(hzHi);
  let sum = 0; const n = Math.max(1, b - a + 1);
  for (let i = a; i <= b; i++) sum += freqData[i];
  return (sum / n) / 255;
}

let bassSm = 0, midSm = 0, snareSm = 0;
let snareAvg = 0, snarePrev = 0, lastSnareTrig = 0;
let snapFlash = 0;

/* ================= MAIN LOOP ================= */

function loop() {
  raf = requestAnimationFrame(loop);
  if (!renderer || !scene || !camera || !composer) return;

  const dt = 1/60;
  const time = performance.now() * 0.001;

  if (analyser && dataFreq) {
    analyser.getByteFrequencyData(dataFreq);
    const sensitivity = sens ? parseFloat(sens.value) : 1;
    const bass = bandEnergy(dataFreq, 30, 140) * sensitivity;
    const mid  = bandEnergy(dataFreq, 200, 1200) * sensitivity;
    const snare = bandEnergy(dataFreq, 1800, 5200) * sensitivity;

    bassSm = bassSm * 0.88 + bass * 0.12;
    midSm  = midSm  * 0.90 + mid  * 0.10;
    snareSm = snareSm * 0.78 + snare * 0.22;

    snareAvg = snareAvg * 0.965 + snareSm * 0.035;
    const rise = snareSm - snarePrev;
    snarePrev = snareSm;
    
    const isHit = (snareSm > snareAvg * 1.45) && (rise > 0.055);
    if (isHit && (time - lastSnareTrig) > 0.14) {
      lastSnareTrig = time;
      snapFlash = 1.0;
      triggerRingPulse(Math.min(1, snareSm * 1.6));
      spawnGhostBurst(P.ghostCount, Math.min(1, snareSm * 1.3), 1.0);
      
      if (snareSm > 0.4 || bassSm > 0.6) {
         fireSparks(Math.max(snareSm, bassSm));
      }
    }
  } else {
    bassSm *= 0.97; midSm *= 0.97; snareSm *= 0.97;
  }
  snapFlash *= 0.86; if (snapFlash < 0.001) snapFlash = 0;

  // 1. DYNAMIC CAMERA CHOREOGRAPHY
  if (!reducedMotion) {
    const targetFov = baseFov - (bassSm * 15);
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.1);
    
    const shake = snapFlash * 0.3;
    camera.position.x = (Math.random() - 0.5) * shake;
    camera.position.y = (Math.random() - 0.5) * shake;
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, 18 - bassSm * 2, 0.1);
    
    camera.rotation.z = Math.sin(time * 0.2) * 0.02; 
    camera.updateProjectionMatrix();
  }

  // 2. AUDIO REACTIVE LIGHTING
  if (coreLight) {
    coreLight.intensity = (bassSm * 200) + (snapFlash * 500);
    const hueShift = hueEl ? parseFloat(hueEl.value) : 280;
    const hue = ((hueShift % 360) / 360);
    if (snapFlash > 0.5) {
      coreLight.color.setHex(0xffffff); 
    } else {
      coreLight.color.setHSL((hue + midSm * 0.2) % 1, 0.9, 0.5);
    }
  }

  // 3. POST-PROCESSING CHAOS
  if (rgbShiftPass) {
    const shiftAmount = 0.0015 + (bassSm * 0.01) + (snapFlash * 0.02);
    rgbShiftPass.uniforms['amount'].value = THREE.MathUtils.lerp(rgbShiftPass.uniforms['amount'].value, shiftAmount, 0.1);
  }
  
  if (glitchPass) {
    const totalEnergy = bassSm + midSm + snareSm;
    if (totalEnergy > 2.2 && Math.random() > 0.8) {
        glitchPass.enabled = true;
    } else {
        glitchPass.enabled = false;
    }
  }

  // 4. AFTERIMAGE TRAIL CONTROL
  if (afterimagePass) {
    const dampTarget = bassSm > 0.6 ? 0.6 : 0.85 + (midSm * 0.1);
    afterimagePass.uniforms["damp"].value = THREE.MathUtils.lerp(afterimagePass.uniforms["damp"].value, dampTarget, 0.05);
  }

  // Stars: Warp Field
  if (starPoints) {
    updateStars(dt); 
    const base = P.starsOpacity;
    const tw = base + 0.03 * Math.sin(time * 0.7);
    const slider = partEl ? parseFloat(partEl.value) : 10; 
    const add = Math.max(0, Math.min(0.20, 0.0065 * slider));
    starPoints.material.opacity = Math.max(0, Math.min(0.8, tw + add + bassSm * 0.2));
  }

  // World Rotation
  if (world && !reducedMotion) {
    world.rotation.y = time * 0.45;
    world.rotation.x = Math.sin(time * 0.8) * 0.10;
    world.position.x = Math.sin(time * 1.2) * 0.55;
    world.position.y = Math.cos(time * 0.9) * 0.35;
  }

  // Morphing Logic
  if (morphMesh) {
    morphMesh.morphTargetInfluences[0] = THREE.MathUtils.lerp(morphMesh.morphTargetInfluences[0], bassSm * 1.2, 0.1);
    morphMesh.morphTargetInfluences[1] = THREE.MathUtils.lerp(morphMesh.morphTargetInfluences[1], snareSm * 1.5, 0.2);

    const drift = reducedMotion ? 0 : 0.002;
    morphMesh.rotation.y += drift + midSm * 0.01;
    morphMesh.rotation.x += drift;

    const zoomInt = zoomEl ? (parseFloat(zoomEl.value) / 100) : 0.18;
    const scale = 1 + bassSm * (0.32 * zoomInt) + snapFlash * 0.04;
    morphMesh.scale.set(scale, scale, scale);

    const hueShift = hueEl ? parseFloat(hueEl.value) : 280;
    const hue = ((hueShift % 360) / 360);
    const mode = palette?.value || "hue";
    
    if (mode === "grayscale") {
      morphMesh.material.color.setHex(0xe6e6e6);
    } else if (mode === "energy") {
       const energyHue = (hue + bassSm * 0.2) % 1;
       morphMesh.material.color.setHSL(energyHue, 0.85, 0.5 + snareSm * 0.4);
    } else {
       morphMesh.material.color.setHSL(hue, 0.75, 0.55);
    }
    
    morphMesh.material.opacity = P.cageOpacityBase + bassSm * 0.2 + snapFlash * 0.2;
  }

  // Sigil 
  if (sigilGroup && sigilBase && sigilGlow) {
    const mode = palette?.value || "hue";
    const opacity = Math.max(0.35, P.sigilInk + bassSm * 0.1);
    sigilBase.material.opacity = opacity;
    if (sigilBaseBack) sigilBaseBack.material.opacity = opacity;
    
    let glowColor = new THREE.Color(0x00d4ff);
    if (mode === "grayscale") {
      glowColor = new THREE.Color(0xffffff);
    } else {
      const cyan = new THREE.Color(0x00d4ff);
      const purple = new THREE.Color(0x7c4dff);
      glowColor = cyan.clone().lerp(purple, Math.min(1, snapFlash * 1.1));
    }
    sigilGlow.material.color.copy(glowColor);
    if (sigilGlowBack) sigilGlowBack.material.color.copy(glowColor);
    
    const aura = P.glowBase + bassSm * P.glowBass;
    const flash = snapFlash * P.glowSnap;
    const glowOp = Math.max(0.30, Math.min(0.98, aura + flash));
    sigilGlow.material.opacity = glowOp;
    if (sigilGlowBack) sigilGlowBack.material.opacity = glowOp;
    
    const jitter = reducedMotion ? 0 : (snapFlash * P.jitter);
    sigilGroup.rotation.y = 0.22 + Math.sin(time * 1.2) * 0.02 + (Math.random() - 0.5) * jitter;
    sigilGroup.rotation.x = -0.18 + Math.sin(time * 1.0) * 0.015 + (Math.random() - 0.5) * jitter;

    const zoomInt = zoomEl ? (parseFloat(zoomEl.value) / 100) : 0.18;
    const scale = 1 + bassSm * (0.32 * zoomInt) + snapFlash * 0.04;
    sigilGroup.scale.set(scale, scale, scale);
    sigilGroup.position.y = Math.sin(time * 1.5) * 0.08;
  }

  // Rings & Ghosts 
  for (const r of ringPool) {
    if (r.t >= 999) continue;
    r.t += dt;
    const p = Math.min(1, r.t / r.life);
    const ease = 1 - Math.pow(1 - p, 3);
    const scale = r.baseScale + ease * 1.35;
    r.mesh.scale.set(scale, scale, scale);
    const flick = 0.92 + 0.08 * Math.sin(time * 20);
    r.mesh.material.opacity = (1 - p) * 0.85 * flick * P.ringStrength;
    if (p >= 1) { r.t = 999; r.mesh.material.opacity = 0; }
  }
  
  for (const g of ghostPool) {
    if (g.t >= 999) continue;
    g.t += dt;
    const p = Math.min(1, g.t / g.life);
    const ease = 1 - Math.pow(1 - p, 2);
    g.group.position.x += g.vx * 0.14; g.group.position.y += g.vy * 0.14;
    g.group.rotation.y += g.spin * 0.04;
    const s = g.baseScale + ease * 0.28;
    g.group.scale.set(s, s, s);
    const fade = (1 - p);
    g.ink.material.opacity = Math.max(0, g.ink.material.opacity * 0.90) * fade;
    g.glow.material.opacity = Math.max(0, g.glow.material.opacity * 0.88) * fade;
    if (p >= 1) { g.t = 999; g.group.visible = false; }
  }

  // Update Sparks
  for (let i = 0; i < sparkPool.length; i++) {
    const s = sparkPool[i];
    if (!s.active) continue;
    
    s.life += dt;
    if (s.life >= s.maxLife) {
        s.active = false;
        s.mesh.visible = false;
        continue;
    }

    s.mesh.position.addScaledVector(s.velocity, dt);
    s.velocity.multiplyScalar(0.95);
    s.mesh.rotation.x += s.spin.x;
    s.mesh.rotation.y += s.spin.y;
    s.mesh.rotation.z += s.spin.z;

    const percent = s.life / s.maxLife;
    s.mesh.material.opacity = 1.0 - Math.pow(percent, 2);
    const scale = 1.0 - percent;
    s.mesh.scale.set(scale, scale, scale);
  }

  if (bloomPass) bloomPass.strength = P.bloomStrength + bassSm * 0.35 + snapFlash * 0.55;

  composer.render();
}

/* ================= RECORDING ================= */

let mediaRecorder = null, recordedChunks = [], recording = false;
function pickMime() {
  const mimes = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  for (const m of mimes) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  return "";
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function startRecording() {
  if (currentMode === "idle") {
    await initEngine();
  }

  const fps = 60;
  const canvasStream = canvas.captureStream(fps);
  const out = audioRecordDest?.stream;
  if (out && out.getAudioTracks().length) canvasStream.addTrack(out.getAudioTracks()[0]);
  recordedChunks = [];
  const mimeType = pickMime();
  mediaRecorder = new MediaRecorder(canvasStream, mimeType ? { mimeType } : undefined);
  mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: mimeType || "video/webm" });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadBlob(blob, `sonic-inclusion-${stamp}.webm`);
    setStatus("✅ Recording saved");
  };
  mediaRecorder.start(250);
  recording = true;
  recBtn.textContent = "⏹ STOP";
  setStatus("⏺ Recording…");
}
function stopRecording() {
  if (!mediaRecorder) return;
  try { mediaRecorder.stop(); } catch {}
  recording = false;
  recBtn.textContent = "⏺ RECORD";
}
recBtn.addEventListener("click", async () => {
  if (!recording) await startRecording();
  else stopRecording();
});
