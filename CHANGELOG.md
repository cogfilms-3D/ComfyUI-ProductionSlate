# Changelog

All notable changes to Production Slate will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] — V4.5 development (tested 2026-10-17)

> This section describes a **tested development branch**, not a published public release. V4.4 remains on `main`.

### Added

- Optional ComfyUI **AUDIO** input and unmodified AUDIO pass-through output on the unified saver.
- Generator-independent AUDIO saves in **FLAC, WAV and MP3 (320 kbps)** under `Production / SCxxx / Audio`, with shot/take numbering and multi-item audio batch support.
- Same-stem **`.json` metadata sidecars** for saved audio, containing production identity and available ComfyUI prompt/workflow metadata.
- In-node AUDIO **waveform, duration and playback/scrubbing** preview.
- Optional **LATENT** input on the unified saver. Supported formats:
  - Standard ComfyUI **`.latent`**
  - Nested audio/video **`.avlatent`** (tested with LTX 2.5)
  - Explicit **H3 Motion Context `.safetensors`** (tested with MiniMax H3)
- **Auto Detect** latent-format selection based on tensor/nested-tensor structure; manual H3 selection is required for H3 Extender-compatible output.
- Companion **🎬 Production Slate — Load Latent** node, with independent drive/file browser, full-path selection, and a LATENT output. Reads files containing Production Slate V4.5 format metadata, without copying them into `ComfyUI/input`.
- Larger pop-up **Production Slate folder browser** with editable path and Go/Back/Up navigation, drive/DEFAULT access, and distinct Output Location/Production Folder actions.

### Changed

- Aligned the two nodes' **Browse buttons** using a consistent light-grey control distinct from editable fields.
- Saved LATENT files beside the associated primary IMAGE or VIDEO (matching filename stem and take); LATENT-only saves use the existing Images/Video structure. No separate Latents directory.
- Continued shared take identity where VIDEO/IMAGE, AUDIO and/or LATENT are saved together, as appropriate.
- Reused the existing folder-selection backend and preserved production folder identity and migration handling. Image/video saver functionality remains the established foundation.

### Validation — live ComfyUI 0.41.3

- AUDIO: FLAC/WAV/MP3 saves, waveform preview, playback and AUDIO pass-through were tested.
- IMAGE-only, VIDEO-only and VIDEO + REF IMAGE saving were regression-tested.
- Standard ComfyUI, LTX 2.5 AV and MiniMax H3 Motion Context LATENT saving/recovery were tested with their relevant loaders.
- New Load Latent companion passed: installation, browser selection, three format **load → save** round trips (SC011→SC012, SC010→SC013, SC014→SC015), and workflow persistence.
- New pop-up Production Slate browser passed: open, both folder-selection modes, and a LATENT save with correct destination and take numbering.

**Limitations:** Three-format round trips are not a guarantee of downstream generative continuation in every workflow. The companion loader expects Production Slate V4.5 metadata, not arbitrary files sharing an extension. Audio workflow recovery from a sidecar currently requires manual extraction of `extra_pnginfo.workflow`. These are manual live tests; automated tests have not yet been reported as run.

---

## [4.4.0] - 2026-10-04

### Added

- Unified Production Slate node for IMAGE, VIDEO, and paired VIDEO + IMAGE workflows.
- Automatic production hierarchy using Production / Scene / Shot / Take.
- Automatic disk-based take numbering.
- Paired VIDEO + REF image saving with matched take numbers.
- Integrated production folder browser.
- Browsable DEFAULT ComfyUI output location.
- Output Location and Production folder selection.
- Automatic Suggested Code generation with manual override support.
- Production monitor with READY, PROCESSING, GENERATING, SAVING, COMPLETE, INTERRUPTED, and ERROR states.
- Native ComfyUI generation progress display and elapsed run timer.
- IMAGE-only preview inside Production Slate.
- Image pixel-resolution display beneath the preview.
- Workflow migration support for earlier Production Slate IMAGE 004-C and VIDEO 004-C nodes.
- Reload layout handling to prevent stale preview sizing.

### Changed

- Combined the earlier separate IMAGE and VIDEO Production Slate nodes into a single production node.
- Increased the default unified-node width for improved field readability.
- Improved long Output Location display while preserving normal editing behaviour.
- DEFAULT in Browse now opens as a navigable location rather than immediately selecting it.
- Standardised paired REF image naming as:
  `CODE_SCENE_SHOT_DATE_REF_TAKE.png`

### Compatibility

- Production-tested with ComfyUI V0.37.x through V0.38.2.
- Retains compatibility support for earlier Production Slate V4 IMAGE 004-C and VIDEO 004-C workflows.
- Browse backend is independent of VideoHelperSuite and other external node packs.

### Notes

Production Slate V4.4 is the first public release.

It was regression-tested in IMAGE-only, VIDEO-only, paired VIDEO + IMAGE, Browse, Suggested Code, workflow reload/migration, interrupted execution, runtime error, and stale-preview scenarios.

It was also field-tested through the complete production of the Production Slate launch trailer.

---

**Spend less time finding your film. Spend more time making it.**
