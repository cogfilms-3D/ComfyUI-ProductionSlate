// Production Slate V4.5 — full-size folder-selection browser.
// Reuses the tested saver backend (/production_slate/getpath).
// No changes to save paths, widgets, or existing production identities.
import { api } from "../../scripts/api.js";

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

function joinLocal(folder, name) {
    const separator = folder.includes("\\") ? "\\" : "/";
    return folder.replace(/[\\/]$/, "") + separator + name;
}

export function openProductionSlateFolderBrowser({
    outputRoot,
    productionName,
    onSelectOutput,
    onSelectProduction,
}) {
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
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
    });
    const title = document.createElement("strong");
    title.textContent = "🎬 Production Slate — Select Location";
    const closeButton = makeButton("Close", close);
    titleBar.append(title, closeButton);
    panel.appendChild(titleBar);

    const locationRow = document.createElement("div");
    Object.assign(locationRow.style, {
        display: "flex", gap: "7px", alignItems: "center",
    });
    const pathBox = document.createElement("input");
    pathBox.type = "text";
    pathBox.placeholder = "Enter a folder path";
    Object.assign(pathBox.style, {
        flex: "1",
        minWidth: "0",
        padding: "7px",
        color: "#fff",
        background: "#30263B",
        border: "1px solid #766289",
        borderRadius: "5px",
        fontSize: "13px",
    });
    const upButton = makeButton("Up", () => {
        if (!currentPath || currentPath === currentParent) {
            navigate("");
        } else {
            navigate(currentParent);
        }
    });
    const backButton = makeButton("Back", () => {
        if (!history.length) return;
        const previous = history.pop();
        updateNavigation();
        navigate(previous, false);
    });
    const goButton = makeButton("Go", () => navigate(pathBox.value));
    pathBox.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            navigate(pathBox.value);
        }
    });
    locationRow.append(backButton, upButton, pathBox, goButton);
    panel.appendChild(locationRow);

    const drivesRow = document.createElement("div");
    Object.assign(drivesRow.style, {
        display: "flex", flexWrap: "wrap", gap: "6px",
    });
    panel.appendChild(drivesRow);

    const folderList = document.createElement("div");
    Object.assign(folderList.style, {
        overflowY: "auto",
        minHeight: "150px",
        maxHeight: "52vh",
        border: "1px solid #5D4A70",
        borderRadius: "5px",
        padding: "4px",
    });
    panel.appendChild(folderList);

    const selectionRow = document.createElement("div");
    Object.assign(selectionRow.style, {
        display: "flex", flexWrap: "wrap", gap: "7px",
    });
    const selectOutput = makeButton("Select Output Location", () => {
        if (!canSelectOutput) return;
        onSelectOutput(currentPath);
        close();
    });
    const selectProduction = makeButton("Select Production Folder", () => {
        if (!canSelectProduction) return;
        onSelectProduction(currentParent, currentFolderName);
        close();
    });
    selectionRow.append(selectOutput, selectProduction);
    panel.appendChild(selectionRow);

    const status = document.createElement("div");
    Object.assign(status.style, {fontSize: "12px", opacity: "0.82"});
    status.textContent = "Choose a folder, then explicitly select its role.";
    panel.appendChild(status);

    let currentPath = "";
    let currentParent = "";
    let currentFolderName = "";
    let canSelectOutput = false;
    let canSelectProduction = false;
    let requestSerial = 0;
    let closed = false;
    let defaultPath = "";
    const history = [];

    function updateNavigation() {
        backButton.disabled = history.length === 0;
        upButton.disabled = !currentPath;
    }
    function updateSelections() {
        selectOutput.disabled = !canSelectOutput;
        selectProduction.disabled = !canSelectProduction || !productionName;
        for (const button of [selectOutput, selectProduction]) {
            button.style.opacity = button.disabled ? "0.45" : "1";
            button.style.cursor = button.disabled ? "not-allowed" : "pointer";
        }
    }
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

    function folderEntry(folder) {
        const entry = document.createElement("button");
        entry.type = "button";
        entry.textContent = "📁  " + folder.name +
            (folder.writable ? "" : "  🔒 Unavailable");
        entry.disabled = !folder.writable;
        Object.assign(entry.style, {
            display: "block",
            width: "100%",
            padding: "8px 10px",
            textAlign: "left",
            border: "0",
            borderBottom: "1px solid #493950",
            background: "#2E2439",
            color: "#fff",
            cursor: folder.writable ? "pointer" : "not-allowed",
            opacity: folder.writable ? "1" : "0.55",
            fontSize: "13px",
        });
        if (folder.writable) {
            entry.addEventListener("click", () =>
                navigate(joinLocal(currentPath, folder.name))
            );
        }
        folderList.appendChild(entry);
    }

    function renderDrives(drives) {
        drivesRow.replaceChildren();
        if (defaultPath) {
            drivesRow.appendChild(makeButton("DEFAULT", () => navigate(defaultPath)));
        }
        for (const drive of drives || []) {
            drivesRow.appendChild(makeButton(drive, () => navigate(drive)));
        }
    }

    async function navigate(path, remember = true) {
        const wanted = String(path || "").trim();
        const requestId = ++requestSerial;
        const previous = currentPath;
        status.textContent = "Reading folder…";
        folderList.replaceChildren();
        try {
            const response = await api.fetchApi("/production_slate/getpath", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({path: wanted}),
            });
            const data = await response.json();
            if (closed || requestId !== requestSerial) return false;

            if (!response.ok || data.error) {
                status.textContent = data.error || "Unable to open this folder.";
                return false;
            }

            if (remember && wanted !== previous) {
                history.push(previous);
            }
            currentPath = data.path || "";
            currentParent = data.parent_path || "";
            currentFolderName = data.folder_name || "";
            canSelectOutput = data.writable === true;
            canSelectProduction = data.can_select_production === true;
            pathBox.value = currentPath;
            updateNavigation();
            updateSelections();

            if (Array.isArray(data.drives)) {
                defaultPath = data.default_path || "";
                renderDrives(data.drives);
            }

            for (const folder of data.directories || []) {
                folderEntry(folder);
            }

            if (!currentPath) {
                status.textContent = "Choose DEFAULT or a drive, or enter a folder path.";
            } else {
                if (!data.directories?.length) {
                    const empty = document.createElement("div");
                    empty.textContent = "No subfolders found.";
                    empty.style.padding = "12px";
                    folderList.appendChild(empty);
                }
                status.textContent = canSelectOutput
                    ? "Select Output Location or Select Production Folder."
                    : "This folder is not writable; select another location.";
            }
            return true;
        } catch (error) {
            if (!closed && requestId === requestSerial) {
                status.textContent = "Folder browsing failed: " + String(error);
            }
            return false;
        }
    }

    overlay.addEventListener("mousedown", event => {
        if (event.target === overlay) close();
    });
    document.addEventListener("keydown", onKeydown, true);
    document.body.appendChild(overlay);
    updateNavigation();
    updateSelections();

    // Obtain drive/default buttons, then open the existing Output Location.
    navigate("", false).then(() => {
        if (!closed && String(outputRoot?.value || "").trim()) {
            navigate(String(outputRoot.value).trim(), false);
        }
    });
}
