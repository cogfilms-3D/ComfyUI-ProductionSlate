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

function drawWaveform(canvas, track, expanded) {
    // Use local layout pixels, never the zoomed screen-space rect:
    // ComfyUI transforms the whole node when the graph is zoomed.
    const targetWidth = Math.max(120, Math.round(
        canvas.clientWidth || canvas.parentElement?.clientWidth || 320
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

    context.fillStyle = "#000000";
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

}

// Keep the execution monitor above the waveform, regardless of extension
// ordering. ComfyUI adds its native video-preview widget asynchronously
// after loading the saved video; it must precede the audio waveform.
// The waveform stays after all existing media previews.
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
        // Visually centre the waveform in the available space below the
        // execution monitor without changing any widget heights or ordering.
        // The original preview had more clear space above than below.
        panel.style.transform = "translateY(-16px)";
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

        // ComfyUI's built-in video preview is created asynchronously by
        // useNodeVideo() as a widget named "video-preview". It may arrive
        // after our executed event and any initial widget-order correction.
        // Observe that specific widget insertion, retaining the original
        // addDOMWidget method, widget object and native video controls.
        const originalAddDOMWidget = node.addDOMWidget;
        const observedAddDOMWidget = function(name, ...args) {
            const added = originalAddDOMWidget.call(this, name, ...args);
            if (name === "video-preview") {
                if (positionWaveformAfterMonitor(this)) refreshLayout(this);
            }
            return added;
        };
        node.addDOMWidget = observedAddDOMWidget;

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
                // One plain, dark preview surface, consistent with the
                // existing image/video boxes: no extra blue frame or border.
                row.style.background = "#000000";
                row.style.border = "none";
                row.style.borderRadius = "6px";
                row.style.padding = "4px";
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
                timeline.style.background = "#000000";
                timeline.style.borderRadius = "4px";
                timeline.style.overflow = "hidden";
                timeline.style.position = "relative";

                const canvas = document.createElement("canvas");
                canvas.style.display = "block";
                canvas.style.width = "100%";
                canvas.style.minWidth = "0";
                canvas.style.borderRadius = "4px 4px 0 0";
                timeline.appendChild(canvas);

                // A single SVG stroke stays antialiased at ComfyUI zoom
                // extremes. non-scaling-stroke keeps line thickness consistent
                // instead of alternately rasterising one or two yellow columns.
                const ns = "http://www.w3.org/2000/svg";
                const cursorTrack = document.createElementNS(ns, "svg");
                cursorTrack.setAttribute("viewBox", "0 0 100 100");
                cursorTrack.setAttribute("preserveAspectRatio", "none");
                cursorTrack.setAttribute("aria-hidden", "true");
                cursorTrack.style.position = "absolute";
                cursorTrack.style.left = "12px";
                cursorTrack.style.right = "12px";
                cursorTrack.style.width = "calc(100% - 24px)";
                cursorTrack.style.top = "8px";
                cursorTrack.style.height = "94px";
                cursorTrack.style.pointerEvents = "none";
                cursorTrack.style.overflow = "visible";
                cursorTrack.style.zIndex = "1";

                const cursor = document.createElementNS(ns, "line");
                cursor.setAttribute("x1", "0");
                cursor.setAttribute("x2", "0");
                cursor.setAttribute("y1", "0");
                cursor.setAttribute("y2", "100");
                cursor.setAttribute("stroke", "#ffcf78");
                cursor.setAttribute("stroke-width", "2");
                cursor.setAttribute("vector-effect", "non-scaling-stroke");
                cursor.setAttribute("stroke-linecap", "butt");
                cursorTrack.appendChild(cursor);
                timeline.appendChild(cursorTrack);

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
                let durationOnTimeline = Number(track.duration) || 0;
                const movePlayhead = () => {
                    const fraction = durationOnTimeline > 0
                        ? Math.min(1, Math.max(0, playhead / durationOnTimeline))
                        : 0;
                    const x = (fraction * 100).toFixed(4);
                    cursor.setAttribute("x1", x);
                    cursor.setAttribute("x2", x);
                };
                const paint = () => {
                    drawWaveform(canvas, track, true);
                    movePlayhead();
                };
                painters.push(paint);

                if (canPlay) {
                    const button = document.createElement("button");
                    button.type = "button";
                    // Vector icons avoid dependence on a platform font's
                    // mismatched play triangle and Roman numeral II glyph.
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
                    button.style.border = "none";
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
                        // Both the playback clock and the waveform timeline
                        // must use the actual encoded file duration. This can
                        // differ slightly from the original tensor's duration.
                        if (Number.isFinite(audio.duration) && audio.duration > 0) {
                            durationOnTimeline = audio.duration;
                            labels.children[1].textContent = timecode(audio.duration / 2);
                            labels.children[2].textContent = timecode(audio.duration);
                        }
                        if (pendingSeek !== null && Number.isFinite(pendingSeek)) {
                            try { audio.currentTime = pendingSeek; } catch { /* loading */ }
                            pendingSeek = null;
                        }
                        movePlayhead();
                    });

                    const updateButton = () => {
                        const playing = !audio.paused && !audio.ended;
                        drawButtonIcon(playing);
                        button.title = playing ? "Pause audio" : "Play from cursor";
                        button.setAttribute("aria-label", playing ? "Pause audio" : "Play audio");
                    };

                    let dragging = false;
                    const updateCursor = () => {
                        // While dragging, late media timeupdate events must not
                        // compete with the position selected by the pointer.
                        if (dragging) return;
                        const time = Number(audio.currentTime);
                        if (Number.isFinite(time)) playhead = time;
                        movePlayhead();
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
                    // The rAF loop is the single animation clock while
                    // playing. Listening to timeupdate as well caused redundant
                    // off-frame movement, particularly noticeable when zoomed.
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

                    const seek = (event) => {
                        const bounds = canvas.getBoundingClientRect();
                        // Convert the screen-space pointer coordinate to a
                        // relative fraction, then remove the 12px local inset.
                        // Never mix screen pixels with zoomed node CSS pixels.
                        const proportion = (event.clientX - bounds.left) /
                            Math.max(1, bounds.width);
                        const localWidth = Math.max(25, canvas.clientWidth);
                        const insetFraction = 12 / localWidth;
                        const fraction = Math.min(1, Math.max(0,
                            (proportion - insetFraction) / (1 - 2 * insetFraction)
                        ));
                        const seconds = fraction * durationOnTimeline;
                        playhead = seconds;
                        canvas.title = "Seek: " + timecode(seconds);
                        // currentTime also works when paused, without starting play.
                        if (audio.readyState >= 1 && Number.isFinite(seconds)) {
                            try { audio.currentTime = seconds; } catch { /* loading */ }
                        } else {
                            pendingSeek = seconds;
                        }
                        movePlayhead();
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
            // Restore the method if this instance still owns the wrapper.
            // Do not remove an unrelated extension's later replacement.
            if (this.addDOMWidget === observedAddDOMWidget) {
                this.addDOMWidget = originalAddDOMWidget;
            }
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
