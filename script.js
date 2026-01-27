import { AudioEngine } from './audio/AudioEngine.js';

const canvas = document.getElementById('viz');
const c = canvas.getContext('2d');
const srText = document.getElementById('srText');
const sens = document.getElementById('sens');
const micBtn = document.getElementById('micBtn');
const fileBtn = document.getElementById('fileBtn');
const demoBtn = document.getElementById('demoBtn');
const fileInput = document.getElementById('fileInput');

// --- FUTURISTISCHES UI SETUP ---

// 1. Intro-Overlay
const overlay = document.createElement('div');
overlay.id = 'intro-overlay';
overlay.innerHTML = `
    <div style="text-align:center; color:white; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background:rgba(10,10,10,0.95); padding:60px; border-radius:30px; border:1px solid #00d4ff; cursor:pointer; box-shadow: 0 0 60px rgba(0,212,255,0.4); backdrop-filter: blur(10px);">
        <h1 style="margin-bottom:10px; letter-spacing: 12px; font-weight:900; text-shadow: 0 0 15px #00d4ff;">SONIC INCLUSION</h1>
        <p style="opacity:0.6; letter-spacing:3px; font-size: 14px;">SYSTEM INITIALISIEREN</p>
    </div>
`;
overlay.setAttribute('style', 'position:fixed; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; z-index:2000; background:black;');
document.body.appendChild(overlay);

// 2. Neon-Control Panel
const gui = document.createElement('div');
gui.setAttribute('style', `
    position:fixed; top:20px; right:20px; 
    background:rgba(15, 15, 15, 0.85); 
    padding:20px; border-radius:15px; 
    color:#e0e0e0; font-family:sans-serif; 
    border:1px solid rgba(0, 212, 255, 0.3); 
    z-index:100; min-width:220px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    backdrop-filter: blur(8px);
`);
gui.innerHTML = `
    <div style="margin-bottom:15px; font-weight:bold; color:#00d4ff; border-bottom:1px solid #333; padding-bottom:8px; letter-spacing:1px; text-transform:uppercase; font-size:12px;">Visual FX Master</div>
    <div style="margin-bottom:15px;">
        <label style="font-size:11px; display:block; margin-bottom:5px;">PARTIKEL INTENSITÄT</label>
        <input type="range" id="partAmount" min="0" max="25" value="8" style="width:100%; accent-color:#00d4ff;">
    </div>
    <div style="margin-bottom:15px;">
        <label style="font-size:11px; display:block; margin-bottom:5px;">BASS-FLASH STÄRKE</label>
        <input type="range" id="flashInt" min="100" max="1500" value="800" style="width:100%; accent-color:#00d4ff;">
    </div>
    <div style="margin-bottom:15px;">
        <label style="font-size:11px; display:block; margin-bottom:5px;">FARB-ATMOSPHÄRE</label>
        <input type="range" id="hueShift" min="0" max="360" value="280" style="width:100%; accent-color:#00d4ff;">
    </div>
`;
document.body.appendChild(gui);

// 3. Record Button Styling
const recBtn = document.createElement('button');
recBtn.textContent = "⏺ START RECORDING";
recBtn.style.cssText = `
    margin-left: 10px; background: #000; color: #ff0044; 
    border: 1px solid #ff0044; padding: 10px 20px; 
    cursor: pointer; border-radius: 5px; font-weight: bold;
    transition: all 0.3s ease; letter-spacing: 1px;
`;
demoBtn.parentNode.insertBefore(recBtn, demoBtn.nextSibling);

const engine = new AudioEngine();
let visualizer = null;
let raf;
let mediaRecorder;
let recordedChunks = [];
let particles = [];
let gridOffset = 0;

// --- CORE CLASSES ---
class Particle {
    constructor(x, y, hue) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 2.5 + 1;
        this.speedX = (Math.random() - 0.5) * 18;
        this.speedY = (Math.random() - 0.5) * 18;
        this.color = `hsla(${hue}, 100%, 75%, 0.9)`;
        this.life = 1.0;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= 0.03;
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

// --- ENGINE START ---
overlay.addEventListener('click', async () => {
    if (engine.state === 'idle') {
        await engine.init();
        visualizer = engine.getVisualizerData();
        overlay.style.opacity = '0';
        setTimeout(() => overlay.style.display = 'none', 500);
        srText.textContent = "System Ready.";
        loop();
    }
});

// --- RECORDING SYSTEM ---
recBtn.addEventListener('click', () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        recordedChunks = [];
        const stream = canvas.captureStream(60);
        const audioDest = engine.ctx.createMediaStreamDestination();
        engine.master.connect(audioDest);
        stream.addTrack(audioDest.stream.getAudioTracks()[0]);
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9', videoBitsPerSecond: 15000000 });
        mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `Sonic_Inclusion_Master.webm`;
            a.click();
        };
        mediaRecorder.start();
        recBtn.textContent = "⏹ STOP & SAVE";
        recBtn.style.background = "#ff0044";
        recBtn.style.color = "#fff";
    } else {
        mediaRecorder.stop();
        recBtn.textContent = "⏺ START RECORDING";
        recBtn.style.background = "#000";
        recBtn.style.color = "#ff0044";
    }
});

// --- AUDIO HELPERS ---
async function playDemoFile(filepath) {
    try {
        srText.textContent = "⏳ BUFFERING...";
        const response = await fetch(filepath);
        const arrayBuf = await response.arrayBuffer();
        const audioBuf = await engine.ctx.decodeAudioData(arrayBuf);
        engine.stop();
        const source = engine.ctx.createBufferSource();
        source.buffer = audioBuf; source.loop = true;
        source.connect(engine.buses.music);
        source.start(0); await engine.resume();
        srText.textContent = `Master Output: Active`;
    } catch (err) { srText.textContent = "❌ RESOURCE ERROR"; }
}
demoBtn.addEventListener('click', () => playDemoFile('media/kasubo hoerprobe.mp3'));

// --- RENDER ENGINE ---
function drawGrid(w, h, low, hue) {
    c.strokeStyle = `hsla(${hue}, 100%, 50%, ${0.03 + low/1200})`;
    const step = 60;
    gridOffset = (gridOffset + 0.5 + low/40) % step;
    for (let x = gridOffset; x < w; x += step) {
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke();
    }
    for (let y = gridOffset; y < h; y += step) {
        c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
    }
}

function loop() {
    if (!visualizer) { raf = requestAnimationFrame(loop); return; }
    visualizer.analyser.getByteFrequencyData(visualizer.dataFreq);
    visualizer.analyser.getByteTimeDomainData(visualizer.dataTime);
    const w = canvas.width, h = canvas.height, s = parseFloat(sens.value);

    // Get Panel Values
    const pAmount = parseInt(document.getElementById('partAmount').value);
    const flashScale = parseInt(document.getElementById('flashInt').value);
    const hShift = parseInt(document.getElementById('hueShift').value);

    const low = (visualizer.dataFreq[2] + visualizer.dataFreq[4]) / 2;
    const currentHue = (hShift + low * 0.4) % 360;

    // Background Layer
    c.fillStyle = "rgba(5, 5, 5, 0.22)";
    c.fillRect(0, 0, w, h);
    drawGrid(w, h, low, currentHue);

    // Waveform Blitz
    c.lineWidth = 1.5;
    c.strokeStyle = `hsla(${currentHue}, 100%, 70%, 0.5)`;
    c.beginPath();
    let x = 0; const sliceWidth = w / visualizer.dataTime.length;
    for (let i = 0; i < visualizer.dataTime.length; i++) {
        const v = visualizer.dataTime[i] / 128.0;
        const y = (v * h) / 2;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        x += sliceWidth;
    }
    c.stroke();

    // Bass Impact
    if (low > 195) {
        c.fillStyle = `rgba(255, 255, 255, ${low / flashScale})`;
        c.fillRect(0, 0, w, h);
        for(let i = 0; i < pAmount; i++) particles.push(new Particle(w/2, h/2, currentHue));
        srText.style.transform = `scale(${1 + low / 600}) rotate(${(Math.random()-0.5)*2}deg)`;
    } else {
        srText.style.transform = "scale(1)";
    }

    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => { p.update(); p.draw(); });

    // Visual Rings
    [90, 160, 230].forEach((r, i) => {
        const e = visualizer.dataFreq[i * 40 + 10];
        c.beginPath();
        c.arc(w / 2, h / 2, r + (e / 4) * s, 0, Math.PI * 2);
        c.fillStyle = `hsla(${currentHue + i * 40}, 90%, 60%, ${0.25 + (e / 400)})`;
        c.fill();
        if (e > 180) { c.strokeStyle = "rgba(255,255,255,0.7)"; c.stroke(); }
    });

    // Branding "S"
    c.font = `900 ${65 + low/6}px sans-serif`;
    c.fillStyle = "white";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.shadowBlur = low / 2.5;
    c.shadowColor = `hsla(${currentHue}, 100%, 50%, 0.8)`;
    c.fillText("S", w / 2, h / 2);
    c.shadowBlur = 0;

    raf = requestAnimationFrame(loop);
}

function fitCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();
