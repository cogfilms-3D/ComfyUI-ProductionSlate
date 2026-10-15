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
    const targetWidth = Math.max(240, Math.floor(canvas.parentElement?.clientWidth || 356));
    const height = expanded ? 130 : 72;
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);

    canvas.style.width = "100%";
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
    const bottom = h - 21;
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

    context.fillStyle = "#a8b9c8";
    context.font = "10px Arial, sans-serif";
    context.textBaseline = "bottom";
    context.textAlign = "left";
    const duration = Number(track.duration) || 0;
    context.fillText("0:00", left, h - 3);
    context.textAlign = "center";
    context.fillText(timecode(duration / 2), left + lineWidth / 2, h - 3);
    context.textAlign = "right";
    context.fillText(timecode(duration), right, h - 3);
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
        panel.style.padding = "8px";
        panel.style.background = "#1b1824";
        panel.style.border = "1px solid #4e415d";
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

        let drawAll = () => {};
        let lastData = null;

        function render(data) {
            lastData = data;
            waveforms.replaceChildren();
            const tracks = Array.isArray(data?.tracks) ? data.tracks : [];

            if (!tracks.length) {
                panel.style.display = "none";
                refreshLayout(node);
                return;
            }
            panel.style.display = "block";
            const isBatch = tracks.length > 1;
            const painters = [];
            tracks.forEach((track, index) => {
                const row = document.createElement("div");
                row.style.background = "#151e2b";
                row.style.borderRadius = "6px";
                row.style.padding = "6px 7px";
                row.style.marginBottom = "6px";
                row.style.cursor = "pointer";
                row.title = "Click to expand or collapse this waveform";

                // A single waveform is self-explanatory: no headings, filenames,
                // or duplicate duration. In batches, retain only a compact take
                // identifier (matching the filename's take number where possible).
                if (isBatch) {
                    const label = document.createElement("div");
                    label.style.display = "flex";
                    label.style.justifyContent = "space-between";
                    label.style.gap = "8px";
                    label.style.fontSize = "11px";
                    label.style.marginBottom = "4px";

                    const take = document.createElement("span");
                    const match = String(track.name || "").match(/_(\d+)\.[^.]+$/);
                    take.textContent = "Take " + (match ? match[1] : String(index + 1).padStart(3, "0"));

                    const duration = document.createElement("span");
                    duration.style.opacity = "0.8";
                    duration.textContent = timecode(track.duration);

                    label.append(take, duration);
                    row.appendChild(label);
                }

                const canvas = document.createElement("canvas");
                canvas.style.display = "block";
                canvas.style.borderRadius = "4px";
                row.appendChild(canvas);
                waveforms.appendChild(row);

                let expanded = tracks.length === 1;
                const paint = () => drawWaveform(canvas, track, expanded);
                painters.push(paint);
                row.addEventListener("click", () => {
                    expanded = !expanded;
                    paint();
                    refreshLayout(node);
                });
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
            render(data);
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
            if (priorOnRemoved) priorOnRemoved.apply(this, args);
        };
    },
});
