interface FileRecord {
  path: string;
  page: number;
}

interface PidefAPI {
  openFileDialog: () => Promise<void>;
  toggleFullscreen: () => Promise<void>;
  getFullscreen: () => Promise<boolean>;
  setBrightness: (level: number) => Promise<void>;
  getRecentFiles: () => Promise<FileRecord[]>;
  addRecentFile: (path: string, page?: number) => Promise<void>;
  updateFilePage: (path: string, page: number) => Promise<void>;
  onOpenFile: (cb: (path: string) => void) => void;
  onToggleFullscreen: (cb: () => void) => void;
}

const pidef: PidefAPI = (window as any).pidef;

// pdf.js loaded via dynamic import (commonjs module)
let pdfjsLib: typeof import("pdfjs-dist");

// ── Tunables ─────────────────────────────────────────────────────────────────

const ANIM_MS = 220;
const SNAP_MS = 150;
const THRESHOLD_PX = 40;
const SLIDE_PX = 40;
const PRERENDER_FWD = 2;

const BRIGHTNESS_ZONE_PX = 60;
const BRIGHTNESS_MIN = 0.1;
const BRIGHTNESS_MAX = 1.0;
const BRIGHTNESS_PX_PER_UNIT = 200;

// ── State ────────────────────────────────────────────────────────────────────

type State = "idle" | "dragging" | "snap" | "animating";

let pdfDoc: import("pdfjs-dist").PDFDocumentProxy | null = null;
let currentPage = 0;
let nPages = 0;
let currentFilePath = "";

// Surface cache: page index -> ImageBitmap or OffscreenCanvas snapshot
const surfCache = new Map<number, ImageBitmap>();
let cacheWidth = 0;
let cacheHeight = 0;
const rendering = new Set<number>();

// Animation state
let state: State = "idle";
let currentSurf: ImageBitmap | null = null;
let animFromSurf: ImageBitmap | null = null;
let animDir = 1;
let animT = 1.0;
let animStartTime: number | null = null;
let animMs = ANIM_MS;

// Drag state
let dragX = 0;
let dragAdjDir = 0;
let snapFromX = 0;
let dragCommitted = false;

// Brightness state
let inBrightnessDrag = false;
let brightness = 1.0;
let pointerStartY = 0;
let brightnessAtDragStart = 1.0;
let brightnessHideTimer: ReturnType<typeof setTimeout> | null = null;

// RAF handle
let rafId: number | null = null;

// ── DOM ──────────────────────────────────────────────────────────────────────

const canvas = document.getElementById("pdf-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const welcomeScreen = document.getElementById("welcome-screen")!;
const recentFilesList = document.getElementById("recent-files-list")!;
const pageLabel = document.getElementById("page-label")!;
const navLabel = document.getElementById("nav-label")!;

document.getElementById("btn-open")!.addEventListener("click", () => {
  pidef.openFileDialog();
});

document.getElementById("btn-close")!.addEventListener("click", () => {
  closePdf();
});

document.getElementById("btn-fullscreen")!.addEventListener("click", () => {
  pidef.toggleFullscreen();
});

document.getElementById("btn-first")!.addEventListener("click", () => {
  goFirst();
});

document.getElementById("btn-prev")!.addEventListener("click", () => {
  goPrev();
});

document.getElementById("btn-next")!.addEventListener("click", () => {
  goNext();
});

document.getElementById("btn-last")!.addEventListener("click", () => {
  goLast();
});

const pageSlider = document.getElementById("page-slider") as HTMLInputElement;
let sliderThrottleTime = 0;
const SLIDER_THROTTLE_MS = 1000;

pageSlider.addEventListener("input", (e) => {
  if (!pdfDoc) return;
  const now = Date.now();
  if (now - sliderThrottleTime < SLIDER_THROTTLE_MS) return;

  sliderThrottleTime = now;
  const pageIdx = parseInt((e.target as HTMLInputElement).value, 10);
  if (pageIdx === currentPage) return;

  // Jump directly to the page without stacking animations
  cancelAll();
  currentPage = pageIdx;
  renderPageCached(currentPage).then((bmp) => {
    currentSurf = bmp;
    draw();
    bgScan();
    // Update labels only, not slider (to avoid janky reset)
    pageLabel.textContent = `Page ${currentPage + 1} / ${nPages}`;
    navLabel.textContent = `Page ${currentPage + 1} / ${nPages}`;
    if (currentFilePath && pdfDoc) {
      pidef.updateFilePage(currentFilePath, currentPage);
    }
  });
});

// ── Easing ───────────────────────────────────────────────────────────────────

function easeOut(t: number): number {
  return 1.0 - (1.0 - t) ** 2;
}

// ── PDF rendering ────────────────────────────────────────────────────────────

async function renderPage(
  pageIdx: number,
  width: number,
  height: number
): Promise<ImageBitmap> {
  const page = await pdfDoc!.getPage(pageIdx + 1); // pdf.js is 1-indexed
  const viewport = page.getViewport({ scale: 1 });

  const pad = 0;
  const scale = Math.min(
    (width - pad * 2) / viewport.width,
    (height - pad * 2) / viewport.height
  );
  const sw = viewport.width * scale;
  const sh = viewport.height * scale;
  const cx = (width - sw) / 2;
  const cy = (height - sh) / 2;

  const offscreen = new OffscreenCanvas(width, height);
  const oc = offscreen.getContext("2d")!;

  // Dark background
  oc.fillStyle = "#212121";
  oc.fillRect(0, 0, width, height);

  // Drop shadow
  oc.fillStyle = "rgba(0, 0, 0, 0.35)";
  oc.fillRect(cx + 4, cy + 4, sw, sh);

  // White page background
  oc.fillStyle = "#ffffff";
  oc.fillRect(cx, cy, sw, sh);

  // Render PDF page into a temporary canvas at native size, then draw scaled
  const renderCanvas = new OffscreenCanvas(
    Math.ceil(viewport.width * scale),
    Math.ceil(viewport.height * scale)
  );
  const renderCtx = renderCanvas.getContext("2d")!;

  await page.render({
    canvasContext: renderCtx as any,
    viewport: page.getViewport({ scale }),
  }).promise;

  oc.drawImage(renderCanvas, cx, cy);

  return createImageBitmap(offscreen);
}

async function renderPageCached(pageIdx: number): Promise<ImageBitmap | null> {
  if (!pdfDoc || pageIdx < 0 || pageIdx >= nPages) return null;
  if (cacheWidth === 0 || cacheHeight === 0) return null;

  const cached = surfCache.get(pageIdx);
  if (cached) return cached;

  console.log(`[pidef] sync-render page ${pageIdx + 1}`);
  const bmp = await renderPage(pageIdx, cacheWidth, cacheHeight);
  surfCache.set(pageIdx, bmp);
  return bmp;
}

function prerenderAsync(...indices: number[]) {
  if (!pdfDoc || cacheWidth === 0 || cacheHeight === 0) return;
  for (const idx of indices) {
    if (idx < 0 || idx >= nPages) continue;
    if (surfCache.has(idx) || rendering.has(idx)) continue;
    rendering.add(idx);
    const w = cacheWidth;
    const h = cacheHeight;
    renderPage(idx, w, h).then((bmp) => {
      rendering.delete(idx);
      if (cacheWidth === w && cacheHeight === h) {
        surfCache.set(idx, bmp);
        console.log(`[pidef] cached page ${idx + 1}`);
      }
    });
  }
}

function bgScan() {
  if (!pdfDoc) return;
  const fwd = [];
  for (let i = 1; i <= PRERENDER_FWD; i++) fwd.push(currentPage + i);
  fwd.push(currentPage - 1);
  prerenderAsync(...fwd);
}

// ── Canvas sizing ────────────────────────────────────────────────────────────

function resizeCanvas() {
  const container = canvas.parentElement!;
  const w = container.clientWidth;
  const h = container.clientHeight;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (cacheWidth !== w || cacheHeight !== h) {
    cacheWidth = w;
    cacheHeight = h;
    surfCache.clear();
    rendering.clear();
    currentSurf = null;
    animFromSurf = null;

    if (pdfDoc) {
      renderPage(currentPage, w, h).then((bmp) => {
        surfCache.set(currentPage, bmp);
        currentSurf = bmp;
        bgScan();
        draw();
      });
    }
  }
  draw();
}

const resizeObserver = new ResizeObserver(() => resizeCanvas());
resizeObserver.observe(canvas.parentElement!);

// ── Brightness control ───────────────────────────────────────────────────────

function applyBrightness() {
  console.log(`[brightness] Setting brightness to ${brightness.toFixed(3)}`);
  pidef.setBrightness(brightness).catch(err => {
    console.error(`[brightness] Failed to set brightness: ${err.message}`);
  });
}

function updateBrightnessHud(visible: boolean) {
  const hud = document.getElementById("brightness-hud")!;
  const fill = document.getElementById("brightness-fill")!;
  // Map brightness [BRIGHTNESS_MIN..BRIGHTNESS_MAX] to [0..100]%
  const pct = ((brightness - BRIGHTNESS_MIN) / (BRIGHTNESS_MAX - BRIGHTNESS_MIN)) * 100;
  fill.style.height = `${pct.toFixed(1)}%`;
  if (visible) {
    hud.classList.add("visible");
  } else {
    hud.classList.remove("visible");
  }
}

function scheduleBrightnessHide() {
  if (brightnessHideTimer) clearTimeout(brightnessHideTimer);
  brightnessHideTimer = setTimeout(() => updateBrightnessHud(false), 1500);
}

// ── Drawing ──────────────────────────────────────────────────────────────────

function draw() {
  const w = cacheWidth;
  const h = cacheHeight;

  ctx.fillStyle = "#212121";
  ctx.fillRect(0, 0, w, h);

  if (!pdfDoc) {
    // Empty message is shown via DOM
    return;
  }

  if (!currentSurf) return;

  // ── DRAGGING / SNAP ──────────────────────────────────────────────────
  if (state === "dragging" || state === "snap") {
    ctx.drawImage(currentSurf, dragX, 0, w, h);
    if (dragAdjDir !== 0) {
      const adjSurf = surfCache.get(currentPage + dragAdjDir);
      if (adjSurf) {
        ctx.drawImage(adjSurf, dragAdjDir * w + dragX, 0, w, h);
      }
    }
    return;
  }

  // ── ANIMATING ────────────────────────────────────────────────────────
  if (state === "animating" && animT < 1.0) {
    const ease = easeOut(animT);
    if (animFromSurf) {
      ctx.globalAlpha = 1.0 - ease;
      ctx.drawImage(animFromSurf, 0, 0, w, h);
    }
    const inX = animDir * SLIDE_PX * (1.0 - ease);
    ctx.globalAlpha = ease;
    ctx.drawImage(currentSurf, inX, 0, w, h);
    ctx.globalAlpha = 1.0;
    return;
  }

  // ── IDLE ─────────────────────────────────────────────────────────────
  ctx.drawImage(currentSurf, 0, 0, w, h);
}

// ── Animation loop ───────────────────────────────────────────────────────────

function startTick() {
  animT = 0.0;
  animStartTime = null;
  if (rafId === null) {
    rafId = requestAnimationFrame(onTick);
  }
}

function cancelAll() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  animT = 1.0;
  animStartTime = null;
  state = "idle";
  dragX = 0;
  dragAdjDir = 0;
  animFromSurf = null;
}

function onTick(timestamp: number) {
  if (animStartTime === null) animStartTime = timestamp;
  const elapsed = timestamp - animStartTime;
  const t = Math.min(1.0, elapsed / animMs);
  animT = t;

  if (state === "snap") {
    dragX = snapFromX * (1.0 - easeOut(t));
  }

  draw();

  if (t >= 1.0) {
    rafId = null;
    if (state === "snap") {
      dragX = 0;
      dragAdjDir = 0;
    } else if (state === "animating") {
      animFromSurf = null;
    }
    animT = 1.0;
    state = "idle";
    return;
  }

  rafId = requestAnimationFrame(onTick);
}

// ── Navigation ───────────────────────────────────────────────────────────────

async function beginPageChange(direction: number, adjSurf?: ImageBitmap | null) {
  cancelAll();
  animFromSurf = currentSurf;
  currentPage += direction;
  currentSurf = adjSurf ?? (await renderPageCached(currentPage));
  animDir = direction;
  animMs = ANIM_MS;
  state = "animating";
  startTick();
  bgScan();
  updateUI();
  if (currentFilePath && pdfDoc) {
    pidef.updateFilePage(currentFilePath, currentPage);
  }
}

function goNext() {
  if (!pdfDoc || currentPage >= nPages - 1) return;
  beginPageChange(1);
}

function goPrev() {
  if (!pdfDoc || currentPage <= 0) return;
  beginPageChange(-1);
}

function goFirst() {
  if (!pdfDoc || currentPage === 0) return;
  goToPage(0);
}

function goLast() {
  if (!pdfDoc || currentPage === nPages - 1) return;
  goToPage(nPages - 1);
}

async function goToPage(pageIdx: number) {
  if (!pdfDoc || pageIdx < 0 || pageIdx >= nPages || pageIdx === currentPage) return;
  const direction = pageIdx > currentPage ? 1 : -1;
  cancelAll();
  animFromSurf = currentSurf;
  currentPage = pageIdx;
  currentSurf = await renderPageCached(currentPage);
  animDir = direction;
  animMs = ANIM_MS;
  state = "animating";
  startTick();
  bgScan();
  updateUI();
  if (currentFilePath && pdfDoc) {
    pidef.updateFilePage(currentFilePath, currentPage);
  }
}

function closePdf() {
  cancelAll();
  pdfDoc = null;
  currentFilePath = "";
  currentPage = 0;
  nPages = 0;
  currentSurf = null;
  animFromSurf = null;
  surfCache.clear();
  rendering.clear();
  updateUI();
  draw();
}

function updateUI() {
  if (pdfDoc) {
    const text = `Page ${currentPage + 1} / ${nPages}`;
    pageLabel.textContent = text;
    navLabel.textContent = text;
    pageSlider.max = String(nPages - 1);
    pageSlider.value = String(currentPage);
    welcomeScreen.style.display = "none";
    document.title = `pidef`;
  } else {
    pageLabel.textContent = "";
    navLabel.textContent = "";
    pageSlider.max = "1";
    pageSlider.value = "0";
    welcomeScreen.style.display = "";
  }
}

// ── File loading ─────────────────────────────────────────────────────────────

async function loadFile(filePath: string) {
  console.log(`[pidef] load: ${filePath}`);

  if (!pdfjsLib) {
    pdfjsLib = require("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve(
      "pdfjs-dist/build/pdf.worker.js"
    );
  }

  surfCache.clear();
  rendering.clear();
  currentSurf = null;
  animFromSurf = null;

  // pdf.js can load from a file path via a URL
  const url = `file://${filePath}`;
  pdfDoc = await pdfjsLib.getDocument(url).promise;
  nPages = pdfDoc.numPages;

  // Restore saved page number
  const recentFiles = await pidef.getRecentFiles();
  const fileRecord = recentFiles.find((f) => f.path === filePath);
  currentPage = fileRecord ? Math.min(fileRecord.page, nPages - 1) : 0;

  console.log(`[pidef] loaded ${nPages} pages, resuming at page ${currentPage + 1}`);

  const name = filePath.split("/").pop() || filePath;
  document.title = `pidef — ${name}`;
  currentFilePath = filePath;

  // Force a fresh render at current size
  if (cacheWidth > 0 && cacheHeight > 0) {
    const bmp = await renderPage(currentPage, cacheWidth, cacheHeight);
    surfCache.set(currentPage, bmp);
    currentSurf = bmp;
    bgScan();
  }

  // Add to recent files with current page
  await pidef.addRecentFile(filePath, currentPage);

  updateUI();
  draw();
}

// ── Drag handling (pointer events) ───────────────────────────────────────────

let pointerDown = false;
let pointerStartX = 0;

canvas.addEventListener("pointerdown", (e) => {
  if (!pdfDoc) return;
  pointerDown = true;
  dragCommitted = false;
  pointerStartX = e.clientX;
  pointerStartY = e.clientY;

  if (e.clientX < BRIGHTNESS_ZONE_PX) {
    inBrightnessDrag = true;
    brightnessAtDragStart = brightness;
    if (brightnessHideTimer) clearTimeout(brightnessHideTimer);
    updateBrightnessHud(true);
    canvas.setPointerCapture(e.pointerId);
    return;
  }

  cancelAll();
  dragX = 0;
  dragAdjDir = 0;
  state = "dragging";
  canvas.setPointerCapture(e.pointerId);
  draw();
});

canvas.addEventListener("pointermove", (e) => {
  if (inBrightnessDrag) {
    const dy = pointerStartY - e.clientY;
    brightness = Math.max(BRIGHTNESS_MIN, Math.min(BRIGHTNESS_MAX,
      brightnessAtDragStart + dy / BRIGHTNESS_PX_PER_UNIT));
    applyBrightness();
    updateBrightnessHud(true);
    return;
  }

  if (!pointerDown || state !== "dragging" || dragCommitted) return;
  const dx = e.clientX - pointerStartX;
  dragX = dx;
  if (dx < -5) dragAdjDir = 1;
  else if (dx > 5) dragAdjDir = -1;
  else dragAdjDir = 0;

  if (Math.abs(dx) >= THRESHOLD_PX) {
    const direction = dx < 0 ? 1 : -1;
    const canGo =
      (direction === 1 && currentPage < nPages - 1) ||
      (direction === -1 && currentPage > 0);
    dragCommitted = true;
    if (canGo) {
      const adjSurf = surfCache.get(currentPage + direction) ?? null;
      state = "idle";
      dragX = 0;
      dragAdjDir = 0;
      beginPageChange(direction, adjSurf);
    } else {
      doDragCancel();
    }
    return;
  }

  draw();
});

const TAP_ZONE = 0.30; // fraction of width that counts as a border tap
const TAP_MAX_MOVE = 15; // px; more than this is a drag, not a tap

canvas.addEventListener("pointerup", (e) => {
  if (!pointerDown) return;
  pointerDown = false;
  canvas.releasePointerCapture(e.pointerId);

  if (inBrightnessDrag) {
    inBrightnessDrag = false;
    localStorage.setItem("pidef-brightness", brightness.toString());
    scheduleBrightnessHide();
    return;
  }

  if (!dragCommitted) {
    const moved = Math.abs(e.clientX - pointerStartX);
    if (moved < TAP_MAX_MOVE) {
      const xFrac = pointerStartX / cacheWidth;
      if (xFrac < TAP_ZONE) {
        cancelAll();
        goPrev();
        dragCommitted = false;
        return;
      } else if (xFrac > 1 - TAP_ZONE) {
        cancelAll();
        goNext();
        dragCommitted = false;
        return;
      }
    }
    doDragCancel();
  }
  dragCommitted = false;
});

canvas.addEventListener("pointercancel", (e) => {
  if (!pointerDown) return;
  pointerDown = false;
  canvas.releasePointerCapture(e.pointerId);

  if (inBrightnessDrag) {
    inBrightnessDrag = false;
    scheduleBrightnessHide();
    return;
  }

  if (!dragCommitted) {
    doDragCancel();
  }
  dragCommitted = false;
});

function doDragCancel() {
  if (state !== "dragging") return;
  const sx = dragX;
  state = "snap";
  if (Math.abs(sx) < 1.0) {
    dragX = 0;
    dragAdjDir = 0;
    state = "idle";
    draw();
    return;
  }
  snapFromX = sx;
  animMs = SNAP_MS;
  startTick();
}

// ── Keyboard ─────────────────────────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  switch (e.key) {
    case "ArrowRight":
    case "PageDown":
    case " ":
      e.preventDefault();
      goNext();
      break;
    case "ArrowLeft":
    case "PageUp":
    case "Backspace":
      e.preventDefault();
      goPrev();
      break;
    case "F11":
      e.preventDefault();
      pidef.toggleFullscreen();
      break;
    case "Escape":
      pidef.getFullscreen().then((fs) => {
        if (fs) pidef.toggleFullscreen();
      });
      break;
  }
});

// ── IPC ──────────────────────────────────────────────────────────────────────

pidef.onOpenFile((path) => {
  loadFile(path);
});

pidef.onToggleFullscreen(() => {
  pidef.toggleFullscreen();
});

// ── Recent Files UI ─────────────────────────────────────────────────────────

async function renderRecentFiles() {
  const files = await pidef.getRecentFiles();
  recentFilesList.innerHTML = "";

  for (const fileRecord of files) {
    const li = document.createElement("li");
    const filename = fileRecord.path.split("/").pop() || fileRecord.path;

    li.innerHTML = `
      <div class="filename">${filename}</div>
      <div class="filepath">${fileRecord.path}</div>
    `;

    li.addEventListener("click", () => {
      loadFile(fileRecord.path);
    });

    recentFilesList.appendChild(li);
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

brightness = parseFloat(localStorage.getItem("pidef-brightness") ?? "1.0");
applyBrightness();

updateUI();
resizeCanvas();
renderRecentFiles();
