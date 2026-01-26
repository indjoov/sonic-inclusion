import { Transport } from "./Transport.js";
import { createGain, setGainSmooth } from "./nodes.js";

/**
 * AudioEngine - Professional Audio Management Class
 * Handles routing, buses, and master output
 */
export class AudioEngine {
    constructor() {
        // --- Core state ---
        this.ctx = null;
        this.master = null;
        this.buses = {};
        this.transport = new Transport();
        this.state = "idle";

        // --- Event system ---
        this.listeners = {
            statechange: new Set(),
            error: new Set(),
        };

        // --- Debug flag ---
        this.debug = false;
        this._debugUnsubs = [];
    }

    // --- 3.3 minimal: debug logger ---
    _log(...args) {
        if (this.debug) console.log("[AudioEngine]", ...args);
    }

    // --- 3.2 minimal: tiny event system ---
    _emit(type, payload) {
        const set = this.listeners?.[type];
        if (!set) return;

        for (const fn of set) {
            try {
                fn(payload);
            } catch (e) {
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
        this._log("state:", prev, "->", next);
        this._emit("statechange", { prev, next });
    }

    // --- Engine lifecycle ---
    async init({ startSuspended = true, debug = false } = {}) {
        if (this.ctx) return;

        this.setDebug(!!debug);

        // Create AudioContext (Standard or Webkit for older browsers)
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        
        // --- Master output ---
        this.master = createGain(this.ctx, 0.9);
        this.master.connect(this.ctx.destination);

        // --- Logical buses ---
        this.buses.music = createGain(this.ctx, 0.8);
        this.buses.fx = createGain(this.ctx, 0.8);
        this.buses.ui = createGain(this.ctx, 0.8);

        this.buses.music.connect(this.master);
        this.buses.fx.connect(this.master);
        this.buses.ui.connect(this.master);

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

    stop() {
        if (!this.ctx) return;
        this.transport.stop(this.ctx.currentTime);
    }

    /**
     * Creates a gain node connected to a specific bus
     */
    createSource(bus = "music", gain = 1) {
        if (!this.ctx) return null;
        const g = createGain(this.ctx, gain);
        g.connect(this.buses[bus] || this.master);
        return g;
    }

    /**
     * Bridge for visualizers. 
     * Connects master output to an AnalyserNode.
     */
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

    setDebug(enabled = true) {
        const next = !!enabled;
        if (this.debug === next) return;
        this.debug = next;

        if (this.debug) {
            this._attachDebugListeners();
            this._log("debug enabled");
        } else {
            this._log("debug disabled");
            this._detachDebugListeners();
        }
    }

    _attachDebugListeners() {
        if (this._debugUnsubs.length > 0) return;
        const unsubState = this.on("statechange", ({ prev, next }) => {
            console.log("[AudioEngine:state]", prev, "->", next);
        });
        const unsubErr = this.on("error", (payload) => {
            console.warn("[AudioEngine:error]", payload);
        });
        this._debugUnsubs.push(unsubState, unsubErr);
    }

    _detachDebugListeners() {
        for (const unsub of this._debugUnsubs) {
            try { unsub(); } catch (e) {}
        }
        this._debugUnsubs = [];
    }
}
