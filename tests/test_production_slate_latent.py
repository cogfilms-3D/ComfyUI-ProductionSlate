"""Offline LATENT storage tests, no models, GPU or ComfyUI server required."""
import errno
import json
import os
import sys
import types

import pytest
import torch
from safetensors import safe_open
from safetensors.torch import load_file

from production_slate_latent import (
    prepare_latent, save_prepared_latent, load_production_latent,
    next_latent_take, FORMAT_METADATA_KEY,
)


class FakeNestedTensor:
    is_nested = True

    def __init__(self, parts):
        self.parts = list(parts)

    def unbind(self):
        return self.parts


@pytest.fixture(autouse=True)
def fake_comfy_nested(monkeypatch):
    """Use ComfyUI's NestedTensor contract without importing its runtime."""
    comfy = types.ModuleType("comfy")
    comfy.__path__ = []
    nested = types.ModuleType("comfy.nested_tensor")
    nested.NestedTensor = FakeNestedTensor
    comfy.nested_tensor = nested
    monkeypatch.setitem(sys.modules, "comfy", comfy)
    monkeypatch.setitem(sys.modules, "comfy.nested_tensor", nested)


def compare_payloads(a, b):
    assert set(a) == set(b)
    for key in a:
        x, y = a[key], b[key]
        if isinstance(x, torch.Tensor):
            assert x.dtype == y.dtype and x.shape == y.shape and torch.equal(x, y), key
        elif isinstance(x, FakeNestedTensor):
            assert isinstance(y, FakeNestedTensor) and len(x.parts) == len(y.parts)
            assert all(torch.equal(i, j) for i, j in zip(x.parts, y.parts))
        else:
            assert x == y, key


def test_standard_is_core_compatible_and_preserves_aux(tmp_path):
    payload = {
        "samples": torch.arange(256, dtype=torch.float32).reshape(1, 4, 8, 8),
        "noise_mask": torch.rand(1, 1, 8, 8),
        "downscale_ratio_spacial": 8,
        "type": "image",
        "extra_list": ["x", 7],
    }
    prepared = prepare_latent(payload, prompt={"workflow": "test"})
    assert prepared.fmt == "standard"
    path = tmp_path / "SC001_SH001_001.latent"
    save_prepared_latent(prepared, str(path))
    tensors = load_file(str(path))
    assert "latent_tensor" in tensors and "latent_format_version_0" in tensors
    compare_payloads(payload, load_production_latent(str(path)))
    with safe_open(str(path), framework="pt") as reader:
        assert "prompt" in reader.metadata()
    with pytest.raises(FileExistsError):
        save_prepared_latent(prepared, str(path))


def test_ltx_nested_preserves_masks_and_metadata(tmp_path):
    video = torch.arange(256, dtype=torch.float16).reshape(1, 128, 2, 1, 1)
    audio = torch.arange(256, dtype=torch.float32).reshape(1, 8, 2, 16)
    payload = {
        "samples": FakeNestedTensor([video, audio]),
        "noise_mask": FakeNestedTensor([torch.ones_like(video), torch.zeros_like(audio)]),
        "type": "video",
    }
    prepared = prepare_latent(payload)
    assert prepared.fmt == "av_nested"
    path = tmp_path / "SC001_SH001_002.avlatent"
    save_prepared_latent(prepared, str(path))
    compare_payloads(payload, load_production_latent(str(path)))
    with safe_open(str(path), framework="pt") as reader:
        assert json.loads(reader.metadata()["av_latent_io"])["nested"]
        assert json.loads(reader.metadata()[FORMAT_METADATA_KEY])["part_count"] == 2
        assert "t0" in reader.keys() and "t1" in reader.keys()


def test_h3_motion_context_compatible(tmp_path):
    payload = {"samples": FakeNestedTensor([
        torch.ones(1, 24, 2, 3, 3), torch.ones(1, 32, 2, 6),
    ]), "type": "video"}
    prepared = prepare_latent(payload, "H3 Motion Context (.safetensors)")
    assert prepared.fmt == "h3_motion_context"
    path = tmp_path / "SC001_SH001_003.safetensors"
    save_prepared_latent(prepared, str(path))
    compare_payloads(payload, load_production_latent(str(path)))
    with safe_open(str(path), framework="pt") as reader:
        assert reader.metadata()["format"] == "h3_motion_context_av_v1"
        assert {"video", "audio"}.issubset(reader.keys())


def test_rejects_incompatible_format_and_unsupported_extra(tmp_path):
    nested = {"samples": FakeNestedTensor([
        torch.zeros(1, 24, 2, 2, 2), torch.zeros(1, 32, 2, 5)
    ])}
    with pytest.raises(ValueError, match="cannot store nested"):
        prepare_latent(nested, "ComfyUI Standard (.latent)")
    with pytest.raises(ValueError, match="24 channels"):
        prepare_latent({
            "samples": FakeNestedTensor([
                torch.zeros(1, 128, 2, 2, 2),
                torch.zeros(1, 8, 2, 5),
            ]),
        }, "H3 Motion Context (.safetensors)")
    with pytest.raises(ValueError, match="24 channels"):
        prepare_latent({"samples": torch.zeros(1, 4, 8, 8)}, "H3 Motion Context (.safetensors)")
    with pytest.raises(ValueError, match="unsupported type"):
        prepare_latent({"samples": torch.zeros(1, 4, 8, 8), "custom": object()})
    assert not list(tmp_path.iterdir())


def test_no_overwrite_on_filesystems_without_hardlinks(monkeypatch, tmp_path):
    def unsupported_link(a, b):
        raise OSError(errno.EOPNOTSUPP, "No hardlinks")
    monkeypatch.setattr(os, "link", unsupported_link)
    prepared = prepare_latent({"samples": torch.zeros(1, 4, 8, 8)})
    path = tmp_path / "PS_SC001_SH001_001.latent"
    save_prepared_latent(prepared, str(path))
    assert path.is_file() and next_latent_take(tmp_path, "PS_SC001_SH001_") == 2
    with pytest.raises(FileExistsError):
        save_prepared_latent(prepared, str(path))
