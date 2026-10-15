// Production Slate V4.5: reusable in-node AUDIO timeline panel.
// Receives compact peak/RMS envelopes generated server-side. Audio itself stays
// in the standard ComfyUI AUDIO socket, so no large sound buffers cross the UI.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

function timecode(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    const whole = Math.floor(value);
    const minutes = Math.floor(whole / 60);
    const hours = Math.floor(minutes / 60);
    const mm = String(minutes % 60).padStart(hours ? 2 : 1, "0");
    const ss = String(whole % 60).padStart(2, "0");
    return (hours ? hours + ":" : "") + mm + ":" + ss;
}

function drawWaveform(canvas, track, expanded, playheadSeconds = 0) {
    // Canvas shares a flex row with Play, so use its displayed width.
    const targetWidth = Math.max(120, Math.round(
        canvas.getBoundingClientRect().width ||
        (canvas.parentElement?.clientWidth || 356) - 36
    ));
    // The time labels live in DOM below canvas to avoid stretched glyphs.
    const height = expanded ? 110 : 62;
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);

    canvas.style.height = height + "px";
    canvas.width = Math.round(targetWidth * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);

    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const w = targetWidth;
    const h = height;
    const left = 12;
    const right = w - 12;
    const top = 8;
    const bottom = h - 8;
    const mid = (top + bottom) / 2;
    const maxAmplitudeHeight = (bottom - top) / 2 - 2;
    const lineWidth = right - left;

    context.fillStyle = "#101b28";
    context.fillRect(0, 0, w, h);

    context.strokeStyle = "rgba(174,196,219,0.17)";
    context.lineWidth = 1;
    for (let n = 0; n <= 4; n++) {
        const x = left + n * lineWidth / 4 + 0.5;
        context.beginPath();
        context.moveTo(x, top);
        context.lineTo(x, bottom);
        context.stroke();
    }

    context.strokeStyle = "rgba(210,229,239,0.3)";
    context.beginPath();
    context.moveTo(left, mid + 0.5);
    context.lineTo(right, mid + 0.5);
    context.stroke();

    const peak = Array.isArray(track.peak) ? track.peak : [];
    const rms = Array.isArray(track.rms) ? track.rms : [];
    const count = Math.min(peak.length, rms.length);
    if (count) {
        // RMS area shows sustained loudness, not just individual transients.
        context.fillStyle = "rgba(74,215,176,0.29)";
        context.beginPath();
        for (let i = 0; i < count; i++) {
            const x = left + (i + 0.5) * lineWidth / count;
            const y = mid - Math.min(1, Math.max(0, Number(rms[i]) || 0)) * maxAmplitudeHeight;
            if (!i) context.moveTo(x, y);
            else context.lineTo(x, y);
        }
        for (let i = count - 1; i >= 0; i--) {
            const x = left + (i + 0.5) * lineWidth / count;
            const y = mid + Math.min(1, Math.max(0, Number(rms[i]) || 0)) * maxAmplitudeHeight;
            context.lineTo(x, y);
        }
        context.closePath();
        context.fill();

        context.strokeStyle = "#62caff";
        context.lineWidth = Math.max(1, lineWidth / count);
        context.beginPath();
        for (let i = 0; i < count; i++) {
            const x = left + (i + 0.5) * lineWidth / count;
            const amplitude = Math.min(1, Math.max(0, Number(peak[i]) || 0)) * maxAmplitudeHeight;
            context.moveTo(x, mid - amplitude);
            context.lineTo(x, mid + amplitude);
        }
        context.stroke();
    }

    // The movable playhead uses exactly the same full-duration time scale.
    if (Number.isFinite(playheadSeconds) && track.duration > 0) {
        const fraction = Math.min(1, Math.max(0, playheadSeconds / track.duration));
        const cursorX = left + fraction * lineWidth + 0.5;
        context.strokeStyle = "#ffcf78";
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(cursorX, top);
        context.lineTo(cursorX, bottom);
        context.stroke();
    }

}

// Keep the execution monitor above the waveform, regardless of the order
// in which ComfyUI initialises frontend extensions or restores a workflow.
// The waveform remains the last widget, below the monitor and other previews.
function positionWaveformAfterMonitor(node) {
    const widgets = node.widgets;
    if (!Array.isArray(widgets)) return false;

    const monitorIndex = widgets.findIndex(
        (item) => item?.name === "production_slate_monitor"
    );
    const waveformIndex = widgets.findIndex(
        (item) => item?.name === "production_slate_waveform"
    );
    if (monitorIndex < 0 || waveformIndex < 0 ||
        waveformIndex === widgets.length - 1) return false;

    const [waveform] = widgets.splice(waveformIndex, 1);
    widgets.push(waveform);
    node.setDirtyCanvas?.(true, true);
    return true;
}

function refreshLayout(node) {
    requestAnimationFrame(() => {
        if (!node.graph) return;
        const size = node.computeSize();
        node.setSize([node.size[0], size[1]]);
        node.setDirtyCanvas?.(true, true);
    });
}

app.registerExtension({
    name: "ProductionSlate.Waveform",

    nodeCreated(node) {
        if (node.comfyClass !== "ProductionSlateV4") return;

        const panel = document.createElement("div");
        panel.style.display = "none";
        panel.style.width = "100%";
        panel.style.boxSizing = "border-box";
        panel.style.padding = "4px";
        panel.style.background = "transparent";
        panel.style.border = "none";
        panel.style.borderRadius = "8px";
        panel.style.color = "#e7e4ee";
        panel.style.fontFamily = "Arial, sans-serif";

        const waveforms = document.createElement("div");
        panel.appendChild(waveforms);

        const widget = node.addDOMWidget(
            "production_slate_waveform",
            "custom",
            panel,
            { serialize: false, hideOnZoom: false }
        );
        widget.serialize = false;

        // Defer until the browse/monitor extension has added its widgets.
        // A loaded workflow may restore saved widget order afterwards, so we
        // also enforce this during loadedGraphNode and when results arrive.
        requestAnimationFrame(() => {
            if (positionWaveformAfterMonitor(node)) refreshLayout(node);
        });

        let drawAll = () => {};
        let lastData = null;
        let player = null;
        let rafId = 0;

        function stopPlayback() {
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = 0;
            }
            if (player) {
                player.pause();
                player.removeAttribute("src");
                player.load();
                player = null;
            }
        }

        function render(data, playbackInfo) {
            positionWaveformAfterMonitor(node);
            lastData = data;
            waveforms.replaceChildren();
            const allTracks = Array.isArray(data?.tracks) ? data.tracks : [];
            // Match ComfyUI Batch Count behaviour: show the latest completed
            // take, not an ever-growing gallery. ComfyUI Assets holds history.
            const tracks = allTracks.length ? [allTracks[allTracks.length - 1]] : [];
            stopPlayback();

            if (!tracks.length) {
                panel.style.display = "none";
                refreshLayout(node);
                return;
            }
            panel.style.display = "block";
            const descriptor = Array.isArray(playbackInfo) ? playbackInfo[0] : playbackInfo;
            const canPlay = Boolean(descriptor?.filename);
            const painters = [];
            tracks.forEach((track) => {
                const row = document.createElement("div");
                // Steel-blue panel contrasts with Production Slate's purple.
                // The waveform canvas remains darker for amplitude legibility.
                row.style.background = "#23475a";
                row.style.border = "1px solid #52788b";
                row.style.borderRadius = "6px";
                row.style.padding = "5px";
                row.style.marginBottom = "0";
                row.style.boxSizing = "border-box";

                const strip = document.createElement("div");
                strip.style.display = "flex";
                strip.style.alignItems = "center";
                strip.style.gap = "5px";
                strip.style.width = "100%";

                // Keep the time axis as normal DOM text. ComfyUI may resize
                // canvas bitmap and its CSS box by different ratios on zoom,
                // which distorted the old canvas-drawn numbers.
                const timeline = document.createElement("div");
                timeline.style.flex = "1 1 0%";
                timeline.style.width = "0px";
                timeline.style.minWidth = "0";
                timeline.style.background = "#101b28";
                timeline.style.borderRadius = "4px";
                timeline.style.overflow = "hidden";

                const canvas = document.createElement("canvas");
                canvas.style.display = "block";
                canvas.style.width = "100%";
                canvas.style.minWidth = "0";
                canvas.style.borderRadius = "4px 4px 0 0";
                timeline.appendChild(canvas);

                const labels = document.createElement("div");
                labels.style.display = "grid";
                labels.style.gridTemplateColumns = "1fr 1fr 1fr";
                labels.style.boxSizing = "border-box";
                labels.style.padding = "0 12px 2px";
                labels.style.height = "20px";
                labels.style.alignItems = "center";
                labels.style.color = "#bfcedb";
                labels.style.fontFamily = "Arial, sans-serif";
                labels.style.fontSize = "11px";
                labels.style.fontWeight = "400";
                labels.style.fontVariantNumeric = "tabular-nums";
                labels.style.whiteSpace = "nowrap";
                labels.style.lineHeight = "16px";
                for (const [value, align] of [
                    ["0:00", "left"],
                    [timecode((Number(track.duration) || 0) / 2), "center"],
                    [timecode(track.duration), "right"],
                ]) {
                    const tick = document.createElement("span");
                    tick.textContent = value;
                    tick.style.textAlign = align;
                    labels.appendChild(tick);
                }
                timeline.appendChild(labels);
                strip.appendChild(timeline);
                row.appendChild(strip);
                waveforms.appendChild(row);

                let playhead = 0;
                const paint = () => drawWaveform(canvas, track, true, playhead);
                painters.push(paint);

                if (canPlay) {
                    const button = document.createElement("button");
                    button.type = "button";
                    // Vector icons avoid dependence on a platform font's
                    // mismatched play triangle and Roman numeral II glyph.
                    const ns = "http://www.w3.org/2000/svg";
                    const buttonIcon = document.createElementNS(ns, "svg");
                    buttonIcon.setAttribute("viewBox", "0 0 24 24");
                    buttonIcon.setAttribute("width", "16");
                    buttonIcon.setAttribute("height", "16");
                    buttonIcon.setAttribute("aria-hidden", "true");
                    const drawButtonIcon = (playing) => {
                        const shape = document.createElementNS(ns, "path");
                        shape.setAttribute("fill", "currentColor");
                        shape.setAttribute(
                            "d",
                            playing
                                ? "M6 5 H10 V19 H6 Z M14 5 H18 V19 H14 Z"
                                : "M7 4.5 L19 12 L7 19.5 Z"
                        );
                        buttonIcon.replaceChildren(shape);
                    };
                    drawButtonIcon(false);
                    button.appendChild(buttonIcon);
                    button.title = "Play from cursor";
                    button.setAttribute("aria-label", "Play audio");
                    button.style.flex = "0 0 26px";
                    button.style.width = "26px";
                    button.style.height = "30px";
                    button.style.padding = "0";
                    button.style.border = "1px solid #45576c";
                    button.style.borderRadius = "5px";
                    button.style.background = "#25374a";
                    button.style.color = "#ecf3f8";
                    button.style.cursor = "pointer";
                    button.style.display = "flex";
                    button.style.alignItems = "center";
                    button.style.justifyContent = "center";
                    strip.insertBefore(button, timeline);

                    // Use ComfyUI's standard /view temp route, never a raw
                    // local filesystem path.
                    const params = new URLSearchParams({
                        filename: descriptor.filename,
                        subfolder: descriptor.subfolder ?? "",
                        type: descriptor.type ?? "temp",
                    });
                    const audio = document.createElement("audio");
                    audio.preload = "metadata";
                    audio.src = api.apiURL(`/view?${params.toString()}`);
                    player = audio;
                    let pendingSeek = null;
                    audio.addEventListener("loadedmetadata", () => {
                        if (pendingSeek !== null && Number.isFinite(pendingSeek)) {
                            try { audio.currentTime = pendingSeek; } catch { /* loading */ }
                            pendingSeek = null;
                        }
                    });

                    const updateButton = () => {
                        const playing = !audio.paused && !audio.ended;
                        drawButtonIcon(playing);
                        button.title = playing ? "Pause audio" : "Play from cursor";
                        button.setAttribute("aria-label", playing ? "Pause audio" : "Play audio");
                    };

                    const updateCursor = () => {
                        const time = Number(audio.currentTime);
                        if (Number.isFinite(time)) playhead = time;
                        paint();
                    };

                    const tick = () => {
                        rafId = 0;
                        if (player !== audio) return;
                        updateCursor();
                        if (!audio.paused && !audio.ended) {
                            rafId = requestAnimationFrame(tick);
                        }
                    };
                    const beginAnimation = () => {
                        updateButton();
                        if (!rafId) rafId = requestAnimationFrame(tick);
                    };
                    audio.addEventListener("play", beginAnimation);
                    audio.addEventListener("pause", () => {
                        updateButton();
                        updateCursor();
                    });
                    audio.addEventListener("ended", () => {
                        updateButton();
                        updateCursor();
                    });
                    audio.addEventListener("seeked", updateCursor);
                    audio.addEventListener("timeupdate", updateCursor);
                    audio.addEventListener("error", () => {
                        button.textContent = "!";
                        button.title = "Preview audio unavailable; saved audio is unaffected";
                    });

                    button.addEventListener("click", () => {
                        if (audio.paused || audio.ended) {
                            if (audio.ended) audio.currentTime = 0;
                            audio.play().catch(() => {
                                button.title = "Browser could not start audio playback";
                            });
                        } else {
                            audio.pause();
                        }
                    });

                    let dragging = false;
                    const seek = (event) => {
                        const bounds = canvas.getBoundingClientRect();
                        const width = Math.max(1, bounds.width);
                        const left = 12;
                        const usable = Math.max(1, width - 24);
                        const coordinate = (event.clientX - bounds.left) * (width / Math.max(1, bounds.width));
                        const fraction = Math.min(1, Math.max(0, (coordinate - left) / usable));
                        const seconds = fraction * (Number(track.duration) || 0);
                        playhead = seconds;
                        canvas.title = "Seek: " + timecode(seconds);
                        // currentTime also works when paused, without starting play.
                        if (audio.readyState >= 1 && Number.isFinite(seconds)) {
                            try { audio.currentTime = seconds; } catch { /* loading */ }
                        } else {
                            pendingSeek = seconds;
                        }
                        paint();
                    };

                    canvas.style.cursor = "crosshair";
                    canvas.style.touchAction = "none";
                    canvas.title = "Click or drag to seek and play";
                    canvas.addEventListener("pointerdown", (event) => {
                        if (event.button !== 0) return;
                        dragging = true;
                        canvas.setPointerCapture(event.pointerId);
                        seek(event);
                        event.preventDefault();
                    });
                    canvas.addEventListener("pointermove", (event) => {
                        if (dragging) seek(event);
                    });
                    const endDrag = (event) => {
                        if (!dragging) return;
                        dragging = false;
                        seek(event);
                        if (canvas.hasPointerCapture(event.pointerId)) {
                            canvas.releasePointerCapture(event.pointerId);
                        }
                        // A click seeks and plays immediately; releasing a
                        // scrub gesture also starts playback from its endpoint.
                        if (audio.paused) {
                            audio.play().catch(() => {
                                button.title = "Browser could not start audio playback";
                            });
                        }
                    };
                    canvas.addEventListener("pointerup", endDrag);
                    canvas.addEventListener("pointercancel", () => { dragging = false; });
                }
            });

            drawAll = () => painters.forEach(paint => paint());
            requestAnimationFrame(() => {
                drawAll();
                refreshLayout(node);
            });
        }

        // Backend sends this alongside normal image/video preview payloads.
        const executed = (event) => {
            const detail = event?.detail;
            if (!detail || String(detail.node) !== String(node.id)) return;
            const payload = detail.output?.production_slate_audio_waveform;
            // ComfyUI combines UI values into arrays before websocket delivery.
            const data = Array.isArray(payload) ? payload[0] : payload;
            const preview = detail.output?.production_slate_audio_playback;
            render(data, preview);
        };
        api.addEventListener("executed", executed);

        const resizeObserver = new ResizeObserver(() => {
            if (lastData?.tracks?.length) requestAnimationFrame(drawAll);
        });
        resizeObserver.observe(panel);

        const priorOnRemoved = node.onRemoved;
        node.onRemoved = function(...args) {
            api.removeEventListener("executed", executed);
            resizeObserver.disconnect();
            stopPlayback();
            if (priorOnRemoved) priorOnRemoved.apply(this, args);
        };
    },

    loadedGraphNode(node) {
        if (node.comfyClass !== "ProductionSlateV4") return;
        requestAnimationFrame(() => {
            if (positionWaveformAfterMonitor(node)) refreshLayout(node);
        });
    },
});
