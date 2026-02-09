import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { AudioEngine } from './audio/AudioEngine.js';

/* ================= BASIC SETUP ================= */

const canvas = document.getElementById('viz');
const stageEl = canvas.closest('.stage');

const srText = document.getElementById('srText');
const sensEl = document.getElementById('sens');
const paletteEl = document.getElementById('palette');

const micBtn = document.getElementById('micBtn');
const fileBtn = document.getElementById('fileBtn');
const demoBtn = document.getElementById('demoBtn');
const fileInput = document.getElementById('fileInput');

if (srText) {
  srText.setAttribute('aria-live', 'polite');
  srText.setAttribute('role', 'status');
}
function setStatus(msg) {
  if (srText) srText.textContent = msg;
}

/* ================= OVERLAY (autoplay-safe init) ================= */

const overlay = document.createElement('div');
overlay.id = 'intro-overlay';
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

/* ================= ENGINE (Audio) ================= */

const engine = new AudioEngine();
let raf = null;

let analyser = null;
let dataFreq = null;
let dataTime = null;

let inputGain = null;
let monitorGain = null;

let currentMode = 'idle';
let bufferSrc = null;
let micStream = null;
let micSourceNode = null;

/* ================= MODES (A + B) ================= */

let inclusionMode = false;  // B
let flashSafe = true;
let flashLimit = 0.65;

let partAmount = 14;    // A
let bassZoom = 0.10;
let hueShiftDeg = 280;
let reducedMotion = false;

/* ================= THREE ================= */

let renderer, scene, camera;

// particles
let particlePoints, particleGeom, particleMat;
const particleCount = 12000;
let basePos, pos, vel;

// sigil group
let sigilGroup = null;
let sigilFill = null;
let sigilLines = null;

// cage
let cageWire = null;

/* ================= MIC MONITOR + FEEDBACK GUARD ================= */

let micMonitor = false;
let micMonitorVol = 0.35;
let feedbackMuted = false;
let feedbackHoldUntil = 0;

function applyMicMonitorGain() {
  if (!monitorGain) return;
  const want = (currentMode === 'mic' && micMonitor && !feedbackMuted) ? micMonitorVol : 0;
  monitorGain.gain.value = want;
}

/* ================= CLEAN LEGACY UI ================= */

function removeLegacyUI() {
  document.getElementById('si-hud')?.remove();
  document.getElementById('si-enginePanel')?.remove();
  document.getElementById('engine-controls')?.remove();
  document.getElementById('engine-controls-toggle')?.remove();
}
removeLegacyUI();

/* ================= MODERN HUD (ENGINE + RECORD) ================= */

const hud = document.createElement('div');
hud.id = 'si-hud';
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
const recBtn = document.createElement('button');
recBtn.id = 'si-recBtn';
recBtn.type = 'button';
recBtn.textContent = '⏺ RECORD';
recBtn.setAttribute('aria-pressed', 'false');
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
const engineToggle = document.createElement('button');
engineToggle.id = 'si-engineToggle';
engineToggle.type = 'button';
engineToggle.textContent = '⚙️ ENGINE';
engineToggle.setAttribute('aria-expanded', 'false');
engineToggle.setAttribute('aria-controls', 'si-enginePanel');
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
const enginePanel = document.createElement('div');
enginePanel.id = 'si-enginePanel';
enginePanel.setAttribute('role', 'dialog');
enginePanel.setAttribute('aria-label', 'Engine controls');
enginePanel.setAttribute('aria-hidden', 'true');
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
      PARTICLES (energy)
      <input id="partAmount" type="range" min="0" max="30" value="14" style="width:100%; margin-top:6px;">
    </label>

    <label style="font-size:12px; opacity:0.8;">
      BASS ZOOM
      <input id="zoomInt" type="range" min="0" max="100" value="10" style="width:100%; margin-top:6px;">
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

    <label style="font-size:12px; display:flex; align-items:center; gap:10px;">
      <input id="inclusionMode" type="checkbox">
      Inclusion Mode (High-Contrast + Stable)
    </label>

    <label style="font-size:12px; display:flex; align-items:center; gap:10px;">
      <input id="flashSafe" type="checkbox" checked>
      Flash-safe limiter
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
  enginePanel.style.display = open ? 'block' : 'none';
  enginePanel.setAttribute('aria-hidden', open ? 'false' : 'true');
  engineToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}
engineToggle.addEventListener('click', () => setEngineOpen(!engineOpen));
enginePanel.querySelector('#si-engineClose').addEventListener('click', () => setEngineOpen(false));

// Swipe-down close (mobile)
let touchStartY = null;
enginePanel.addEventListener('touchstart', (e) => {
  touchStartY = e.touches?.[0]?.clientY ?? null;
}, { passive: true });
enginePanel.addEventListener('touchmove', (e) => {
  if (touchStartY == null) return;
  const y = e.touches?.[0]?.clientY ?? touchStartY;
  const dy = y - touchStartY;
  if (dy > 50) {
    setEngineOpen(false);
    touchStartY = null;
  }
}, { passive: true });

/* ================= ENGINE PANEL CONTROL HOOKS ================= */

const partEl = enginePanel.querySelector('#partAmount');
const zoomEl = enginePanel.querySelector('#zoomInt');
const hueEl  = enginePanel.querySelector('#hueShift');

const reducedEl = enginePanel.querySelector('#reducedMotion');
const inclusionEl = enginePanel.querySelector('#inclusionMode');
const flashSafeEl = enginePanel.querySelector('#flashSafe');

const micMonitorEl = enginePanel.querySelector('#micMonitor');
const micMonitorVolEl = enginePanel.querySelector('#micMonitorVol');
const feedbackWarnEl = enginePanel.querySelector('#feedbackWarn');

function preset(p, z, h) {
  partAmount = p; bassZoom = z / 100; hueShiftDeg = h;
  partEl.value = String(p);
  zoomEl.value = String(z);
  hueEl.value  = String(h);
}
enginePanel.querySelector('#presetCalm').addEventListener('click', () => preset(10, 6, 210));
enginePanel.querySelector('#presetBass').addEventListener('click', () => preset(20, 14, 340));
enginePanel.querySelector('#presetCine').addEventListener('click', () => preset(14, 10, 280));

partEl.addEventListener('input', (e) => { partAmount = Number(e.target.value); });
zoomEl.addEventListener('input', (e) => { bassZoom = Number(e.target.value) / 100; });
hueEl.addEventListener('input', (e) => { hueShiftDeg = Number(e.target.value); });

reducedEl.addEventListener('change', (e) => {
  reducedMotion = !!e.target.checked;
  setStatus(reducedMotion ? '🫧 Reduced motion enabled' : '✨ Reduced motion disabled');
});

inclusionEl.addEventListener('change', (e) => {
  inclusionMode = !!e.target.checked;
  if (inclusionMode) {
    reducedMotion = true;
    reducedEl.checked = true;
    preset(10, 6, 210);
    setStatus('🫶 Inclusion Mode ON (stable + high-contrast)');
  } else {
    setStatus('🕯️ Ritual Mode ON');
  }
});

flashSafeEl.addEventListener('change', (e) => {
  flashSafe = !!e.target.checked;
  setStatus(flashSafe ? '🛡️ Flash-safe ON' : '⚠️ Flash-safe OFF');
});

micMonitorEl.checked = micMonitor;
micMonitorVolEl.value = String(Math.round(micMonitorVol * 100));
micMonitorEl.addEventListener('change', (e) => {
  micMonitor = !!e.target.checked;
  feedbackMuted = false;
  feedbackWarnEl.style.display = 'none';
  applyMicMonitorGain();
  setStatus(micMonitor ? '🎙️ Mic monitor ON' : '🎙️ Mic monitor OFF');
});
micMonitorVolEl.addEventListener('input', (e) => {
  micMonitorVol = Math.max(0, Math.min(1, parseInt(e.target.value, 10) / 100));
  applyMicMonitorGain();
});

/* ================= SAFE FRAMING + HI-DPI ================= */

function fitCanvasToStage() {
  const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
  const rect = (stageEl || canvas).getBoundingClientRect();
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));

  if (renderer) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(cssW, cssH, false);
  }
  if (camera) {
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
  }
}
const ro = new ResizeObserver(() => fitCanvasToStage());
if (stageEl) ro.observe(stageEl);
window.addEventListener('resize', fitCanvasToStage);

/* ================= THREE INIT ================= */

function initThree() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 1);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.08);

  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 250);
  camera.position.set(0, 0.2, 18);

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  // particles
  particleGeom = new THREE.BufferGeometry();
  basePos = new Float32Array(particleCount * 3);
  pos = new Float32Array(particleCount * 3);
  vel = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i++) {
    const r = 6.5 + Math.random() * 5.0;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.cos(phi) * 0.85;
    const z = r * Math.sin(phi) * Math.sin(theta);

    basePos[i * 3 + 0] = x; basePos[i * 3 + 1] = y; basePos[i * 3 + 2] = z;
    pos[i * 3 + 0] = x;     pos[i * 3 + 1] = y;     pos[i * 3 + 2] = z;

    vel[i * 3 + 0] = (Math.random() - 0.5) * 0.02;
    vel[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
    vel[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
  }

  particleGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  particleGeom.computeBoundingSphere();

  particleMat = new THREE.PointsMaterial({
    size: 0.04,
    color: 0x8feaff,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  particlePoints = new THREE.Points(particleGeom, particleMat);
  scene.add(particlePoints);

  // cage
  const wire = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(2.6, 2));
  cageWire = new THREE.LineSegments(
    wire,
    new THREE.LineBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.25 })
  );
  scene.add(cageWire);

  // sigil (SVG -> 3D)
  loadSigilSVG('media/indjoov-sigil.svg');

  fitCanvasToStage();
}

/* SVG -> Sigil */
function loadSigilSVG(url) {
  const loader = new SVGLoader();

  loader.load(
    url,
    (data) => {
      if (sigilGroup) {
        scene.remove(sigilGroup);
        sigilGroup.traverse(o => o.geometry?.dispose?.());
        sigilGroup = null;
      }

      sigilGroup = new THREE.Group();

      const fillMat = new THREE.MeshBasicMaterial({ color: 0x7c4dff, transparent: true, opacity: 0.78, depthWrite: false });
      const lineMat = new THREE.LineBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.55 });

      const shapes = [];
      const lines = [];

      for (const p of data.paths) {
        const s = SVGLoader.createShapes(p);
        for (const shape of s) shapes.push(shape);

        const points = p.subPaths?.flatMap(sp => sp.getPoints(220)) ?? [];
        if (points.length > 2) {
          const g = new THREE.BufferGeometry().setFromPoints(points.map(pt => new THREE.Vector3(pt.x, -pt.y, 0)));
          const l = new THREE.Line(g, lineMat);
          lines.push(l);
        }
      }

      if (shapes.length) {
        const geom = new THREE.ShapeGeometry(shapes);
        sigilFill = new THREE.Mesh(geom, fillMat);
        sigilGroup.add(sigilFill);
      }

      sigilLines = new THREE.Group();
      for (const l of lines) sigilLines.add(l);
      sigilGroup.add(sigilLines);

      // center + scale
      const box = new THREE.Box3().setFromObject(sigilGroup);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      sigilGroup.position.sub(center); // center to origin

      const maxDim = Math.max(size.x, size.y) || 1;
      const scale = 4.4 / maxDim; // target size
      sigilGroup.scale.setScalar(scale);

      sigilGroup.rotation.x = -0.15;
      sigilGroup.rotation.y = 0.25;

      scene.add(sigilGroup);
      setStatus('✅ Sigil loaded (SVG → 3D)');
    },
    undefined,
    () => setStatus('⚠️ Sigil SVG not found — check /media/indjoov-sigil.svg')
  );
}

/* ================= INIT / ROUTING ================= */

async function initEngine() {
  if (engine.state !== 'idle') return;

  setStatus('⏳ Initializing engine…');
  await engine.init();

  const viz = engine.getVisualizerData();
  analyser = viz.analyser;
  dataFreq = viz.dataFreq;
  dataTime = viz.dataTime;

  inputGain = engine.ctx.createGain();
  inputGain.gain.value = 1;

  monitorGain = engine.ctx.createGain();
  monitorGain.gain.value = 1;

  inputGain.connect(analyser);
  inputGain.connect(monitorGain);
  monitorGain.connect(engine.master);

  if (!renderer) initThree();

  overlay.style.display = 'none';
  setStatus('✅ Engine ready (Demo / File / Mic)');
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

  currentMode = 'idle';
  if (micBtn) micBtn.textContent = '🎙️ Use Microphone';

  feedbackMuted = false;
  feedbackHoldUntil = 0;
  feedbackWarnEl.style.display = 'none';

  if (monitorGain) monitorGain.gain.value = 0;

  if (suspend && engine.ctx) {
    try { await engine.ctx.suspend(); } catch {}
  }
}

/* ================= DEMO / FILE / MIC ================= */

async function playDemo(path) {
  await initEngine();
  await stopAll({ suspend: false });

  setStatus('⏳ Loading demo…');
  const buf = await fetch(path).then(r => r.arrayBuffer());
  const audio = await engine.ctx.decodeAudioData(buf);

  await engine.resume();
  currentMode = 'demo';

  if (monitorGain) monitorGain.gain.value = 1;

  bufferSrc = engine.ctx.createBufferSource();
  bufferSrc.buffer = audio;
  bufferSrc.loop = false;
  bufferSrc.connect(inputGain);

  bufferSrc.onended = async () => {
    await stopAll({ suspend: true });
    setStatus('✅ Demo finished (played once)');
  };

  bufferSrc.start(0);
  setStatus('🎧 Demo playing (once)');
}
demoBtn?.addEventListener('click', () => playDemo('media/kasubo hoerprobe.mp3'));

fileBtn?.addEventListener('click', async () => {
  await initEngine();
  fileInput?.click();
});

fileInput?.addEventListener('change', async (e) => {
  try {
    await initEngine();
    const file = e.target.files?.[0];
    if (!file) return;

    await stopAll({ suspend: false });
    setStatus('⏳ Decoding file…');

    const arrayBuf = await file.arrayBuffer();
    const audio = await engine.ctx.decodeAudioData(arrayBuf);

    await engine.resume();
    currentMode = 'file';

    if (monitorGain) monitorGain.gain.value = 1;

    bufferSrc = engine.ctx.createBufferSource();
    bufferSrc.buffer = audio;
    bufferSrc.loop = false;
    bufferSrc.connect(inputGain);

    bufferSrc.onended = async () => {
      await stopAll({ suspend: true });
      setStatus('✅ File playback finished');
    };

    bufferSrc.start(0);
    setStatus(`🎵 Playing file: ${file.name}`);
  } catch (err) {
    console.error(err);
    setStatus('❌ File playback error');
  } finally {
    if (fileInput) fileInput.value = '';
  }
});

micBtn?.addEventListener('click', async () => {
  await initEngine();

  if (currentMode === 'mic') {
    await stopAll({ suspend: true });
    setStatus('⏹ Mic stopped');
    return;
  }

  try {
    await stopAll({ suspend: false });
    setStatus('⏳ Requesting microphone…');

    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });

    await engine.resume();
    currentMode = 'mic';

    applyMicMonitorGain();

    micSourceNode = engine.ctx.createMediaStreamSource(micStream);
    micSourceNode.connect(inputGain);

    if (micBtn) micBtn.textContent = '⏹ Stop Microphone';
    setStatus(micMonitor ? '🎙️ Microphone active (monitor ON)' : '🎙️ Microphone active (monitor OFF)');
  } catch (err) {
    console.error(err);
    await stopAll({ suspend: true });
    setStatus('❌ Microphone permission / error');
  }
});

/* ================= KEYBOARD SHORTCUTS ================= */

window.addEventListener('keydown', async (e) => {
  const key = e.key.toLowerCase();

  if (key === ' ') {
    e.preventDefault();
    if (currentMode !== 'idle') {
      await stopAll({ suspend: true });
      setStatus('⏹ Stopped');
    } else {
      await playDemo('media/kasubo hoerprobe.mp3');
    }
  }
  if (key === 'm') micBtn?.click();
  if (key === 'f') fileBtn?.click();
  if (key === 'd') demoBtn?.click();
  if (key === 'escape') setEngineOpen(false);
});

/* ================= RECORDING (canvas + master audio) ================= */

let mediaRecorder = null;
let recordedChunks = [];

recBtn.addEventListener('click', async () => {
  await initEngine();

  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    recordedChunks = [];
    if (engineOpen) setEngineOpen(false);
    await engine.resume();

    const stream = canvas.captureStream(60);

    const recDest = engine.ctx.createMediaStreamDestination();
    engine.master.connect(recDest);

    const audioTrack = recDest.stream.getAudioTracks()[0];
    if (audioTrack) stream.addTrack(audioTrack);

    const mimeCandidates = ['video/webm; codecs=vp9','video/webm; codecs=vp8','video/webm'];
    let chosen = '';
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

      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Sonic_Inclusion_Sigil.webm';
      a.click();

      setStatus('✅ Recording saved');
    };

    mediaRecorder.start();

    recBtn.textContent = '⏹ STOP';
    recBtn.setAttribute('aria-pressed', 'true');
    recBtn.style.background = '#111';
    recBtn.style.color = '#ff2b5a';
    recBtn.style.borderColor = 'rgba(255,43,90,0.75)';

    setStatus('⏺ Recording…');
  } else {
    mediaRecorder.stop();

    recBtn.textContent = '⏺ RECORD';
    recBtn.setAttribute('aria-pressed', 'false');
    recBtn.style.background = '#ff2b5a';
    recBtn.style.color = '#111';
    recBtn.style.borderColor = 'rgba(255,255,255,0.15)';

    setStatus('⏹ Stopping recording…');
  }
});

/* ================= VISUAL HELPERS ================= */

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function rmsFromTimeDomain(arr) {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = (arr[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / arr.length);
}

function bandEnergy(freq, startHz, endHz) {
  if (!engine?.ctx || !analyser) return 0;
  const nyquist = engine.ctx.sampleRate / 2;
  const binCount = analyser.frequencyBinCount;

  const i0 = Math.floor((startHz / nyquist) * binCount);
  const i1 = Math.floor((endHz / nyquist) * binCount);
  const a = clamp(i0, 0, binCount - 1);
  const b = clamp(i1, 0, binCount - 1);

  let s = 0, n = 0;
  for (let i = a; i <= b; i++) { s += freq[i]; n++; }
  return n ? (s / n) / 255 : 0;
}

function estimatePitchHue(freq) {
  let num = 0, den = 0;
  for (let i = 0; i < freq.length; i++) {
    const v = freq[i] / 255;
    num += i * v;
    den += v;
  }
  const centroid = den ? num / den : 0;
  return (centroid / freq.length) * 300;
}

function feedbackGuard(rms) {
  const now = performance.now();
  if (currentMode !== 'mic') return;

  if (micMonitor && !feedbackMuted && rms > 0.35) {
    feedbackMuted = true;
    feedbackHoldUntil = now + 900;
    feedbackWarnEl.style.display = 'block';
    applyMicMonitorGain();
  }
  if (feedbackMuted && now > feedbackHoldUntil) {
    feedbackMuted = false;
    feedbackWarnEl.style.display = 'none';
    applyMicMonitorGain();
  }
}

/* ================= LOOP ================= */

let a11yTick = 0;

function loop() {
  raf = requestAnimationFrame(loop);
  if (!renderer || !scene || !camera) return;

  let rms = 0, bass = 0, mid = 0, treble = 0;

  if (analyser && dataFreq && dataTime) {
    analyser.getByteFrequencyData(dataFreq);
    analyser.getByteTimeDomainData(dataTime);

    rms = rmsFromTimeDomain(dataTime);
    bass = bandEnergy(dataFreq, 20, 140);
    mid = bandEnergy(dataFreq, 140, 1400);
    treble = bandEnergy(dataFreq, 1400, 8000);

    feedbackGuard(rms);
  }

  const sens = clamp(Number(sensEl?.value ?? 1), 0.2, 3);
  const palette = paletteEl?.value ?? 'hue';

  let hue = hueShiftDeg;
  if (palette === 'hue' && dataFreq) hue = (estimatePitchHue(dataFreq) + hueShiftDeg) % 360;
  if (palette === 'energy') hue = (hueShiftDeg + (bass * 120) + (mid * 80)) % 360;

  const energyRaw = clamp((rms * 2.2 + bass * 1.6) * sens, 0, 2.0);
  const pulseRaw  = (bass * 1.8 + mid * 0.6) * sens;

  let energy = energyRaw;
  let pulse = pulseRaw;
  if (flashSafe) {
    energy = Math.min(energy, 1.0);
    pulse = Math.min(pulse, 1.0);
  }

  const forceHighContrast = inclusionMode || (palette === 'grayscale');

  if (forceHighContrast) {
    particleMat.color.setRGB(0.95, 0.95, 0.98);
    particleMat.opacity = 0.55;

    if (sigilFill?.material) { sigilFill.material.color.setRGB(0.98,0.98,0.99); sigilFill.material.opacity = 0.35; }
    if (sigilLines) sigilLines.traverse(o => { if (o.material) { o.material.color.setRGB(0.85,0.85,0.90); o.material.opacity = 0.55; } });
    if (cageWire?.material) { cageWire.material.color.setRGB(0.75,0.75,0.80); cageWire.material.opacity = 0.18; }
  } else {
    particleMat.color.setHSL(hue / 360, 1.0, 0.62);
    particleMat.opacity = 0.95;

    if (sigilFill?.material) { sigilFill.material.color.setHSL(((hue + 70) % 360) / 360, 1.0, 0.58); sigilFill.material.opacity = 0.78; }
    if (sigilLines) sigilLines.traverse(o => { if (o.material) { o.material.color.setHSL(((hue + 160) % 360) / 360, 1.0, 0.55); o.material.opacity = 0.55; } });
    if (cageWire?.material) { cageWire.material.color.setHSL(((hue + 140) % 360) / 360, 1.0, 0.5); cageWire.material.opacity = 0.22; }
  }

  if (flashSafe) {
    particleMat.opacity = Math.min(particleMat.opacity, 0.35 + flashLimit);
    if (sigilFill?.material) sigilFill.material.opacity = Math.min(sigilFill.material.opacity, 0.25 + flashLimit * 0.7);
    if (cageWire?.material) cageWire.material.opacity = Math.min(cageWire.material.opacity, 0.14 + flashLimit * 0.35);
  }

  const drift = (reducedMotion || inclusionMode) ? 0.35 : 1.0;
  const zoom = 1 + (bassZoom * 0.9) + (bass * 0.65);
  const active = clamp(partAmount / 30, 0, 1);

  // particles move
  const posAttr = particleGeom.getAttribute('position');
  for (let i = 0; i < particleCount; i++) {
    const ix = i * 3;

    const bx = basePos[ix + 0];
    const by = basePos[ix + 1];
    const bz = basePos[ix + 2];

    const toCenter = -0.0008 * energy;
    vel[ix + 0] += bx * toCenter;
    vel[ix + 1] += by * toCenter;
    vel[ix + 2] += bz * toCenter;

    const swirl = 0.0007 * (0.2 + treble) * drift;
    vel[ix + 0] += -bz * swirl;
    vel[ix + 2] += bx * swirl;

    const jitter = (0.0009 * energy + 0.00012) * active * drift;
    vel[ix + 0] += (Math.random() - 0.5) * jitter;
    vel[ix + 1] += (Math.random() - 0.5) * jitter;
    vel[ix + 2] += (Math.random() - 0.5) * jitter;

    vel[ix + 0] *= 0.985;
    vel[ix + 1] *= 0.985;
    vel[ix + 2] *= 0.985;

    pos[ix + 0] += vel[ix + 0];
    pos[ix + 1] += vel[ix + 1];
    pos[ix + 2] += vel[ix + 2];

    const tx = bx * zoom;
    const ty = by * zoom;
    const tz = bz * zoom;

    pos[ix + 0] += (tx - pos[ix + 0]) * 0.0025;
    pos[ix + 1] += (ty - pos[ix + 1]) * 0.0025;
    pos[ix + 2] += (tz - pos[ix + 2]) * 0.0025;
  }
  posAttr.needsUpdate = true;

  // ritual motion (sigil + cage + camera)
  const t = performance.now() * 0.001;

  if (sigilGroup) {
    const s = 1 + pulse * 0.42;
    sigilGroup.rotation.z = t * 0.25 + treble * 0.35;
    sigilGroup.rotation.y = 0.25 + Math.sin(t * 0.45) * 0.12 + mid * 0.12;
    sigilGroup.rotation.x = -0.15 + Math.cos(t * 0.35) * 0.08 + bass * 0.08;
    sigilGroup.scale.setScalar(s);
  }

  if (cageWire) {
    cageWire.rotation.y = -t * 0.22;
    cageWire.rotation.x = t * 0.10;
  }

  camera.position.x = Math.sin(t * 0.22) * ((reducedMotion || inclusionMode) ? 0.05 : 0.28);
  camera.position.y = 0.2 + Math.cos(t * 0.20) * ((reducedMotion || inclusionMode) ? 0.05 : 0.18);
  camera.lookAt(0, 0, 0);

  // a11y text
  a11yTick++;
  if (a11yTick % 30 === 0) {
    const mood =
      energy < 0.12 ? 'Calm field, slow orbit.' :
      energy < 0.35 ? 'Breathing pulse, moderate motion.' :
      'High energy, dense motion and strong pulse.';
    const mode =
      currentMode === 'mic' ? 'Microphone active.' :
      currentMode === 'file' ? 'File playback.' :
      currentMode === 'demo' ? 'Demo playback.' :
      'Idle.';
    setStatus(`${mode} ${mood}`);
  }

  renderer.render(scene, camera);
}
