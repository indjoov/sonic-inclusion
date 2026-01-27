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

    async init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Der Master-Regler
        this.master = createGain(this.ctx, 1.0);
        this.master.connect(this.ctx.destination);
        
        // Der Musik-Kanal (Hier landet deine MP3)
        this.buses.music = createGain(this.ctx, 1.0);
        this.buses.music.connect(this.master);
        
        this.state = "ready";
    }

    async resume() {
        if (this.ctx && this.ctx.state !== "running") {
            await this.ctx.resume();
        }
        this.state = "running";
    }

    stop() { if (this.ctx) this.transport.stop(this.ctx.currentTime); }

    createSource(bus = "music") {
        if (!this.ctx) return null;
        const g = createGain(this.ctx, 1.0);
        // Verbindet die MP3-Quelle mit dem Musik-Kanal
        g.connect(this.buses[bus] || this.master);
        return g;
    }

    getVisualizerData() {
        if (!this.ctx) return null;
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
