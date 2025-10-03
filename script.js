// Sonic Inclusion – minimal visualizer
let ctx, analyser, srcNode, dataFreq, dataTime, raf, audioCtx, usingMic = false;
const canvas = document.getElementById('viz');
const c = canvas.getContext('2d');
const srText = document.getElementById('srText');

const sens = document.getElementById('sens');
const palette = document.getElementById('palette');
const micBtn = document.getElementById('micBtn');
const fileBtn = document.getElementById('fileBtn');
const fileInput = document.getElementById('fileInput');

function ensureCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function setupAnalyser(source) {
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;
  source.connect(analyser);
  analyser.connect(audioCtx.destination); // quiet monitoring (can be reduced)
  dataFreq = new Uint8Array(analyser.frequencyBinCount);
  dataTime = new Uint8Array(analyser.fftSize);
}

function stopAudio() {
  if (srcNode && srcNode.stop) {
    try { srcNode.stop(0); } catch {}
  }
  if (raf) cancelAnimationFrame(raf);
}

async function startMic() {
  ensureCtx();
  stopAudio();
  usingMic = true;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const micSource = audioCtx.createMediaStreamSource(stream);
  setupAnalyser(micSource);
  audioCtx.resume();
  loop();
  srText.textContent = 'Microphone visualisation running.';
}

async function startFile(file) {
  ensureCtx();
  stopAudio();
  usingMic = false;

  const arrayBuf = await file.arrayBuffer();
  const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
  const bufferSource = audioCtx.createBufferSource();
  bufferSource.buffer = audioBuf;
  bufferSource.loop = true;

  setupAnalyser(bufferSource);
  bufferSource.start(0);
  srcNode = bufferSource;
  audioCtx.resume();
  loop();
  srText.textContent = `Playing file: ${file.name}`;
}

function energy(bins, start, end) {
  let sum = 0;
  for (let i = start; i < end; i++) sum += bins[i];
  return sum / (end - start + 1 || 1);
}

function hueFor(pitchIndex, mode) {
  if (mode === 'energy') return (pitchIndex * 1.3) % 360;
  if (mode === 'grayscale') return 0;
  return (pitchIndex * 2.1) % 360; // "hue by pitch" feel
}

function loop() {
  analyser.getByteFrequencyData(dataFreq);
  analyser.getByteTimeDomainData(dataTime);

  const w = canvas.width, h = canvas.height;
  c.clearRect(0, 0, w, h);

  // Background glow with overall energy
  const low = energy(dataFreq, 2, 32);
  const mid = energy(dataFreq, 33, 128);
  const high = energy(dataFreq, 129, 255);

  const total = (low + mid + high) / 3;
  const s = parseFloat(sens.value);
  const glow = Math.min(0.8, (total / 255) * 0.9 * s);

  c.fillStyle = `rgba(124,77,255,${glow})`;
  c.fillRect(0, 0, w, h);

  // Central circles by bands
  const bands = [
    { e: low, r: 70, ix: 24 },
    { e: mid, r: 120, ix: 96 },
    { e: high, r: 170, ix: 180 },
  ];

  bands.forEach((b, i) => {
    const hue = palette.value === 'grayscale' ? 0 : hueFor(b.ix, palette.value);
    const sat = palette.value === 'grayscale' ? 0 : 80;
    const alpha = Math.min(0.95, 0.15 + (b.e / 255) * 0.85 * s);
    c.beginPath();
    c.arc(w / 2, h / 2, b.r + (b.e / 8) * s, 0, Math.PI * 2);
    c.fillStyle = `hsla(${hue}, ${sat}%, 55%, ${alpha})`;
    c.fill();
  });

  // Waveform ribbon
  c.beginPath();
  const step = Math.floor(dataTime.length / w);
  for (let x = 0; x < w; x++) {
    const v = dataTime[x * step] / 255;
    const y = h * (0.5 + (v - 0.5) * 0.8 * s);
    if (x === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.strokeStyle = 'rgba(255,255,255,0.25)';
  c.lineWidth = 2;
  c.stroke();

  // Text overlay for accessibility summary
  c.font = '12px system-ui, sans-serif';
  c.fillStyle = 'rgba(230,230,245,0.7)';
  c.fillText(
    `Energy  L:${low.toFixed(0)}  M:${mid.toFixed(0)}  H:${high.toFixed(0)}  | Mode: ${palette.value}`,
    14, 22
  );

  raf = requestAnimationFrame(loop);
}

/* UI wiring */
micBtn.addEventListener('click', () => startMic().catch(err => {
  alert('Microphone error: ' + err.message);
}));

fileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  if (e.target.files?.[0]) startFile(e.target.files[0]);
});

/* Keyboard shortcuts */
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    if (audioCtx?.state === 'running') { audioCtx.suspend(); srText.textContent = 'Paused.'; }
    else { audioCtx?.resume(); srText.textContent = usingMic ? 'Microphone visualisation running.' : 'Playing file.'; }
    e.preventDefault();
  }
  if (e.key.toLowerCase() === 'm') micBtn.click();
  if (e.key.toLowerCase() === 'f') fileBtn.click();
});

/* Resize handling for crisp canvas */
function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();
