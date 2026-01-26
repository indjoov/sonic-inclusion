import { Transport } from "./Transport.js";
import { createGain, setGainSmooth } from "./nodes.js";

export class AudioEngine {
  constructor() {
    // Core state
    this.ctx = null;
    this.master = null;
    this.buses = {};
    this.transport = new Transport();
    this.state = "idle";

    // --- 3.2 minimal: tiny event system + state helper ---
    this.listeners = {
      statechange: new Set(),
      error: new Set(),
    };
  }

  // --- 3.2 minimal: tiny event system + state helper ---

  _emit(type, payload) {
    const set = this.listeners?.[type];
    if (!set) return;

    for (const fn of set) {
      try {
        fn(payload);
      } catch (e) {
        // avoid infinite loops if an error handler throws
        if (type !== "error") {
          this._emit("error", { error: e, source: "listener", type });
        }
      }
    }
  }

  on(type, fn) {
    const set = this.listeners?.[type];
    if (!set || typeof fn !== "function") return () => {};
    set.add(fn);
    // unsubscribe function
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const set = this.listeners?.[type];
    if (!set) return;
    set.delete(fn);
  }

  _setState(next) {
    if (this.state === next) return;
    const prev = this.state;
    this.state = next;
    this._emit("statechange", { prev, next });
  }

  // --- Engine lifecycle ---

  async init({ startSuspended = true } = {}) {
    if (this.ctx) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Master output
    this.master = createGain(this.ctx, 0.9);

    // Logical buses
    this.buses.music = createGain(this.ctx, 0.8);
    this.buses.fx = createGain(this.ctx, 0.8);
    this.buses.ui = createGain(this.ctx, 0.8);

    this.buses.music.connect(this.master);
    this.buses.fx.connect(this.master);
    this.buses.ui.connect(this.master);

    this.master.connect(this.ctx.destination);

    this._setState("ready");

    if (startSuspended) {
      await this.ctx.suspend();
      this._setState("suspended");
    }
  }

  async resume() {
    if (!this.ctx) return;
    if (this.ctx.state !== "running") {
      await this.ctx.resume();
    }
    this._setState("running");
  }

  play() {
    if (!this.ctx || this.ctx.state !== "running") return;
    this.transport.start(this.ctx.currentTime);
  }

  stop() {
    if (!this.ctx) return;
    this.transport.stop(this.ctx.currentTime);
  }

  createSource(bus = "music", gain = 1) {
    if (!this.ctx) return null;
    const g = createGain(this.ctx, gain);
    g.connect(this.buses[bus] || this.master);
    return g;
  }

  setGains(values = {}) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (values.master !== undefined && this.master?.gain) {
      setGainSmooth(this.master.gain, values.master, now);
    }
    if (values.music !== undefined && this.buses?.music?.gain) {
      setGainSmooth(this.buses.music.gain, values.music, now);
    }
    if (values.fx !== undefined && this.buses?.fx?.gain) {
      setGainSmooth(this.buses.fx.gain, values.fx, now);
    }
    if (values.ui !== undefined && this.buses?.ui?.gain) {
      setGainSmooth(this.buses.ui.gain, values.ui, now);
    }
  }

  async dispose() {
    if (!this.ctx) return;

    try {
      this.transport.reset();
    } catch (e) {
      this._emit("error", { error: e, source: "transport.reset" });
    }

    try {
      this.master?.disconnect();
    } catch (e) {
      this._emit("error", { error: e, source: "master.disconnect" });
    }

    try {
      await this.ctx.close();
    } catch (e) {
      this._emit("error", { error: e, source: "ctx.close" });
    }

    this.ctx = null;
    this.master = null;
    this.buses = {};
    this._setState("disposed");
  }
}
