# Production Slate V4.5 — LATENT Saving (experimental)

This document applies **only to development/v4.5-latent-save**.
The audio-preview checkpoint and the released main branch are not modified.

## Scope

- One optional LATENT input; no new output sockets.
- One **Latent Format** dropdown. Default: **Auto Detect**.
- No latent denoising, conversion, refinement, scaling or decoding.
- Saves beside a matching IMAGE (.png), VIDEO (.mp4), or AUDIO; **no Latents folder**.
- VIDEO is the primary asset when both IMAGE and VIDEO are supplied.
- Without any media input, nested/video-shaped LATENT goes to **Video**, image-shaped LATENT goes to **Images**.
- Numbers are selected to avoid existing LATENT and primary media takes. With AUDIO connected, the existing shared AUDIO numbering rule is retained.
- Stores workflow/prompt metadata when supplied by ComfyUI, plus structured auxiliary fields.
- Won't overwrite an existing LATENT file, and rejects unsupported formats/extra fields **before** attempting normal media saves.

## Format choices

| Dropdown option | Input requirement | Extension | Compatible existing loader |
| --- | --- | --- | --- |
| Auto Detect | Torch Tensor or supported nested tensor | .latent for a Tensor; .avlatent for nested | Core Load Latent / AV Latent IO respectively |
| ComfyUI Standard (.latent) | Single Tensor | .latent | Core Load Latent |
| AV Nested (.avlatent) | Single or nested tensor | .avlatent | AV Latent IO's Load AV Latent |
| H3 Motion Context (.safetensors) | Exactly two streams (video 5-D, audio 4-D) | .safetensors | MiniMax H3 Load AV Latent (H3 Extender) |

**Auto Detect cannot identify the originating model from the socket.**
Select H3 Motion Context manually if you specifically need that existing H3 loader.

**Auxiliary data:** Production Slate stores supported extra tensor and JSON-like
fields under the \`production_slate_latent_v1\` metadata convention. The helper
\`load_production_latent(path)\` recovers the full saved latent dictionary.
Third-party loaders may still ignore these auxiliary fields even though they are
present in the saved file. A future Load Production Latent node will expose this.

## Installing the development build

Back up your current working Production Slate folder, then copy these files
from the development branch into that folder:

1. \`ProductionSlateV4_3.py\` (modified)
2. \`production_slate_latent.py\` (**new**, place beside the Python node)
3. \`web/production_slate_browse.js\` (modified; label and migration only)

Audio modules and \`web/production_slate_waveform.js\` are unchanged.

Restart ComfyUI Desktop for the Python changes and hard refresh with
**Ctrl + Shift + R** to load the new JavaScript.

## Incremental acceptance tests — ComfyUI 0.40.0

**A. Regression first (no LATENT connected)**

Open a known working workflow and confirm AUDIO-only, IMAGE-only and
VIDEO+AUDIO continue to save and preview as before. Do not repeat expensive
generations purely for these checks.

**B. LATENT-only / standard**

Use \`Empty Latent Image\` (or a short ordinary image sampler), connect its
LATENT to Production Slate, select Auto Detect, and queue. Expected:

\`<production>/SC001/Images/<CODE>_SC001_SH001_<date>_001.latent\`

No video/audio preview should be generated for LATENT-only. A file should be
created and a new queued take must not overwrite the first.

**C. Genuine H3 AV**

Branch the *completed* SamplerCustomAdvanced \`output\` to Production Slate
LATENT, and explicitly select \`H3 Motion Context (.safetensors)\`.
Expect a \`.safetensors\` file in SCxxx/Video. Test the path with your existing
MiniMax H3 Load AV Latent node; its clip_index=0 when specifying the exact path.

**D. Genuine LTX 2.5 AV**

Branch SamplerCustomAdvanced \`output\` **before** Separate AV Latent
to Production Slate LATENT. Use Auto Detect, expecting a \`.avlatent\` file in
SCxxx/Video. Verify its main tensors through AV Latent IO Load AV Latent.

**E. Matched media**

With VIDEO and LATENT both connected, confirm matching filename stems and
take numbers. With VIDEO+IMAGE, the companion REF image uses the same take
number in Images but does not show a second image preview.

**F. Unsupported values**

Select Standard (.latent) with a nested H3/LTX input. Expected: a clear
incompatibility error **before** saving the media. Existing production files
must remain untouched.

## Automated offline checks

From the repository root, in an environment with \`pytest\`, \`torch\` and
\`safetensors\` (no server or GPU required):

\`\`\`sh
python -m pytest tests/test_production_slate_latent.py -q
\`\`\`

These test the saver/reader in isolation. **They do not substitute for the
live ComfyUI 0.40.0 tests**, especially for plugin/graph and preview behaviour.

## Not in this first implementation

- No GUI Load Production Latent companion node yet.
- No modification or processing of the incoming LATENT.
- No claim to support arbitrary unfamiliar Python object graphs.
- No promise that third-party loaders will restore custom auxiliary metadata.
- No guarantee that writes to multiple types of media are transactionally
  all-or-nothing if an external disk or encoder fails part-way through.
