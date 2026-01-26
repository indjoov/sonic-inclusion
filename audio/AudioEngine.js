import { Transport } from "./Transport.js";
import { createGain, setGainSmooth } from "./nodes.js";

export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.buses = {};
        this.transport = new Transport();
        this.state = "idle";
        this.listeners = { statechange: new Set(), error: new Set() };
    }

    on(type, fn) { this.listeners[type]?.add(fn); }
    _emit(type, data) { this.listeners[type]?.forEach(fn => fn(data)); }

    async init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = createGain(this.ctx, 0.9);
        this.master.connect(this.ctx.destination);
        this.buses.music = createGain(this.ctx, 0.8);
        this.buses.music.connect(this.master);
        this.state = "ready";
    }

    async resume() {
        if (this.ctx?.state !== "running") await this.ctx.resume();
        this.state = "running";
    }

    stop() { this.transport.stop(this.ctx?.currentTime); }

    createSource(bus = "music") {
        const g = createGain(this.ctx, 1);
        g.connect(this.buses[bus] || this.master);
        return g;
    }

    getVisualizerData() {
        const analyser = this.ctx.createAnalyser();
        analyser.fftSize = 2048;
        this.master.connect(analyser);
        return {
            analyser,
            dataFreq: new Uint8Array(analyser.frequencyBinCount),
            dataTime: new Uint8Array(analyser.fftSize)
        };
    }
}
