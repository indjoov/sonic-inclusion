import { AudioEngine } from "./AudioEngine.js";

(async () => {
  const engine = new AudioEngine();

  // Debug beim Start an + start suspended (gut für Browser-Autoplay-Regeln)
  await engine.init({ startSuspended: true, debug: true });

  // Optional: im DevTools schnell testen
  window.engine = engine;

  // kleine Hinweis-Logs
  console.log("[demo] engine ready, current state:", engine.state);
  console.log("[demo] Try in console: await engine.resume(); engine.play(); engine.stop(); engine.setDebug(false);");

  // Optional: sofort resume für schnellen Test:
  // await engine.resume();
})();
