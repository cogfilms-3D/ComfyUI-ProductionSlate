// Production Slate V4.5 — compact, read-only LATENT loader browser.
// Separate extension: intentionally leaves the existing saver frontend untouched.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const SUPPORTED = [".latent", ".avlatent", ".safetensors"];

function joinLocal(folder, name) {
    const sep = folder.includes("\\") ? "\\" : "/";
    return folder.replace(/[\\/]$/, "") + sep + name;
}

function makeButton(label, callback) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    Object.assign(button.style, {
        background: "#352447",
        color: "#fff",
        border: "1px solid #766289",
        borderRadius: "5px",
        padding: "7px 12px",
        cursor: "pointer",
        fontSize: "13px",
    });
    button.addEventListener("click", callback);
    return button;
}

function openLatentBrowser(node) {
    const widget = node.widgets?.find(w => w.name === "latent_path");
    if (!widget) {
        app.ui.dialog.show("Production Slate: latent_path widget was not found.");
        return;
    }

    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "rgba(0, 0, 0, .72)",
        zIndex: "100000",
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
        background: "#241A30",
        color: "#fff",
        border: "1px solid #806995",
        borderRadius: "9px",
        padding: "16px",
        width: "min(730px, 94vw)",
        maxHeight: "86vh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "11px",
        fontFamily: "Arial, sans-serif",
    });
    overlay.appendChild(panel);

    const titleBar = document.createElement("div");
    Object.assign(titleBar.style, {
        display: "flex", justifyContent: "space-between", alignItems: "center",
    });
    const title = document.createElement("strong");
    title.textContent = "🎬 Production Slate — Load Latent";
    const closeButton = makeButton("Close", close);
    titleBar.append(title, closeButton);
    panel.appendChild(titleBar);

    const locationRow = document.createElement("div");
    Object.assign(locationRow.style, {display: "flex", gap: "7px", alignItems: "center"});
    const pathBox = document.createElement("input");
    pathBox.type = "text";
    pathBox.placeholder = "Enter a folder path";
    Object.assign(pathBox.style, {
        flex: "1", minWidth: "0", padding: "7px",
        color: "#fff", background: "#30263B", border: "1px solid #766289",
        borderRadius: "5px", fontSize: "13px",
    });
    const goButton = makeButton("Go", () => navigate(pathBox.value));
    const upButton = makeButton("Up", () => navigate(currentParent));
    pathBox.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            navigate(pathBox.value);
        }
    });
    locationRow.append(upButton, pathBox, goButton);
    panel.appendChild(locationRow);

    const drivesRow = document.createElement("div");
    Object.assign(drivesRow.style, {display: "flex", flexWrap: "wrap", gap: "6px"});
    panel.appendChild(drivesRow);

    const fileList = document.createElement("div");
    Object.assign(fileList.style, {
        overflowY: "auto", minHeight: "150px", maxHeight: "52vh",
        border: "1px solid #5D4A70", borderRadius: "5px", padding: "4px",
    });
    panel.appendChild(fileList);

    const status = document.createElement("div");
    Object.assign(status.style, {fontSize: "12px", opacity: "0.82"});
    status.textContent = "Select a saved .latent, .avlatent or .safetensors file.";
    panel.appendChild(status);

    let currentPath = "";
    let currentParent = "";
    let requestSerial = 0;
    let closed = false;

    function onKeydown(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
        }
    }

    function close() {
        if (closed) return;
        closed = true;
        ++requestSerial;
        document.removeEventListener("keydown", onKeydown, true);
        overlay.remove();
    }

    function chooseFile(filename) {
        if (!SUPPORTED.some(ext => filename.toLowerCase().endsWith(ext))) return;
        widget.value = joinLocal(currentPath, filename);
        widget.callback?.(widget.value);
        node.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        close();
    }

    function addEntry(text, onClick, isFile = false) {
        const entry = document.createElement("button");
        entry.type = "button";
        entry.textContent = text;
        Object.assign(entry.style, {
            display: "block", width: "100%", padding: "8px 10px",
            textAlign: "left", border: "0", borderBottom: "1px solid #493950",
            background: isFile ? "#403151" : "#2E2439",
            color: "#fff", cursor: "pointer", fontSize: "13px",
        });
        entry.addEventListener("click", onClick);
        fileList.appendChild(entry);
    }

    async function navigate(path) {
        const requestId = ++requestSerial;
        status.textContent = "Reading folder…";
        fileList.replaceChildren();
        try {
            const response = await api.fetchApi("/production_slate/latent_files", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({path: path || ""}),
            });
            const data = await response.json();
            if (closed || requestId !== requestSerial) return;
            if (!response.ok || data.error) {
                status.textContent = data.error || "Unable to open this folder.";
                return;
            }
            currentPath = data.path;
            currentParent = data.parent_path;
            pathBox.value = currentPath;
            upButton.disabled = currentPath === currentParent;

            drivesRow.replaceChildren();
            for (const drive of data.drives || []) {
                drivesRow.appendChild(makeButton(drive, () => navigate(drive)));
            }

            for (const name of data.directories || []) {
                addEntry("📁  " + name, () => navigate(joinLocal(currentPath, name)));
            }
            for (const name of data.files || []) {
                addEntry("📄  " + name, () => chooseFile(name), true);
            }
            if (!(data.directories?.length || data.files?.length)) {
                const empty = document.createElement("div");
                empty.textContent = "No folders or supported latent files found here.";
                empty.style.padding = "12px";
                fileList.appendChild(empty);
            }
            status.textContent = (data.files?.length || 0) +
                " latent file(s). Select a file to load its path into the node.";
        } catch (error) {
            if (!closed && requestId === requestSerial) {
                status.textContent = "Folder browsing failed: " + String(error);
            }
        }
    }

    overlay.addEventListener("mousedown", event => {
        if (event.target === overlay) close();
    });
    document.addEventListener("keydown", onKeydown, true);
    document.body.appendChild(overlay);
    navigate(widget.value || "");
}

app.registerExtension({
    name: "ProductionSlate.LoadLatentBrowser",
    nodeCreated(node) {
        if (node.comfyClass !== "ProductionSlateLoadLatent") return;
        node.title = "🎬 Production Slate — Load Latent";
        node.color = "#352447";
        node.bgcolor = "#241A30";
        node.addWidget(
            "button", "Browse latent file…", "", () => openLatentBrowser(node),
            {serialize: false}
        );
        node.setSize?.([Math.max(node.size[0], 370), Math.max(node.size[1], 122)]);
    },
});
