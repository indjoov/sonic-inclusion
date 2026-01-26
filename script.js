/**
 * Sonic Inclusion - Main Controller
 * Uses the professional AudioEngine module
 */
import { AudioEngine } from './audio/AudioEngine.js';

const canvas = document.getElementById('viz');
const c = canvas.getContext('2d');
const srText = document.getElementById('srText');
const palette = document.getElementById('palette');
const sens = document.getElementById('sens');

const engine = new AudioEngine();
let visualizer = null;
let raf;

// 1. Initialization on user gesture
window.addEventListener('click', async () => {
    if (engine.state === 'idle') {
        await engine.init({ debug: true });
        // Link visualization to engine
        visualizer = engine.getVisualizerData();
        srText.textContent = "Audio Engine ready. Press 'D' for Demo or load a file.";
        loop();
    }
}, { once: true });

// 2. Helper Functions for Visualization
function energy(bins, start, end) {
    let sum = 0;
    for (let i = start; i < end; i++) sum += bins[i];
    return sum / (end - start + 1 || 1);
}

function hueFor(pitchIndex, mode) {
    if (mode === 'energy') return (pitchIndex * 1.3) % 360;
    if (mode === 'grayscale') return 0;
    return (pitchIndex * 2.1) % 360;
}

// 3. The Main Drawing Loop
function loop() {
    if (!visualizer) return;

    // Get fresh data
    visualizer.analyser.getByteFrequencyData(visualizer.dataFreq);
    visualizer.analyser.getByteTimeDomainData(visualizer.dataTime);

    const w = canvas.width;
    const h = canvas.height;
    const s = parseFloat(sens.value);

    // Analyze bands
    const low = energy(visualizer.dataFreq, 2, 32);
    const mid = energy(visualizer.dataFreq, 33, 128);
    const high = energy(visualizer.dataFreq, 129, 255);
    const glow = Math.min(0.8, ((low + mid + high) / 765) * 0.9 * s);

    // Clear and draw background
    c.clearRect(0, 0, w, h);
    c.fillStyle = `rgba(124, 77, 255, ${glow})`;
    c.fillRect(0, 0, w, h);

    // Draw central circles
    const bands = [
        { e: low, r: 70, ix: 24 },
        { e: mid, r: 120, ix: 96 },
        { e: high, r: 170, ix: 180 }
    ];

    bands.forEach(b => {
        const hue = palette.value === 'grayscale' ? 0 : hueFor(b.ix, palette.value);
        const alpha = Math.min(0.95, 0.15 + (b.e / 255) * 0.85 * s);
        c.beginPath();
        c.arc(w / 2, h / 2, b.r + (b.e / 8) * s, 0, Math.PI * 2);
        c.fillStyle = `hsla(${hue}, 80%, 55%, ${alpha})`;
        c.fill();
    });

    // Waveform ribbon
    c.beginPath();
    const step = Math.floor(visualizer.dataTime.length / w);
    for (let x = 0; x < w; x++) {
        const v = visualizer.dataTime[x * step] / 255;
        const y = h * (0.5 + (v - 0.5) * 0.8 * s);
        if (x === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
    }
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    c.lineWidth = 2;
    c.stroke();

    raf = requestAnimationFrame(loop);
}

// 4. Input Handling
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        engine.state === 'running' ? engine.ctx.suspend() : engine.resume();
    }
    if (e.key.toLowerCase() === 'd') {
        // Automatically plays a file from your /audio folder
        playDemo('your-file.mp3'); 
    }
});

async function playDemo(file) {
    if (engine.state === 'idle') return;
    try {
        const response = await fetch(`audio/${file}`);
        const arrayBuf = await response.arrayBuffer();
        const audioBuf = await engine.ctx.decodeAudioData(arrayBuf);
        const source = engine.createSource("music");
        source.buffer = audioBuf;
        source.loop = true;
        source.start(0);
        srText.textContent = `Playing demo: ${file}`;
    } catch (err) {
        console.error("Demo error:", err);
    }
}

// Handle resizing
function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();
