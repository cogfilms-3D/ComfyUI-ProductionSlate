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
from .production_slate_audio import save_production_audio, create_audio_playback_preview, next_audio_take
from .production_slate_waveform import audio_waveform_preview
from .production_slate_latent import prepare_latent, next_latent_take, save_prepared_latent


class ProductionSlateV4_3(io.ComfyNode):

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="ProductionSlateV4",
            display_name="🎬 Production Slate V4.5",
            category="Production Slate V4",
            description=(
                "Production Slate V4.5 unified VIDEO / IMAGE / AUDIO "
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

                io.Audio.Input(
                    "audio",
                    optional=True,
                    tooltip="Optional audio input; passed through without modification in Stage 1."
                ),

                io.Latent.Input(
                    "latent",
                    optional=True,
                    tooltip="Optional original LATENT payload, saved unmodified alongside primary media."
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

                io.Combo.Input(
                    "audio_format",
                    options=["flac", "wav", "mp3"],
                    default="flac",
                    tooltip="Audio save format: FLAC lossless, WAV PCM, or MP3 320 kbps."
                ),
                io.Combo.Input(
                    "latent_format",
                    options=[
                        "Auto Detect",
                        "ComfyUI Standard (.latent)",
                        "AV Nested (.avlatent)",
                        "H3 Motion Context (.safetensors)",
                    ],
                    default="Auto Detect",
                    tooltip="Auto identifies nested data. Choose H3 explicitly for compatibility with H3 Motion Context Load."
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
                io.Audio.Output("audio"),
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
        audio=None,
        latent=None,
        output_root="",
        production_name="Working Title",
        production_code="WT",
        scene=1,
        shot=1,
        suffix="",
        description="",
        audio_format="flac",
        latent_format="Auto Detect",
    ):

        if video is None and image is None and audio is None and latent is None:
            raise ValueError(
                "Production Slate V4.5 requires a VIDEO, IMAGE, AUDIO or LATENT input."
            )

        # Validate LATENT, including auxiliary fields, before writing media.
        prepared_latent = (
            prepare_latent(
                latent, latent_format,
                prompt=getattr(cls.hidden, "prompt", None),
                extra_pnginfo=getattr(cls.hidden, "extra_pnginfo", None),
            )
            if latent is not None else None
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

        # LATENT-only: no new folder; route video-shaped latents to Video,
        # image-shaped latents to Images, with the next unoccupied take.
        if prepared_latent is not None and video is None and image is None and audio is None:
            root = output_root.strip()
            production = cls._sanitize(production_name) or "Working Title"
            code = cls._sanitize(production_code) or "WT"
            variation = cls._sanitize(suffix).upper()
            scene_id = f"SC{scene:03d}"
            shot_id = f"SH{shot:03d}{variation}"
            date_stamp = datetime.now().strftime("%y%m%d")
            prefix = f"{code}_{scene_id}_{shot_id}_{date_stamp}_"
            asset_dir = os.path.join(root, production, scene_id, prepared_latent.media_hint)
            os.makedirs(asset_dir, exist_ok=True)
            highest = 0
            for entry in os.listdir(asset_dir):
                stem, ext = os.path.splitext(entry)
                if ext.lower() not in {
                    ".latent", ".avlatent", ".safetensors", ".png",
                    ".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v",
                } or not stem.startswith(prefix):
                    continue
                tail = stem[len(prefix):]
                if tail.isdigit():
                    highest = max(highest, int(tail))
            take = highest + 1
            path = os.path.join(
                asset_dir, f"{prefix}{take:03d}{prepared_latent.extension}"
            )
            save_prepared_latent(prepared_latent, path)
            print(f"🎬 Production Slate — LATENT-only save: {path}")
            return io.NodeOutput(None, None, None, path)

        # AUDIO-only: save a numbered production take and pass AUDIO unchanged.
        if audio is not None and video is None and image is None:
            output_root = output_root.strip()
            production_name = cls._sanitize(production_name) or "Working Title"
            production_code = cls._sanitize(production_code) or "WT"
            suffix = cls._sanitize(suffix).upper()
            audio_take_args = {}
            if prepared_latent is not None:
                stamp = datetime.now().strftime("%y%m%d")
                scene_id = f"SC{scene:03d}"
                shot_id = f"SH{shot:03d}{suffix}"
                prefix = f"{production_code}_{scene_id}_{shot_id}_{stamp}_"
                audio_dir = os.path.join(output_root, production_name, scene_id, "Audio")
                audio_take_args = {
                    "first_take": max(
                        next_audio_take(audio_dir, prefix),
                        next_latent_take(audio_dir, prefix),
                    ),
                    "date_stamp": stamp,
                }
            paths = save_production_audio(
                audio, output_root, production_name, production_code,
                scene, shot, suffix, audio_format,
                prompt=getattr(cls.hidden, "prompt", None),
                extra_pnginfo=getattr(cls.hidden, "extra_pnginfo", None),
                **audio_take_args,
            )
            if prepared_latent is not None:
                take = audio_take_args["first_take"]
                latent_path = os.path.join(
                    audio_dir, f"{prefix}{take:03d}{prepared_latent.extension}"
                )
                save_prepared_latent(prepared_latent, latent_path)
            print(f"🎬 Production Slate — AUDIO save: {len(paths)} take(s), first: {paths[0]}")
            return io.NodeOutput(
                None, None, audio, paths[0],
                ui={
                    "production_slate_audio_waveform": [audio_waveform_preview(audio, paths)],
                    "production_slate_audio_playback": [create_audio_playback_preview(paths)],
                },
            )

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
            if prepared_latent is not None:
                take = max(take, next_latent_take(image_path, prefix))

            # IMAGE + AUDIO must reserve one common take number.
            # Previous AUDIO-only saves may be ahead of IMAGE numbering.
            # Leave IMAGE-only behaviour unchanged.
            if audio is not None:
                take = max(
                    take,
                    next_audio_take(os.path.join(scene_path, "Audio"), prefix)
                )

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
            if prepared_latent is not None:
                latent_path = os.path.join(
                    image_path, filename + prepared_latent.extension
                )
                save_prepared_latent(prepared_latent, latent_path)

            audio_paths = []
            if audio is not None:
                audio_paths = save_production_audio(
                    audio, output_root, production_name, production_code,
                    scene, shot, suffix, audio_format, first_take=take,
                    prompt=getattr(cls.hidden, "prompt", None),
                    extra_pnginfo=getattr(cls.hidden, "extra_pnginfo", None),
                    date_stamp=date_stamp,
                )

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
                audio,
                save_path,
                ui={
                    "images": [],
                    "animated": (True,),
                    "production_slate_image": preview.values,
                    "production_slate_audio_waveform": [audio_waveform_preview(audio, audio_paths)] if audio is not None else [],
                    "production_slate_audio_playback": [create_audio_playback_preview(audio_paths)] if audio is not None else [],
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
            if prepared_latent is not None:
                take = max(take, next_latent_take(video_path, prefix))

            # VIDEO + AUDIO reserves a common take across both folders,
            # even when AUDIO-only renders have already occupied numbers.
            # Leave VIDEO-only behaviour unchanged.
            if audio is not None:
                take = max(
                    take,
                    next_audio_take(os.path.join(scene_path, "Audio"), prefix)
                )

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
            if prepared_latent is not None:
                latent_path = os.path.join(
                    video_path, filename + prepared_latent.extension
                )
                save_prepared_latent(prepared_latent, latent_path)

            audio_paths = []
            if audio is not None:
                audio_paths = save_production_audio(
                    audio, output_root, production_name, production_code,
                    scene, shot, suffix, audio_format, first_take=take,
                    prompt=getattr(cls.hidden, "prompt", None),
                    extra_pnginfo=getattr(cls.hidden, "extra_pnginfo", None),
                    date_stamp=date_stamp,
                )

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
                audio,
                save_path,
                ui={
                    **ui.PreviewVideo([
                        ui.SavedResult(
                            preview_filename,
                            "",
                            io.FolderType.temp
                        )
                    ]).as_dict(),
                    "production_slate_audio_waveform": [audio_waveform_preview(audio, audio_paths)] if audio is not None else [],
                    "production_slate_audio_playback": [create_audio_playback_preview(audio_paths)] if audio is not None else [],
                }
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
            if prepared_latent is not None:
                take = max(take, next_latent_take(video_path, prefix))

            # VIDEO + IMAGE + AUDIO keeps VIDEO authoritative while
            # reserving a take number also free for AUDIO.
            if audio is not None:
                take = max(
                    take,
                    next_audio_take(os.path.join(scene_path, "Audio"), prefix)
                )

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
            if prepared_latent is not None:
                latent_path = os.path.join(
                    video_path, video_filename + prepared_latent.extension
                )
                save_prepared_latent(prepared_latent, latent_path)

            audio_paths = []
            if audio is not None:
                audio_paths = save_production_audio(
                    audio, output_root, production_name, production_code,
                    scene, shot, suffix, audio_format, first_take=take,
                    prompt=getattr(cls.hidden, "prompt", None),
                    extra_pnginfo=getattr(cls.hidden, "extra_pnginfo", None),
                    date_stamp=date_stamp,
                )

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
                audio,
                save_path,
                ui={
                    **ui.PreviewVideo([
                        ui.SavedResult(
                            preview_filename,
                            "",
                            io.FolderType.temp
                        )
                    ]).as_dict(),
                    "production_slate_audio_waveform": [audio_waveform_preview(audio, audio_paths)] if audio is not None else [],
                    "production_slate_audio_playback": [create_audio_playback_preview(audio_paths)] if audio is not None else [],
                }
            )

        return io.NodeOutput(
            video,
            image,
            audio,
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