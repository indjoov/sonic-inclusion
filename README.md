# Sonic Inclusion – Open Toolkit for Accessible Sound Design using AI

## 🔗 Live Demo

👉 [Sonic Inclusion – Try it here](https://indjoov.github.io/sonic-inclusion/)

This is a working prototype running in the browser.  
Use microphone input or upload an audio file to see real-time color & shape visualizations.

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License: MIT">
  <img src="https://img.shields.io/badge/status-Prototype-blue.svg" alt="Status: Prototype">
  <img src="https://img.shields.io/badge/AI-Powered-orange.svg" alt="AI Powered">
  <img src="https://img.shields.io/badge/Accessibility-Inclusive-brightgreen.svg" alt="Inclusive Design">
  <img src="https://img.shields.io/badge/Open%20Source-Yes-success.svg" alt="Open Source">
</p>
 

- [Architecture](./ARCHITECTURE.md) — system overview and accessibility-by-design principles.
**Vision:**  
_Making sound visible, touchable, and inclusive for everyone._ 🌍🎶✨
---

## 🛠 Technical Architecture & Implementation

Sonic Inclusion is built as a modular framework designed for high-performance audio processing:

* **Audio Pipeline:** Uses the **Web Audio API** for real-time signal acquisition and **Fast Fourier Transform (FFT)** to extract frequency data without blocking the main thread.
* **AI Backend:** A Python-powered core utilizing **Librosa** and **NumPy** for deep spectral analysis, including onset detection and bass frequency extraction (0-150Hz) for haptic patterns.
* **Synchronization:** Leverages `requestAnimationFrame` to ensure sub-15ms latency between audio triggers and visual rendering, providing a seamless experience for sensory needs.

---
## About the Project

**Sonic Inclusion** is an open-source toolkit that empowers musicians, artists, and developers to create **barrier-free sound experiences**.  
The project explores how **AI-driven tools** can support people with hearing impairments and diverse sensory needs by:

- 🎵 **Translating audio into adaptive visual & haptic feedback**
- 🧩 **Providing modular tools** for inclusive music software and installations
- 🤝 **Enabling collaboration** between sound artists, developers, and accessibility communities
 ---

## 🚀 Technical Core: AI Audio Analysis
The toolkit now includes a Python-powered backend for deep audio analysis:
- **Haptic Feedback:** Extracting bass frequencies (0-150Hz) for vibration patterns.
- **Visual Triggers:** Onset detection for real-time visual accessibility.
- **Powered by:** Librosa, FastAPI, and NumPy.

*You can find the logic in the `/backend` directory.*
Public available resource for inclusive audio-visual design. 
Prototype Fund Germany application submitted. 

[![Project Status: Active – Phase 1 Research & Planning](https://img.shields.io/badge/Status-Active%20%E2%80%93%20Phase%201%20Research%20%26%20Planning-brightgreen?style=for-the-badge)](./docs/ROADMAP_OVERVIEW.md)

---
### 🧭 Development Roadmap
📄 [View Full Roadmap Overview →](./docs/ROADMAP_OVERVIEW.md)

The roadmap outlines all six project phases — from research to release — including milestones, technical tasks, and collaboration goals.  
Each task in the roadmap is synchronized with the GitHub Project **“Development Roadmap – Sonic Inclusion.”**
---

## Goals

- Build an **AI-powered accessibility toolkit** for sound and music
- Support **artists, educators, and communities** with practical tools
- Release everything as **open-source** (MIT License) to ensure free use and collaboration

## Roadmap

**Phase 1 – Prototyping (Months 1–3):**

- Develop first AI models for sound-to-visual mapping
- Build simple demo apps (desktop & web)

**Phase 2 – Testing (Months 4–5):**

- User testing with artists, educators & accessibility communities
- Improve accessibility features (screen readers, alternative input methods)

**Phase 3 – Release (Month 6):**

- Publish toolkit with documentation
- Share with open-source and cultural communities

**(Optional) Second Stage (Months 7–10):**

- Expand toolkit with plugins for DAWs and live performance setups
- Build community network around inclusive music-making

## Demo

This repository includes a tiny browser demo:

- Open `index.html` locally in your browser.
- Click **“Use Microphone”** or **“Load Audio File”** to see the visualisation.
- Adjust **Sensitivity** and **Color Mode** for different accessibility needs.

> Note: Runs locally without dependencies. Uses the Web Audio API.

## Contributing

Contributions, feedback, and collaborations are welcome!  
Please open an issue or submit a pull request.

## License

This project is licensed under the **MIT License** – free to use, adapt, and share.

## Contact

👤 **Nicola Indjov**  
🎸 Musician | Developer | Founder of Indjoov Arts  
📧 [niki.indjov@gmail.com](mailto:niki.indjov@gmail.com)  
🌐 [indjoov.com](https://indjoov.com)

✨ _With Sonic Inclusion, we aim to turn sound into a shared, inclusive experience for all._
