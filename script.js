import { AudioEngine } from './audio/AudioEngine.js';

const canvas = document.getElementById('viz');
const c = canvas.getContext('2d');
const srText = document.getElementById('srText');
const sens = document.getElementById('sens');
const micBtn = document.getElementById('micBtn');
const fileBtn = document.getElementById('fileBtn');
const demoBtn = document.getElementById('demoBtn');
const fileInput = document.getElementById('fileInput');

// --- UI ERWEITERUNGEN ---

// 1. Intro-Overlay erstellen
const overlay = document.createElement('div');
overlay.id = 'intro-overlay';
overlay.innerHTML = `
    <div style="text-align:center; color:white; font-family:Arial; background:rgba(0,0,0,0.9); padding:40px; border-radius:15px; border:2px solid #3498db; cursor:pointer;">
        <h1 style="margin-bottom:10px;">SONIC INCLUSION</h1>
        <p>Klicke hier, um die Engine zu starten</p>
        <span style="font-size:40px;">✨</span>
    </div>
`;
overlay.setAttribute('style', 'position:fixed; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; z-index:1000; background:black;');
document.body.appendChild(overlay);

// 2. Aufnahme-Button
const recBtn = document.createElement('button');
recBtn.textContent = "⏺ Video aufnehmen";
recBtn.style.marginLeft = "10px";
recBtn.style.background = "#2c3e50";
recBtn.style.color = "white";
recBtn.style.border = "none";
recBtn.style.padding = "10px";
recBtn.style.cursor = "pointer";
recBtn.style.borderRadius = "5px";
demoBtn.parentNode.insertBefore(recBtn, demoBtn.nextSibling);

const engine = new AudioEngine();
let visualizer = null;
let raf;
let mediaRecorder;
let recordedChunks = [];
let particles = [];

// Partikel-Klasse für Bass-Funken
class Particle {
    constructor(x, y, hue) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 3 + 1;
        this.speedX = (Math.random() - 0.5) * 12;
        this.speedY = (Math.random() - 0.5) * 12;
        this.color = `hsla(${hue}, 80%, 60%, 0.8)`;
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

// Initialisierung bei Klick auf das Overlay
overlay.addEventListener('click', async () => {
    if (engine.state === 'idle') {
        await engine.init();
        visualizer = engine.getVisualizerData();
        overlay.style.display = 'none'; // Overlay ausblenden
        srText.textContent = "Engine bereit. Wähle eine Quelle.";
        loop();
    }
});

// --- Aufnahme-Funktion ---
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
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9', videoBitsPerSecond: 6000000 });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = saveRecording;
    mediaRecorder.start();
    recBtn.textContent = "⏹ Stoppen";
    recBtn.style.background = "#e74c3c";
}

function stopRecording() {
    mediaRecorder.stop();
    recBtn.textContent = "⏺ Video aufnehmen";
    recBtn.style.background = "#2c3e50";
}

function saveRecording() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Sonic-Vibes-Recording.webm`;
    a.click();
    URL.revokeObjectURL(url);
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
        srText.textContent = "⏳ Lade Demo...";
        const response = await fetch(filepath);
        const arrayBuf = await response.arrayBuffer();
        srText.textContent = "⚙️ Dekodiere...";
        const audioBuf = await engine.ctx.decodeAudioData(arrayBuf);
        playBuffer(audioBuf, "Kasubo Demo");
    } catch (err) { srText.textContent = "❌ Fehler: " + err.message; }
}

demoBtn.addEventListener('click', () => playDemoFile('media/kasubo hoerprobe.mp3'));

// --- Animation Loop ---
function energy(bins, start, end) {
    let sum = 0;
    for (let i = start; i < end; i++) sum += bins[i];
    return sum / (end - start + 1 || 1);
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

    // Echo-Effekt (Trail)
    c.fillStyle = "rgba(0, 0, 0, 0.18)";
    c.fillRect(0, 0, w, h);

    // Bass-Interaktion (Vibration & Partikel)
    if (low > 185) {
        const shake = (Math.random() - 0.5) * 8;
        srText.style.transform = `translate(${shake}px, ${shake}px) scale(${1 + low / 650})`;
        for(let i = 0; i < 5; i++) {
            particles.push(new Particle(w/2, h/2, (280 + low * 0.5) % 360));
        }
    } else {
        srText.style.transform = "scale(1)";
    }

    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => { p.update(); p.draw(); });

    // Kreise
    const bands = [
        { e: low,  r: 80,  hue: (280 + low * 0.5) % 360 },
        { e: mid,  r: 140, hue: (200 + mid * 0.8) % 360 },
        { e: high, r: 200, hue: (340 + high * 1.2) % 360 }
    ];

    bands.forEach(b => {
        c.beginPath();
        c.arc(w / 2, h / 2, b.r + (b.e / 4) * s, 0, Math.PI * 2);
        c.fillStyle = `hsla(${b.hue}, 80%, 60%, ${0.3 + (b.e / 450)})`;
        c.fill();
        if (b.e > 165) {
            c.strokeStyle = "white";
            c.lineWidth = 1;
            c.stroke();
        }
    });

    // Logo "S"
    c.font = `bold ${45 + low/9}px Arial`;
    c.fillStyle = "white";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.shadowBlur = low / 4;
    c.shadowColor = `hsla(${(280 + low * 0.5) % 360}, 100%, 50%, 0.8)`;
    c.fillText("S", w / 2, h / 2);
    c.shadowBlur = 0;

    raf = requestAnimationFrame(loop);
}

function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();
