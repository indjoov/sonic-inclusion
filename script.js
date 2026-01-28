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

/* ================= A11Y ================= */

if (srText) {
  srText.setAttribute('aria-live', 'polite');
  srText.setAttribute('role', 'status');
}
const setStatus = (msg) => srText && (srText.textContent = msg);

/* ================= INTRO OVERLAY ================= */

const overlay = document.createElement('div');
overlay.style.cssText = `
  position:fixed; inset:0; z-index:3000;
  display:flex; align-items:center; justify-content:center;
  background:black; cursor:pointer;
`;
overlay.innerHTML = `
  <div style="
    text-align:center; color:white;
    background:rgba(5,5,5,.97);
    padding:60px; border-radius:30px;
    border:1px solid #00d4ff;
    box-shadow:0 0 80px rgba(0,212,255,.5);
  ">
    <h1 style="letter-spacing:12px;">SONIC INCLUSION</h1>
    <p style="opacity:.6; letter-spacing:4px; font-size:12px;">
      CLICK TO INITIALIZE
    </p>
  </div>
`;
document.body.appendChild(overlay);

/* ================= ENGINE ================= */

const engine = new AudioEngine();
let analyser, dataFreq, dataTime;
let inputGain, monitorGain;
let bufferSrc, micStream, micNode;
let currentMode = 'idle';
let raf = null;

/* ================= STATE ================= */

let particles = [];
let rotation = 0;
let reducedMotion = false;

/* ================= MIC MONITOR ================= */

let micMonitor = false;
let micMonitorVol = 0.35;
let feedbackMuted = false;
let feedbackHoldUntil = 0;

const applyMicMonitorGain = () => {
  if (!monitorGain) return;
  monitorGain.gain.value =
    currentMode === 'mic' && micMonitor && !feedbackMuted
      ? micMonitorVol
      : 0;
};

/* ================= ENGINE GUI ================= */

const gui = document.createElement('div');
gui.style.cssText = `
  position:fixed; bottom:90px; right:20px; z-index:1500;
  width:220px;
  background:rgba(10,10,10,.9);
  border:1px solid #00d4ff;
  border-radius:14px;
  padding:12px;
  font-family:sans-serif;
  color:white;
  backdrop-filter:blur(10px);
`;

gui.innerHTML = `
  <div style="display:flex; justify-content:space-between; align-items:center;">
    <strong style="color:#00d4ff; letter-spacing:2px;">ENGINE</strong>
    <button id="toggleGui" aria-expanded="false"
      style="border:1px solid #00d4ff; background:none;
      color:#00d4ff; border-radius:8px; padding:2px 10px;">+</button>
  </div>

  <div id="guiBody" aria-hidden="true"
    style="display:none; margin-top:10px; touch-action:pan-y;">

    <label style="font-size:10px;">PARTICLES</label>
    <input id="partAmount" type="range" min="0" max="30" value="10">

    <label style="font-size:10px;">BASS ZOOM</label>
    <input id="zoomInt" type="range" min="0" max="100" value="0">

    <label style="font-size:10px;">HUE</label>
    <input id="hueShift" type="range" min="0" max="360" value="280">

    <div style="display:flex; gap:6px; margin:10px 0;">
      <button id="presetCalm">CALM</button>
      <button id="presetBass">BASS</button>
      <button id="presetCine">CINE</button>
    </div>

    <label style="font-size:11px;">
      <input id="reducedMotion" type="checkbox"> Reduced Motion
    </label>

    <hr>

    <label style="font-size:11px;">
      <input id="micMonitor" type="checkbox"> Mic Monitor
    </label>

    <label style="font-size:10px;">
      Monitor Volume
      <input id="micMonitorVol" type="range" min="0" max="100" value="35">
    </label>

    <div id="feedbackWarn"
      style="display:none; font-size:11px; color:#ff0044;">
      🔇 Feedback muted
    </div>

    <div style="font-size:11px; opacity:.6; margin-top:6px;">
      Swipe down to close
    </div>
  </div>
`;
document.body.appendChild(gui);

const toggleBtn = gui.querySelector('#toggleGui');
const guiBody = gui.querySelector('#guiBody');

const setGuiOpen = (open) => {
  guiBody.style.display = open ? 'block' : 'none';
  toggleBtn.textContent = open ? '–' : '+';
  toggleBtn.setAttribute('aria-expanded', open);
  guiBody.setAttribute('aria-hidden', !open);
};

toggleBtn.onclick = () =>
  setGuiOpen(guiBody.style.display === 'none');

/* Swipe down close */
let touchStart = null;
guiBody.addEventListener('touchstart', e => touchStart = e.touches[0].clientY);
guiBody.addEventListener('touchmove', e => {
  if (touchStart && e.touches[0].clientY - touchStart > 70) {
    setGuiOpen(false);
    touchStart = null;
  }
});

/* ================= ENGINE INIT ================= */

async function initEngine() {
  if (engine.state !== 'idle') return;
  setStatus('Initializing engine…');

  await engine.init({ startSuspended: true });

  analyser = engine.ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;

  dataFreq = new Uint8Array(analyser.frequencyBinCount);
  dataTime = new Uint8Array(analyser.fftSize);

  inputGain = engine.ctx.createGain();
  monitorGain = engine.ctx.createGain();

  inputGain.connect(analyser);
  inputGain.connect(monitorGain);
  monitorGain.connect(engine.master);

  overlay.remove();
  loop();
  setStatus('Engine ready');
}

overlay.onclick = initEngine;

/* ================= STOP ALL ================= */

async function stopAll() {
  bufferSrc?.stop?.();
  bufferSrc = null;

  micStream?.getTracks().forEach(t => t.stop());
  micStream = null;

  monitorGain && (monitorGain.gain.value = 0);
  currentMode = 'idle';

  await engine.ctx.suspend();
}

/* ================= DEMO ================= */

demoBtn.onclick = async () => {
  await initEngine();
  await stopAll();

  const buf = await fetch('media/kasubo hoerprobe.mp3')
    .then(r => r.arrayBuffer())
    .then(b => engine.ctx.decodeAudioData(b));

  await engine.resume();
  currentMode = 'demo';

  bufferSrc = engine.ctx.createBufferSource();
  bufferSrc.buffer = buf;
  bufferSrc.connect(inputGain);
  monitorGain.gain.value = 1;
  bufferSrc.start();

  setStatus('Demo playing');
};

/* ================= MIC ================= */

micBtn.onclick = async () => {
  await initEngine();

  if (currentMode === 'mic') {
    await stopAll();
    setStatus('Mic stopped');
    return;
  }

  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  await engine.resume();
  currentMode = 'mic';

  micNode = engine.ctx.createMediaStreamSource(micStream);
  micNode.connect(inputGain);
  applyMicMonitorGain();

  setStatus('Mic active');
};

/* ================= RECORD ================= */

const recBtn = document.createElement('button');
recBtn.textContent = '⏺ RECORD';
recBtn.style.cssText = `
  position:fixed; bottom:20px; left:20px;
  background:black; color:#ff0044;
  border:1px solid #ff0044;
  padding:10px 16px;
  border-radius:10px;
`;
document.body.appendChild(recBtn);

let mediaRecorder, chunks = [];

recBtn.onclick = async () => {
  await initEngine();
  await engine.resume();

  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    setGuiOpen(false);

    const stream = canvas.captureStream(60);
    const dest = engine.ctx.createMediaStreamDestination();
    engine.master.connect(dest);
    stream.addTrack(dest.stream.getAudioTracks()[0]);

    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Sonic_Inclusion.webm';
      a.click();
      chunks = [];
    };

    mediaRecorder.start();
    recBtn.textContent = '⏹ STOP';
    setStatus('Recording…');
  } else {
    mediaRecorder.stop();
    recBtn.textContent = '⏺ RECORD';
    setStatus('Recording saved');
  }
};

/* ================= VISUALS ================= */

class Particle {
  constructor(x, y, h) {
    this.x = x; this.y = y;
    this.vx = (Math.random() - .5) * 8;
    this.vy = (Math.random() - .5) * 8;
    this.life = 1; this.h = h;
  }
  update() { this.x += this.vx; this.y += this.vy; this.life -= .03; }
  draw() {
    c.fillStyle = `hsla(${this.h},100%,60%,${this.life})`;
    c.beginPath(); c.arc(this.x, this.y, 2, 0, Math.PI * 2); c.fill();
  }
}

/* ================= LOOP ================= */

function loop() {
  if (!analyser) return requestAnimationFrame(loop);

  analyser.getByteFrequencyData(dataFreq);
  analyser.getByteTimeDomainData(dataTime);

  const w = canvas.width, h = canvas.height;
  const low = (dataFreq[2] + dataFreq[4]) / 2;

  const p = parseInt(gui.querySelector('#partAmount').value);
  const z = parseInt(gui.querySelector('#zoomInt').value) / 1000;
  const hue = (parseInt(gui.querySelector('#hueShift').value) + low * .4) % 360;

  c.fillStyle = 'rgba(5,5,5,.3)';
  c.fillRect(0, 0, w, h);

  c.save();
  c.translate(w/2, h/2);
  c.scale(1 + low * z, 1 + low * z);
  c.translate(-w/2, -h/2);

  if (!reducedMotion) rotation += .002;

  c.strokeStyle = `hsla(${hue},100%,50%,.25)`;
  for (let i = 0; i < 40; i++) {
    c.beginPath();
    c.arc(w/2, h/2, 80 + dataFreq[i], 0, Math.PI * 2);
    c.stroke();
  }

  if (!reducedMotion && low > 200)
    for (let i = 0; i < p; i++)
      particles.push(new Particle(w/2, h/2, hue));

  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => { p.update(); p.draw(); });

  c.restore();
  requestAnimationFrame(loop);
}

/* ================= RESIZE ================= */

const resize = () => {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
};
window.addEventListener('resize', resize);
resize();
