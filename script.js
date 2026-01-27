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
    <div style="text-align:center; color:white; font-family:sans-serif; background:rgba(5,5,5,0.98); padding:60px; border-radius:30px; border:1px solid #00d4ff; cursor:pointer; box-shadow: 0 0 80px rgba(0,212,255,0.5); backdrop-filter: blur(15px);">
        <h1 style="margin-bottom:10px; letter-spacing: 15px; font-weight:900; text-shadow: 0 0 20px #00d4ff;">SONIC INCLUSION</h1>
        <p style="opacity:0.6; letter-spacing:5px; font-size: 12px;">ENTER CINEMATIC EXPERIENCE</p>
    </div>
`;
overlay.setAttribute('style', 'position:fixed; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; z-index:2000; background:black;');
document.body.appendChild(overlay);

// Control Panel
const gui = document.createElement('div');
gui.id = "ui-panel";
gui.setAttribute('style', `position:fixed; top:20px; right:20px; background:rgba(10,10,10,0.9); padding:20px; border-radius:15px; color:#fff; font-family:sans-serif; border:1px solid #00d4ff; z-index:100; min-width:220px; backdrop-filter: blur(10px); transition: opacity 0.5s;`);
gui.innerHTML = `
    <div style="margin-bottom:15px; font-weight:bold; color:#00d4ff; border-bottom:1px solid #333; padding-bottom:8px; font-size:12px; letter-spacing:1px;">ENGINE CONTROLS</div>
    <label style="font-size:10px;">PARTIKEL</label><input type="range" id="partAmount" min="0" max="30" value="10" style="width:100%; margin-bottom:10px;">
    <label style="font-size:10px;">BASS ZOOM</label><input type="range" id="zoomInt" min="0" max="100" value="50" style="width:100%; margin-bottom:10px;">
    <label style="font-size:10px;">FARBE</label><input type="range" id="hueShift" min="0" max="360" value="280" style="width:100%; margin-bottom:15px;">
    <button id="hideBtn" style="width:100%; background:#111; color:#00d4ff; border:1px solid #00d4ff; padding:5px; cursor:pointer; font-size:10px;">CINEMA MODE (H)</button>
`;
document.body.appendChild(gui);

const recBtn = document.createElement('button');
recBtn.id = "recBtn";
recBtn.textContent = "⏺ RECORD";
recBtn.style.cssText = `margin-left:10px; background:#000; color:#ff0044; border:1px solid #ff0044; padding:10px 20px; cursor:pointer; font-weight:bold; border-radius:5px; transition: opacity 0.5s;`;
demoBtn.parentNode.insertBefore(recBtn, demoBtn.nextSibling);

// Cinema Mode Logik
let uiVisible = true;
const toggleUI = () => {
    uiVisible = !uiVisible;
    const elements = [gui, recBtn, document.querySelector('.controls'), srText];
    elements.forEach(el => { if(el) el.style.opacity = uiVisible ? "1" : "0"; el.style.pointerEvents = uiVisible ? "all" : "none"; });
};
document.addEventListener('keydown', (e) => { if(e.key.toLowerCase() === 'h') toggleUI(); });
setTimeout(() => document.getElementById('hideBtn').onclick = toggleUI, 100);

const engine = new AudioEngine();
let visualizer = null, raf, mediaRecorder, recordedChunks = [], particles = [], gridOffset = 0, rotation = 0;

class Particle {
    constructor(x, y, hue) {
        this.x = x; this.y = y;
        this.size = Math.random() * 3 + 1;
        this.speedX = (Math.random() - 0.5) * 20;
        this.speedY = (Math.random() - 0.5) * 20;
        this.color = `hsla(${hue}, 100%, 75%, 0.9)`;
        this.life = 1.0;
    }
    update() { this.x += this.speedX; this.y += this.speedY; this.life -= 0.025; }
    draw() {
        c.fillStyle = this.color; c.globalAlpha = this.life;
        c.beginPath(); c.arc(this.x, this.y, this.size, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1.0;
    }
}

overlay.addEventListener('click', async () => {
    if (engine.state === 'idle') {
        await engine.init();
        visualizer = engine.getVisualizerData();
        overlay.style.opacity = '0';
        setTimeout(() => overlay.style.display = 'none', 500);
        loop();
    }
});

recBtn.addEventListener('click', () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        recordedChunks = [];
        const stream = canvas.captureStream(60);
        const audioDest = engine.ctx.createMediaStreamDestination();
        engine.master.connect(audioDest);
        stream.addTrack(audioDest.stream.getAudioTracks()[0]);
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9', videoBitsPerSecond: 25000000 });
        mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `Sonic_Inclusion_Final.webm`; a.click();
        };
        mediaRecorder.start();
        recBtn.textContent = "⏹ STOP"; recBtn.style.background = "#ff0044";
    } else {
        mediaRecorder.stop();
        recBtn.textContent = "⏺ RECORD"; recBtn.style.background = "#000";
    }
});

async function playDemoFile(filepath) {
    try {
        const response = await fetch(filepath);
        const arrayBuf = await response.arrayBuffer();
        const audioBuf = await engine.ctx.decodeAudioData(arrayBuf);
        engine.stop();
        const source = engine.ctx.createBufferSource();
        source.buffer = audioBuf; source.loop = true;
        source.connect(engine.buses.music);
        source.start(0); await engine.resume();
    } catch (err) { console.error(err); }
}
demoBtn.addEventListener('click', () => playDemoFile('media/kasubo hoerprobe.mp3'));

function drawGrid(w, h, low, hue) {
    c.save(); c.translate(w/2, h/2); c.rotate(rotation * 0.2);
    c.strokeStyle = `hsla(${hue}, 100%, 50%, ${0.03 + low/1500})`;
    const step = 80; gridOffset = (gridOffset + 0.2 + low/60) % step;
    for (let x = -w; x < w; x += step) {
        c.beginPath(); c.moveTo(x + gridOffset, -h); c.lineTo(x + gridOffset, h); c.stroke();
    }
    c.restore();
}

function loop() {
    if (!visualizer) { raf = requestAnimationFrame(loop); return; }
    visualizer.analyser.getByteFrequencyData(visualizer.dataFreq);
    visualizer.analyser.getByteTimeDomainData(visualizer.dataTime);
    const w = canvas.width, h = canvas.height, s = parseFloat(sens.value);

    const pAmount = parseInt(document.getElementById('partAmount').value);
    const zoomSens = parseInt(document.getElementById('zoomInt').value) / 1000;
    const hShift = parseInt(document.getElementById('hueShift').value);

    const low = (visualizer.dataFreq[2] + visualizer.dataFreq[4]) / 2;
    const currentHue = (hShift + low * 0.4) % 360;
    rotation += 0.002 + (low / 10000);

    c.fillStyle = "black"; c.fillRect(0, 0, w, h);
    
    c.save();
    c.translate(w/2, h/2);
    const zoom = 1 + (low * zoomSens);
    c.scale(zoom, zoom);
    c.translate(-w/2, -h/2);

    drawGrid(w, h, low, currentHue);

    // Waveform
    c.lineWidth = 2.5; c.strokeStyle = `hsla(${currentHue}, 100%, 70%, 0.5)`;
    c.beginPath();
    let x = 0; const sw = w / visualizer.dataTime.length;
    for (let i = 0; i < visualizer.dataTime.length; i++) {
        const y = (visualizer.dataTime[i] / 128.0 * h) / 2;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        x += sw;
    }
    c.stroke();

    if (low > 200) {
        for(let i = 0; i < pAmount; i++) particles.push(new Particle(w/2, h/2, currentHue));
    }
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => { p.update(); p.draw(); });

    [110, 190, 270].forEach((r, i) => {
        const e = visualizer.dataFreq[i * 35 + 5];
        c.save(); c.translate(w/2, h/2); c.rotate(rotation * (i + 1) * 0.4);
        c.beginPath(); c.arc(0, 0, r + (e/4)*s, 0, Math.PI*2);
        c.fillStyle = `hsla(${currentHue + i*30}, 90%, 60%, ${0.2 + e/500})`;
        c.fill(); c.restore();
    });

    c.font = `900 ${75 + low/5}px sans-serif`;
    c.fillStyle = "white"; c.textAlign = "center"; c.textBaseline = "middle";
    c.shadowBlur = low/2; c.shadowColor = `hsla(${currentHue}, 100%, 50%, 0.9)`;
    c.fillText("S", w / 2, h / 2); c.shadowBlur = 0;

    c.restore();
    raf = requestAnimationFrame(loop);
}

function fitCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', fitCanvas);
fitCanvas();
