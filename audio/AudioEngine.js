import { Transport } from "./Transport.js";
import { createGain, setGainSmooth } from "./nodes.js";

/**
 * AudioEngine - Zentrale für Tonverarbeitung
 */
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
        
        // Erstellt den Audio-Kontext
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Master-Ausgang (Hier wird alles zusammengeführt)
        this.master = createGain(this.ctx, 0.9);
        this.master.connect(this.ctx.destination);
        
        // Musik-Bus (Hier landet deine MP3)
        this.buses.music = createGain(this.ctx, 0.8);
        this.buses.music.connect(this.master);
        
        this.state = "ready";
    }

    async resume() {
        if (!this.ctx) return;
        if (this.ctx.state !== "running") {
            await this.ctx.resume();
        }
        this.state = "running";
    }

    stop() { 
        if (this.ctx) this.transport.stop(this.ctx.currentTime); 
    }

    /**
     * Erstellt eine Tonquelle, die automatisch mit dem Musik-Bus verbunden ist
     */
    createSource(bus = "music") {
        if (!this.ctx) return null;
        const g = createGain(this.ctx, 1);
        // Verbindet die Quelle mit dem gewählten Bus oder direkt mit Master
        g.connect(this.buses[bus] || this.master);
        return g;
    }

    /**
     * Liefert die Daten für deine bunten Kreise
     */
    getVisualizerData() {
        if (!this.ctx) return null;
        const analyser = this.ctx.createAnalyser();
        analyser.fftSize = 2048;
        // Verbindet den Master mit dem Analyser für die Optik
        this.master.connect(analyser);
        
        return {
            analyser,
            dataFreq: new Uint8Array(analyser.frequencyBinCount),
            dataTime: new Uint8Array(analyser.fftSize)
        };
    }
}
