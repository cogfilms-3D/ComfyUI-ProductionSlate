# ============================================================
# ProductionSlateV4_3.py
# Production Slate V4.4 development line
#
# Unified VIDEO / IMAGE production output node.
#
# Current capabilities:
#   - optional VIDEO and IMAGE inputs
#   - IMAGE-only, VIDEO-only, and paired VIDEO + IMAGE saving
#   - Production / Scene / Shot / Take organisation
#   - automatic take numbering
#   - paired REF image naming aligned to VIDEO take numbering
#   - native VIDEO preview
#   - ProductionSlate-managed IMAGE preview support
#   - prompt / workflow metadata preservation
#
# V4.3 save behaviour remains the proven production foundation.
# V4.4 adds frontend monitoring, image preview and UI refinements.
# ============================================================

import os
import uuid
from datetime import datetime

from PIL import Image
from PIL.PngImagePlugin import PngInfo
import numpy as np
import json
import folder_paths

from comfy_api.latest import io, ui, Types


class ProductionSlateV4_3(io.ComfyNode):

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="ProductionSlateV4",
            display_name="🎬 Production Slate V4.4",
            category="Production Slate V4",
            description=(
                "Production Slate V4.4 unified VIDEO / IMAGE "
                "production output node."
            ),

            inputs=[
                # ------------------------------------------------
                # Media inputs
                # ------------------------------------------------

                io.Video.Input(
                    "video",
                    optional=True,
                    tooltip="Primary video production asset."
                ),

                io.Image.Input(
                    "image",
                    optional=True,
                    tooltip="Image production or reference asset."
                ),

                # ------------------------------------------------
                # Shared ProductionSlate fields
                # ------------------------------------------------

                io.String.Input(
                    "output_root",
                    default=os.path.join(
                        folder_paths.get_output_directory(),
                        "AI_Films"
                    ),
                    tooltip="Root directory for production output."
                ),

                io.String.Input(
                    "production_name",
                    default="Working Title",
                    tooltip="Production / Folder."
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
                    tooltip="Shot Variation."
                ),

                io.String.Input(
                    "description",
                    default="",
                    tooltip="Slate Notes."
                ),
            ],

            hidden=[
                io.Hidden.prompt,
                io.Hidden.extra_pnginfo,
            ],

            is_output_node=True,

            outputs=[
                io.Video.Output("video"),
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
        video=None,
        image=None,
        output_root="",
        production_name="Working Title",
        production_code="WT",
        scene=1,
        shot=1,
        suffix="",
        description="",
    ):

        if video is None and image is None:
            raise ValueError(
                "Production Slate V4.4 requires a VIDEO or IMAGE input."
            )

# --------------------------------------------------------
# IMAGE-only production save
#
# Folder structure:
#
# Production
# └── SC001
#     └── Images
#
# Saves the production PNG using automatic take numbering.
# Also provides temporary preview data for the V4.4
# ProductionSlate image-preview frontend.
# --------------------------------------------------------

        save_path = ""

        if image is not None and video is None:

            output_root = output_root.strip()

            production_name = (
                cls._sanitize(production_name)
                or "Working Title"
            )

            production_code = (
                cls._sanitize(production_code)
                or "WT"
            )

            suffix = cls._sanitize(suffix).upper()

            # ----------------------------------------------------
            # Date / identifiers
            # ----------------------------------------------------

            date_stamp = datetime.now().strftime("%y%m%d")

            scene_id = f"SC{scene:03d}"
            shot_id = f"SH{shot:03d}{suffix}"

            # ----------------------------------------------------
            # IMAGE folder hierarchy
            # ----------------------------------------------------

            production_path = os.path.join(
                output_root,
                production_name
            )

            scene_path = os.path.join(
                production_path,
                scene_id
            )

            image_path = os.path.join(
                scene_path,
                "Images"
            )

            os.makedirs(
                image_path,
                exist_ok=True
            )

            # ----------------------------------------------------
            # Disk-based take discovery
            # ----------------------------------------------------

            prefix = (
                f"{production_code}_"
                f"{scene_id}_"
                f"{shot_id}_"
                f"{date_stamp}_"
            )

            highest_take = 0

            for fname in os.listdir(image_path):

                if not fname.startswith(prefix):
                    continue

                full_path = os.path.join(
                    image_path,
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

            # ----------------------------------------------------
            # Filename
            # ----------------------------------------------------

            filename = (
                f"{production_code}_"
                f"{scene_id}_"
                f"{shot_id}_"
                f"{date_stamp}_"
                f"{take:03d}"
            )

            # ----------------------------------------------------
            # Save PNG
            # ----------------------------------------------------

            png_path = os.path.join(
                image_path,
                filename + ".png"
            )

            img = image[0].cpu().numpy()

            img = np.clip(
                img * 255.0,
                0,
                255
            ).astype(np.uint8)

            pil_image = Image.fromarray(img)

            metadata = PngInfo()

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

            save_path = png_path

            print(
                "🎬 Production Slate — IMAGE save\n"
                f"Production : {production_name}\n"
                f"Scene      : {scene_id}\n"
                f"Shot       : {shot_id}\n"
                f"Take       : {take:03d}\n"
                f"Filename   : {filename}.png\n"
                f"Location   : {image_path}"
            )
            preview = ui.PreviewImage(
                image,
                cls=cls
            )

            return io.NodeOutput(
                video,
                image,
                save_path,
                ui={
                    "images": [],
                    "animated": (True,),
                    "production_slate_image": preview.values,
                }
            )

        # --------------------------------------------------------
        # V4.3 save behaviour remains the proven production foundation.
        # --------------------------------------------------------

        if video is not None and image is None:

            output_root = output_root.strip()

            production_name = (
                cls._sanitize(production_name)
                or "Working Title"
            )

            production_code = (
                cls._sanitize(production_code)
                or "WT"
            )

            suffix = cls._sanitize(suffix).upper()

            date_stamp = datetime.now().strftime("%y%m%d")

            scene_id = f"SC{scene:03d}"
            shot_id = f"SH{shot:03d}{suffix}"

            production_path = os.path.join(
                output_root,
                production_name
            )

            scene_path = os.path.join(
                production_path,
                scene_id
            )

            video_path = os.path.join(
                scene_path,
                "Video"
            )

            os.makedirs(
                video_path,
                exist_ok=True
            )

            # ----------------------------------------------------
            # Disk-based VIDEO take discovery
            # ----------------------------------------------------

            prefix = (
                f"{production_code}_"
                f"{scene_id}_"
                f"{shot_id}_"
                f"{date_stamp}_"
            )

            highest_take = 0

            for fname in os.listdir(video_path):

                if not fname.startswith(prefix):
                    continue

                full_path = os.path.join(
                    video_path,
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

            # ----------------------------------------------------
            # VIDEO filename
            # ----------------------------------------------------

            filename = (
                f"{production_code}_"
                f"{scene_id}_"
                f"{shot_id}_"
                f"{date_stamp}_"
                f"{take:03d}"
            )

            mp4_path = os.path.join(
                video_path,
                filename + ".mp4"
            )

            # ----------------------------------------------------
            # VIDEO metadata
            # ----------------------------------------------------

            saved_metadata = None
            metadata = {}

            if getattr(cls.hidden, "extra_pnginfo", None) is not None:
                metadata.update(
                    cls.hidden.extra_pnginfo
                )

            if getattr(cls.hidden, "prompt", None) is not None:
                metadata["prompt"] = cls.hidden.prompt

            if metadata:
                saved_metadata = metadata

            # ----------------------------------------------------
            # Save permanent production VIDEO
            # ----------------------------------------------------

            video.save_to(
                mp4_path,
                format=Types.VideoContainer("auto"),
                codec="auto",
                metadata=saved_metadata,
                crf=None,
            )

            save_path = mp4_path

            # ----------------------------------------------------
            # VIDEO-only temporary preview
            # ----------------------------------------------------

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
            print(
                "🎬 Production Slate — VIDEO save\n"
                f"Production : {production_name}\n"
                f"Scene      : {scene_id}\n"
                f"Shot       : {shot_id}\n"
                f"Take       : {take:03d}\n"
                f"Filename   : {filename}.mp4\n"
                f"Location   : {video_path}"
            )
            return io.NodeOutput(
                video,
                image,
                save_path,
                ui=ui.PreviewVideo([
                    ui.SavedResult(
                        preview_filename,
                        "",
                        io.FolderType.temp
                    )
                ])
            )
        # --------------------------------------------------------
        # PAIRED VIDEO + IMAGE production save
        #
        # VIDEO is authoritative for take numbering.
        # Companion IMAGE inherits the VIDEO take number.
        #
        # Video:
        #   CODE_SC001_SH001_YYMMDD_001.mp4
        #
        # Reference image:
        #   CODE_SC001_SH001_YYMMDD_REF_001.png
        # --------------------------------------------------------

        if video is not None and image is not None:

            output_root = output_root.strip()

            production_name = (
                cls._sanitize(production_name)
                or "Working Title"
            )

            production_code = (
                cls._sanitize(production_code)
                or "WT"
            )

            suffix = cls._sanitize(suffix).upper()

            date_stamp = datetime.now().strftime("%y%m%d")

            scene_id = f"SC{scene:03d}"
            shot_id = f"SH{shot:03d}{suffix}"

            # ----------------------------------------------------
            # Paired VIDEO / IMAGE folder hierarchy
            # ----------------------------------------------------

            production_path = os.path.join(
                output_root,
                production_name
            )

            scene_path = os.path.join(
                production_path,
                scene_id
            )

            video_path = os.path.join(
                scene_path,
                "Video"
            )

            image_path = os.path.join(
                scene_path,
                "Images"
            )

            os.makedirs(
                video_path,
                exist_ok=True
            )

            os.makedirs(
                image_path,
                exist_ok=True
            )

            # ----------------------------------------------------
            # VIDEO-authoritative take discovery
            # ----------------------------------------------------

            prefix = (
                f"{production_code}_"
                f"{scene_id}_"
                f"{shot_id}_"
                f"{date_stamp}_"
            )

            highest_take = 0

            for fname in os.listdir(video_path):

                if not fname.startswith(prefix):
                    continue

                full_path = os.path.join(
                    video_path,
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

            # ----------------------------------------------------
            # Paired filenames
            # ----------------------------------------------------

            video_filename = (
                f"{production_code}_"
                f"{scene_id}_"
                f"{shot_id}_"
                f"{date_stamp}_"
                f"{take:03d}"
            )

            ref_filename = (
                f"{production_code}_"
                f"{scene_id}_"
                f"{shot_id}_"
                f"{date_stamp}_"
                f"REF_"
                f"{take:03d}"
            )

            mp4_path = os.path.join(
                video_path,
                video_filename + ".mp4"
            )

            ref_png_path = os.path.join(
                image_path,
                ref_filename + ".png"
            )

            # ----------------------------------------------------
            # Save companion REF image
            # ----------------------------------------------------

            img = image[0].cpu().numpy()

            img = np.clip(
                img * 255.0,
                0,
                255
            ).astype(np.uint8)

            pil_image = Image.fromarray(img)

            png_metadata = PngInfo()

            if getattr(cls.hidden, "prompt", None) is not None:
                png_metadata.add_text(
                    "prompt",
                    json.dumps(cls.hidden.prompt)
                )

            if getattr(cls.hidden, "extra_pnginfo", None) is not None:
                for key, value in cls.hidden.extra_pnginfo.items():
                    png_metadata.add_text(
                        key,
                        json.dumps(value)
                    )

            pil_image.save(
                ref_png_path,
                pnginfo=png_metadata
            )

            # ----------------------------------------------------
            # Save primary VIDEO
            # ----------------------------------------------------

            saved_metadata = None
            video_metadata = {}

            if getattr(cls.hidden, "extra_pnginfo", None) is not None:
                video_metadata.update(
                    cls.hidden.extra_pnginfo
                )

            if getattr(cls.hidden, "prompt", None) is not None:
                video_metadata["prompt"] = cls.hidden.prompt

            if video_metadata:
                saved_metadata = video_metadata

            video.save_to(
                mp4_path,
                format=Types.VideoContainer("auto"),
                codec="auto",
                metadata=saved_metadata,
                crf=None,
            )

             # VIDEO is the primary asset for paired saves.
            save_path = mp4_path

            # ----------------------------------------------------
            # PAIRED temporary VIDEO preview
            # ----------------------------------------------------

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

            print(
                "🎬 Production Slate — PAIRED save\n"
                f"Production : {production_name}\n"
                f"Scene      : {scene_id}\n"
                f"Shot       : {shot_id}\n"
                f"Take       : {take:03d}\n"
                f"Video      : {video_filename}.mp4\n"
                f"Reference  : {ref_filename}.png\n"
                f"Video dir  : {video_path}\n"
                f"Image dir  : {image_path}"
            )

            return io.NodeOutput(
                video,
                image,
                save_path,
                ui=ui.PreviewVideo([
                    ui.SavedResult(
                        preview_filename,
                        "",
                        io.FolderType.temp
                    )
                ])
            )

        return io.NodeOutput(
            video,
            image,
            save_path,
        )

    # ------------------------------------------------------------
    # Filename sanitisation
    # ------------------------------------------------------------

    @staticmethod
    def _sanitize(text: str) -> str:
        """Remove characters unsafe for filenames."""

        return "".join(
            c
            for c in str(text)
            if c not in r'<>:"/\\|?*'
        ).strip()