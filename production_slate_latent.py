"""Lossless, structure-aware LATENT storage for Production Slate V4.5.

The format is selected by inspecting the LATENT socket's *data*, not by
pretending that a model name or file extension accompanies a socket.

ComfyUI Standard:  .latent       (core Load Latent compatible)
AV Nested:         .avlatent     (AV Latent IO compatible for samples)
H3 Motion Context: .safetensors  (H3 Extender compatible for two streams)

Third-party loaders commonly ignore auxiliary latent dictionary fields.
We also serialise all supported auxiliary values into a namespaced metadata
record so a future Production Slate loader can restore the complete payload.
Unknown values raise an error *before any file is written*.
"""

import errno
import json
import os
import re
import shutil
import tempfile
from dataclasses import dataclass
from typing import Any

import torch
from safetensors import safe_open
from safetensors.torch import load_file, save_file


FORMATS = {
    "Auto Detect": None,
    "ComfyUI Standard (.latent)": "standard",
    "AV Nested (.avlatent)": "av_nested",
    "H3 Motion Context (.safetensors)": "h3_motion_context",
}
EXTENSIONS = {"standard": ".latent", "av_nested": ".avlatent", "h3_motion_context": ".safetensors"}
FORMAT_METADATA_KEY = "production_slate_latent_v1"
LATENT_EXTENSIONS = frozenset(EXTENSIONS.values())


@dataclass
class PreparedLatent:
    fmt: str
    extension: str
    tensors: dict
    metadata: dict
    media_hint: str  # 'Video' or 'Images', used only for LATENT-only saves


def _is_nested(value: Any) -> bool:
    return bool(getattr(value, "is_nested", False)) and callable(getattr(value, "unbind", None))


def _components(value: Any, name: str):
    if isinstance(value, torch.Tensor):
        return False, [value]
    if _is_nested(value):
        members = list(value.unbind())
        if not members or not all(isinstance(t, torch.Tensor) for t in members):
            raise ValueError(f"LATENT {name}: unsupported or empty NestedTensor members")
        return True, members
    if isinstance(value, (tuple, list)) and len(value) >= 2 and all(isinstance(t, torch.Tensor) for t in value):
        # Some legacy AV nodes deliver plain Python lists rather than NestedTensor.
        return True, list(value)
    raise ValueError(f"LATENT {name}: expected torch.Tensor or supported nested tensor streams; got {type(value).__name__}")


def _encode_extra(value, tensors, path, depth=0):
    """Encode supported auxiliary fields without pickle or lossy JSON casts."""
    if depth > 24:
        raise ValueError(f"LATENT auxiliary field {path}: nesting too deep")
    if isinstance(value, torch.Tensor):
        name = f"ps_aux_{len(tensors):04d}"
        tensors[name] = value.detach()
        return {"kind": "tensor", "name": name}
    if _is_nested(value):
        _, parts = _components(value, path)
        return {"kind": "nested", "parts": [
            _encode_extra(t, tensors, f"{path}[{i}]", depth + 1) for i, t in enumerate(parts)
        ]}
    if value is None or type(value) in (bool, int, float, str):
        if type(value) is float and not (float('-inf') < value < float('inf')):
            raise ValueError(f"LATENT auxiliary field {path}: non-finite metadata number")
        return {"kind": "scalar", "value": value}
    if isinstance(value, (list, tuple)):
        return {"kind": "tuple" if isinstance(value, tuple) else "list", "items": [
            _encode_extra(v, tensors, f"{path}[{i}]", depth + 1) for i, v in enumerate(value)
        ]}
    if isinstance(value, dict) and all(isinstance(k, str) for k in value):
        return {"kind": "dict", "items": {k: _encode_extra(v, tensors, f"{path}.{k}", depth + 1)
                                           for k, v in value.items()}}
    raise ValueError(f"LATENT auxiliary field {path}: unsupported type {type(value).__name__}; nothing saved")


def _rebuild_nested(parts):
    import comfy.nested_tensor
    return comfy.nested_tensor.NestedTensor(parts)


def _decode_extra(description, tensors):
    kind = description["kind"]
    if kind == "tensor":
        return tensors[description["name"]]
    if kind == "nested":
        return _rebuild_nested([_decode_extra(v, tensors) for v in description["parts"]])
    if kind == "scalar":
        return description["value"]
    if kind in ("tuple", "list"):
        result = [_decode_extra(v, tensors) for v in description["items"]]
        return tuple(result) if kind == "tuple" else result
    if kind == "dict":
        return {k: _decode_extra(v, tensors) for k, v in description["items"].items()}
    raise ValueError(f"Unknown Production Slate latent metadata kind: {kind}")


def prepare_latent(latent, selection="Auto Detect", prompt=None, extra_pnginfo=None):
    """Validate and describe the complete payload, without touching output files."""
    if not isinstance(latent, dict) or "samples" not in latent:
        raise ValueError('Production Slate LATENT requires a dictionary with a "samples" field')
    nested, parts = _components(latent["samples"], "samples")
    if selection not in FORMATS:
        raise ValueError(f"Unknown LATENT save format: {selection}")
    fmt = FORMATS[selection] or ("av_nested" if nested else "standard")
    if fmt == "standard" and nested:
        raise ValueError("ComfyUI Standard (.latent) cannot store nested AV samples; choose AV Nested or H3 Motion Context")
    if fmt == "h3_motion_context" and not (nested and len(parts) == 2 and parts[0].ndim == 5 and parts[1].ndim == 4):
        raise ValueError("H3 Motion Context requires two streams: 5-D video and 4-D audio")

    tensors = {}
    if fmt == "standard":
        tensors["latent_tensor"] = parts[0].detach()
        tensors["latent_format_version_0"] = torch.empty(0)
    elif fmt == "av_nested":
        tensors.update({f"t{i}": t.detach() for i, t in enumerate(parts)})
    else:
        tensors["video"] = parts[0].detach()
        tensors["audio"] = parts[1].detach()

    fields = {key: _encode_extra(val, tensors, key) for key, val in latent.items() if key != "samples"}
    meta_record = {"version": 1, "format": fmt, "nested": nested,
                   "part_count": len(parts), "extra_fields": fields}
    metadata = {FORMAT_METADATA_KEY: json.dumps(meta_record, separators=(",", ":"), ensure_ascii=False)}
    if fmt == "av_nested":
        metadata["av_latent_io"] = json.dumps({"nested": nested, "parts": len(parts), "extra_keys": list(fields)})
    elif fmt == "h3_motion_context":
        metadata["format"] = "h3_motion_context_av_v1"
    if prompt is not None:
        metadata["prompt"] = json.dumps(prompt, ensure_ascii=False)
    if extra_pnginfo is not None:
        for key, val in extra_pnginfo.items():
            # Avoid allowing workflow metadata to overwrite the format markers.
            if key not in metadata:
                metadata[key] = json.dumps(val, ensure_ascii=False)

    # Safetensors only stores dense, strided tensor values. Reject incompatible
    # tensor storage *before* starting media saving, rather than silently casting.
    for key, tensor in tensors.items():
        if tensor.layout != torch.strided or tensor.is_sparse:
            raise ValueError(f"LATENT tensor {key}: unsupported storage layout {tensor.layout}")
    hint = "Video" if nested or parts[0].ndim >= 5 else "Images"
    return PreparedLatent(fmt, EXTENSIONS[fmt], tensors, metadata, hint)


def next_latent_take(folder, prefix):
    """Reserve a take across all supported latent extensions in one folder."""
    highest = 0
    if os.path.isdir(folder):
        for filename in os.listdir(folder):
            stem, ext = os.path.splitext(filename)
            if ext.lower() in LATENT_EXTENSIONS and stem.startswith(prefix):
                tail = stem[len(prefix):]
                if re.fullmatch(r"[0-9]+", tail):
                    highest = max(highest, int(tail))
    return highest + 1


def save_prepared_latent(prepared, destination):
    """Save without overwriting any prior take. On failure remove temp only."""
    directory = os.path.dirname(destination)
    os.makedirs(directory, exist_ok=True)
    if os.path.exists(destination):
        raise FileExistsError(f"Production Slate LATENT already exists: {destination}")
    fd, temporary = tempfile.mkstemp(prefix=".ps_latent_", suffix=prepared.extension, dir=directory)
    os.close(fd)
    try:
        # Convert in CPU memory only; original LATENT socket remains untouched.
        payload = {k: v.cpu().contiguous() for k, v in prepared.tensors.items()}
        save_file(payload, temporary, metadata=prepared.metadata)
        # Atomic create-if-absent where hardlinks are supported (NTFS/local drives).
        # No os.replace: that could destroy an existing numbered production take.
        try:
            os.link(temporary, destination)
        except FileExistsError:
            raise FileExistsError(f"Production Slate LATENT already exists: {destination}")
        except OSError as exc:
            if exc.errno not in (errno.EPERM, errno.EOPNOTSUPP, errno.ENOSYS, errno.EXDEV, errno.EINVAL):
                raise
            # exFAT/network volumes may disallow hardlinks. Safely create the
            # destination exclusively instead; still never overwrite a take.
            output_fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o666)
            try:
                with os.fdopen(output_fd, "wb") as output, open(temporary, "rb") as source:
                    shutil.copyfileobj(source, output, length=1024 * 1024)
                    output.flush()
                    os.fsync(output.fileno())
            except BaseException:
                if os.path.exists(destination):
                    os.remove(destination)
                raise
    finally:
        if os.path.exists(temporary):
            os.remove(temporary)
    return destination


def load_production_latent(path):
    """Verification/recovery reader. Future companion Load Latent node can reuse it."""
    with safe_open(path, framework="pt", device="cpu") as file:
        meta = file.metadata() or {}
        record = json.loads(meta[FORMAT_METADATA_KEY])
    tensors = load_file(path, device="cpu")
    fmt = record["format"]
    if fmt == "standard":
        parts = [tensors["latent_tensor"]]
    elif fmt == "av_nested":
        parts = [tensors[f"t{i}"] for i in range(record["part_count"])]
    elif fmt == "h3_motion_context":
        parts = [tensors["video"], tensors["audio"]]
    else:
        raise ValueError(f"Unknown Production Slate latent format: {fmt}")
    if len(parts) != record["part_count"]:
        raise ValueError("LATENT part count inconsistent with metadata")
    samples = _rebuild_nested(parts) if record["nested"] else parts[0]
    result = {"samples": samples}
    result.update({key: _decode_extra(v, tensors) for key, v in record["extra_fields"].items()})
    return result
