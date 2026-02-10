import * as THREE from "three";
import { AudioEngine } from "./audio/AudioEngine.js";

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
let dataTime = null;

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

// sigil layers
let sigilGroup = null;
let sigilBaseMesh = null;
let sigilGlowMesh = null;

/* ================= REDUCED MOTION ================= */

let reducedMotion = false;

/* ================= MIC MONITOR (optional) ================= */

let micMonitor = false;
let micMonitorVol = 0.25;
let feedbackMuted = false;

function applyMicMonitorGain() {
  if (!monitorGain) return;
  const want = currentMode === "mic" && micMonitor && !feedbackMuted ? micMonitorVol : 0;
  monitorGain.gain.value = want;
}

/* ================= UI: small HUD (ENGINE/RECORD optional) ================= */

function removeLegacyUI() {
  document.getElementById("si-hud")?.remove();
  document.getElementById("si-enginePanel")?.remove();
  document.getElementById("engine-controls")?.remove();
  document.getElementById("engine-controls-toggle")?.remove();
}
removeLegacyUI();

// HUD container
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

// dummy record button (optional, safe)
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
`;
recBtn.addEventListener("click", () => {
  // optional later: MediaRecorder integration
  setStatus("ℹ️ Recording not enabled yet (UI placeholder).");
});

// ENGINE toggle
const engineToggle = document.createElement("button");
engineToggle.id = "si-engineToggle";
engineToggle.type = "button";
engineToggle.textContent = "⚙️ ENGINE";
engineToggle.setAttribute("aria-expanded", "false");
engineToggle.setAttribute("aria-controls", "si-enginePanel");
engineToggle.style.cssText = `
  pointer-events: auto;
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
      PARTICLES (stars)
      <input id="partAmount" type="range" min="0" max="30" value="10" style="width:100%; margin-top:6px;">
    </label>

    <label style="font-size:12px; opacity:0.8;">
      BASS ZOOM
      <input id="zoomInt" type="range" min="0" max="100" value="35" style="width:100%; margin-top:6px;">
    </label>

    <label style="font-size:12px; opacity:0.8;">
      HUE (cyan/purple)
      <input id="hueShift" type="range" min="0" max="360" value="285" style="width:100%; margin-top:6px;">
    </label>

    <label style="font-size:12px; opacity:0.8;">
      GLOW
      <input id="glowAmt" type="range" min="0" max="100" value="75" style="width:100%; margin-top:6px;">
    </label>

    <label style="font-size:12px; opacity:0.8;">
      PUNCH (bass+snap)
      <input id="punchAmt" type="range" min="0" max="100" value="85" style="width:100%; margin-top:6px;">
    </label>

    <div style="display:flex; gap:8px;">
      <button id="presetCalm" type="button" style="flex:1; border-radius:12px; padding:10px; cursor:pointer;">CALM</button>
      <button id="presetRitual" type="button" style="flex:1; border-radius:12px; padding:10px; cursor:pointer;">RITUAL</button>
      <button id="presetHard" type="button" style="flex:1; border-radius:12px; padding:10px; cursor:pointer;">HARD</button>
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
        <input id="micMonitorVol" type="range" min="0" max="100" value="25" style="width:100%; margin-top:6px;">
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
  enginePanel.setAttribute("aria-hidden", open ? "false" : "true");
  engineToggle.setAttribute("aria-expanded", open ? "true" : "false");
}
engineToggle.addEventListener("click", () => setEngineOpen(!engineOpen));
enginePanel.querySelector("#si-engineClose").addEventListener("click", () => setEngineOpen(false));

// Swipe-down close (mobile)
let touchStartY = null;
enginePanel.addEventListener(
  "touchstart",
  (e) => {
    touchStartY = e.touches?.[0]?.clientY ?? null;
  },
  { passive: true }
);
enginePanel.addEventListener(
  "touchmove",
  (e) => {
    if (touchStartY == null) return;
    const y = e.touches?.[0]?.clientY ?? touchStartY;
    const dy = y - touchStartY;
    if (dy > 50) {
      setEngineOpen(false);
      touchStartY = null;
    }
  },
  { passive: true }
);

/* ================= PANEL HOOKS ================= */

const partEl = enginePanel.querySelector("#partAmount");
const zoomEl = enginePanel.querySelector("#zoomInt");
const hueEl = enginePanel.querySelector("#hueShift");
const glowEl = enginePanel.querySelector("#glowAmt");
const punchEl = enginePanel.querySelector("#punchAmt");

function preset({ parts, zoom, hue, glow, punch }) {
  partEl.value = String(parts);
  zoomEl.value = String(zoom);
  hueEl.value = String(hue);
  glowEl.value = String(glow);
  punchEl.value = String(punch);
}

enginePanel.querySelector("#presetCalm").addEventListener("click", () =>
  preset({ parts: 6, zoom: 15, hue: 230, glow: 45, punch: 45 })
);
enginePanel.querySelector("#presetRitual").addEventListener("click", () =>
  preset({ parts: 12, zoom: 35, hue: 285, glow: 75, punch: 85 })
);
enginePanel.querySelector("#presetHard").addEventListener("click", () =>
  preset({ parts: 18, zoom: 60, hue: 315, glow: 95, punch: 100 })
);

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
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 1);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(0, 0, 16);

  // subtle ambient
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));

  // Stars
  starPoints = makeStars(1400, 80);
  scene.add(starPoints);

  // Wireframe sphere
  const geo = new THREE.IcosahedronGeometry(5.1, 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00d4ff,
    wireframe: true,
    transparent: true,
    opacity: 0.16,
  });
  sphere = new THREE.Mesh(geo, mat);
  scene.add(sphere);

  // Sigil plane
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
    opacity: 0.35,
  });
  return new THREE.Points(geom, mat);
}

/* ================= SIGIL (SVG -> CanvasTexture, transparent bg) ================= */

function disposeSigil() {
  if (!sigilGroup) return;
  scene.remove(sigilGroup);
  sigilGroup.traverse((o) => {
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
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    })
    .then((svgText) => {
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        const size = 1024;
        const cvs = document.createElement("canvas");
        cvs.width = size;
        cvs.height = size;
        const ctx2d = cvs.getContext("2d", { willReadFrequently: true });

        // paint white background first (then remove it)
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
          const r = d[i],
            g = d[i + 1],
            b = d[i + 2];
          if (r >= thr && g >= thr && b >= thr) d[i + 3] = 0;
        }
        ctx2d.putImageData(imgData, 0, 0);

        const tex = new THREE.CanvasTexture(cvs);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;

        // Group
        sigilGroup = new THREE.Group();

        // BASE (always visible)
        const baseMat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          depthTest: false,
          blending: THREE.NormalBlending,
        });

        const geom = new THREE.PlaneGeometry(6.8, 6.8);
        sigilBaseMesh = new THREE.Mesh(geom, baseMat);

        // GLOW (additive, bigger)
        const glowMat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
          depthTest: false,
          blending: THREE.AdditiveBlending,
          color: new THREE.Color(0x00d4ff),
        });

        sigilGlowMesh = new THREE.Mesh(geom.clone(), glowMat);
        sigilGlowMesh.scale.set(1.12, 1.12, 1);
        sigilGlowMesh.position.z = 0.01;

        sigilGroup.add(sigilBaseMesh);
        sigilGroup.add(sigilGlowMesh);

        sigilGroup.position.set(0, 0, 0.2);
        sigilGroup.rotation.x = -0.18;
        sigilGroup.rotation.y = 0.22;

        scene.add(sigilGroup);
        setStatus("✅ Sigil loaded (always visible + glow)");
      };

      img.onerror = () => setStatus("⚠️ Sigil image decode failed");
      img.src = dataUrl;
    })
    .catch((err) => {
      console.error(err);
      setStatus("⚠️ Sigil SVG fetch failed (path/case?)");
    });
}

/* ================= INIT AUDIO ENGINE ================= */

async function initEngine() {
  initThree();

  setStatus("⏳ Initializing engine…");
  try {
    await engine.init();
  } catch (e) {
    console.error(e);
    setStatus("❌ AudioEngine init failed");
    return;
  }

  analyser = engine.ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.82;

  dataFreq = new Uint8Array(analyser.frequencyBinCount);
  dataTime = new Uint8Array(analyser.fftSize);

  inputGain = engine.ctx.createGain();
  inputGain.gain.value = 1;

  monitorGain = engine.ctx.createGain();
  monitorGain.gain.value = 0;

  inputGain.connect(analyser);
  inputGain.connect(monitorGain);

  // your AudioEngine connects master to destination
  monitorGain.connect(engine.master);

  overlay.style.display = "none";
  setStatus("✅ Engine ready (Demo / File / Mic)");
  if (!raf) loop();
}

overlay.onclick = initEngine;

/* ================= CLEAN STOP ================= */

async function stopAll({ suspend = true } = {}) {
  if (bufferSrc) {
    try {
      bufferSrc.onended = null;
    } catch {}
    try {
      bufferSrc.stop(0);
    } catch {}
    try {
      bufferSrc.disconnect();
    } catch {}
    bufferSrc = null;
  }

  if (micSourceNode) {
    try {
      micSourceNode.disconnect();
    } catch {}
    micSourceNode = null;
  }

  if (micStream) {
    try {
      micStream.getTracks().forEach((t) => t.stop());
    } catch {}
    micStream = null;
  }

  currentMode = "idle";
  if (micBtn) micBtn.textContent = "🎙️ Use Microphone";

  feedbackMuted = false;
  feedbackWarnEl.style.display = "none";

  if (monitorGain) monitorGain.gain.value = 0;

  if (suspend && engine?.ctx?.state === "running") {
    try {
      await engine.ctx.suspend();
    } catch {}
  }
}

/* ================= DEMO (play once) ================= */

async function playDemo(path) {
  await initEngine();
  await stopAll({ suspend: false });

  setStatus("⏳ Loading demo…");

  const buf = await fetch(path).then((r) => r.arrayBuffer());
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

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
    });

    micStream = stream;
    micSourceNode = engine.ctx.createMediaStreamSource(stream);
    micSourceNode.connect(inputGain);

    currentMode = "mic";
    micBtn.textContent = "⏹ Stop Microphone";

    feedbackMuted = false;
    feedbackWarnEl.style.display = "none";

    applyMicMonitorGain();
    setStatus("🎙️ Mic running");
  } catch (err) {
    console.error(err);
    setStatus("❌ Mic permission / start failed");
  }
});

/* ================= KEYBOARD SHORTCUTS ================= */

window.addEventListener("keydown", (e) => {
  if (e.key === " " || e.code === "Space") {
    e.preventDefault();
    if (engine?.ctx?.state !== "running") {
      initEngine().then(() => engine.resume());
      setStatus("▶️ Engine resumed");
    } else {
      stopAll({ suspend: true });
      setStatus("⏸️ Engine suspended");
    }
  }
  if (e.key.toLowerCase() === "m") micBtn?.click();
  if (e.key.toLowerCase() === "f") fileBtn?.click();
  if (e.key.toLowerCase() === "d") demoBtn?.click();
  if (e.key === "Escape") setEngineOpen(false);
});

/* ================= HELPERS: PALETTE MODE ================= */

function getPaletteMode() {
  // matches your HTML select values: hue / energy / grayscale
  return palette?.value || "hue";
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/* ================= AUDIO FEATURE EXTRACTION ================= */

// Frequency bin helper
function freqToIndex(freqHz) {
  const nyquist = engine.ctx.sampleRate / 2;
  const idx = Math.round((freqHz / nyquist) * (dataFreq.length - 1));
  return Math.max(0, Math.min(dataFreq.length - 1, idx));
}

function avgRange(fromHz, toHz) {
  const a = freqToIndex(fromHz);
  const b = freqToIndex(toHz);
  let sum = 0;
  let n = 0;
  for (let i = a; i <= b; i++) {
    sum += dataFreq[i];
    n++;
  }
  return n ? sum / (n * 255) : 0;
}

// Envelope for punch (attack/release)
let env = 0;
function punchEnvelope(target, dt) {
  const attack = 0.020;
  const release = 0.160;
  const k = target > env ? 1 - Math.exp(-dt / attack) : 1 - Math.exp(-dt / release);
  env = env + (target - env) * k;
  return env;
}

/* ================= RENDER LOOP ================= */

let lastT = performance.now();

function loop() {
  raf = requestAnimationFrame(loop);
  if (!renderer || !scene || !camera || !analyser) return;

  // Update analyser
  analyser.getByteFrequencyData(dataFreq);
  analyser.getByteTimeDomainData(dataTime);

  const t = performance.now();
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;

  // sensitivity
  const S = clamp01(((parseFloat(sens?.value || "1") - 0.2) / (3 - 0.2)) * 1.4 + 0.2);

  // audio bands
  const bass = avgRange(35, 140);       // kick/body
  const lowMid = avgRange(140, 380);
  const snap = avgRange(1500, 4200);    // snare snap / presence
  const air = avgRange(6000, 12000);

  // punch target: bass + snap
  const punchK = (parseFloat(punchEl?.value || "85") / 100);
  const hitTarget = clamp01((bass * 1.3 + snap * 1.6) * (0.9 + 1.2 * punchK) * (0.75 + 0.55 * S));
  const hit = punchEnvelope(hitTarget, dt);

  // star intensity
  const part = parseFloat(partEl?.value || "10");
  if (starPoints?.material) {
    const m = starPoints.material;
    m.opacity = 0.12 + clamp01(part / 30) * 0.40 + hit * 0.25;
    m.size = 0.05 + hit * 0.05;
  }

  // sphere motion
  if (sphere) {
    const zoomK = parseFloat(zoomEl?.value || "35") / 100;
    const z = 16 - bass * (2.2 + 4.5 * zoomK);
    camera.position.z = reducedMotion ? 16 : z;

    sphere.rotation.y += reducedMotion ? 0 : (0.08 + hit * 0.12) * dt;
    sphere.rotation.x += reducedMotion ? 0 : (0.05 + hit * 0.10) * dt;

    // sphere glow slight
    sphere.material.opacity = 0.12 + hit * 0.10;
  }

  // SIGIL: ALWAYS visible + glow stronger
  if (sigilGroup && sigilBaseMesh && sigilGlowMesh) {
    const glowK = parseFloat(glowEl?.value || "75") / 100;

    // base opacity stable (never disappears)
    sigilBaseMesh.material.opacity = 0.72 + hit * 0.20;

    // scale pulse (ritual punch)
    const baseScale = 1.0 + hit * (0.08 + 0.12 * punchK);
    sigilGroup.scale.set(baseScale, baseScale, 1);

    // slight wobble
    if (!reducedMotion) {
      sigilGroup.rotation.z = Math.sin(t * 0.0012) * 0.08 + hit * 0.10;
    }

    // hue / palette
    const hueBase = (parseFloat(hueEl?.value || "285") % 360) / 360;
    const mode = getPaletteMode();

    let hue = hueBase;
    if (mode === "energy") {
      const e = clamp01((bass * 0.8 + lowMid * 0.6 + air * 0.4) / 1.8);
      hue = (hueBase + e * 0.25) % 1;
    } else if (mode === "grayscale") {
      // grayscale: keep glow cool-white, base white-ish
      sigilGlowMesh.material.color.setRGB(1, 1, 1);
      sigilBaseMesh.material.color?.setRGB?.(1, 1, 1);
    } else {
      // hue mode
      // push towards cyan/purple with snap energy
      hue = (hueBase + snap * 0.18) % 1;
    }

    if (mode !== "grayscale") {
      // cyan/purple glow coloring
      const c = new THREE.Color().setHSL(hue, 0.95, 0.55);
      sigilGlowMesh.material.color.copy(c);
      // slightly tint base too (subtle, keeps visibility)
      const baseC = new THREE.Color().setHSL(hue, 0.55, 0.65);
      sigilBaseMesh.material.color.copy(baseC);
    }

    // glow intensity (additive)
    sigilGlowMesh.material.opacity = 0.35 + glowK * 0.65 + hit * (0.55 + glowK * 0.45);
    sigilGlowMesh.scale.set(1.10 + hit * (0.08 + glowK * 0.10), 1.10 + hit * (0.08 + glowK * 0.10), 1);

    // feedback guard (if mic monitor ON and energy high, mute)
    if (currentMode === "mic" && micMonitor) {
      const total = clamp01((bass + lowMid + snap) / 2.4);
      if (total > 0.85 && !feedbackMuted) {
        feedbackMuted = true;
        feedbackWarnEl.style.display = "block";
        applyMicMonitorGain();
      }
      if (feedbackMuted && total < 0.55) {
        feedbackMuted = false;
        feedbackWarnEl.style.display = "none";
        applyMicMonitorGain();
      }
    }
  }

  renderer.render(scene, camera);
}

/* ================= START STATUS ================= */
setStatus("Visualization idle. Click to initialize.");
