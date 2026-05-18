/** @type {fabric.Canvas | null} */
let canvas = null;
let currentModel = null;
let viewportScale = 1;
let maxFitScale = 1;
let zoomLevel = ZOOM_DEFAULT;
let resizeObserver = null;
let lastMobileViewport = null;
let onWindowResize = null;
let history = [];
let historyIndex = -1;
let isRestoringHistory = false;
let isLoadingDraft = false;
let toastTimeout = null;

const MAX_HISTORY = 50;

function draftStorageKey(modelId) {
  return `${STORAGE_DRAFT_PREFIX}${modelId}`;
}

function saveDraft(showFeedback = true) {
  if (!canvas || !currentModel) return false;

  const data = {
    version: 1,
    savedAt: Date.now(),
    zoomLevel,
    objects: canvas.getObjects().map((o) => o.toObject()),
  };

  try {
    sessionStorage.setItem(draftStorageKey(currentModel.id), JSON.stringify(data));
    sessionStorage.setItem(STORAGE_ACTIVE_MODEL, currentModel.id);
    if (showFeedback) {
      showEditorToast("Borrador guardado en esta sesión del navegador.");
    }
    return true;
  } catch {
    if (showFeedback) {
      showEditorToast("No se pudo guardar el borrador.", true);
    }
    return false;
  }
}

function loadDraft(modelId) {
  if (!canvas) return;

  const raw = sessionStorage.getItem(draftStorageKey(modelId));
  if (!raw) {
    saveHistory();
    return;
  }

  try {
    const data = JSON.parse(raw);
    if (!data.objects?.length) {
      saveHistory();
      return;
    }

    isLoadingDraft = true;
    fabric.util.enlivenObjects(data.objects, (objects) => {
      objects.forEach((obj) => canvas.add(obj));
      if (typeof data.zoomLevel === "number") {
        zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, data.zoomLevel));
      }
      canvas.renderAll();
      isLoadingDraft = false;
      saveHistory();
      fitCanvasToViewport();
    });
  } catch {
    isLoadingDraft = false;
    saveHistory();
  }
}

function showEditorToast(message, isError = false) {
  const toast = document.getElementById("editor-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.remove("hidden");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add("hidden"), 3200);
}

function markEditorSession(modelId) {
  sessionStorage.setItem(STORAGE_ACTIVE_MODEL, modelId);
}

function clearEditorSession() {
  sessionStorage.removeItem(STORAGE_ACTIVE_MODEL);
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 768px)").matches;
}

function getDefaultZoomLevel() {
  return isMobileViewport() ? ZOOM_MOBILE_DEFAULT : ZOOM_DEFAULT;
}

function initEditor(model) {
  currentModel = model;
  zoomLevel = getDefaultZoomLevel();
  disposeCanvas();

  const el = document.getElementById("gift-canvas");
  canvas = new fabric.Canvas(el, {
    width: model.width,
    height: model.height,
    selection: true,
    preserveObjectStacking: true,
    backgroundColor: "#ffffff",
    enableRetinaScaling: false,
    imageSmoothingEnabled: true,
  });

  const ctx = canvas.getContext();
  if (ctx && "imageSmoothingQuality" in ctx) {
    ctx.imageSmoothingQuality = "high";
  }

  canvas.on("selection:created", updatePropertiesPanel);
  canvas.on("selection:updated", updatePropertiesPanel);
  canvas.on("selection:cleared", updatePropertiesPanel);
  canvas.on("object:modified", () => {
    updatePropertiesPanel();
    onCanvasChange();
  });
  canvas.on("object:moving", updatePropertiesPanel);
  canvas.on("object:rotating", updatePropertiesPanel);
  canvas.on("object:added", onCanvasChange);
  canvas.on("object:removed", onCanvasChange);

  canvas.on("text:changed", onTextChanged);
  canvas.on("text:editing:entered", onTextEditingEntered);
  canvas.on("text:editing:exited", onTextEditingExited);

  patchCanvasPointer(canvas);

  document.addEventListener("keydown", onKeyDown);

  loadBackground(model.file, model.width, model.height);
  populateFontSelect();
  lastMobileViewport = isMobileViewport();
  onWindowResize = () => {
    const mobile = isMobileViewport();
    if (mobile !== lastMobileViewport) {
      lastMobileViewport = mobile;
      zoomLevel = getDefaultZoomLevel();
    }
    fitCanvasToViewport();
  };
  window.addEventListener("resize", onWindowResize);

  const area = document.querySelector(".canvas-area");
  if (area && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => fitCanvasToViewport());
    resizeObserver.observe(area);
  }
}

function disposeCanvas() {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (canvas) {
    document.removeEventListener("keydown", onKeyDown);
    if (onWindowResize) {
      window.removeEventListener("resize", onWindowResize);
      onWindowResize = null;
    }
    canvas.dispose();
    canvas = null;
  }
  const scaler = document.getElementById("canvas-scaler");
  if (scaler) {
    scaler.style.width = "";
    scaler.style.height = "";
  }
  history = [];
  historyIndex = -1;
}

function loadBackground(url, width, height) {
  fabric.Image.fromURL(url, (img) => {
    if (!canvas) return;

    if (!img) {
      showEditorToast("No se pudo cargar la imagen del modelo.", true);
      saveHistory();
      return;
    }

    img.set({
      left: 0,
      top: 0,
      originX: "left",
      originY: "top",
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      lockMovementX: true,
      lockMovementY: true,
    });

    const naturalW = img.width || img._originalElement?.naturalWidth || width;
    const naturalH = img.height || img._originalElement?.naturalHeight || height;

    if (naturalW !== width || naturalH !== height) {
      img.scaleToWidth(width);
      if (Math.abs(img.getScaledHeight() - height) > 1) {
        img.scaleToHeight(height);
      }
    }

    canvas.setBackgroundImage(img, () => {
      canvas.renderAll();
      loadDraft(currentModel.id);
      requestAnimationFrame(fitCanvasToViewport);
    });
  });
}

function patchCanvasPointer(c) {
  c._cssScale = 1;
  c.getPointer = function (e) {
    const scale = c._cssScale || 1;
    const rect = c.upperCanvasEl.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  };
}

function fitCanvasToViewport() {
  if (!canvas || !currentModel) return;

  const area = document.querySelector(".canvas-area");
  const toolbar = document.querySelector(".zoom-toolbar");
  if (!area) return;

  const padding = isMobileViewport() ? 8 : 48;
  const toolbarH = toolbar ? toolbar.offsetHeight + (isMobileViewport() ? 8 : 16) : 0;
  const maxW = area.clientWidth - padding;
  const maxH = area.clientHeight - toolbarH - padding;

  if (maxW <= 0 || maxH <= 0) return;

  const w = currentModel.width;
  const h = currentModel.height;

  maxFitScale = Math.min(maxW / w, maxH / h);
  applyCanvasScale();
}

function applyCanvasScale() {
  if (!canvas || !currentModel) return;

  const w = currentModel.width;
  const h = currentModel.height;

  viewportScale = maxFitScale * zoomLevel;
  canvas._cssScale = viewportScale;

  const displayW = Math.floor(w * viewportScale);
  const displayH = Math.floor(h * viewportScale);

  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  canvas.setZoom(1);
  canvas.setDimensions({ width: w, height: h });

  const scaler = document.getElementById("canvas-scaler");
  if (scaler) {
    scaler.style.width = `${displayW}px`;
    scaler.style.height = `${displayH}px`;
  }

  const container = canvas.wrapperEl || canvas.getElement()?.parentElement;
  if (container) {
    container.style.width = `${w}px`;
    container.style.height = `${h}px`;
    container.style.transform = `scale(${viewportScale})`;
    container.style.transformOrigin = "top left";
  }

  canvas.calcOffset();
  canvas.requestRenderAll();
  updateZoomUI();

  const active = canvas.getActiveObject();
  if (active?.isEditing) {
    active.initDimensions();
    active.setCoords();
  }
}

function setZoomLevel(level) {
  zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level));
  applyCanvasScale();
}

function zoomIn() {
  setZoomLevel(zoomLevel + ZOOM_STEP);
}

function zoomOut() {
  setZoomLevel(zoomLevel - ZOOM_STEP);
}

function zoomReset() {
  setZoomLevel(getDefaultZoomLevel());
}

function updateZoomUI() {
  const pct = Math.round(zoomLevel * 100);
  const slider = document.getElementById("zoom-slider");
  const label = document.getElementById("zoom-label");
  if (slider) slider.value = String(pct);
  if (label) label.textContent = `${pct}%`;
}

function createText(content, options = {}) {
  const defaults = {
    left: currentModel.width * 0.1,
    top: currentModel.height * 0.35,
    fontFamily: "Montserrat",
    fontSize: options.fontSize || 32,
    fill: DEFAULT_TEXT_COLOR,
    fontWeight: "normal",
    fontStyle: "normal",
    underline: false,
    linethrough: false,
    editable: true,
    originX: "left",
    originY: "top",
  };

  const text = new fabric.IText(content, {
    ...defaults,
    ...options,
    lockScalingFlip: true,
    splitByGrapheme: false,
  });
  canvas.add(text);
  canvas.setActiveObject(text);
  canvas.renderAll();
  return text;
}

function addText() {
  createText("Tu texto aquí", { fontSize: 36, fontWeight: "bold" });
}

function addNumber() {
  createText("€40.00", {
    fontSize: 48,
    fontWeight: "bold",
    left: currentModel.width * 0.55,
    top: currentModel.height * 0.72,
  });
}

function addSymbol(char) {
  createText(char, {
    fontSize: 40,
    fontFamily: "Arial",
    left: currentModel.width * 0.4,
    top: currentModel.height * 0.4,
  });
}

function getActiveText() {
  const obj = canvas?.getActiveObject();
  if (!obj) return null;
  if (obj.type === "i-text" || obj.type === "text" || obj.type === "textbox") {
    return obj;
  }
  if (obj.type === "activeSelection") {
    const items = obj.getObjects();
    return items.length === 1 && items[0].type === "i-text" ? items[0] : null;
  }
  return null;
}

function syncTextToPanel(text) {
  const field = document.getElementById("prop-text");
  if (!field || document.activeElement === field) return;
  field.value = text?.text || "";
}

function onTextChanged(e) {
  const text = e.target;
  text.initDimensions();
  text.setCoords();
  syncTextToPanel(text);
  canvas.requestRenderAll();
}

function onTextEditingEntered(e) {
  const text = e.target;
  text.initDimensions();
  canvas.requestRenderAll();
}

function onTextEditingExited(e) {
  const text = e.target;
  text.initDimensions();
  text.setCoords();
  syncTextToPanel(text);
  onCanvasChange();
}

function updatePropertiesPanel() {
  const noSel = document.getElementById("no-selection");
  const props = document.getElementById("props-content");
  const panel = document.getElementById("properties-panel");
  const text = getActiveText();

  if (!text) {
    noSel.classList.remove("hidden");
    props.classList.add("hidden");
    panel?.classList.remove("mobile-open");
    return;
  }

  noSel.classList.add("hidden");
  props.classList.remove("hidden");
  if (isMobileViewport()) {
    panel?.classList.add("mobile-open");
  }

  syncTextToPanel(text);
  document.getElementById("prop-font").value = text.fontFamily || "Montserrat";
  document.getElementById("prop-size").value = Math.round(text.fontSize || 32);
  document.getElementById("prop-color").value = rgbToHex(text.fill) || DEFAULT_TEXT_COLOR;
  document.getElementById("prop-opacity").value = Math.round((text.opacity ?? 1) * 100);
  document.getElementById("prop-angle").value = Math.round(text.angle || 0);

  setStyleButtonActive("btn-bold", text.fontWeight === "bold");
  setStyleButtonActive("btn-italic", text.fontStyle === "italic");
  setStyleButtonActive("btn-underline", !!text.underline);
  setStyleButtonActive("btn-linethrough", !!text.linethrough);
}

function setStyleButtonActive(id, active) {
  document.getElementById(id)?.classList.toggle("active", active);
}

function rgbToHex(color) {
  if (!color || typeof color !== "string") return DEFAULT_TEXT_COLOR;
  if (color.startsWith("#")) return color.length === 7 ? color : DEFAULT_TEXT_COLOR;
  const m = color.match(/\d+/g);
  if (!m || m.length < 3) return DEFAULT_TEXT_COLOR;
  return (
    "#" +
    m.slice(0, 3)
      .map((n) => parseInt(n, 10).toString(16).padStart(2, "0"))
      .join("")
  );
}

function applyToActive(prop, value) {
  const text = getActiveText();
  if (!text) return;

  if (prop === "text") {
    setTextContent(text, value);
    return;
  }

  if (text.isEditing) {
    text.exitEditing();
  }

  text.set(prop, value);
  if (prop === "fontFamily" || prop === "fontSize" || prop === "fontWeight" || prop === "fontStyle") {
    text.initDimensions();
  }
  text.set("dirty", true);
  text.setCoords();
  canvas.renderAll();
  onCanvasChange();
}

function setTextContent(text, value) {
  if (text.isEditing) {
    text.exitEditing();
  }
  text.set("text", value);
  text.initDimensions();
  text.setCoords();
  canvas.renderAll();
  onCanvasChange();
}

function toggleStyle(prop, activeValue, inactiveValue) {
  const text = getActiveText();
  if (!text) return;
  const current = text[prop];
  const next = current === activeValue ? inactiveValue : activeValue;
  applyToActive(prop, next);
  updatePropertiesPanel();
}

function alignObject(direction) {
  const obj = canvas?.getActiveObject();
  if (!obj || !currentModel) return;

  const bound = obj.getBoundingRect(true, true);
  const w = currentModel.width;
  const h = currentModel.height;

  let left = obj.left;
  let top = obj.top;

  switch (direction) {
    case "left":
      left = obj.left - bound.left;
      break;
    case "right":
      left = obj.left + (w - bound.left - bound.width);
      break;
    case "center-h":
      left = obj.left + (w / 2 - bound.left - bound.width / 2);
      break;
    case "top":
      top = obj.top - bound.top;
      break;
    case "bottom":
      top = obj.top + (h - bound.top - bound.height);
      break;
    case "center-v":
      top = obj.top + (h / 2 - bound.top - bound.height / 2);
      break;
  }

  obj.set({ left, top });
  obj.setCoords();
  canvas.renderAll();
  onCanvasChange();
}

function duplicateSelected() {
  const obj = canvas?.getActiveObject();
  if (!obj) return;

  obj.clone((cloned) => {
    cloned.set({
      left: (obj.left || 0) + 20,
      top: (obj.top || 0) + 20,
    });
    canvas.add(cloned);
    canvas.setActiveObject(cloned);
    canvas.renderAll();
  });
}

function deleteSelected() {
  const obj = canvas?.getActiveObject();
  if (!obj) return;
  if (obj.type === "activeSelection") {
    obj.getObjects().forEach((o) => canvas.remove(o));
  } else {
    canvas.remove(obj);
  }
  canvas.discardActiveObject();
  canvas.renderAll();
}

function exportImage() {
  if (!canvas || !currentModel) return;

  const w = currentModel.width;
  const h = currentModel.height;
  const btn = document.getElementById("btn-export");

  canvas.discardActiveObject();
  if (btn) btn.disabled = true;

  const objectsData = canvas.getObjects().map((o) => o.toObject());

  const exportCanvas = new fabric.StaticCanvas(null, {
    width: w,
    height: h,
    enableRetinaScaling: false,
  });

  const ctx = exportCanvas.getContext();
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in ctx) {
      ctx.imageSmoothingQuality = "high";
    }
  }

  fabric.Image.fromURL(currentModel.file, (bgImg) => {
    if (!bgImg) {
      showEditorToast("No se pudo cargar la imagen para exportar.", true);
      if (btn) btn.disabled = false;
      exportCanvas.dispose();
      return;
    }

    bgImg.set({
      left: 0,
      top: 0,
      originX: "left",
      originY: "top",
    });

    if (bgImg.width !== w || bgImg.height !== h) {
      bgImg.scaleToWidth(w);
      if (Math.abs(bgImg.getScaledHeight() - h) > 1) {
        bgImg.scaleToHeight(h);
      }
    }

    exportCanvas.setBackgroundImage(bgImg, () => {
        const finishExport = () => {
          exportCanvas.renderAll();

          const dataUrl = exportCanvas.toDataURL({
            format: EXPORT_FORMAT,
            quality: EXPORT_QUALITY,
            multiplier: 1,
            enableRetinaScaling: false,
          });

          exportCanvas.dispose();

          const link = document.createElement("a");
          link.download = `giftcard-${currentModel.id}-${w}x${h}.png`;
          link.href = dataUrl;
          link.click();

          if (btn) btn.disabled = false;
        };

        if (!objectsData.length) {
          finishExport();
          return;
        }

        fabric.util.enlivenObjects(objectsData, (objects) => {
          objects.forEach((obj) => exportCanvas.add(obj));
          finishExport();
        });
      });
  });
}

function saveHistory() {
  if (!canvas || isRestoringHistory) return;

  const json = JSON.stringify(
    canvas.getObjects().map((o) => o.toObject())
  );

  if (historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1);
  }

  if (history.length && history[history.length - 1] === json) return;

  history.push(json);
  if (history.length > MAX_HISTORY) history.shift();
  historyIndex = history.length - 1;
}

function restoreHistory(index) {
  if (!canvas || index < 0 || index >= history.length) return;

  isRestoringHistory = true;
  const objectsData = JSON.parse(history[index]);

  canvas.discardActiveObject();
  canvas.remove(...canvas.getObjects());

  fabric.util.enlivenObjects(objectsData, (objects) => {
    objects.forEach((obj) => canvas.add(obj));
    canvas.renderAll();
    isRestoringHistory = false;
    updatePropertiesPanel();
  });
  historyIndex = index;
}

function undo() {
  if (historyIndex > 0) restoreHistory(historyIndex - 1);
}

function redo() {
  if (historyIndex < history.length - 1) restoreHistory(historyIndex + 1);
}

let changeTimeout;
function onCanvasChange() {
  if (isRestoringHistory || isLoadingDraft) return;
  clearTimeout(changeTimeout);
  changeTimeout = setTimeout(() => {
    saveHistory();
    saveDraft(false);
  }, 400);
}

function onKeyDown(e) {
  if (!canvas) return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

  if ((e.key === "Delete" || e.key === "Backspace") && !canvas.getActiveObject()?.isEditing) {
    e.preventDefault();
    deleteSelected();
  }
  if (e.key === "d" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    duplicateSelected();
  }
  if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    saveDraft(true);
  }
  if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
    e.preventDefault();
    undo();
  }
  if ((e.key === "y" && (e.ctrlKey || e.metaKey)) || (e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
    e.preventDefault();
    redo();
  }
}

function populateFontSelect() {
  const select = document.getElementById("prop-font");
  select.innerHTML = FONTS.map((f) => `<option value="${f}">${f}</option>`).join("");
}

function bindEditorControls() {
  document.getElementById("btn-add-text")?.addEventListener("click", addText);
  document.getElementById("btn-add-number")?.addEventListener("click", addNumber);
  document.getElementById("btn-save-draft")?.addEventListener("click", () => saveDraft(true));
  document.getElementById("btn-export")?.addEventListener("click", exportImage);
  document.getElementById("btn-undo")?.addEventListener("click", undo);
  document.getElementById("btn-redo")?.addEventListener("click", redo);
  document.getElementById("btn-duplicate")?.addEventListener("click", duplicateSelected);
  document.getElementById("btn-delete")?.addEventListener("click", deleteSelected);

  document.getElementById("btn-forward")?.addEventListener("click", () => {
    const o = canvas?.getActiveObject();
    if (o) { canvas.bringForward(o); canvas.renderAll(); onCanvasChange(); }
  });
  document.getElementById("btn-backward")?.addEventListener("click", () => {
    const o = canvas?.getActiveObject();
    if (o) { canvas.sendBackwards(o); canvas.renderAll(); onCanvasChange(); }
  });
  document.getElementById("btn-front")?.addEventListener("click", () => {
    const o = canvas?.getActiveObject();
    if (o) { canvas.bringToFront(o); canvas.renderAll(); onCanvasChange(); }
  });
  document.getElementById("btn-send-back")?.addEventListener("click", () => {
    const o = canvas?.getActiveObject();
    if (o) { canvas.sendToBack(o); canvas.renderAll(); onCanvasChange(); }
  });

  document.getElementById("prop-text")?.addEventListener("input", (e) => {
    const text = getActiveText();
    if (!text || text.isEditing) return;
    setTextContent(text, e.target.value);
  });
  document.getElementById("prop-font")?.addEventListener("change", (e) => {
    applyToActive("fontFamily", e.target.value);
  });
  document.getElementById("prop-size")?.addEventListener("input", (e) => {
    applyToActive("fontSize", parseInt(e.target.value, 10) || 32);
  });
  document.getElementById("prop-color")?.addEventListener("input", (e) => {
    applyToActive("fill", e.target.value);
  });
  document.getElementById("prop-opacity")?.addEventListener("input", (e) => {
    applyToActive("opacity", parseInt(e.target.value, 10) / 100);
  });
  document.getElementById("prop-angle")?.addEventListener("input", (e) => {
    applyToActive("angle", parseInt(e.target.value, 10));
  });

  document.getElementById("btn-bold")?.addEventListener("click", () => toggleStyle("fontWeight", "bold", "normal"));
  document.getElementById("btn-italic")?.addEventListener("click", () => toggleStyle("fontStyle", "italic", "normal"));
  document.getElementById("btn-underline")?.addEventListener("click", () => toggleStyle("underline", true, false));
  document.getElementById("btn-linethrough")?.addEventListener("click", () => toggleStyle("linethrough", true, false));

  document.querySelectorAll(".align-btn").forEach((btn) => {
    btn.addEventListener("click", () => alignObject(btn.dataset.align));
  });

  document.getElementById("btn-zoom-in")?.addEventListener("click", zoomIn);
  document.getElementById("btn-zoom-out")?.addEventListener("click", zoomOut);
  document.getElementById("btn-zoom-reset")?.addEventListener("click", zoomReset);
  document.getElementById("zoom-slider")?.addEventListener("input", (e) => {
    setZoomLevel(parseInt(e.target.value, 10) / 100);
  });

  const viewport = document.getElementById("canvas-viewport");
  viewport?.addEventListener(
    "wheel",
    (e) => {
      if (!canvas || !e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    },
    { passive: false }
  );
}

function populateSymbolGrids() {
  const emojiGrid = document.getElementById("emoji-grid");
  const symbolsGrid = document.getElementById("symbols-grid");

  EMOJIS.forEach((ch) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "symbol-btn";
    btn.textContent = ch;
    btn.title = ch;
    btn.addEventListener("click", () => addSymbol(ch));
    emojiGrid.appendChild(btn);
  });

  SYMBOLS.forEach((ch) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "symbol-btn";
    btn.textContent = ch;
    btn.title = ch;
    btn.addEventListener("click", () => addSymbol(ch));
    symbolsGrid.appendChild(btn);
  });

  document.querySelectorAll(".symbol-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".symbol-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const isEmoji = tab.dataset.tab === "emoji";
      document.getElementById("emoji-grid").classList.toggle("hidden", !isEmoji);
      document.getElementById("symbols-grid").classList.toggle("hidden", isEmoji);
    });
  });
}
