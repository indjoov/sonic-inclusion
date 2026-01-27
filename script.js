import { AudioEngine } from './audio/AudioEngine.js';

/* ================= BASIC SETUP ================= */

const canvas = document.getElementById('viz');
const c = canvas.getContext('2d');

const srText = document.getElementById('srText');
const sens = document.getElementById('sens');

const micBtn = document.getElementById('micBtn');
const fileBtn = document.getElementById('fileBtn');
const demoBtn = document.getElementById('demoBtn');
const fileInput = document.getElementById('fileInput');

// a11y live region
if (srText) {
  srText.setAttribute('aria-live', 'polite');
  srText.setAttribute('role', 'status');
}

function setStatus(msg) {
  if (srText) srText.textContent = msg;
}

/* ================= OVERLAY ================= */

const overlay = document.createElement('div');
overlay.id = 'intro-overlay';
overlay.style.cssText = `
  position:fixed; inset:0; z-index:3000;
  display:flex; align-items:center; justify-content:center;
  background:black; cursor:pointer;
`;
overlay.innerHTML = `
  <div style="
    text-align:center; color:white; font-family:sans-serif;
    background:rgba(5,5,5,0.97); padding:60px;
    border-radius:30px; border:1px solid #00d4ff;
    box-shadow:0 0 80px rgba(0,212,255,.5);
  ">
    <h1 style="margin:0 0 10px; letter-spacing:12px;">SONIC INCLUSION</h1>
    <p style="opacity:.6; letter-spacing:4px; font-size:12px;">
      CLICK TO INITIALIZE
    </p>
  </div>
`;
document.body.appendChild(overlay);

/* ================= ENGINE ================= */

const engine = new AudioEngine();
let raf = null;

// stable analyser routing (mic/file/demo all feed this)
let analyser = null;
let dataFreq = null;
let dataTime = null;

// routing nodes
let inputGain = null;     // all sources -> inputGain
let monitorGain = null;   // what you actually hear -> master

// input nodes
let currentMode = 'idle'; // 'idle' | 'demo' | 'file' | 'mic'
let bufferSrc = null;
let micStream = null;
let micSourceNode = null;

/* ================= VISUAL STATE ================= */

let particles = [];
let rotation = 0;

/* ================= A11Y / REDUCED MOTION ================= */

let reducedMotion = false;

/* ================= MIC MONITOR + FEEDBACK GUARD ================= */

let micMonitor = false;        // checkbox
let micMonitorVol = 0.35;      // 0..1
let feedbackMuted = false;     // safety latch
let feedbackHoldUntil = 0;     // timestamp ms

function applyMicMonitorGain() {
  if (!monitorGain) return;
  const want = (currentMode === 'mic' && micMonitor && !feedbackMuted) ? micMonitorVol : 0;
  monitorGain.gain.value = want;
}

/* ================= ENGINE GUI ================= */

const gui = document.createElement('div');
gui.style.cssText = `
  position:fixed; bottom:20px; right:20px; z-index:1500;
  background:rgba(10,10,10,.9);
  border:1px solid #00d4ff;
  border-radius:14px;
  padding:12px;
  width:240px;
  font-family:sans-serif;
  color:#fff;
  backdrop-filter:blur(10px);
`;

gui.innerHTML = `
  <div style="display:flex; justify-content:space-between; align-items:center;">
    <strong style="letter-spacing:2px; color:#00d4ff;">ENGINE</strong>
    <button id="toggleGui" style="
      background:none; border:1px solid #00d4ff;
      color:#00d4ff; border-radius:8px;
      padding:2px 10px; cursor:pointer;
    ">+</button>
  </div>

  <div id="guiBody" style="display:none; margin-top:10px;">
    <label style="font-size:10px;">PARTICLES</label>
    <input id="partAmount" type="range" min="0" max="30" value="10" style="width:100%;">

    <label style="font-size:10px;">BASS ZOOM</label>
    <input id="zoomInt" type="range" min="0" max="100" value="0" style="width:100%;">

    <label style="font-size:10px;">HUE</label>
    <input id="hueShift" type="range" min="0" max="360" value="280" style="width:100%;">

    <div style="display:flex; gap:6px; margin:10px 0;">
      <button id="presetCalm" style="flex:1; cursor:pointer;">CALM</button>
      <button id="presetBass" style="flex:1; cursor:pointer;">BASS</button>
      <button id="presetCine" style="flex:1; cursor:pointer;">CINE</button>
    </div>

    <label style="font-size:11px; display:flex; align-items:center; gap:8px;">
      <input id="reducedMotion" type="checkbox">
      Reduced Motion
    </label>

    <div style="margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.12);">
      <label style="font-size:11px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <span>Mic Monitor</span>
        <input id="micMonitor" type="checkbox">
      </label>

      <label style="font-size:10px; opacity:0.85; display:block; margin-top:8px;">
        Monitor Volume
        <input id="micMonitorVol" type="range" min="0" max="100" value="35" style="width:100%; margin-top:6px;">
      </label>

      <div id="feedbackWarn" style="display:none; margin-top:8px; font-size:11px; color:#ff0044; font-weight:700;">
        🔇 Feedback risk detected — mic monitor muted
      </div>
    </div>
  </div>
`;
document.body.appendChild(gui);

const toggleBtn = gui.querySelector('#toggleGui');
const guiBody = gui.querySelector('#guiBody');
let guiMin = true;

toggleBtn.onclick = () => {
  guiMin = !guiMin;
  guiBody.style.display = guiMin ? 'none' : 'block';
  toggleBtn.textContent = guiMin ? '+' : '–';
};

// controls
const partEl = gui.querySelector('#partAmount');
const zoomEl = gui.querySelector('#zoomInt');
const hueEl = gui.querySelector('#hueShift');

function preset(p, z, h) {
  partEl.value = String(p);
  zoomEl.value = String(z);
  hueEl.value = String(h);
}

gui.querySelector('#presetCalm').onclick = () => preset(4, 0, 210);
gui.querySelector('#presetBass').onclick = () => preset(18, 10, 340);
gui.querySelector('#presetCine').onclick = () => preset(10, 4, 280);

// reduced motion
gui.querySelector('#reducedMotion').onchange = (e) => {
  reducedMotion = e.target.checked;
  if (reducedMotion) particles = [];
};

// mic monitor elements
const micMonitorEl = gui.querySelector('#micMonitor');
const micMonitorVolEl = gui.querySelector('#micMonitorVol');
const feedbackWarnEl = gui.querySelector('#feedbackWarn');

micMonitorEl.checked = micMonitor;
micMonitorVolEl.value = String(Math.round(micMonitorVol * 100));

micMonitorEl.addEventListener('change', (e) => {
  micMonitor = e.target.checked;
  feedbackMuted = false;
  if (feedbackWarnEl) feedbackWarnEl.style.display = 'none';
  applyMicMonitorGain();
  setStatus(micMonitor ? '🎙️ Mic monitor ON' : '🎙️ Mic monitor OFF');
});

micMonitorVolEl.addEventListener('input', (e) => {
  micMonitorVol = Math.max(0, Math.min(1, parseInt(e.target.value, 10) / 100));
  applyMicMonitorGain();
});

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
  monitorGain.gain.value = 1; // demo/file default

  // route: all sources -> inputGain -> analyser (visual)
  //       and sources -> inputGain -> monitorGain -> master (audio)
  inputGain.connect(analyser);
  inputGain.connect(monitorGain);
  monitorGain.connect(engine.master);

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

  // reset feedback warn
  feedbackMuted = false;
  feedbackHoldUntil = 0;
  if (feedbackWarnEl) feedbackWarnEl.style.display = 'none';

  // mute monitor by default if idle
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

  // demo always audible
  if (monitorGain) monitorGain.gain.value = 1;
  feedbackMuted = false;
  if (feedbackWarnEl) feedbackWarnEl.style.display = 'none';

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

    // file always audible
    if (monitorGain) monitorGain.gain.value = 1;
    feedbackMuted = false;
    if (feedbackWarnEl) feedbackWarnEl.style.display = 'none';

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

    // mic should be muted by default unless monitor enabled
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
});

/* ================= RECORDING (canvas + master audio) ================= */

const recBtn = document.createElement('button');
recBtn.textContent = '⏺ RECORD';
recBtn.style.cssText = `
  position:fixed; bottom:20px; left:20px;
  background:black; color:#ff0044;
  border:1px solid #ff0044;
  padding:10px 16px; border-radius:10px;
  cursor:pointer; z-index:1500;
`;
document.body.appendChild(recBtn);

let mediaRecorder = null;
let recordedChunks = [];

recBtn.addEventListener('click', async () => {
  await initEngine();

  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    recordedChunks = [];

    // ensure audio context running for capture
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
    recBtn.textContent = '⏹ STOP REC';
    setStatus('⏺ Recording…');
  } else {
    mediaRecorder.stop();
    recBtn.textContent = '⏺ RECORD';
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

/* ================= LOOP ================= */

function loop() {
  if (!analyser) {
    raf = requestAnimationFrame(loop);
    return;
  }

  analyser.getByteFrequencyData(dataFreq);
  analyser.getByteTimeDomainData(dataTime);

  // feedback guard (mic mode only)
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
      if (feedbackWarnEl) feedbackWarnEl.style.display = 'block';
      setStatus('🔇 Feedback risk — mic monitor muted');
    }

    if (feedbackMuted && now > feedbackHoldUntil && micRms < QUIET) {
      feedbackMuted = false;
      applyMicMonitorGain();
      if (feedbackWarnEl) feedbackWarnEl.style.display = 'none';
      setStatus('✅ Mic monitor safe again');
    }
  }

  const w = canvas.width;
  const h = canvas.height;
  const low = (dataFreq[2] + dataFreq[4]) / 2;

  const pAmount = parseInt(partEl.value, 10);
  const zoomSens = parseInt(zoomEl.value, 10) / 1000;
  const hueShift = parseInt(hueEl.value, 10);

  const zoom = reducedMotion ? 1 : 1 + (low * zoomSens);
  const hue = (hueShift + low * 0.4) % 360;

  c.fillStyle = 'rgba(5,5,5,0.30)';
  c.fillRect(0, 0, w, h);

  c.save();
  c.translate(w / 2, h / 2);
  c.scale(zoom, zoom);
  c.translate(-w / 2, -h / 2);

  if (!reducedMotion) rotation += 0.002;

  c.strokeStyle = `hsla(${hue},100%,50%,0.22)`;
  for (let i = 0; i < 60; i++) {
    const v = dataFreq[i];
    c.beginPath();
    c.arc(w / 2, h / 2, 100 + v, 0, Math.PI * 2);
    c.stroke();
  }

  if (!reducedMotion && low > 200) {
    for (let i = 0; i < pAmount; i++) {
      particles.push(new Particle(w / 2, h / 2, hue));
    }
  }

  particles = reducedMotion ? [] : particles.filter(p => p.life > 0);
  particles.forEach(p => { p.update(); p.draw(); });

  c.restore();

  raf = requestAnimationFrame(loop);
}

/* ================= RESIZE ================= */

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}
window.addEventListener('resize', resize);
resize();
