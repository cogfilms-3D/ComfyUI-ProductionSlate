// ============================================================
// Production Slate V4.4 development line
// Unified VIDEO / IMAGE frontend
//
// Frontend responsibilities:
//   - legacy workflow migration and field restoration
//   - ProductionSlate node presentation and field labels
//   - Output Location display handling
//   - automatic Suggested Code behaviour
//   - Output / Production folder browser
//   - ProductionSlate execution monitor and progress display
//   - IMAGE-only preview with pixel-resolution display
//   - source badge presentation
//   - preview/reload layout handling
//
// V4.3 remains the proven production-saving foundation.
// V4.4 adds monitoring, image-preview and UI refinements.
// ============================================================
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const productionSlateMigratedNodeIds = new Set();

app.registerExtension({
    name: "ProductionSlate.Browse",

    beforeConfigureGraph(graphData) {
        const supportedTypes = new Set([
            "ProductionSlateV4_Build004C_Image",
            "ProductionSlateV4_Build004C_Video",
            "ProductionSlateV4",
        ]);

        const legacyWidgetOrder = [
            "output_root",
            "production_name",
            "production_slate_browse",
            "production_slate_browser_panel",
            "production_code",
            "scene",
            "shot",
            "suffix",
            "description",
            "clear_slate",
        ];

        const legacyRequiredNamedValues = [
            "output_root",
            "production_name",
            "production_code",
            "scene",
            "shot",
            "suffix",
            "description",
            "clear_slate",
        ];

        const unifiedWidgetOrder = [
            "output_root",
            "production_name",
            "production_slate_browse",
            "production_slate_browser_panel",
            "production_code",
            "scene",
            "shot",
            "suffix",
            "description",
        ];

        const unifiedRequiredNamedValues = [
            "output_root",
            "production_name",
            "production_code",
            "scene",
            "shot",
            "suffix",
            "description",
        ];

        for (const nodeInfo of graphData?.nodes ?? []) {
            if (!supportedTypes.has(nodeInfo.type)) {
                continue;
            }

            const isUnified =
                nodeInfo.type === "ProductionSlateV4";

            const currentWidgetOrder =
                isUnified
                    ? unifiedWidgetOrder
                    : legacyWidgetOrder;

            const requiredNamedValues =
                isUnified
                    ? unifiedRequiredNamedValues
                    : legacyRequiredNamedValues;

            const namedValues = nodeInfo.widgets_values_named;

            if (
                !namedValues ||
                Array.isArray(namedValues) ||
                typeof namedValues !== "object"
            ) {
                continue;
            }

            const hasRequiredValues =
                requiredNamedValues.every((name) =>
                    Object.prototype.hasOwnProperty.call(
                        namedValues,
                        name
                    )
                );

            if (!hasRequiredValues) {
                continue;
            }

            const rebuiltValues = currentWidgetOrder.map(
                (name) =>
                    Object.prototype.hasOwnProperty.call(
                        namedValues,
                        name
                    )
                        ? namedValues[name]
                        : ""
            );

            const previousValues =
                Array.isArray(nodeInfo.widgets_values)
                    ? nodeInfo.widgets_values
                    : [];

            const changed =
                previousValues.length !== rebuiltValues.length ||
                rebuiltValues.some(
                    (value, index) =>
                        previousValues[index] !== value
                );

            nodeInfo.widgets_values = rebuiltValues;

            if (changed) {
                productionSlateMigratedNodeIds.add(
                    String(nodeInfo.id)
                );

                console.log(
                    "[ProductionSlate] Normalised saved 004-C widget order."
                );
            }
        }
    },

    nodeCreated(node) {
        const isImage =
            node.comfyClass === "ProductionSlateV4_Build004C_Image";

        const isVideo =
            node.comfyClass === "ProductionSlateV4_Build004C_Video";

        const isUnified =
            node.comfyClass === "ProductionSlateV4";

        if (!isImage && !isVideo && !isUnified) {
            return;
        }

        // --------------------------------------------------------
        // Production Slate V4 node identity
        // --------------------------------------------------------
        if (isImage) {
            node.title = "🎬 Production Slate V4 — IMAGE SAVER 004-C";
        }

        if (isVideo) {
            node.title = "🎬 Production Slate V4 — VIDEO SAVER 004-C";
        }

        if (isUnified) {
            node.title = "🎬 Production Slate V4.4";
        }

        node.color = "#352447";
        node.bgcolor = "#241A30";

        // --------------------------------------------------------
        // ProductionSlate V4.4 default unified-node width
        // --------------------------------------------------------

        if (isUnified) {
            node.setSize([
                400,
                node.size[1]
            ]);
        }
        if (node.setDirtyCanvas) {
            node.setDirtyCanvas(true, true);
        }

        const outputRoot = node.widgets?.find(
            (widget) => widget.name === "output_root"
        );

        if (!outputRoot) {
            console.warn(
                "[ProductionSlate] output_root widget not found."
            );
            return;
        }

        const productionName = node.widgets?.find(
            (widget) => widget.name === "production_name"
        );

        const productionCode = node.widgets?.find(
            (widget) => widget.name === "production_code"
        );

        const sceneWidget = node.widgets?.find(
            (widget) => widget.name === "scene"
        );

        const shotWidget = node.widgets?.find(
            (widget) => widget.name === "shot"
        );

        const suffixWidget = node.widgets?.find(
            (widget) => widget.name === "suffix"
        );

        const descriptionWidget = node.widgets?.find(
            (widget) => widget.name === "description"
        );

        const clearSlate = node.widgets?.find(
            (widget) => widget.name === "clear_slate"
        );

        if (clearSlate) {
            clearSlate.hidden = true;

            clearSlate.options = clearSlate.options || {};
            clearSlate.options.hidden = true;

            node.setSize(node.computeSize());
            node.setDirtyCanvas(true, true);
        }

        outputRoot.label = "Output Location";

        if (productionName) {
            productionName.label = "Production / Folder";
        }

        if (productionCode) {
            productionCode.label = "Code";
        }

        if (sceneWidget) {
            sceneWidget.label = "Scene";
        }

        if (shotWidget) {
            shotWidget.label = "Shot";
        }

        if (suffixWidget) {
            suffixWidget.label = "Shot Variation";
        }

        if (descriptionWidget) {
            descriptionWidget.label = "Slate Notes";
        }

        // --------------------------------------------------------
        // Output Location display formatting
        // Vue/PrimeVue input handling.
        // Keep the useful right-hand end of long paths visible
        // when unfocused, while restoring normal LTR editing
        // when the field has focus.
        // The underlying widget.value is unchanged.
        // --------------------------------------------------------

        const installOutputLocationDisplay = () => {
            const nodeElement = document.querySelector(
                `[data-node-id="${node.id}"]`
            );

            if (!nodeElement) {
                return false;
            }

            const inputSelector =
                'input[aria-label="output_root"]';

            const applyUnfocusedDisplay = (inputElement) => {
                inputElement.style.direction = "ltr";
                inputElement.style.textAlign = "left";

                if (document.activeElement === inputElement) {
                    return;
                }

                if (inputElement.scrollWidth > inputElement.clientWidth) {
                    inputElement.style.direction = "rtl";
                    inputElement.style.textAlign = "left";
                } else {
                    inputElement.style.direction = "ltr";
                    inputElement.style.textAlign = "left";
                }

                inputElement.style.unicodeBidi = "normal";
                };

            const inputElement =
                nodeElement.querySelector(inputSelector);

            if (inputElement) {
                applyUnfocusedDisplay(inputElement);

                if (!inputElement._productionSlateResizeObserver) {
                    const resizeObserver = new ResizeObserver(() => {
                        applyUnfocusedDisplay(inputElement);
                    });

                    resizeObserver.observe(inputElement);
                    inputElement._productionSlateResizeObserver =
                        resizeObserver;
                }
            }

            if (
                nodeElement.dataset
                    .productionSlateOutputDisplayInstalled
                    === "true"
            ) {
                return true;
            }

            nodeElement.addEventListener(
                "focusin",
                (event) => {
                    const target = event.target;

                    if (
                        target instanceof HTMLInputElement &&
                        target.matches(inputSelector)
                    ) {
                        target.style.direction = "ltr";
                        target.style.textAlign = "left";
                    }
                }
            );

            nodeElement.addEventListener(
                "focusout",
                (event) => {
                    const target = event.target;

                    if (
                        target instanceof HTMLInputElement &&
                        target.matches(inputSelector)
                    ) {
                        applyUnfocusedDisplay(target);
                    }
                }
            );

            nodeElement.dataset
                .productionSlateOutputDisplayInstalled
                = "true";

            return true;
        };
        function refreshOutputLocationDisplay() {
            requestAnimationFrame(() => {
                installOutputLocationDisplay();
            });
        }
        if (!installOutputLocationDisplay()) {
            requestAnimationFrame(() => {
                installOutputLocationDisplay();
            });
        }
        // --------------------------------------------------------
        // Automatic Suggested Code
        // Uses the tested ProductionSlate code-generation algorithm.
        // Manual Code edits take control; clearing Code restores it.
        // --------------------------------------------------------
        if (productionName && productionCode) {
            const connectorWords = new Set([
                "a", "an", "and", "as", "at", "by", "for",
                "in", "of", "on", "or", "the", "to"
            ]);

            function generateSuggestedCode(value, maxLength = 8) {
                const text = String(value ?? "").trim().replace(/\s+/g, " ");
                if (!text) return "";

                const cleaned = text.replace(/[^0-9A-Za-z]+/g, "").toUpperCase();
                if (cleaned && cleaned.length <= maxLength) return cleaned;

                let tokens = text.match(/[A-Za-z]+|\d+/g) || [];
                if (tokens.length && tokens[0].toLowerCase() === "the") tokens = tokens.slice(1);

                const parts = tokens.map(token => /^\d+$/.test(token) ? token : token[0].toUpperCase());
                let candidate = parts.join("");
                if (candidate.length <= maxLength) return candidate;

                candidate = parts.filter((part, i) => !connectorWords.has(tokens[i].toLowerCase())).join("");
                if (candidate.length <= maxLength) return candidate;

                const numericText = tokens.filter(t => /^\d+$/.test(t)).join("");
                const letters = parts.filter((part, i) => !/^\d+$/.test(tokens[i]) && !connectorWords.has(tokens[i].toLowerCase())).join("");
                if (numericText.length >= maxLength) return numericText.slice(0, maxLength);
                return (letters.slice(0, maxLength - numericText.length) + numericText).toUpperCase();
            }

            let codeAutomatic = !productionCode.value || productionCode.value === "WT";
            let codeUpdatingAutomatically = false;

            function updateSuggestedCode() {
                if (!codeAutomatic) return;

                const suggestedCode =
                    generateSuggestedCode(productionName.value) || "WT";

                codeUpdatingAutomatically = true;

                productionCode.value = suggestedCode;

                if (productionCode.inputEl) {
                    productionCode.inputEl.value = suggestedCode;
                }

                codeUpdatingAutomatically = false;

                node.setDirtyCanvas?.(true, true);
            }

            updateSuggestedCode();

            const originalProductionCallback = productionName.callback;
            productionName.callback = function(value) {
                if (originalProductionCallback) originalProductionCallback.call(this, value);
                updateSuggestedCode();
            };

            const originalCodeCallback = productionCode.callback;
            productionCode.callback = function(value) {
                if (!codeUpdatingAutomatically) {
                    const enteredValue = String(value ?? "").trim();
                    codeAutomatic = enteredValue === "";
                }

                if (originalCodeCallback) {
                    originalCodeCallback.call(this, value);
                }
            };

            if (productionCode.inputEl) {
                productionCode.inputEl.addEventListener("input", () => {
                    const value = productionCode.inputEl.value.trim();

                    productionCode.value = value;
                    codeAutomatic = value === "";
                });
            }

            const installCodeFieldFocusHandling = () => {
                const nodeElement = document.querySelector(
                    `[data-node-id="${node.id}"]`
                );

                if (!nodeElement) {
                    return false;
                }

                if (
                    nodeElement.dataset
                        .productionSlateCodeFocusHandlingInstalled
                        === "true"
                ) {
                    return true;
                }

                nodeElement.addEventListener(
                    "focusout",
                    (event) => {
                        const target = event.target;

                        if (
                            target instanceof HTMLInputElement &&
                            target.matches(
                                'input[aria-label="production_code"]'
                            )
                        ) {
                            const value = target.value.trim();

                            productionCode.value = value;
                            codeAutomatic = value === "";

                            if (codeAutomatic) {
                                requestAnimationFrame(() => {
                                    updateSuggestedCode();

                                    target.value =
                                        productionCode.value;

                                    node.setDirtyCanvas?.(
                                        true,
                                        true
                                    );
                                });
                            }
                        }
                    }
                );

                nodeElement.dataset
                    .productionSlateCodeFocusHandlingInstalled
                    = "true";

                return true;
            };

            if (!installCodeFieldFocusHandling()) {
                requestAnimationFrame(() => {
                    installCodeFieldFocusHandling();
                });
            }
        }

        const browseButton = document.createElement("button");

        browseButton.type = "button";
        browseButton.textContent = "Browse…";

        browseButton.style.width = "100%";
        browseButton.style.height = "30px";
        browseButton.style.minHeight = "30px";
        browseButton.style.maxHeight = "30px";
        browseButton.style.cursor = "pointer";

        const browserPanel = document.createElement("div");

        browserPanel.style.display = "none";
        browserPanel.style.width = "100%";
        browserPanel.style.marginTop = "6px";
        browserPanel.style.boxSizing = "border-box";

        const locationDisplay = document.createElement("div");

        locationDisplay.style.padding = "6px";
        locationDisplay.style.marginBottom = "6px";
        locationDisplay.style.border = "1px solid #555";
        locationDisplay.style.background = "#222";
        locationDisplay.style.color = "#ddd";
        locationDisplay.style.fontSize = "12px";
        locationDisplay.style.wordBreak = "break-all";

        const controls = document.createElement("div");

        controls.style.display = "flex";
        controls.style.gap = "6px";
        controls.style.marginBottom = "6px";

        const backButton = document.createElement("button");

        backButton.type = "button";
        backButton.textContent = "← Back";
        backButton.style.flex = "1";
        backButton.style.height = "28px";
        backButton.style.cursor = "pointer";

        const upButton = document.createElement("button");

        upButton.type = "button";
        upButton.textContent = "↑ Up";
        upButton.style.flex = "1";
        upButton.style.height = "28px";
        upButton.style.cursor = "pointer";

        const selectButton = document.createElement("button");

        selectButton.type = "button";
        selectButton.textContent = "Select This Location";
        selectButton.style.flex = "1 0 100%";
        selectButton.style.width = "100%";
        selectButton.style.height = "28px";
        selectButton.style.cursor = "pointer";

        selectButton.textContent = "Select Output Location";

        const selectProductionButton = document.createElement("button");

        selectProductionButton.type = "button";
        selectProductionButton.textContent = "Select This Production";
        selectProductionButton.style.width = "100%";
        selectProductionButton.style.height = "28px";
        selectProductionButton.style.cursor = "pointer";
        selectProductionButton.disabled = true;

        controls.style.flexWrap = "wrap";

        controls.appendChild(backButton);
        controls.appendChild(upButton);
        controls.appendChild(selectButton);
        controls.appendChild(selectProductionButton);

        const directoryList = document.createElement("div");

        directoryList.style.maxHeight = "180px";
        directoryList.style.overflowY = "auto";
        directoryList.style.border = "1px solid #555";
        directoryList.style.background = "#181818";

        browserPanel.appendChild(locationDisplay);
        browserPanel.appendChild(controls);
        browserPanel.appendChild(directoryList);

        let currentPath = outputRoot.value?.trim() || "";
        let currentParentPath = "";
        let currentFolderName = "";
        let browseRequestId = 0;
        const navigationHistory = [];

        function updateNavigationButtons() {
            backButton.disabled =
                navigationHistory.length === 0;
        }

        function getParentPath(path) {
            let cleanPath = path.replace(/[\\/]+$/, "");

            // Windows drive root, e.g. C:
            if (/^[A-Za-z]:$/.test(cleanPath)) {
                return cleanPath + "\\";
            }

            const lastBackslash = cleanPath.lastIndexOf("\\");
            const lastSlash = cleanPath.lastIndexOf("/");
            const separatorIndex = Math.max(
                lastBackslash,
                lastSlash
            );

            if (separatorIndex < 0) {
                return cleanPath;
            }

            // Preserve Windows drive root, e.g. C:\
            if (
                separatorIndex === 2 &&
                /^[A-Za-z]:/.test(cleanPath)
            ) {
                return cleanPath.substring(0, 3);
            }

            const parent = cleanPath.substring(0, separatorIndex);

            return parent || cleanPath;
        }

        async function loadDrives() {
            const requestId = ++browseRequestId;
            selectButton.disabled = true;
            selectProductionButton.disabled = true;
            directoryList.innerHTML = "";

            const loading = document.createElement("div");

            loading.textContent = "Reading drives…";
            loading.style.padding = "8px";
            loading.style.color = "#aaa";

    directoryList.appendChild(loading);

    try {
        const response = await fetch(
            "/production_slate/getpath",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    path: "",
                }),
            }
        );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const result = await response.json();

        if (requestId !== browseRequestId) {
            return;
        }

        directoryList.innerHTML = "";

// DEFAULT is a browsable starting location.
// Selection remains explicit through Select Output Location.

        const defaultItem = document.createElement("button");

        defaultItem.type = "button";
        defaultItem.textContent = "DEFAULT";

        defaultItem.style.display = "block";
        defaultItem.style.width = "100%";
        defaultItem.style.padding = "6px 8px";
        defaultItem.style.border = "0";
        defaultItem.style.borderBottom = "1px solid #333";
        defaultItem.style.background = "transparent";
        defaultItem.style.color = "#ddd";
        defaultItem.style.textAlign = "left";
        defaultItem.style.cursor = "pointer";

        defaultItem.addEventListener("click", () => {
            const defaultPath =
            result.default_path || "";

            if (!defaultPath) {
                return;
            }

            navigationHistory.length = 0;
            updateNavigationButtons();

            loadDirectory(defaultPath);
        });

        directoryList.appendChild(defaultItem);

        const drives = result.drives || [];

        for (const drive of drives) {
            const item = document.createElement("button");

            item.type = "button";
            item.textContent = drive;

            item.style.display = "block";
            item.style.width = "100%";
            item.style.padding = "6px 8px";
            item.style.border = "0";
            item.style.borderBottom = "1px solid #333";
            item.style.background = "transparent";
            item.style.color = "#ddd";
            item.style.textAlign = "left";
            item.style.cursor = "pointer";

            item.addEventListener("click", () => {
                navigationHistory.length = 0;
                updateNavigationButtons();

                loadDirectory(drive);
            });

            directoryList.appendChild(item);
        }
    } catch (error) {
        if (requestId !== browseRequestId) {
            return;
        }

        console.error(
            "[ProductionSlate] Drive list request failed:",
            error
        );

        directoryList.innerHTML = "";

        const errorMessage = document.createElement("div");

        errorMessage.textContent =
            "Unable to read available drives.";

        errorMessage.style.padding = "8px";
        errorMessage.style.color = "#f88";

        directoryList.appendChild(errorMessage);
    }
}


        async function loadDirectory(path) {
            const requestId = ++browseRequestId;
            selectButton.disabled = true;
            selectProductionButton.disabled = true;
            directoryList.innerHTML = "";

            const loading = document.createElement("div");

            loading.textContent = "Reading…";
            loading.style.padding = "8px";
            loading.style.color = "#aaa";

            directoryList.appendChild(loading);

            try {
                const response = await fetch(
                    "/production_slate/getpath",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            path: path,
                        }),
                    }
                );

                if (!response.ok) {
                    throw new Error(
                        `HTTP ${response.status}`
                    );
                }

                const result = await response.json();

                if (requestId !== browseRequestId) {
                    return;
                }

                currentPath = result.path || path;
                currentParentPath = result.parent_path || "";
                currentFolderName = result.folder_name || "";
                locationDisplay.textContent = currentPath;

                selectButton.disabled = result.writable !== true;

                selectProductionButton.disabled = (
                    !productionName ||
                    result.can_select_production !== true
                );

                directoryList.innerHTML = "";

                const directories = result.directories || [];

                if (directories.length === 0) {
                    const empty = document.createElement("div");

                    empty.textContent = "No subfolders found.";
                    empty.style.padding = "8px";
                    empty.style.color = "#aaa";

                    directoryList.appendChild(empty);
                    return;
                }

                for (const directory of directories) {
                    const directoryName = directory.name;
                    const isWritable = directory.writable;
                    const item = document.createElement("button");

                    item.type = "button";
                    item.textContent =
                        "📁 " +
                        directoryName +
                        (isWritable ? "" : "  🔒 Unavailable");

                    item.style.display = "block";
                    item.style.width = "100%";
                    item.style.padding = "6px 8px";
                    item.style.border = "0";
                    item.style.borderBottom = "1px solid #333";
                    item.style.background = "transparent";
                    item.style.color = "#ddd";
                    item.style.textAlign = "left";
                    item.style.cursor = "pointer";

                    item.addEventListener("click", () => {
                        if (!isWritable) {
                            return;
}
                        navigationHistory.push(currentPath);
                        updateNavigationButtons();

                        const nextPath =
                            currentPath.replace(/[\\/]+$/, "") +
                            "/" +
                            directoryName;

                        loadDirectory(nextPath);
                    });

                    directoryList.appendChild(item);
                }
            } catch (error) {
                if (requestId !== browseRequestId) {
                    return;
                }

                console.error(
                    "[ProductionSlate] Browse request failed:",
                    error
                );

                directoryList.innerHTML = "";

                const errorMessage = document.createElement("div");

                errorMessage.textContent =
                    "Unable to read this location.";

                errorMessage.style.padding = "8px";
                errorMessage.style.color = "#f88";

                directoryList.appendChild(errorMessage);
            }
        }

        selectProductionButton.addEventListener("click", () => {
            if (selectProductionButton.disabled || !productionName) {
                return;
            }

            const folderName = currentFolderName;
            const parentPath = currentParentPath;

            if (!folderName || !parentPath) {
                return;
            }

            outputRoot.value = parentPath;
            refreshOutputLocationDisplay();
            productionName.value = folderName;

            if (outputRoot.inputEl) {
                outputRoot.inputEl.value = parentPath;
            }

            if (productionName.inputEl) {
                productionName.inputEl.value = folderName;
            }

            // Use the existing automatic/manual Code handling.
            outputRoot.callback?.call(outputRoot, parentPath);
            productionName.callback?.call(productionName, folderName);

            browserPanel.style.display = "none";
            browseButton.textContent = "Browse…";
            node.setDirtyCanvas?.(true, true);
        });


        backButton.addEventListener("click", () => {
            if (navigationHistory.length === 0) {
                return;
            }

            const previousPath =
                navigationHistory.pop();

            updateNavigationButtons();
            loadDirectory(previousPath);
        });

        upButton.addEventListener("click", () => {
            if (/^[A-Za-z]:\\?$/.test(currentPath)) {
                navigationHistory.length = 0;
                updateNavigationButtons();

                currentPath = "";
                loadDrives();
                return;
            }

            const parentPath = getParentPath(currentPath);

            if (parentPath === currentPath) {
                return;
            }

            navigationHistory.push(currentPath);
            updateNavigationButtons();

            loadDirectory(parentPath);
        });

        selectButton.addEventListener("click", () => {
            outputRoot.value = currentPath;
            refreshOutputLocationDisplay();
            if (node.setDirtyCanvas) {
                node.setDirtyCanvas(true, true);
            }

            browserPanel.style.display = "none";
            browseButton.textContent = "Browse…";
        });

        browseButton.addEventListener("click", () => {
            const isVisible =
                browserPanel.style.display !== "none";

            if (isVisible) {
                browserPanel.style.display = "none";
                browseButton.textContent = "Browse…";
                return;
            }

            currentPath = "";

            navigationHistory.length = 0;
            updateNavigationButtons();

            browserPanel.style.display = "block";
            browseButton.textContent = "Close Browse";


            if (currentPath === "") {
                loadDrives();
            } else {
                loadDirectory(currentPath);
            }
        });

        const browseWidget = node.addDOMWidget(
            "production_slate_browse",
            "custom",
            browseButton,
            {
                serialize: false,
                hideOnZoom: false,
            }
        );

        const browserPanelWidget = node.addDOMWidget(
            "production_slate_browser_panel",
            "custom",
            browserPanel,
            {
                serialize: false,
                hideOnZoom: false,
            }
        );

        // --------------------------------------------------------
        // ProductionSlate V4.4 execution monitor
        // Displays status, native generation progress and
        // elapsed run time.
        // --------------------------------------------------------

        const monitorPanel = document.createElement("div");

        monitorPanel.style.width = "100%";
        monitorPanel.style.minHeight = "72px";
        monitorPanel.style.boxSizing = "border-box";
        monitorPanel.style.padding = "16px 4px 16px 4px";
        monitorPanel.style.background = "transparent";
        monitorPanel.style.border = "none";
        monitorPanel.style.textAlign = "center";
        monitorPanel.style.color = "#eeeeee";

        const monitorStatus = document.createElement("div");

        monitorStatus.textContent = "READY";
        monitorStatus.style.fontSize = "28px";
        monitorStatus.style.fontWeight = "600";
        monitorStatus.style.lineHeight = "32px";

        const monitorProgress = document.createElement("div");

        monitorProgress.style.display = "none";
        monitorProgress.style.width = "90%";
        monitorProgress.style.height = "10px";
        monitorProgress.style.margin = "7px auto 5px auto";
        monitorProgress.style.background =
            "rgba(255, 255, 255, 0.16)";
        monitorProgress.style.borderRadius = "4px";
        monitorProgress.style.overflow = "hidden";

        const monitorProgressFill =
            document.createElement("div");

        monitorProgressFill.style.width = "0%";
        monitorProgressFill.style.height = "100%";
        monitorProgressFill.style.background =
            "rgba(255, 255, 255, 0.85)";
        monitorProgressFill.style.borderRadius = "4px";

        monitorProgress.appendChild(
            monitorProgressFill
        );

        const monitorProgressText =
            document.createElement("div");

        monitorProgressText.style.display = "none";
        monitorProgressText.style.fontSize = "16px";
        monitorProgressText.style.lineHeight = "22px";
        monitorProgressText.style.marginBottom = "5px";
        monitorProgressText.style.opacity = "0.9";

        const monitorTime = document.createElement("div");

        monitorTime.textContent = "00:00";
        monitorTime.style.fontSize = "24px";
        monitorTime.style.lineHeight = "28px";
        monitorTime.style.opacity = "0.85";

        monitorPanel.appendChild(monitorStatus);
        monitorPanel.appendChild(monitorProgress);
        monitorPanel.appendChild(monitorProgressText);
        monitorPanel.appendChild(monitorTime);

        const monitorWidget = node.addDOMWidget(
            "production_slate_monitor",
            "custom",
            monitorPanel,
            {
                serialize: false,
                hideOnZoom: false,
            }
        );

        monitorWidget.serialize = false;

        // --------------------------------------------------------
        // Centre ProductionSlate source badge
        // --------------------------------------------------------

        function centreProductionSlateSourceBadge() {
            const nodeElement = document.querySelector(
                `[data-node-id="${node.id}"]`
            );

            if (!nodeElement) {
                return false;
            }

            const badgeRow = Array.from(
                nodeElement.querySelectorAll("div")
            ).find(
                (element) =>
                    element.classList.contains("mt-auto") &&
                    element.classList.contains("w-full") &&
                    element.textContent
                        ?.trim()
                        .startsWith("ProductionSlate")
            );

            if (!badgeRow) {
                return false;
            }

            badgeRow.style.justifyContent = "center";

            return true;
        }

        setTimeout(() => {
            centreProductionSlateSourceBadge();
        }, 500);

// --------------------------------------------------------
// ProductionSlate V4.4 IMAGE-only preview
// Displays the temporary preview image and its native
// pixel resolution beneath the image.
// --------------------------------------------------------

        const imagePreviewPanel =
            document.createElement("div");

        imagePreviewPanel.style.display = "none";
        imagePreviewPanel.style.width = "100%";
        imagePreviewPanel.style.boxSizing = "border-box";
        imagePreviewPanel.style.padding = "4px 4px 8px 4px";

        const imagePreviewElement =
            document.createElement("img");

        imagePreviewElement.style.display = "block";
        imagePreviewElement.style.width = "100%";
        imagePreviewElement.style.height = "auto";
        imagePreviewElement.style.maxHeight = "320px";
        imagePreviewElement.style.objectFit = "contain";
        imagePreviewElement.style.borderRadius = "6px";

        const imagePreviewResolution =
            document.createElement("div");

        imagePreviewResolution.style.display = "none";
        imagePreviewResolution.style.marginTop = "6px";
        imagePreviewResolution.style.textAlign = "center";
        imagePreviewResolution.style.fontSize = "14px";
        imagePreviewResolution.style.lineHeight = "18px";
        imagePreviewResolution.style.opacity = "0.82";
        imagePreviewResolution.style.color = "#eeeeee";

        imagePreviewPanel.appendChild(
            imagePreviewElement
        );

        imagePreviewPanel.appendChild(
            imagePreviewResolution
        );

        const imagePreviewWidget =
            node.addDOMWidget(
                "production_slate_image_preview",
                "custom",
                imagePreviewPanel,
                {
                    serialize: false,
                    hideOnZoom: false,
                }
            );

        imagePreviewWidget.serialize = false;

        const refreshImagePreviewLayout = () => {
            requestAnimationFrame(() => {
                const computedSize = node.computeSize();

                node.setSize([
                    node.size[0],
                    computedSize[1]
                ]);

                node.setDirtyCanvas?.(true, true);
            });
        };

        const productionSlateImageExecutedHandler =
            (event) => {

                const detail = event.detail;

                if (!detail) return;

                if (
                    String(detail.node) !==
                    String(node.id)
                ) {
                    return;
                }

                const previewValues =
                    detail.output
                        ?.production_slate_image;

                const imageInfo =
                    Array.isArray(previewValues)
                        ? previewValues[0]
                        : null;

                if (!imageInfo?.filename) {
                    imagePreviewElement.removeAttribute(
                        "src"
                    );

                    imagePreviewResolution.textContent = "";
                    imagePreviewResolution.style.display =
                        "none";

                    imagePreviewPanel.style.display =
                        "none";

                    refreshImagePreviewLayout();
                    return;
                }

                const params =
                    new URLSearchParams({
                        filename:
                            imageInfo.filename,
                        subfolder:
                            imageInfo.subfolder ?? "",
                        type:
                            imageInfo.type ?? "temp",
                    });

                imagePreviewElement.onload = () => {
                    const width =
                        imagePreviewElement.naturalWidth || 0;

                    const height =
                        imagePreviewElement.naturalHeight || 0;

                    if (width > 0 && height > 0) {
                        imagePreviewResolution.textContent =
                            `${width} × ${height}`;

                        imagePreviewResolution.style.display =
                            "block";
                    } else {
                        imagePreviewResolution.textContent = "";
                        imagePreviewResolution.style.display =
                            "none";
                    }

                    refreshImagePreviewLayout();
                };

                imagePreviewElement.src =
                    api.apiURL(
                        `/view?${params.toString()}`
                    );

                imagePreviewPanel.style.display =
                    "block";
            };

        api.addEventListener(
            "executed",
            productionSlateImageExecutedHandler
        );

// --------------------------------------------------------
// ProductionSlate V4.4 monitor state and timer handling
// READY / PROCESSING / GENERATING / SAVING / COMPLETE
// with INTERRUPTED and ERROR terminal states.
// --------------------------------------------------------

        let monitorStartTime = null;
        let monitorTimer = null;

        function hideMonitorProgress() {
            monitorProgress.style.display = "none";
            monitorProgressText.style.display = "none";
            monitorProgressFill.style.width = "0%";
            monitorProgressText.textContent = "";
        }

        function showMonitorProgress(value, max) {
            const percent = Math.max(
                0,
                Math.min(
                    100,
                    Math.round((value / max) * 100)
                )
            );

            monitorProgress.style.display = "block";
            monitorProgressText.style.display = "block";

            monitorProgressFill.style.width =
                `${percent}%`;

            monitorProgressText.textContent =
                `${value} / ${max}   ${percent}%`;
        }

        function formatElapsed(milliseconds) {
            const totalSeconds =
                Math.floor(milliseconds / 1000);

            const hours =
                Math.floor(totalSeconds / 3600);

            const minutes =
                Math.floor((totalSeconds % 3600) / 60);

            const seconds =
                totalSeconds % 60;

            if (hours > 0) {
                return (
                    `${hours}:` +
                    `${String(minutes).padStart(2, "0")}:` +
                    `${String(seconds).padStart(2, "0")}`
                );
            }

            return (
                `${String(minutes).padStart(2, "0")}:` +
                `${String(seconds).padStart(2, "0")}`
            );
        }

        function updateMonitorTime() {
            if (monitorStartTime === null) {
                return;
            }

            monitorTime.textContent =
                formatElapsed(
                    performance.now() - monitorStartTime
                );
        }

        function startMonitorTimer() {
            if (monitorTimer !== null) {
                clearInterval(monitorTimer);
            }

            monitorStartTime = performance.now();

            hideMonitorProgress();
            monitorStatus.textContent = "PROCESSING";
            monitorTime.textContent = "00:00";

            monitorTimer = setInterval(
                updateMonitorTime,
                1000
            );
        }

        function stopMonitorTimer() {
            if (monitorStartTime !== null) {
                updateMonitorTime();
            }

            if (monitorTimer !== null) {
                clearInterval(monitorTimer);
                monitorTimer = null;
            }

            hideMonitorProgress();
            monitorStatus.textContent = "COMPLETE";
        }

        function stopMonitorWithState(state) {
            if (monitorStartTime !== null) {
                updateMonitorTime();
            }

            if (monitorTimer !== null) {
                clearInterval(monitorTimer);
                monitorTimer = null;
            }

            hideMonitorProgress();
            monitorStatus.textContent = state;
        }

        // --------------------------------------------------------
        // Native ComfyUI generation progress
        // --------------------------------------------------------

        const productionSlateProgressHandler = (event) => {
            const detail = event.detail;

            if (!detail) {
                return;
            }

            if (monitorStartTime === null) {
                return;
            }

            const value = Number(detail.value);
            const max = Number(detail.max);

            if (
                Number.isFinite(value) &&
                Number.isFinite(max) &&
                max > 0
            ) {
                monitorStatus.textContent = "GENERATING";
                showMonitorProgress(value, max);
            } else {
                monitorStatus.textContent = "GENERATING";
                hideMonitorProgress();
            }
        };

        api.addEventListener(
            "progress",
            productionSlateProgressHandler
        );

        // --------------------------------------------------------
        // Interrupted / error states
        // --------------------------------------------------------

        const productionSlateInterruptedHandler = () => {
            if (monitorStartTime === null) {
                return;
            }

            stopMonitorWithState("INTERRUPTED");
        };

        api.addEventListener(
            "execution_interrupted",
            productionSlateInterruptedHandler
        );

        const productionSlateErrorHandler = () => {
            if (monitorStartTime === null) {
                return;
            }

            stopMonitorWithState("ERROR");
        };

        api.addEventListener(
            "execution_error",
            productionSlateErrorHandler
        );

        // --------------------------------------------------------
        // ProductionSlate saving state
        // --------------------------------------------------------

        const productionSlateExecutingHandler = (event) => {
            if (monitorStartTime === null) {
                return;
            }

            const executingNodeId = event.detail;

            if (
                executingNodeId === null ||
                executingNodeId === undefined
            ) {
                return;
            }

            if (
                String(executingNodeId) !==
                String(node.id)
            ) {
                return;
            }

            hideMonitorProgress();
            monitorStatus.textContent = "SAVING";
        };

        api.addEventListener(
            "executing",
            productionSlateExecutingHandler
        );

        const originalMonitorOnExecutionStart =
            node.onExecutionStart;

        node.onExecutionStart = function() {
            if (originalMonitorOnExecutionStart) {
                originalMonitorOnExecutionStart.call(this);
            }

            startMonitorTimer();
        };

        const originalMonitorOnExecuted =
            node.onExecuted;

        node.onExecuted = function(output) {
            if (originalMonitorOnExecuted) {
                originalMonitorOnExecuted.call(
                    this,
                    output
                );
            }

            stopMonitorTimer();
        };

        const productionNameIndex =
            node.widgets.indexOf(productionName);

        if (productionNameIndex >= 0) {
            node.widgets = node.widgets.filter(
                (widget) =>
                    widget !== browseWidget &&
                    widget !== browserPanelWidget
            );

            node.widgets.splice(
                productionNameIndex + 1,
                0,
                browseWidget,
                browserPanelWidget
            );
        }

// --------------------------------------------------------
// Preview / workflow reload layout
//
// Preview content can alter the node height. ComfyUI may
// save that enlarged height with the workflow even though
// preview content itself is not restored on reload.
// Recalculate the node height after saved configuration
// has been applied.
// --------------------------------------------------------

        if (isImage || isVideo || isUnified) {
            const originalOnConfigure = node.onConfigure;

            node.onConfigure = function(info) {
                if (originalOnConfigure) {
                    originalOnConfigure.call(this, info);
                }

                requestAnimationFrame(() => {
                    const computedSize = this.computeSize();

                    this.setSize([
                        this.size[0],
                        computedSize[1]
                    ]);

                    this.setDirtyCanvas?.(true, true);
                });
            };
        }

        const nodeTypeLabel =
            isUnified ? "V4.4" : (isVideo ? "Video" : "Image");

        console.log(
            `[ProductionSlate] Browse panel attached to ${nodeTypeLabel}.`
        );
    },

    loadedGraphNode(node) {
        const isImage =
            node.comfyClass ===
            "ProductionSlateV4_Build004C_Image";

        const isVideo =
            node.comfyClass ===
            "ProductionSlateV4_Build004C_Video";

        const isUnified =
            node.comfyClass ===
            "ProductionSlateV4";

        if (!isImage && !isVideo && !isUnified) {
            return;
        }

        if (isImage) {
            node.title =
                "🎬 Production Slate V4 — IMAGE SAVER 004-C";
        }

        if (isVideo) {
            node.title =
                "🎬 Production Slate V4 — VIDEO SAVER 004-C";
        }

        if (isUnified) {
            node.title =
                "🎬 Production Slate V4.3";
        }

        node.color = "#352447";
        node.bgcolor = "#241A30";

        const outputRoot = node.widgets?.find(
            (widget) => widget.name === "output_root"
        );

        const productionName = node.widgets?.find(
            (widget) => widget.name === "production_name"
        );

        const productionCode = node.widgets?.find(
            (widget) => widget.name === "production_code"
        );

        const sceneWidget = node.widgets?.find(
            (widget) => widget.name === "scene"
        );

        const shotWidget = node.widgets?.find(
            (widget) => widget.name === "shot"
        );

        const suffixWidget = node.widgets?.find(
            (widget) => widget.name === "suffix"
        );

        const descriptionWidget = node.widgets?.find(
            (widget) => widget.name === "description"
        );

        const clearSlate = node.widgets?.find(
            (widget) => widget.name === "clear_slate"
        );

         if (outputRoot) {
            outputRoot.label = "Output Location";
        }

        if (productionName) {
            productionName.label = "Production / Folder";
        }

        if (productionCode) {
            productionCode.label = "Code";
        }

        if (sceneWidget) {
            sceneWidget.label = "Scene";
        }

        if (shotWidget) {
            shotWidget.label = "Shot";
        }

        if (suffixWidget) {
            suffixWidget.label = "Shot Variation";
        }

        if (descriptionWidget) {
            descriptionWidget.label = "Slate Notes";
        }

        if (clearSlate) {
            clearSlate.hidden = true;
            clearSlate.options = clearSlate.options || {};
            clearSlate.options.hidden = true;
        }

        const wasMigrated =
            productionSlateMigratedNodeIds.delete(
                String(node.id)
            );

        if (wasMigrated && isImage) {
            requestAnimationFrame(() => {
                const computedSize = node.computeSize();

                node.setSize([
                    node.size[0],
                    computedSize[1],
                ]);

                node.setDirtyCanvas?.(true, true);
            });
        } else {
            node.setDirtyCanvas?.(true, true);
        }

        const nodeTypeLabel =
            isUnified ? "V4.4" : (isVideo ? "Video" : "Image");

        console.log(
            `[ProductionSlate] Loaded ${nodeTypeLabel} workflow node refreshed.`
        );
    },
});