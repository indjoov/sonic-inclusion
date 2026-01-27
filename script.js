import { AudioEngine } from './audio/AudioEngine.js';

const canvas = document.getElementById('viz');
const c = canvas.getContext('2d');
const srText = document.getElementById('srText');
const palette = document.getElementById('palette');
const sens = document.getElementById('sens');
const micBtn = document.getElementById('micBtn');
const fileBtn = document.getElementById('fileBtn');
const demoBtn = document.getElementById('demoBtn');
const fileInput = document.getElementById('fileInput');

const engine = new AudioEngine();
let visualizer = null;
let raf;

// 1. Initialisierung beim ersten Klick
window.addEventListener('click', async () => {
    if (engine.state === 'idle') {
        await engine.init({ debug: true });
        visualizer = engine.getVisualizerData();
        srText.textContent = "Engine ready. Click a button to start.";
        loop();
    }
}, { once: true });

// --- Controls ---

micBtn.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // KORREKTUR: createMediaStreamSource statt nur mediaStreamSource
        const micSource = engine.ctx.createMediaStreamSource(stream);
        const micGain = engine.createSource("music");
        micSource.connect(micGain);
        
        await engine.resume(); // Stellt sicher, dass die Engine läuft
        srText.textContent = "Microphone active.";
    } catch (err) { 
        alert("Mic error: " + err.message); 
    }
});

fileBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) {
        const arrayBuf = await file.arrayBuffer();
        const audioBuf = await engine.ctx.decodeAudioData(arrayBuf);
        playBuffer(audioBuf, file.name);
    }
});

demoBtn.addEventListener('click', () => {
    // Greift auf deine MP3 im media-Ordner zu
    playDemoFile('kasubo hoerprobe.mp3'); 
});

// --- Audio Logic ---

async function playBuffer(buffer, name) {
    engine.stop();
    const source = engine.createSource("music");
    source.buffer = buffer;
    source.loop = true;
    
    // Startet die Wiedergabe
    source.start(0); 
    
    await engine.resume();
    srText.textContent = `Playing: ${name}`;
}

async function playDemoFile(filename) {
    try {
        // Pfad zu deinem media-Ordner
        const response = await fetch(`media/${filename}`);
        if (!response.ok) throw new Error('File not found');
        const arrayBuf = await response.arrayBuffer();
        const audioBuf = await engine.ctx.decodeAudioData(arrayBuf);
        playBuffer(audioBuf, filename);
    } catch (err) {
        console.error("Demo error:", err);
        srText.textContent = "Error loading demo from /media folder.";
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
    visualizer.analyser.getByteTimeDomainData(visualizer.dataTime);

    const w = canvas.width;
    const h = canvas.height;
    const s = parseFloat(sens.value);

    c.clearRect(0, 0, w, h);

    const low = energy(visualizer.dataFreq, 2, 32);
    const mid = energy(visualizer.dataFreq, 33, 128);
    const high = energy(visualizer.dataFreq, 129, 255);

    const bands = [
        { e: low, r: 80, hue: 280 },
        { e: mid, r: 140, hue: 200 },
        { e: high, r: 200, hue: 340 }
    ];

    bands.forEach(b => {
        c.beginPath();
        c.arc(w / 2, h / 2, b.r + (b.e / 4) * s, 0, Math.PI * 2);
        c.fillStyle = `hsla(${b.hue}, 80%, 60%, ${0.2 + (b.e / 400)})`;
        c.fill();
    });

    raf = requestAnimationFrame(loop);
}

function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();
