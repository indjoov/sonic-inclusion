import * as THREE from "three";
import { AudioEngine } from "./audio/AudioEngine.js";

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

const fileInput = document.createElement("input");
fileInput.id = "fileInput";
fileInput.type = "file";
fileInput.accept = "audio/*";
fileInput.hidden = true;
document.body.appendChild(fileInput);

const sigilInput = document.createElement("input");
sigilInput.type = "file";
sigilInput.accept = "image/png, image/jpeg, image/svg+xml";
sigilInput.hidden = true;
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

/* ================= ENGINE (AUDIO) ================= */

const engine = new AudioEngine();
let raf = null; let analyser = null; let dataFreq = null;
let inputGain = null; let monitorGain = null;
let currentMode = "idle"; let bufferSrc = null; let micStream = null; let micSourceNode = null;
let audioRecordDest = null;

// Lightweight Analysis State
let brightness = 0; 

/* ================= THREE STATE ================= */

let renderer = null; let scene = null; let camera = null; let composer = null;
let bloomPass = null; let fxaaPass = null; let world = null; let starPoints = null;  
let morphMesh = null; let coreLight = null; let rgbShiftPass = null; let glitchPass = null;      
let afterimagePass = null; 

let sparkPool = []; let sparkCursor = 0; let baseFov = 55;           

let sigilGroup = null; let sigilBase = null; let sigilGlow = null;
let sigilBaseTex = null; let sigilGlowTex = null;

let ringPool = []; let ringCursor = 0; let ghostPool = []; let ghostCursor = 0;

let reducedMotion = false; let micMonitor = false; let micMonitorVol = 0.35; let feedbackMuted = false;

// Haptics State
let hapticsEnabled = false;
let lastVibration = 0;

let currentCameraMode = 0;
const camTargetPos = new THREE.Vector3();
const camTargetLook = new THREE.Vector3();

let nebulaMaterial = null;

function applyMicMonitorGain() {
  if (!monitorGain) return;
  monitorGain.gain.value = currentMode === "mic" && micMonitor && !feedbackMuted ? micMonitorVol : 0;
}

/* ================= HUD (SEMANTIC LAYER) ================= */

function createHUD() {
    const existing = document.getElementById("si-semantic-hud");
    if(existing) existing.remove();

    const hudEl = document.createElement("div");
    hudEl.id = "si-semantic-hud";
    // FIX: Moved bottom to 130px to clear the buttons
    hudEl.style.cssText = `
        position: fixed; bottom: 130px; left: 50%; transform: translateX(-50%);
        width: min(90vw, 400px); display: flex; justify-content: space-between;
        background: rgba(0, 10, 20, 0.85); border: 1px solid rgba(0, 212, 255, 0.3);
        border-radius: 4px; padding: 10px 16px; z-index: 1000;
        font-family: 'Courier New', monospace; font-size: 11px; color: #00d4ff;
        pointer-events: none; backdrop-filter: blur(4px); box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        transition: bottom 0.4s ease;
    `;
    
    hudEl.innerHTML = `
        <div style="text-align:left;">
            <div style="opacity:0.5; font-size:9px;">SIGNAL</div>
            <div id="hud-signal" style="font-weight:bold; color:#fff;">WAITING</div>
        </div>
        <div style="text-align:center; border-left:1px solid rgba(255,255,255,0.1); border-right:1px solid rgba(255,255,255,0.1); padding: 0 16px; flex: 1;">
            <div style="opacity:0.5; font-size:9px;">TEXTURE</div>
            <div id="hud-texture" style="font-weight:bold; letter-spacing:1px; color:#fff;">--</div>
        </div>
        <div style="text-align:right;">
            <div style="opacity:0.5; font-size:9px;">TONE</div>
            <div id="hud-pitch" style="font-weight:bold; color:#ff2d55;">--</div>
        </div>
    `;
    document.body.appendChild(hudEl);
}
createHUD();

const hudSignal = document.getElementById("hud-signal");
const hudTexture = document.getElementById("hud-texture");
const hudPitch = document.getElementById("hud-pitch");

/* ================= HUD & ENGINE PANEL ================= */

function removeLegacyUI() { 
    document.getElementById("si-hud")?.remove(); 
    document.getElementById("si-enginePanel")?.remove(); 
}
removeLegacyUI();

const hud = document.createElement("div");
hud.id = "si-hud";

const recBtn = document.createElement("button");
recBtn.id = "si-recBtn"; recBtn.className = "hud-btn"; recBtn.type = "button"; recBtn.innerHTML = "⏺ RECORD";

const hudRightControls = document.createElement("div");
hudRightControls.style.cssText = "display: flex; gap: 10px; pointer-events: auto;";

const fsBtn = document.createElement("button");
fsBtn.id = "si-fsBtn"; fsBtn.className = "hud-btn"; fsBtn.type = "button"; fsBtn.textContent = "📺 PROJECTION";

const engineToggle = document.createElement("button");
engineToggle.id = "si-engineToggle"; engineToggle.className = "hud-btn"; engineToggle.type = "button"; engineToggle.textContent = "⚙️ ENGINE";

hudRightControls.appendChild(fsBtn); hudRightControls.appendChild(engineToggle);
hud.appendChild(recBtn); hud.appendChild(hudRightControls); document.body.appendChild(hud);

const enginePanel = document.createElement("div");
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
    <div class="sigil-preset-row" style="flex-wrap: wrap; width: 100%; box-sizing: border-box;">
        <button id="customSigilBtn" type="button" class="sigil-btn">Upload Sigil</button>
        <div class="preset-info" style="padding: 6px;"><b>PRESETS:</b> Save: Shift+1..4 | Load: 1..4</div>
    </div>
    
    <label class="panel-label" style="display:block; max-width:100%; box-sizing:border-box; color:#00d4ff; font-weight:bold;">LIGHT TRAILS<input id="trailsAmount" type="range" min="0" max="0.99" step="0.01" value="0" style="width:100%; box-sizing:border-box; margin-top:6px;"></label>
    
    <label class="panel-label" style="display:block; max-width:100%; box-sizing:border-box;">SENSITIVITY<input id="sens-panel" type="range" min="0.1" max="3" step="0.1" value="0.1" style="width:100%; box-sizing:border-box; margin-top:6px;"></label>
    <label class="panel-label" style="display:block; max-width:100%; box-sizing:border-box;">STARS (amount)<input id="partAmount" type="range" min="0" max="30" value="10" style="width:100%; box-sizing:border-box; margin-top:6px;"></label>
    <label class="panel-label" style="display:block; max-width:100%; box-sizing:border-box;">BASS ZOOM (object)<input id="zoomInt" type="range" min="0" max="100" value="18" style="width:100%; box-sizing:border-box; margin-top:6px;"></label>
    <label class="panel-label" style="display:block; max-width:100%; box-sizing:border-box;">HUE<input id="hueShift" type="range" min="0" max="360" value="280" style="width:100%; box-sizing:border-box; margin-top:6px;"></label>
    
    <label class="panel-label" style="display:block; max-width:100%; box-sizing:border-box;">COLOR MODE
        <select id="palette-panel" style="width:100%; margin-top:6px; padding: 8px; border-radius: 8px; background: rgba(0,0,0,0.5); color: white; border: 1px solid rgba(255,255,255,0.2);">
            <option value="hue" selected>Hue (Single Color)</option>
            <option value="energy">Hue by energy</option>
            <option value="grayscale">High-contrast grayscale</option>
        </select>
    </label>

    <label class="checkbox-row" style="max-width:100%;"><input id="hapticsToggle" type="checkbox">HAPTICS (Mobile)</label>
    <label class="checkbox-row" style="max-width:100%;"><input id="reducedMotion" type="checkbox">Reduced Motion</label>
    
    <div class="mic-section" style="width: 100%; box-sizing: border-box;">
      <label class="checkbox-row"><input id="micMonitor" type="checkbox"><span>Mic Monitor</span></label>
      <label class="panel-label" style="display:block; max-width:100%; box-sizing:border-box; margin-top:10px;">Monitor Volume<input id="micMonitorVol" type="range" min="0" max="100" value="35" style="width:100%; box-sizing:border-box; margin-top:6px;"></label>
      <div id="feedbackWarn">🔇 Feedback risk detected — mic monitor muted</div>
    </div>
    <div id="midiStatus" style="max-width:100%;">🎹 MIDI: Waiting for connection...</div>
  </div>
`;
document.body.appendChild(enginePanel);

let engineOpen = false;
function setEngineOpen(open) { 
  engineOpen = open; 
  if(open) {
      enginePanel.classList.add('open');
      enginePanel.style.display = "block";
  } else {
      enginePanel.classList.remove('open');
      setTimeout(() => { if(!engineOpen) enginePanel.style.display = "none"; }, 400);
  }
}
engineToggle.addEventListener("click", () => setEngineOpen(!engineOpen));
enginePanel.querySelector("#si-engineClose").addEventListener("click", () => setEngineOpen(false));

let touchStartY = null;
enginePanel.addEventListener("touchstart", (e) => { touchStartY = e.touches?.[0]?.clientY ?? null; }, { passive: true });
enginePanel.addEventListener("touchmove", (e) => {
  if (touchStartY == null) return;
  const dy = (e.touches?.[0]?.clientY ?? touchStartY) - touchStartY;
  if (dy > 50) { setEngineOpen(false); touchStartY = null; }
}, { passive: true });

const partEl = enginePanel.querySelector("#partAmount"); 
const zoomEl = enginePanel.querySelector("#zoomInt"); 
const hueEl  = enginePanel.querySelector("#hueShift");
const midiStatusEl = enginePanel.querySelector("#midiStatus");
const panelSensEl = enginePanel.querySelector("#sens-panel");
const paletteEl = enginePanel.querySelector("#palette-panel");
const trailsEl = enginePanel.querySelector("#trailsAmount"); 

enginePanel.querySelector("#reducedMotion").addEventListener("change", (e) => reducedMotion = !!e.target.checked);
enginePanel.querySelector("#hapticsToggle").addEventListener("change", (e) => {
    hapticsEnabled = !!e.target.checked;
    if (hapticsEnabled && navigator.vibrate) {
        navigator.vibrate(20); 
    }
});

const micMonitorEl = enginePanel.querySelector("#micMonitor"); 
const micMonitorVolEl = enginePanel.querySelector("#micMonitorVol"); 
const feedbackWarnEl = enginePanel.querySelector("#feedbackWarn");

micMonitorEl.checked = micMonitor; micMonitorVolEl.value = String(Math.round(micMonitorVol * 100));
micMonitorEl.addEventListener("change", (e) => {
  micMonitor = !!e.target.checked; feedbackMuted = false; feedbackWarnEl.style.display = "none";
  applyMicMonitorGain(); setStatus(micMonitor ? "🎙️ Mic monitor ON" : "🎙️ Mic monitor OFF");
});
micMonitorVolEl.addEventListener("input", (e) => {
  micMonitorVol = Math.max(0, Math.min(1, parseInt(e.target.value, 10) / 100));
  applyMicMonitorGain();
});

/* ================= FULLSCREEN & UI TOGGLE ================= */
let isFullscreen = false;
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => { console.warn(`Error: ${err.message}`); });
    document.querySelector('.site-header')?.style.setProperty('display', 'none'); 
    document.querySelector('.site-footer')?.style.setProperty('display', 'none');
    hud.style.display = 'none'; 
    
    // FIX: Move HUD down when buttons disappear
    const hudEl = document.getElementById("si-semantic-hud");
    if(hudEl) hudEl.style.bottom = "30px";
    
    setEngineOpen(false);
    
    stageEl.classList.add('fullscreen-active');
    document.body.style.overflow = "hidden"; 
    isFullscreen = true; setStatus("📺 Entered projection mode");
  } else { document.exitFullscreen(); resetUI(); }
}
function resetUI() {
  document.querySelector('.site-header')?.style.setProperty('display', 'block'); 
  document.querySelector('.site-footer')?.style.setProperty('display', 'block');
  hud.style.display = 'flex'; 
  
  // FIX: Restore HUD position
  const hudEl = document.getElementById("si-semantic-hud");
  if(hudEl) hudEl.style.bottom = "130px";
  
  stageEl.classList.remove('fullscreen-active');
  document.body.style.overflow = "auto"; 
  isFullscreen = false; fitRendererToStage();
}
fsBtn.addEventListener("click", toggleFullscreen);
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) resetUI(); setTimeout(fitRendererToStage, 100); });

/* ================= CUSTOM SIGIL UPLOAD ================= */
enginePanel.querySelector("#customSigilBtn").addEventListener("click", () => sigilInput.click());
sigilInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  const url = URL.createObjectURL(file); loadSigilLayers(url, true); setStatus("✅ Custom sigil loaded");
});

/* ================= CHAPTER SYSTEM ================= */
const CHAPTERS = {
  INVOCATION: { trails: 0, starsOpacity: 0.16, cageOpacityBase: 0.35, sigilInk: 0.90, glowBase: 0.25, glowBass: 0.20, glowSnap: 0.40, jitter: 0.010, ringStrength: 0.75, ghostCount: 2, bloomStrength: 0.40, bloomRadius: 0.35, bloomThreshold: 0.25 },
  POSSESSION: { trails: 0, starsOpacity: 0.20, cageOpacityBase: 0.45, sigilInk: 0.88, glowBase: 0.35, glowBass: 0.35, glowSnap: 0.60, jitter: 0.020, ringStrength: 1.00, ghostCount: 3, bloomStrength: 0.65, bloomRadius: 0.45, bloomThreshold: 0.20 },
  ASCENSION:  { trails: 0.60, starsOpacity: 0.24, cageOpacityBase: 0.55, sigilInk: 0.84, glowBase: 0.45, glowBass: 0.55, glowSnap: 0.75, jitter: 0.016, ringStrength: 1.15, ghostCount: 4, bloomStrength: 0.85, bloomRadius: 0.55, bloomThreshold: 0.15 },
};
let chapter = "POSSESSION"; let P = CHAPTERS[chapter];
function applyChapter(name) {
  if (!CHAPTERS[name]) return; chapter = name; P = CHAPTERS[chapter];
  if (bloomPass) { bloomPass.strength = P.bloomStrength; bloomPass.radius = P.bloomRadius; bloomPass.threshold = P.bloomThreshold; }
  if (trailsEl) trailsEl.value = P.trails; 
  setStatus(`🔮 Chapter: ${chapter}`);
}
enginePanel.querySelector("#chapInv").addEventListener("click", () => applyChapter("INVOCATION"));
enginePanel.querySelector("#chapPos").addEventListener("click", () => applyChapter("POSSESSION"));
enginePanel.querySelector("#chapAsc").addEventListener("click", () => applyChapter("ASCENSION"));

/* ================= PRESET SYSTEM ================= */
function savePreset(slot) {
    const data = { sens: panelSensEl?.value, hue: hueEl?.value, zoom: zoomEl?.value, stars: partEl?.value, palette: paletteEl?.value, chapter: chapter, trails: trailsEl?.value };
    localStorage.setItem(`sonicPreset_${slot}`, JSON.stringify(data)); setStatus(`💾 Preset ${slot} Saved`);
}
function loadPreset(slot) {
    const saved = localStorage.getItem(`sonicPreset_${slot}`);
    if(!saved) { setStatus(`⚠️ No Preset in slot ${slot}`); return; }
    const data = JSON.parse(saved);
    if(panelSensEl) panelSensEl.value = data.sens || "0.1"; 
    if(trailsEl) trailsEl.value = data.trails || "0";
    if(hueEl) hueEl.value = data.hue; if(zoomEl) zoomEl.value = data.zoom;
    if(partEl) partEl.value = data.stars; if(paletteEl) paletteEl.value = data.palette; applyChapter(data.chapter);
    setStatus(`📂 Preset ${slot} Loaded`);
}

/* ================= KEYBOARD MAPPING ================= */
window.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") { setEngineOpen(false); if(isFullscreen) toggleFullscreen(); }
  if (e.key.toLowerCase() === "p") toggleFullscreen();
  
  if (e.key.toLowerCase() === "c") {
      currentCameraMode = (currentCameraMode + 1) % 4;
      setStatus(`🎥 Camera Mode: ${currentCameraMode + 1}`);
  }

  if (["1", "2", "3", "4"].includes(e.key)) {
      if (e.shiftKey) { savePreset(e.key); } else { loadPreset(e.key); }
  }

  if (e.key === " ") { e.preventDefault(); if (currentMode !== "idle") { await stopAll({ suspend: true }); setStatus("⏹ Stopped"); } }
});

/* ================= RESIZE ================= */
function fitRendererToStage() {
  if (!renderer || !camera) return;
  const rect = (stageEl || canvas).getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width)); const h = Math.max(1, Math.floor(rect.height));
  const dpr = Math.max(1, Math.min(2.6, window.devicePixelRatio || 1));
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix(); composer?.setSize(w, h);
  if (fxaaPass) fxaaPass.material.uniforms["resolution"].value.set(1 / (w * dpr), 1 / (h * dpr));
}
const ro = new ResizeObserver(() => fitRendererToStage()); if (stageEl) ro.observe(stageEl); window.addEventListener("resize", fitRendererToStage);


/* ================= GLSL NEBULA ================= */
function initNebulaBackground() {
    const geo = new THREE.PlaneGeometry(500, 500);
    nebulaMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 }, bass: { value: 0 }, color1: { value: new THREE.Color(0x0a001a) }, color2: { value: new THREE.Color(0x002233) }  
        },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
            uniform float time; uniform float bass; uniform vec3 color1; uniform vec3 color2; varying vec2 vUv;
            float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }
            float noise(vec2 st) {
                vec2 i = floor(st); vec2 f = fract(st); float a = random(i); float b = random(i + vec2(1.0, 0.0)); float c = random(i + vec2(0.0, 1.0)); float d = random(i + vec2(1.0, 1.0));
                vec2 u = f * f * (3.0 - 2.0 * f); return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
            }
            float fbm(vec2 st) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(st); st *= 2.0; a *= 0.5; } return v; }
            void main() {
                vec2 st = vUv * 3.0; vec2 q = vec2(0.); q.x = fbm( st + 0.00 * time); q.y = fbm( st + vec2(1.0));
                vec2 r = vec2(0.); r.x = fbm( st + 1.0*q + vec2(1.7,9.2)+ 0.15*time ); r.y = fbm( st + 1.0*q + vec2(8.3,2.8)+ 0.126*time);
                float f = fbm(st+r); vec3 finalColor = mix(color1, color2, clamp(f*f*4.0,0.0,1.0));
                gl_FragColor = vec4((f*f*f+.6*f*f+.5*f)*finalColor, 1.0);
            }
        `,
        depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, nebulaMaterial); mesh.position.z = -100; scene.add(mesh);
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

/* ================= IMPROVED STARS ================= */
let starGeo = null;
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
  
  let warpSpeed = 1 + (bassSm * 8); 
  if (isNaN(warpSpeed)) warpSpeed = 1;

  for (let i = 0; i < vels.length; i++) {
    const ix = i * 3; positions[ix + 2] += vels[i] * warpSpeed * delta * 20;
    if (positions[ix + 2] > 20) {
      positions[ix + 2] = -150; positions[ix] = (Math.random() - 0.5) * spread * 1.5; positions[ix + 1] = (Math.random() - 0.5) * spread * 1.5;
    }
  }
  starGeo.attributes.position.needsUpdate = true;
}

/* ================= MORPHING CAGE ================= */
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

/* ================= RITUAL RINGS & GHOSTS ================= */
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

/* ================= EMISSIVE SPARKS ================= */
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
        const speed = 25 + (intensity * 40); 
        s.velocity.copy(dir).multiplyScalar(speed);
        s.velocity.z += 5; 
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

/* ================= SIGIL FIX ================= */
function loadSigilLayers(url, isCustom = false) {
  if (sigilGroup) { scene.remove(sigilGroup); sigilGroup = null; } 
  fetch(url).then(r => { if (!r.ok) throw new Error(); return isCustom ? r.blob() : r.text(); }).then(data => {
      const img = new Image(); img.crossOrigin = "anonymous";
      img.onload = () => {
        const size = 1024; const base = document.createElement("canvas"); base.width = size; base.height = size;
        const ctx = base.getContext("2d"); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, size, size);
        const scale = Math.min(size / img.width, size / img.height); const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        const imgData = ctx.getImageData(0, 0, size, size); const d = imgData.data; const thr = 245;
        for (let i = 0; i < d.length; i += 4) { if (d[i] >= thr && d[i + 1] >= thr && d[i + 2] >= thr) d[i + 3] = 0; }
        ctx.putImageData(imgData, 0, 0);
        const glow = document.createElement("canvas"); glow.width = size; glow.height = size; const gctx = glow.getContext("2d");
        gctx.filter = "blur(10px)"; gctx.globalAlpha = 1; gctx.drawImage(base, 0, 0); gctx.filter = "blur(22px)"; gctx.globalAlpha = 0.85; gctx.drawImage(base, 0, 0); gctx.filter = "none";
        sigilBaseTex = new THREE.CanvasTexture(base); sigilBaseTex.colorSpace = THREE.SRGBColorSpace; sigilGlowTex = new THREE.CanvasTexture(glow); sigilGlowTex.colorSpace = THREE.SRGBColorSpace;
        const plane = new THREE.PlaneGeometry(6.9, 6.9);
        
        const inkMat = new THREE.MeshBasicMaterial({ map: sigilBaseTex, transparent: true, opacity: 0.90, depthWrite: false, depthTest: false, blending: THREE.NormalBlending, side: THREE.DoubleSide });
        const glowMat = new THREE.MeshBasicMaterial({ map: sigilGlowTex, transparent: true, opacity: 0.50, color: new THREE.Color(0x00d4ff), depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
        
        sigilBase = new THREE.Mesh(plane, inkMat); sigilGlow = new THREE.Mesh(plane, glowMat); sigilGlow.scale.setScalar(1.08);
        
        sigilGroup = new THREE.Group(); 
        sigilGroup.add(sigilGlow, sigilBase); 
        
        scene.add(sigilGroup); 
        setStatus("✅ Sigil loaded");
        if(isCustom) URL.revokeObjectURL(url);
      };
      if (isCustom) { img.src = URL.createObjectURL(data); } else { img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}`; }
    }).catch(() => setStatus("⚠️ Sigil fetch failed"));
}

/* ================= MIDI INTEGRATION ================= */
function initMIDI() {
  if (navigator.requestMIDIAccess) { navigator.requestMIDIAccess().then(onMIDISuccess, () => { midiStatusEl.textContent = "🎹 MIDI: Access Denied";}); }
}
function onMIDISuccess(midiAccess) {
  midiStatusEl.textContent = "🎹 MIDI: Active";
  for (let input of midiAccess.inputs.values()) input.onmidimessage = getMIDIMessage;
  midiAccess.onstatechange = (e) => { if (e.port.state === 'connected') { midiStatusEl.textContent = `🎹 MIDI: Connected`; e.port.onmidimessage = getMIDIMessage; } };
}
function getMIDIMessage(message) {
  const command = message.data[0]; const note = message.data[1]; const velocity = (message.data.length > 2) ? message.data[2] : 0;
  console.log(`MIDI Command: ${command}, Note: ${note}, Vel: ${velocity}`);
  if (command === 176 && note === 1) { if(zoomEl) zoomEl.value = Math.round((velocity / 127) * 100); }
}

/* ================= AUDIO ENGINE INIT ================= */
let engineInitialized = false;

async function initEngine() {
  if (engineInitialized) return;
  overlay.style.display = "none"; 
  setStatus("⏳ Initializing engine…");

  try {
    initThree();
    if (!raf) loop();
  } catch (err) { console.error("Three.js failed to start:", err); }

  try {
    await engine.init();
    if (engine.ctx && engine.ctx.state === 'suspended') { await engine.ctx.resume(); }

    analyser = engine.ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.85;
    dataFreq = new Uint8Array(analyser.frequencyBinCount);
    dataTime = new Float32Array(analyser.fftSize);

    inputGain = engine.ctx.createGain(); monitorGain = engine.ctx.createGain(); monitorGain.gain.value = 0;
    inputGain.connect(analyser); inputGain.connect(monitorGain); monitorGain.connect(engine.master);

    audioRecordDest = engine.ctx.createMediaStreamDestination();
    try { engine.master.connect(audioRecordDest); } catch (e) {}

    engineInitialized = true;
    setStatus("✅ Engine ready");
  } catch (e) {
    console.error("Audio Engine blocked or failed:", e);
    setStatus("⚠️ Audio blocked by browser, but visuals are running.");
  }
}

overlay.style.cursor = "pointer";
overlay.addEventListener("click", () => { initEngine(); });

/* ================= CLEAN STOP / INPUTS ================= */
async function stopAll({ suspend = true } = {}) {
  if (bufferSrc) { try { bufferSrc.stop(0); bufferSrc.disconnect(); } catch {} bufferSrc = null; }
  if (micSourceNode) { try { micSourceNode.disconnect(); } catch {} micSourceNode = null; }
  if (micStream) { try { micStream.getTracks().forEach(t => t.stop()); } catch {} micStream = null; }
  currentMode = "idle"; 
  const panelMicBtn = enginePanel.querySelector("#panel-micBtn");
  if (panelMicBtn) panelMicBtn.textContent = "🎙️ Mic"; 
  feedbackMuted = false; feedbackWarnEl.style.display = "none"; if (monitorGain) monitorGain.gain.value = 0;
  if (suspend && engine && engine.ctx) try { await engine.ctx.suspend(); } catch {}
}

async function playDemo(path) {
  if (!engineInitialized) await initEngine();
  await stopAll({ suspend: false }); setStatus("⏳ Loading demo…");
  const buf = await fetch(path).then(r => r.arrayBuffer()); const audio = await engine.ctx.decodeAudioData(buf);
  if (engine.ctx && engine.ctx.state === 'suspended') { await engine.ctx.resume(); }
  currentMode = "demo"; if (monitorGain) monitorGain.gain.value = 1;
  bufferSrc = engine.ctx.createBufferSource(); bufferSrc.buffer = audio; bufferSrc.connect(inputGain);
  bufferSrc.onended = async () => { await stopAll({ suspend: true }); setStatus("✅ Demo finished"); }; bufferSrc.start(0); setStatus("🎧 Demo playing");
}

enginePanel.querySelector("#panel-demoBtn").addEventListener("click", () => {
    playDemo("media/kasubo hoerprobe.mp3");
});

enginePanel.querySelector("#panel-fileBtn").addEventListener("click", async () => { 
    if(!engineInitialized) await initEngine(); 
    fileInput?.click(); 
});

fileInput?.addEventListener("change", async (e) => {
  try { 
    if(!engineInitialized) await initEngine(); 
    const file = e.target.files?.[0]; if (!file) return; 
    await stopAll({ suspend: false }); setStatus("⏳ Decoding file…");
    const arrayBuf = await file.arrayBuffer(); const audio = await engine.ctx.decodeAudioData(arrayBuf); 
    if (engine.ctx && engine.ctx.state === 'suspended') { await engine.ctx.resume(); }
    currentMode = "file"; if (monitorGain) monitorGain.gain.value = 1;
    bufferSrc = engine.ctx.createBufferSource(); bufferSrc.buffer = audio; bufferSrc.connect(inputGain); 
    bufferSrc.onended = async () => { await stopAll({ suspend: true }); setStatus("✅ File finished"); };
    bufferSrc.start(0); setStatus(`🎵 Playing: ${file.name}`);
  } catch (err) { setStatus("❌ File error"); console.error(err); } finally { if (fileInput) fileInput.value = ""; }
});

enginePanel.querySelector("#panel-micBtn").addEventListener("click", async (e) => {
  if(!engineInitialized) await initEngine();
  if (currentMode === "mic") { await stopAll({ suspend: true }); setStatus("⏹ Mic stopped"); return; }
  try { 
    await stopAll({ suspend: false }); setStatus("⏳ Requesting mic…");
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
    if (engine.ctx && engine.ctx.state === 'suspended') { await engine.ctx.resume(); }
    currentMode = "mic"; micSourceNode = engine.ctx.createMediaStreamSource(micStream); micSourceNode.connect(inputGain);
    e.target.textContent = "⏹ Stop Mic"; applyMicMonitorGain(); setStatus("🎙️ Mic active");
  } catch (err) { setStatus("❌ Mic error"); console.error(err); await stopAll({ suspend: true }); }
});

/* ================= AUDIO ANALYSIS ================= */
function getSpectralCentroid(freqData, sampleRate, fftSize) {
    let numerator = 0; let denominator = 0; const binSize = sampleRate / fftSize;
    const maxBin = Math.floor(5000 / binSize);
    for (let i = 0; i < maxBin; i++) { numerator += i * freqData[i]; denominator += freqData[i]; }
    if (denominator === 0) return 0; return (numerator / denominator) * binSize;
}

function hzToBin(hz) { if (!engine?.ctx || !analyser) return 0; const nyquist = engine.ctx.sampleRate / 2; const idx = Math.round((hz / nyquist) * (analyser.frequencyBinCount - 1)); return Math.max(0, Math.min(analyser.frequencyBinCount - 1, idx)); }

function bandEnergy(freqData, hzLo, hzHi) { 
    const a = hzToBin(hzLo), b = hzToBin(hzHi); 
    let sum = 0; 
    const n = Math.max(1, b - a + 1); 
    for (let i = a; i <= b; i++) sum += freqData[i] || 0; 
    const result = (sum / n) / 255; 
    return isNaN(result) ? 0 : result;
}

let bassSm = 0, midSm = 0, snareSm = 0; let snareAvg = 0, snarePrev = 0, lastSnareTrig = 0; let snapFlash = 0;

/* ================= MAIN LOOP ================= */
function loop() {
  raf = requestAnimationFrame(loop);
  
  try {
      if (!renderer || !scene || !camera || !composer) return;

      const dt = 1/60; const time = performance.now() * 0.001;

      if (analyser && dataFreq) {
        analyser.getByteFrequencyData(dataFreq);
        
        let rawSens = panelSensEl ? parseFloat(panelSensEl.value) : 0.1;
        if (isNaN(rawSens)) rawSens = 0.1;
        const sensitivity = Math.max(0.1, Math.min(rawSens, 5.0)); 

        const bass = bandEnergy(dataFreq, 30, 140) * sensitivity; 
        const mid  = bandEnergy(dataFreq, 200, 1200) * sensitivity; 
        const snare = bandEnergy(dataFreq, 1800, 5200) * sensitivity;
        
        bassSm = bassSm * 0.88 + bass * 0.12; midSm  = midSm  * 0.90 + mid  * 0.10; snareSm = snareSm * 0.78 + snare * 0.22;
        snareAvg = snareAvg * 0.965 + snareSm * 0.035; const rise = snareSm - snarePrev; snarePrev = snareSm;
        
        const centroid = getSpectralCentroid(dataFreq, engine.ctx.sampleRate, analyser.fftSize);
        if (centroid > 0) { brightness = brightness * 0.9 + centroid * 0.1; }

        if ((snareSm > snareAvg * 1.45) && (rise > 0.055) && (time - lastSnareTrig) > 0.14) {
          lastSnareTrig = time; snapFlash = 1.0; triggerRingPulse(Math.min(1, snareSm * 1.6)); spawnGhostBurst(P.ghostCount, Math.min(1, snareSm * 1.3), 1.0);
          if (snareSm > 0.4 || bassSm > 0.6) fireSparks(Math.max(snareSm, bassSm), morphMesh);
          
          if (hapticsEnabled && navigator.vibrate && (time - lastVibration > 0.12)) {
              navigator.vibrate(Math.min(40, 20 + snareSm * 30));
              lastVibration = time;
          }
        }
        
        if (hudSignal) {
            let signalText = "SILENCE"; let signalColor = "#555";
            if (bassSm > 0.8) { signalText = "PEAKING"; signalColor = "#ff2d55"; }
            else if (bassSm > 0.2) { signalText = "OPTIMAL"; signalColor = "#00d4ff"; }
            else if (bassSm > 0.01) { signalText = "LOW"; signalColor = "#00d4ff"; }
            if (snapFlash > 0.5) { signalText = "IMPULSE"; signalColor = "#fff"; }
            hudSignal.textContent = signalText; hudSignal.style.color = signalColor;
        }
        
        if (hudTexture) {
            let tex = "--";
            if (bassSm > midSm && bassSm > snareSm && bassSm > 0.3) tex = "SUB-BASS";
            else if (snareSm > bassSm && snareSm > 0.3) tex = "PERCUSSIVE";
            else if (midSm > 0.4) tex = "HARMONIC";
            else if (bassSm > 0.1) tex = "DRONE";
            hudTexture.textContent = tex;
        }
        
        if (hudPitch) {
            let tone = "--";
            if (brightness > 2000) tone = "HIGH";
            else if (brightness > 500) tone = "MID";
            else if (brightness > 100) tone = "LOW";
            hudPitch.textContent = tone; hudPitch.style.color = "#00d4ff";
        }

      } else { bassSm *= 0.97; midSm *= 0.97; snareSm *= 0.97; }
      snapFlash *= 0.86; if (snapFlash < 0.001) snapFlash = 0;

      const mode = paletteEl?.value || "hue";
      let finalHue = 0; let finalSat = 0.75; let finalLum = 0.55;

      if (mode === "grayscale") { finalHue = 0; finalSat = 0; finalLum = 0.8; } 
      else if (mode === "energy") { finalHue = (0.6 + bassSm * 0.4) % 1; finalSat = 0.9; } 
      else { const sliderHue = hueEl ? parseFloat(hueEl.value) : 280; finalHue = ((sliderHue % 360) / 360) + (Math.sin(time * 0.05) * 0.05); } 

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
          let dampValue = trailsEl ? parseFloat(trailsEl.value) : 0;
          if (isNaN(dampValue)) dampValue = 0;
          afterimagePass.uniforms['damp'].value = Math.max(0, dampValue - (snapFlash * 0.1));
      }

      if (rgbShiftPass) rgbShiftPass.uniforms['amount'].value = THREE.MathUtils.lerp(rgbShiftPass.uniforms['amount'].value, 0.0015 + (bassSm * 0.01) + (snapFlash * 0.02), 0.1);
      if (glitchPass) glitchPass.enabled = (bassSm + midSm + snareSm > 2.2 && Math.random() > 0.8);

      if (starPoints) {
        updateStars(dt); const slider = partEl ? parseFloat(partEl.value) : 10; 
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
        
        let zoomInt = zoomEl ? (parseFloat(zoomEl.value) / 100) : 0.18; if (isNaN(zoomInt)) zoomInt = 0.18;
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
        
        let zoomInt = zoomEl ? (parseFloat(zoomEl.value) / 100) : 0.18; if (isNaN(zoomInt)) zoomInt = 0.18;
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
      if (!engineInitialized) await initEngine();
      
      if (!canvas.captureStream) {
          setStatus("❌ Recording not supported on this browser.");
          return;
      }
      
      recBtn.classList.add('recording-pulse');
      
      if (engine && engine.ctx && engine.ctx.state === 'suspended') {
          await engine.ctx.resume();
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));

      const fps = 30; 
      const canvasStream = canvas.captureStream(fps); 
      const videoTrack = canvasStream.getVideoTracks()[0];
      let combinedStream;
      
      try {
          const out = audioRecordDest?.stream; 
          if (out && out.getAudioTracks().length > 0) {
              const audioTrack = out.getAudioTracks()[0];
              combinedStream = new MediaStream([videoTrack, audioTrack]);
              console.log("Audio track successfully bound to recording.");
          } else {
              combinedStream = new MediaStream([videoTrack]);
              console.warn("No audio track found. Recording video only.");
          }
      } catch (audioErr) {
          console.warn("Could not bind audio securely, recording video only.", audioErr);
          combinedStream = new MediaStream([videoTrack]);
      }
      
      recordedChunks = []; 
      const mimeType = pickMime(); 
      mediaRecorder = new MediaRecorder(combinedStream, mimeType ? { mimeType } : undefined);
      mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
      mediaRecorder.onstop = () => { 
          downloadBlob(new Blob(recordedChunks, { type: mimeType || "video/webm" }), `sonic-inclusion-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`); 
          setStatus("✅ Recording saved"); 
      };
      
      mediaRecorder.start(250); 
      recording = true; 
      recBtn.textContent = "⏹ STOP"; 
      setStatus("⏺ Recording…");
      
  } catch (err) {
      console.error("Recording failed to start:", err);
      stopRecording();
      setStatus("❌ Recording failed");
  }
}

function stopRecording() { 
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        try { mediaRecorder.stop(); } catch {} 
    }
    recording = false; 
    recBtn.textContent = "⏺ RECORD"; 
    recBtn.classList.remove('recording-pulse');
}

recBtn.addEventListener("click", async () => { if (!recording) await startRecording(); else stopRecording(); });
