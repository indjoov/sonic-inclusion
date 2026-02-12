import * as THREE from "three";
import { AudioEngine } from "./audio/AudioEngine.js";

// AI Imports (TensorFlow.js)
import * as tf from 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.15.0/dist/tf.es2017.js';
import * as speechCommands from 'https://cdn.jsdelivr.net/npm/@tensorflow-models/speech-commands@0.5.4/dist/speech-commands.es2017.js';

// Postprocessing
import { EffectComposer } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "https://unpkg.com/three@0.160.0/examples/jsm/shaders/FXAAShader.js";
import { GlitchPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/GlitchPass.js";
import { RGBShiftShader } from "https://unpkg.com/three@0.160.0/examples/jsm/shaders/RGBShiftShader.js";
import { AfterimagePass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/AfterimagePass.js";

/* ================= BASIC SETUP ================= */

const canvas = document.getElementById("viz");
const stageEl = canvas.closest(".stage");
const srText = document.getElementById("srText");

// Inject tech font safely
const fontLink = document.createElement("link");
fontLink.href = "https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;700&display=swap";
fontLink.rel = "stylesheet";
document.head.appendChild(fontLink);

// Create Inputs safely
const fileInput = document.createElement("input");
fileInput.id = "fileInput"; fileInput.type = "file"; fileInput.accept = "audio/*"; fileInput.hidden = true;
document.body.appendChild(fileInput);

const sigilInput = document.createElement("input");
sigilInput.type = "file"; sigilInput.accept = "image/png, image/jpeg, image/svg+xml"; sigilInput.hidden = true;
document.body.appendChild(sigilInput);

if (srText) {
  srText.setAttribute("aria-live", "polite");
  srText.setAttribute("role", "status");
}
function setStatus(msg) {
  if (srText) srText.textContent = msg;
}

/* ================= OVERLAY ================= */

const overlay = document.createElement("div");
overlay.id = "intro-overlay";
overlay.style.cssText = `
  position:fixed; inset:0; z-index:3000;
  display:flex; align-items:center; justify-content:center;
  padding: calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));
  background: rgba(0,0,0,0.92); cursor:pointer;
`;
overlay.innerHTML = `
  <div style="width: min(92vw, 560px); text-align:center; color:white; font-family:system-ui, -apple-system, sans-serif; background: rgba(5,5,5,0.94); padding: clamp(22px, 6vw, 56px); border-radius: 22px; border: 1px solid rgba(0,212,255,0.55); box-shadow: 0 0 70px rgba(0,212,255,.22);">
    <h1 style="margin:0 0 12px; letter-spacing: clamp(6px, 2.6vw, 14px); font-size: clamp(22px, 6.5vw, 44px); line-height: 1.05;">SONIC<br/>INCLUSION</h1>
    <p style="margin:0; opacity:.65; letter-spacing: clamp(2px, 1.2vw, 6px); font-size: clamp(11px, 3.2vw, 14px);">CLICK TO INITIALIZE</p>
  </div>
`;
document.body.appendChild(overlay);

/* ================= GLOBAL STATE ================= */

let engine = null; 
let raf = null; let analyser = null; let dataFreq = null; let dataTime = null;
let inputGain = null; let monitorGain = null;
let currentMode = "idle"; let bufferSrc = null; let micStream = null; let micSourceNode = null;
let audioRecordDest = null;

// AI State
let recognizer = null;
let isAiListening = false;
let aiLabel = "--";
let aiEnabled = false;

// Pitch Detection State
const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
let frameCounter = 0; 

// Three.js State
let renderer = null; let scene = null; let camera = null; let composer = null;
let bloomPass = null; let fxaaPass = null; let world = null; let starPoints = null;  
let morphMesh = null; let coreLight = null; let rgbShiftPass = null; let glitchPass = null;      
let afterimagePass = null; 
let nebulaMaterial = null;

let sparkPool = []; let sparkCursor = 0; let baseFov = 55;           
let starGeo = null; // Defined globally to prevent crash
let sigilGroup = null; let sigilBase = null; let sigilGlow = null;
let sigilBaseTex = null; let sigilGlowTex = null;
let ringPool = []; let ringCursor = 0; let ghostPool = []; let ghostCursor = 0;

let reducedMotion = false; let micMonitor = false; let micMonitorVol = 0.35; let feedbackMuted = false;
let hapticsEnabled = false;
let tunerEnabled = false; 
let lastVibration = 0;

let currentCameraMode = 0;
const camTargetPos = new THREE.Vector3();
const camTargetLook = new THREE.Vector3();

// Globals for UI
let enginePanel = null;
let hud = null;
let recBtn = null;
let tunerContainer = null;
let tunerNote = null;
let tunerOctave = null;
let tunerBar = null;

function applyMicMonitorGain() {
  if (!monitorGain) return;
  monitorGain.gain.value = currentMode === "mic" && micMonitor && !feedbackMuted ? micMonitorVol : 0;
}

/* ================= INITIALIZATION ================= */

async function initEngine() {
  if (engine) return; 
  
  overlay.style.display = "none"; 
  setStatus("⏳ Initializing...");

  try {
    createTunerUI();
    createEnginePanel(); 
    createHUDButtons(); 

    initThree();
    if (!raf) loop();

    engine = new AudioEngine();
    await engine.init();
    if (engine.ctx && engine.ctx.state === 'suspended') { await engine.ctx.resume(); }

    analyser = engine.ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.85;
    dataFreq = new Uint8Array(analyser.frequencyBinCount);
    dataTime = new Float32Array(analyser.fftSize);

    inputGain = engine.ctx.createGain(); monitorGain = engine.ctx.createGain(); monitorGain.gain.value = 0;
    inputGain.connect(analyser); inputGain.connect(monitorGain); monitorGain.connect(engine.master);

    audioRecordDest = engine.ctx.createMediaStreamDestination();
    try { engine.master.connect(audioRecordDest); } catch (e) {}

    // Load AI in background
    initTensorFlow();

    setStatus("✅ Ready");
  } catch (e) {
    console.error("Initialization failed:", e);
    alert("Error initializing: " + e.message);
    setStatus("⚠️ Init Error");
  }
}

overlay.addEventListener("click", () => { initEngine(); });

/* ================= TENSORFLOW AI ================= */

async function initTensorFlow() {
    console.log("Loading AI Model...");
    try {
        recognizer = speechCommands.create('BROWSER_FFT');
        await recognizer.ensureModelLoaded();
        console.log("AI Model Loaded");
    } catch (err) {
        console.error("AI Load Failed:", err);
    }
}

async function startAiListening() {
    if (!recognizer) return;
    if (isAiListening) return;
    
    setStatus("🧠 AI Listening...");
    recognizer.listen(result => {
        const scores = result.scores; 
        const labels = recognizer.wordLabels();
        const maxScoreIndex = scores.indexOf(Math.max(...scores));
        const label = labels[maxScoreIndex];
        
        if (label === '_background_noise_') {
            aiLabel = "NOISE";
        } else {
            aiLabel = "SPEECH DETECTED"; // Any word triggers speech
        }
    }, {
        includeSpectrogram: false,
        probabilityThreshold: 0.75,
        invokeCallbackOnNoiseAndUnknown: true,
        overlapFactor: 0.50
    });
    isAiListening = true;
}

function stopAiListening() {
    if (recognizer && isAiListening) {
        recognizer.stopListening();
        isAiListening = false;
        aiLabel = "--";
        setStatus("🧠 AI Stopped");
    }
}

/* ================= UI CREATION ================= */

function createTunerUI() {
    const existing = document.getElementById("si-tuner");
    if(existing) existing.remove();

    const tunerEl = document.createElement("div");
    tunerEl.id = "si-tuner";
    tunerEl.style.cssText = `
        position: fixed; bottom: 140px; left: 50%; transform: translateX(-50%);
        width: 260px; text-align: center;
        z-index: 1000; pointer-events: none;
        font-family: 'Rajdhani', sans-serif; 
        opacity: 0; transition: opacity 0.3s ease;
    `;
    
    tunerEl.innerHTML = `
        <div style="font-size: 42px; font-weight: 700; color: #fff; text-shadow: 0 0 15px rgba(0,212,255,0.8); line-height: 1;">
            <span id="tuner-note">--</span><span id="tuner-octave" style="font-size: 18px; opacity: 0.6; vertical-align: top;"></span>
        </div>
        <div style="font-size: 12px; color: rgba(255,255,255,0.5); letter-spacing: 2px; margin-top: 4px;">PITCH DETECT</div>
        
        <div style="margin-top: 10px; width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; position: relative; overflow: hidden;">
            <div id="tuner-bar" style="position: absolute; left: 50%; top: 0; bottom: 0; width: 4px; background: #00d4ff; box-shadow: 0 0 10px #00d4ff; transform: translateX(-50%); transition: transform 0.1s linear;"></div>
            <div style="position: absolute; left: 50%; top:0; bottom:0; width: 1px; background: #fff; opacity: 0.3;"></div>
        </div>

        <div id="ai-display" style="margin-top: 15px; font-size: 16px; font-weight: bold; color: #ffeb3b; text-shadow: 0 0 10px #ffeb3b; display:none; border-top: 1px solid rgba(255,235,59,0.3); padding-top: 8px;">
            AI: <span id="ai-text">--</span>
        </div>
    `;
    document.body.appendChild(tunerEl);
    
    tunerNote = document.getElementById("tuner-note");
    tunerOctave = document.getElementById("tuner-octave");
    tunerBar = document.getElementById("tuner-bar");
    tunerContainer = document.getElementById("si-tuner");
}

function createHUDButtons() {
    const existingHud = document.getElementById("si-hud");
    if(existingHud) existingHud.remove();

    hud = document.createElement("div");
    hud.id = "si-hud";

    recBtn = document.createElement("button");
    recBtn.id = "si-recBtn"; recBtn.className = "hud-btn"; recBtn.type = "button"; recBtn.innerHTML = "⏺ RECORD";
    
    recBtn.addEventListener("click", async () => { if (!recording) await startRecording(); else stopRecording(); });

    const hudRightControls = document.createElement("div");
    hudRightControls.style.cssText = "display: flex; gap: 10px; pointer-events: auto;";

    const fsBtn = document.createElement("button");
    fsBtn.id = "si-fsBtn"; fsBtn.className = "hud-btn"; fsBtn.type = "button"; fsBtn.textContent = "📺 PROJECTION";
    fsBtn.addEventListener("click", toggleFullscreen);

    const engineToggle = document.createElement("button");
    engineToggle.id = "si-engineToggle"; engineToggle.className = "hud-btn"; engineToggle.type = "button"; engineToggle.textContent = "⚙️ ENGINE";
    
    let engineOpen = false;
    engineToggle.addEventListener("click", () => {
        engineOpen = !engineOpen;
        if(engineOpen) {
            if(enginePanel) {
                enginePanel.classList.add('open');
                enginePanel.style.display = "block";
            }
        } else {
            if(enginePanel) {
                enginePanel.classList.remove('open');
                setTimeout(() => { if(!engineOpen) enginePanel.style.display = "none"; }, 400);
            }
        }
    });

    hudRightControls.appendChild(fsBtn); hudRightControls.appendChild(engineToggle);
    hud.appendChild(recBtn); hud.appendChild(hudRightControls); document.body.appendChild(hud);
}

function createEnginePanel() {
    const existing = document.getElementById("si-enginePanel");
    if(existing) existing.remove();

    enginePanel = document.createElement("div");
    enginePanel.id = "si-enginePanel";
    enginePanel.style.cssText = `position: fixed; left: 16px; right: 16px; bottom: calc(74px + env(safe-area-inset-bottom)); z-index: 2001; max-width: calc(100vw - 32px); width: 100%; margin: 0 auto; background: rgba(10,10,10,0.92); border: 1px solid rgba(0,212,255,0.65); border-radius: 18px; padding: 14px; color: #fff; font-family: system-ui, -apple-system, sans-serif; backdrop-filter: blur(12px); box-shadow: 0 18px 60px rgba(0,0,0,0.55); display: none; box-sizing: border-box; overflow-y: auto; max-height: 70vh;`;

    enginePanel.innerHTML = `
      <div class="panel-header" style="width: 100%; box-sizing: border-box;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="panel-icon-wrap">⚙️</div>
          <div><div class="panel-title">ENGINE</div><div class="panel-subtitle">Swipe down to close</div></div>
        </div>
        <button id="si-engineClose" type="button" class="close-btn">✕</button>
      </div>
      
      <div class="panel-grid" style="width: 100%; box-sizing: border-box; overflow-x: hidden;">
        
        <div style="display:flex; flex-direction: column; gap: 8px; margin-bottom: 10px;">
            <button id="panel-demoBtn" type="button" style="background: rgba(0,212,255,0.2); border: 1px solid rgba(0,212,255,0.6); padding: 10px; border-radius: 12px; color: #fff; cursor: pointer; font-weight: bold;">✨ Play Kasubo Demo</button>
            <div style="display:flex; gap: 8px;">
                <button id="panel-micBtn" type="button" style="flex:1; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 10px; border-radius: 12px; color: #fff; cursor: pointer; font-weight: bold;">🎙️ Mic</button>
                <button id="panel-fileBtn" type="button" style="flex:1; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 10px; border-radius: 12px; color: #fff; cursor: pointer; font-weight: bold;">📁 File</button>
            </div>
        </div>

        <div class="chapter-box" style="width: 100%; box-sizing: border-box;">
          <div class="chapter-title">CHAPTER</div>
          <div class="chapter-btns">
            <button id="chapInv" type="button" class="chap-btn">INVOCATION</button>
            <button id="chapPos" type="button" class="chap-btn">POSSESSION</button>
            <button id="chapAsc" type="button" class="chap-btn">ASCENSION</button>
          </div>
        </div>
        
        <label class="panel-label" style="display:block; max-width:100%; box-sizing:border-box;">COLOR MODE
            <select id="palette-panel" style="width:100%; margin-top:6px; padding: 8px; border-radius: 8px; background: rgba(0,0,0,0.5); color: white; border: 1px solid rgba(255,255,255,0.2);">
                <option value="hue" selected>Hue (Single Color)</option>
                <option value="energy">Hue by energy</option>
                <option value="grayscale">High-contrast grayscale</option>
            </select>
        </label>

        <div style="border-top: 1px solid rgba(255,255,255,0.1); margin-top: 12px; padding-top: 12px;">
            <div style="font-size: 10px; opacity: 0.6; margin-bottom: 8px; letter-spacing: 1px;">ANALYSIS TOOLS</div>
            <div style="display:flex; flex-direction:column; gap:8px; width:100%;">
                <label class="checkbox-row" style="color: #00d4ff; font-weight: bold;"><input id="tunerToggle" type="checkbox">Chromatic Tuner</label>
                <label class="checkbox-row" style="color: #ffeb3b; font-weight: bold;"><input id="aiToggle" type="checkbox">AI Speech Detect (Beta)</label>
                <label class="checkbox-row"><input id="hapticsToggle" type="checkbox">HAPTICS (Mobile)</label>
            </div>
        </div>
        
        <label class="panel-label" style="display:block; max-width:100%; box-sizing:border-box; margin-top:12px;">LIGHT TRAILS<input id="trailsAmount" type="range" min="0" max="0.99" step="0.01" value="0" style="width:100%; box-sizing:border-box; margin-top:6px;"></label>
        <label class="checkbox-row" style="max-width:100%; margin-top:8px;"><input id="reducedMotion" type="checkbox">Reduced Motion</label>
        
        <div class="mic-section" style="width: 100%; box-sizing: border-box;">
          <label class="checkbox-row"><input id="micMonitor" type="checkbox"><span>Mic Monitor</span></label>
          <label class="panel-label" style="display:block; max-width:100%; box-sizing:border-box; margin-top:10px;">Monitor Volume<input id="micMonitorVol" type="range" min="0" max="100" value="35" style="width:100%; box-sizing:border-box; margin-top:6px;"></label>
          <div id="feedbackWarn">🔇 Feedback risk detected — mic monitor muted</div>
        </div>
        <div id="midiStatus" style="max-width:100%;">🎹 MIDI: Waiting...</div>
      </div>
    `;
    document.body.appendChild(enginePanel);
    
    // Bind Events 
    enginePanel.querySelector("#si-engineClose")?.addEventListener("click", () => {
        enginePanel.classList.remove('open');
        setTimeout(() => { enginePanel.style.display = "none"; }, 400);
    });
    
    enginePanel.querySelector("#chapInv")?.addEventListener("click", () => applyChapter("INVOCATION"));
    enginePanel.querySelector("#chapPos")?.addEventListener("click", () => applyChapter("POSSESSION"));
    enginePanel.querySelector("#chapAsc")?.addEventListener("click", () => applyChapter("ASCENSION"));
    
    enginePanel.querySelector("#reducedMotion")?.addEventListener("change", (e) => reducedMotion = !!e.target.checked);
    enginePanel.querySelector("#hapticsToggle")?.addEventListener("change", (e) => {
        hapticsEnabled = !!e.target.checked;
        if (hapticsEnabled && navigator.vibrate) navigator.vibrate(20); 
    });
    
    // Tuner Toggle
    enginePanel.querySelector("#tunerToggle")?.addEventListener("change", (e) => {
        tunerEnabled = !!e.target.checked;
        if(tunerContainer) tunerContainer.style.opacity = (tunerEnabled || aiEnabled) ? 1 : 0;
    });

    // AI Toggle
    enginePanel.querySelector("#aiToggle")?.addEventListener("change", (e) => {
        aiEnabled = !!e.target.checked;
        const aiDisplay = document.getElementById("ai-display");
        if(aiEnabled) {
            if(aiDisplay) aiDisplay.style.display = "block";
            if(tunerContainer) tunerContainer.style.opacity = 1; // Force HUD open
            startAiListening();
        } else {
            if(aiDisplay) aiDisplay.style.display = "none";
            if(!tunerEnabled && tunerContainer) tunerContainer.style.opacity = 0;
            stopAiListening();
        }
    });
    
    const micSwitch = enginePanel.querySelector("#micMonitor"); 
    const micVol = enginePanel.querySelector("#micMonitorVol"); 
    
    if(micSwitch) {
        micSwitch.checked = micMonitor; 
        micSwitch.addEventListener("change", (e) => {
            micMonitor = !!e.target.checked; 
            feedbackMuted = false; 
            applyMicMonitorGain(); 
            setStatus(micMonitor ? "🎙️ Mic monitor ON" : "🎙️ Mic monitor OFF");
        });
    }
    if(micVol) {
        micVol.value = String(Math.round(micMonitorVol * 100));
        micVol.addEventListener("input", (e) => {
            micMonitorVol = Math.max(0, Math.min(1, parseInt(e.target.value, 10) / 100));
            applyMicMonitorGain();
        });
    }
    
    enginePanel.querySelector("#panel-demoBtn")?.addEventListener("click", () => playDemo("media/kasubo hoerprobe.mp3"));
    enginePanel.querySelector("#panel-fileBtn")?.addEventListener("click", async () => { fileInput.click(); });
    
    const panelMicBtn = enginePanel.querySelector("#panel-micBtn");
    panelMicBtn?.addEventListener("click", async (e) => {
        if (currentMode === "mic") { await stopAll({ suspend: true }); setStatus("⏹ Mic stopped"); return; }
        try { 
            await stopAll({ suspend: false }); setStatus("⏳ Requesting mic…");
            micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); 
            if (engine.ctx && engine.ctx.state === 'suspended') { await engine.ctx.resume(); }
            currentMode = "mic"; micSourceNode = engine.ctx.createMediaStreamSource(micStream); micSourceNode.connect(inputGain);
            e.target.style.background = "rgba(255, 45, 85, 0.4)"; e.target.style.borderColor = "#ff2d55";
            setStatus("🎙️ Mic active");
        } catch (err) { setStatus("❌ Mic error"); console.error(err); await stopAll({ suspend: true }); }
    });
    
    enginePanel.querySelector("#customSigilBtn")?.addEventListener("click", () => sigilInput.click());
    
    let touchStartY = null;
    enginePanel.addEventListener("touchstart", (e) => { touchStartY = e.touches?.[0]?.clientY ?? null; }, { passive: true });
    enginePanel.addEventListener("touchmove", (e) => {
      if (touchStartY == null) return;
      const dy = (e.touches?.[0]?.clientY ?? touchStartY) - touchStartY;
      if (dy > 50) { setEngineOpen(false); touchStartY = null; }
    }, { passive: true });
}

/* ================= THREE INIT ================= */
function initThree() {
  if (renderer) return;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 1); renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene(); scene.add(new THREE.AmbientLight(0xffffff, 0.4)); 

  camera = new THREE.PerspectiveCamera(baseFov, 1, 0.1, 260); camera.position.set(0, 0, 18);
  
  initNebulaBackground(); 

  coreLight = new THREE.PointLight(0x00d4ff, 0, 50); coreLight.position.set(0, 0, 0); scene.add(coreLight);
  world = new THREE.Group(); scene.add(world);
  starPoints = makeStars(1900, 120); scene.add(starPoints);

  makeResponsiveMorphingCage();
  initRings(); initGhosts(); initSparks(); loadSigilLayers("media/indjoov-sigil.svg", false);

  const rt = new THREE.WebGLRenderTarget(1, 1, { samples: renderer.capabilities.isWebGL2 ? 4 : 0 });
  composer = new EffectComposer(renderer, rt); 
  composer.addPass(new RenderPass(scene, camera));
  
  afterimagePass = new AfterimagePass();
  composer.addPass(afterimagePass);

  const rect = (stageEl || canvas).getBoundingClientRect();
  bloomPass = new UnrealBloomPass(new THREE.Vector2(Math.max(1, rect.width), Math.max(1, rect.height)), 1.0, 0.55, 0.12);
  composer.addPass(bloomPass);

  rgbShiftPass = new ShaderPass(RGBShiftShader); rgbShiftPass.uniforms['amount'].value = 0.0015; composer.addPass(rgbShiftPass);
  glitchPass = new GlitchPass(); glitchPass.goWild = false; glitchPass.enabled = false; composer.addPass(glitchPass);
  fxaaPass = new ShaderPass(FXAAShader); composer.addPass(fxaaPass);

  fitRendererToStage(); applyChapter(chapter); initMIDI();
}

/* ================= FULLSCREEN TOGGLE ================= */
let isFullscreen = false;
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => { console.warn(`Error: ${err.message}`); });
    document.querySelector('.site-header')?.style.setProperty('display', 'none'); 
    document.querySelector('.site-footer')?.style.setProperty('display', 'none');
    if(hud) hud.style.display = 'none'; 
    if(enginePanel) {
        enginePanel.classList.remove('open');
        enginePanel.style.display = "none";
    }
    stageEl.classList.add('fullscreen-active');
    document.body.style.overflow = "hidden"; 
    isFullscreen = true; setStatus("📺 Entered projection mode");
  } else { document.exitFullscreen(); resetUI(); }
}
function resetUI() {
  document.querySelector('.site-header')?.style.setProperty('display', 'block'); 
  document.querySelector('.site-footer')?.style.setProperty('display', 'block');
  if(hud) hud.style.display = 'flex'; 
  stageEl.classList.remove('fullscreen-active');
  document.body.style.overflow = "auto"; 
  isFullscreen = false; fitRendererToStage();
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) resetUI(); setTimeout(fitRendererToStage, 100); });

/* ================= GEOMETRY ================= */
function makeStars(count, spread) {
  starGeo = new THREE.BufferGeometry(); const positions = new Float32Array(count * 3); const velocities = []; 
  for (let i = 0; i < count; i++) {
    const ix = i * 3; positions[ix] = (Math.random() - 0.5) * spread * 1.5; positions[ix + 1] = (Math.random() - 0.5) * spread * 1.5;
    positions[ix + 2] = (Math.random() - 0.5) * spread * 2; velocities.push(0.05 + Math.random() * 0.25);
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0x8feaff, size: 0.08, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
  starGeo.userData = { velocities: velocities, spread: spread }; return new THREE.Points(starGeo, mat);
}
function updateStars(delta) {
  if (!starPoints || !starGeo) return;
  const positions = starGeo.attributes.position.array; const vels = starGeo.userData.velocities; const spread = starGeo.userData.spread;
  let warpSpeed = 1 + (bassSm * 8); if (isNaN(warpSpeed)) warpSpeed = 1;
  for (let i = 0; i < vels.length; i++) {
    const ix = i * 3; positions[ix + 2] += vels[i] * warpSpeed * delta * 20;
    if (positions[ix + 2] > 20) {
      positions[ix + 2] = -150; positions[ix] = (Math.random() - 0.5) * spread * 1.5; positions[ix + 1] = (Math.random() - 0.5) * spread * 1.5;
    }
  }
  starGeo.attributes.position.needsUpdate = true;
}

function makeResponsiveMorphingCage() {
  if (morphMesh) { world.remove(morphMesh); morphMesh.geometry.dispose(); }
  const baseGeo = new THREE.IcosahedronGeometry(5.0, 10); const posAttribute = baseGeo.attributes.position;
  const cubePositions = []; const wavePositions = []; const spikePositions = []; const vec = new THREE.Vector3();
  for (let i = 0; i < posAttribute.count; i++) {
    vec.fromBufferAttribute(posAttribute, i);
    const norm = vec.clone().normalize(); const maxVal = Math.max(Math.abs(norm.x), Math.abs(norm.y), Math.abs(norm.z));
    const cubeVec = norm.divideScalar(maxVal).multiplyScalar(4.5); cubePositions.push(cubeVec.x, cubeVec.y, cubeVec.z);
    const waveScale = 1.0 + 0.45 * (Math.sin(vec.x * 3.0) + Math.cos(vec.y * 3.0) + Math.sin(vec.z * 3.0));
    const waveVec = vec.clone().multiplyScalar(waveScale); wavePositions.push(waveVec.x, waveVec.y, waveVec.z);
    const noise = Math.sin(vec.x * 12.0) * Math.cos(vec.y * 12.0) * Math.sin(vec.z * 12.0);
    const spikeScale = 1.0 + Math.max(0, noise) * 5.0; 
    const spikeVec = vec.clone().multiplyScalar(spikeScale); spikePositions.push(spikeVec.x, spikeVec.y, spikeVec.z);
  }
  baseGeo.morphAttributes.position = [ new THREE.Float32BufferAttribute(cubePositions, 3), new THREE.Float32BufferAttribute(wavePositions, 3), new THREE.Float32BufferAttribute(spikePositions, 3) ];
  const mat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, wireframe: true, transparent: true, opacity: 0.8, morphTargets: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  morphMesh = new THREE.Mesh(baseGeo, mat); world.add(morphMesh);
}

function initRings() {
  ringPool.forEach(r => { world?.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); });
  ringPool = []; ringCursor = 0;
  for (let i = 0; i < 8; i++) {
    const g = new THREE.RingGeometry(2.6, 2.9, 120); const m = new THREE.MeshBasicMaterial({ color: 0x8feaff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const mesh = new THREE.Mesh(g, m); mesh.position.set(0, 0, 0.25); mesh.rotation.set(-0.18, 0.22, 0);
    world?.add(mesh); ringPool.push({ mesh, t: 999, life: 0.55, baseScale: 1.0 });
  }
}
function triggerRingPulse(intensity = 1) {
  if (!ringPool.length || isNaN(intensity)) return; 
  const r = ringPool[ringCursor % ringPool.length]; ringCursor++; r.t = 0; r.life = 0.48; r.baseScale = 0.92 + 0.22 * intensity;
  r.mesh.material.color.setHex((Math.random() < 0.5) ? 0x00d4ff : 0x7c4dff); r.mesh.material.opacity = 0.85 * P.ringStrength;
}

function initGhosts() {
  ghostPool.forEach(g => { world?.remove(g.group); g.group.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); });
  ghostPool = []; ghostCursor = 0;
  for (let i = 0; i < 18; i++) {
    const group = new THREE.Group(); group.visible = false; group.position.set(0, 0, 0.2); group.rotation.set(-0.18, 0.22, 0);
    const plane = new THREE.PlaneGeometry(6.9, 6.9);
    const inkMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.NormalBlending });
    const glowMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, color: new THREE.Color(0x00d4ff), depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    const glow = new THREE.Mesh(plane, glowMat); glow.scale.setScalar(1.08); const ink = new THREE.Mesh(plane, inkMat);
    group.add(glow, ink); world?.add(group); ghostPool.push({ group, glow, ink, t: 999, life: 0.45, vx: 0, vy: 0, spin: 0, baseScale: 1 });
  }
}
function spawnGhostBurst(count = 3, intensity = 1, snapFlash = 1) {
  if (!ghostPool.length || !sigilBaseTex || !sigilGlowTex || isNaN(intensity)) return; 
  const useCount = Math.max(1, Math.min(6, count));
  for (let k = 0; k < useCount; k++) {
    const g = ghostPool[ghostCursor % ghostPool.length]; ghostCursor++;
    g.t = 0; g.life = 0.28 + Math.random() * 0.25; g.vx = (Math.random() - 0.5) * (0.22 + intensity * 0.25); g.vy = (Math.random() - 0.5) * (0.18 + intensity * 0.22); g.spin = (Math.random() - 0.5) * (0.12 + intensity * 0.18);
    g.baseScale = 1.02 + k * 0.04; g.group.visible = true; g.group.position.set(0, 0, 0.21 + 0.01 * k); g.group.rotation.set(-0.18, 0.22, 0);
    g.ink.material.map = sigilBaseTex; g.glow.material.map = sigilGlowTex; g.glow.material.color.copy(new THREE.Color(0x00d4ff).lerp(new THREE.Color(0x7c4dff), Math.min(1, 0.45 + snapFlash * 0.65)));
    g.ink.material.opacity = 0.22 + 0.20 * intensity; g.glow.material.opacity = 0.40 + 0.55 * snapFlash; g.glow.scale.setScalar(1.12); g.group.scale.setScalar(g.baseScale);
  }
}

function initSparks() {
  const sparkGeo = new THREE.TetrahedronGeometry(0.15, 0); const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
  for (let i = 0; i < 150; i++) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat.clone()); mesh.visible = false; scene.add(mesh);
    sparkPool.push({ mesh: mesh, active: false, life: 0, maxLife: 0, velocity: new THREE.Vector3(), spin: new THREE.Vector3() });
  }
}
function fireSparks(intensity, sourceMesh) {
  if (!sparkPool.length || isNaN(intensity)) return; 
  const count = Math.floor(intensity * 15); 
  for (let i = 0; i < count; i++) {
    const s = sparkPool[sparkCursor % sparkPool.length]; sparkCursor++;
    s.active = true; s.life = 0; s.maxLife = 0.4 + Math.random() * 0.4; 
    if (sourceMesh) {
        const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        const spikeInf = sourceMesh.morphTargetInfluences[2] || 0;
        const currentRadius = 5.0 * sourceMesh.scale.x * (1.0 + (spikeInf * 0.85)); 
        s.mesh.position.copy(sourceMesh.position).add(dir.clone().multiplyScalar(currentRadius));
        const speed = 25 + (intensity * 40); s.velocity.copy(dir).multiplyScalar(speed); s.velocity.z += 5; 
    } else {
        s.mesh.position.set((Math.random()-0.5), (Math.random()-0.5), 0); 
        const speed = 5 + Math.min(intensity * 15, 50); 
        s.velocity.set((Math.random() - 0.5) * speed, (Math.random() - 0.5) * speed, (Math.random() - 0.5) * speed + 5);
    }
    s.mesh.scale.setScalar(1.5); s.mesh.visible = true; s.mesh.material.opacity = 1.0;
    s.mesh.material.color.setHex(intensity > 0.8 ? 0xffffff : (Math.random() > 0.5 ? 0xff2b5a : 0x00d4ff));
    s.spin.set(Math.random(), Math.random(), Math.random()).multiplyScalar(0.4);
  }
}

/* ================= AUDIO ANALYSIS (OPTIMIZED AUTOCORRELATION) ================= */
function autoCorrelate(buf, sampleRate) {
  const SIZE = buf.length; const MIN_SAMPLES = 0; const MAX_SAMPLES = Math.floor(SIZE / 2);
  let best_offset = -1; let best_correlation = 0; let rms = 0;
  for (let i = 0; i < SIZE; i++) { const val = buf[i]; rms += val * val; }
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.015) return -1; 

  let lastCorrelation = 1; let foundGoodCorrelation = false; let correlations = new Array(MAX_SAMPLES);
  for (let offset = MIN_SAMPLES; offset < MAX_SAMPLES; offset+=2) {
    let correlation = 0;
    for (let i = 0; i < MAX_SAMPLES; i+=2) { correlation += Math.abs((buf[i]) - (buf[i + offset])); }
    correlation = 1 - (correlation / MAX_SAMPLES);
    correlations[offset] = correlation; 
    if ((correlation > 0.9) && (correlation > lastCorrelation)) {
      foundGoodCorrelation = true;
      if (correlation > best_correlation) { best_correlation = correlation; best_offset = offset; }
    } else if (foundGoodCorrelation) {
      const shift = (correlations[best_offset + 1] - correlations[best_offset - 1]) / correlations[best_offset];
      return sampleRate / (best_offset + (8 * shift));
    }
    lastCorrelation = correlation;
  }
  if (best_correlation > 0.01) { return sampleRate / best_offset; }
  return -1;
}

function noteFromPitch(frequency) { const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2)); return Math.round(noteNum) + 69; }
function frequencyFromNoteNumber(note) { return 440 * Math.pow(2, (note - 69) / 12); }
function centsOffFromPitch(frequency, note) { return Math.floor(1200 * Math.log(frequency / frequencyFromNoteNumber(note)) / Math.log(2)); }
function hzToBin(hz) { if (!engine?.ctx || !analyser) return 0; const nyquist = engine.ctx.sampleRate / 2; const idx = Math.round((hz / nyquist) * (analyser.frequencyBinCount - 1)); return Math.max(0, Math.min(analyser.frequencyBinCount - 1, idx)); }
function bandEnergy(freqData, hzLo, hzHi) { 
    const a = hzToBin(hzLo), b = hzToBin(hzHi); let sum = 0; const n = Math.max(1, b - a + 1); 
    for (let i = a; i <= b; i++) sum += freqData[i] || 0; 
    const result = (sum / n) / 255; return isNaN(result) ? 0 : result;
}

let bassSm = 0, midSm = 0, snareSm = 0; let snareAvg = 0, snarePrev = 0, lastSnareTrig = 0; let snapFlash = 0;

/* ================= MAIN LOOP ================= */
function loop() {
  raf = requestAnimationFrame(loop);
  frameCounter++;
  
  try {
      if (!renderer || !scene || !camera || !composer) return;

      const dt = 1/60; const time = performance.now() * 0.001;

      if (analyser && dataFreq) {
        analyser.getByteFrequencyData(dataFreq);
        if (tunerEnabled) analyser.getFloatTimeDomainData(dataTime);
        
        let sensitivity = 0.1; const sensInput = document.getElementById("sens-panel");
        if(sensInput) sensitivity = Math.max(0.1, Math.min(parseFloat(sensInput.value) || 0.1, 5.0));

        const bass = bandEnergy(dataFreq, 30, 140) * sensitivity; 
        const mid  = bandEnergy(dataFreq, 200, 1200) * sensitivity; 
        const snare = bandEnergy(dataFreq, 1800, 5200) * sensitivity;
        
        bassSm = bassSm * 0.88 + bass * 0.12; midSm  = midSm  * 0.90 + mid  * 0.10; snareSm = snareSm * 0.78 + snare * 0.22;
        snareAvg = snareAvg * 0.965 + snareSm * 0.035; const rise = snareSm - snarePrev; snarePrev = snareSm;
        
        if (tunerEnabled && frameCounter % 4 === 0 && tunerNote) {
            const pitch = autoCorrelate(dataTime, engine.ctx.sampleRate);
            if (pitch !== -1) {
                const note = noteFromPitch(pitch);
                const noteName = NOTE_STRINGS[note % 12];
                const octave = Math.floor(note / 12) - 1;
                const detune = centsOffFromPitch(pitch, note);
                
                tunerNote.textContent = noteName; tunerOctave.textContent = octave;
                
                if (detune === 0) { tunerBar.style.backgroundColor = "#00ff88"; tunerBar.style.boxShadow = "0 0 15px #00ff88"; } 
                else if (Math.abs(detune) < 10) { tunerBar.style.backgroundColor = "#00d4ff"; tunerBar.style.boxShadow = "0 0 10px #00d4ff"; } 
                else { tunerBar.style.backgroundColor = "#ff2d55"; tunerBar.style.boxShadow = "0 0 10px #ff2d55"; }
                const trans = Math.max(-50, Math.min(50, detune));
                tunerBar.style.transform = `translateX(calc(-50% + ${trans * 2}px))`; 
            } else {
                tunerNote.textContent = "--"; tunerOctave.textContent = "";
                tunerBar.style.transform = `translateX(-50%)`; tunerBar.style.backgroundColor = "rgba(255,255,255,0.1)"; tunerBar.style.boxShadow = "none";
            }
        }
        
        // AI Label Update
        const aiTextEl = document.getElementById("ai-text");
        if(aiEnabled && aiTextEl) {
            aiTextEl.textContent = aiLabel;
            if(aiLabel === "SPEECH DETECTED") aiTextEl.style.color = "#00ff88";
            else aiTextEl.style.color = "#ffeb3b";
        }

        if ((snareSm > snareAvg * 1.45) && (rise > 0.055) && (time - lastSnareTrig) > 0.14) {
          lastSnareTrig = time; snapFlash = 1.0; triggerRingPulse(Math.min(1, snareSm * 1.6)); spawnGhostBurst(P.ghostCount, Math.min(1, snareSm * 1.3), 1.0);
          if (snareSm > 0.4 || bassSm > 0.6) fireSparks(Math.max(snareSm, bassSm), morphMesh);
          
          if (hapticsEnabled && navigator.vibrate && (time - lastVibration > 0.12)) {
              navigator.vibrate(Math.min(40, 20 + snareSm * 30)); lastVibration = time;
          }
        }
      } else { bassSm *= 0.97; midSm *= 0.97; snareSm *= 0.97; }
      snapFlash *= 0.86; if (snapFlash < 0.001) snapFlash = 0;

      const paletteInput = document.getElementById("palette-panel");
      const hueInput = document.getElementById("hueShift");
      
      const mode = paletteInput?.value || "hue";
      let finalHue = 0; let finalSat = 0.75; let finalLum = 0.55;

      if (mode === "grayscale") { finalHue = 0; finalSat = 0; finalLum = 0.8; } 
      else if (mode === "energy") { finalHue = (0.6 + bassSm * 0.4) % 1; finalSat = 0.9; } 
      else { const sliderHue = hueInput ? parseFloat(hueInput.value) : 280; finalHue = ((sliderHue % 360) / 360) + (Math.sin(time * 0.05) * 0.05); } 

      if (nebulaMaterial) {
          nebulaMaterial.uniforms.time.value = time * 0.2; nebulaMaterial.uniforms.bass.value = bassSm;
          nebulaMaterial.uniforms.color1.value.setHSL(finalHue, 0.6, 0.02); 
          nebulaMaterial.uniforms.color2.value.setHSL((finalHue + 0.1)%1, 0.5, 0.12); 
      }

      if (!reducedMotion) {
        if (currentCameraMode === 0) { camTargetPos.set(0, 0, 18 - bassSm * 2); camTargetLook.set(0,0,0); } 
        else if (currentCameraMode === 1) { camTargetPos.set(0, 0, 0); camTargetLook.set(Math.sin(time)*5, Math.cos(time*0.8)*5, -10); } 
        else if (currentCameraMode === 2) { camTargetPos.set(Math.sin(time*0.5)*15, 15, Math.cos(time*0.5)*15); camTargetLook.set(0,0,0); } 
        else if (currentCameraMode === 3) { camTargetPos.set(Math.sin(time)*3, Math.cos(time)*3, 5); camTargetLook.set(0,0,0); }
        
        camera.position.lerp(camTargetPos, 0.05); 
        const currentLook = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).add(camera.position);
        currentLook.lerp(camTargetLook, 0.1); camera.lookAt(currentLook);
        
        let targetFov = baseFov - (bassSm * 15); if(isNaN(targetFov)) targetFov = baseFov;
        camera.fov = THREE.MathUtils.lerp(camera.fov, Math.max(10, Math.min(targetFov, 120)), 0.1);
        
        const shake = snapFlash * 0.4; camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake;
        camera.updateProjectionMatrix();
      }

      if (coreLight) {
        coreLight.intensity = Math.min((bassSm * 30) + (snapFlash * 50), 120); 
        if (snapFlash > 0.5) { coreLight.color.setHex(0xffffff); } else { coreLight.color.setHSL(finalHue, 0.9, 0.5); }
      }
      
      if (afterimagePass) {
          const trailsInput = document.getElementById("trailsAmount");
          let dampValue = trailsInput ? parseFloat(trailsInput.value) : 0;
          if (isNaN(dampValue)) dampValue = 0;
          afterimagePass.uniforms['damp'].value = Math.max(0, dampValue - (snapFlash * 0.1));
      }

      if (rgbShiftPass) rgbShiftPass.uniforms['amount'].value = THREE.MathUtils.lerp(rgbShiftPass.uniforms['amount'].value, 0.0015 + (bassSm * 0.01) + (snapFlash * 0.02), 0.1);
      if (glitchPass) glitchPass.enabled = (bassSm + midSm + snareSm > 2.2 && Math.random() > 0.8);

      if (starPoints) {
        const partInput = document.getElementById("partAmount");
        updateStars(dt); const slider = partInput ? parseFloat(partInput.value) : 10; 
        starPoints.material.opacity = Math.max(0, Math.min(0.8, P.starsOpacity + 0.03 * Math.sin(time * 0.7) + Math.max(0, Math.min(0.20, 0.0065 * slider)) + bassSm * 0.2));
      }

      if (world && !reducedMotion) {
        world.rotation.y = time * 0.45; world.rotation.x = Math.sin(time * 0.8) * 0.10; 
        world.position.set(Math.sin(time * 1.2) * 0.55, Math.cos(time * 0.9) * 0.35, 0);
      }

      if (morphMesh) {
        const bassPunch = Math.pow(bassSm, 1.5) * 2.5; 
        morphMesh.morphTargetInfluences[0] = THREE.MathUtils.lerp(morphMesh.morphTargetInfluences[0], bassPunch, 0.4); 
        morphMesh.morphTargetInfluences[1] = THREE.MathUtils.lerp(morphMesh.morphTargetInfluences[1], midSm * 2.5, 0.2); 
        const spikePunch = (snareSm * 3.5) + (snapFlash * 3.0); 
        morphMesh.morphTargetInfluences[2] = THREE.MathUtils.lerp(morphMesh.morphTargetInfluences[2], spikePunch, 0.6); 

        const drift = reducedMotion ? 0 : 0.001; morphMesh.rotation.y += drift + midSm * 0.015; morphMesh.rotation.x += drift; morphMesh.rotation.z += Math.sin(time * 0.5) * 0.005;
        
        const zoomInput = document.getElementById("zoomInt");
        let zoomInt = zoomInput ? (parseFloat(zoomInput.value) / 100) : 0.18; if (isNaN(zoomInt)) zoomInt = 0.18;
        const targetScale = 1 + (Math.pow(bassSm, 1.5) * 0.5 * zoomInt) + (snapFlash * 0.08);
        morphMesh.scale.setScalar(THREE.MathUtils.lerp(morphMesh.scale.x, Math.max(0.1, targetScale), 0.3));

        morphMesh.material.color.setHSL(finalHue, finalSat, finalLum);
        morphMesh.material.opacity = P.cageOpacityBase + bassSm * 0.3 + snapFlash * 0.2;
      }

      if (sigilGroup && sigilBase && sigilGlow) {
        const opacity = Math.max(0.35, P.sigilInk + bassSm * 0.1);
        sigilBase.material.opacity = opacity; 
        
        let glowColor = new THREE.Color().setHSL(finalHue, 1.0, 0.6);
        if (mode === "grayscale") glowColor.setHex(0xffffff);
        else glowColor.lerp(new THREE.Color(0xffffff), Math.min(1, snapFlash * 0.8)); 
        
        sigilGlow.material.color.copy(glowColor); 
        
        const glowOp = Math.max(0.30, Math.min(0.98, P.glowBase + bassSm * P.glowBass + snapFlash * P.glowSnap));
        sigilGlow.material.opacity = glowOp; 
        
        sigilGroup.quaternion.copy(camera.quaternion);
        const jitter = reducedMotion ? 0 : (snapFlash * P.jitter); 
        sigilGroup.rotateZ(Math.sin(time * 1.0) * 0.05 + (Math.random() - 0.5) * jitter);
        
        const zoomInput = document.getElementById("zoomInt");
        let zoomInt = zoomInput ? (parseFloat(zoomInput.value) / 100) : 0.18; if (isNaN(zoomInt)) zoomInt = 0.18;
        sigilGroup.scale.setScalar(1 + bassSm * (0.32 * zoomInt) + snapFlash * 0.04); 
        
        if (world && !reducedMotion) {
            sigilGroup.position.x = world.position.x;
            sigilGroup.position.y = world.position.y + Math.sin(time * 1.5) * 0.08;
        } else {
            sigilGroup.position.set(0, Math.sin(time * 1.5) * 0.08, 0);
        }
      }

      for (const r of ringPool) {
        if (r.t >= 999) continue; r.t += dt; const p = Math.min(1, r.t / r.life); r.mesh.scale.setScalar(r.baseScale + (1 - Math.pow(1 - p, 3)) * 1.35);
        r.mesh.material.opacity = (1 - p) * 0.85 * (0.92 + 0.08 * Math.sin(time * 20)) * P.ringStrength; if (p >= 1) { r.t = 999; r.mesh.material.opacity = 0; }
      }
      for (const g of ghostPool) {
        if (g.t >= 999) continue; g.t += dt; const p = Math.min(1, g.t / g.life);
        g.group.position.x += g.vx * 0.14; g.group.position.y += g.vy * 0.14; g.group.rotation.y += g.spin * 0.04; g.group.scale.setScalar(g.baseScale + (1 - Math.pow(1 - p, 2)) * 0.28);
        const fade = (1 - p); g.ink.material.opacity = Math.max(0, g.ink.material.opacity * 0.90) * fade; g.glow.material.opacity = Math.max(0, g.glow.material.opacity * 0.88) * fade; if (p >= 1) { g.t = 999; g.group.visible = false; }
      }

      for (let i = 0; i < sparkPool.length; i++) {
        const s = sparkPool[i]; if (!s.active) continue; s.life += dt; if (s.life >= s.maxLife) { s.active = false; s.mesh.visible = false; continue; }
        
        const noiseFreq = 0.8;
        const timeOffset = time * 1.5;
        const dx = Math.sin(s.mesh.position.y * noiseFreq + timeOffset);
        const dy = Math.sin(s.mesh.position.z * noiseFreq + timeOffset);
        const dz = Math.sin(s.mesh.position.x * noiseFreq + timeOffset);
        
        s.velocity.x += dx * 0.15;
        s.velocity.y += dy * 0.15;
        s.velocity.z += dz * 0.15;

        s.mesh.position.addScaledVector(s.velocity, dt); 
        s.velocity.multiplyScalar(0.96); 
        
        s.mesh.rotation.set(s.mesh.rotation.x + s.spin.x, s.mesh.rotation.y + s.spin.y, s.mesh.rotation.z + s.spin.z);
        const percent = s.life / s.maxLife; s.mesh.material.opacity = 1.0 - Math.pow(percent, 2); s.mesh.scale.setScalar(1.0 - percent);
      }

      if (bloomPass) {
          const targetBloom = P.bloomStrength + (bassSm * 0.5); 
          bloomPass.strength = isNaN(targetBloom) ? P.bloomStrength : Math.min(targetBloom, 2.0); 
          const targetRadius = P.bloomRadius + (bassSm * 0.2);
          bloomPass.radius = isNaN(targetRadius) ? P.bloomRadius : Math.min(targetRadius, 1.0);
      }
      
      composer.render();
      
  } catch (renderError) {
      console.error("Frame render error, recovering...", renderError);
  }
}

/* ================= RECORDING ================= */
let mediaRecorder = null, recordedChunks = [], recording = false;
function pickMime() { const mimes = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]; for (const m of mimes) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m; return ""; }
function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

async function startRecording() {
  try {
      if (!engine) await initEngine();
      if (!canvas.captureStream) { setStatus("❌ Recording not supported."); return; }
      
      const recBtn = document.getElementById("si-recBtn");
      if(recBtn) recBtn.classList.add('recording-pulse');
      
      if (engine && engine.ctx && engine.ctx.state === 'suspended') { await engine.ctx.resume(); }
      await new Promise(resolve => setTimeout(resolve, 100));

      const fps = 30; 
      const canvasStream = canvas.captureStream(fps); 
      const videoTrack = canvasStream.getVideoTracks()[0];
      let combinedStream;
      
      try {
          const out = audioRecordDest?.stream; 
          if (out && out.getAudioTracks().length > 0) {
              combinedStream = new MediaStream([videoTrack, out.getAudioTracks()[0]]);
          } else { combinedStream = new MediaStream([videoTrack]); }
      } catch (audioErr) { combinedStream = new MediaStream([videoTrack]); }
      
      recordedChunks = []; 
      const mimeType = pickMime(); 
      mediaRecorder = new MediaRecorder(combinedStream, mimeType ? { mimeType } : undefined);
      mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
      mediaRecorder.onstop = () => { 
          downloadBlob(new Blob(recordedChunks, { type: mimeType || "video/webm" }), `sonic-inclusion-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`); 
          setStatus("✅ Recording saved"); 
      };
      mediaRecorder.start(250); recording = true; 
      if(recBtn) recBtn.textContent = "⏹ STOP"; setStatus("⏺ Recording…");
  } catch (err) { stopRecording(); setStatus("❌ Recording failed"); }
}

function stopRecording() { 
    if (mediaRecorder && mediaRecorder.state !== "inactive") { try { mediaRecorder.stop(); } catch {} }
    recording = false; 
    const recBtn = document.getElementById("si-recBtn");
    if(recBtn) { recBtn.textContent = "⏺ RECORD"; recBtn.classList.remove('recording-pulse'); }
}

fileInput.addEventListener("change", async (e) => {
  if (!engine) await initEngine();
});
