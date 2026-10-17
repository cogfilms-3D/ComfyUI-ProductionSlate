"""Small, read-only companion loader for Production Slate V4.5 LATENT files.

Uses the existing lossless Production Slate latent reader. This node does not
sample, decode, convert, modify or save latents.
"""

import os

from aiohttp import web
import folder_paths
from server import PromptServer

from .production_slate_latent import load_production_latent


LATENT_EXTENSIONS = (".latent", ".avlatent", ".safetensors")


def _file_path(value):
    """Validate an explicitly selected local latent file before opening it."""
    path = str(value or "").strip().strip('"').strip("'")
    if not path:
        raise ValueError("Production Slate Load Latent: select a saved LATENT file with Browse.")
    path = os.path.abspath(os.path.expandvars(os.path.expanduser(path)))
    if not path.lower().endswith(LATENT_EXTENSIONS):
        raise ValueError(
            "Production Slate Load Latent supports .latent, .avlatent and .safetensors files."
        )
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Production Slate Load Latent: file not found: {path}")
    return path


class ProductionSlateLoadLatent:
    """Load a Production Slate V4.5 latent without copying to ComfyUI/input."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "latent_path": ("STRING", {"default": "", "multiline": False}),
        }}

    RETURN_TYPES = ("LATENT",)
    RETURN_NAMES = ("latent",)
    FUNCTION = "load"
    CATEGORY = "Production Slate V4"
    DESCRIPTION = (
        "Browse to a saved Production Slate .latent, .avlatent or H3 .safetensors "
        "file and recover its original LATENT payload."
    )

    @classmethod
    def IS_CHANGED(cls, latent_path):
        try:
            stat = os.stat(_file_path(latent_path))
            return f"{stat.st_mtime_ns}:{stat.st_size}"
        except (OSError, ValueError):
            return float("nan")

    def load(self, latent_path):
        path = _file_path(latent_path)
        try:
            latent = load_production_latent(path)
        except (KeyError, ValueError, TypeError) as exc:
            raise ValueError(
                "Production Slate Load Latent: this is not a supported V4.5 "
                "Production Slate latent file, or its metadata is incomplete."
            ) from exc
        print(f"🎬 Production Slate — loaded LATENT from {path}")
        return (latent,)


@PromptServer.instance.routes.post("/production_slate/latent_files")
async def production_slate_latent_files(request):
    """Read-only local folder listing for the companion node's Browse dialog."""
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON request."}, status=400)

    requested = data.get("path", "")
    if not isinstance(requested, str):
        return web.json_response({"error": "Invalid folder path."}, status=400)

    candidate = requested.strip() or folder_paths.get_output_directory()
    candidate = os.path.abspath(os.path.expandvars(os.path.expanduser(candidate)))

    if os.path.isfile(candidate):
        candidate = os.path.dirname(candidate)
    if not os.path.isdir(candidate):
        return web.json_response({
            "error": "This folder is not available.",
            "path": candidate,
        }, status=404)

    directories, files = [], []
    try:
        with os.scandir(candidate) as entries:
            for entry in entries:
                try:
                    if entry.name.startswith("."):
                        continue
                    if entry.is_dir():
                        directories.append(entry.name)
                    elif entry.is_file() and entry.name.lower().endswith(LATENT_EXTENSIONS):
                        files.append(entry.name)
                except OSError:
                    continue
    except OSError:
        return web.json_response({
            "error": "Unable to read this folder.",
            "path": candidate,
        }, status=403)

    directories.sort(key=str.casefold)
    files.sort(key=str.casefold)

    if hasattr(os, "listdrives"):
        drives = list(os.listdrives())
    else:
        drives = [os.path.abspath(os.sep)]

    return web.json_response({
        "path": candidate,
        "parent_path": os.path.dirname(candidate),
        "drives": drives,
        "directories": directories,
        "files": files,
    })
