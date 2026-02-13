# Technical Architecture – Sonic Inclusion

## Project Status Overview

| Component                  | Status                                      |
|---------------------------|---------------------------------------------|
| Audio Processing Pipeline | ✅ Implemented                               |
| Real-time Visualization   | ✅ Implemented (Three.js + WebGL)            |
| Accessibility Features    | 🔧 Partially implemented                    |
| AI / ML Integration       | 🔬 To be developed during funding period     |
| Haptic Feedback Layer     | 🔬 To be developed during funding period     |
| Modular Toolkit API       | 🔬 To be developed during funding period     |

---

## 1. High-Level Overview

Sonic Inclusion is an open-source toolkit for transforming acoustic signals into accessible visual and haptic representations in real time.  
The core objective is to make sound **visible, tangible, and interpretable** for people with hearing impairments and diverse sensory needs.

The system is designed around a modular **Source → Analyzer → Visualizer** architecture to ensure:

- Low-latency real-time interaction  
- High extensibility and scalability  
- Clear separation of concerns  
- Accessibility-by-design principles  

All audio processing is performed **client-side in the browser**, avoiding network-induced latency and preserving user privacy.

### Current State

The existing prototype demonstrates real-time audio-to-visual mapping using the Web Audio API and Three.js. It supports microphone input, audio file playback, and configurable visual parameters. The codebase is functional but monolithic — refactoring into independent, reusable modules is a central goal of the funding period.

### Target Architecture (Funding Period)

```
┌─────────────┐    ┌──────────────────┐    ┌───────────────────┐
│ Audio Input  │───▶│  Analysis Layer   │───▶│  Output Layer      │
│              │    │                  │    │                   │
│ • Microphone │    │ • FFT / Bands    │    │ • Visual Renderer │
│ • Audio File │    │ • Onset Detection│    │ • Haptic Output   │
│ • Line-in    │    │ • Bass Extraction│    │ • Screen Reader   │
│              │    │ • AI Classifier  │    │ • Data Export     │
└─────────────┘    └──────────────────┘    └───────────────────┘
                          │
                   ┌──────┴───────┐
                   │ Mapping Layer │
                   │              │
                   │ • Frequency  │
                   │   → Color    │
                   │ • Amplitude  │
                   │   → Scale    │
                   │ • Onset      │
                   │   → Trigger  │
                   └──────────────┘
```

---

## 2. Audio Processing Pipeline — ✅ Implemented

The audio processing pipeline is built using the **Web Audio API**, enabling high-performance signal analysis directly on the user's device.

### 2.1 Input Layer

- **Microphone Input:** Captured via `getUserMedia` with gain control
- **Audio File Input:** Loaded using `AudioBufferSourceNode`
- **Input Gain Stage:** Adjustable sensitivity for different environments

Both input modes are functional in the current prototype.

### 2.2 Analysis Layer

- An `AnalyserNode` performs real-time **Fast Fourier Transform (FFT)** analysis
- Both **frequency-domain** and **time-domain** data are extracted per frame
- Configurable FFT size for balancing resolution and performance

### 2.3 Feature Extraction

The system derives perceptually meaningful features from the raw audio signal:

- **Amplitude / RMS:** Drives intensity, scale, and motion of visuals *(implemented)*
- **Frequency Bands:** Bass (0–150 Hz), mid, and high frequency separation *(implemented)*
- **Spectral Energy:** Used for color intensity and visual density *(implemented)*
- **Onset Detection:** Beat/transient detection for rhythmic visual triggers *(implemented in Python backend, browser integration planned)*
- **Pitch Detection:** Autocorrelation-based fundamental frequency identification *(planned for funding period)*

---

## 3. Visualization Engine — ✅ Implemented (Basic) / 🔧 Refinement Planned

### 3.1 Current Implementation

The visualization layer uses **Three.js** with WebGL for GPU-accelerated rendering:

- Real-time 3D scene with particle systems and morphing geometries
- Post-processing pipeline: Bloom, FXAA, RGB Shift, Afterimage effects
- GLSL shader-based background (procedural nebula)
- Frame-synced rendering via `requestAnimationFrame`
- Responsive layout with DPR-aware scaling

### 3.2 Audio–Visual Mapping

Frequency ranges are mapped to visual parameters, creating a learnable visual language:

- **Low frequencies** → warm colors (reds, purples), large-scale motion
- **Mid frequencies** → greens, blues, medium shapes
- **High frequencies** → bright cyans, yellows, fine detail

Three color modes are currently available:
- Hue by pitch
- Hue by energy
- High-contrast grayscale

### 3.3 Planned Improvements (Funding Period)

- Refactoring the renderer into an independent, swappable module
- Additional visualization modes optimized for accessibility (high-contrast, simplified shapes)
- Configurable mapping profiles that users can customize for their sensory needs
- Optional 2D-only mode (Canvas API) for lower-powered devices

---

## 4. AI & Machine Learning Integration — 🔬 Planned for Funding Period

> **Note:** The AI components described below represent the research and prototyping direction for the funding period. The current prototype uses rule-based DSP (FFT analysis, frequency band extraction). ML-based features will be developed iteratively, starting with lightweight browser-based models.

### 4.1 Sound Classification (Phase 1–2)

- Browser-based ML models via **TensorFlow.js** for real-time sound classification
- Differentiating between:
  - Speech
  - Rhythmic musical material
  - Ambient / environmental sound
  - Percussive transients
- Purpose: automatically adapt visual mapping to the type of audio input

### 4.2 Adaptive Visual Signatures (Phase 2–3)

- Analysis of recurring spectral patterns to assign stable visual identities to sound sources
- Goal: a deaf musician sees a consistent color/shape for a specific instrument across sessions
- Supports perceptual learning and long-term usability

### 4.3 Predictive Smoothing (Phase 2–3, Research)

- Short-horizon prediction of spectral movement to reduce visual jitter
- Focus on subtle transition smoothing, not speculative prediction
- Investigation of lightweight RNN or moving-average hybrid approaches

### 4.4 Design Principles for AI Integration

- **On-device processing only** — no audio data leaves the user's browser
- **Graceful degradation** — the system works fully without AI; ML features enhance but are not required
- **Transparency** — users can see and override AI-driven mapping decisions

---

## 5. Haptic Feedback Layer — 🔬 Planned for Funding Period

Haptic feedback is a core accessibility goal of Sonic Inclusion, enabling deaf and hard-of-hearing users to *feel* musical structure through vibration.

### 5.1 Browser Vibration API (Phase 1)

- Initial implementation using the **Web Vibration API** (`navigator.vibrate`)
- Bass frequency energy (0–150 Hz) drives vibration intensity and pattern
- Onset detection triggers short vibration pulses for rhythmic feedback
- Works on mobile devices (Android) without additional hardware

### 5.2 Extended Haptic Protocols (Phase 2–3)

- Investigation of **Web Bluetooth** or **WebHID** for connecting external vibration devices
- Mapping of frequency bands to multi-channel haptic output
- Research into wearable vibration patterns (wrist, chest, floor)

### 5.3 Backend Support

A Python-based analysis backend (Librosa, FastAPI, NumPy) exists for deeper spectral analysis:

- Bass frequency extraction (0–150 Hz) for vibration pattern generation
- Onset detection for rhythmic trigger points
- Designed to run locally or as a lightweight API for pre-analysis of audio files

*Current status: backend logic implemented, integration with frontend haptic output planned for funding period.*

---

## 6. Accessibility & Inclusion Standards — 🔧 Partially Implemented

Accessibility is a **core architectural constraint** of Sonic Inclusion, not a post-processing feature.

### 6.1 Currently Implemented

- Screen reader support via `aria-live` region for status updates
- Reduced Motion mode (disables rapid animations)
- High-contrast grayscale color mode
- Configurable sensitivity for different hearing/sensory profiles
- Responsive design with safe-area support for mobile devices

### 6.2 To Be Implemented During Funding Period

- **WCAG 2.1 AA compliance:** Full keyboard navigation, focus management, ARIA labels on all interactive elements
- **Multi-modal feedback:** Simultaneous visual + haptic + text output so no single sense is required
- **Customizable sensory profiles:** Users can save and load personal configurations for their specific needs
- **Cognitive accessibility:** Simplified UI mode that reduces controls to essential functions
- **Screen reader narration:** Descriptive audio-visual state updates (e.g., "Strong bass detected — low-frequency vibration active")
- **User testing with target communities:** Structured feedback sessions with deaf and hard-of-hearing musicians

### 6.3 Design Principles

- Redundant encoding: information is conveyed through color + motion + shape + vibration + text simultaneously
- No single-sense dependency: every feature must be perceivable through at least two sensory channels
- Consistent and learnable: visual/haptic mappings remain stable so users can develop intuition over time
- Privacy by design: all processing happens on-device, no audio data is transmitted

---

## 7. Technical Constraints & Optimization

### 7.1 Latency

- All audio analysis and rendering occurs **on-device**
- No server round-trips required for real-time interaction
- Target: sub-15ms latency between audio input and visual/haptic output
- Critical for live performance, rehearsal, and installation contexts

### 7.2 Performance

- Minimal object allocation during render loops
- Decoupled audio analysis rate and visual frame rate
- GPU-accelerated rendering via WebGL/Three.js
- Efficient FFT sizing to balance spectral resolution and responsiveness
- Target: stable 60 FPS on mid-range devices

### 7.3 Browser Compatibility

- Built on native Web Audio API and WebGL for broad browser support
- No mandatory server-side dependencies for core functionality
- Progressive enhancement: advanced features (AI, haptics) activate when supported

---

## 8. Modular Toolkit Strategy — 🔬 Planned for Funding Period

A central goal of the funding period is to refactor Sonic Inclusion from a monolithic prototype into a **modular, reusable toolkit**.

### 8.1 Planned Module Structure

```
sonic-inclusion/
├── src/
│   ├── audio/          # Audio input and analysis modules
│   │   ├── AudioInput.js
│   │   ├── FFTAnalyzer.js
│   │   ├── BassExtractor.js
│   │   └── OnsetDetector.js
│   ├── mapping/        # Audio-to-output mapping logic
│   │   ├── FrequencyColorMap.js
│   │   ├── AmplitudeScaleMap.js
│   │   └── ProfileManager.js
│   ├── visual/         # Visualization renderers
│   │   ├── ThreeJSRenderer.js
│   │   ├── Canvas2DRenderer.js
│   │   └── HighContrastRenderer.js
│   ├── haptic/         # Haptic output modules
│   │   ├── VibrationAPI.js
│   │   └── ExternalDevice.js
│   ├── accessibility/  # Accessibility utilities
│   │   ├── ScreenReaderBridge.js
│   │   ├── KeyboardNav.js
│   │   └── SensoryProfile.js
│   └── ai/             # ML-based analysis (Phase 2+)
│       ├── SoundClassifier.js
│       └── AdaptiveMapper.js
├── backend/            # Python analysis server (optional)
├── docs/               # Documentation and guides
└── demo/               # Standalone demo application
```

### 8.2 Integration Goals

- Each module is independently usable and testable
- Other FOSS projects can import specific modules (e.g., only the bass extractor + vibration output)
- Published as documented, versioned npm packages
- Compatible with existing open-source music tools (Audacity plugins, Web MIDI, DAW integrations)

### 8.3 Open Standards

- Internal audio-to-visual mapping protocol documented as an open specification
- Enables other accessibility and music tech projects to build on the research
- All code released under MIT License

---

## 9. Development Timeline (Funding Period)

| Phase | Months | Focus |
|-------|--------|-------|
| **Phase 1** | 1–2 | Modular refactoring, Vibration API integration, accessibility audit |
| **Phase 2** | 2–3 | TensorFlow.js sound classifier, adaptive mappings, keyboard navigation |
| **Phase 3** | 3–4 | User testing with deaf/HoH musicians, haptic pattern design |
| **Phase 4** | 4–5 | Iteration based on feedback, extended haptic protocols, sensory profiles |
| **Phase 5** | 5–6 | Documentation, npm packaging, community release, demo day preparation |

---

## 10. Summary

Sonic Inclusion exists today as a **working real-time audio visualization prototype** with basic accessibility features. The funding period will transform it into a **modular, AI-assisted accessibility toolkit** that provides deaf and hard-of-hearing musicians with meaningful visual and haptic feedback during music creation and performance.

The project prioritizes:
- **Honesty over hype:** AI features are clearly scoped as development goals, not existing capabilities
- **Accessibility as architecture:** Not a feature flag, but a design constraint that shapes every module
- **Open source as strategy:** Modular design enables reuse by other FOSS projects and accessibility communities
- **Privacy by default:** All processing on-device, no audio data transmitted
