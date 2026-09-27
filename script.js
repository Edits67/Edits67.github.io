const state = {
  allGifs: [],
  filteredGifs: [],
  activeCategory: "All",
  query: "",
  selectedGif: null,
  toastTimer: null,
};

const els = {
  grid: document.getElementById("gifGrid"),
  empty: document.getElementById("emptyState"),
  resultCount: document.getElementById("resultCount"),
  categoryList: document.getElementById("categoryList"),
  searchInput: document.getElementById("searchInput"),
  clearSearch: document.getElementById("clearSearch"),
  footerStatus: document.getElementById("footerStatus"),

  viewer: document.getElementById("viewer"),
  viewerImage: document.getElementById("viewerImage"),
  viewerTitle: document.getElementById("viewerTitle"),
  viewerTags: document.getElementById("viewerTags"),
  closeViewer: document.getElementById("closeViewer"),
  copyGifButton: document.getElementById("copyGifButton"),
  openGifButton: document.getElementById("openGifButton"),

  dataPanel: document.getElementById("dataPanel"),
  openDataPanel: document.getElementById("openDataPanel"),
  closeDataPanel: document.getElementById("closeDataPanel"),
  jsonUrlInput: document.getElementById("jsonUrlInput"),
  loadUrlButton: document.getElementById("loadUrlButton"),
  jsonFileInput: document.getElementById("jsonFileInput"),
  jsonTextInput: document.getElementById("jsonTextInput"),
  loadTextButton: document.getElementById("loadTextButton"),
  dataMessage: document.getElementById("dataMessage"),

  toast: document.getElementById("toast"),
  toastText: document.getElementById("toastText"),
};



const DEFAULT_JSON_URL = "/gifs.json";

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  els.jsonUrlInput.value = DEFAULT_JSON_URL;
  await loadFromUrl(DEFAULT_JSON_URL);
});

function bindEvents() {
  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value.trim().toLowerCase();
    els.clearSearch.classList.toggle("show", Boolean(state.query));
    applyFilters();
  });

  els.clearSearch.addEventListener("click", () => {
    els.searchInput.value = "";
    els.searchInput.focus();
    state.query = "";
    els.clearSearch.classList.remove("show");
    applyFilters();
  });

  els.closeViewer.addEventListener("click", closeViewer);
  els.viewer.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-viewer]")) closeViewer();
  });

  els.openDataPanel.addEventListener("click", () => openModal(els.dataPanel));
  els.closeDataPanel.addEventListener("click", () => closeModal(els.dataPanel));
  els.dataPanel.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-data]")) closeModal(els.dataPanel);
  });

  els.loadUrlButton.addEventListener("click", loadFromUrl);
  els.loadTextButton.addEventListener("click", loadFromTextarea);

  els.jsonFileInput.addEventListener("change", async () => {
    const file = els.jsonFileInput.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const normalized = normalizeData(parsed);
      loadGifData(normalized, `LOADED — ${file.name}`);
      setDataMessage(`${normalized.length} GIFs loaded from ${file.name}`);
    } catch (error) {
      setDataMessage(`ERROR: ${error.message}`, true);
    }
  });

  els.copyGifButton.addEventListener("click", copySelectedGif);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeViewer();
      closeModal(els.dataPanel);
    }
  });
}

async function loadFromUrl(urlOverride = null) {
  const url = (urlOverride ?? els.jsonUrlInput.value).trim();
  if (!url) {
    setDataMessage("ERROR: enter a JSON URL.", true);
    return;
  }

  setDataMessage(`FETCHING ${url}...`);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const parsed = await response.json();
    const normalized = normalizeData(parsed);

    loadGifData(normalized, `LOADED — ${url}`);
    setDataMessage(`${normalized.length} GIFs loaded from ${url}.`);
  } catch (error) {
    setDataMessage(`ERROR: ${error.message}. Check the URL and CORS.`, true);
  }
}

function loadFromTextarea() {
  const raw = els.jsonTextInput.value.trim();

  if (!raw) {
    setDataMessage("ERROR: paste a JSON array first.", true);
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeData(parsed);

    loadGifData(normalized, "LOADED — PASTED JSON");
    setDataMessage(`${normalized.length} GIFs loaded from pasted JSON.`);
  } catch (error) {
    setDataMessage(`ERROR: ${error.message}`, true);
  }
}

function normalizeData(input) {
  let list = input;

  if (!Array.isArray(list) && Array.isArray(input?.gifs)) {
    list = input.gifs;
  }

  if (!Array.isArray(list)) {
    throw new Error("JSON must be an array or contain a 'gifs' array");
  }

  const normalized = list
    .map((item, index) => {
      const name = String(item?.name ?? item?.title ?? `GIF ${index + 1}`).trim();
      const url = String(item?.url ?? item?.gif ?? item?.src ?? "").trim();

      let tags = item?.tags ?? item?.tag ?? [];
      if (typeof tags === "string") tags = tags.split(",").map((x) => x.trim());
      if (!Array.isArray(tags)) tags = [];

      tags = tags
        .map((tag) => String(tag).trim().toLowerCase())
        .filter(Boolean);

      return {
        name,
        url,
        tags: [...new Set(tags)],
      };
    })
    .filter((item) => /^https?:\/\//i.test(item.url));

  if (!normalized.length) {
    throw new Error("No valid GIF URLs were found");
  }

  return normalized;
}

function loadGifData(gifs, statusText) {
  state.allGifs = gifs;
  state.activeCategory = "All";
  buildCategories();
  applyFilters();
  els.footerStatus.textContent = statusText;
  closeModal(els.dataPanel);
}

function buildCategories() {
  const categories = new Set(["All"]);

  for (const gif of state.allGifs) {
    for (const tag of gif.tags) categories.add(tag);
  }

  const categoryArray = [...categories];

  if (!categoryArray.includes(state.activeCategory)) {
    state.activeCategory = "All";
  }

  els.categoryList.innerHTML = categoryArray.map((category) => `
    <button
      class="category ${category === state.activeCategory ? "active" : ""}"
      type="button"
      data-category="${escapeHtmlAttribute(category)}"
    >
      ${escapeHtml(category)}
    </button>
  `).join("");

  els.categoryList.querySelectorAll(".category").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeCategory = button.dataset.category;
      buildCategories();
      applyFilters();
    });
  });
}

function applyFilters() {
  const activeCategory = state.activeCategory.toLowerCase();

  state.filteredGifs = state.allGifs.filter((gif) => {
    const matchesCategory =
      activeCategory === "all" || gif.tags.includes(activeCategory);

    if (!matchesCategory) return false;

    if (!state.query) return true;

    const haystack = `${gif.name} ${gif.tags.join(" ")}`.toLowerCase();
    return haystack.includes(state.query);
  });

  renderGifs();
}

function renderGifs() {
  const gifs = state.filteredGifs;

  els.grid.innerHTML = gifs.map((gif, index) => `
    <article class="gif-card">
      <button class="gif-button" type="button" data-index="${index}" aria-label="Open ${escapeHtmlAttribute(gif.name)}">
        <img
          class="gif-media"
          src="${escapeHtmlAttribute(gif.url)}"
          alt="${escapeHtmlAttribute(gif.name)}"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          onerror="this.closest('.gif-card')?.remove()"
        />
        <div class="gif-meta">
          <h2 class="gif-name">${escapeHtml(gif.name)}</h2>
          <div class="tag-row">
            ${gif.tags.slice(0, 3).map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join("")}
          </div>
        </div>
      </button>
    </article>
  `).join("");

  els.grid.querySelectorAll(".gif-button").forEach((button) => {
    button.addEventListener("click", () => openViewer(gifs[Number(button.dataset.index)]));
  });

  els.resultCount.textContent = `${gifs.length} ${gifs.length === 1 ? "GIF" : "GIFs"}`;
  els.empty.classList.toggle("hidden", gifs.length !== 0);
}

function openViewer(gif) {
  state.selectedGif = gif;

  els.viewerImage.src = gif.url;
  els.viewerImage.alt = gif.name;
  els.viewerTitle.textContent = gif.name;
  els.viewerTags.innerHTML = gif.tags
    .map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`)
    .join("");

  els.openGifButton.href = gif.url;

  openModal(els.viewer);
}

function closeViewer() {
  closeModal(els.viewer);
}

async function copySelectedGif() {
  if (!state.selectedGif?.url) return;

  const url = state.selectedGif.url;

  try {
    await navigator.clipboard.writeText(url);
    showToast("Copied Link for the GIF!");
  } catch {
    fallbackCopy(url);
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    document.execCommand("copy");
    showToast("Copied Link for the GIF!");
  } catch {
    showToast("Couldn't copy the link.");
  } finally {
    textarea.remove();
  }
}

function showToast(message) {
  els.toastText.textContent = message;
  els.toast.classList.add("show");

  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2200);
}

function openModal(modal) {
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal(modal) {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");

  const anyOpen = !els.viewer.classList.contains("hidden") || !els.dataPanel.classList.contains("hidden");
  if (!anyOpen) document.body.style.overflow = "";
}

function setDataMessage(message, isError = false) {
  els.dataMessage.textContent = message;
  els.dataMessage.style.color = isError ? "var(--danger)" : "var(--green)";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value);
}
