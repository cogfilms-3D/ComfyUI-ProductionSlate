# ============================================================
# Production Slate V4.4 — Browse Backend
#
# Provides the independent directory-browser backend used by
# the ProductionSlate frontend.
#
# Responsibilities:
#   - list available drives
#   - provide the default ProductionSlate output location
#   - enumerate visible subdirectories
#   - validate folder availability and writability
#   - provide parent/folder information for Production selection
#
# Independent of VideoHelperSuite and other external node packs.
# ============================================================

import os

from aiohttp import web
import folder_paths
from server import PromptServer


# ------------------------------------------------------------
# Production Slate Browse Backend
# ------------------------------------------------------------
# Independent ProductionSlate directory browser.
# This does not depend on VideoHelperSuite.


@PromptServer.instance.routes.post("/production_slate/getpath")
async def production_slate_browse(request):
    try:
        data = await request.json()
    except Exception:
        return web.json_response(
            {"error": "Invalid JSON request."},
            status=400
        )

    path = data.get("path", "")

    if not isinstance(path, str):
        return web.json_response(
            {"error": "Invalid path."},
            status=400
        )

    if not path.strip():
        return web.json_response(
            {
                "path": "",
                "directories": [],
                "drives": os.listdrives(),
                "default_path": os.path.join(
                    folder_paths.get_output_directory(),
                    "AI_Films"
                )
            }
        )

    path = os.path.abspath(
        os.path.expanduser(path.strip())
    )

    if not os.path.isdir(path):
        return web.json_response(
            {
                "path": path,
                "directories": [],
                "error": "This location is unavailable or is not a folder."
            },
            status=404
        )

    directories = []

    try:
        with os.scandir(path) as entries:
            for entry in entries:
                try:
                    if entry.is_dir():
                        # Hide dot-prefixed directories.
                        if entry.name.startswith("."):
                            continue

                        # Hide Windows Hidden/System directories.
                        try:
                            attributes = entry.stat(
                                follow_symlinks=False
                            ).st_file_attributes

                            if attributes & 0x02:  # FILE_ATTRIBUTE_HIDDEN
                                continue

                            if attributes & 0x04:  # FILE_ATTRIBUTE_SYSTEM
                                continue

                        except OSError:
                            pass

                        writable = os.access(
                            entry.path,
                            os.W_OK
                        )

                        directories.append(
                            {
                                "name": entry.name,
                                "writable": writable
                            }
                        )
                except OSError:
                    pass

    except OSError:
        return web.json_response(
            {
                "path": path,
                "directories": [],
                "error": "Unable to read this location."
            },
            status=403
        )

    directories.sort(key=lambda directory: directory["name"].casefold())

    parent_path = os.path.dirname(path)
    folder_name = os.path.basename(path)
    writable = os.access(path, os.W_OK)

    return web.json_response(
        {
            "path": path,
            "directories": directories,
            "writable": writable,
            "parent_path": parent_path,
            "folder_name": folder_name,
            "can_select_production": (
                writable
                and bool(folder_name)
                and parent_path != path
            )
        }
    )