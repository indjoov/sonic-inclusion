import librosa
import numpy as np

class SonicProcessor:
    def __init__(self, file_path):
        self.file_path = file_path
        self.y, self.sr = None, None

    def load_audio(self):
        """Lädt die Audiodatei für die Analyse."""
        self.y, self.sr = librosa.load(self.file_path)
        return f"Loaded {self.file_path} with Sample Rate {self.sr}"

    def get_vibration_data(self):
        """Extrahiert Bass-Frequenzen für haptisches Feedback."""
        # Wir isolieren die tiefen Frequenzen (0-150Hz)
        stft = np.abs(librosa.stft(self.y))
        freqs = librosa.fft_frequencies(sr=self.sr)
        bass_mask = freqs <= 150
        bass_energy = np.mean(stft[bass_mask], axis=0)
        
        # Normalisieren auf Werte zwischen 0 und 1
        return (bass_energy / np.max(bass_energy)).tolist()

    def get_visual_triggers(self):
        """Erkennt Onsets (Anschläge), um visuelle Blitze zu steuern."""
        onset_env = librosa.onset.onset_strength(y=self.y, sr=self.sr)
        peaks = librosa.util.peak_pick(onset_env, pre_max=3, post_max=3, pre_avg=3, post_avg=3, delta=0.5, wait=5)
        return peaks.tolist()

# Beispielhafte Nutzung (für die Doku):
# processor = SonicProcessor("dein_song.wav")
# print(processor.get_vibration_data())
