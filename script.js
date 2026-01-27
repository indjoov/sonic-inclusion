import { AudioEngine } from './audio/AudioEngine.js';

const canvas = document.getElementById('viz');
const c = canvas.getContext('2d');
const srText = document.getElementById('srText');
const sens = document.getElementById('sens');
const micBtn = document.getElementById('micBtn');
const fileBtn = document.getElementById('fileBtn');
const demoBtn = document.getElementById('demoBtn');
const fileInput = document.getElementById('fileInput');

// --- UI SETUP ---
const overlay = document.createElement('div');
overlay.id = 'intro-overlay';
overlay.innerHTML = `
    <div style="text-align:center; color:white; font-family:Arial; background:rgba(0,0,0,0.95); padding:50px; border-radius:20px; border:2px solid #00d4ff; cursor:pointer; box-shadow: 0 0 30px #00d4ff;">
        <h1 style="margin-bottom:10px; letter-spacing: 8px; font-weight:900;">SONIC INCLUSION</h1>
        <p style="opacity:0.8;">Klicke hier zum Aktivieren der Visuals</p>
    </div>
`;
overlay.setAttribute('style', 'position:fixed; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; z-index:1000; background:black;');
document.body.appendChild(overlay);

const recBtn = document.createElement('button');
recBtn.textContent = "⏺ Video aufnehmen";
recBtn.style.marginLeft = "10px";
recBtn.style.background = "#111";
recBtn.style.color = "#00d4ff";
recBtn.style.border = "1px solid #00d4ff";
recBtn.style.padding = "10px 15px";
recBtn.style.cursor = "pointer";
recBtn.style.borderRadius = "5px";
recBtn.style.fontWeight = "bold";
demoBtn.parentNode.insertBefore(recBtn, demoBtn.nextSibling);

const engine = new AudioEngine();
let visualizer = null;
let raf;
let mediaRecorder;
let recordedChunks = [];
let particles = [];
let gridOffset = 0;

class Particle {
    constructor(x, y, hue) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 3 + 1;
        this.speedX = (Math.random() - 0.5) * 16;
        this.speedY = (Math.random() - 0.5) * 16;
        this.color = `hsla(${hue}, 100%, 75%, 0.8)`;
        this.life = 1.0;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= 0.035;
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

overlay.addEventListener('click', async () => {
    if (engine.state === 'idle') {
        await engine.init();
        visualizer = engine.getVisualizerData();
        overlay.style.display = 'none';
        srText.textContent = "System bereit.";
        loop();
    }
});

// --- Video Aufnahme ---
recBtn.addEventListener('click', () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") startRecording();
    else stopRecording();
});

function startRecording() {
    recordedChunks = [];
    const stream = canvas.captureStream(60); 
    const audioDest = engine.ctx.createMediaStreamDestination();
    engine.master.connect(audioDest);
    stream.addTrack(audioDest.stream.getAudioTracks()[0]);
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9', videoBitsPerSecond: 10000000 });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = saveRecording;
    mediaRecorder.start();
    recBtn.textContent = "⏹ Stoppen";
    recBtn.style.background = "#e74c3c";
}

function stopRecording() {
    mediaRecorder.stop();
    recBtn.textContent = "⏺ Video aufnehmen";
    recBtn.style.background = "#111";
}

function saveRecording() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Sonic-Vibes-HD.webm`;
    a.click();
}

// --- Audio Steuerung ---
async function playBuffer(buffer, name) {
    engine.stop();
    const source = engine.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(engine.buses.music);
    source.start(0); 
    await engine.resume();
    engine.master.gain.value = 1.0; 
    srText.textContent = `Spiele: ${name}`;
}

async function playDemoFile(filepath) {
    try {
        srText.textContent = "⏳ Lade...";
        const response = await fetch(filepath);
        const arrayBuf = await response.arrayBuffer();
        const audioBuf = await engine.ctx.decodeAudioData(arrayBuf);
        playBuffer(audioBuf, "Kasubo Demo");
    } catch (err) { srText.textContent = "❌ " + err.message; }
}

demoBtn.addEventListener('click', () => playDemoFile('media/kasubo hoerprobe.mp3'));

// --- Animation Hilfsfunktionen ---
function energy(bins, start, end) {
    let sum = 0;
    for (let i = start; i < end; i++) sum += bins[i];
    return sum / (end - start + 1 || 1);
}

function drawGrid(w, h, low) {
    c.strokeStyle = `rgba(0, 212, 255, ${0.03 + low/1200})`;
    const step = 60;
    gridOffset = (gridOffset + 1 + low/40) % step;
    for (let x = gridOffset; x < w; x += step) {
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke();
    }
    for (let y = gridOffset; y < h; y += step) {
        c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
    }
}

function drawWaveform(w, h, low, hue) {
    visualizer.analyser.getByteTimeDomainData(visualizer.dataTime);
    c.lineWidth = 2;
    c.strokeStyle = `hsla(${hue}, 100%, 70%, 0.8)`;
    c.beginPath();
    const sliceWidth = w / visualizer.dataTime.length;
    let x = 0;
    for (let i = 0; i < visualizer.dataTime.length; i++) {
        const v = visualizer.dataTime[i] / 128.0;
        const y = (v * h) / 2;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
        x += sliceWidth;
    }
    c.stroke();
}

function loop() {
    if (!visualizer) {
        raf = requestAnimationFrame(loop);
        return;
    }
    visualizer.analyser.getByteFrequencyData(visualizer.dataFreq);
    const w = canvas.width;
    const h = canvas.height;
    const s = parseFloat(sens.value);

    const low = energy(visualizer.dataFreq, 2, 32);
    const mid = energy(visualizer.dataFreq, 33, 128);
    const high = energy(visualizer.dataFreq, 129, 255);
    const currentHue = (280 + low * 0.5) % 360;

    // Background & Grid
    c.fillStyle = "rgba(0, 0, 0, 0.22)";
    c.fillRect(0, 0, w, h);
    drawGrid(w, h, low);

    // Waveform (Blitz)
    drawWaveform(w, h, low, currentHue);

    // Bass-Reaktion
    if (low > 190) {
        const shake = (Math.random() - 0.5) * 12;
        srText.style.transform = `translate(${shake}px, ${shake}px) scale(${1 + low / 550})`;
        for(let i = 0; i < 7; i++) particles.push(new Particle(w/2, h/2, currentHue));
    } else {
        srText.style.transform = "scale(1)";
    }

    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => { p.update(); p.draw(); });

    // Kreise
    const bands = [
        { e: low,  r: 85,  h: currentHue },
        { e: mid,  r: 150, h: (200 + mid * 0.8) % 360 },
        { e: high, r: 210, h: (340 + high * 1.2) % 360 }
    ];

    bands.forEach(b => {
        c.beginPath();
        c.arc(w / 2, h / 2, b.r + (b.e / 4) * s, 0, Math.PI * 2);
        c.fillStyle = `hsla(${b.h}, 85%, 60%, ${0.28 + (b.e / 400)})`;
        c.fill();
        if (b.e > 170) {
            c.strokeStyle = "rgba(255,255,255,0.8)";
            c.stroke();
        }
    });

    // Logo "S"
    c.font = `black 900 ${55 + low/7}px Arial`;
    c.fillStyle = "white";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.shadowBlur = low / 2.5;
    c.shadowColor = `hsla(${currentHue}, 100%, 50%, 0.9)`;
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
