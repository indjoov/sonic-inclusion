/* -----------------------------
   Sonic Inclusion: Audio → Visual
   - Safe framing + auto centering
   - Mic / File / Demo
   - Record
-------------------------------- */

const canvas = document.getElementById("viz");
const ctx = canvas.getContext("2d");

const btnMic = document.getElementById("btnMic");
const btnDemo = document.getElementById("btnDemo");
const fileInput = document.getElementById("fileInput");

const sens = document.getElementById("sens");
const sensVal = document.getElementById("sensVal");
const colorMode = document.getElementById("colorMode");

const btnRecord = document.getElementById("btnRecord");
const btnEngine = document.getElementById("btnEngine");

const engineModal = document.getElementById("engineModal");
const btnInit = document.getElementById("btnInit");
const btnCloseEngine = document.getElementById("btnCloseEngine");

const stAudio = document.getElementById("stAudio");
const stSource = document.getElementById("stSource");
const stRec = document.getElementById("stRec");
const stFps = document.getElementById("stFps");

let audioCtx = null;
let analyser = null;
let gainNode = null;

let sourceNode = null;       // current audio source (mic/file/demo)
let sourceKind = "—";
let playing = false;

let dataFreq = null;
let dataTime = null;

let rafId = null;
let lastT = performance.now();
let fpsSm = 60;

let mediaStream = null;
let fileAudio = null;
let demoOsc = null;

let recorder = null;
let recordChunks = [];
let recordDest = null;
let recording = false;

function openEngine(){
  engineModal.setAttribute("aria-hidden","false");
}
function closeEngine(){
  engineModal.setAttribute("aria-hidden","true");
}
btnEngine.addEventListener("click", openEngine);
btnCloseEngine.addEventListener("click", closeEngine);
engineModal.querySelector(".modalBackdrop").addEventListener("click", closeEngine);
window.addEventListener("keydown", (e)=>{
  if(e.key === "Escape") closeEngine();
});

function setStatus(){
  stAudio.textContent = audioCtx ? (audioCtx.state === "running" ? "Running" : audioCtx.state) : "Not initialized";
  stSource.textContent = sourceKind;
  stRec.textContent = recording ? "On" : "Off";
  stFps.textContent = fpsSm ? fpsSm.toFixed(0) : "—";
}

function ensureAudio(){
  if(audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.82;

  gainNode = audioCtx.createGain();
  gainNode.gain.value = 1.0;

  // chain: source -> gain -> analyser -> destination
  gainNode.connect(analyser);
  analyser.connect(audioCtx.destination);

  // recording destination (captures what we send into gainNode/analyser)
  recordDest = audioCtx.createMediaStreamDestination();
  analyser.connect(recordDest);

  dataFreq = new Uint8Array(analyser.frequencyBinCount);
  dataTime = new Uint8Array(analyser.fftSize);

  setStatus();
}

function stopCurrentSource(){
  playing = false;

  if(demoOsc){
    try { demoOsc.stop(); } catch {}
    demoOsc.disconnect();
    demoOsc = null;
  }

  if(fileAudio){
    fileAudio.pause();
    fileAudio.currentTime = 0;
    fileAudio = null;
  }

  if(mediaStream){
    for(const tr of mediaStream.getTracks()) tr.stop();
    mediaStream = null;
  }

  if(sourceNode){
    try { sourceNode.disconnect(); } catch {}
    sourceNode = null;
  }

  sourceKind = "—";
  setStatus();
}

async function startMic(){
  ensureAudio();
  await audioCtx.resume();

  stopCurrentSource();

  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  sourceNode = audioCtx.createMediaStreamSource(mediaStream);
  sourceNode.connect(gainNode);

  sourceKind = "Microphone";
  playing = true;
  setStatus();
}

async function startFile(file){
  ensureAudio();
  await audioCtx.resume();

  stopCurrentSource();

  // Create <audio> element and hook to WebAudio
  fileAudio = new Audio();
  fileAudio.src = URL.createObjectURL(file);
  fileAudio.crossOrigin = "anonymous";
  fileAudio.loop = true;

  await fileAudio.play();

  sourceNode = audioCtx.createMediaElementSource(fileAudio);
  sourceNode.connect(gainNode);

  sourceKind = `File: ${file.name}`;
  playing = true;
  setStatus();
}

async function startDemo(){
  ensureAudio();
  await audioCtx.resume();

  stopCurrentSource();

  // A small “Kasubo-ish” drone + pulse
  const now = audioCtx.currentTime;

  const oscA = audioCtx.createOscillator();
  oscA.type = "sawtooth";
  oscA.frequency.setValueAtTime(92, now);

  const oscB = audioCtx.createOscillator();
  oscB.type = "triangle";
  oscB.frequency.setValueAtTime(184, now);

  const lfo = audioCtx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(2.1, now);

  const lfoGain = audioCtx.createGain();
  lfoGain.gain.setValueAtTime(0.45, now);

  const mix = audioCtx.createGain();
  mix.gain.setValueAtTime(0.35, now);

  lfo.connect(lfoGain);
  lfoGain.connect(mix.gain);

  oscA.connect(mix);
  oscB.connect(mix);
  mix.connect(gainNode);

  oscA.start();
  oscB.start();
  lfo.start();

  demoOsc = mix; // store mix as “handle”
  demoOsc._parts = [oscA, oscB, lfo, lfoGain, mix];

  sourceKind = "Demo synth";
  playing = true;
  setStatus();
}

function stopDemoOscIfAny(){
  if(!demoOsc) return;
  const parts = demoOsc._parts || [];
  for(const p of parts){
    if(p && typeof p.stop === "function"){
      try{ p.stop(); }catch{}
    }
    if(p && typeof p.disconnect === "function"){
      try{ p.disconnect(); }catch{}
    }
  }
  demoOsc = null;
}

function togglePlay(){
  if(!audioCtx) return;
  if(sourceKind === "—") return;
  if(sourceKind.startsWith("File:") && fileAudio){
    if(fileAudio.paused){ fileAudio.play(); playing = true; }
    else { fileAudio.pause(); playing = false; }
  } else {
    // Mic/Demo: we simulate stop by disconnecting
    if(playing){
      if(sourceNode) { try{ sourceNode.disconnect(); }catch{} }
      stopDemoOscIfAny();
      playing = false;
    } else {
      // user should pick source again; keep it simple
      playing = true;
    }
  }
  setStatus();
}

/* ---------- Recording ---------- */
function startRecording(){
  ensureAudio();
  if(recording) return;
  if(!recordDest) return;

  recordChunks = [];
  recorder = new MediaRecorder(recordDest.stream);
  recorder.ondataavailable = (e)=>{ if(e.data.size) recordChunks.push(e.data); };
  recorder.onstop = ()=>{
    const blob = new Blob(recordChunks, { type: recorder.mimeType || "audio/webm" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `sonic-inclusion-recording-${Date.now()}.webm`;
    a.click();

    setTimeout(()=>URL.revokeObjectURL(url), 15000);
  };
  recorder.start();
  recording = true;
  btnRecord.classList.add("isRec");
  btnRecord.innerHTML = `<span class="recDot"></span> STOP`;
  setStatus();
}
function stopRecording(){
  if(!recording) return;
  recording = false;
  btnRecord.classList.remove("isRec");
  btnRecord.innerHTML = `<span class="recDot"></span> RECORD`;
  try{ recorder.stop(); }catch{}
  setStatus();
}
btnRecord.addEventListener("click", ()=>{
  if(!audioCtx){ openEngine(); return; }
  if(!recording) startRecording();
  else stopRecording();
});

/* ---------- UI events ---------- */
btnInit.addEventListener("click", ()=>{
  ensureAudio();
  audioCtx.resume();
  closeEngine();
  setStatus();
});

btnMic.addEventListener("click", async ()=>{
  try{ await startMic(); } catch(err){ alert("Mic error: " + err.message); }
});
btnDemo.addEventListener("click", async ()=>{
  try{ await startDemo(); } catch(err){ alert("Demo error: " + err.message); }
});
fileInput.addEventListener("change", async (e)=>{
  const f = e.target.files && e.target.files[0];
  if(!f) return;
  try{ await startFile(f); } catch(err){ alert("File error: " + err.message); }
  e.target.value = "";
});

sens.addEventListener("input", ()=>{
  sensVal.textContent = (sens.value/100).toFixed(2) + "×";
});

/* ---------- Keyboard ---------- */
window.addEventListener("keydown", (e)=>{
  if(e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;

  if(e.code === "Space"){
    e.preventDefault();
    togglePlay();
  } else if(e.key.toLowerCase() === "m"){
    startMic().catch(()=>{});
  } else if(e.key.toLowerCase() === "d"){
    startDemo().catch(()=>{});
  } else if(e.key.toLowerCase() === "f"){
    fileInput.click();
  }
});

/* ---------- Canvas resize (safe framing) ---------- */
function resizeCanvas(){
  const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if(canvas.width !== w || canvas.height !== h){
    canvas.width = w;
    canvas.height = h;
  }
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

/* ---------- Color helpers ---------- */
function colorForBin(i, bins, mode){
  if(mode === "mono") return "rgba(220,220,220,0.85)";
  if(mode === "single") return "rgba(255,220,0,0.85)";

  if(mode === "fire"){
    const t = i / bins;
    const hue = 10 + 35 * t;     // red->orange
    return `hsla(${hue}, 90%, 55%, 0.90)`;
  }
  if(mode === "ice"){
    const t = i / bins;
    const hue = 175 + 45 * t;    // cyan->blue
    return `hsla(${hue}, 85%, 60%, 0.90)`;
  }

  // pitch-based
  const t = i / bins;
  const hue = 60 + 240 * t;      // yellow->purple
  return `hsla(${hue}, 95%, 58%, 0.90)`;
}

function glowColor(mode){
  if(mode === "mono") return "rgba(255,255,255,.18)";
  if(mode === "single") return "rgba(255,220,0,.22)";
  if(mode === "fire") return "rgba(255,70,0,.20)";
  if(mode === "ice") return "rgba(0,220,255,.20)";
  return "rgba(180,120,255,.18)";
}

/* ---------- Visualization (safe framing + centered) ---------- */
function loop(){
  resizeCanvas();

  const W = canvas.width;
  const H = canvas.height;

  // “safe framing”: keep a padding so nothing touches rounded corners
  const minDim = Math.min(W, H);
  const pad = minDim * 0.11; // 11% padding
  const cx = W * 0.5;
  const cy = H * 0.5;

  const maxR = (minDim * 0.5) - pad;
  const ringMin = maxR * 0.36; // base ring size
  const ringSpan = maxR * 0.60;

  // background fade
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0,0,W,H);

  // soft vignette
  const vg = ctx.createRadialGradient(cx,cy, maxR*0.15, cx,cy, maxR*1.08);
  vg.addColorStop(0, "rgba(255,255,255,0.04)");
  vg.addColorStop(1, "rgba(0,0,0,0.82)");
  ctx.fillStyle = vg;
  ctx.fillRect(0,0,W,H);

  const mode = colorMode.value;
  const sensMul = (sens.value / 100) * 2.2 + 0.15;

  // no audio yet: idle ring
  if(!audioCtx || !analyser){
    ctx.save();
    ctx.lineWidth = Math.max(2, minDim * 0.004);
    ctx.strokeStyle = "rgba(160,120,255,0.85)";
    ctx.shadowBlur = 22;
    ctx.shadowColor = "rgba(160,120,255,0.25)";
    ctx.beginPath();
    ctx.arc(cx,cy, ringMin, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();

    requestAnimationFrame(loop);
    return;
  }

  analyser.getByteFrequencyData(dataFreq);
  analyser.getByteTimeDomainData(dataTime);

  // measure energy
  let energy = 0;
  for(let i=0;i<120;i++){
    energy += dataFreq[i];
  }
  energy = (energy / 120) / 255; // 0..1

  // FPS status
  const t = performance.now();
  const dt = Math.max(0.001, (t - lastT) / 1000);
  lastT = t;
  const fps = 1 / dt;
  fpsSm = fpsSm * 0.92 + fps * 0.08;
  setStatus();

  // draw rings (vinyl grooves)
  const bins = 70;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = Math.max(1.2, minDim * 0.0018);
  ctx.shadowBlur = 18;
  ctx.shadowColor = glowColor(mode);

  for(let i=0;i<bins;i++){
    const v = dataFreq[i] / 255; // 0..1
    const r = ringMin + ringSpan * (i/(bins-1)) + v * 52 * sensMul;

    // clamp radius to safe framing
    const rr = Math.min(maxR, Math.max(0, r));

    ctx.strokeStyle = colorForBin(i, bins, mode);
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI*2);
    ctx.stroke();
  }
  ctx.restore();

  // inner “record label” dark disk
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.arc(cx, cy, ringMin * 0.78, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  // Particles / starburst (only when energy is present)
  const burst = Math.max(0, (energy - 0.10)) * 1.8;
  if(burst > 0.02){
    const spokes = 90;
    const dotCount = 7 + Math.floor(18 * burst);
    const baseHueColor = colorForBin(18, bins, mode);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowBlur = 20;
    ctx.shadowColor = glowColor(mode);

    for(let s=0;s<spokes;s++){
      const a = (s/spokes) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);

      // pick a “frequency bin” for variation
      const bi = s % bins;
      const vv = (dataFreq[bi] / 255) * sensMul;

      // max length stays inside safe frame
      const len = (ringMin*0.15) + (maxR*0.85) * Math.min(1, (burst*0.75 + vv*0.35));

      for(let d=0; d<dotCount; d++){
        const t = d / (dotCount-1);
        const rr = (ringMin*0.18) + len * t;

        // safe clamp
        const rSafe = Math.min(maxR, rr);

        const x = cx + ca * rSafe;
        const y = cy + sa * rSafe;

        const alpha = (1 - t) * (0.55 + 0.45*burst);
        const size = (minDim * 0.0032) * (1.0 + burst*1.4) * (0.65 + 0.6*(1-t));

        ctx.fillStyle = baseHueColor.replace("0.90", String(alpha));
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI*2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------- Initial overlay behavior ---------- */
openEngine();
setStatus();
