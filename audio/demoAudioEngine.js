import { AudioEngine } from "./AudioEngine.js";

const engine = new AudioEngine();

// log state changes + errors
engine.on("statechange", ({ prev, next }) =>
  console.log("[AudioEngine] state:", prev, "→", next)
);
engine.on("error", (payload) =>
  console.error("[AudioEngine] error:", payload)
);

window.engine = engine; // for manual testing in devtools

(async () => {
  await engine.init({ startSuspended: true });
  await engine.resume(); // optional but nice for immediate feedback
})();
