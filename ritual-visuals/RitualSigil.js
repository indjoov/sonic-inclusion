import * as THREE from "three";

/**
 * RitualSigil
 * - loads an SVG sigil (usually black on white) and turns white background transparent
 * - converts strokes to bright white so additive glow works
 * - reacts strongly to bass + snare "snap"
 *
 * Usage:
 *   const ritual = createRitualSigil();
 *   await ritual.init({ scene, url: "media/indjoov-sigil.svg" });
 *   ritual.update({ freq: dataFreq, sampleRate: engine.ctx.sampleRate, fftSize: analyser.fftSize, dt, t });
 */
export function createRitualSigil() {
  let scene = null;
  let group = null;
  let mesh = null;

  // internal dynamics
  const state = {
    bassSmooth: 0,
    snareSmooth: 0,
    snap: 0,
  };

  // Tunables (more punch/glow)
  const cfg = {
    // Render + size
    planeSize: 7.6,
    zFront: 2.2,

    // Transparency keying
    whiteThreshold: 245, // white bg cutoff

    // Snap detection gains
    bassSnapGain: 5.6,
    snareSnapGain: 7.8,
    snapAttack: 0.75,
    snapDecay: 0.82,

    // Smoothing (lower = snappier)
    bassSmoothA: 0.86,
    snareSmoothA: 0.80,

    // Movement
    breathScale: 0.40,   // bass breathing
    hitScale: 1.05,      // snap punch
    hitRot: 0.14,        // snap spin

    // Glow/Opacity
    baseOpacity: 0.72,
    breathOpacity: 0.35,
    hitOpacity: 0.70,

    // Color morph (purple <-> cyan)
    baseColor: new THREE.Color(1.0, 0.30, 1.0),  // purple
    altColor:  new THREE.Color(0.0, 0.95, 1.0),  // cyan
    colorBoost: 1.35, // extra glow intensity
  };

  function disposeCurrent() {
    if (!group) return;
    scene?.remove(group);
    group.traverse(o => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) {
        if (o.material.map) o.material.map.dispose?.();
        o.material.dispose?.();
      }
    });
    group = null;
    mesh = null;
  }

  function avgBins(freqArr, from, to) {
    const a = freqArr;
    const lo = Math.max(0, from | 0);
    const hi = Math.min(a.length - 1, to | 0);
    let s = 0, n = 0;
    for (let i = lo; i <= hi; i++) { s += a[i]; n++; }
    return n ? (s / n) / 255 : 0;
  }

  async function init({ scene: scn, url }) {
    scene = scn;
    disposeCurrent();

    // Fetch SVG text -> draw to canvas -> key out white -> convert strokes to bright white
    const svgText = await fetch(url).then(r => {
      if (!r.ok) throw new Error(`Sigil fetch failed: HTTP ${r.status}`);
      return r.text();
    });

    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;

    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = dataUrl;
    });

    const size = 1024;
    const cvs = document.createElement("canvas");
    cvs.width = size;
    cvs.height = size;
    const ctx2d = cvs.getContext("2d", { willReadFrequently: true });

    // normalize background to white
    ctx2d.fillStyle = "#ffffff";
    ctx2d.fillRect(0, 0, size, size);

    // fit & center
    const scale = Math.min(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (size - w) / 2;
    const y = (size - h) / 2;
    ctx2d.drawImage(img, x, y, w, h);

    // key out white + convert strokes to white with alpha from darkness
    const imgData = ctx2d.getImageData(0, 0, size, size);
    const d = imgData.data;
    const thr = cfg.whiteThreshold;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      // remove near-white background
      if (r >= thr && g >= thr && b >= thr) { d[i + 3] = 0; continue; }

      // luminance -> darkness
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const darkness = 1 - lum;

      // push pixel to white; alpha from darkness
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
      d[i + 3] = Math.max(d[i + 3], Math.floor(255 * Math.min(1, darkness * 1.25)));
    }
    ctx2d.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: cfg.baseOpacity,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      color: cfg.baseColor.clone(),
    });
    mat.toneMapped = false;

    const geom = new THREE.PlaneGeometry(cfg.planeSize, cfg.planeSize);
    mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 999;

    group = new THREE.Group();
    group.add(mesh);
    group.position.set(0, 0, cfg.zFront);
    group.rotation.x = -0.18;
    group.rotation.y = 0.22;

    // reset dynamics
    state.bassSmooth = 0;
    state.snareSmooth = 0;
    state.snap = 0;

    scene.add(group);
  }

  function update({ freq, sampleRate, fftSize, dt, t }) {
    if (!group || !mesh || !freq) return;

    // Bin mapping: binHz = sampleRate/fftSize
    const binHz = sampleRate / fftSize;

    // target frequency bands (robust defaults)
    // Bass: ~35–140 Hz
    const bassFrom = Math.max(0, Math.floor(35 / binHz));
    const bassTo   = Math.max(bassFrom, Math.floor(140 / binHz));

    // Snare-ish: ~1.5–4.5 kHz
    const snFrom = Math.max(0, Math.floor(1500 / binHz));
    const snTo   = Math.max(snFrom, Math.floor(4500 / binHz));

    const bass = avgBins(freq, bassFrom, bassTo);
    const snare = avgBins(freq, snFrom, snTo);

    // smoothing
    state.bassSmooth = state.bassSmooth * cfg.bassSmoothA + bass * (1 - cfg.bassSmoothA);
    state.snareSmooth = state.snareSmooth * cfg.snareSmoothA + snare * (1 - cfg.snareSmoothA);

    // transient snap
    const bassSnap = Math.max(0, bass - state.bassSmooth);
    const snareSnap = Math.max(0, snare - state.snareSmooth);

    const snapNow = Math.min(1, bassSnap * cfg.bassSnapGain + snareSnap * cfg.snareSnapGain);

    // snap envelope
    state.snap = Math.max(0, state.snap * cfg.snapDecay + snapNow * cfg.snapAttack);
    const hit = Math.min(1, state.snap);

    // Breath = bass smooth
    const breath = Math.min(1, state.bassSmooth);

    // scale punch
    const s = 1 + breath * cfg.breathScale + hit * cfg.hitScale;
    mesh.scale.setScalar(s);

    // rotation kick
    mesh.rotation.z += hit * cfg.hitRot;

    // opacity (never vanish)
    mesh.material.opacity = Math.min(
      1,
      cfg.baseOpacity + breath * cfg.breathOpacity + hit * cfg.hitOpacity
    );

    // color morph (purple -> cyan on snare/hit)
    const morph = Math.min(1, state.snareSmooth * 0.9 + hit * 0.95);
    const c = cfg.baseColor.clone().lerp(cfg.altColor, morph);
    c.multiplyScalar(cfg.colorBoost);
    mesh.material.color.copy(c);

    // subtle z “thump”
    group.position.z = cfg.zFront + breath * 0.55 + hit * 0.30;
  }

  function setPunchGlow({
    bassSnapGain,
    snareSnapGain,
    hitScale,
    colorBoost
  } = {}) {
    if (typeof bassSnapGain === "number") cfg.bassSnapGain = bassSnapGain;
    if (typeof snareSnapGain === "number") cfg.snareSnapGain = snareSnapGain;
    if (typeof hitScale === "number") cfg.hitScale = hitScale;
    if (typeof colorBoost === "number") cfg.colorBoost = colorBoost;
  }

  return { init, update, dispose: disposeCurrent, setPunchGlow };
}
