# Technical Architecture – Sonic Inclusion

## 1. High-Level Overview

Sonic Inclusion is an open-source toolkit for transforming acoustic signals into accessible visual (and optionally haptic) representations in real time.  
The core objective is to make sound **visible, tangible, and interpretable** for people with hearing impairments and diverse sensory needs.

The system follows a modular **Source → Analyzer → Visualizer** architecture to ensure:

- Low-latency real-time interaction  
- High extensibility and scalability  
- Clear separation of concerns  
- Accessibility-by-design principles  

All processing is performed **client-side in the browser**, avoiding network-induced latency and preserving user privacy.

---

## 2. Audio Processing Pipeline

The audio processing pipeline is built using the **Web Audio API**, enabling high-performance signal analysis directly on the user’s device.

### 2.1 Input Layer
- **Microphone Input:** Captured via `getUserMedia`
- **Audio File Input:** Loaded using `AudioBufferSourceNode`

This dual-input approach supports both live performance contexts and pre-recorded material.

### 2.2 Analysis Layer
- An `AnalyserNode` performs real-time **Fast Fourier Transform (FFT)** analysis
- Both **frequency-domain** and **time-domain** data are extracted

### 2.3 Feature Extraction
The system derives perceptually meaningful features from the raw audio signal:

- **Amplitude / RMS:** Drives intensity, scale, and motion of visuals
- **Frequency Bands:** Used for shape complexity and spatial distribution
- **Spectral Centroid:** Interpreted as perceived “brightness” of sound
- **Pitch Detection (planned / optional):** Autocorrelation-based methods to identify fundamental frequencies

These features form the semantic bridge between sound and visual representation.

---

## 3. Visualization Engine

To maintain a stable frame rate (target: **60 FPS**) even under continuous audio input, the visualization layer is optimized for GPU-friendly rendering.

### 3.1 Rendering Technologies
- **HTML5 Canvas API:** Primary 2D rendering surface for waves, shapes, and motion patterns
- **Optional 3D Layer (experimental):** Integration with Three.js for spatial sound exploration

### 3.2 Dynamic Audio–Visual Mapping
- Frequency ranges are mapped to the **HSL color space**, creating an intuitive visual language:
  - Low frequencies → deep reds / purples
  - Mid frequencies → greens / blues
  - High frequencies → bright yellows / cyans
- Temporal audio changes influence animation speed and deformation
- Visual mappings are designed to be **consistent and learnable**, supporting long-term accessibility use

---

## 4. Technical Constraints & Optimization

### 4.1 Latency
- All audio analysis and rendering occurs **on-device**
- No server round-trips are required for real-time interaction
- This is critical for live performance, installation contexts, and accessibility use cases

### 4.2 Performance
- Minimal object allocation during render loops
- Decoupling of audio analysis rate and visual frame rate
- Efficient FFT sizing to balance resolution and responsiveness

### 4.3 Cross-Browser Compatibility
- Native Web Audio API usage for maximum reach
- Optional abstraction layers (e.g. Tone.js) can be introduced if scheduling consistency becomes critical across engines

---

## 5. AI & Machine Learning Integration (Planned / Experimental)

The AI components described below represent the **planned research and prototyping direction** of Sonic Inclusion within the funding period.  
Early versions may be rule-based or heuristic, with gradual integration of lightweight machine learning models.
The models are designed to be privacy-preserving by running entirely on the user's device (Edge AI), ensuring no audio data is ever sent to a server.

### 5.1 Neural Audio Feature Mapping
- Exploration of browser-based ML models (e.g. via **TensorFlow.js**) for sound classification
- Differentiation between sound types such as:
  - Speech
  - Rhythmic musical material
  - Ambient and environmental noise

### 5.2 Adaptive Visual Signatures
- Experimental analysis of recurring spectral patterns
- Goal: assign stable, recognizable visual “signatures” to specific sound sources or instruments
- Supports perceptual learning and long-term accessibility use

### 5.3 Predictive Smoothing (Research Direction)
- Investigation of short-horizon prediction of spectral movement
- Intended to reduce perceived latency and jitter in visual transitions
- Focus on subtle smoothing rather than speculative future-state prediction

### 5.4 Semantic Accessibility Layer
- Planned identification of relevant environmental or musical events
- Optional overlays:
  - Text-based cues
  - Symbolic markers
  - Haptic triggers (future integration)

All ML processing is designed to remain **on-device**, ensuring privacy, transparency, and offline usability.

---

## 6. ♿ Accessibility & Inclusion Standards 

To ensure the project meets the needs of its target audience and aligns with public interest tech goals, the architecture follows these core principles:

### 1. WCAG 2.1 Compliance
The frontend (React) is designed to meet Web Content Accessibility Guidelines (WCAG) 2.1 level AA, ensuring that controls are keyboard-navigable and screen-reader friendly.

### 2. Multi-Modal Feedback Loop
The system is built to provide redundant sensory information:
* **Visual:** Audio data is translated into high-contrast, low-latency visual patterns.
* **Haptic (Future Scope):** The modular backend is prepared to send signal data to haptic devices (vibration motors/wearables) via standard protocols.
* **Cognitive:** Simplified UI modes to reduce cognitive load while interacting with complex audio landscapes.

### 3. Privacy by Design & Sovereignty
* **Local Processing:** By prioritizing client-side audio analysis (Web Audio API), we ensure that sensitive user audio data never leaves the device.
* **Open Protocol:** The internal API for audio-to-visual mapping will be documented as an open standard, allowing other inclusive tech projects to build upon our findings.

Accessibility is treated as a **core architectural constraint**, not a post-processing feature.

- High-contrast color mappings
- Redundant encoding (color + motion + shape)
- Avoidance of single-sense dependency
- Modular design enabling adaptation to different sensory profiles

---

## 7. Extensibility & Open Source Strategy

Sonic Inclusion is structured as a modular toolkit rather than a monolithic application:

- New analyzers can be added without touching the visualization layer
- Visualizers can be swapped or extended independently
- Designed for reuse in:
  - Music software
  - Educational tools
  - Artistic installations
  - Research and accessibility prototyping

The project is released as **open source**, supporting collaboration between artists, developers, and accessibility communities.

---

## 8. Current Status

- Functional real-time audio analysis and visualization prototype
- Publicly accessible demo running in the browser
- Ongoing development focused on:
  - Visual language refinement
  - Accessibility validation
  - Experimental AI integration during the funding phase

