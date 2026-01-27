import { AudioEngine } from './audio/AudioEngine.js';

// --- CANVAS & UI REFERENCES ---
const canvas = document.getElementById('viz');
const c = canvas.getContext('2d');
const srText = document.getElementById('srText');
const sens = document.getElementById('sens');
const micBtn = document.getElementById('micBtn');
const fileBtn = document.getElementById('fileBtn');
const demoBtn = document.getElementById('demoBtn');
const fileInput = document.getElementById('fileInput');

// --- INTRO OVERLAY ---
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
    box-shadow:0 0 80px rgba(0,212,255,0.5);
    backdrop-filter:blur(15px);
  ">
    <h1 style="
      margin-bottom:10px;
      letter-spacing:15px;
      font-weight:900;
      text-shadow:0 0 20px #00d4ff;
    ">SONIC INCLUSION</h1>
    <p style="opacity:0.6; letter-spacing:5px; font-size:12px;">
      DIRECTOR'S CUT INITIALIZIEREN
    </p>
  </div>
`;
overlay.style.cssText = `
  position:fixed;
  inset:0;
  display:flex;
  justify-content:center;
  align-items:center;
  z-index:2000;
  background:black;
`;
document.body.appendChild(overlay);

// --- ENGINE CONTROLS (MINIMIZABLE) ---
const gui = document.createElement('div');
gui.style.cssText = `
  position:fixed;
  top:20px;
  right:20px;
  background:rgba(10,10,10,0.9);
  padding:12px;
  border-radius:15px;
  color:#fff;
  font-family:sans-serif;
  border:1px solid #00d4ff;
  z-index:100;
  width:220px;
  backdrop-filter:blur(10px);
`;

gui.innerHTML = `
  <div style="display:flex; justify-content:space-between; align-items:center;">
    <div style="font-weight:bold; color:#00d4ff; font-size:12px;">ENGINE CONTROLS</div>
    <button id="toggleGui" style="
      background:transparent;
      border:1px solid #00d4ff;
      color:#00d4ff;
      border-radius:8px;
      padding:2px 8px;
      cursor:pointer;
    ">–</button>
  </div>

  <div id="guiBody" style="margin-top:12px;">
    <label style="font-size:10px;">PARTIKEL</label>
    <input type="range" id="partAmount" min="0" max="30" value="10" style="width:100%; margin-bottom:10px;">

    <label style="font-size:10px;">BASS ZOOM</label>
    <input type="range" id="zoomInt" min="0" max="100" value="0" style="width:100%; margin-bottom:10px;">

    <label style="font-size:10px;">FARBE</label>
    <input type="range" id="hueShift" min="0" max="360" value="280" style="width:100%;">
  </div>
`;
document.body.appendChild(gui);

// minimize toggle
const toggleBtn = gui.querySelector('#toggleGui');
const guiBody = gui.querySelector('#guiBody');
let guiMinimized = false;

toggleBtn.addEventListener('click', () => {
  guiMinimized = !guiMinimized;
  guiBody.style.display = guiMinimized ? 'none' : 'block';
  toggleBtn.textContent = guiMinimized ? '+' : '–';
  gui.style.width = guiMinimized ? '150px' : '220px';
});

// --- RECORD BUTTON ---
const recBtn = document.createElement('button');
recBtn.textContent = "⏺ RECORD CINEMATIC";
recBtn.style.cssText = `
  margin-left:10px;
  background:#000;
  color:#ff0044;
  border:1px solid #ff0044;
  padding:10px 20px;
  cursor:pointer;
  font-weight:bold;
  border-radius:5px;
`;
demoBtn.parentNode.insertBefore(recBtn, demoBtn.nextSibling);

// --- AUDIO ENGINE ---
const engine = new AudioEngine();
let visualizer = null;
let raf, mediaRecorder, recordedChunks = [];
let particles = [];
let gridOffset = 0;
let rotation = 0;

// --- PARTICLES ---
class Particle {
  constructor(x, y, hue) {
    this.x = x;
    this.y = y;
    this.size = Math.random() * 3 + 1;
    this.vx = (Math.random() - 0.5) * 20;
    this.vy = (Math.random() - 0.5) * 20;
    this.life = 1;
    this.color = `hsla(${hue},100%,75%,0.9)`;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life -= 0.025;
  }
  draw() {
    c.globalAlpha = this.life;
    c.fillStyle = this.color;
    c.beginPath();
    c.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
  }
}

// --- INIT ---
overlay.addEventListener('click', async () => {
  if (engine.state === 'idle') {
    await engine.init();
    visualizer = engine.getVisualizerData();
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 500);
    loop();
  }
});

// --- DEMO AUDIO ---
async function playDemoFile(path) {
  const res = await fetch(path);
  const buf = await res.arrayBuffer();
  const audio = await engine.ctx.decodeAudioData(buf);

  engine.stop();
  const src = engine.ctx.createBufferSource();
  src.buffer = audio;
  src.loop = true;
  src.connect(engine.buses.music);
  src.start();
  await engine.resume();
}

demoBtn.addEventListener('click', () => playDemoFile('media/kasubo hoerprobe.mp3'));

// --- RENDER LOOP ---
function loop() {
  if (!visualizer) return;

  visualizer.analyser.getByteFrequencyData(visualizer.dataFreq);
  visualizer.analyser.getByteTimeDomainData(visualizer.dataTime);

  const w = canvas.width;
  const h = canvas.height;
  const low = (visualizer.dataFreq[2] + visualizer.dataFreq[4]) / 2;

  const pAmount = +document.getElementById('partAmount').value;
  const zoomSens = +document.getElementById('zoomInt').value / 1000;
  const hueBase = +document.getElementById('hueShift').value;
  const hue = (hueBase + low * 0.4) % 360;

  rotation += 0.002 + low / 10000;

  c.fillStyle = 'rgba(5,5,5,0.25)';
  c.fillRect(0, 0, w, h);

  c.save();
  c.translate(w / 2, h / 2);
  const zoom = 1 + low * zoomSens;
  c.scale(zoom, zoom);
  c.translate(-w / 2, -h / 2);

  // Rings
  [120, 200, 280].forEach((r, i) => {
    const e = visualizer.dataFreq[i * 30 + 5];
    c.save();
    c.translate(w / 2, h / 2);
    c.rotate(rotation * (i + 1));
    c.beginPath();
    c.arc(0, 0, r + e / 4, 0, Math.PI * 2);
    c.fillStyle = `hsla(${hue + i * 30},90%,60%,${0.2 + e / 500})`;
    c.fill();
    c.restore();
  });

  // Particles
  if (low > 200) {
    for (let i = 0; i < pAmount; i++) {
      particles.push(new Particle(w / 2, h / 2, hue));
    }
  }

  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.update();
    p.draw();
  });

  // Center logo
  c.font = `900 ${70 + low / 5}px sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = 'white';
  c.shadowBlur = low / 2;
  c.shadowColor = `hsla(${hue},100%,50%,0.9)`;
  c.fillText('S', w / 2, h / 2);
  c.shadowBlur = 0;

  c.restore();
  raf = requestAnimationFrame(loop);
}

// --- RESIZE ---
function fitCanvas() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}
addEventListener('resize', fitCanvas);
fitCanvas();
