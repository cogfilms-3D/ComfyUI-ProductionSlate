# Production Slate — Interface Design Guidelines

These principles apply to the unified Production Slate node and any future companion nodes. Preserve consistency with the existing image, video, and audio previews.

## Frameless by default

**Avoid decorative frames and borders.** Media previews should be clean, simple surfaces that let the content speak for itself.

- Do not add an outer frame around image, video, or audio previews by default.
- Avoid nested frames, multiple outlines, coloured surrounds, and borders used only for decoration.
- Prefer spacing, alignment, a single background surface, and modest corner rounding to define areas.
- Only add a border when it has a clear functional purpose (for example focus indication, a required separation, or an interactive control). Keep exceptions restrained.
- Apply the same standard to new features and standalone nodes; do not clutter working previews with titles or labels that are already obvious.

## V4.5 audio-preview reference

The confirmed audio-preview direction is a single, unframed **pure-black background (`#000000`)**, a **cyan waveform (`#62CAFF`)**, and an **amber playback cursor (`#FFCF78`)**. Time labels and a compact play/pause control remain legible without extra decorative panels.

The execution monitor appears above the media preview. The waveform and cursor must remain stable when playing, scrubbing, and zooming within ComfyUI.

**Design rule:** Spend less visual space on decoration; spend it on information and practical controls.
