import { AudioEngine } from './audio/AudioEngine.js';

const canvas = document.getElementById('viz');
const c = canvas.getContext('2d');
const srText = document.getElementById('srText');
const sens = document.getElementById('sens');
const micBtn = document.getElementById('micBtn');
const fileBtn = document.getElementById('fileBtn');
const demoBtn = document.getElementById('demoBtn');
const fileInput = document.getElementById('fileInput');

// Neuer Button für die Aufnahme (Stelle sicher, dass dieser in deiner HTML existiert oder nutze diesen Code)
const recBtn = document.createElement('button');
recBtn.textContent = "⏺ Record Video";
recBtn.style.marginLeft = "10px";
demoBtn.parentNode.insertBefore(recBtn, demoBtn.nextSibling);

const engine = new AudioEngine();
let visualizer = null;
let raf;
let mediaRecorder;
let recordedChunks = [];

// 1. Initialisierung beim ersten Klick
window.addEventListener('click', async () => {
    if (engine.state === 'idle') {
        await engine.init();
        visualizer = engine.getVisualizerData();
        srText.textContent = "Engine bereit. Wähle eine Quelle.";
        loop();
    }
}, { once: true });

// --- Aufnahme Logik ---

recBtn.addEventListener('click', () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        startRecording();
    } else {
        stopRecording();
    }
});

function startRecording() {
    recordedChunks = [];
    // Stream vom Canvas erfassen (30 Bilder pro Sekunde)
    const stream = canvas.captureStream(30);
    
    // Optional: Audio zum Video-Stream hinzufügen
    if (engine.ctx.destination) {
        const audioDest = engine.ctx.createMediaStreamDestination();
        engine.master.connect(audioDest);
        stream.addTrack(audioDest.stream.getAudioTracks()[0]);
    }

    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
    
    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = saveRecording;
    
    mediaRecorder.start();
    recBtn.textContent = "⏹ Stop Recording";
    recBtn.style.backgroundColor = "#ff4444";
    srText.textContent = "Aufnahme läuft...";
}

function stopRecording() {
    mediaRecorder.stop();
    recBtn.textContent = "⏺ Record Video";
    recBtn.style.backgroundColor = "";
}

function saveRecording() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sonic-visualizer-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
    srText.textContent = "Video gespeichert!";
}

// --- Steuerung (bestehend) ---

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

fileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) {
        srText.textContent = `Lade Datei: ${file.name}...`;
        const arrayBuf = await file.arrayBuffer();
        const audioBuf = await engine.ctx.decodeAudioData(arrayBuf);
        playBuffer(audioBuf, file.name);
    }
});

demoBtn.addEventListener('click', () => {
    playDemoFile('media/kasubo hoerprobe.mp3'); 
});

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
        srText.textContent = "⏳ LADE DEMO VOM SERVER... BITTE WARTEN...";
        const response = await fetch(filepath);
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        const arrayBuf = await response.arrayBuffer();
        srText.textContent = "⚙️ DEKODIERE DATEN...";
        const audioBuf = await engine.ctx.decodeAudioData(arrayBuf);
        playBuffer(audioBuf, "Kasubo Demo");
    } catch (err) {
        srText.textContent = "❌ FEHLER: " + err.message;
    }
}

// --- Visualisierung (bestehend) ---

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
