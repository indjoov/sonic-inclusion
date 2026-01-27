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
let visualizer = null;
let raf = null;

/* ================= STATE ================= */

let particles = [];
let gridOffset = 0;
let rotation = 0;

// demo playback
let demoSrc = null;

// recording
let mediaRecorder = null;
let recordedChunks = [];
let audioDest = null;

/* ================= ENGINE GUI ================= */

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
      <button id="presetCalm">CALM</button>
      <button id="presetBass">BASS</button>
      <button id="presetCine">CINE</button>
    </div>

    <label style="font-size:11px;">
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

/* presets */
const partEl = gui.querySelector('#partAmount');
const zoomEl = gui.querySelector('#zoomInt');
const hueEl = gui.querySelector('#hueShift');

function preset(p, z, h) {
  partEl.value = p;
  zoomEl.value = z;
  hueEl.value = h;
}

gui.querySelector('#presetCalm').onclick = () => preset(4, 0, 210);
gui.querySelector('#presetBass').onclick = () => preset(18, 10, 340);
gui.querySelector('#presetCine').onclick = () => preset(10, 4, 280);

gui.querySelector('#reducedMotion').onchange = e => {
  reducedMotion = e.target.checked;
};

/* ================= INIT ================= */

async function initEngine() {
  if (engine.state !== 'idle') return;
  setStatus('Initializing engine…');
  await engine.init();
  visualizer = engine.getVisualizerData();
  overlay.style.display = 'none';
  loop();
  setStatus('Engine ready');
}

overlay.onclick = initEngine;

/* ================= DEMO ================= */

async function stopDemo() {
  if (demoSrc) {
    try { demoSrc.stop(); demoSrc.disconnect(); } catch {}
    demoSrc = null;
  }
  try { await engine.ctx.suspend(); } catch {}
  setStatus('Demo stopped');
}

async function playDemo(path) {
  await initEngine();
  await stopDemo();

  setStatus('Loading demo…');
  const buf = await fetch(path).then(r => r.arrayBuffer());
  const audio = await engine.ctx.decodeAudioData(buf);

  await engine.resume();
  demoSrc = engine.ctx.createBufferSource();
  demoSrc.buffer = audio;
  demoSrc.connect(engine.master);
  demoSrc.onended = stopDemo;
  demoSrc.start();
  setStatus('Demo playing');
}

demoBtn.onclick = () => playDemo('media/kasubo hoerprobe.mp3');

/* ================= RECORDING ================= */

const recBtn = document.createElement('button');
recBtn.textContent = '⏺ RECORD';
recBtn.style.cssText = `
  position:fixed; bottom:20px; left:20px;
  background:black; color:#ff0044;
  border:1px solid #ff0044;
  padding:10px 16px; border-radius:10px;
  cursor:pointer;
`;
document.body.appendChild(recBtn);

recBtn.onclick = async () => {
  await initEngine();

  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    recordedChunks = [];
    const stream = canvas.captureStream(60);
    audioDest = engine.ctx.createMediaStreamDestination();
    engine.master.connect(audioDest);
    stream.addTrack(audioDest.stream.getAudioTracks()[0]);

    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => recordedChunks.push(e.data);
    mediaRecorder.onstop = () => {
      engine.master.disconnect(audioDest);
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'sonic-inclusion.webm';
      a.click();
      setStatus('Recording saved');
    };
    mediaRecorder.start();
    recBtn.textContent = '⏹ STOP';
  } else {
    mediaRecorder.stop();
    recBtn.textContent = '⏺ RECORD';
  }
};

/* ================= VISUALS ================= */

class Particle {
  constructor(x, y, hue) {
    this.x = x; this.y = y;
    this.vx = (Math.random() - .5) * 10;
    this.vy = (Math.random() - .5) * 10;
    this.life = 1;
    this.hue = hue;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life -= .03;
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
  if (!visualizer) return;

  visualizer.analyser.getByteFrequencyData(visualizer.dataFreq);
  visualizer.analyser.getByteTimeDomainData(visualizer.dataTime);

  const w = canvas.width;
  const h = canvas.height;
  const low = (visualizer.dataFreq[2] + visualizer.dataFreq[4]) / 2;

  const pAmount = +partEl.value;
  const zoom = reducedMotion ? 1 : 1 + (low * (+zoomEl.value / 1000));
  const hue = (+hueEl.value + low * .4) % 360;

  c.fillStyle = 'rgba(5,5,5,.3)';
  c.fillRect(0, 0, w, h);

  c.save();
  c.translate(w / 2, h / 2);
  c.scale(zoom, zoom);
  c.translate(-w / 2, -h / 2);

  if (!reducedMotion) rotation += .002;
  c.strokeStyle = `hsla(${hue},100%,50%,.2)`;

  for (let i = 0; i < 60; i++) {
    const v = visualizer.dataFreq[i];
    c.beginPath();
    c.arc(w / 2, h / 2, 100 + v, 0, Math.PI * 2);
    c.stroke();
  }

  if (!reducedMotion && low > 200) {
    for (let i = 0; i < pAmount; i++) {
      particles.push(new Particle(w / 2, h / 2, hue));
    }
  }

  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => { p.update(); p.draw(); });

  c.restore();
  raf = requestAnimationFrame(loop);
}

/* ================= UTILS ================= */

function setStatus(msg) {
  if (srText) srText.textContent = msg;
}

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}
window.onresize = resize;
resize();
