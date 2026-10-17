"""Compact, lossless-time-axis waveform summaries for Production Slate.

Visualisation data is independent of file saving so it can be reused by
a future standalone Save Audio + Waveform node. No audio is modified.
"""
import os

import numpy as np


def audio_waveform_preview(audio, paths, columns=640):
    """Return a small, JSON-serialisable peak + RMS timeline for each take.

    All tracks retain full-scale amplitude (0.0 to 1.0). We deliberately do
    not normalise each take independently: batch loudness should be comparable.
    """
    if audio is None:
        return None
    if not isinstance(audio, dict) or "waveform" not in audio or "sample_rate" not in audio:
        raise ValueError("Production Slate waveform preview needs standard ComfyUI AUDIO data.")

    tensor = audio["waveform"]
    sample_rate = int(audio["sample_rate"])
    if sample_rate <= 0 or getattr(tensor, "ndim", None) != 3:
        raise ValueError("Expected AUDIO waveform [batch, channels, samples] and sample_rate.")

    tracks = []
    for index in range(int(tensor.shape[0])):
        # Work on one take at a time, never duplicating a full batch on the CPU.
        clip = tensor[index].detach().float().cpu().numpy()
        channels, samples = clip.shape
        if samples <= 0:
            continue

        count = min(int(columns), samples)
        boundaries = np.linspace(0, samples, count + 1, dtype=np.int64)
        peak = np.empty(count, dtype=np.float32)
        rms = np.empty(count, dtype=np.float32)

        for col in range(count):
            section = clip[:, boundaries[col]:boundaries[col + 1]]
            # Stereo is represented by the strongest peak in either channel.
            peak[col] = float(np.max(np.abs(section)))
            rms[col] = float(np.sqrt(np.mean(section * section)))

        name = os.path.basename(paths[index]) if index < len(paths) else f"Take {index + 1}"
        tracks.append({
            "name": name,
            "duration": round(samples / sample_rate, 3),
            "sample_rate": sample_rate,
            "channels": int(channels),
            "peak": np.round(peak, 4).tolist(),
            "rms": np.round(rms, 4).tolist(),
            "max_peak": round(float(np.max(peak)), 4),
        })

    return {"version": 1, "tracks": tracks, "level_mode": "full_scale"}
