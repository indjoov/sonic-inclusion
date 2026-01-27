import { AudioEngine } from './audio/AudioEngine.js';

const canvas = document.getElementById('viz');
const c = canvas.getContext('2d');

const srText = document.getElementById('srText');
const sens = document.getElementById('sens');

const micBtn = document.getElementById('micBtn');
const fileBtn = document.getElementById('fileBtn');
const demoBtn = document.getElementById('demoBtn');
const fileInput = document.getElementById('fileInput');

// A11y status (optional but good)
if (srText) {
  srText.setAttribute('aria-live', 'polite');
  srText.setAttribute('role', 'status');
}

// --- UI SETUP ---
const overlay = document.createElement('div');
overlay.id = 'intro-overlay';
overlay.innerHTML = `
  <div style="text-align:center; color:white; font-family:sans-serif; background:rgba(5,5,5,0.98); padding:60px; border-radius:30px; border:1px solid #00d4ff; cursor:pointer; box-shadow: 0 0 80px rgba(0,212,255,0.5); backdrop-filter: blur(15px);">
    <h1 style="margin-bottom:10px; letter-spacing: 15px; font-weight:900; text-shadow: 0 0 20px #00d4ff;">SONIC INCLUSION</h1>
    <p style="opacity:0.6; letter-spacing:5px; font-size: 12px;">DIRECTOR'S CUT INITIALIZIEREN</p>
  </div>
`;
overlay.setAttribute(
  'style',
  'position:fixed; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; z-index:2000; background:black;'
);
document.body.appendChild(overlay);

const gui = document.createElement('div');
gui.setAttribute(
  'style',
  `position:fixed; top:20px; right:20px; background:rgba(10,10,10,0.9); padding:20px; border-radius:15px; color:#fff; font-family:sans-serif; border:1px solid #00d4ff; z-index:100; min-width:220px; backdrop-filter: blur(10px);`
);
gui.innerHTML = `
  <div style="margin-bottom:15px; font-weight:bold; color:#00d4ff; border-bottom:1px solid #333; padding-bottom:8px; font-size:12px; letter-spacing:1px;">ENGINE CONTROLS</div>
  <label style="font-size:10px;">PARTIKEL</label><input type="range" id="partAmount" min="0" max="30" value="10" style="width:100%; margin-bottom:10px;">
  <label style="font-size:10px;">BASS ZOOM</label><input type="range" id="zoomInt" min="0" max="100" value="50" style="width:100%; margin-bottom:10px;">
  <label style="font-size:10px;">FARBE</label><input type="range" id="hueShift" min="0" max="360" value="280" style="width:100%;">
`;
document.body.appendChild(gui);

// Record button
const recBtn = document.createElement('button');
recBtn.textContent = '⏺ RECORD CINEMATIC';
recBtn.style.cssText =
  'margin-left:10px; background:#000; color:#ff0044; border:1px solid #ff0044; padding:10px 20px; cursor:pointer; font-weight:bold; border-radius:5px;';
demoBtn?.parentNode?.insertBefore(recBtn, demoBtn.nextSibling);

// Stop demo button
const stopDemoBtn = document.createElement('button');
stopDemoBtn.textContent = '⏹ STOP DEMO';
stopDemoBtn.style.cssText =
  'margin-left:10px; background:#000; color:#00d4ff; border:1px solid #00d4ff; padding:10px 20px; cursor:pointer; font-weight:bold; border-radius:5px;';
demoBtn?.parentNode?.insertBefore(stopDemoBtn, recBtn.nextSibling);

// --- ENGINE ---
const engine = new AudioEngine();

let visualizer = null;
let raf = null;

// Recording
let mediaRecorder = null;
let recordedChunks = [];
let audioDest = null;
let addedAudioTrack = null;

// Demo playback
let demoSrc = null;

// Visuals
let particles = [];
let gridOffset = 0;
let rotation = 0;

class Particle {
  constructor(x, y, hue) {
    this.x = x;
    this.y = y;
    this.size = Math.random() * 3 + 1;
    this.speedX = (Math.random() - 0.5) * 20;
    this.speedY = (Math.random() - 0.5) * 20;
    this.color = `hsla(${hue}, 100%, 75%, 0.9)`;
    this.life = 1.0;
  }
  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    this.life -= 0.025;
  }
  draw() {
    c.fillStyle = this.color;
    c.globalAlpha = this.life;
    c.beginPath();
    c.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1.0;
  }
}

function setStatus(msg) {
  if (srText) srText.textContent = msg;
}

async function ensureEngineReady() {
  if (engine.state === 'idle') {
    setStatus('⏳ Initializing engine…');
    await engine.init(); // keep engine defaults
    // NOTE: your AudioEngine must expose this method
    visualizer = engine.getVisualizerData?.() || null;

    overlay.style.opacity = '0';
    setTimeout(() => (overlay.style.display = 'none'), 500);

    if (!raf) loop();
    setStatus('✅ Engine ready');
  }
}

overlay.addEventListener('click', async () => {
  await ensureEngineReady();
});

// --- RECORDING (clean connect/disconnect) ---
function pickBestMime() {
  const candidates = [
    'video/webm; codecs=vp9',
    'video/webm; codecs=vp8',
    'video/webm',
  ];
  for (const t of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

recBtn.addEventListener('click', async () => {
  await ensureEngineReady();

  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    recordedChunks = [];

    const stream = canvas.captureStream(60);

    // Per-session destination to prevent stacking
    audioDest = engine.ctx.createMediaStreamDestination();

    // Connect master -> destination
    try {
      engine.master.connect(audioDest);
    } catch {}

    // Add audio track to stream
    const audioTracks = audioDest.stream.getAudioTracks();
    if (audioTracks && audioTracks[0]) {
      addedAudioTrack = audioTracks[0];
      stream.addTrack(addedAudioTrack);
    }

    const mimeType = pickBestMime();
    const options = {};
    if (mimeType) options.mimeType = mimeType;
    options.videoBitsPerSecond = 18000000;

    mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      // Disconnect master from destination
      try {
        if (audioDest) engine.master.disconnect(audioDest);
      } catch {}

      // Cleanup audio track
      try {
        if (addedAudioTrack) addedAudioTrack.stop();
      } catch {}

      audioDest = null;
      addedAudioTrack = null;

      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Sonic_Inclusion_Cinematic.webm';
      a.click();

      setStatus('✅ Recording saved');
    };

    mediaRecorder.start();
    recBtn.textContent = '⏹ STOP VIDEO';
    recBtn.style.background = '#ff0044';
    recBtn.style.color = '#fff';
    setStatus('⏺ Recording…');
  } else {
    mediaRecorder.stop();
    recBtn.textContent = '⏺ RECORD CINEMATIC';
    recBtn.style.background = '#000';
    recBtn.style.color = '#ff0044';
    setStatus('⏹ Stopping recording…');
  }
});

// --- DEMO: play ONCE + clean lifecycle + suspend after stop/end ---
async function stopDemoSource() {
  if (!demoSrc) {
    // still suspend if you want a clean state
    try { await engine.ctx.suspend(); } catch {}
    return;
  }

  try { demoSrc.onended = null; } catch {}
  try { demoSrc.stop(0); } catch {}
  try { demoSrc.disconnect(); } catch {}
  demoSrc = null;

  try { await engine.ctx.suspend(); } catch {}
  setStatus('⏹ Demo stopped');
}

async function playDemoFile(filepath) {
  try {
    await ensureEngineReady();
    setStatus('⏳ Buffering demo…');

    const response = await fetch(filepath);
    const arrayBuf = await response.arrayBuffer();
    const audioBuf = await engine.ctx.decodeAudioData(arrayBuf);

    // Stop any previous demo
    await stopDemoSource();

    // Resume BEFORE start
    await engine.resume();

    demoSrc = engine.ctx.createBufferSource();
    demoSrc.buffer = audioBuf;
    demoSrc.loop = false; // ✅ play once

    // Route into music bus
    const target = engine.buses?.music || engine.master;
    demoSrc.connect(target);

    demoSrc.onended = async () => {
      // cleanup + suspend
      await stopDemoSource();
      setStatus('✅ Demo finished (played once)');
    };

    demoSrc.start(0);
    setStatus('🎧 Demo playing (once)');
  } catch (err) {
    console.error(err);
    setStatus('❌ Demo error');
  }
}

demoBtn?.addEventListener('click', () => playDemoFile('media/kasubo hoerprobe.mp3'));
stopDemoBtn.addEventListener('click', () => stopDemoSource());

// --- RENDER FUNCTIONS ---
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
    c.fillRect(0, h - i * (barWidth + gap) - 100, val, barWidth);
    c.fillRect(w, h - i * (barWidth + gap) - 100, -val, barWidth);
  }
}

function loop() {
  if (!visualizer || !visualizer.analyser) {
    raf = requestAnimationFrame(loop);
    return;
  }

  visualizer.analyser.getByteFrequencyData(visualizer.dataFreq);
  visualizer.analyser.getByteTimeDomainData(visualizer.dataTime);

  const w = canvas.width;
  const h = canvas.height;
  const s = parseFloat(sens?.value || '1');

  const pAmount = parseInt(document.getElementById('partAmount')?.value || '10', 10);
  const zoomSens = parseInt(document.getElementById('zoomInt')?.value || '50', 10) / 1000;
  const hShift = parseInt(document.getElementById('hueShift')?.value || '280', 10);

  const low = (visualizer.dataFreq[2] + visualizer.dataFreq[4]) / 2;
  const currentHue = (hShift + low * 0.4) % 360;
  rotation += 0.002 + low / 10000;

  // Background
  c.fillStyle = 'rgba(5, 5, 5, 0.25)';
  c.fillRect(0, 0, w, h);

  // Zoom
  c.save();
  c.translate(w / 2, h / 2);
  const zoom = 1 + low * zoomSens;
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

  // Bass impact
  if (low > 200) {
    for (let i = 0; i < pAmount; i++) {
      particles.push(new Particle(w / 2, h / 2, currentHue));
    }
    if (srText) {
      srText.style.transform = `scale(${1 + low / 500}) rotate(${(Math.random() - 0.5) * 5}deg)`;
    }
  }

  particles = particles.filter((p) => p.life > 0);
  particles.forEach((p) => {
    p.update();
    p.draw();
  });

  // Rings
  [100, 180, 260].forEach((r, i) => {
    const e = visualizer.dataFreq[i * 30 + 5];
    c.save();
    c.translate(w / 2, h / 2);
    c.rotate(rotation * (i + 1) * 0.5);
    c.beginPath();
    c.arc(0, 0, r + (e / 4) * s, 0, Math.PI * 2);
    c.fillStyle = `hsla(${currentHue + i * 30}, 90%, 60%, ${0.2 + e / 500})`;
    c.fill();
    if (e > 190) {
      c.strokeStyle = 'white';
      c.stroke();
    }
    c.restore();
  });

  // Logo
  c.font = `900 ${70 + low / 5}px sans-serif`;
  c.fillStyle = 'white';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.shadowBlur = low / 2;
  c.shadowColor = `hsla(${currentHue}, 100%, 50%, 0.9)`;
  c.fillText('S', w / 2, h / 2);
  c.shadowBlur = 0;

  c.restore();
  raf = requestAnimationFrame(loop);
}

function fitCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();
