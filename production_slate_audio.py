"""Shared AUDIO saving utilities for Production Slate V4.5.

Designed to be reused by the standalone Save Audio + Waveform node.
ComfyUI AUDIO payload: {"waveform": Tensor[B,C,T], "sample_rate": int}.
"""
import json
import os
import re
import shutil
import uuid
from datetime import datetime

import av
import folder_paths


AUDIO_EXTENSIONS = {"flac", "wav", "mp3"}


def next_audio_take(audio_dir, prefix):
    """Find the next available take across all supported audio formats."""
    highest = 0
    if os.path.isdir(audio_dir):
        for filename in os.listdir(audio_dir):
            stem, ext = os.path.splitext(filename)
            if ext.lower().lstrip(".") not in AUDIO_EXTENSIONS:
                continue
            if not stem.startswith(prefix):
                continue
            tail = stem[len(prefix):]
            if re.fullmatch(r"[0-9]+", tail):
                highest = max(highest, int(tail))
    return highest + 1


def save_production_audio(
    audio,
    output_root,
    production_name,
    production_code,
    scene,
    shot,
    suffix="",
    audio_format="flac",
    first_take=None,
    prompt=None,
    extra_pnginfo=None,
    date_stamp=None,
):
    """Save each AUDIO batch entry, returning its full saved file paths.

    first_take is supplied by an IMAGE or VIDEO save for matched take IDs.
    When omitted (audio only), numbering is read from the scene Audio folder.
    This routine never changes the original AUDIO payload.
    """
    fmt = str(audio_format).strip().lower()
    if fmt not in AUDIO_EXTENSIONS:
        raise ValueError(f"Unsupported Production Slate audio format: {fmt}")

    if not isinstance(audio, dict) or "waveform" not in audio or "sample_rate" not in audio:
        raise ValueError("Production Slate expects a ComfyUI AUDIO dictionary with waveform and sample_rate.")

    waveform = audio["waveform"]
    rate = int(audio["sample_rate"])
    if rate <= 0 or waveform.ndim != 3 or waveform.shape[1] not in (1, 2):
        raise ValueError("Production Slate AUDIO must contain B x 1-or-2 channels x samples and a valid sample rate.")
    if waveform.shape[0] < 1 or waveform.shape[-1] < 1:
        raise ValueError("Production Slate received an empty AUDIO batch or recording.")

    scene_id = f"SC{int(scene):03d}"
    shot_id = f"SH{int(shot):03d}{suffix}"
    date_stamp = date_stamp or datetime.now().strftime("%y%m%d")
    prefix = f"{production_code}_{scene_id}_{shot_id}_{date_stamp}_"
    audio_dir = os.path.join(output_root, production_name, scene_id, "Audio")
    os.makedirs(audio_dir, exist_ok=True)

    take = int(first_take) if first_take is not None else next_audio_take(audio_dir, prefix)
    if take < 1:
        raise ValueError("Audio take number must be positive.")

    destinations = []
    for index in range(waveform.shape[0]):
        number = take + index
        stem = f"{prefix}{number:03d}"
        path = os.path.join(audio_dir, f"{stem}.{fmt}")
        metadata_path = os.path.join(audio_dir, f"{stem}.json")
        if os.path.exists(metadata_path) or any(
            os.path.exists(os.path.join(audio_dir, f"{stem}.{ext}"))
            for ext in AUDIO_EXTENSIONS
        ):
            raise FileExistsError(
                f"Production Slate audio take already exists: {stem}. "
                "Original files were not overwritten."
            )
        destinations.append((path, metadata_path, number, index))

    results = []
    for path, metadata_path, number, index in destinations:
        # Convert only this batch item on CPU. Original AUDIO is passed through untouched.
        item = waveform[index].detach().cpu().float()
        layout = "mono" if item.shape[0] == 1 else "stereo"
        codec = {"flac": "flac", "mp3": "libmp3lame", "wav": "pcm_s16le"}[fmt]

        # PyAV follows the native ComfyUI AudioSaveHelper audio-frame layout.
        with av.open(path, mode="w", format=fmt) as container:
            stream = container.add_stream(codec, rate=rate, layout=layout)
            if fmt == "mp3":
                stream.bit_rate = 320000
            frame = av.AudioFrame.from_ndarray(
                item.movedim(0, 1).reshape(1, -1).numpy(),
                format="flt",
                layout=layout,
            )
            frame.sample_rate = rate
            frame.pts = 0
            for packet in stream.encode(frame):
                container.mux(packet)
            for packet in stream.encode(None):
                container.mux(packet)

        # Sidecar preserves reloadable workflow metadata across WAV/FLAC/MP3.
        metadata = {
            "production_slate": {
                "format_version": "4.5",
                "production": production_name,
                "code": production_code,
                "scene": scene_id,
                "shot": shot_id,
                "take": number,
                "batch_index": index,
                "format": fmt,
                "sample_rate": rate,
                "channels": int(item.shape[0]),
                "duration_seconds": round(item.shape[-1] / rate, 6),
                "filename": os.path.basename(path),
            },
            "prompt": prompt,
            "extra_pnginfo": extra_pnginfo,
        }
        with open(metadata_path, "x", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2, default=str)

        results.append(path)

    print(f"🎬 Production Slate — saved {len(results)} AUDIO take(s) to {audio_dir}")
    return results

def create_audio_playback_preview(paths):
    """Expose the latest saved take via ComfyUI's standard /view?type=temp route.

    Production files can live outside ComfyUI's configured output directory.
    A randomly named temporary copy is used rather than exposing arbitrary
    local filesystem paths to the browser. No transcoding or modification.
    """
    if not paths:
        return None

    source = paths[-1]
    extension = os.path.splitext(source)[1].lower()
    if extension not in {".flac", ".wav", ".mp3"}:
        raise ValueError("Audio preview requires FLAC, WAV or MP3.")

    filename = f"production_slate_audio_preview_{uuid.uuid4().hex}{extension}"
    destination = os.path.join(folder_paths.get_temp_directory(), filename)
    shutil.copyfile(source, destination)

    return {"filename": filename, "subfolder": "", "type": "temp"}
