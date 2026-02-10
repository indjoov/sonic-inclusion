import * as THREE from "three";
import { AudioEngine } from "./audio/AudioEngine.js";

/* ================= BASIC SETUP ================= */

const canvas = document.getElementById("viz");
const stageEl = canvas?.closest?.(".stage") || canvas;

const srText = document.getElementById("srText");
const sens = document.getElementById("sens");
const palette = document.getElementById("palette");

const micBtn = document.getElementById("micBtn");
const fileBtn = document.getElementById("fileBtn");
const demoBtn = document.getElementById("demoBtn");
const fileInput = document.getElementById("fileInput");

if (srText) {
  srText.setAttribute("aria-live", "polite");
  srText.setAttribute("role", "status");
}
function setStatus(msg) {
  if (srText) srText.textContent = msg;
}

/* ================= UTIL ================= */

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

// average energy in a frequency band (Hz)
function bandEnergyHz(freqData, sampleRate, fftSize, hzLo, hzHi) {
  const nyquist = sampleRate / 2;
  const binCount = freqData.length;
  const lo = Math.max(0, Math.floor((hzLo / nyquist) * binCount));
  const hi = Math.min(binCount - 1, Math.ceil((hzHi / nyquist) * binCount));
  let sum = 0;
  let n = 0;
  for (let i = lo; i <= hi; i++) {
    sum += freqData[i];
    n++;
  }
  return n ? (sum / n) / 255 : 0; // normalized 0..1
}

/* ================= OVERLAY (autoplay-safe init) ================= */

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

// analyser routing (mic/file/demo all feed this)
let analyser = null;
let dataFreq = null;

// routing nodes
let inputGain = null;
let monitorGain = null;

// input nodes
let currentMode = "idle";
let bufferSrc = null;
let micStream = null;
let micSourceNode = null;

/* ================= THREE STATE ================= */

let renderer = null;
let scene = null;
let camera = null;

let starPoints = null;
let sphere = null;
let sigilGroup = null;

let sigilBaseMesh = null;
let sigilGlowMesh = null;

// audio envelopes (ritual feel)
let bassEnv = 0;      // slow breath
let snapEnv = 0;      // fast flash (snare)
let snapPrev = 0;     // for transient detect

// star drift time
let t0 = performance.now();

/* ================= A11Y / REDUCED MOTION ================= */

let reducedMotion = false;

/* ================= MIC MONITOR + FEEDBACK GUARD ================= */

let micMonitor = false;
let micMonitorVol = 0.35;
let feedbackMuted = false;

function applyMicMonitorGain() {
  if (!monitorGain) return;
  const want = currentMode === "mic" && micMonitor && !feedbackMuted ? micMonitorVol : 0;
  monitorGain.gain.value = want;
}

/* ================= CLEAN LEGACY UI ================= */

function removeLegacyUI() {
  document.getElementById("si-hud")?.remove();
  document.getElementById("si-enginePanel")?.remove();
  document.getElementById("engine-controls")?.remove();
  document.getElementById("engine-controls-toggle")?.remove();
}
removeLegacyUI();

/* ================= MODERN HUD (ENGINE + RECORD) ================= */

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
`;

// RECORD
const recBtn = document.createElement("button");
recBtn.id = "si-recBtn";
recBtn.type = "button";
recBtn.textContent = "⏺ RECORD";
recBtn.setAttribute("aria-pressed", "false");
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

// ENGINE toggle
const engineToggle = document.createElement("button");
engineToggle.id = "si-engineToggle";
engineToggle.type = "button";
engineToggle.textContent = "⚙️ ENGINE";
engineToggle.setAttribute("aria-expanded", "false");
engineToggle.setAttribute("aria-controls", "si-enginePanel");
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

// ENGINE PANEL
const enginePanel = document.createElement("div");
enginePanel.id = "si-enginePanel";
enginePanel.setAttribute("role", "dialog");
enginePanel.setAttribute("aria-label", "Engine controls");
enginePanel.setAttribute("aria-hidden", "true");
enginePanel.style.cssText = `
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(74px + env(safe-area-inset-bottom));
  z-index: 2001;
  background: rgba(10,10,10,0.92);
  border: 1px solid rgba(0,212,255,0.65);
  border-radius: 18px;
  padding: 14px 14px 12px;
  color: #fff;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  backdrop-filter: blur(12px);
  box-shadow: 0 18px 60px rgba(0,0,0,0.55);
  display: none;
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
    <button id="si-engineClose" type="button" aria-label="Close engine panel" style="
      background: transparent;
      border: 1px solid rgba(255,255,255,0.18);
      color: #fff;
      border-radius: 12px;
      padding: 8px 10px;
      cursor: pointer;
      font-weight: 900;
    ">✕</button>
  </div>

  <div style="display:grid; gap:10px;">
    <label style="font-size:12px; opacity:0.8;">
      PARTICLES (stars intensity)
      <input id="partAmount" type="range" min="0" max="30" value="10" style="width:100%; margin-top:6px;">
    </label>

    <label style="font-size:12px; opacity:0.8;">
      BASS ZOOM
      <input id="zoomInt" type="range" min="0" max="100" value="25" style="width:100%; margin-top:6px;">
    </label>

    <label style="font-size:12px; opacity:0.8;">
      HUE
      <input id="hueShift" type="range" min="0" max="360" value="280" style="width:100%; margin-top:6px;">
    </label>

    <div style="display:flex; gap:8px;">
      <button id="presetCalm" type="button" style="flex:1; border-radius:12px; padding:10px; cursor:pointer;">CALM</button>
      <button id="presetBass" type="button" style="flex:1; border-radius:12px; padding:10px; cursor:pointer;">BASS</button>
      <button id="presetCine" type="button" style="flex:1; border-radius:12px; padding:10px; cursor:pointer;">CINE</button>
    </div>

    <label style="font-size:12px; display:flex; align-items:center; gap:10px;">
      <input id="reducedMotion" type="checkbox">
      Reduced Motion
    </label>

    <div style="padding-top:10px; border-top:1px solid rgba(255,255,255,0.12);">
      <label style="font-size:12px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <span>Mic Monitor</span>
        <input id="micMonitor" type="checkbox">
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

// Panel open/close
let engineOpen = false;
function setEngineOpen(open) {
  engineOpen = open;
  enginePanel.style.display = open ? "block" : "none";
  enginePanel.setAttribute("aria-hidden", open ? "false" : "true");
  engineToggle.setAttribute("aria-expanded", open ? "true" : "false");
}
engineToggle.addEventListener("click", () => setEngineOpen(!engineOpen));
enginePanel.querySelector("#si-engineClose").addEventListener("click", () => setEngineOpen(false));

// Swipe-down close (mobile)
let touchStartY = null;
enginePanel.addEventListener("touchstart", (e) => {
  touchStartY = e.touches?.[0]?.clientY ?? null;
}, { passive: true });
enginePanel.addEventListener("touchmove", (e) => {
  if (touchStartY == null) return;
  const y = e.touches?.[0]?.clientY ?? touchStartY;
  const dy = y - touchStartY;
  if (dy > 50) {
    setEngineOpen(false);
    touchStartY = null;
  }
}, { passive: true });

function autoCloseEngineForRecording() {
  if (engineOpen) setEngineOpen(false);
}

/* ================= ENGINE PANEL CONTROL HOOKS ================= */

const partEl = enginePanel.querySelector("#partAmount");
const zoomEl = enginePanel.querySelector("#zoomInt");
const hueEl  = enginePanel.querySelector("#hueShift");

function preset(p, z, h) {
  partEl.value = String(p);
  zoomEl.value = String(z);
  hueEl.value  = String(h);
}
enginePanel.querySelector("#presetCalm").addEventListener("click", () => preset(6, 15, 210));
enginePanel.querySelector("#presetBass").addEventListener("click", () => preset(14, 55, 320));
enginePanel.querySelector("#presetCine").addEventListener("click", () => preset(10, 30, 280));

enginePanel.querySelector("#reducedMotion").addEventListener("change", (e) => {
  reducedMotion = !!e.target.checked;
});

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

/* ================= CANVAS/RENDER SIZE (HiDPI-safe) ================= */

function fitRendererToStage() {
  if (!renderer || !camera) return;

  const dpr = Math.max(1, Math.min(2.0, window.devicePixelRatio || 1));
  const rect = (stageEl || canvas).getBoundingClientRect();

  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));

  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);

  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

const ro = new ResizeObserver(() => fitRendererToStage());
if (stageEl) ro.observe(stageEl);
window.addEventListener("resize", fitRendererToStage);

/* ================= THREE INIT ================= */

function initThree() {
  if (renderer) return;

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  });
  renderer.setClearColor(0x000000, 1);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(0, 0, 16);

  // subtle ambient (we mainly use BasicMaterials)
  const amb = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(amb);

  // Stars
  starPoints = makeStars(1400, 80);
  scene.add(starPoints);
  // slow cosmic drift baseline (not audio-driven)
  starPoints.rotation.set(Math.random() * 0.6, Math.random() * 0.6, 0);

  // Wireframe sphere
  const geo = new THREE.IcosahedronGeometry(5.1, 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00d4ff,
    wireframe: true,
    transparent: true,
    opacity: 0.16
  });
  sphere = new THREE.Mesh(geo, mat);
  scene.add(sphere);

  // Sigil plane (transparent background + ritual glow)
  loadSigilPlane("media/indjoov-sigil.svg");

  fitRendererToStage();
}

function makeStars(count, spread) {
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    positions[ix + 0] = (Math.random() - 0.5) * spread;
    positions[ix + 1] = (Math.random() - 0.5) * spread;
    positions[ix + 2] = (Math.random() - 0.5) * spread;
  }
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.06,
    transparent: true,
    opacity: 0.22
  });
  return new THREE.Points(geom, mat);
}

/* ================= SIGIL (SVG -> Canvas -> transparent) ================= */

function disposeSigil() {
  if (!sigilGroup) return;
  scene.remove(sigilGroup);
  sigilGroup.traverse(o => {
    if (o.geometry) o.geometry.dispose?.();
    if (o.material) {
      if (o.material.map) o.material.map.dispose?.();
      o.material.dispose?.();
    }
  });
  sigilGroup = null;
  sigilBaseMesh = null;
  sigilGlowMesh = null;
}

function loadSigilPlane(url) {
  disposeSigil();

  fetch(url)
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    })
    .then(svgText => {
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const size = 1024;
        const cvs = document.createElement("canvas");
        cvs.width = size;
        cvs.height = size;
        const ctx2d = cvs.getContext("2d", { willReadFrequently: true });

        // normalize background to white
        ctx2d.fillStyle = "#ffffff";
        ctx2d.fillRect(0, 0, size, size);

        // fit + center
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (size - w) / 2;
        const y = (size - h) / 2;
        ctx2d.drawImage(img, x, y, w, h);

        // make near-white transparent
        const imgData = ctx2d.getImageData(0, 0, size, size);
        const d = imgData.data;
        const thr = 245;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          if (r >= thr && g >= thr && b >= thr) d[i + 3] = 0;
        }
        ctx2d.putImageData(imgData, 0, 0);

        const tex = new THREE.CanvasTexture(cvs);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;

        const geom = new THREE.PlaneGeometry(6.8, 6.8);

        // BASE: neutral, readable (prevents “double sigil” look)
        const baseMat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          depthTest: false,
          blending: THREE.NormalBlending,
          color: new THREE.Color(0xf2f2f7)
        });
        sigilBaseMesh = new THREE.Mesh(geom, baseMat);

        // GLOW: aura only (bigger, softer, additive)
        const glowMat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
          depthTest: false,
          blending: THREE.AdditiveBlending,
          color: new THREE.Color(0x00d4ff)
        });
        sigilGlowMesh = new THREE.Mesh(geom.clone(), glowMat);
        sigilGlowMesh.scale.set(1.22, 1.22, 1);
        sigilGlowMesh.position.z = 0.01;

        sigilGroup = new THREE.Group();
        sigilGroup.add(sigilBaseMesh);
        sigilGroup.add(sigilGlowMesh);

        sigilGroup.position.set(0, 0, 0.2); // slightly in front
        sigilGroup.rotation.x = -0.18;
        sigilGroup.rotation.y = 0.22;

        scene.add(sigilGroup);
        setStatus("✅ Sigil loaded (ink + glow)");
      };

      img.onerror = () => setStatus("⚠️ Sigil image decode failed");
      img.src = dataUrl;
    })
    .catch(err => {
      console.error(err);
      setStatus("⚠️ Sigil SVG fetch failed (path/case?)");
    });
}

/* ================= INIT AUDIO ENGINE ================= */

let recordDest = null; // MediaStreamDestination
async function initEngine() {
  initThree();

  setStatus("⏳ Initializing engine…");
  try {
    await engine.init();
  } catch (e) {
    console.error(e);
  }

  // analyser
  analyser = engine.ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.85;

  dataFreq = new Uint8Array(analyser.frequencyBinCount);

  // routing
  inputGain = engine.ctx.createGain();
  inputGain.gain.value = 1;

  monitorGain = engine.ctx.createGain();
  monitorGain.gain.value = 0;

  inputGain.connect(analyser);
  inputGain.connect(monitorGain);

  // engine.master exists in your AudioEngine and is connected to destination already
  monitorGain.connect(engine.master);

  // recording tap (audio)
  recordDest = engine.ctx.createMediaStreamDestination();
  try {
    engine.master.connect(recordDest);
  } catch (e) {
    // if master already connected or not connectable, ignore
  }

  overlay.style.display = "none";
  setStatus("✅ Engine ready (Demo / File / Mic)");

  if (!raf) loop();
}

overlay.onclick = async () => {
  await initEngine();
  try { await engine.resume(); } catch {}
};

/* ================= CLEAN STOP ================= */

async function stopAll({ suspend = true } = {}) {
  if (bufferSrc) {
    try { bufferSrc.onended = null; } catch {}
    try { bufferSrc.stop(0); } catch {}
    try { bufferSrc.disconnect(); } catch {}
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

  if (suspend) {
    try { await engine.ctx.suspend(); } catch {}
  }
}

/* ================= DEMO (play once) ================= */

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
  bufferSrc.loop = false;
  bufferSrc.connect(inputGain);

  bufferSrc.onended = async () => {
    await stopAll({ suspend: true });
    setStatus("✅ Demo finished (played once)");
  };

  bufferSrc.start(0);
  setStatus("🎧 Demo playing (once)");
}
demoBtn?.addEventListener("click", () => playDemo("media/kasubo hoerprobe.mp3"));

/* ================= FILE INPUT (play once) ================= */

fileBtn?.addEventListener("click", async () => {
  await initEngine();
  fileInput?.click();
});

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
    bufferSrc.loop = false;
    bufferSrc.connect(inputGain);

    bufferSrc.onended = async () => {
      await stopAll({ suspend: true });
      setStatus("✅ File playback finished");
    };

    bufferSrc.start(0);
    setStatus(`🎵 Playing file: ${file.name}`);
  } catch (err) {
    console.error(err);
    setStatus("❌ File playback error");
  } finally {
    if (fileInput) fileInput.value = "";
  }
});

/* ================= MIC INPUT (toggle) ================= */

micBtn?.addEventListener("click", async () => {
  await initEngine();

  if (currentMode === "mic") {
    await stopAll({ suspend: true });
    setStatus("⏹ Mic stopped");
    return;
  }

  try {
    await stopAll({ suspend: false });

    await engine.resume();
    currentMode = "mic";
    micBtn.textContent = "⏹ Stop Microphone";

    setStatus("🎙️ Requesting mic…");
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    micSourceNode = engine.ctx.createMediaStreamSource(micStream);
    micSourceNode.connect(inputGain);

    // feedback guard: if mic monitor ON, keep it low and allow user to toggle
    feedbackMuted = false;
    feedbackWarnEl.style.display = "none";
    applyMicMonitorGain();

    setStatus("🎙️ Mic running");
  } catch (err) {
    console.error(err);
    setStatus("❌ Mic error / permission denied");
    await stopAll({ suspend: true });
  }
});

/* ================= RECORDING (Canvas + Audio) ================= */

let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

function pickMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm"
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

async function startRecording() {
  await initEngine();
  autoCloseEngineForRecording();

  const fps = 60;
  const canvasStream = canvas.captureStream?.(fps);
  if (!canvasStream) {
    setStatus("❌ Recording not supported (no canvas captureStream)");
    return;
  }

  const tracks = [...canvasStream.getVideoTracks()];
  if (recordDest?.stream) {
    const audioTracks = recordDest.stream.getAudioTracks();
    tracks.push(...audioTracks);
  }

  const mixed = new MediaStream(tracks);
  recordedChunks = [];

  const mimeType = pickMimeType();
  try {
    mediaRecorder = new MediaRecorder(mixed, mimeType ? { mimeType } : undefined);
  } catch (e) {
    console.error(e);
    setStatus("❌ MediaRecorder failed");
    return;
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "video/webm" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `sonic-inclusion-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setStatus("✅ Recording saved (.webm)");
  };

  mediaRecorder.start(250);
  isRecording = true;

  recBtn.setAttribute("aria-pressed", "true");
  recBtn.textContent = "⏹ STOP";
  setStatus("⏺ Recording…");
}

function stopRecording() {
  if (!mediaRecorder || !isRecording) return;
  try { mediaRecorder.stop(); } catch {}
  isRecording = false;

  recBtn.setAttribute("aria-pressed", "false");
  recBtn.textContent = "⏺ RECORD";
}

recBtn.addEventListener("click", async () => {
  if (!isRecording) await startRecording();
  else stopRecording();
});

/* ================= KEYBOARD SHORTCUTS ================= */

window.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") setEngineOpen(false);

  if (e.code === "Space") {
    e.preventDefault();
    // toggle pause/resume for file/demo (mic stays running)
    if (!engine?.ctx) return;
    if (engine.ctx.state === "running") {
      await engine.ctx.suspend();
      setStatus("⏸ Paused");
    } else {
      await engine.resume();
      setStatus("▶️ Playing");
    }
  }

  if (e.key.toLowerCase() === "m") micBtn?.click();
  if (e.key.toLowerCase() === "f") fileBtn?.click();
  if (e.key.toLowerCase() === "d") demoBtn?.click();
});

/* ================= MAIN LOOP ================= */

function loop() {
  raf = requestAnimationFrame(loop);

  if (!renderer || !scene || !camera) return;

  // if audio not ready, still render slowly
  if (analyser && dataFreq) {
    analyser.getByteFrequencyData(dataFreq);

    const now = performance.now();
    const dt = Math.min(0.05, (now - t0) / 1000);
    t0 = now;

    const s = parseFloat(sens?.value || "1"); // sensitivity slider

    // bands: bass + snare snap
    const bass = bandEnergyHz(dataFreq, engine.ctx.sampleRate, analyser.fftSize, 35, 140);
    const snap = bandEnergyHz(dataFreq, engine.ctx.sampleRate, analyser.fftSize, 1800, 5200);

    // envelope: bass slow breath
    const bassTarget = clamp01(bass * (0.9 + 0.6 * s));
    bassEnv += (bassTarget - bassEnv) * (1 - Math.pow(0.001, dt));

    // transient: snap difference
    const snapDiff = Math.max(0, (snap - snapPrev) * (1.8 + 1.2 * s));
    snapPrev = snap * 0.6 + snapPrev * 0.4;

    // fast attack/decay
    const snapAttack = 1 - Math.pow(0.000001, dt);
    const snapDecay  = 1 - Math.pow(0.04, dt);

    snapEnv = Math.max(snapEnv * (1 - snapDecay), snapDiff);
    snapEnv += (snapEnv < snapDiff ? (snapDiff - snapEnv) * snapAttack : 0);

    bassEnv = clamp01(bassEnv);
    snapEnv = clamp01(snapEnv);

    // palette mode hook (optional)
    const pal = palette?.value || "hue";

    // STARS: subtle drift + tiny twinkle (NOT audio)
    if (starPoints) {
      starPoints.rotation.y += dt * 0.03;
      starPoints.rotation.x += dt * 0.012;

      const m = starPoints.material;
      const tw = 0.02 * Math.sin(now * 0.0012);
      const partAmt = parseFloat(partEl?.value || "10"); // 0..30
      m.opacity = (0.16 + tw) * (0.6 + partAmt / 30);
      m.size = 0.055;
    }

    // SPHERE: breath by bass
    if (sphere) {
      const zoom = parseFloat(zoomEl?.value || "25") / 100;
      const b = bassEnv;

      sphere.rotation.y += dt * (reducedMotion ? 0.06 : 0.18);
      sphere.rotation.x += dt * (reducedMotion ? 0.03 : 0.10);

      const targetOpacity = 0.10 + b * (0.18 + 0.22 * zoom);
      sphere.material.opacity += (targetOpacity - sphere.material.opacity) * 0.12;

      const scale = 1 + b * (0.05 + 0.12 * zoom);
      sphere.scale.setScalar(scale);

      // color shift a little with hue
      const hueBase = (parseFloat(hueEl?.value || "280") % 360) / 360;
      const c = new THREE.Color().setHSL(hueBase, 0.85, 0.55);
      sphere.material.color.copy(c);
    }

    // SIGIL: base stable + glow flash on snap + breath on bass
    if (sigilGroup && sigilGlowMesh && sigilBaseMesh) {
      const flash = snapEnv;
      const breath = bassEnv;

      // base stays neutral
      sigilBaseMesh.material.opacity = 0.90;
      sigilBaseMesh.material.color.set(0xf2f2f7);

      // hue: cyan/purple blend
      const hueBase = (parseFloat(hueEl?.value || "280") % 360) / 360;
      const hue = (hueBase + flash * 0.08) % 1;

      let glowColor = new THREE.Color().setHSL(hue, 0.95, 0.58);

      // allow "grayscale" mode
      if (pal === "grayscale") {
        glowColor = new THREE.Color(0xffffff);
      }

      sigilGlowMesh.material.color.copy(glowColor);

      // more punch + more glow
      sigilGlowMesh.material.opacity = 0.14 + breath * 0.38 + flash * 0.85;

      const pulse = 1.22 + breath * 0.10 + flash * 0.14;
      sigilGlowMesh.scale.set(pulse, pulse, 1);

      // group hit
      const hitScale = 1 + flash * 0.035 + breath * 0.012;
      sigilGroup.scale.set(hitScale, hitScale, 1);

      sigilGroup.rotation.z += dt * (reducedMotion ? 0.02 : (0.04 + flash * 0.10));
    }
  } else {
    // fallback drift
    if (starPoints) {
      starPoints.rotation.y += 0.002;
      starPoints.rotation.x += 0.0008;
    }
    if (sphere) sphere.rotation.y += 0.003;
  }

  renderer.render(scene, camera);
}

/* ================= START STATE ================= */

setStatus("Visualization idle. Click to initialize.");
applyMicMonitorGain();
