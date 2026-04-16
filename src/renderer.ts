interface FileRecord {
  path: string;
  page: number;
}

interface Bookmark {
  label: string;
  page: number;
  segue?: boolean; // optional, defaults to false
}

interface PidefAPI {
  openFileDialog: () => Promise<void>;
  toggleFullscreen: () => Promise<void>;
  getFullscreen: () => Promise<boolean>;
  setBrightness: (level: number) => Promise<void>;
  getRecentFiles: () => Promise<FileRecord[]>;
  addRecentFile: (path: string, page?: number) => Promise<void>;
  updateFilePage: (path: string, page: number) => Promise<void>;
  readBookmarks: (pdfPath: string) => Promise<Bookmark[]>;
  writeBookmarks: (pdfPath: string, bookmarks: Bookmark[]) => Promise<void>;
  onOpenFile: (cb: (path: string) => void) => void;
  onToggleFullscreen: (cb: () => void) => void;
}

const pidef: PidefAPI = (window as any).pidef;

// pdf.js loaded via dynamic import (commonjs module)
let pdfjsLib: typeof import("pdfjs-dist");

// ── Tunables ─────────────────────────────────────────────────────────────────

const ANIM_MS = 120;
const SNAP_MS = 80;
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

// Bookmark state
let bookmarks: Bookmark[] = [];
let bookmarkBarVisible = false;

// Bookmark display modes
let bookmarkDisplayMode: 'hidden' | '1-line' | 'all' | 'overlay' = '1-line';
let bookmarkWidthMode: 's' | 'm' | 'l' = 'm';
let showTopBarTitle = true;
let nearestBookmarkPage: number | null = null;
let nearestBookmarkIndex: number | null = null;
let overlayActiveFromMode: 'hidden' | '1-line' | 'all' = '1-line';

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

// Filter states
let sepiaEnabled = false;
let invertEnabled = false;
let sharpenEnabled = false;

// Rotation state (0=0°, 1=90°, 2=180°, 3=270°)
let rotationSteps = 0;

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

document.getElementById("btn-sepia")!.addEventListener("click", () => {
  toggleSepia();
});

document.getElementById("btn-invert")!.addEventListener("click", () => {
  toggleInvert();
});

document.getElementById("btn-sharpen")!.addEventListener("click", () => {
  toggleSharpen();
});

document.getElementById("btn-rotate")!.addEventListener("click", () => {
  cycleRotate();
});

document.getElementById("btn-fullscreen")!.addEventListener("click", () => {
  pidef.toggleFullscreen();
});

// Bookmarks button: cycle through display modes
const bookmarksButtonClickHandler = () => {
  const modes: ('hidden' | '1-line' | 'all')[] = ['hidden', '1-line', 'all'];
  const currentIndex = modes.indexOf(bookmarkDisplayMode as any);
  bookmarkDisplayMode = modes[(currentIndex + 1) % modes.length];
  overlayActiveFromMode = bookmarkDisplayMode;
  localStorage.setItem("pidef-bookmark-display-mode", bookmarkDisplayMode);
  renderBookmarkBar();
};

const bookmarksNavButton = document.getElementById("btn-toggle-bookmarks-nav");
if (bookmarksNavButton) {
  bookmarksNavButton.addEventListener("click", bookmarksButtonClickHandler);
}

// Long-press on bookmark bar itself to enter overlay mode
const bookmarkBar = document.getElementById("bookmark-bar");
if (bookmarkBar) {
  let bookmarkBarLongPressTimer: ReturnType<typeof setTimeout> | null = null;

  bookmarkBar.addEventListener("pointerdown", (e) => {
    // Don't trigger on control buttons
    if ((e.target as HTMLElement).closest("#bookmark-controls")) return;

    bookmarkBarLongPressTimer = setTimeout(() => {
      overlayActiveFromMode = bookmarkDisplayMode;
      bookmarkDisplayMode = 'overlay';
      renderBookmarkBar();
    }, 500);
  });

  bookmarkBar.addEventListener("pointerup", () => {
    if (bookmarkBarLongPressTimer) {
      clearTimeout(bookmarkBarLongPressTimer);
      bookmarkBarLongPressTimer = null;
    }
  });

  bookmarkBar.addEventListener("pointercancel", () => {
    if (bookmarkBarLongPressTimer) {
      clearTimeout(bookmarkBarLongPressTimer);
      bookmarkBarLongPressTimer = null;
    }
  });
}

// Width control button
const widthControlBtn = document.getElementById("btn-width-control");
if (widthControlBtn) {
  widthControlBtn.addEventListener("click", () => {
    const modes: ('s' | 'm' | 'l')[] = ['s', 'm', 'l'];
    const currentIndex = modes.indexOf(bookmarkWidthMode);
    bookmarkWidthMode = modes[(currentIndex + 1) % modes.length];
    widthControlBtn.textContent = bookmarkWidthMode;
    localStorage.setItem("pidef-bookmark-width-mode", bookmarkWidthMode);
    renderBookmarkBar();
  });
}

// Title toggle button (Aa)
const titleToggleBtn = document.getElementById("btn-title-toggle");
if (titleToggleBtn) {
  titleToggleBtn.addEventListener("click", () => {
    showTopBarTitle = !showTopBarTitle;
    localStorage.setItem("pidef-show-top-bar-title", showTopBarTitle.toString());
    renderTopBar();
  });
}

// Tri-state button
const triStateBtn = document.getElementById("btn-bookmark-tri-state");
if (triStateBtn) {
  triStateBtn.addEventListener("click", () => {
    const modes: ('hidden' | '1-line' | 'all')[] = ['hidden', '1-line', 'all'];
    const currentIndex = modes.indexOf(bookmarkDisplayMode as any);
    bookmarkDisplayMode = modes[(currentIndex + 1) % modes.length];
    localStorage.setItem("pidef-bookmark-display-mode", bookmarkDisplayMode);
    renderBookmarkBar();
  });
}

// Overlay close handlers
const overlay = document.getElementById("bookmark-overlay");
const overlayBackdrop = document.getElementById("bookmark-overlay-backdrop");
if (overlay && overlayBackdrop) {
  overlayBackdrop.addEventListener("click", () => {
    bookmarkDisplayMode = overlayActiveFromMode;
    renderBookmarkBar();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) {
      bookmarkDisplayMode = overlayActiveFromMode;
      renderBookmarkBar();
    }
  });
}

document.getElementById("btn-add-bookmark")!.addEventListener("click", () => {
  if (!pdfDoc) return;
  const existing = bookmarks.find((b) => b.page === currentPage);
  if (existing) return; // pill already highlighted
  showBookmarkInput();
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
    renderBookmarkBar();
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

// ── Sepia control ────────────────────────────────────────────────────────────

function getFilterString(): string {
  const filters: string[] = [];

  if (sepiaEnabled) {
    filters.push("sepia(0.8) brightness(0.6) saturate(0.7)");
  }
  if (invertEnabled) {
    filters.push("invert(1)");
  }
  if (sharpenEnabled) {
    filters.push("url(#sharpen-filter)");
  }

  return filters.join(" ");
}

function applyFilters() {
  // Filters are now applied in draw() to the image content only, not the background
  draw();
}

function toggleSepia() {
  sepiaEnabled = !sepiaEnabled;
  const btn = document.getElementById("btn-sepia")!;

  if (sepiaEnabled) {
    btn.classList.add("active");
  } else {
    btn.classList.remove("active");
  }

  localStorage.setItem("pidef-sepia", sepiaEnabled.toString());
  applyFilters();
}

function toggleInvert() {
  invertEnabled = !invertEnabled;
  const btn = document.getElementById("btn-invert")!;

  if (invertEnabled) {
    btn.classList.add("active");
  } else {
    btn.classList.remove("active");
  }

  localStorage.setItem("pidef-invert", invertEnabled.toString());
  applyFilters();
}

function toggleSharpen() {
  sharpenEnabled = !sharpenEnabled;
  const btn = document.getElementById("btn-sharpen")!;

  if (sharpenEnabled) {
    btn.classList.add("active");
  } else {
    btn.classList.remove("active");
  }

  localStorage.setItem("pidef-sharpen", sharpenEnabled.toString());
  applyFilters();
}

function applyUiRotation() {
  document.body.classList.remove("rotate-90", "rotate-180", "rotate-270");
  if (rotationSteps === 1) document.body.classList.add("rotate-90");
  else if (rotationSteps === 2) document.body.classList.add("rotate-180");
  else if (rotationSteps === 3) document.body.classList.add("rotate-270");

  const btn = document.getElementById("btn-rotate")!;
  if (rotationSteps > 0) {
    btn.classList.add("active");
  } else {
    btn.classList.remove("active");
  }
}

function cycleRotate() {
  rotationSteps = (rotationSteps + 1) % 4;
  localStorage.setItem("pidef-rotation", rotationSteps.toString());
  applyUiRotation();
  // For 90°/270° the body dimensions swap, ResizeObserver fires and re-renders.
  // For 180° dimensions stay the same; force a cache flush and redraw manually.
  if (rotationSteps === 2 || rotationSteps === 0) {
    surfCache.clear();
    rendering.clear();
    currentSurf = null;
    if (pdfDoc && cacheWidth > 0 && cacheHeight > 0) {
      renderPageCached(currentPage).then((bmp) => {
        if (bmp) { currentSurf = bmp; draw(); bgScan(); }
      });
    }
  }
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
  // Apply filters only to the drawn content, not the background
  const filterStr = getFilterString();
  ctx.filter = filterStr;

  // ── DRAGGING / SNAP ──────────────────────────────────────────────────
  if (state === "dragging" || state === "snap") {
    ctx.drawImage(currentSurf, dragX, 0, w, h);
    if (dragAdjDir !== 0) {
      const adjSurf = surfCache.get(currentPage + dragAdjDir);
      if (adjSurf) {
        ctx.drawImage(adjSurf, dragAdjDir * w + dragX, 0, w, h);
      }
    }
    ctx.filter = "none";
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
    ctx.filter = "none";
    return;
  }

  // ── IDLE ─────────────────────────────────────────────────────────────
  ctx.drawImage(currentSurf, 0, 0, w, h);
  ctx.filter = "none";
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

async function closePdf() {
  // Add to recent files if we had a file open
  if (currentFilePath) {
    await pidef.addRecentFile(currentFilePath, currentPage);
  }

  cancelAll();
  pdfDoc = null;
  currentFilePath = "";
  currentPage = 0;
  nPages = 0;
  currentSurf = null;
  animFromSurf = null;
  surfCache.clear();
  rendering.clear();
  clearBookmarks();
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
  updateNearestBookmark();
  renderTopBar();
  renderBookmarkBar();
}

// ── File loading ─────────────────────────────────────────────────────────────

async function loadBookmarksForFile(filePath: string): Promise<void> {
  bookmarks = await pidef.readBookmarks(filePath);
  updateNearestBookmark();
}

function clearBookmarks(): void {
  bookmarks = [];
}

function renderBookmarkBar(): void {
  const bar = document.getElementById("bookmark-bar")!;
  const pills = document.getElementById("bookmark-pills")!;
  const canvasContainer = document.getElementById("canvas-container")!;

  // Handle overlay mode
  if (bookmarkDisplayMode === 'overlay') {
    bar.classList.add("hidden");
    // Disable page interaction when overlay is active
    canvasContainer.style.pointerEvents = 'none';
    renderBookmarkOverlay();
    return;
  }

  // Re-enable page interaction when overlay is closed
  canvasContainer.style.pointerEvents = 'auto';

  // Show/hide bar based on display mode
  const shouldShow = pdfDoc !== null && bookmarkDisplayMode !== 'hidden';
  bar.classList.toggle("hidden", !shouldShow);

  pills.innerHTML = "";

  if (!shouldShow) return;

  // Render pills based on mode
  for (const bm of bookmarks) {
    const pill = document.createElement("button");
    pill.className = "bookmark-pill";

    // Highlight nearest pill
    if (nearestBookmarkIndex !== null && bookmarks[nearestBookmarkIndex].page === bm.page) {
      pill.classList.add("highlighted");
    }

    // Format content based on width mode
    const content = formatPillContent(bm.label, bookmarkWidthMode);
    const leading = extractLeadingChars(bm.label);

    if (bookmarkWidthMode === 's' || (bookmarkWidthMode === 'm' && leading)) {
      const span = document.createElement("span");
      span.innerHTML = `<strong class="pill-leading">${leading || '#'}</strong>`;
      if (bookmarkWidthMode === 'm') {
        const rest = content.substring(leading.length);
        span.innerHTML += rest;
      }
      pill.appendChild(span);
    } else {
      pill.textContent = content;
    }

    // Add segue arrow if applicable
    if (bm.segue) {
      if (pill.textContent) {
        pill.textContent += ' ▶';
      } else {
        pill.innerHTML += ' ▶';
      }
    }

    // Long-press (500ms) opens edit modal
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    const startLongPress = () => {
      longPressTimer = setTimeout(() => {
        openBookmarkEditModal(bm);
      }, 500);
    };
    const cancelLongPress = () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    };
    pill.addEventListener("pointerdown", startLongPress);
    pill.addEventListener("pointerup", cancelLongPress);
    pill.addEventListener("pointercancel", cancelLongPress);
    pill.addEventListener("pointermove", cancelLongPress);

    // Click handler
    pill.addEventListener("click", () => {
      goToPage(bm.page);
    });

    pills.appendChild(pill);
  }

  // Center nearest pill in 1-line mode
  if (bookmarkDisplayMode === '1-line' && nearestBookmarkIndex !== null) {
    setTimeout(() => {
      const nearestPill = pills.children[nearestBookmarkIndex!] as HTMLElement;
      if (nearestPill) {
        nearestPill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }, 0);
  }

  renderBookmarkOverlay();
}

function renderBookmarkOverlay(): void {
  const overlay = document.getElementById("bookmark-overlay")!;
  const pillsContainer = document.getElementById("bookmark-overlay-pills")!;

  if (bookmarkDisplayMode !== 'overlay') {
    overlay.classList.add("hidden");
    return;
  }

  overlay.classList.remove("hidden");
  pillsContainer.innerHTML = "";

  // Adjust pills position based on rotation
  pillsContainer.style.right = '';
  pillsContainer.style.left = '';
  pillsContainer.style.top = '';
  pillsContainer.style.bottom = '';

  switch (rotationSteps) {
    case 0: // 0°
      pillsContainer.style.right = '0';
      pillsContainer.style.top = '0';
      break;
    case 1: // 90°
      pillsContainer.style.bottom = '0';
      pillsContainer.style.left = '0';
      break;
    case 2: // 180°
      pillsContainer.style.left = '0';
      pillsContainer.style.bottom = '0';
      break;
    case 3: // 270°
      pillsContainer.style.top = '0';
      pillsContainer.style.right = '0';
      break;
  }

  // Render pills stacked vertically with larger fonts
  for (const bm of bookmarks) {
    const pill = document.createElement("button");
    pill.className = "overlay-pill";

    // Highlight nearest pill
    if (nearestBookmarkIndex !== null && bookmarks[nearestBookmarkIndex].page === bm.page) {
      pill.classList.add("highlighted");
    }

    // Format content (use full width in overlay)
    const leading = extractLeadingChars(bm.label);
    const content = formatPillContent(bm.label, 'l');

    if (leading) {
      pill.innerHTML = `<strong class="pill-leading">${leading}</strong> ${content.substring(leading.length)}`;
    } else {
      pill.textContent = content;
    }

    // Add segue arrow
    if (bm.segue) {
      if (pill.textContent) {
        pill.textContent += ' ▶';
      } else {
        pill.innerHTML += ' ▶';
      }
    }

    // Click handler - jump to page and close overlay
    pill.addEventListener("click", () => {
      goToPage(bm.page);
      bookmarkDisplayMode = overlayActiveFromMode;
      renderBookmarkBar();
    });

    pillsContainer.appendChild(pill);
  }
}

function renderTopBar(): void {
  const titleSpan = document.getElementById("top-bar-title")!;

  if (showTopBarTitle && nearestBookmarkPage !== null && nearestBookmarkIndex !== null) {
    titleSpan.textContent = bookmarks[nearestBookmarkIndex].label;
  } else {
    titleSpan.textContent = '';
  }
}

function removeBookmark(page: number): void {
  bookmarks = bookmarks.filter((b) => b.page !== page);
  if (currentFilePath) pidef.writeBookmarks(currentFilePath, bookmarks);
  updateNearestBookmark();
  renderBookmarkBar();
}

function addBookmark(label: string, page: number): void {
  bookmarks = [...bookmarks.filter((b) => b.page !== page), { label, page }]
    .sort((a, b) => a.page - b.page);
  if (currentFilePath) pidef.writeBookmarks(currentFilePath, bookmarks);
  updateNearestBookmark();
  renderBookmarkBar();
}

function findNearestBookmark(): { page: number | null; index: number | null } {
  if (bookmarks.length === 0) return { page: null, index: null };

  // Find the bookmark with the largest page number that is <= currentPage
  let nearest: { page: number; index: number } | null = null;
  for (let i = 0; i < bookmarks.length; i++) {
    if (bookmarks[i].page <= currentPage) {
      if (!nearest || bookmarks[i].page > nearest.page) {
        nearest = { page: bookmarks[i].page, index: i };
      }
    }
  }

  return { page: nearest?.page ?? null, index: nearest?.index ?? null };
}

function extractLeadingChars(title: string): string {
  const match = title.match(/^(\d+[a-zA-Z]?)/);
  return match ? match[1] : '';
}

function formatPillContent(title: string, mode: 's' | 'm' | 'l'): string {
  switch (mode) {
    case 's': {
      const leading = extractLeadingChars(title);
      return leading || '#bookmark';
    }
    case 'm': {
      return title.length > 12 ? title.substring(0, 12) + '...' : title;
    }
    case 'l':
      return title;
  }
}

function updateNearestBookmark(): void {
  const { page, index } = findNearestBookmark();
  nearestBookmarkPage = page;
  nearestBookmarkIndex = index;
}

let currentEditingBookmark: Bookmark | null = null;

function openBookmarkEditModal(bm: Bookmark): void {
  currentEditingBookmark = bm;

  const modal = document.getElementById("bookmark-edit-modal")!;
  const labelInput = document.getElementById("bookmark-modal-label") as HTMLInputElement;
  const segueCheckbox = document.getElementById("bookmark-modal-segue") as HTMLInputElement;

  labelInput.value = bm.label;
  segueCheckbox.checked = bm.segue ?? false;

  modal.classList.remove("hidden");
  labelInput.focus();
  labelInput.select();
}

function closeBookmarkEditModal(): void {
  const modal = document.getElementById("bookmark-edit-modal")!;
  modal.classList.add("hidden");
  currentEditingBookmark = null;
}

function showBookmarkInput(): void {
  const bar = document.getElementById("bookmark-bar")!;
  const addBtn = document.getElementById("btn-add-bookmark")!;
  addBtn.style.display = "none";

  const wrap = document.createElement("div");
  wrap.id = "bookmark-input-wrap";

  const input = document.createElement("input");
  input.type = "text";
  input.value = `p.${currentPage + 1}`;

  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = "✓";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "✕";

  wrap.appendChild(input);
  wrap.appendChild(confirmBtn);
  wrap.appendChild(cancelBtn);
  bar.appendChild(wrap);

  input.focus();
  input.select();

  let closed = false;
  function closeInput() {
    if (closed) return;
    closed = true;
    wrap.remove();
    addBtn.style.display = "";
  }
  function confirm() {
    const label = input.value.trim();
    if (label) addBookmark(label, currentPage);
    closeInput();
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); confirm(); }
    if (e.key === "Escape") closeInput();
  });
  confirmBtn.addEventListener("click", confirm);
  cancelBtn.addEventListener("click", closeInput);
  input.addEventListener("blur", () => setTimeout(closeInput, 150));
}

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

  await loadBookmarksForFile(filePath);

  updateUI();
  draw();
}

// ── Drag handling (pointer events) ───────────────────────────────────────────

// Map screen-space deltas to visual (post-rotation) horizontal delta.
// rotationSteps: 0=0°, 1=90°CW, 2=180°, 3=270°CW
function toVisualDx(dx: number, dy: number): number {
  switch (rotationSteps) {
    case 1: return dy;   // 90° CW:  visual right = screen down
    case 2: return -dx;  // 180°:    visual right = screen left
    case 3: return -dy;  // 270° CW: visual right = screen up
    default: return dx;
  }
}

// Map screen-space deltas to visual vertical delta (positive = down).
function toVisualDy(dx: number, dy: number): number {
  switch (rotationSteps) {
    case 1: return -dx;  // 90° CW:  visual down = screen left
    case 2: return -dy;  // 180°:    visual down = screen up
    case 3: return dx;   // 270° CW: visual down = screen right
    default: return dy;
  }
}

// Returns true if the pointer is in the brightness-control zone (visual left edge strip).
function isInBrightnessZone(clientX: number, clientY: number): boolean {
  switch (rotationSteps) {
    case 1: return clientY < BRIGHTNESS_ZONE_PX;                          // visual left = screen top
    case 2: return clientX > (cacheWidth - BRIGHTNESS_ZONE_PX);           // visual left = screen right
    case 3: return clientY > (cacheHeight - BRIGHTNESS_ZONE_PX);          // visual left = screen bottom
    default: return clientX < BRIGHTNESS_ZONE_PX;                         // visual left = screen left
  }
}

// Return the visual X fraction [0..1] of a pointer position for tap-zone checks.
function visualXFrac(clientX: number, clientY: number): number {
  switch (rotationSteps) {
    case 1: return clientY / cacheWidth;
    case 2: return (cacheWidth - clientX) / cacheWidth;
    case 3: return (cacheWidth - clientY) / cacheWidth;
    default: return clientX / cacheWidth;
  }
}

let pointerDown = false;
let pointerStartX = 0;

canvas.addEventListener("pointerdown", (e) => {
  if (!pdfDoc) return;
  pointerDown = true;
  dragCommitted = false;
  pointerStartX = e.clientX;
  pointerStartY = e.clientY;

  if (isInBrightnessZone(e.clientX, e.clientY)) {
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
    const screenDx = e.clientX - pointerStartX;
    const screenDy = e.clientY - pointerStartY;
    // Visual upward motion increases brightness; negate visualDy (positive=down) to get delta.
    const delta = -toVisualDy(screenDx, screenDy);
    brightness = Math.max(BRIGHTNESS_MIN, Math.min(BRIGHTNESS_MAX,
      brightnessAtDragStart + delta / BRIGHTNESS_PX_PER_UNIT));
    applyBrightness();
    updateBrightnessHud(true);
    return;
  }

  if (!pointerDown || state !== "dragging" || dragCommitted) return;
  const dx = toVisualDx(e.clientX - pointerStartX, e.clientY - pointerStartY);
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
    const moved = Math.abs(toVisualDx(e.clientX - pointerStartX, e.clientY - pointerStartY));
    if (moved < TAP_MAX_MOVE) {
      const xFrac = visualXFrac(pointerStartX, pointerStartY);
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

sepiaEnabled = localStorage.getItem("pidef-sepia") === "true";
if (sepiaEnabled) {
  document.getElementById("btn-sepia")!.classList.add("active");
}

invertEnabled = localStorage.getItem("pidef-invert") === "true";
if (invertEnabled) {
  document.getElementById("btn-invert")!.classList.add("active");
}

sharpenEnabled = localStorage.getItem("pidef-sharpen") === "true";
if (sharpenEnabled) {
  document.getElementById("btn-sharpen")!.classList.add("active");
}

rotationSteps = parseInt(localStorage.getItem("pidef-rotation") ?? "0", 10);
applyUiRotation();

// Load bookmark display mode preferences
bookmarkDisplayMode = (localStorage.getItem("pidef-bookmark-display-mode") as any) || '1-line';
bookmarkWidthMode = (localStorage.getItem("pidef-bookmark-width-mode") as any) || 'm';
showTopBarTitle = localStorage.getItem("pidef-show-top-bar-title") !== 'false';

// Update UI elements to reflect loaded preferences
const widthBtn = document.getElementById("btn-width-control");
if (widthBtn) widthBtn.textContent = bookmarkWidthMode;

// Old bookmarkBarVisible code (kept for backwards compatibility)
bookmarkBarVisible = bookmarkDisplayMode !== 'hidden';

applyFilters();

updateUI();
resizeCanvas();
renderRecentFiles();

// Modal event listeners
const bookmarkModal = document.getElementById("bookmark-edit-modal")!;
const bookmarkModalBackdrop = document.getElementById("bookmark-modal-backdrop")!;
const bookmarkModalLabel = document.getElementById("bookmark-modal-label") as HTMLInputElement;
const bookmarkModalDone = document.getElementById("bookmark-modal-done")!;
const bookmarkModalCancel = document.getElementById("bookmark-modal-cancel")!;

bookmarkModalDone.addEventListener("click", () => {
  if (!currentEditingBookmark) return;

  const newLabel = bookmarkModalLabel.value.trim();
  if (!newLabel) return;

  currentEditingBookmark.label = newLabel;
  currentEditingBookmark.segue = (document.getElementById("bookmark-modal-segue") as HTMLInputElement).checked;

  if (currentFilePath) {
    pidef.writeBookmarks(currentFilePath, bookmarks);
  }

  closeBookmarkEditModal();
  renderBookmarkBar();
});

const bookmarkModalDelete = document.getElementById("bookmark-modal-delete")!;

bookmarkModalDelete.addEventListener("click", () => {
  if (!currentEditingBookmark) return;

  const confirmed = confirm(`Delete bookmark "${currentEditingBookmark.label}"?`);
  if (!confirmed) return;

  const pageToRemove = currentEditingBookmark.page;
  bookmarks = bookmarks.filter((b) => b.page !== pageToRemove);

  if (currentFilePath) {
    pidef.writeBookmarks(currentFilePath, bookmarks);
  }

  closeBookmarkEditModal();
  renderBookmarkBar();
});

bookmarkModalCancel.addEventListener("click", () => {
  closeBookmarkEditModal();
});

bookmarkModalBackdrop.addEventListener("click", () => {
  closeBookmarkEditModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !bookmarkModal.classList.contains("hidden")) {
    closeBookmarkEditModal();
  }
});

bookmarkModalLabel.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    bookmarkModalDone.click();
  }
});
