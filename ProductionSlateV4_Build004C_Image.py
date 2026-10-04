# ProductionSlateV4_Build004_Image.py
# Production Slate V4 - Build 004-C
# Image save + native ComfyUI preview
#
# Based on the proven Build 004A image implementation.
# Build 003-B deliberately changes only the UI output/preview mechanism.

import os
import re
from datetime import datetime

from PIL import Image
from PIL.PngImagePlugin import PngInfo
import numpy as np
import json
import folder_paths
from comfy_api.latest import io, ui
#from aiohttp import web
#from server import PromptServer

# ------------------------------------------------------------
# Production Slate V4 - Build 004-C Image
# ------------------------------------------------------------


# ------------------------------------------------------------
# Production Slate Code Generator
# ------------------------------------------------------------

CONNECTOR_WORDS = {
    "a", "an", "and", "as", "at", "by", "for",
    "in", "of", "on", "or", "the", "to"
}

def _generate_code(production_name: str, max_length: int = 8) -> str:
    """Generate the tested deterministic Suggested Code."""
    text = " ".join(str(production_name).strip().split())
    if not text:
        return ""

    cleaned = re.sub(r"[^0-9A-Za-z]+", "", text).upper()

    if cleaned and len(cleaned) <= max_length:
        return cleaned

    tokens = re.findall(r"[A-Za-z]+|\d+", text)

    if tokens and tokens[0].lower() == "the":
        tokens = tokens[1:]

    parts = [
        token if token.isdigit() else token[0].upper()
        for token in tokens
    ]
    candidate = "".join(parts)

    if len(candidate) <= max_length:
        return candidate

    reduced_parts = [
        part for token, part in zip(tokens, parts)
        if token.lower() not in CONNECTOR_WORDS
    ]
    candidate = "".join(reduced_parts)

    if len(candidate) <= max_length:
        return candidate

    numeric_text = "".join(t for t in tokens if t.isdigit())
    letters = "".join(
        part for token, part in zip(tokens, parts)
        if not token.isdigit() and token.lower() not in CONNECTOR_WORDS
    )

    if len(numeric_text) >= max_length:
        return numeric_text[:max_length]

    return (letters[:max_length - len(numeric_text)] + numeric_text).upper()


class ProductionSlateV4_Build004C_Image(io.ComfyNode):

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="ProductionSlateV4_Build004C_Image",
            display_name="🎬 Production Slate V4 — IMAGE 004-C",
            category="Production Slate V4",
            description="Production Slate V4 image saver with native ComfyUI image preview.",
            inputs=[
                io.Image.Input(
                    "image",
                    tooltip="The image to save."
                ),

                io.String.Input(
                    "output_root",
                    default=os.path.join(folder_paths.get_output_directory(), "AI_Films"),
                    tooltip="Root directory for production output."
                ),

                io.String.Input(
                    "production_name",
                    default="Working Title",
                    tooltip="Production name."
                ),

                io.String.Input(
                    "production_code",
                    default="WT",
                    tooltip="Short production code used in filenames."
                ),

                io.Int.Input(
                    "scene",
                    default=1,
                    min=1,
                    tooltip="Scene number."
                ),

                io.Int.Input(
                    "shot",
                    default=1,
                    min=1,
                    tooltip="Shot number."
                ),

                io.String.Input(
                    "suffix",
                    default="",
                    tooltip="Optional shot suffix, for example A or B."
                ),

                io.String.Input(
                    "description",
                    default="Build 004-C recovered master / Code integration test",
                    tooltip="Description of this render."
                ),

                io.Boolean.Input(
                    "clear_slate",
                    default=False,
                    tooltip="Disable Production Slate saving and use the normal ComfyUI output behaviour."
                ),
            ],
            hidden=[
                io.Hidden.prompt,
                io.Hidden.extra_pnginfo,
            ],
            is_output_node=True,
            outputs=[
                io.Image.Output("image"),
                io.String.Output("save_path"),
            ],
        )

    @classmethod
    def validate_inputs(cls, production_name):
        """Prevent production output when no usable Production / Folder is supplied."""
        if not cls._sanitize(production_name):
            return (
                "Production / Folder is required. "
                "Enter a production folder name, or use Working Title."
            )

        return True

    @classmethod
    def execute(
        cls,
        image: io.Image.Type,
        output_root,
        production_name,
        production_code,
        scene,
        shot,
        suffix,
        description,
        clear_slate,
    ):

        # --------------------------------------------------------
        # Clear Slate mode
        # --------------------------------------------------------

        if clear_slate:
            print(
                "🎬 Production Slate inactive\n"
                "Save location: ComfyUI/output\n"
                "Filename: ComfyUI default"
            )

            return io.NodeOutput(
                image,
                "",
                ui=ui.PreviewImage(image)
            )

        # --------------------------------------------------------
        # Sanitise user input
        # --------------------------------------------------------

        output_root = output_root.strip()

        production_name = cls._sanitize(production_name) or "Working Title"
        production_code = cls._sanitize(production_code)
        if not production_code:
            production_code = _generate_code(production_name) or "WT"
        suffix = cls._sanitize(suffix).upper()

        # --------------------------------------------------------
        # Date stamp
        # --------------------------------------------------------

        date_stamp = datetime.now().strftime("%y%m%d")

        # --------------------------------------------------------
        # Scene / shot identifiers
        # --------------------------------------------------------

        scene_id = f"SC{scene:03d}"
        shot_id = f"SH{shot:03d}{suffix}"

        # --------------------------------------------------------
        # Folder structure
        #
        # Build 004-B image structure.
        # Images are stored separately from video output.
        # --------------------------------------------------------

        root = output_root

        production_path = os.path.join(
            root,
            production_name
        )

        media_path = os.path.join(
            production_path,
            "Images"
        )

        scene_path = os.path.join(
            media_path,
            scene_id
        )
        os.makedirs(
            scene_path,
            exist_ok=True
        )

        # --------------------------------------------------------
        # Disk-based take discovery
        # --------------------------------------------------------

        prefix = (
            f"{production_code}_"
            f"{scene_id}_"
            f"{shot_id}_"
            f"{date_stamp}_"
        )

        highest_take = 0

        if os.path.exists(scene_path):

            for fname in os.listdir(scene_path):

                if not fname.startswith(prefix):
                    continue

                full_path = os.path.join(
                    scene_path,
                    fname
                )

                if not os.path.isfile(full_path):
                    continue

                if os.path.splitext(fname)[1].lower() != ".png":
                    continue

                try:
                    stem = os.path.splitext(fname)[0]
                    take_str = stem.split("_")[-1]

                    highest_take = max(
                        highest_take,
                        int(take_str)
                    )

                except (ValueError, IndexError):
                    pass

        take = highest_take + 1

        # --------------------------------------------------------
        # Filename
        # --------------------------------------------------------

        filename = (
            f"{production_code}_"
            f"{scene_id}_"
            f"{shot_id}_"
            f"{date_stamp}_"
            f"{take:03d}"
        )

        # --------------------------------------------------------
        # Full save path
        # --------------------------------------------------------

        full_save_path = os.path.join(
            scene_path,
            filename
        )

        png_path = full_save_path + ".png"

        # --------------------------------------------------------
        # Save PNG
        # --------------------------------------------------------

        img = image[0].cpu().numpy()

        img = np.clip(
            img * 255.0,
            0,
            255
        ).astype(np.uint8)

        pil_image = Image.fromarray(img)

        metadata = PngInfo()

        # Hidden prompt/metadata are deliberately handled through
        # the V3 API wrapper by ComfyUI where available.

        if getattr(cls.hidden, "prompt", None) is not None:
            metadata.add_text(
                "prompt",
                json.dumps(cls.hidden.prompt)
            )

        if getattr(cls.hidden, "extra_pnginfo", None) is not None:
            for key, value in cls.hidden.extra_pnginfo.items():
                metadata.add_text(
                    key,
                    json.dumps(value)
                )

        pil_image.save(
            png_path,
            pnginfo=metadata
        )

        # --------------------------------------------------------
        # Production information
        # --------------------------------------------------------

        preview_text = (
            f"🎬 Production Slate V4 — IMAGE\n"
            f"------------------------------------------\n"
            f"Production : {production_name}\n"
            f"Scene      : {scene_id}\n"
            f"Shot       : {shot_id}\n"
            f"Take       : {take:03d}\n"
            f"Filename   : {filename}.png\n"
            f"Location   : {scene_path}\n"
            f"Description: {description}"
        )

        print(preview_text)

        # --------------------------------------------------------
        # Native ComfyUI image preview
        #
        # PreviewImage creates its own temporary preview image
        # using ComfyUI's native PreviewImage implementation.
        # --------------------------------------------------------

        return io.NodeOutput(
            image,
            png_path,
            ui=ui.PreviewImage(image)
        )

    # ------------------------------------------------------------
    # Filename sanitisation
    # ------------------------------------------------------------

    @staticmethod
    def _sanitize(text: str) -> str:
        """Remove characters unsafe for filenames."""

        return "".join(
            c
            for c in text
            if c not in r'<>:"/\\|?*'
        ).strip()



# ------------------------------------------------------------ ready to continue
# Node registration
# ------------------------------------------------------------

NODE_CLASS_MAPPINGS = {
    "ProductionSlateV4_Build004C_Image":
        ProductionSlateV4_Build004C_Image
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ProductionSlateV4_Build004C_Image":
        "🎬 Production Slate V4 — IMAGE 004-C"
}