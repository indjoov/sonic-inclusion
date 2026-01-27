import { AudioEngine } from './audio/AudioEngine.js';

const canvas = document.getElementById('viz');
const c = canvas.getContext('2d');
const srText = document.getElementById('srText');
const sens = document.getElementById('sens');
const micBtn = document.getElementById('micBtn');
const fileBtn = document.getElementById('fileBtn');
const demoBtn = document.getElementById('demoBtn');
const fileInput = document.getElementById('fileInput');

const recBtn = document.createElement('button');
recBtn.textContent = "⏺ Video aufnehmen";
recBtn.style.marginLeft = "10px";
recBtn.style.background = "#2c3e50";
recBtn.style.color = "white";
recBtn.style.border = "none";
recBtn.style.padding = "10px";
recBtn.style.cursor = "pointer";
demoBtn.parentNode.insertBefore(recBtn, demoBtn.nextSibling);

const engine = new AudioEngine();
let visualizer = null;
let raf;
let mediaRecorder;
let recordedChunks = [];

// Partikel-System Variablen
let particles = [];

class Particle {
    constructor(x, y, hue) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 4 + 1;
        this.speedX = (Math.random() - 0.5) * 10;
        this.speedY = (Math.random() - 0.5) * 10;
        this.color = `hsla(${hue}, 80%, 60%, 0.8)`;
        this.life = 1.0; // Lebensdauer von 1 bis 0
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= 0.02;
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

window.addEventListener('click', async () => {
    if (engine.state === 'idle') {
        await engine.init();
        visualizer = engine.getVisualizerData();
        srText.textContent = "Engine bereit.";
        loop();
    }
}, { once: true });

// --- Aufnahme-Logik ---
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
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9', videoBitsPerSecond: 5000000 });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = saveRecording;
    mediaRecorder.start();
    recBtn.textContent = "⏹ Aufnahme stoppen";
    recBtn.style.background = "#e74c3c";
    srText.textContent = "Aufnahme läuft...";
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
    a.download = `Sonic-Visual-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
    srText.textContent = "Video gespeichert!";
}

// --- Audio-Funktionen ---
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

// --- Haupt-Loop mit Partikeln ---
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

    // Hintergrund-Flash
    if (low > 200) c.fillStyle = `rgba(255, 255, 255, ${low / 800})`;
    else c.fillStyle = "black";
    c.fillRect(0, 0, w, h);

    // Partikel bei Bass erzeugen
    if (low > 170) {
        for(let i = 0; i < 5; i++) {
            particles.push(new Particle(w/2, h/2, (280 + low * 0.5) % 360));
        }
    }

    // Partikel updaten und zeichnen
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
        p.update();
        p.draw();
    });

    const bands = [
        { e: low,  r: 80,  hue: (280 + low * 0.5) % 360 },
        { e: mid,  r: 140, hue: (200 + mid * 0.8) % 360 },
        { e: high, r: 200, hue: (340 + high * 1.2) % 360 }
    ];

    bands.forEach(b => {
        c.beginPath();
        c.arc(w / 2, h / 2, b.r + (b.e / 4) * s, 0, Math.PI * 2);
        c.fillStyle = `hsla(${b.hue}, 80%, 60%, ${0.3 + (b.e / 400)})`;
        c.fill();
        if (b.e > 150) {
            c.strokeStyle = "white";
            c.lineWidth = 1;
            c.stroke();
        }
    });
    raf = requestAnimationFrame(loop);
}

function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();
