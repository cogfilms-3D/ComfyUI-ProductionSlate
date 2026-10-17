"""Offline smoke tests for the V4.5 read-only Load Latent companion node."""

import importlib.util
import sys
import types
from pathlib import Path

import pytest
import torch

from production_slate_latent import prepare_latent, save_prepared_latent


@pytest.fixture
def loader(monkeypatch, tmp_path):
    """Import the standalone node without needing a running ComfyUI server."""
    class Routes:
        def post(self, _route):
            return lambda fn: fn

    folder_paths = types.ModuleType("folder_paths")
    folder_paths.get_output_directory = lambda: str(tmp_path)
    server = types.ModuleType("server")
    server.PromptServer = types.SimpleNamespace(
        instance=types.SimpleNamespace(routes=Routes())
    )
    monkeypatch.setitem(sys.modules, "folder_paths", folder_paths)
    monkeypatch.setitem(sys.modules, "server", server)

    package_name = "production_slate_loader_testpkg"
    package = types.ModuleType(package_name)
    package.__path__ = [str(Path(__file__).resolve().parents[1])]
    monkeypatch.setitem(sys.modules, package_name, package)

    import production_slate_latent
    monkeypatch.setitem(
        sys.modules, package_name + ".production_slate_latent", production_slate_latent
    )

    module_name = package_name + ".production_slate_load_latent"
    source = Path(__file__).resolve().parents[1] / "production_slate_load_latent.py"
    spec = importlib.util.spec_from_file_location(module_name, source)
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, module_name, module)
    spec.loader.exec_module(module)
    return module


def test_standard_latent_round_trip(loader, tmp_path):
    image_latent = {"samples": torch.arange(256, dtype=torch.float32).reshape(1, 4, 8, 8)}
    path = tmp_path / "test.latent"
    save_prepared_latent(prepare_latent(image_latent), str(path))

    (restored,) = loader.ProductionSlateLoadLatent().load(str(path))
    assert torch.equal(restored["samples"], image_latent["samples"])
    assert loader.ProductionSlateLoadLatent.IS_CHANGED(str(path)) != float("nan")
    assert path.exists()  # reader is read-only


def test_clear_errors_for_missing_or_unsupported_files(loader, tmp_path):
    node = loader.ProductionSlateLoadLatent()
    with pytest.raises(ValueError, match="select a saved LATENT"):
        node.load("")
    with pytest.raises(ValueError, match="supports .latent"):
        node.load(str(tmp_path / "test.txt"))
    with pytest.raises(FileNotFoundError, match="file not found"):
        node.load(str(tmp_path / "missing.latent"))


def test_rejects_unrecognised_safetensors_without_crashing(loader, tmp_path):
    from safetensors.torch import save_file

    path = tmp_path / "model.safetensors"
    save_file({"test": torch.zeros(1)}, str(path))
    with pytest.raises(ValueError, match="not a supported V4.5"):
        loader.ProductionSlateLoadLatent().load(str(path))
