# ProductionSlateV4_Build004C_Video.py
# Production Slate V4 - Build 004-C
# Video saver + native ComfyUI video preview
#
# Development branch based on the proven Build 004-B video implementation.
# Goal: bring VIDEO into feature parity with the stable IMAGE 004-C build
# while preserving the existing video save and preview behaviour.
#
# Permanent production video:
#     Selected ProductionSlate output location
#
# Temporary preview video:
#     ComfyUI temp directory
#
# The production file remains the authoritative master.

import os
import re
import uuid
from datetime import datetime

import folder_paths
from comfy_api.latest import io, ui, Types

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

    return (
        letters[:max_length - len(numeric_text)] + numeric_text
    ).upper()

class ProductionSlateV4_Build004C_Video(io.ComfyNode):

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="ProductionSlateV4_Build004C_Video",
            display_name="🎬 Production Slate V4 — VIDEO 004-C",
            category="Production Slate V4",
            description=(
                "Production Slate video saver with native ComfyUI "
                "video preview."
            ),

            inputs=[
                io.Video.Input(
                    "video",
                    tooltip="The completed video from Create Video."
                ),

                io.String.Input(
                    "output_root",
                    default=os.path.join(folder_paths.get_output_directory(), "AI_Films"),
                    tooltip="Root directory for production files."
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
                    default="Build 004-C video development test",
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
                io.Hidden.extra_pnginfo
            ],

            is_output_node=True,

            outputs=[
                io.Video.Output("video"),
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

    @staticmethod
    def _sanitize(text: str) -> str:
        """Remove characters unsafe for filenames."""
        return "".join(
            c for c in str(text)
            if c not in r'<>:"/\|?*'
        ).strip()

    @classmethod
    def execute(
        cls,
        video,
        output_root,
        production_name,
        production_code,
        scene,
        shot,
        suffix,
        description,
        clear_slate,
    ):
        # ------------------------------------------------------------
        # Clear Slate mode
        # ------------------------------------------------------------

        if clear_slate:
            print(
                "🎬 Production Slate inactive\n"
                "Save location: ComfyUI/output\n"
                "Filename: ComfyUI default"
            )

            return io.NodeOutput(
                video,
                "",
                ui=ui.PreviewVideo(video)
            )

        # ------------------------------------------------------------
        # Sanitize user input
        # ------------------------------------------------------------

        output_root = os.path.abspath(
            os.path.expanduser(str(output_root).strip())
        )

        production_name = (
            cls._sanitize(production_name)
            or "Working Title"
        )

        production_code = cls._sanitize(production_code)

        if not production_code:
            production_code = _generate_code(production_name) or "WT"

        suffix = cls._sanitize(suffix).upper()

        # ------------------------------------------------------------
        # Date stamp
        # YYMMDD
        # ------------------------------------------------------------

        date_stamp = datetime.now().strftime("%y%m%d")

        # ------------------------------------------------------------
        # Scene / shot identifiers
        # ------------------------------------------------------------

        scene_id = f"SC{int(scene):03d}"
        shot_id = f"SH{int(shot):03d}{suffix}"

        # ------------------------------------------------------------
        # Production folder structure
        # ------------------------------------------------------------

        if os.path.basename(os.path.normpath(output_root)) == production_name:
            production_path = output_root
        else:
            production_path = os.path.join(
                output_root,
                production_name
            )

        media_path = os.path.join(
            production_path,
            "Video"
        )

        scene_path = os.path.join(
            media_path,
            scene_id
        )

        os.makedirs(
            scene_path,
            exist_ok=True
        )

        # ------------------------------------------------------------
        # Disk-based take discovery
        # ------------------------------------------------------------

        prefix = (
            f"{production_code}_"
            f"{scene_id}_"
            f"{shot_id}_"
            f"{date_stamp}_"
        )

        highest_take = 0

        for fname in os.listdir(scene_path):

            if not fname.startswith(prefix):
                continue

            full_path = os.path.join(
                scene_path,
                fname
            )

            if not os.path.isfile(full_path):
                continue

            extension = os.path.splitext(
                fname
            )[1].lower()

            if extension not in {
                ".mp4",
                ".webm",
                ".mov",
                ".mkv",
                ".avi",
                ".m4v",
            }:
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

        # ------------------------------------------------------------
        # Production filename
        # ------------------------------------------------------------

        filename = (
            f"{production_code}_"
            f"{scene_id}_"
            f"{shot_id}_"
            f"{date_stamp}_"
            f"{take:03d}"
        )

        output_filename = f"{filename}.mp4"

        full_save_path = os.path.join(
            scene_path,
            output_filename
        )

        # ------------------------------------------------------------
        # Metadata
        # ------------------------------------------------------------

        saved_metadata = None
        metadata = {}

        if cls.hidden.extra_pnginfo is not None:
            metadata.update(
                cls.hidden.extra_pnginfo
            )

        if cls.hidden.prompt is not None:
            metadata["prompt"] = cls.hidden.prompt

        if metadata:
            saved_metadata = metadata

        # ------------------------------------------------------------
        # Save permanent production master
        # ------------------------------------------------------------

        video.save_to(
            full_save_path,
            format=Types.VideoContainer("auto"),
            codec="auto",
            metadata=saved_metadata,
            crf=None,
        )

        # ------------------------------------------------------------
        # Create temporary preview copy
        #
        # ComfyUI's native PreviewVideo expects a SavedResult whose
        # FolderType is input, output or temp. Because our production
        # master lives outside those registered folders, we create
        # a temporary copy solely for the UI preview.
        # ------------------------------------------------------------

        temp_dir = folder_paths.get_temp_directory()

        preview_filename = (
            f"production_slate_preview_"
            f"{uuid.uuid4().hex}.mp4"
        )

        preview_path = os.path.join(
            temp_dir,
            preview_filename
        )

        video.save_to(
            preview_path,
            format=Types.VideoContainer("auto"),
            codec="auto",
            metadata=None,
            crf=None,
        )

        # ------------------------------------------------------------
        # Console information
        # ------------------------------------------------------------

        print(
            "\n"
            "🎬 Production Slate V4 — VIDEO\n"
            "--------------------------------------\n"
            f"Production : {production_name}\n"
            f"Scene      : {scene_id}\n"
            f"Shot       : {shot_id}\n"
            f"Take       : {take:03d}\n"
            f"Filename   : {output_filename}\n"
            f"Location   : {scene_path}\n"
            f"Preview    : {preview_filename}\n"
            f"Description: {description}\n"
        )

        # ------------------------------------------------------------
        # Return the original VIDEO plus native ComfyUI preview
        # ------------------------------------------------------------

        return io.NodeOutput(
            video,
            full_save_path,
            ui=ui.PreviewVideo([
                ui.SavedResult(
                    preview_filename,
                    "",
                    io.FolderType.temp
                )
            ])
        )


NODE_CLASS_MAPPINGS = {
    "ProductionSlateV4_Build004C_Video":
        ProductionSlateV4_Build004C_Video
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ProductionSlateV4_Build004C_Video":
        "🎬 Production Slate V4 — VIDEO 004-C"
}