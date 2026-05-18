let activeRouteModelId = null;

function editorHash(modelId) {
  return `#/editor/${modelId}`;
}

function parseRoute() {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const match = path.match(/^\/editor\/([^/]+)\/?$/);
  if (match) return { view: "editor", modelId: decodeURIComponent(match[1]) };
  return { view: "gallery" };
}

function showGalleryView() {
  document.getElementById("gallery-view").classList.remove("hidden");
  document.getElementById("editor-view").classList.add("hidden");
  disposeCanvas();
  activeRouteModelId = null;
}

function showEditorView(model) {
  document.getElementById("gallery-view").classList.add("hidden");
  document.getElementById("editor-view").classList.remove("hidden");
  document.getElementById("model-label").textContent = model.name;
  markEditorSession(model.id);
  activeRouteModelId = model.id;

  requestAnimationFrame(() => {
    initEditor(model);
    requestAnimationFrame(() => {
      fitCanvasToViewport();
      setTimeout(fitCanvasToViewport, 100);
    });
  });
}

function showGallery() {
  clearEditorSession();
  const target = "#/";
  if (window.location.hash !== target && window.location.hash !== "") {
    window.location.hash = target;
  } else {
    showGalleryView();
  }
}

function showEditor(model) {
  const target = editorHash(model.id);
  if (window.location.hash !== target) {
    window.location.hash = target;
  } else if (activeRouteModelId !== model.id || !canvas) {
    showEditorView(model);
  }
}

function applyRoute() {
  const route = parseRoute();

  if (route.view === "editor") {
    const model = MODELS.find((m) => m.id === route.modelId);
    if (!model) {
      showGalleryView();
      if (window.location.hash) window.location.hash = "#/";
      return;
    }
    if (activeRouteModelId === model.id && canvas) return;
    showEditorView(model);
    return;
  }

  const fallbackId = sessionStorage.getItem(STORAGE_ACTIVE_MODEL);
  if (fallbackId) {
    const model = MODELS.find((m) => m.id === fallbackId);
    if (model) {
      window.location.replace(`${window.location.pathname}${window.location.search}${editorHash(model.id)}`);
      return;
    }
  }

  showGalleryView();
}

function initRouter() {
  const params = new URLSearchParams(window.location.search);
  const legacyModel = params.get("modelo");

  if (legacyModel && !window.location.hash) {
    const cleanUrl = `${window.location.pathname}${editorHash(legacyModel)}`;
    window.location.replace(cleanUrl);
    return;
  }

  applyRoute();
}

function buildGallery() {
  const grid = document.getElementById("gallery-grid");

  MODELS.forEach((model) => {
    const card = document.createElement("article");
    card.className = "model-card";
    card.innerHTML = `
      <img src="${model.file}" alt="${model.name}" loading="lazy" />
      <div class="model-card-info">
        <h2>${model.name}</h2>
        <span>Editar →</span>
      </div>
    `;
    card.addEventListener("click", () => showEditor(model));
    grid.appendChild(card);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  buildGallery();
  populateSymbolGrids();
  bindEditorControls();

  document.getElementById("btn-back-gallery")?.addEventListener("click", showGallery);
  window.addEventListener("hashchange", applyRoute);

  initRouter();
});
