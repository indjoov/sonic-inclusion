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

// Sigil layers
let sigilGroup = null;
let sigilBase = null; // ink plane
let sigilGlow = null; // glow plane

// Ritual rings pool
let ringPool = [];
let ringCursor = 0;

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

/* ================= ENGINE PANEL ================= */

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
      STARS (amount)
      <input id="partAmount" type="range" min="0" max="30" value="10" style="width:100%; margin-top:6px;">
    </label>

    <label style="font-size:12px; opacity:0.8;">
      BASS ZOOM
      <input id="zoomInt" type="range" min="0" max="100" value="18" style="width:100%; margin-top:6px;">
    </label>

    <label style="font-size:12px; opacity:0.8;">
      HUE
      <input id="hueShift" type="range" min="0" max="360" value="280" style="width:100%; margin-top:6px;">
    </label>

    <div style="display:flex; gap:8px;">
      <button id="presetCalm" type="button" style="flex:1; border-radius:12px; padding:10px; cursor:pointer;">CALM</button>
      <button id="presetBass" type="button" style="flex:1; border-radius:12px; padding:10px; cursor:pointer;">BASS</button>
      <button id="presetRitual" type="button" style="flex:1; border-radius:12px; padding:10px; cursor:pointer;">RITUAL</button>
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

/* ================= ENGINE PANEL CONTROL HOOKS ================= */

const partEl = enginePanel.querySelector("#partAmount");
const zoomEl = enginePanel.querySelector("#zoomInt");
const hueEl  = enginePanel.querySelector("#hueShift");

function preset(p, z, h) {
  partEl.value = String(p);
  zoomEl.value = String(z);
  hueEl.value  = String(h);
}
enginePanel.querySelector("#presetCalm").addEventListener("click", () => preset(6, 8, 210));
enginePanel.querySelector("#presetBass").addEventListener("click", () => preset(16, 28, 340));
enginePanel.querySelector("#presetRitual").addEventListener("click", () => preset(10, 18, 285));

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

  // subtle ambient (mostly BasicMaterials)
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));

  // Stars (static space)
  starPoints = makeStars(1400, 80);
  scene.add(starPoints);

  // Wireframe sphere
  const geo = new THREE.IcosahedronGeometry(5.1, 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00d4ff,
    wireframe: true,
    transparent: true,
    opacity: 0.26
  });
  sphere = new THREE.Mesh(geo, mat);
  scene.add(sphere);

  // Ritual ring pool
  initRings();

  // Sigil layers (ink + glow)
  loadSigilLayers("media/indjoov-sigil.svg");

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
    opacity: 0.28
  });
  return new THREE.Points(geom, mat);
}

/* ================= RITUAL RINGS (snare pulses) ================= */

function initRings() {
  // cleanup old
  ringPool.forEach(r => {
    scene.remove(r.mesh);
    r.mesh.geometry.dispose();
    r.mesh.material.dispose();
  });
  ringPool = [];
  ringCursor = 0;

  const count = 8;
  for (let i = 0; i < count; i++) {
    const g = new THREE.RingGeometry(2.6, 2.9, 96);
    const m = new THREE.MeshBasicMaterial({
      color: 0x8feaff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(0, 0, 0.25);
    mesh.rotation.x = -0.18;
    mesh.rotation.y = 0.22;
    mesh.scale.set(1, 1, 1);
    scene.add(mesh);

    ringPool.push({
      mesh,
      t: 999,
      life: 0.55,
      baseScale: 1.0
    });
  }
}

function triggerRingPulse(intensity = 1) {
  if (!ringPool.length) return;
  const r = ringPool[ringCursor % ringPool.length];
  ringCursor++;

  r.t = 0;
  r.life = 0.48;
  r.baseScale = 0.92 + 0.22 * intensity;

  // alternate cyan/purple for ritual vibe
  const col = (Math.random() < 0.5) ? 0x00d4ff : 0x7c4dff;
  r.mesh.material.color.setHex(col);
  r.mesh.material.opacity = 0.85;
}

/* ================= SIGIL (SVG -> Canvas baked ink grain + glow layer) ================= */

function disposeSigilGroup() {
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
  sigilBase = null;
  sigilGlow = null;
}

function loadSigilLayers(url) {
  disposeSigilGroup();

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

        // --- base canvas (ink + transparent bg)
        const base = document.createElement("canvas");
        base.width = size;
        base.height = size;
        const ctx = base.getContext("2d");

        // paint white, draw, then key out white -> alpha
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);

        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (size - w) / 2;
        const y = (size - h) / 2;
        ctx.drawImage(img, x, y, w, h);

        const imgData = ctx.getImageData(0, 0, size, size);
        const d = imgData.data;

        // Key out near-white, and bake ink grain into the strokes
        const thr = 245;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];

          // remove background
          if (r >= thr && g >= thr && b >= thr) {
            d[i + 3] = 0;
            continue;
          }

          // ink grain on visible pixels
          if (a > 0) {
            const grain = 0.82 + Math.random() * 0.20; // 0.82..1.02
            d[i + 0] = Math.max(0, Math.min(255, d[i + 0] * grain));
            d[i + 1] = Math.max(0, Math.min(255, d[i + 1] * grain));
            d[i + 2] = Math.max(0, Math.min(255, d[i + 2] * grain));
          }
        }
        ctx.putImageData(imgData, 0, 0);

        // --- glow canvas (blurred version)
        const glow = document.createElement("canvas");
        glow.width = size;
        glow.height = size;
        const gctx = glow.getContext("2d");
        gctx.clearRect(0, 0, size, size);

        // draw base then blur (pseudo bloom)
        gctx.filter = "blur(10px)";
        gctx.globalAlpha = 1;
        gctx.drawImage(base, 0, 0);
        gctx.filter = "blur(22px)";
        gctx.globalAlpha = 0.85;
        gctx.drawImage(base, 0, 0);
        gctx.filter = "none";

        // three textures
        const baseTex = new THREE.CanvasTexture(base);
        baseTex.colorSpace = THREE.SRGBColorSpace;
        baseTex.needsUpdate = true;

        const glowTex = new THREE.CanvasTexture(glow);
        glowTex.colorSpace = THREE.SRGBColorSpace;
        glowTex.needsUpdate = true;

        const plane = new THREE.PlaneGeometry(6.9, 6.9);

        // Ink plane: normal blending, stays readable
        const inkMat = new THREE.MeshBasicMaterial({
          map: baseTex,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          depthTest: false,
          blending: THREE.NormalBlending
        });

        // Glow plane: additive, colored
        const glowMat = new THREE.MeshBasicMaterial({
          map: glowTex,
          transparent: true,
          opacity: 0.55,
          color: new THREE.Color(0x00d4ff),
          depthWrite: false,
          depthTest: false,
          blending: THREE.AdditiveBlending
        });

        sigilBase = new THREE.Mesh(plane, inkMat);
        sigilGlow = new THREE.Mesh(plane, glowMat);

        // glow slightly larger, centered (NOT offset)
        sigilGlow.scale.set(1.08, 1.08, 1.08);

        sigilGroup = new THREE.Group();
        sigilGroup.add(sigilGlow);
        sigilGroup.add(sigilBase);

        sigilGroup.position.set(0, 0, 0.22); // in front
        sigilGroup.rotation.x = -0.18;
        sigilGroup.rotation.y = 0.22;

        scene.add(sigilGroup);
        setStatus("✅ Sigil loaded (ink grain + dual glow)");
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
  initThree();

  setStatus("⏳ Initializing engine…");
  try {
    await engine.init();
  } catch (e) {
    console.error(e);
  }

  analyser = engine.ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.85;

  dataFreq = new Uint8Array(analyser.frequencyBinCount);
  dataTime = new Uint8Array(analyser.fftSize);

  inputGain = engine.ctx.createGain();
  inputGain.gain.value = 1;

  monitorGain = engine.ctx.createGain();
  monitorGain.gain.value = 0;

  inputGain.connect(analyser);
  inputGain.connect(monitorGain);
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
        autoGainControl: false
      }
    });

    await engine.resume();
    currentMode = "mic";

    micSourceNode = engine.ctx.createMediaStreamSource(micStream);
    micSourceNode.connect(inputGain);

    micBtn.textContent = "⏹ Stop Microphone";

    // monitor defaults OFF (avoid feedback)
    applyMicMonitorGain();

    setStatus("🎙️ Mic active");
  } catch (err) {
    console.error(err);
    setStatus("❌ Mic permission / device error");
    await stopAll({ suspend: true });
  }
});

/* ================= KEYBOARD SHORTCUTS ================= */

window.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") setEngineOpen(false);

  if (e.key === " "){
    e.preventDefault();
    // space: stop current playback
    if (currentMode !== "idle") {
      await stopAll({ suspend: true });
      setStatus("⏹ Stopped");
    }
  }

  if (e.key.toLowerCase() === "m") micBtn?.click();
  if (e.key.toLowerCase() === "f") fileBtn?.click();
  if (e.key.toLowerCase() === "d") demoBtn?.click();
});

/* ================= AUDIO FEATURE EXTRACTION ================= */

// Helper mapping from Hz to analyser bin
function hzToBin(hz) {
  if (!engine?.ctx || !analyser) return 0;
  const nyquist = engine.ctx.sampleRate / 2;
  const idx = Math.round((hz / nyquist) * (analyser.frequencyBinCount - 1));
  return Math.max(0, Math.min(analyser.frequencyBinCount - 1, idx));
}

function bandEnergy(freqData, hzLo, hzHi) {
  const a = hzToBin(hzLo);
  const b = hzToBin(hzHi);
  let sum = 0;
  const n = Math.max(1, b - a + 1);
  for (let i = a; i <= b; i++) sum += freqData[i];
  return (sum / n) / 255; // normalize 0..1
}

let bassSm = 0;
let midSm = 0;
let snareSm = 0;

// transient detection for snare "snap"
let snareAvg = 0;
let snarePrev = 0;
let lastSnareTrig = 0;

// global pulse for extra flash
let snapFlash = 0;

/* ================= MAIN LOOP ================= */

function loop() {
  raf = requestAnimationFrame(loop);

  if (!renderer || !scene || !camera) return;

  // If no analyser yet, render idle subtly
  let bass = 0, mid = 0, snare = 0;

  if (analyser && dataFreq) {
    analyser.getByteFrequencyData(dataFreq);

    const sensitivity = sens ? parseFloat(sens.value) : 1;

    bass = bandEnergy(dataFreq, 30, 140) * sensitivity;
    mid  = bandEnergy(dataFreq, 200, 1200) * sensitivity;
    snare = bandEnergy(dataFreq, 1800, 5200) * sensitivity;

    // smooth (more ritual, less jitter)
    bassSm = bassSm * 0.88 + bass * 0.12;
    midSm = midSm * 0.90 + mid * 0.10;
    snareSm = snareSm * 0.78 + snare * 0.22;

    // transient detect (snap)
    snareAvg = snareAvg * 0.965 + snareSm * 0.035;
    const rise = snareSm - snarePrev;
    snarePrev = snareSm;

    const now = performance.now() / 1000;
    const cooldown = 0.14; // seconds
    const isHit = (snareSm > snareAvg * 1.55) && (rise > 0.06);

    if (isHit && (now - lastSnareTrig) > cooldown) {
      lastSnareTrig = now;
      snapFlash = 1.0;
      triggerRingPulse(Math.min(1, snareSm * 1.6));
    }
  } else {
    bassSm *= 0.97;
    midSm *= 0.97;
    snareSm *= 0.97;
  }

  // decay flash
  snapFlash *= 0.86;
  if (snapFlash < 0.001) snapFlash = 0;

  // ===== VISUALS =====

  // Stars: keep SPACE (static), only tiny twinkle (not music)
  if (starPoints) {
    const tw = 0.22 + 0.06 * Math.sin(performance.now() * 0.0007);
    starPoints.material.opacity = tw;
  }

  // Sphere: slow drift + small bass breathing (not crazy)
  if (sphere) {
    const hueShift = hueEl ? parseFloat(hueEl.value) : 280;
    const hue = ((hueShift % 360) / 360);
    const col = new THREE.Color().setHSL(hue, 0.75, 0.55);

    // palette mode
    const mode = palette?.value || "hue";
    if (mode === "grayscale") {
      sphere.material.color.setHex(0xdadada);
      sphere.material.opacity = 0.18 + bassSm * 0.10;
    } else if (mode === "energy") {
      const energy = Math.min(1, (bassSm * 0.65 + midSm * 0.25 + snareSm * 0.55));
      sphere.material.color.setHSL(hue, 0.85, 0.35 + energy * 0.35);
      sphere.material.opacity = 0.14 + energy * 0.24;
    } else {
      sphere.material.color.copy(col);
      sphere.material.opacity = 0.18 + bassSm * 0.18;
    }

    const drift = reducedMotion ? 0 : 0.0009;
    sphere.rotation.y += drift;
    sphere.rotation.x += drift * 0.65;

    const breath = 1 + bassSm * 0.08;
    sphere.scale.set(breath, breath, breath);
  }

  // Camera: cinematic bass push + snare kickback
  if (camera) {
    const zoomInt = zoomEl ? (parseFloat(zoomEl.value) / 100) : 0.18;
    const bassPush = bassSm * (0.9 * zoomInt);
    const kick = snapFlash * 0.28;

    const targetZ = 16 - bassPush * 2.8 + kick * 0.65;
    camera.position.z = camera.position.z * 0.92 + targetZ * 0.08;
  }

  // Sigil: Ink stays readable, Glow reacts (cyan bass + purple snap)
  if (sigilGroup && sigilBase && sigilGlow) {
    const mode = palette?.value || "hue";

    // base ink opacity gently breathes, never disappears
    sigilBase.material.opacity = 0.86 + bassSm * 0.08;

    // glow color logic
    let glowColor = new THREE.Color(0x00d4ff);

    if (mode === "grayscale") {
      glowColor = new THREE.Color(0xffffff);
    } else {
      const cyan = new THREE.Color(0x00d4ff);
      const purple = new THREE.Color(0x7c4dff);
      glowColor = cyan.clone().lerp(purple, Math.min(1, snapFlash * 1.15));
    }

    sigilGlow.material.color.copy(glowColor);

    // glow opacity = bass aura + snare flash, clamped
    const aura = 0.36 + bassSm * 0.55;
    const flash = snapFlash * 0.95;
    sigilGlow.material.opacity = Math.max(0.28, Math.min(0.95, aura + flash));

    // ritual snap = micro jitter (very short)
    const jitter = reducedMotion ? 0 : snapFlash * 0.02;
    sigilGroup.rotation.y = 0.22 + Math.sin(performance.now() * 0.0012) * 0.02 + (Math.random() - 0.5) * jitter;
    sigilGroup.rotation.x = -0.18 + Math.sin(performance.now() * 0.0010) * 0.015 + (Math.random() - 0.5) * jitter;

    // breathing scale (bass)
    const s = 1 + bassSm * 0.10 + snapFlash * 0.04;
    sigilGroup.scale.set(s, s, s);
  }

  // Ritual rings animate
  const dt = 1 / 60;
  for (const r of ringPool) {
    if (r.t >= 999) continue;
    r.t += dt;
    const p = Math.min(1, r.t / r.life);

    // ease out
    const ease = 1 - Math.pow(1 - p, 3);

    const scale = r.baseScale + ease * 1.35;
    r.mesh.scale.set(scale, scale, scale);

    // fade + slight flicker
    const flick = 0.92 + 0.08 * Math.sin(performance.now() * 0.02);
    r.mesh.material.opacity = (1 - p) * 0.85 * flick;

    if (p >= 1) {
      r.t = 999;
      r.mesh.material.opacity = 0;
    }
  }

  // Stars amount (UI) — but not music-reactive movement
  if (starPoints && partEl) {
    // Map slider to opacity rather than motion
    const val = parseFloat(partEl.value); // 0..30
    starPoints.material.opacity = Math.max(0, Math.min(0.55, 0.12 + val * 0.012));
  }

  renderer.render(scene, camera);
}

/* ================= RECORD BUTTON (placeholder) ================= */
recBtn.addEventListener("click", () => {
  // Placeholder: later you can plug MediaRecorder or CCapture
  const pressed = recBtn.getAttribute("aria-pressed") === "true";
  recBtn.setAttribute("aria-pressed", pressed ? "false" : "true");
  recBtn.textContent = pressed ? "⏺ RECORD" : "⏹ STOP";
  setStatus(pressed ? "⏺ Record ready" : "⏹ Record (placeholder) stopped");
});
