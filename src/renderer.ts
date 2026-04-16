interface FileRecord {
  path: string;
  page: number;
  halfMode?: boolean;
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
  updateFileHalfMode: (path: string, halfMode: boolean) => Promise<void>;
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
const HALF_PAN_MS = 100;

const BRIGHTNESS_ZONE_PX = 60;
const BRIGHTNESS_MIN = 0.1;
const BRIGHTNESS_MAX = 1.0;
const BRIGHTNESS_PX_PER_UNIT = 200;

// ── State ────────────────────────────────────────────────────────────────────

type State = "idle" | "dragging" | "snap" | "animating" | "half-pan";

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
let overlayActiveFromMode: 'hidden' | '1-line' | 'all' = 'hidden';

// Half mode state
let halfMode = false;
let halfPage: 'top' | 'bottom' = 'top';

// Surface cache: page index -> ImageBitmap or OffscreenCanvas snapshot
const surfCache = new Map<number, ImageBitmap>();
let cacheWidth = 0;
let cacheHeight = 0;
const rendering = new Set<number>();

// Animation state
let state: State = "idle";
let currentSurf: ImageBitmap | null = null;
let animFromSurf: ImageBitmap | null = null;
let animFromHalf: 'top' | 'bottom' = 'top'; // half that was visible before a page-change animation
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
const pageLabel = document.getElementById("nav-label")!;
const navLabel = document.getElementById("nav-label")!;

document.getElementById("btn-open")!.addEventListener("click", () => {
  pidef.openFileDialog();
});

document.getElementById("btn-close")!.addEventListener("click", () => {
  if (!pdfDoc) return;
  closePdf();
});

document.getElementById("btn-sepia")!.addEventListener("click", () => {
  if (!pdfDoc) return;
  toggleSepia();
});

document.getElementById("btn-invert")!.addEventListener("click", () => {
  if (!pdfDoc) return;
  toggleInvert();
});

document.getElementById("btn-sharpen")!.addEventListener("click", () => {
  if (!pdfDoc) return;
  toggleSharpen();
});

document.getElementById("btn-half")!.addEventListener("click", () => {
  if (!pdfDoc) return;
  toggleHalfMode();
});

document.getElementById("btn-rotate-cw")!.addEventListener("click", () => {
  if (!pdfDoc) return;
  remapHalfOnRotation(rotationSteps, 1);
  rotationSteps = (rotationSteps + 1) % 4;
  localStorage.setItem("pidef-rotation", rotationSteps.toString());
  applyUiRotation();
  if (rotationSteps === 2 || rotationSteps === 0 || halfMode) {
    surfCache.clear();
    rendering.clear();
    currentSurf = null;
    bgScan();
  }
});

document.getElementById("btn-rotate-ccw")!.addEventListener("click", () => {
  if (!pdfDoc) return;
  remapHalfOnRotation(rotationSteps, -1);
  rotationSteps = (rotationSteps + 3) % 4; // +3 is same as -1 mod 4
  localStorage.setItem("pidef-rotation", rotationSteps.toString());
  applyUiRotation();
  if (rotationSteps === 2 || rotationSteps === 0 || halfMode) {
    surfCache.clear();
    rendering.clear();
    currentSurf = null;
    bgScan();
  }
});

document.getElementById("btn-fullscreen")!.addEventListener("click", () => {
  if (!pdfDoc) return;
  pidef.toggleFullscreen();
});

/// Bookmarks button: cycle through display modes (hidden → 1-line → all → hidden)
let bookmarkLongPressActivated = false;
const bookmarksButtonClickHandler = () => {
  if (!pdfDoc) return;
  // If this click follows a long-press that opened the overlay, swallow it
  if (bookmarkLongPressActivated) {
    bookmarkLongPressActivated = false;
    return;
  }
  const modes: ('hidden' | '1-line' | 'all')[] = ['hidden', '1-line', 'all'];
  const currentIndex = modes.indexOf(bookmarkDisplayMode as any);
  bookmarkDisplayMode = modes[(currentIndex + 1) % modes.length];
  overlayActiveFromMode = bookmarkDisplayMode !== 'hidden' ? bookmarkDisplayMode : '1-line';
  localStorage.setItem("pidef-bookmark-display-mode", bookmarkDisplayMode);
  renderBookmarkBar();
};

let bookmarkButtonLongPressTimer: ReturnType<typeof setTimeout> | null = null;

const bookmarksNavButton = document.getElementById("btn-toggle-bookmarks-nav");
if (bookmarksNavButton) {
  // Click: cycle through modes
  bookmarksNavButton.addEventListener("click", bookmarksButtonClickHandler);

  // Long-press: enter overlay mode
  bookmarksNavButton.addEventListener("pointerdown", () => {
    if (!pdfDoc) return;
    bookmarkButtonLongPressTimer = setTimeout(() => {
      if (bookmarkDisplayMode !== 'overlay') {
        overlayActiveFromMode = bookmarkDisplayMode;
      }
      bookmarkDisplayMode = 'overlay';
      bookmarkLongPressActivated = true;
      renderBookmarkBar();
    }, 500);
  });

  bookmarksNavButton.addEventListener("pointerup", () => {
    if (bookmarkButtonLongPressTimer) {
      clearTimeout(bookmarkButtonLongPressTimer);
      bookmarkButtonLongPressTimer = null;
    }
  });

  bookmarksNavButton.addEventListener("pointercancel", () => {
    if (bookmarkButtonLongPressTimer) {
      clearTimeout(bookmarkButtonLongPressTimer);
      bookmarkButtonLongPressTimer = null;
    }
  });
}

// Width control button
const widthControlBtn = document.getElementById("btn-width-control");
if (widthControlBtn) {
  widthControlBtn.addEventListener("click", () => {
    if (!pdfDoc) return;
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
    if (!pdfDoc) return;
    showTopBarTitle = !showTopBarTitle;
    localStorage.setItem("pidef-show-top-bar-title", showTopBarTitle.toString());
    renderTopBar();
  });
}

// Overlay close handlers
const overlay = document.getElementById("bookmark-overlay");
if (overlay) {
  // Close when tapping anywhere on the overlay container (backdrop area).
  // The pills panel stops propagation so tapping a pill doesn't bubble here.
  overlay.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
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


// ── 1-line bookmark bar manual scroll (rotation-aware, with inertia) ─────────
// Native overflow-x scroll doesn't work when the body is CSS-rotated 90°/270°
// because the browser resolves gestures in screen space, not transformed space.
// We drive scrollLeft manually using toVisualDx() which maps screen→visual coords.
{
  const pills = document.getElementById("bookmark-pills")!;
  let activePointerId: number | null = null;
  let pillsStartX = 0;
  let pillsStartY = 0;
  let pillsStartScrollLeft = 0;
  let pillsDragCommitted = false;
  const PILLS_DRAG_THRESHOLD = 8;

  // Inertia state
  let inertiaRaf: number | null = null;
  let inertiaVelocity = 0;       // px/ms, positive = scrolling right (scrollLeft increasing)
  let lastMoveTime = 0;
  let lastVdx = 0;
  const FRICTION = 0.92;         // velocity multiplied each frame
  const MIN_VELOCITY = 0.05;     // stop below this px/ms

  function stopInertia() {
    if (inertiaRaf !== null) { cancelAnimationFrame(inertiaRaf); inertiaRaf = null; }
    inertiaVelocity = 0;
  }

  function tickInertia(prevTime: number) {
    inertiaRaf = requestAnimationFrame((now) => {
      const dt = now - prevTime;
      inertiaVelocity *= FRICTION;
      if (Math.abs(inertiaVelocity) < MIN_VELOCITY) {
        inertiaRaf = null;
        return;
      }
      pills.scrollLeft += inertiaVelocity * dt;
      tickInertia(now);
    });
  }

  pills.addEventListener("pointerdown", (e) => {
    if (bookmarkDisplayMode !== '1-line') return;
    stopInertia();
    activePointerId = e.pointerId;
    pillsDragCommitted = false;
    pillsStartX = e.clientX;
    pillsStartY = e.clientY;
    pills.scrollLeft = pills.scrollLeft; // cancel any in-progress smooth scroll
    pillsStartScrollLeft = pills.scrollLeft;
    lastMoveTime = e.timeStamp;
    lastVdx = 0;
    inertiaVelocity = 0;
  });

  pills.addEventListener("pointermove", (e) => {
    if (bookmarkDisplayMode !== '1-line' || e.pointerId !== activePointerId) return;
    const vdx = toVisualDx(e.clientX - pillsStartX, e.clientY - pillsStartY);
    if (!pillsDragCommitted && Math.abs(vdx) > PILLS_DRAG_THRESHOLD) {
      pillsDragCommitted = true;
    }
    if (pillsDragCommitted) {
      const newScrollLeft = pillsStartScrollLeft - vdx;
      const dt = e.timeStamp - lastMoveTime;
      if (dt > 0) {
        // velocity in px/ms; positive = scrollLeft increasing
        inertiaVelocity = -(vdx - lastVdx) / dt;
      }
      lastVdx = vdx;
      lastMoveTime = e.timeStamp;
      pills.scrollLeft = newScrollLeft;
      e.stopPropagation();
    }
  });

  const endDrag = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    if (pillsDragCommitted && Math.abs(inertiaVelocity) > MIN_VELOCITY) {
      tickInertia(e.timeStamp);
    }
  };
  pills.addEventListener("pointerup", endDrag);
  pills.addEventListener("pointercancel", endDrag);
}

document.getElementById("btn-add-bookmark")!.addEventListener("click", () => {
  if (!pdfDoc) return;
  const existing = bookmarks.find((b) => b.page === currentPage);
  if (existing) return; // pill already highlighted
  showBookmarkInput();
});

document.getElementById("btn-first")!.addEventListener("click", () => {
  if (!pdfDoc) return;
  goFirst();
});

document.getElementById("btn-prev")!.addEventListener("click", () => {
  if (!pdfDoc) return;
  goPrev();
});

document.getElementById("btn-next")!.addEventListener("click", () => {
  if (!pdfDoc) return;
  goNext();
});

document.getElementById("btn-last")!.addEventListener("click", () => {
  if (!pdfDoc) return;
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

  // In half mode, double the long axis so each half fills the canvas.
  // rotationSteps 1/3 means the page is displayed landscape on screen,
  // so we double the width; otherwise double the height.
  const surfW = halfMode && (rotationSteps === 1 || rotationSteps === 3)
    ? width * 2
    : width;
  const surfH = halfMode && (rotationSteps === 0 || rotationSteps === 2)
    ? height * 2
    : height;

  const pad = 0;
  const scale = Math.min(
    (surfW - pad * 2) / viewport.width,
    (surfH - pad * 2) / viewport.height
  );
  const sw = viewport.width * scale;
  const sh = viewport.height * scale;
  const cx = (surfW - sw) / 2;
  const cy = (surfH - sh) / 2;

  const offscreen = new OffscreenCanvas(surfW, surfH);
  const oc = offscreen.getContext("2d")!;

  // Dark background
  oc.fillStyle = "#212121";
  oc.fillRect(0, 0, surfW, surfH);

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

// Returns [srcX, srcY, srcW, srcH] of the active half within a cached surface.
// In normal mode, returns the full surface rect.
function halfSrcRect(half: 'top' | 'bottom'): [number, number, number, number] {
  const w = cacheWidth;
  const h = cacheHeight;
  if (!halfMode) return [0, 0, w, h];

  // Landscape rotation (1 or 3): split is left/right in surface space
  if (rotationSteps === 1 || rotationSteps === 3) {
    const fullW = w * 2;
    return half === 'top'
      ? [0, 0, fullW / 2, h]
      : [fullW / 2, 0, fullW / 2, h];
  }
  // Portrait rotation (0 or 2): split is top/bottom in surface space
  const fullH = h * 2;
  return half === 'top'
    ? [0, 0, w, fullH / 2]
    : [0, fullH / 2, w, fullH / 2];
}

// Remaps halfPage and animFromHalf when rotation changes the split axis.
// Call BEFORE updating rotationSteps.
// Portrait (steps 0/2) + CW, or Landscape (steps 1/3) + CCW: flip.
// All other cases: keep.
function remapHalfOnRotation(prevSteps: number, delta: 1 | -1): void {
  if (!halfMode) return;
  const prevIsPortrait = prevSteps % 2 === 0;
  const shouldFlip = (prevIsPortrait && delta === 1) || (!prevIsPortrait && delta === -1);
  if (!shouldFlip) return;
  halfPage = halfPage === 'top' ? 'bottom' : 'top';
  animFromHalf = animFromHalf === 'top' ? 'bottom' : 'top';
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

  if (sharpenEnabled) {
    filters.push("url(#sharpen-filter)");
  }
  if (sepiaEnabled) {
    filters.push("sepia(0.8) brightness(0.6) saturate(0.7)");
  }
  if (invertEnabled) {
    filters.push("invert(1)");
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

function toggleHalfMode() {
  halfMode = !halfMode;
  halfPage = 'top';
  const btn = document.getElementById("btn-half")!;
  btn.classList.toggle("active", halfMode);
  // Clear cache — render dimensions change
  surfCache.clear();
  rendering.clear();
  currentSurf = null;
  animFromSurf = null;
  // Persist to file record
  if (currentFilePath && pdfDoc) {
    pidef.updateFileHalfMode(currentFilePath, halfMode);
  }
  // Re-render current page at new dimensions
  if (pdfDoc && cacheWidth > 0 && cacheHeight > 0) {
    renderPage(currentPage, cacheWidth, cacheHeight).then((bmp) => {
      surfCache.set(currentPage, bmp);
      currentSurf = bmp;
      bgScan();
      draw();
    });
  }
}

function applyUiRotation() {
  document.body.classList.remove("rotate-90", "rotate-180", "rotate-270");
  if (rotationSteps === 1) document.body.classList.add("rotate-90");
  else if (rotationSteps === 2) document.body.classList.add("rotate-180");
  else if (rotationSteps === 3) document.body.classList.add("rotate-270");

  const btnCw = document.getElementById("btn-rotate-cw")!;
  const btnCcw = document.getElementById("btn-rotate-ccw")!;
  if (rotationSteps > 0) {
    btnCw.classList.add("active");
    btnCcw.classList.add("active");
  } else {
    btnCw.classList.remove("active");
    btnCcw.classList.remove("active");
  }
}

// ── Drawing ──────────────────────────────────────────────────────────────────

function draw() {
  const w = cacheWidth;
  const h = cacheHeight;

  ctx.fillStyle = "#212121";
  ctx.fillRect(0, 0, w, h);

  if (!pdfDoc) {
    return;
  }

  if (!currentSurf) return;
  const filterStr = getFilterString();
  ctx.filter = filterStr;

  // ── DRAGGING / SNAP ──────────────────────────────────────────────────
  if (state === "dragging" || state === "snap") {
    const [sx, sy, sw, sh] = halfSrcRect(halfPage);
    ctx.drawImage(currentSurf, sx, sy, sw, sh, dragX, 0, w, h);
    if (dragAdjDir !== 0) {
      const adjSurf = surfCache.get(currentPage + dragAdjDir);
      if (adjSurf) {
        // Adjacent page always shows its 'top' half when coming from a page change drag
        const adjHalf = halfMode
          ? (dragAdjDir === 1 ? 'top' : 'bottom')
          : 'top';
        const [asx, asy, asw, ash] = halfSrcRect(adjHalf);
        ctx.drawImage(adjSurf, asx, asy, asw, ash, dragAdjDir * w + dragX, 0, w, h);
      }
    }
    ctx.filter = "none";
    return;
  }

  // ── HALF-PAN ────────────────────────────────────────────────────────
  if (state === "half-pan" && animT < 1.0) {
    const ease = easeOut(animT);
    // animDir: +1 means going top→bottom (pan upward), -1 means bottom→top (pan downward)
    const outY = -animDir * ease * h;
    const inY = animDir * (1.0 - ease) * h;
    const [fsx, fsy, fsw, fsh] = halfSrcRect(animDir === 1 ? 'top' : 'bottom');
    const [csx, csy, csw, csh] = halfSrcRect(halfPage);
    if (animFromSurf) {
      ctx.globalAlpha = 1.0;
      ctx.drawImage(animFromSurf, fsx, fsy, fsw, fsh, 0, outY, w, h);
    }
    ctx.globalAlpha = 1.0;
    ctx.drawImage(currentSurf, csx, csy, csw, csh, 0, inY, w, h);
    ctx.globalAlpha = 1.0;
    ctx.filter = "none";
    return;
  }

  // ── ANIMATING (horizontal slide / page change) ───────────────────────
  if (state === "animating" && animT < 1.0) {
    const ease = easeOut(animT);
    const [csx, csy, csw, csh] = halfSrcRect(halfPage);
    if (animFromSurf) {
      const [fsx, fsy, fsw, fsh] = halfSrcRect(animFromHalf);
      ctx.globalAlpha = 1.0 - ease;
      ctx.drawImage(animFromSurf, fsx, fsy, fsw, fsh, 0, 0, w, h);
    }
    const inX = animDir * SLIDE_PX * (1.0 - ease);
    ctx.globalAlpha = ease;
    ctx.drawImage(currentSurf, csx, csy, csw, csh, inX, 0, w, h);
    ctx.globalAlpha = 1.0;
    ctx.filter = "none";
    return;
  }

  // ── IDLE ─────────────────────────────────────────────────────────────
  const [sx, sy, sw, sh] = halfSrcRect(halfPage);
  ctx.drawImage(currentSurf, sx, sy, sw, sh, 0, 0, w, h);
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
  animFromHalf = halfPage; // capture the half that was visible before this change
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

function beginHalfChange(direction: 1 | -1) {
  // direction: +1 = top→bottom, -1 = bottom→top
  cancelAll();
  animFromSurf = currentSurf; // same page, already cached
  halfPage = direction === 1 ? 'bottom' : 'top';
  // currentSurf stays the same cached bitmap; draw() clips to new halfPage
  animDir = direction;
  animMs = HALF_PAN_MS;
  state = 'half-pan';
  startTick();
  updateUI();
}

function goNext() {
  if (!pdfDoc) return;
  if (halfMode && halfPage === 'top') {
    beginHalfChange(1);
    return;
  }
  if (currentPage >= nPages - 1) return;
  if (halfMode) halfPage = 'top';
  beginPageChange(1);
}

function goPrev() {
  if (!pdfDoc) return;
  if (halfMode && halfPage === 'bottom') {
    beginHalfChange(-1);
    return;
  }
  if (currentPage <= 0) return;
  if (halfMode) halfPage = 'bottom';
  beginPageChange(-1);
}

function goFirst() {
  if (!pdfDoc) return;
  if (halfMode && halfPage !== 'top') {
    beginHalfChange(-1); // animate to top half; user presses again to jump pages
    return;
  }
  if (currentPage === 0) return;
  goToPage(0);
}

function goLast() {
  if (!pdfDoc) return;
  if (halfMode && halfPage !== 'top') {
    beginHalfChange(-1); // animate to top half; user presses again to jump pages
    return;
  }
  if (currentPage === nPages - 1) return;
  goToPage(nPages - 1);
}

async function goToPage(pageIdx: number) {
  if (!pdfDoc || pageIdx < 0 || pageIdx >= nPages || pageIdx === currentPage) return;
  animFromHalf = halfPage; // capture before halfPage is reset
  if (halfMode) halfPage = 'top';
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
  halfMode = false;
  halfPage = 'top';
  const halfBtn = document.getElementById("btn-half");
  if (halfBtn) halfBtn.classList.remove("active");
  rendering.clear();
  clearBookmarks();
  updateUI();
  draw();
}

function updateUI() {
  const disableButtons = (disabled: boolean) => {
    const buttonIds = [
      'btn-close', 'btn-first', 'btn-prev', 'btn-next', 'btn-last',
      'btn-sepia', 'btn-invert', 'btn-sharpen', 'btn-half',
      'btn-rotate-cw', 'btn-rotate-ccw', 'btn-fullscreen', 'btn-toggle-bookmarks-nav',
      'btn-add-bookmark', 'btn-width-control', 'btn-title-toggle'
    ];
    buttonIds.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) (btn as HTMLButtonElement).disabled = disabled;
    });
    const slider = document.getElementById('page-slider') as HTMLInputElement;
    if (slider) slider.disabled = disabled;
  };

  if (pdfDoc) {
    const text = `Page ${currentPage + 1} / ${nPages}`;
    pageLabel.textContent = text;
    navLabel.textContent = text;
    pageSlider.max = String(nPages - 1);
    pageSlider.value = String(currentPage);
    welcomeScreen.style.display = "none";
    document.title = `pidef`;
    disableButtons(false);
  } else {
    pageLabel.textContent = "";
    navLabel.textContent = "";
    pageSlider.max = "1";
    pageSlider.value = "0";
    welcomeScreen.style.display = "";
    disableButtons(true);
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
  renderBookmarkOverlay(); // hides the overlay if not in overlay mode

  // Show/hide bar based on display mode
  const shouldShow = pdfDoc !== null && bookmarkDisplayMode !== 'hidden';
  bar.classList.toggle("hidden", !shouldShow);

  // Apply mode-specific styling
  bar.classList.toggle("mode-1-line", bookmarkDisplayMode === '1-line');
  bar.classList.toggle("mode-all", bookmarkDisplayMode === 'all');

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

    if (bookmarkWidthMode === 's' || bookmarkWidthMode === 'm' || bookmarkWidthMode === 'l') {
      const span = document.createElement("span");
      span.innerHTML = `<strong class="pill-leading">${leading || '#'}</strong>`;
      if (bookmarkWidthMode === 'm' || bookmarkWidthMode === 'l') {
        const rest = content.substring(leading.length);
        span.innerHTML += rest;
      }
      pill.appendChild(span);
    } else {
      pill.textContent = content;
    }

    // Add segue arrow if applicable
    if (bm.segue) {
      pill.innerHTML += ' ▶';
    }

    // Double-tap to edit: first tap arms the pill, second tap opens edit modal.
    let armedTimer: ReturnType<typeof setTimeout> | null = null;
    const disarm = () => {
      pill.classList.remove("armed");
      if (armedTimer) { clearTimeout(armedTimer); armedTimer = null; }
    };
    pill.addEventListener("click", () => {
      if (pill.classList.contains("armed")) {
        disarm();
        openBookmarkEditModal(bm);
      } else {
        pill.classList.add("armed");
        armedTimer = setTimeout(disarm, 800);
        goToPage(bm.page);
      }
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
  // Stop propagation so tapping the pills panel doesn't bubble to the overlay close handler
  pillsContainer.onpointerdown = (e) => e.stopPropagation();

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
      pill.innerHTML += ' ▶';
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
  halfMode = fileRecord?.halfMode ?? false;
  halfPage = 'top';
  const halfBtn = document.getElementById("btn-half");
  if (halfBtn) halfBtn.classList.toggle("active", halfMode);

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
    dragCommitted = true;
    state = "idle";
    dragX = 0;
    dragAdjDir = 0;
    // In half mode: check if the swipe goes to the other half of this page
    if (halfMode && direction === 1 && halfPage === 'top') {
      beginHalfChange(1);
    } else if (halfMode && direction === -1 && halfPage === 'bottom') {
      beginHalfChange(-1);
    } else {
      // Page change
      const canGo =
        (direction === 1 && currentPage < nPages - 1) ||
        (direction === -1 && currentPage > 0);
      if (canGo) {
        if (halfMode) halfPage = direction === 1 ? 'top' : 'bottom';
        const adjSurf = surfCache.get(currentPage + direction) ?? null;
        beginPageChange(direction, adjSurf);
      } else {
        doDragCancel();
      }
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
      if (!pdfDoc) break;
      e.preventDefault();
      goNext();
      break;
    case "ArrowLeft":
    case "PageUp":
    case "Backspace":
      if (!pdfDoc) break;
      e.preventDefault();
      goPrev();
      break;
    case "F11":
      if (!pdfDoc) break;
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
