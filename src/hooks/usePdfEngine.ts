/**
 * src/hooks/usePdfEngine.ts
 *
 * The core PDF engine hook. This is the most complex piece of the React
 * refactor — it owns:
 *
 *   - The RAF (requestAnimationFrame) animation loop
 *   - Pointer event handling (drag / snap / tap zones / brightness)
 *   - Keyboard navigation
 *   - PDF page rendering via pdfjs-dist to OffscreenCanvas / ImageBitmap
 *   - Canvas resizing via ResizeObserver
 *   - The 5-state animation machine:
 *       idle | dragging | snap | animating | half-pan
 *
 * ## Stale-closure strategy
 *
 * All hot-path state (animation progress, drag offsets, cached bitmaps, RAF
 * handle, …) lives in `useRef` so mutations never trigger React re-renders.
 *
 * The context value (`ctx`) is mirrored into `ctxRef` on every render.
 * Because RAF callbacks, pointer handlers, and ResizeObserver callbacks are
 * created once (in mount effects with empty dep-arrays), they would otherwise
 * close over a permanently stale `ctx`. Reading `ctxRef.current` inside those
 * callbacks always yields the *current* context value.
 *
 * ## Animation trigger strategy
 *
 * Navigation actions (goNext, goPrev, goToPage) are called on `ctxRef.current`
 * rather than being managed locally. This updates React state in AppProvider,
 * causes a re-render, and updates `ctxRef.current` — the `useEffect` that
 * watches `ctx.currentPage` / `ctx.halfMode` then drives the canvas update.
 *
 * To avoid double-rendering when `beginPageChange` has already fetched and
 * painted the bitmap, we track the last page we already handled in
 * `lastHandledPageRef`. The page-change effect skips re-rendering for pages
 * already painted by `beginPageChange`.
 *
 * ## Rotation model
 *
 * CSS `transform: rotate()` is applied to `<body>` by AppProvider.  The canvas
 * surface is always unrotated — renderPage, draw(), and all clip-rect maths are
 * completely rotation-unaware. Pointer deltas are remapped through
 * `toVisualDx` / `toVisualDy` before any drag logic.
 */

import { useRef, useEffect } from 'react';
import { easeOut } from '../lib/easing';
import {
  halfSrcRect,
  toVisualDx,
  toVisualDy,
  isInBrightnessZone,
  visualXFrac,
} from '../lib/pdf-geometry';
import type { AppContextValue } from '../AppContext';

// ── Tunables ─────────────────────────────────────────────────────────────────

const ANIM_MS = 120;
const SNAP_MS = 80;
const THRESHOLD_PX = 40;
const SLIDE_PX = 40;
const PRERENDER_FWD = 2;
const HALF_PAN_MS = 100;

const BRIGHTNESS_MIN = 0.1;
const BRIGHTNESS_MAX = 1.0;
const BRIGHTNESS_PX_PER_UNIT = 200;

const TAP_ZONE = 0.30;      // fraction of visual width that counts as a border tap
const TAP_MAX_MOVE = 15;    // px; more than this is a drag, not a tap

// ── Animation state type ─────────────────────────────────────────────────────

type AnimState = 'idle' | 'dragging' | 'snap' | 'animating' | 'half-pan';

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * usePdfEngine — wires up the canvas, RAF loop, pointer/keyboard input,
 * and PDF rendering for the main reading surface.
 *
 * @param ctx                  Current AppContextValue (updated every render).
 * @param onBrightnessHudChange Callback the hook calls to show/hide the
 *                              brightness HUD element. The caller (PdfCanvas)
 *                              manages the DOM element directly to avoid
 *                              triggering React re-renders on every drag tick.
 * @returns                    { canvasRef } — attach to the <canvas> element.
 */
export function usePdfEngine(
  ctx: AppContextValue,
  onBrightnessHudChange: (visible: boolean) => void,
): { canvasRef: React.RefObject<HTMLCanvasElement> } {

  // ── Canvas ref ─────────────────────────────────────────────────────────────

  const canvasRef = useRef<HTMLCanvasElement>(null!);

  // ── ctxRef: mirrors the current AppContextValue without triggering effects ──
  //
  // Every RAF callback, pointer handler, and ResizeObserver callback reads from
  // ctxRef.current instead of from `ctx` directly. Because all those callbacks
  // are created once (empty dep-array effects), they would otherwise see a
  // permanently stale `ctx`. ctxRef is assigned synchronously during render so
  // it is always up-to-date by the time any callback fires.

  const ctxRef = useRef<AppContextValue>(ctx);
  ctxRef.current = ctx; // synchronous, no re-render

  // ── Hot-path animation refs ─────────────────────────────────────────────────
  //
  // None of these trigger React re-renders. They are mutated freely during
  // the RAF loop and pointer events.

  /** Current animation state machine state. */
  const animState = useRef<AnimState>('idle');

  /** Visual drag offset in CSS pixels. Positive = page dragged rightward. */
  const dragX = useRef(0);

  /**
   * Direction of the adjacent page shown while dragging.
   * +1 = next page peeks in from right, -1 = prev page peeks from left, 0 = none.
   */
  const dragAdjDir = useRef(0);

  /**
   * Whether the current pointer gesture has already triggered a page/half change.
   * Prevents double-commits on fast drags.
   */
  const dragCommitted = useRef(false);

  /** X offset at the moment the drag was released (used for snap-back). */
  const snapFromX = useRef(0);

  /** Linear animation progress [0, 1]. Driven by onTick. */
  const animT = useRef(1.0);

  /** Timestamp of the first RAF frame for the current animation. */
  const animStartTime = useRef<number | null>(null);

  /** Duration of the current animation in milliseconds. */
  const animMs = useRef(ANIM_MS);

  /** +1 = animating forward (next), -1 = animating backward (prev). */
  const animDir = useRef(1);

  /** Handle returned by requestAnimationFrame, or null when not running. */
  const rafId = useRef<number | null>(null);

  // ── Surface cache ──────────────────────────────────────────────────────────
  //
  // Pre-rendered page bitmaps keyed by zero-based page index. Invalidated
  // whenever the canvas size or halfMode changes.

  /** Map from page index → pre-rendered ImageBitmap. */
  const surfCache = useRef(new Map<number, ImageBitmap>());

  /**
   * Set of page indices currently being rendered in the background.
   * Prevents concurrent duplicate renders for the same page.
   */
  const rendering = useRef(new Set<number>());

  /**
   * Canvas CSS-pixel width at which the cache was built.
   * If this changes, the cache is invalidated and all pages are re-rendered.
   */
  const cacheWidth = useRef(0);

  /**
   * Canvas CSS-pixel height at which the cache was built.
   * Same invalidation logic as cacheWidth.
   */
  const cacheHeight = useRef(0);

  /** The ImageBitmap currently displayed (the "current page" surface). */
  const currentSurf = useRef<ImageBitmap | null>(null);

  /** The ImageBitmap that was showing before a page-change animation began. */
  const animFromSurf = useRef<ImageBitmap | null>(null);

  /**
   * Which logical half ('top' | 'bottom') was visible before the current
   * page-change animation began. Used to cross-fade from the correct half.
   */
  const animFromHalf = useRef<'top' | 'bottom'>('top');

  // ── Local halfPage ref ─────────────────────────────────────────────────────
  //
  // AppContextValue has no setHalfPage action — halfPage is a derived side-
  // effect of goNext/goPrev/goToPage. The engine drives halfPage locally for
  // zero-latency animation, then calls ctxRef.current.goNext()/goPrev() to
  // keep AppProvider in sync.
  //
  // This ref is initialized from ctx.halfPage when a new file loads and is
  // updated immediately in beginHalfChange / swipe commits.

  const halfPageRef = useRef<'top' | 'bottom'>('top');

  // ── lastHandledPageRef ─────────────────────────────────────────────────────
  //
  // When beginPageChange fetches and paints a new page, it records the target
  // page here. The ctx.currentPage effect checks this ref and skips re-
  // rendering when the page has already been handled — preventing a double-draw.

  const lastHandledPageRef = useRef<number>(-1);

  // ── Brightness drag state ──────────────────────────────────────────────────

  /** True while the user is dragging inside the brightness zone. */
  const inBrightnessDrag = useRef(false);

  /** Brightness value at the moment the brightness drag started. */
  const brightnessAtDragStart = useRef(1.0);

  /** Timer handle for auto-hiding the brightness HUD after release. */
  const brightnessHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Pointer state ──────────────────────────────────────────────────────────

  /** True from pointerdown to pointerup/cancel. */
  const pointerDown = useRef(false);

  /** clientX at the moment the pointer went down. */
  const pointerStartX = useRef(0);

  /** clientY at the moment the pointer went down. */
  const pointerStartY = useRef(0);

  // ── onBrightnessHudChange ref ──────────────────────────────────────────────
  //
  // Wrap the callback in a ref so that pointer handlers (created once) always
  // call the latest version without needing it in their dep-array.

  const onBrightnessHudChangeRef = useRef(onBrightnessHudChange);
  onBrightnessHudChangeRef.current = onBrightnessHudChange;

  // ═══════════════════════════════════════════════════════════════════════════
  // § draw() — blit the correct portion of the current surface onto the canvas
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Called by the RAF tick and also directly after cache/surface updates.
  // Reads all state from refs to stay synchronous with the latest values.
  //
  // Filter string is assembled inline from ctxRef to avoid stale closures.

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const w = cacheWidth.current;
    const h = cacheHeight.current;

    // Dark background — always painted even when no PDF is loaded.
    context.fillStyle = '#212121';
    context.fillRect(0, 0, w, h);

    // Nothing more to draw if no document is open or no surface is ready.
    if (!ctxRef.current.pdfDoc || !currentSurf.current) return;

    // Build the CSS filter string from context flags.
    // Filters are applied at draw time so they don't need to be baked into
    // cached bitmaps — toggling sepia/invert is instant.
    const filterParts: string[] = [];
    if (ctxRef.current.sepiaEnabled) filterParts.push('sepia(0.8) brightness(0.6) saturate(0.7)');
    if (ctxRef.current.invertEnabled) filterParts.push('invert(1)');
    const filterStr = filterParts.join(' ');
    context.filter = filterStr || 'none';

    const hp = halfPageRef.current;
    const hm = ctxRef.current.halfMode;

    // ── DRAGGING / SNAP ──────────────────────────────────────────────────────
    if (animState.current === 'dragging' || animState.current === 'snap') {
      const [sx, sy, sw, sh] = halfSrcRect(hp, hm, cacheWidth.current, cacheHeight.current);
      context.drawImage(currentSurf.current, sx, sy, sw, sh, dragX.current, 0, w, h);

      if (dragAdjDir.current !== 0) {
        // Show the adjacent page peeking in from the side opposite to the drag.
        const adjPage = ctxRef.current.currentPage + dragAdjDir.current;
        const adjSurf = surfCache.current.get(adjPage);
        if (adjSurf) {
          // Adjacent page shows its leading half (top when going forward,
          // bottom when going backward).
          const adjHalf: 'top' | 'bottom' = hm
            ? (dragAdjDir.current === 1 ? 'top' : 'bottom')
            : 'top';
          const [asx, asy, asw, ash] = halfSrcRect(adjHalf, hm, cacheWidth.current, cacheHeight.current);
          context.drawImage(
            adjSurf, asx, asy, asw, ash,
            dragAdjDir.current * w + dragX.current, 0, w, h,
          );
        }
      }

      context.filter = 'none';
      return;
    }

    // ── HALF-PAN (vertical slide between halves of the same page) ────────────
    if (animState.current === 'half-pan' && animT.current < 1.0) {
      const ease = easeOut(animT.current);
      // animDir +1 = top→bottom (pan upward on screen)
      // animDir -1 = bottom→top (pan downward on screen)
      const outY = -animDir.current * ease * h;
      const inY  =  animDir.current * (1.0 - ease) * h;

      // The "from" half is the half that was visible before the change.
      const fromHalf: 'top' | 'bottom' = animDir.current === 1 ? 'top' : 'bottom';
      const [fsx, fsy, fsw, fsh] = halfSrcRect(fromHalf, hm, cacheWidth.current, cacheHeight.current);
      const [csx, csy, csw, csh] = halfSrcRect(hp, hm, cacheWidth.current, cacheHeight.current);

      if (animFromSurf.current) {
        context.globalAlpha = 1.0;
        context.drawImage(animFromSurf.current, fsx, fsy, fsw, fsh, 0, outY, w, h);
      }
      context.globalAlpha = 1.0;
      context.drawImage(currentSurf.current, csx, csy, csw, csh, 0, inY, w, h);
      context.globalAlpha = 1.0;
      context.filter = 'none';
      return;
    }

    // ── ANIMATING (horizontal slide / page change) ───────────────────────────
    if (animState.current === 'animating' && animT.current < 1.0) {
      const ease = easeOut(animT.current);
      const [csx, csy, csw, csh] = halfSrcRect(hp, hm, cacheWidth.current, cacheHeight.current);

      if (animFromSurf.current) {
        const [fsx, fsy, fsw, fsh] = halfSrcRect(animFromHalf.current, hm, cacheWidth.current, cacheHeight.current);
        context.globalAlpha = 1.0 - ease;
        context.drawImage(animFromSurf.current, fsx, fsy, fsw, fsh, 0, 0, w, h);
      }

      // Incoming page slides in slightly from the direction of travel.
      const inX = animDir.current * SLIDE_PX * (1.0 - ease);
      context.globalAlpha = ease;
      context.drawImage(currentSurf.current, csx, csy, csw, csh, inX, 0, w, h);
      context.globalAlpha = 1.0;
      context.filter = 'none';
      return;
    }

    // ── IDLE ─────────────────────────────────────────────────────────────────
    const [sx, sy, sw, sh] = halfSrcRect(hp, hm, cacheWidth.current, cacheHeight.current);
    context.drawImage(currentSurf.current, sx, sy, sw, sh, 0, 0, w, h);
    context.filter = 'none';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § RAF tick loop
  // ═══════════════════════════════════════════════════════════════════════════

  /** Advance animation by one frame. */
  function onTick(timestamp: number) {
    if (animStartTime.current === null) animStartTime.current = timestamp;
    const elapsed = timestamp - animStartTime.current;
    const t = Math.min(1.0, elapsed / animMs.current);
    animT.current = t;

    // Snap-back: interpolate dragX back to 0.
    if (animState.current === 'snap') {
      dragX.current = snapFromX.current * (1.0 - easeOut(t));
    }

    draw();

    if (t >= 1.0) {
      // Animation complete — clean up.
      rafId.current = null;
      if (animState.current === 'snap') {
        dragX.current = 0;
        dragAdjDir.current = 0;
      } else if (animState.current === 'animating') {
        animFromSurf.current = null;
      }
      animT.current = 1.0;
      animState.current = 'idle';
      return;
    }

    rafId.current = requestAnimationFrame(onTick);
  }

  /** Start (or restart) the RAF tick from t=0. */
  function startTick() {
    animT.current = 0.0;
    animStartTime.current = null;
    if (rafId.current === null) {
      rafId.current = requestAnimationFrame(onTick);
    }
  }

  /**
   * Immediately cancel any running animation and reset all animation/drag state
   * to idle. Call this before beginning a new gesture or jump navigation.
   */
  function cancelAll() {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    animT.current = 1.0;
    animStartTime.current = null;
    animState.current = 'idle';
    dragX.current = 0;
    dragAdjDir.current = 0;
    animFromSurf.current = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § PDF rendering
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Render a single PDF page to an ImageBitmap at the given CSS-pixel dimensions.
   *
   * In half-mode the OffscreenCanvas is drawn at double height so that the
   * top/bottom halves can be blitted individually by draw().
   *
   * Uses CJS require() — intentional for Electron renderer with nodeIntegration.
   */
  async function renderPage(
    pageIdx: number,
    w: number,
    h: number,
  ): Promise<ImageBitmap> {
    const { pdfDoc } = ctxRef.current;
    if (!pdfDoc) throw new Error('renderPage called with no pdfDoc');

    const page = await pdfDoc.getPage(pageIdx + 1); // pdfjs is 1-indexed
    const viewport = page.getViewport({ scale: 1 });

    // In half-mode, double the surface height so both halves fit. Rotation is a
    // CSS transform on <body> — the surface is always unrotated.
    const surfW = w;
    const surfH = ctxRef.current.halfMode ? h * 2 : h;

    const scale = Math.min(surfW / viewport.width, surfH / viewport.height);
    const sw = viewport.width  * scale;
    const sh = viewport.height * scale;
    const cx = (surfW - sw) / 2;
    const cy = (surfH - sh) / 2;

    const offscreen = new OffscreenCanvas(surfW, surfH);
    const oc = offscreen.getContext('2d')!;

    // Dark background.
    oc.fillStyle = '#212121';
    oc.fillRect(0, 0, surfW, surfH);

    // Drop shadow.
    oc.fillStyle = 'rgba(0, 0, 0, 0.35)';
    oc.fillRect(cx + 4, cy + 4, sw, sh);

    // White page background.
    oc.fillStyle = '#ffffff';
    oc.fillRect(cx, cy, sw, sh);

    // Render the PDF content into a native-size offscreen canvas, then draw scaled.
    const renderCanvas = new OffscreenCanvas(
      Math.ceil(viewport.width * scale),
      Math.ceil(viewport.height * scale),
    );
    const renderCtx = renderCanvas.getContext('2d')!;
    await page.render({
      canvasContext: renderCtx as any,
      viewport: page.getViewport({ scale }),
    }).promise;

    oc.drawImage(renderCanvas, cx, cy);

    return createImageBitmap(offscreen);
  }

  /**
   * Fetch a cached bitmap for a page, or render it synchronously if not cached.
   * Returns null if the page index is out of range or no PDF is loaded.
   */
  async function renderPageCached(pageIdx: number): Promise<ImageBitmap | null> {
    if (!ctxRef.current.pdfDoc) return null;
    if (pageIdx < 0 || pageIdx >= ctxRef.current.nPages) return null;
    if (cacheWidth.current === 0 || cacheHeight.current === 0) return null;

    const cached = surfCache.current.get(pageIdx);
    if (cached) return cached;

    console.log(`[pidef] sync-render page ${pageIdx + 1}`);
    const bmp = await renderPage(pageIdx, cacheWidth.current, cacheHeight.current);
    surfCache.current.set(pageIdx, bmp);
    return bmp;
  }

  /**
   * Schedule background rendering for the given page indices.
   * Pages already cached or currently rendering are skipped.
   * Captures current cache dimensions so stale bitmaps are discarded if the
   * canvas is resized before rendering completes.
   */
  function prerenderAsync(...indices: number[]) {
    if (!ctxRef.current.pdfDoc) return;
    if (cacheWidth.current === 0 || cacheHeight.current === 0) return;

    const w = cacheWidth.current;
    const h = cacheHeight.current;

    for (const idx of indices) {
      if (idx < 0 || idx >= ctxRef.current.nPages) continue;
      if (surfCache.current.has(idx) || rendering.current.has(idx)) continue;

      rendering.current.add(idx);
      renderPage(idx, w, h).then((bmp) => {
        rendering.current.delete(idx);
        // Discard if the canvas has been resized since we started.
        if (cacheWidth.current === w && cacheHeight.current === h) {
          surfCache.current.set(idx, bmp);
          console.log(`[pidef] cached page ${idx + 1}`);
        }
      });
    }
  }

  /**
   * Pre-render PRERENDER_FWD pages ahead and one page behind the current page.
   * Called after every page change.
   */
  function bgScan() {
    if (!ctxRef.current.pdfDoc) return;
    const cp = ctxRef.current.currentPage;
    const fwd: number[] = [];
    for (let i = 1; i <= PRERENDER_FWD; i++) fwd.push(cp + i);
    fwd.push(cp - 1);
    prerenderAsync(...fwd);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § Canvas resizing
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Resize the canvas to match its CSS container, apply DPR scaling, and
   * invalidate the surface cache if the display dimensions have changed.
   *
   * Called by the ResizeObserver mounted in the setup effect.
   */
  function resizeCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement;
    if (!container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = window.devicePixelRatio || 1;

    // Set physical pixel dimensions on the canvas element.
    // CSS sizing (width:100%; height:100%) is handled by the stylesheet —
    // we never override canvas.style.width/height here so React's re-renders
    // can't fight us, and clientWidth/Height always reflect the true layout size.
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    // Apply DPR transform so all draw() calls use CSS pixels.
    const context = canvas.getContext('2d');
    if (context) context.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (cacheWidth.current !== w || cacheHeight.current !== h) {
      // Dimensions changed — all cached bitmaps are now the wrong size.
      cacheWidth.current  = w;
      cacheHeight.current = h;
      surfCache.current.clear();
      rendering.current.clear();
      currentSurf.current   = null;
      animFromSurf.current  = null;

      if (ctxRef.current.pdfDoc) {
        renderPage(ctxRef.current.currentPage, w, h).then((bmp) => {
          surfCache.current.set(ctxRef.current.currentPage, bmp);
          currentSurf.current = bmp;
          bgScan();
          draw();
        });
      }
    }

    draw();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § Navigation actions
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Begin a page-change animation in the given direction.
   *
   * Fetches the target page bitmap (from cache if available), sets up the
   * animation state, and triggers the RAF tick. Calls ctxRef.current.goToPage()
   * to synchronize React state; the lastHandledPageRef prevents a double-draw
   * when the ctx.currentPage effect fires afterward.
   *
   * @param direction +1 = forward, -1 = backward
   * @param adjSurf   Pre-fetched bitmap for the target page (optional).
   *                  Pass when the bitmap was already loaded (e.g. swipe drag).
   */
  async function beginPageChange(direction: number, adjSurf?: ImageBitmap | null) {
    const nextPage = ctxRef.current.currentPage + direction;
    cancelAll();
    animFromSurf.current  = currentSurf.current;
    animFromHalf.current  = halfPageRef.current; // capture half visible before change
    currentSurf.current   = adjSurf ?? (await renderPageCached(nextPage));
    animDir.current       = direction;
    animMs.current        = ANIM_MS;
    animState.current     = 'animating';
    startTick();

    // Record that we've already handled this page to suppress the effect re-draw.
    lastHandledPageRef.current = nextPage;

    // Sync React state. This triggers a re-render; the ctx.currentPage effect
    // will see lastHandledPageRef.current === nextPage and skip re-rendering.
    ctxRef.current.goToPage(nextPage);

    bgScan();
  }

  /**
   * Begin a vertical pan animation between the two halves of the current page.
   *
   * Does NOT change the page number — only halfPageRef changes.
   *
   * @param direction +1 = top→bottom (pan up), -1 = bottom→top (pan down)
   */
  function beginHalfChange(direction: 1 | -1) {
    cancelAll();
    // The surface stays the same cached bitmap; only the clip rect changes.
    animFromSurf.current = currentSurf.current;
    halfPageRef.current  = direction === 1 ? 'bottom' : 'top';
    animDir.current      = direction;
    animMs.current       = HALF_PAN_MS;
    animState.current    = 'half-pan';
    startTick();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § Drag snap-back helper
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Animate the current drag back to x=0 when released below the commit
   * threshold. If the drag was negligible (<1 px) snap instantly.
   */
  function doDragCancel() {
    if (animState.current !== 'dragging') return;
    const sx = dragX.current;
    animState.current = 'snap';
    if (Math.abs(sx) < 1.0) {
      dragX.current = 0;
      dragAdjDir.current = 0;
      animState.current = 'idle';
      draw();
      return;
    }
    snapFromX.current = sx;
    animMs.current = SNAP_MS;
    startTick();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § Brightness HUD helpers
  // ═══════════════════════════════════════════════════════════════════════════

  function scheduleBrightnessHide() {
    if (brightnessHideTimer.current) clearTimeout(brightnessHideTimer.current);
    brightnessHideTimer.current = setTimeout(() => {
      onBrightnessHudChangeRef.current(false);
    }, 1500);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § Effect: mount / unmount — attach event handlers
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── Pointer down ──────────────────────────────────────────────────────────

    function handlePointerDown(e: PointerEvent) {
      if (!ctxRef.current.pdfDoc) return;
      pointerDown.current   = true;
      dragCommitted.current = false;
      pointerStartX.current = e.clientX;
      pointerStartY.current = e.clientY;

      // Check if the pointer landed in the brightness-control zone (visual-left
      // edge strip). The helper takes CSS-pixel canvas dimensions (clientWidth /
      // clientHeight), not physical pixel dimensions (canvas.width/height).
      if (
        isInBrightnessZone(
          e.clientX, e.clientY,
          ctxRef.current.rotationSteps as 0 | 1 | 2 | 3,
          canvas.clientWidth, canvas.clientHeight,
        )
      ) {
        inBrightnessDrag.current    = true;
        brightnessAtDragStart.current = ctxRef.current.brightness;
        if (brightnessHideTimer.current) clearTimeout(brightnessHideTimer.current);
        onBrightnessHudChangeRef.current(true);
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      // Start a potential drag — enter dragging state immediately so that
      // draw() will render the drag position on the next pointermove.
      cancelAll();
      dragX.current    = 0;
      dragAdjDir.current = 0;
      animState.current = 'dragging';
      canvas.setPointerCapture(e.pointerId);
      draw();
    }

    // ── Pointer move ──────────────────────────────────────────────────────────

    function handlePointerMove(e: PointerEvent) {
      // ── Brightness drag ────────────────────────────────────────────────────
      if (inBrightnessDrag.current) {
        const screenDx = e.clientX - pointerStartX.current;
        const screenDy = e.clientY - pointerStartY.current;
        // Upward visual motion → increased brightness; negate visualDy (positive=down).
        const delta = -toVisualDy(screenDx, screenDy, ctxRef.current.rotationSteps as 0 | 1 | 2 | 3);
        const next = Math.max(
          BRIGHTNESS_MIN,
          Math.min(BRIGHTNESS_MAX, brightnessAtDragStart.current + delta / BRIGHTNESS_PX_PER_UNIT),
        );
        ctxRef.current.setBrightness(next);
        onBrightnessHudChangeRef.current(true);
        return;
      }

      if (!pointerDown.current || animState.current !== 'dragging' || dragCommitted.current) return;

      const dx = toVisualDx(
        e.clientX - pointerStartX.current,
        e.clientY - pointerStartY.current,
        ctxRef.current.rotationSteps as 0 | 1 | 2 | 3,
      );
      dragX.current = dx;

      // Update the adjacent-page hint direction based on drag direction.
      if (dx < -5)      dragAdjDir.current =  1;
      else if (dx > 5)  dragAdjDir.current = -1;
      else              dragAdjDir.current =  0;

      // ── Commit threshold ───────────────────────────────────────────────────
      if (Math.abs(dx) >= THRESHOLD_PX) {
        const direction = dx < 0 ? 1 : -1;
        dragCommitted.current = true;
        animState.current = 'idle';
        dragX.current = 0;
        dragAdjDir.current = 0;

        const { halfMode, currentPage, nPages } = ctxRef.current;
        const hp = halfPageRef.current;

        // In half-mode: check if the swipe should go to the other half.
        if (halfMode && direction === 1 && hp === 'top') {
          // Going forward on the top half → slide to the bottom half.
          beginHalfChange(1);
          // Keep AppProvider's halfPage in sync by calling goNext() which
          // internally does setHalfPage('bottom').
          ctxRef.current.goNext();
        } else if (halfMode && direction === -1 && hp === 'bottom') {
          // Going backward on the bottom half → slide back to the top half.
          beginHalfChange(-1);
          ctxRef.current.goPrev();
        } else {
          // Full page change.
          const canGo =
            (direction ===  1 && currentPage < nPages - 1) ||
            (direction === -1 && currentPage > 0);

          if (canGo) {
            // Update local halfPage immediately so beginPageChange reads the
            // correct "from half" in halfPageRef.
            if (halfMode) halfPageRef.current = direction === 1 ? 'top' : 'bottom';
            const adjSurf = surfCache.current.get(currentPage + direction) ?? null;
            beginPageChange(direction, adjSurf);
          } else {
            doDragCancel();
          }
        }
        return;
      }

      draw();
    }

    // ── Pointer up ────────────────────────────────────────────────────────────

    function handlePointerUp(e: PointerEvent) {
      if (!pointerDown.current) return;
      pointerDown.current = false;
      canvas.releasePointerCapture(e.pointerId);

      if (inBrightnessDrag.current) {
        inBrightnessDrag.current = false;
        scheduleBrightnessHide();
        return;
      }

      if (!dragCommitted.current) {
        // Measure how far the pointer moved in visual space.
        const moved = Math.abs(
          toVisualDx(
            e.clientX - pointerStartX.current,
            e.clientY - pointerStartY.current,
            ctxRef.current.rotationSteps as 0 | 1 | 2 | 3,
          ),
        );

        if (moved < TAP_MAX_MOVE) {
          // Tap — check which zone.
          const xFrac = visualXFrac(
            pointerStartX.current, pointerStartY.current,
            ctxRef.current.rotationSteps as 0 | 1 | 2 | 3,
            cacheWidth.current,
          );

          if (xFrac < TAP_ZONE) {
            // Left tap zone → previous page/half.
            cancelAll();
            // goNext/goPrev update AppProvider state; the ctx.currentPage /
            // ctx.halfPage effects drive the canvas update.
            ctxRef.current.goPrev();
            dragCommitted.current = false;
            return;
          } else if (xFrac > 1 - TAP_ZONE) {
            // Right tap zone → next page/half.
            cancelAll();
            ctxRef.current.goNext();
            dragCommitted.current = false;
            return;
          }
        }

        doDragCancel();
      }
      dragCommitted.current = false;
    }

    // ── Pointer cancel ────────────────────────────────────────────────────────

    function handlePointerCancel(e: PointerEvent) {
      if (!pointerDown.current) return;
      pointerDown.current = false;
      canvas.releasePointerCapture(e.pointerId);

      if (inBrightnessDrag.current) {
        inBrightnessDrag.current = false;
        scheduleBrightnessHide();
        return;
      }

      if (!dragCommitted.current) {
        doDragCancel();
      }
      dragCommitted.current = false;
    }

    canvas.addEventListener('pointerdown',   handlePointerDown);
    canvas.addEventListener('pointermove',   handlePointerMove);
    canvas.addEventListener('pointerup',     handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      canvas.removeEventListener('pointerdown',   handlePointerDown);
      canvas.removeEventListener('pointermove',   handlePointerMove);
      canvas.removeEventListener('pointerup',     handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, []); // created once on mount; reads ctxRef.current for live values

  // ═══════════════════════════════════════════════════════════════════════════
  // § Effect: keyboard navigation
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // F11 works WITHOUT a PDF open — no pdfDoc guard on that case.

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          if (!ctxRef.current.pdfDoc) break;
          e.preventDefault();
          ctxRef.current.goNext();
          break;
        case 'ArrowLeft':
        case 'PageUp':
        case 'Backspace':
          if (!ctxRef.current.pdfDoc) break;
          e.preventDefault();
          ctxRef.current.goPrev();
          break;
        case 'F11':
          // No pdfDoc guard — F11 works even without an open file.
          e.preventDefault();
          (window as any).pidef.toggleFullscreen();
          break;
        case 'Escape':
          (window as any).pidef.getFullscreen().then((fs: boolean) => {
            if (fs) (window as any).pidef.toggleFullscreen();
          });
          break;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []); // stable; reads ctxRef.current for live values

  // ═══════════════════════════════════════════════════════════════════════════
  // § Effect: ResizeObserver on the canvas container
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;

    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(canvas.parentElement);

    // Also listen to window resize so the canvas re-sizes when the Electron
    // window itself is dragged to a new size. ResizeObserver on the container
    // alone can miss this when the flex layout is resolved after the observer
    // fires (container reports 0 height on the first tick).
    window.addEventListener('resize', resizeCanvas);

    // Defer the initial sizing until after the first paint so the flex layout
    // has fully settled before we read clientWidth/clientHeight.
    requestAnimationFrame(resizeCanvas);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []); // stable; resizeCanvas reads ctxRef.current for live values

  // ═══════════════════════════════════════════════════════════════════════════
  // § Effect: react to PDF document / page / halfMode / filter changes
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // This effect is the bridge between React state and the canvas engine.
  // It fires whenever the PDF or display settings change.

  useEffect(() => {
    // ── pdfDoc changed ────────────────────────────────────────────────────────
    // When a new document is loaded (or closed), reset ALL engine state and
    // render the first page.

    // We detect "doc changed" by always clearing the cache when pdfDoc changes.
    // Even if it's the same object reference, a fresh clear is harmless.
    surfCache.current.clear();
    rendering.current.clear();
    currentSurf.current  = null;
    animFromSurf.current = null;
    cancelAll();

    // Reset local halfPage from context (AppProvider may have set it to 'top'
    // during loadFile).
    halfPageRef.current      = ctx.halfPage;
    lastHandledPageRef.current = -1; // reset skipped-page guard

    if (ctx.pdfDoc && cacheWidth.current > 0 && cacheHeight.current > 0) {
      renderPage(ctx.currentPage, cacheWidth.current, cacheHeight.current).then((bmp) => {
        surfCache.current.set(ctx.currentPage, bmp);
        currentSurf.current = bmp;
        bgScan();
        draw();
      });
    } else {
      draw(); // paint the dark background
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.pdfDoc]);

  useEffect(() => {
    // ── halfMode changed ──────────────────────────────────────────────────────
    // Surface height doubles in half-mode, so the entire cache is invalid.

    surfCache.current.clear();
    rendering.current.clear();
    currentSurf.current  = null;
    animFromSurf.current = null;
    halfPageRef.current  = 'top'; // reset to top half on mode change
    cancelAll();

    if (ctx.pdfDoc && cacheWidth.current > 0 && cacheHeight.current > 0) {
      renderPage(ctx.currentPage, cacheWidth.current, cacheHeight.current).then((bmp) => {
        surfCache.current.set(ctx.currentPage, bmp);
        currentSurf.current = bmp;
        bgScan();
        draw();
        canvasRef.current?.setAttribute('data-surf-ready', 'true');
      });
    } else {
      draw();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.halfMode]);

  useEffect(() => {
    // ── currentPage changed ───────────────────────────────────────────────────
    // Skip if beginPageChange already handled this page (to avoid double-draw).

    if (lastHandledPageRef.current === ctx.currentPage) {
      // Already painted by beginPageChange — just pre-render adjacent pages.
      lastHandledPageRef.current = -1;
      bgScan();
      return;
    }

    // Page changed externally (slider, bookmark tap, keyboard nav, tap zone)
    // or beginPageChange wasn't called. Fetch the bitmap and animate.
    if (!ctx.pdfDoc || cacheWidth.current === 0 || cacheHeight.current === 0) return;

    // For tap-zone and keyboard nav the context's goNext/goPrev have already
    // updated halfPage (via AppProvider). Sync local halfPageRef.
    halfPageRef.current = ctx.halfPage;

    renderPageCached(ctx.currentPage).then((bmp) => {
      if (!bmp) return;
      // Animate from the previous surface if we have one.
      if (currentSurf.current) {
        animFromSurf.current = currentSurf.current;
        animFromHalf.current = halfPageRef.current;
        // Determine direction for the slide animation.
        // We can't compare to currentPage directly (it's already updated in ctx),
        // so we rely on the existing animDir if animating, or default to forward.
        const prevPage = ctx.currentPage - 1; // best guess
        animDir.current = ctx.currentPage > prevPage ? 1 : -1;
        animMs.current  = ANIM_MS;
        animState.current = 'animating';
        currentSurf.current = bmp;
        startTick();
      } else {
        // No previous surface (e.g. initial load after resize) — jump directly.
        currentSurf.current = bmp;
        draw();
      }
      bgScan();
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.currentPage]);

  useEffect(() => {
    // ── halfPage changed ──────────────────────────────────────────────────────
    // AppProvider updated halfPage (e.g. via goNext/goPrev in tap zone).
    // If no half-pan animation is running, sync the local ref and redraw.

    halfPageRef.current = ctx.halfPage;
    if (animState.current === 'idle') {
      draw();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.halfPage]);

  useEffect(() => {
    // ── Filters changed (sepia / invert) ─────────────────────────────────────
    // Filters are applied at draw-time; no cache invalidation needed.
    draw();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.sepiaEnabled, ctx.invertEnabled]);

  // ═══════════════════════════════════════════════════════════════════════════
  // § Return
  // ═══════════════════════════════════════════════════════════════════════════

  return { canvasRef };
}
