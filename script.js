import { AudioEngine } from './audio/AudioEngine.js';

const canvas = document.getElementById('viz');
const c = canvas.getContext('2d');
const srText = document.getElementById('srText');
const sens = document.getElementById('sens');
const micBtn = document.getElementById('micBtn');
const fileBtn = document.getElementById('fileBtn');
const demoBtn = document.getElementById('demoBtn');
const fileInput = document.getElementById('fileInput');

const engine = new AudioEngine();
let visualizer = null;
let raf;

// 1. Initialisierung beim ersten Klick auf die Seite
window.addEventListener('click', async () => {
    if (engine.state === 'idle') {
        await engine.init();
        visualizer = engine.getVisualizerData();
        srText.textContent = "Engine bereit. Wähle eine Quelle.";
        loop();
    }
}, { once: true });

// --- Steuerung ---

// Mikrofon-Aktivierung
micBtn.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const micSource = engine.ctx.createMediaStreamSource(stream);
        const micGain = engine.createSource("music");
        micSource.connect(micGain);
        await engine.resume();
        srText.textContent = "Mikrofon aktiv.";
    } catch (err) { 
        alert("Mikrofon-Fehler: " + err.message); 
    }
});

// Eigene Datei laden
fileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) {
        const arrayBuf = await file.arrayBuffer();
        const audioBuf = await engine.ctx.decodeAudioData(arrayBuf);
        playBuffer(audioBuf, file.name);
    }
});

// Demo-Song aus dem media-Ordner
demoBtn.addEventListener('click', () => {
    // Falls der Name in GitHub anders ist, hier anpassen!
    playDemoFile('./media/kasubo hoerprobe.mp3'); 
});

// --- Audio Funktionen ---

async function playBuffer(buffer, name) {
    engine.stop();
    
    // Quelle direkt im Context erstellen
    const source = engine.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    
    // Verbindung zum Musik-Kanal der AudioEngine
    source.connect(engine.buses.music);
    
    source.start(0); 
    await engine.resume();
    engine.master.gain.value = 1.0; 
    srText.textContent = `Spiele: ${name}`;
}

async function playDemoFile(filepath) {
    try {
        srText.textContent = "Lade Demo...";
        const response = await fetch(filepath);
        
        if (!response.ok) {
            // Zeigt Fehler an, wenn die Datei nicht existiert
            throw new Error(`Datei nicht gefunden (Status: ${response.status}). Prüfe den 'media' Ordner!`);
        }
        
        const arrayBuf = await response.buffer ? await response.buffer() : await response.arrayBuffer();
        const audioBuf = await engine.ctx.decodeAudioData(arrayBuf);
        playBuffer(audioBuf, "Kasubo Demo");
    } catch (err) {
        console.error("Demo-Fehler:", err);
        srText.textContent = err.message;
    }
}

// --- Visualisierung ---

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

    c.clearRect(0, 0, w, h);

    const low = energy(visualizer.dataFreq, 2, 32);
    const mid = energy(visualizer.dataFreq, 33, 128);
    const high = energy(visualizer.dataFreq, 129, 255);

    const bands = [
        { e: low,  r: 80,  hue: (280 + low * 0.5) % 360 },
        { e: mid,  r: 140, hue: (200 + mid * 0.8) % 360 },
        { e: high, r: 200, hue: (340 + high * 1.2) % 360 }
    ];

    bands.forEach(b => {
        c.beginPath();
        c.arc(w / 2, h / 2, b.r + (b.e / 4) * s, 0, Math.PI * 2);
        c.fillStyle = `hsla(${b.hue}, 80%, 60%, ${0.2 + (b.e / 400)})`;
        c.fill();
        
        if (b.e > 150) {
            c.strokeStyle = `rgba(255, 255, 255, ${b.e / 255})`;
            c.lineWidth = 2;
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
