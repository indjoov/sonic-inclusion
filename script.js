import { AudioEngine } from './audio/AudioEngine.js';

const canvas = document.getElementById('viz');
const c = canvas.getContext('2d');

const srText = document.getElementById('srText');
const sens = document.getElementById('sens');

const micBtn = document.getElementById('micBtn');
const fileBtn = document.getElementById('fileBtn');
const demoBtn = document.getElementById('demoBtn');
const fileInput = document.getElementById('fileInput');

// -----------------------------
// Helpers
// -----------------------------
const $ = (sel) => document.querySelector(sel);

function setStatus(text) {
  if (srText) srText.textContent = text;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// -----------------------------
// UI: Intro Overlay
// -----------------------------
const overlay = document.createElement('div');
overlay.id = 'intro-overlay';
overlay.innerHTML = `
  <div style="
      text-align:center;
      color:white;
      font-family:sans-serif;
      background:rgba(5,5,5,0.98);
      padding:60px;
      border-radius:30px;
      border:1px solid #00d4ff;
      cursor:pointer;
      box-shadow: 0 0 80px rgba(0,212,255,0.5);
      backdrop-filter: blur(15px);
    ">
    <h1 style="margin-bottom:10px; letter-spacing: 15px; font-weight:900; text-shadow: 0 0 20px #00d4ff;">
      SONIC INCLUSION
    </h1>
    <p style="opacity:0.6; letter-spacing:5px; font-size: 12px;">
      DIRECTOR'S CUT INITIALIZIEREN
    </p>
  </div>
`;
overlay.setAttribute(
  'style',
  'position:fixed; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; z-index:2000; background:black;'
);
document.body.appendChild(overlay);

// -----------------------------
// UI: Engine Controls (minimizable, non-blocking)
// -----------------------------
const guiWrap = document.createElement('div');
guiWrap.id = 'engineGuiWrap';
guiWrap.style.cssText = `
  position:fixed;
  top:16px;
  right:16px;
  z-index:1200;
  font-family:sans-serif;
  color:#fff;
`;

const guiToggle = document.createElement('button');
guiToggle.id = 'engineGuiToggle';
guiToggle.textContent = 'ENGINE';
guiToggle.style.cssText = `
  background:rgba(10,10,10,0.9);
  color:#00d4ff;
  border:1px solid #00d4ff;
  padding:8px 12px;
  cursor:pointer;
  font-weight:800;
  letter-spacing:1px;
  border-radius:12px;
  backdrop-filter: blur(10px);
  box-shadow: 0 0 30px rgba(0,212,255,0.25);
`;

const gui = document.createElement('div');
gui.id = 'engineGui';
gui.style.cssText = `
  margin-top:10px;
  width:260px;
  background:rgba(10,10,10,0.88);
  padding:14px;
  border-radius:16px;
  border:1px solid rgba(0,212,255,0.6);
  backdrop-filter: blur(12px);
  box-shadow: 0 0 40px rgba(0,212,255,0.22);
`;

gui.innerHTML = `
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
    <div style="font-weight:900; color:#00d4ff; font-size:11px; letter-spacing:2px;">
      ENGINE CONTROLS
    </div>
    <div style="opacity:0.55; font-size:10px;">v0.1</div>
  </div>

  <div style="display:flex; gap:8px; margin-bottom:12px;">
    <button id="presetMinimal" style="flex:1; background:#000; color:#fff; border:1px solid #333; padding:8px; border-radius:10px; cursor:pointer; font-weight:800; font-size:10px;">MINIMAL</button>
    <button id="presetCine" style="flex:1; background:#000; color:#fff; border:1px solid #333; padding:8px; border-radius:10px; cursor:pointer; font-weight:800; font-size:10px;">CINEMATIC</button>
    <button id="presetRitual" style="flex:1; background:#000; color:#fff; border:1px solid #333; padding:8px; border-radius:10px; cursor:pointer; font-weight:800; font-size:10px;">RITUAL</button>
  </div>

  <label style="font-size:10px; opacity:0.8;">PARTIKEL</label>
  <input type="range" id="partAmount" min="0" max="30" value="10" style="width:100%; margin-bottom:10px;">

  <label style="font-size:10px; opacity:0.8;">BASS ZOOM</label>
  <input type="range" id="zoomInt" min="0" max="100" value="0" style="width:100%; margin-bottom:10px;">

  <label style="font-size:10px; opacity:0.8;">FARBE</label>
  <input type="range" id="hueShift" min="0" max="360" value="280" style="width:100%;">
`;

guiWrap.appendChild(guiToggle);
guiWrap.appendChild(gui);
document.body.appendChild(guiWrap);

// start collapsed by default (so it won't block buttons)
let guiOpen = false;
gui.style.display = 'none';

guiToggle.addEventListener('click', () => {
  guiOpen = !guiOpen;
  gui.style.display = guiOpen ? 'block' : 'none';
});

// -----------------------------
// Record Button (next to demoBtn)
// -----------------------------
const recBtn = document.createElement('button');
recBtn.textContent = "⏺ RECORD CINEMATIC";
recBtn.style.cssText = `
  margin-left:10px;
  background:#000;
  color:#ff0044;
  border:1px solid #ff0044;
  padding:10px 18px;
  cursor:pointer;
  font-weight:900;
  border-radius:12px;
`;
if (demoBtn?.parentNode) demoBtn.parentNode.insertBefore(recBtn, demoBtn.nextSibling);

// -----------------------------
// Engine + State
// -----------------------------
const engine = new AudioEngine();

let visualizer = null;
let raf = null;

let mediaRecorder = null;
let recordedChunks = [];

let particles = [];
let gridOffset = 0;
let rotation = 0;

// Keep track of currently playing demo source so we can STOP it cleanly
let demoSource = null;

// For recording audio route
let recordDest = null;
let recordAudioConnected = false;

// -----------------------------
// Presets
// -----------------------------
function applyPreset(name) {
  const part = $('#partAmount');
  const zoom = $('#zoomInt');
  const hue = $('#hueShift');

  if (!part || !zoom || !hue) return;

  if (name === 'minimal') {
    part.value = 6;
    zoom.value = 0;
    hue.value = 200;
    setStatus('Preset: Minimal');
  } else if (name === 'cinematic') {
    part.value = 14;
    zoom.value = 12;
    hue.value = 280;
    setStatus('Preset: Cinematic');
  } else if (name === 'ritual') {
    part.value = 10;
    zoom.value = 6;
    hue.value = 20;
    setStatus('Preset: Ritual');
  }
}

$('#presetMinimal')?.addEventListener('click', () => applyPreset('minimal'));
$('#presetCine')?.addEventListener('click', () => applyPreset('cinematic'));
$('#presetRitual')?.addEventListener('click', () => applyPreset('ritual'));

// default preset (feel free to change)
applyPreset('cinematic');

// -----------------------------
// Particle class
// -----------------------------
class Particle {
  constructor(x, y, hue) {
    this.x = x; this.y = y;
    this.size = Math.random() * 3 + 1;
    this.speedX = (Math.random() - 0.5) * 20;
    this.speedY = (Math.random() - 0.5) * 20;
    this.color = `hsla(${hue}, 100%, 75%, 0.9)`;
    this.life = 1.0;
  }
  update() { this.x += this.speedX; this.y += this.speedY; this.life -= 0.025; }
  draw() {
    c.fillStyle = this.color;
    c.globalAlpha = this.life;
    c.beginPath();
    c.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1.0;
  }
}

// -----------------------------
// Engine lifecycle (START/STOP)  ✅ Punkt 1
// -----------------------------
async function startEngine() {
  if (engine.state !== 'idle') return;

  setStatus('⏳ Initializing engine...');
  await engine.init({ startSuspended: true, debug: false });

  visualizer = engine.getVisualizerData();

  // hide overlay
  overlay.style.opacity = '0';
  await sleep(250);
  overlay.style.display = 'none';

  setStatus('✅ Engine ready. Click DEMO / MIC / FILE.');

  // start render loop once
  if (!raf) loop();
}

function stopDemoSource() {
  try {
    if (demoSource) {
      demoSource.stop(0);
      demoSource.disconnect();
      demoSource = null;
    }
  } catch (_) {
    demoSource = null;
  }
}

function stopRecordingRouteIfNeeded() {
  try {
    if (recordDest && recordAudioConnected) {
      // we connected engine.master -> recordDest
      engine.master.disconnect(recordDest);
      recordAudioConnected = false;
    }
  } catch (_) {}
}

async function stopEngine() {
  // stop demo audio if playing
  stopDemoSource();

  // stop transport
  try { engine.stop(); } catch (_) {}

  // stop record route (avoid multiple connects)
  stopRecordingRouteIfNeeded();

  setStatus('⛔ Stopped.');
}

overlay.addEventListener('click', startEngine);

// -----------------------------
// Demo file play (clean, no stacking) ✅ Punkt 1
// -----------------------------
async function playDemoFile(filepath) {
  try {
    if (engine.state === 'idle') {
      await startEngine();
    }

    setStatus("⏳ BUFFERING...");
    const response = await fetch(filepath);
    const arrayBuf = await response.arrayBuffer();
    const audioBuf = await engine.ctx.decodeAudioData(arrayBuf);

    // stop anything currently playing first
    stopDemoSource();
    try { engine.stop(); } catch (_) {}

    // create a new source we can stop later
    demoSource = engine.ctx.createBufferSource();
    demoSource.buffer = audioBuf;
    demoSource.loop = true;
    demoSource.connect(engine.buses.music);

    // Start source BEFORE resume is okay; but resume must happen from user gesture (demoBtn click)
    demoSource.start(0);
    await engine.resume();

    setStatus('🎬 Demo playing (loop).');
  } catch (err) {
    console.error(err);
    setStatus("❌ ERROR loading demo.");
  }
}

demoBtn?.addEventListener('click', () => playDemoFile('media/kasubo hoerprobe.mp3'));

// OPTIONAL: if you want a STOP button behavior on demoBtn with shift-click:
// demoBtn?.addEventListener('contextmenu', (e) => { e.preventDefault(); stopEngine(); });

// -----------------------------
// Recording (canvas + engine master) ✅ safer routing
// -----------------------------
recBtn.addEventListener('click', () => {
  if (!engine.ctx || !engine.master) {
    setStatus('⚠️ Start engine first (click overlay).');
    return;
  }

  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    recordedChunks = [];

    const stream = canvas.captureStream(60);

    // create destination once
    recordDest = engine.ctx.createMediaStreamDestination();

    // Connect master -> recordDest only once for recording
    try {
      engine.master.connect(recordDest);
      recordAudioConnected = true;
    } catch (_) {}

    const audioTrack = recordDest.stream.getAudioTracks()[0];
    if (audioTrack) stream.addTrack(audioTrack);

    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm; codecs=vp9',
      videoBitsPerSecond: 18000000
    });

    mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);

    mediaRecorder.onstop = () => {
      // disconnect route to avoid stacking connections
      stopRecordingRouteIfNeeded();

      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Sonic_Inclusion_Cinematic.webm`;
      a.click();

      setStatus('✅ Recording saved.');
    };

    mediaRecorder.start();
    recBtn.textContent = '⏹ STOP VIDEO';
    recBtn.style.background = '#ff0044';
    recBtn.style.color = '#fff';
    setStatus('⏺ Recording...');
  } else {
    mediaRecorder.stop();
    recBtn.textContent = '⏺ RECORD CINEMATIC';
    recBtn.style.background = '#000';
    recBtn.style.color = '#ff0044';
  }
});

// -----------------------------
// Render functions ✅ Punkt 2/3 stays compatible
// -----------------------------
function drawGrid(w, h, low, hue) {
  c.save();
  c.translate(w / 2, h / 2);
  c.rotate(rotation * 0.2);

  c.strokeStyle = `hsla(${hue}, 100%, 50%, ${0.03 + low / 1500})`;

  const step = 80;
  gridOffset = (gridOffset + 0.2 + low / 60) % step;

  for (let x = -w; x < w; x += step) {
    c.beginPath();
    c.moveTo(x + gridOffset, -h);
    c.lineTo(x + gridOffset, h);
    c.stroke();
  }

  for (let y = -h; y < h; y += step) {
    c.beginPath();
    c.moveTo(-w, y + gridOffset);
    c.lineTo(w, y + gridOffset);
    c.stroke();
  }

  c.restore();
}

function drawSideSpectrogram(w, h, data, hue) {
  const barWidth = 4;
  const gap = 2;
  for (let i = 0; i < 60; i++) {
    const val = data[i * 2] / 2;
    c.fillStyle = `hsla(${hue + i}, 80%, 60%, 0.3)`;
    c.fillRect(0, h - (i * (barWidth + gap)) - 100, val, barWidth);
    c.fillRect(w, h - (i * (barWidth + gap)) - 100, -val, barWidth);
  }
}

function loop() {
  raf = requestAnimationFrame(loop);

  if (!visualizer) return;

  visualizer.analyser.getByteFrequencyData(visualizer.dataFreq);
  visualizer.analyser.getByteTimeDomainData(visualizer.dataTime);

  const w = canvas.width;
  const h = canvas.height;

  const pAmount = parseInt($('#partAmount')?.value ?? '10', 10);
  const zoomSens = parseInt($('#zoomInt')?.value ?? '0', 10) / 1000;
  const hShift = parseInt($('#hueShift')?.value ?? '280', 10);

  const s = parseFloat(sens?.value ?? '1');

  const low = (visualizer.dataFreq[2] + visualizer.dataFreq[4]) / 2;
  const currentHue = (hShift + low * 0.4) % 360;

  rotation += 0.002 + (low / 10000);

  // Background
  c.fillStyle = 'rgba(5, 5, 5, 0.25)';
  c.fillRect(0, 0, w, h);

  // Zoom layer
  c.save();
  c.translate(w / 2, h / 2);
  const zoom = 1 + (low * zoomSens);
  c.scale(zoom, zoom);
  c.translate(-w / 2, -h / 2);

  drawGrid(w, h, low, currentHue);
  drawSideSpectrogram(w, h, visualizer.dataFreq, currentHue);

  // Waveform
  c.lineWidth = 2;
  c.strokeStyle = `hsla(${currentHue}, 100%, 70%, 0.4)`;
  c.beginPath();

  let x = 0;
  const sw = w / visualizer.dataTime.length;

  for (let i = 0; i < visualizer.dataTime.length; i++) {
    const y = (visualizer.dataTime[i] / 128.0 * h) / 2;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
    x += sw;
  }
  c.stroke();

  // Bass impact particles
  if (low > 200) {
    for (let i = 0; i < pAmount; i++) particles.push(new Particle(w / 2, h / 2, currentHue));
    if (srText) srText.style.transform = `scale(${1 + low / 500}) rotate(${(Math.random() - 0.5) * 5}deg)`;
  }

  particles = particles.filter((p) => p.life > 0);
  particles.forEach((p) => { p.update(); p.draw(); });

  // Rings
  [100, 180, 260].forEach((r, i) => {
    const e = visualizer.dataFreq[i * 30 + 5];
    c.save();
    c.translate(w / 2, h / 2);
    c.rotate(rotation * (i + 1) * 0.5);
    c.beginPath();
    c.arc(0, 0, r + (e / 4) * s, 0, Math.PI * 2);
    c.fillStyle = `hsla(${currentHue + i * 30}, 90%, 60%, ${0.2 + (e / 500)})`;
    c.fill();
    if (e > 190) { c.strokeStyle = 'white'; c.stroke(); }
    c.restore();
  });

  // Logo "S"
  c.font = `900 ${70 + low / 5}px sans-serif`;
  c.fillStyle = 'white';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.shadowBlur = low / 2;
  c.shadowColor = `hsla(${currentHue}, 100%, 50%, 0.9)`;
  c.fillText('S', w / 2, h / 2);
  c.shadowBlur = 0;

  c.restore();
}

// -----------------------------
// Canvas Fit
// -----------------------------
function fitCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// -----------------------------
// OPTIONAL: quick stop shortcut (ESC)
// -----------------------------
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') stopEngine();
});
