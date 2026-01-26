/**
 * Sonic Inclusion - Main Controller (Module Version)
 */
import { AudioEngine } from './audio/AudioEngine.js';

const canvas = document.getElementById('viz');
const c = canvas.getContext('2d');
const srText = document.getElementById('srText');
const palette = document.getElementById('palette');
const sens = document.getElementById('sens');

// Select the buttons and inputs
const micBtn = document.getElementById('micBtn');
const fileBtn = document.getElementById('fileBtn');
const demoBtn = document.getElementById('demoBtn');
const fileInput = document.getElementById('fileInput');

const engine = new AudioEngine();
let visualizer = null;
let raf;

// Initialize Engine on first click
window.addEventListener('click', async () => {
    if (engine.state === 'idle') {
        await engine.init({ debug: true });
        visualizer = engine.getVisualizerData();
        srText.textContent = "Engine ready. Choose an input below.";
        loop();
    }
}, { once: true });

// --- BUTTON WIRING (This replaces the old HTML onclicks) ---

// 1. Microphone
micBtn.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const micSource = engine.ctx.createMediaStreamSource(stream);
        // In the new engine, we connect to a bus (e.g., music)
        const micGain = engine.createSource("music");
        micSource.connect(micGain);
        engine.resume();
        srText.textContent = "Microphone visualization running.";
    } catch (err) {
        alert("Microphone error: " + err.message);
    }
});

// 2. File Upload
fileBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) {
        const arrayBuf = await file.arrayBuffer();
        const audioBuf = await engine.ctx.decodeAudioData(arrayBuf);
        playBuffer(audioBuf, file.name);
    }
});

// 3. Demo Song (Folder Audio)
demoBtn.addEventListener('click', () => {
    // REPLACE 'your-song.mp3' with your actual filename from the /audio folder
    playDemoFile('your-song.mp3'); 
});

async function playBuffer(buffer, name) {
    engine.stop(); // Stop previous audio
    const source = engine.createSource("music");
    source.buffer = buffer;
    source.loop = true;
    source.start(0);
    engine.resume();
    srText.textContent = `Playing file: ${name}`;
}

async function playDemoFile(filename) {
    try {
        const response = await fetch(`audio/${filename}`);
        const arrayBuf = await response.arrayBuffer();
        const audioBuf = await engine.ctx.decodeAudioData(arrayBuf);
        playBuffer(audioBuf, filename);
    } catch (err) {
        console.error("Demo failed:", err);
        srText.textContent = "Error loading demo file.";
    }
}

// --- VISUALIZATION LOGIC ---

function energy(bins, start, end) {
    let sum = 0;
    for (let i = start; i < end; i++) sum += bins[i];
    return sum / (end - start + 1 || 1);
}

function loop() {
    if (!visualizer) return;
    visualizer.analyser.getByteFrequencyData(visualizer.dataFreq);
    visualizer.analyser.getByteTimeDomainData(visualizer.dataTime);

    const w = canvas.width;
    const h = canvas.height;
    const s = parseFloat(sens.value);

    c.clearRect(0, 0, w, h);

    const low = energy(visualizer.dataFreq, 2, 32);
    const mid = energy(visualizer.dataFreq, 33, 128);
    const high = energy(visualizer.dataFreq, 129, 255);

    // Drawing the circles
    const bands = [
        { e: low, r: 70, color: 'hue' },
        { e: mid, r: 120, color: 'energy' },
        { e: high, r: 170, color: 'hue' }
    ];

    bands.forEach((b, i) => {
        const hue = (b.e * 1.5 + i * 50) % 360;
        c.beginPath();
        c.arc(w / 2, h / 2, b.r + (b.e / 5) * s, 0, Math.PI * 2);
        c.fillStyle = `hsla(${hue}, 80%, 60%, 0.6)`;
        c.fill();
    });

    raf = requestAnimationFrame(loop);
}

// Handle resizing
function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();
