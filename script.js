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
let sigilGroup = null;

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
      <input id="zoomInt" type="range" min="0" max="100" value="0" style="width:100%; margin-top:6px;">
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
enginePanel.querySelector("#presetCalm").addEventListener("click", () => preset(6, 0, 210));
enginePanel.querySelector("#presetBass").addEventListener("click", () => preset(18, 12, 340));
enginePanel.querySelector("#presetCine").addEventListener("click", () => preset(12, 6, 280));

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

  // Load sigil plane (transparent background + reactive)
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
    opacity: 0.35
  });
  return new THREE.Points(geom, mat);
}

/* ================= SIGIL (SVG -> Canvas -> transparent) ================= */

function loadSigilPlane(url) {
  // remove old
  if (sigilGroup) {
    scene.remove(sigilGroup);
    sigilGroup.traverse(o => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) {
        if (o.material.map) o.material.map.dispose?.();
        o.material.dispose?.();
      }
    });
    sigilGroup = null;
  }

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
        const ctx2d = cvs.getContext("2d");

        // normalize background
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

        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          depthTest: false,             // always visible
          blending: THREE.AdditiveBlending
        });

        const geom = new THREE.PlaneGeometry(6.8, 6.8);
        const mesh = new THREE.Mesh(geom, mat);

        sigilGroup = new THREE.Group();
        sigilGroup.add(mesh);

        sigilGroup.position.set(0, 0, 0.2); // slightly in front
        sigilGroup.rotation.x = -0.18;
        sigilGroup.rotation.y = 0.22;

        scene.add(sigilGroup);
        setStatus("✅ Sigil loaded (transparent + reactive)");
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

async function initEngine() {
  if (engine.state !== "idle" && engine.state !== "ready" && engine.state !== "running") return;

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
  dataTime = new Uint8Array(analyser.fftSize);

  // routing
  inputGain = engine.ctx.createGain();
  inputGain.gain.value = 1;

  monitorGain = engine.ctx.createGain();
  monitorGain.gain.value = 1;

  inputGain.connect(analyser);
  inputGain.connect(monitorGain);

  // engine.master exists in your AudioEngine and is connected to destination already
  monitorGain.connect(engine.master);

  overlay.style.display = "none";
  setStatus("✅ Engine ready (Demo / File / Mic)");

  if (!raf) loop();
}

overlay.onclick = initEngine;

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
    setStatus("⏳ Requesting microphone…");

    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    await engine.resume();
    currentMode = "mic";

    applyMicMonitorGain();

    micSourceNode = engine.ctx.createMediaStreamSource(micStream);
    micSourceNode.connect(inputGain);

    if (micBtn) micBtn.textContent = "⏹ Stop Microphone";
    setStatus(micMonitor ? "🎙️ Microphone active (monitor ON)" : "🎙️ Microphone active (monitor OFF)");
  } catch (err) {
    console.error(err);
    await stopAll({ suspend: true });
    setStatus("❌ Microphone permission / error");
  }
});

/* ================= KEYBOARD SHORTCUTS ================= */

window.addEventListener("keydown", async (e) => {
  const key = e.key.toLowerCase();

  if (key === " ") {
    e.preventDefault();
    if (currentMode !== "idle") {
      await stopAll({ suspend: true });
      setStatus("⏹ Stopped");
    } else {
      await playDemo("media/kasubo hoerprobe.mp3");
    }
  }

  if (key === "m") micBtn?.click();
  if (key === "f") fileBtn?.click();
  if (key === "d") demoBtn?.click();
  if (key === "escape") setEngineOpen(false);
});

/* ================= RECORDING (canvas + master audio) ================= */

let mediaRecorder = null;
let recordedChunks = [];

recBtn.addEventListener("click", async () => {
  await initEngine();

  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    recordedChunks = [];
    autoCloseEngineForRecording();
    await engine.resume();

    // capture THREE canvas
    const stream = canvas.captureStream(60);

    // add audio
    const recDest = engine.ctx.createMediaStreamDestination();
    engine.master.connect(recDest);

    const audioTrack = recDest.stream.getAudioTracks()[0];
    if (audioTrack) stream.addTrack(audioTrack);

    const mimeCandidates = [
      "video/webm; codecs=vp9",
      "video/webm; codecs=vp8",
      "video/webm"
    ];

    let chosen = "";
    for (const m of mimeCandidates) {
      if (MediaRecorder.isTypeSupported(m)) { chosen = m; break; }
    }

    mediaRecorder = new MediaRecorder(stream, chosen ? { mimeType: chosen } : undefined);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      try { engine.master.disconnect(recDest); } catch {}
      try { audioTrack?.stop(); } catch {}

      const blob = new Blob(recordedChunks, { type: "video/webm" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "Sonic_Inclusion_Cinematic.webm";
      a.click();

      setStatus("✅ Recording saved");
    };

    mediaRecorder.start();

    recBtn.textContent = "⏹ STOP";
    recBtn.setAttribute("aria-pressed", "true");
    recBtn.style.background = "#111";
    recBtn.style.color = "#ff2b5a";
    recBtn.style.borderColor = "rgba(255,43,90,0.75)";

    setStatus("⏺ Recording…");
  } else {
    mediaRecorder.stop();

    recBtn.textContent = "⏺ RECORD";
    recBtn.setAttribute("aria-pressed", "false");
    recBtn.style.background = "#ff2b5a";
    recBtn.style.color = "#111";
    recBtn.style.borderColor = "rgba(255,255,255,0.15)";

    setStatus("⏹ Stopping recording…");
  }
});

/* ================= AUDIO HELPERS ================= */

function rmsFromTimeDomain(arr) {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = (arr[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / arr.length);
}

function bandEnergy(freqArr, fromHz, toHz, sampleRate, fftSize) {
  // freq bin width = sampleRate/fftSize
  const binHz = sampleRate / fftSize;
  const fromBin = Math.max(0, Math.floor(fromHz / binHz));
  const toBin = Math.min(freqArr.length - 1, Math.floor(toHz / binHz));
  let sum = 0;
  let n = 0;
  for (let i = fromBin; i <= toBin; i++) { sum += freqArr[i]; n++; }
  return n ? sum / n / 255 : 0;
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

/* ================= MAIN LOOP ================= */

let t0 = performance.now();

function loop() {
  raf = requestAnimationFrame(loop);

  if (!renderer || !scene || !camera) return;

  // if audio running, update analyser
  let energy = 0;
  let bass = 0;
  let treble = 0;

  if (analyser && dataFreq && dataTime && engine?.ctx) {
    analyser.getByteFrequencyData(dataFreq);
    analyser.getByteTimeDomainData(dataTime);

    const s = parseFloat(sens?.value || "1");
    energy = clamp(rmsFromTimeDomain(dataTime) * 2.2 * s, 0, 1);

    bass = clamp(bandEnergy(dataFreq, 30, 180, engine.ctx.sampleRate, analyser.fftSize) * (1.2 + s), 0, 1);
    treble = clamp(bandEnergy(dataFreq, 2200, 9000, engine.ctx.sampleRate, analyser.fftSize) * (1.2 + s), 0, 1);
  }

  const now = performance.now();
  const dt = (now - t0) / 1000;
  t0 = now;

  const hueShift = parseFloat(hueEl?.value || "280");
  const zoom = parseFloat(zoomEl?.value || "0") / 100;

  // palette logic (simple)
  let color = new THREE.Color();
  const mode = palette?.value || "hue";
  if (mode === "grayscale") {
    const g = clamp(0.1 + energy * 0.9, 0, 1);
    color.setRGB(g, g, g);
  } else if (mode === "energy") {
    const h = (hueShift + energy * 160) % 360;
    color.setHSL(h / 360, 1.0, 0.6);
  } else {
    // "hue" — treble influences hue more
    const h = (hueShift + treble * 220) % 360;
    color.setHSL(h / 360, 1.0, 0.6);
  }

  // stars drift
  if (starPoints && !reducedMotion) {
    starPoints.rotation.y += dt * 0.03;
    starPoints.rotation.x += dt * 0.01;

    const starOpacity = clamp(0.12 + (parseFloat(partEl?.value || "10") / 30) * 0.45 + energy * 0.25, 0.08, 0.95);
    starPoints.material.opacity = starOpacity;
  }

  // sphere reacts
  if (sphere) {
    sphere.material.color.copy(color);
    sphere.material.opacity = clamp(0.08 + energy * 0.22, 0.06, 0.42);

    if (!reducedMotion) {
      sphere.rotation.y += dt * (0.18 + treble * 0.9);
      sphere.rotation.x += dt * (0.10 + bass * 0.6);
    }

    const s = 1 + bass * (0.22 + zoom * 0.9);
    sphere.scale.setScalar(s);
  }

  // sigil reacts (always visible, depthTest false)
  if (sigilGroup) {
    const mesh = sigilGroup.children[0];
    const pulse = energy;

    // stronger response
    const ss = 1 + pulse * 1.15;
    sigilGroup.scale.setScalar(ss);

    if (!reducedMotion) {
      sigilGroup.rotation.z += dt * (0.25 + treble * 1.1);
    }

    // glow / opacity
    if (mesh?.material) {
      mesh.material.opacity = clamp(0.25 + pulse * 0.95, 0.20, 1.0);
      // subtle color tint by hueShift
      // (Additive blending means this looks like neon)
    }

    // gentle “breathing” in/out
    sigilGroup.position.z = 0.2 + bass * 0.4;
  }

  // camera bass zoom
  camera.position.z = 16 - bass * (2.2 + zoom * 6.0);

  renderer.render(scene, camera);
}

/* ================= START BUTTONS ================= */

setStatus("Visualization idle. Click to initialize.");
