# Changelog

All notable changes to Production Slate will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
