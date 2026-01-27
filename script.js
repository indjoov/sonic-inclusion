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

// We create our own analyser for stable routing (mic/file/demo all go through it)
let analyser = null;
let dataFreq = null;
let dataTime = null;

// input nodes
let currentMode = 'idle'; // 'idle' | 'demo' | 'file' | 'mic'
let bufferSrc = null;
let micStream = null;
let micSourceNode = null;
let inputGain = null; // optional control point

/* ================= ENGINE GUI (collapsible + presets + reduced motion) ================= */

let reducedMotion = false;

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

gui.querySelector('#reducedMotion').onchange = (e) => {
  reducedMotion = e.target.checked;
  if (reducedMotion) particles = [];
};

/* ================= INIT / ROUTING ================= */

async function initEngine() {
  if (engine.state !== 'idle') return;

  setStatus('⏳ Initializing engine…');
  await engine.init({ startSuspended: true, debug: false });

  // Create analyser + routing nodes once
  analyser = engine.ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;

  dataFreq = new Uint8Array(analyser.frequencyBinCount);
  dataTime = new Uint8Array(analyser.fftSize);

  inputGain = engine.ctx.createGain();
  inputGain.gain.value = 1;

  // route: inputGain -> analyser -> master
  inputGain.connect(analyser);
  analyser.connect(engine.master);

  overlay.style.display = 'none';
  setStatus('✅ Engine ready (click Demo / File / Mic)');

  if (!raf) loop();
}

overlay.onclick = initEngine;

/* ================= CLEAN STOP (important) ================= */

async function stopAll({ suspend = true } = {}) {
  // stop buffer source
  if (bufferSrc) {
    try { bufferSrc.onended = null; } catch {}
    try { bufferSrc.stop(0); } catch {}
    try { bufferSrc.disconnect(); } catch {}
    bufferSrc = null;
  }

  // stop mic
  if (micSourceNode) {
    try { micSourceNode.disconnect(); } catch {}
    micSourceNode = null;
  }
  if (micStream) {
    try {
      micStream.getTracks().forEach(t => t.stop());
    } catch {}
    micStream = null;
  }

  currentMode = 'idle';

  // UI
  if (micBtn) micBtn.textContent = '🎙️ Use Microphone';

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

  bufferSrc = engine.ctx.createBufferSource();
  bufferSrc.buffer = audio;
  bufferSrc.loop = false; // ✅ once
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

    bufferSrc = engine.ctx.createBufferSource();
    bufferSrc.buffer = audio;
    bufferSrc.loop = false; // ✅ once
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
    // allow picking same file again
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

    micSourceNode = engine.ctx.createMediaStreamSource(micStream);
    micSourceNode.connect(inputGain);

    if (micBtn) micBtn.textContent = '⏹ Stop Microphone';
    setStatus('🎙️ Microphone active');
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
      // default action: demo
      await playDemo('media/kasubo hoerprobe.mp3');
    }
  }

  if (key === 'm') micBtn?.click();
  if (key === 'f') fileBtn?.click();
  if (key === 'd') demoBtn?.click();
});

/* ================= RECORDING (clean) ================= */

// floating record button (keeps your HTML clean)
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

    // make sure audio is running (otherwise some browsers capture silence)
    await engine.resume();

    const stream = canvas.captureStream(60);

    // record audio from master
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

    mediaRecorder.onstop = async () => {
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

let particles = [];

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

/* ================= LOOP ================= */

function loop() {
  if (!analyser) {
    raf = requestAnimationFrame(loop);
    return;
  }

  analyser.getByteFrequencyData(dataFreq);
  analyser.getByteTimeDomainData(dataTime);

  const w = canvas.width;
  const h = canvas.height;

  const low = (dataFreq[2] + dataFreq[4]) / 2;

  const pAmount = parseInt(partEl.value, 10);
  const zoomSens = parseInt(zoomEl.value, 10) / 1000;
  const hueShift = parseInt(hueEl.value, 10);

  const zoom = reducedMotion ? 1 : 1 + (low * zoomSens);
  const hue = (hueShift + low * 0.4) % 360;

  // background
  c.fillStyle = 'rgba(5,5,5,0.30)';
  c.fillRect(0, 0, w, h);

  c.save();
  c.translate(w / 2, h / 2);
  c.scale(zoom, zoom);
  c.translate(-w / 2, -h / 2);

  // rings
  c.strokeStyle = `hsla(${hue},100%,50%,0.22)`;
  for (let i = 0; i < 60; i++) {
    const v = dataFreq[i];
    c.beginPath();
    c.arc(w / 2, h / 2, 100 + v, 0, Math.PI * 2);
    c.stroke();
  }

  // particles (disabled in reduced motion)
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
