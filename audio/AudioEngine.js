import { Transport } from "./Transport.js";
import { createGain, setGainSmooth } from "./nodes.js";

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.buses = {};
    this.transport = new Transport();
    this.state = "idle";
  }

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

    this.state = "ready";

    if (startSuspended) {
      await this.ctx.suspend();
      this.state = "suspended";
    }
  }

  async resume() {
    if (!this.ctx) return;
    if (this.ctx.state !== "running") {
      await this.ctx.resume();
    }
    this.state = "running";
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

    if (values.master !== undefined) {
      setGainSmooth(this.master.gain, values.master, now);
    }
    if (values.music !== undefined) {
      setGainSmooth(this.buses.music.gain, values.music, now);
    }
    if (values.fx !== undefined) {
      setGainSmooth(this.buses.fx.gain, values.fx, now);
    }
    if (values.ui !== undefined) {
      setGainSmooth(this.buses.ui.gain, values.ui, now);
    }
  }

  async dispose() {
    if (!this.ctx) return;
    this.transport.reset();
    this.master.disconnect();
    await this.ctx.close();
    this.ctx = null;
    this.state = "disposed";
  }
}
