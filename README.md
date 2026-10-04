# 🎬 Production Slate V4.4 for ComfyUI

**Spend less time finding your film. Spend more time making it.**

![Production Slate V4.4 for ComfyUI](images/production-slate-v4.4-header.webp)

Production Slate is a production-output node for ComfyUI designed for AI filmmaking.

It automatically organises generated images and videos into a clear production structure using:

**Production → Scene → Shot → Take**

Production Slate is designed to sit at the end of an image or video workflow, so it can be used with virtually any AI model or generation workflow that produces a compatible ComfyUI IMAGE or VIDEO output.

---

## Why Production Slate?

AI filmmaking quickly produces large numbers of images, videos, variations and takes.

Without a consistent production structure it becomes increasingly difficult to answer simple questions such as:

- Which scene did this shot belong to?
- Which take was this?
- Where are the other versions?
- Which image belongs with this video?
- Where did I save that shot?

Production Slate applies a simple film-production style structure automatically.

---

## Features

### Unified IMAGE and VIDEO output

Production Slate V4.4 accepts:

- IMAGE
- VIDEO
- IMAGE + VIDEO together

The same node can therefore be used throughout an AI filmmaking workflow.

---

### Automatic production folder structure

Example:

```text
My Film
└── SC001
    ├── Images
    └── Video
```

Additional scenes are created automatically:

```text
My Film
├── SC001
├── SC002
├── SC003
└── ...
```

---

### Automatic filenames and take numbering

Example video filename:

```text
KR_SC001_SH023_261004_007.mp4
```

Example image filename:

```text
KR_SC001_SH023_261004_007.png
```

Production Slate scans the existing production folder and automatically selects the next available take number.

---

### Paired VIDEO + reference IMAGE

When VIDEO and IMAGE are connected together, Production Slate saves both using the same take number.

Example:

```text
KR_SC001_SH023_261004_007.mp4
KR_SC001_SH023_261004_REF_007.png
```

The VIDEO remains the primary production asset.

The companion REF image can be useful for:

- shot thumbnails
- reference frames
- continuation shots
- visual shot identification

---

### Production browser

Production Slate includes its own folder browser.

You can:

- browse available drives
- browse the default ComfyUI output location
- move through folders using Back and Up
- select an Output Location
- select an existing Production folder
- identify unavailable or non-writable folders

The browser is built into Production Slate and does not depend on VideoHelperSuite.

---

### Automatic production code

The **Code** field can be generated automatically from the Production / Folder name.

Example:

```text
The King Returns
```

may generate:

```text
KR
```

You can also enter your own code manually.

Clearing the Code field returns it to automatic mode.

---

### Scene, Shot and Shot Variation

Production Slate provides dedicated fields for:

- Production / Folder
- Code
- Scene
- Shot
- Shot Variation
- Slate Notes

These values remain with the workflow and help maintain consistent production organisation.

---

### Render monitor

Production Slate V4.4 includes an integrated execution monitor.

Typical states include:

```text
READY
PROCESSING
GENERATING
SAVING
COMPLETE
```

The monitor can also report:

```text
INTERRUPTED
ERROR
```

During generation it displays ComfyUI's native generation progress together with an elapsed-time counter.

---

### Image preview

IMAGE-only workflows display the generated image directly inside Production Slate.

The native pixel resolution is displayed beneath the preview.

VIDEO and paired workflows continue to use ComfyUI's normal video preview.

---

## Installation

### Manual installation

1. Download or clone this repository.
2. Place the folder `ComfyUI-ProductionSlate` inside `ComfyUI/custom_nodes/`.
3. Restart ComfyUI.
4. Search for `Production Slate` in the ComfyUI node menu.

The node should appear as:

```text
🎬 Production Slate V4.4
```

---

## Inputs

### VIDEO

Optional VIDEO input.

Connect the completed video from your generation workflow.

### IMAGE

Optional IMAGE input.

This can be:

- the primary generated image
- a reference image associated with a video
- a continuation frame
- another production still

At least one of VIDEO or IMAGE must be connected.

---

## Outputs

Production Slate provides:

- VIDEO
- IMAGE
- save_path

The media inputs are passed through, allowing Production Slate to remain part of a larger workflow if required.

---

## Example production structure

```text
AI_Films
└── The King Returns
    ├── SC001
    │   ├── Images
    │   │   ├── KR_SC001_SH001_261004_001.png
    │   │   └── KR_SC001_SH002_261004_REF_001.png
    │   └── Video
    │       ├── KR_SC001_SH001_261004_001.mp4
    │       └── KR_SC001_SH002_261004_001.mp4
    └── SC002
        ├── Images
        └── Video
```

---

## Compatibility

Production Slate V4.4 retains compatibility support for workflows created with the earlier Production Slate V4 IMAGE 004-C and VIDEO 004-C nodes.

Production Slate has been developed and production-tested with current ComfyUI V0.37.x builds.

The node does not require VideoHelperSuite for its folder browser.

---

## Production tested

Production Slate V4.4 was tested not only through development regression tests but during the complete production of a short promotional film.

That production included:

- script and shot breakdown
- image generation
- video generation
- multiple takes
- paired reference images
- shot selection
- scene organisation
- final editing in DaVinci Resolve

The experience of using Production Slate throughout a complete production has also generated ideas for future versions.

---

## Version

**Production Slate V4.4**

Initial public release.

---

## Licence

Production Slate is released under the MIT License.

See [LICENSE](LICENSE).

---

## Author

**Colin Litster**

---

## Trailer and tutorials

Watch the Production Slate V4.4 launch trailer on YouTube:

https://youtube.com/shorts/5lPz9jyEo34?feature=share

More tutorials and development updates will follow.

---

**Spend less time finding your film. Spend more time making it.**
