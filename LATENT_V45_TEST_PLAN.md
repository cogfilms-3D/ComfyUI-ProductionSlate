# Production Slate V4.5 — Latent saving and loading test record

**Status:** Live functional tests passed on **ComfyUI 0.41.3** (17 October 2026). V4.5 is **not yet a public release**.

**Working branch:** [development/v4.5-load-latent](https://github.com/cogfilms-3D/ComfyUI-ProductionSlate/tree/development/v4.5-load-latent)

**Frozen tested checkpoint:** [checkpoint/v4.5-load-latent-browser-20261017](https://github.com/cogfilms-3D/ComfyUI-ProductionSlate/tree/checkpoint/v4.5-load-latent-browser-20261017)

**Public release:** V4.4 on main, untouched during these tests.

## Scope and safeguards

- Unified Production Slate saver has optional IMAGE, VIDEO, AUDIO and LATENT inputs.
- The LATENT socket is **input only** on the saver; the separate **Production Slate — Load Latent** node has a LATENT output.
- Formats: standard \`.latent\`, nested AV \`.avlatent\`, explicitly selected H3 Motion Context \`.safetensors\`.
- Auto Detect identifies single vs nested samples; it cannot infer the source model and **does not automatically select H3**.
- Save latents **beside the associated primary media take**, not in a separate Latents folder. With LATENT-only input, select the existing Images or Video folder based on latent structure; AUDIO-only pairing uses the Audio folder.
- Match filename stems/take numbers with related production assets, maintaining VIDEO authority over paired REF images.
- Preserve supported auxiliary fields in namespaced metadata for our own loader to recover.
- Reject unsupported latent payloads before normal media saving; do not overwrite existing numbered takes.
- The new Load Latent browser must accept local paths on other drives without moving assets to ComfyUI/input.
- Keep existing image/video/audio savers and workflow migration intact. The existing Production Slate folder browse backend is unchanged.

## Format guidance

| Saver selection | Saved extension | Tested example | Recovery |
| --- | --- | --- | --- |
| Auto Detect on a single tensor | \`.latent\` | Empty Latent Image / standard image latent | Production Slate Load Latent; core Load Latent for compatible samples |
| Auto Detect on nested AV | \`.avlatent\` | LTX 2.5 finished sampler latent | Production Slate Load Latent; compatible AV Latent IO |
| H3 Motion Context (explicit) | \`.safetensors\` | MiniMax H3 finished two-stream sampler latent | Production Slate Load Latent; compatible H3 Extender loading node |

**Only Production Slate V4.5 saved files containing our format metadata are guaranteed to be recognised by the new companion loader.** Other files with the same suffix may not load. Third-party loaders can recover their recognised main tensors but may ignore auxiliary metadata.

## Live tests — confirmed passed

| Test | Source | Destination / result |
| --- | --- | --- |
| Standard latent save and load | Earlier Krea 2 image latent | Saved and recovered via standard ComfyUI loader (prior saver test) |
| LTX 2.5 AV save and recovery | Finished sampler output **before Separate AV Latent** | \`.avlatent\` loaded using AV Latent IO |
| MiniMax H3 save and recovery | Finished H3 sampler two-stream latent | SC011 \`.safetensors\` loaded using H3 AV Latent loader; images/audio checked |
| New Load Latent registration | Installed Python + JavaScript + init registration | Node appeared without ComfyUI startup errors |
| New loader browse and selection | SC011/Video | Browser navigated and selected the file path |
| **H3 load → save round trip** | SC011 \`.safetensors\` | **SC012/Video**, passed |
| **AV load → save round trip** | SC010 \`.avlatent\` | **SC013/Video**, passed |
| Standard latent save | Empty Latent Image | **SC014/Images**, passed |
| **Standard load → save round trip** | SC014 \`.latent\` | **SC015/Images**, passed |
| Workflow reload persistence | Saved Load Latent workflow | Latent path/selection retained after reopen |
| Main browser modal opens | New V4.5 folder browser | Passed |
| Select Production Folder | Existing production location | Output Location and Production / Folder populated correctly |
| Select Output Location | Existing output location | Root changed, Production / Folder unchanged |
| Main browser save regression | Empty Latent Image through saver | Correct folder hierarchy and next available take |

The user additionally approved matching **light-grey Browse buttons** on both nodes, and tested the new larger folder browser with Production Slate V4.5.

## Installation required for this tested combination

Install the **complete branch**, including:

- \`ProductionSlateV4_3.py\`, \`production_slate_audio.py\`, \`production_slate_latent.py\`, and \`production_slate_load_latent.py\`.
- \`__init__.py\` registering both the unified saver and Load Latent companion.
- The whole \`web/\` directory, especially \`production_slate_browse.js\`, \`production_slate_folder_browser.js\`, \`production_slate_load_latent.js\`, and the waveform/preview frontend.
- Unchanged legacy classes required for compatibility/migration.

Back up the existing custom-node folder before replacing files. Restart ComfyUI and hard-refresh its UI if needed. For complete installation guidance, see the development [README](README.md).

## Test separation: what we have *not* established

- A successful H3 or LTX **round-trip save** does not by itself establish every model-specific continuation workflow. Existing H3 and LTX model-specific loaders have been checked separately, but a fresh full continuation generation using the new Production Slate Load Latent output is **not part of this latest acceptance sequence**.
- We have **not recorded** a completed automated test run for \`tests/test_production_slate_latent.py\` or \`tests/test_production_slate_load_latent.py\` in this session.
- Cross-platform, multi-install and older ComfyUI compatibility for V4.5 remain unverified.
- Arbitrary third-party \`.latent\`/\`.avlatent\`/\`.safetensors\` files are not promised to work with our companion loader.
- No claim of atomic all-or-nothing saving across multiple media types if a drive or external encoder fails during a run.

## Offline checks to perform before public release

From the repo root, with Python, \`torch\`, \`safetensors\` and \`pytest\` installed:

\`\`\`sh
python -m pytest tests/test_production_slate_latent.py tests/test_production_slate_load_latent.py -q
\`\`\`

An automated unit pass will complement, **not replace**, the live ComfyUI graph tests.

**Release gate:** Review README/CHANGELOG, run automated tests where available, decide whether additional real-world decoder/continuation and workflow-migration regressions are needed, then review the exact V4.5 code diff before merging into \`main\`.
