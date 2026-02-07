import { AudioEngine } from './audio/AudioEngine.js';

/* ================= BASIC SETUP ================= */

const canvas = document.getElementById('viz');
const stageEl = document.querySelector('.stage');
const c = canvas.getContext('2d');

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

/* ================= ENGINE ================= */

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

/* ================= VISUAL STATE ================= */

let particles = [];
let rotation = 0;

/* ================= DPR-safe canvas sizing ================= */

let viewW = 960; // CSS px
let viewH = 540; // CSS px

/* ================= SAFE FRAME ================= */

function safeFrame() {
  const pad = Math.max(14, Math.min(28, Math.round(Math.min(viewW, viewH) * 0.04)));
  const cx = viewW * 0.5;
  const cy = viewH * 0.5;
  const r = Math.max(60, Math.min(cx, cy) - pad);
  return { cx, cy, r, pad };
}

/* ================= REDUCED MOTION ================= */

let reducedMotion = false;

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

/* ================= HUD ================= */

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

const engineToggle = document.createElement('button');
engineToggle.id = 'si-engineToggle';
engineToggle.type = 'button';
engineToggle.textContent = '⚙️ ENGINE';
engineToggle.setAttribute('aria-expanded', 'false');
engineToggle.setAttribute('aria-controls', 'si-enginePanel');
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

/* ================= ENGINE PANEL ================= */

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
      PARTICLES
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

let engineOpen = false;
function setEngineOpen(open) {
  engineOpen = open;
  enginePanel.style.display = open ? 'block' : 'none';
  enginePanel.setAttribute('aria-hidden', open ? 'false' : 'true');
  engineToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}
engineToggle.addEventListener('click', () => setEngineOpen(!engineOpen));
enginePanel.querySelector('#si-engineClose').addEventListener('click', () => setEngineOpen(false));

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

function autoCloseEngineForRecording() {
  if (engineOpen) setEngineOpen(false);
}

/* ================= ENGINE PANEL HOOKS ================= */

const partEl = enginePanel.querySelector('#partAmount');
const zoomEl = enginePanel.querySelector('#zoomInt');
const hueEl  = enginePanel.querySelector('#hueShift');

function preset(p, z, h) {
  partEl.value = String(p);
  zoomEl.value = String(z);
  hueEl.value  = String(h);
}
enginePanel.querySelector('#presetCalm').addEventListener('click', () => preset(4, 0, 210));
enginePanel.querySelector('#presetBass').addEventListener('click', () => preset(18, 10, 340));
enginePanel.querySelector('#presetCine').addEventListener('click', () => preset(10, 4, 280));

enginePanel.querySelector('#reducedMotion').addEventListener('change', (e) => {
  reducedMotion = !!e.target.checked;
  if (reducedMotion) particles = [];
});

const micMonitorEl = enginePanel.querySelector('#micMonitor');
const micMonitorVolEl = enginePanel.querySelector('#micMonitorVol');
const feedbackWarnEl = enginePanel.querySelector('#feedbackWarn');

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

/* ================= LAYOUT: viewport-fit stage height ================= */
/* ✅ Fix: Stage passt sich dem verfügbaren Viewport an (inkl. HUD) */

function updateStageHeight() {
  if (!stageEl) return;

  const hudRect = hud.getBoundingClientRect();
  const stageRect = stageEl.getBoundingClientRect();

  // Platz nach unten bis HUD (mit etwas Luft)
  const gap = 14;
  const available = (window.innerHeight - hudRect.height - gap) - stageRect.top;

  // clamp: nicht zu klein / nicht absurd groß
  const h = Math.max(260, Math.min(740, Math.floor(available)));

  document.documentElement.style.setProperty('--vizH', `${h}px`);
}

/* ================= INIT / ROUTING ================= */

async function initEngine() {
  if (engine.state !== 'idle') return;

  setStatus('⏳ Initializing engine…');
  await engine.init({ startSuspended: true, debug: false });

  analyser = engine.ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;

  dataFreq = new Uint8Array(analyser.frequencyBinCount);
  dataTime = new Uint8Array(analyser.fftSize);

  inputGain = engine.ctx.createGain();
  inputGain.gain.value = 1;

  monitorGain = engine.ctx.createGain();
  monitorGain.gain.value = 1;

  inputGain.connect(analyser);
  inputGain.connect(monitorGain);
  monitorGain.connect(engine.master);

  overlay.style.display = 'none';
  setStatus('✅ Engine ready (Demo / File / Mic)');

  // layout after overlay hide
  updateStageHeight();
  resizeCanvasDPR();

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

  if (suspend) {
    try { await engine.ctx.suspend(); } catch {}
  }
}

/* ================= DEMO (play once) ================= */

async function playDemo(path) {
  await initEngine();
  await stopAll({ suspend: false });

  setStatus('⏳ Loading demo…');

  const buf = await fetch(path).then(r => r.arrayBuffer());
  const audio = await engine.ctx.decodeAudioData(buf);

  await engine.resume();
  currentMode = 'demo';

  if (monitorGain) monitorGain.gain.value = 1;
  feedbackMuted = false;
  feedbackWarnEl.style.display = 'none';

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

/* ================= FILE INPUT (play once) ================= */

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
    feedbackMuted = false;
    feedbackWarnEl.style.display = 'none';

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

/* ================= MIC INPUT (toggle) ================= */

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
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
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
    autoCloseEngineForRecording();
    await engine.resume();

    const stream = canvas.captureStream(60);

    const recDest = engine.ctx.createMediaStreamDestination();
    engine.master.connect(recDest);

    const audioTrack = recDest.stream.getAudioTracks()[0];
    if (audioTrack) stream.addTrack(audioTrack);

    const mimeCandidates = [
      'video/webm; codecs=vp9',
      'video/webm; codecs=vp8',
      'video/webm',
    ];

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
      a.download = 'Sonic_Inclusion_Cinematic.webm';
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

/* ================= VISUALS ================= */

class Particle {
  constructor(x, y, hue) {
    this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * 10;
    this.vy = (Math.random() - 0.5) * 10;
    this.life = 1;
    this.hue = hue;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life -= 0.03;
  }
  draw() {
    c.fillStyle = `hsla(${this.hue},100%,60%,${this.life})`;
    c.beginPath();
    c.arc(this.x, this.y, 2, 0, Math.PI * 2);
    c.fill();
  }
}

function rmsFromTimeDomain(arr) {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = (arr[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / arr.length);
}

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

/* ================= LOOP ================= */

function loop() {
  if (!analyser) {
    raf = requestAnimationFrame(loop);
    return;
  }

  analyser.getByteFrequencyData(dataFreq);
  analyser.getByteTimeDomainData(dataTime);

  const now = performance.now();
  const micRms = rmsFromTimeDomain(dataTime);

  const LOUD = 0.22;
  const QUIET = 0.10;
  const HOLD_MS = 2500;

  if (currentMode === 'mic' && micMonitor) {
    if (!feedbackMuted && micRms > LOUD) {
      feedbackMuted = true;
      feedbackHoldUntil = now + HOLD_MS;
      applyMicMonitorGain();
      feedbackWarnEl.style.display = 'block';
      setStatus('🔇 Feedback risk — mic monitor muted');
    }

    if (feedbackMuted && now > feedbackHoldUntil && micRms < QUIET) {
      feedbackMuted = false;
      applyMicMonitorGain();
      feedbackWarnEl.style.display = 'none';
      setStatus('✅ Mic monitor safe again');
    }
  }

  const w = viewW;
  const h = viewH;
  if (!w || !h) { raf = requestAnimationFrame(loop); return; }

  const low = (dataFreq[2] + dataFreq[4]) / 2;

  const pAmount = parseInt(partEl.value, 10);
  const zoomSens = parseInt(zoomEl.value, 10) / 1000;
  const hueShift = parseInt(hueEl.value, 10);

  const sens = sensEl ? parseFloat(sensEl.value) : 1;
  const zoom = reducedMotion ? 1 : 1 + (low * zoomSens * sens);

  const mode = paletteEl?.value || 'hue';
  let hue = (hueShift + low * 0.4) % 360;
  if (mode === 'energy') hue = (hueShift + (micRms * 900)) % 360;

  const sat = (mode === 'grayscale') ? 0 : 100;
  const lum = (mode === 'grayscale') ? 85 : 50;

  const { cx, cy, r } = safeFrame();

  c.fillStyle = 'rgba(5,5,5,0.28)';
  c.fillRect(0, 0, w, h);

  c.save();

  c.translate(cx, cy);
  c.scale(zoom, zoom);
  c.translate(-cx, -cy);

  if (!reducedMotion) rotation += 0.002;

  const rings = clamp(Math.floor(r / 8), 36, 90);

  c.lineWidth = 1;
  c.strokeStyle = `hsla(${hue},${sat}%,${lum}%,0.22)`;

  for (let i = 0; i < rings; i++) {
    const v = dataFreq[i % dataFreq.length];
    const rr = r * 0.35 + (i * (r * 0.65 / rings)) + (v * 0.75);
    c.beginPath();
    c.arc(cx, cy, rr, 0, Math.PI * 2);
    c.stroke();
  }

  const threshold = 180 / sens;
  if (!reducedMotion && low > threshold) {
    for (let i = 0; i < pAmount; i++) particles.push(new Particle(cx, cy, hue));
  }

  particles = reducedMotion ? [] : particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.update();

    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.hypot(dx, dy);
    const maxDist = r * 0.95;
    if (dist > maxDist) {
      const t = maxDist / (dist || 1);
      p.x = cx + dx * t;
      p.y = cy + dy * t;
      p.vx *= -0.45;
      p.vy *= -0.45;
    }

    p.draw();
  });

  c.restore();
  raf = requestAnimationFrame(loop);
}

/* ================= RESIZE (DPR safe) ================= */

function resizeCanvasDPR() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();

  viewW = Math.max(1, Math.round(rect.width));
  viewH = Math.max(1, Math.round(rect.height));

  const pxW = Math.max(1, Math.round(rect.width * dpr));
  const pxH = Math.max(1, Math.round(rect.height * dpr));

  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW;
    canvas.height = pxH;
  }

  c.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function onResizeAll() {
  updateStageHeight();
  // warten bis CSS height angewendet ist
  requestAnimationFrame(() => {
    resizeCanvasDPR();
  });
}

window.addEventListener('resize', onResizeAll);
window.addEventListener('orientationchange', onResizeAll);
window.addEventListener('scroll', () => {
  // nur leicht reagieren, damit es nicht nervt
  clearTimeout(window.__siScrollT);
  window.__siScrollT = setTimeout(onResizeAll, 120);
});

onResizeAll();
