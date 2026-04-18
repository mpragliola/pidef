import { _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_PDF = path.join(ROOT, 'docs/fixtures/bach-cello-suite-1-bwv1007.pdf');
const OUT_DIR = path.join(ROOT, 'docs/screenshots');
const DIST_MAIN = path.join(ROOT, 'dist/main.js');
const SETTLE_MS = 400;

fs.mkdirSync(OUT_DIR, { recursive: true });

if (!fs.existsSync(FIXTURE_PDF)) {
  console.error(`Fixture PDF not found: ${FIXTURE_PDF}`);
  process.exit(1);
}

async function launch(args: string[] = []): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ args: [DIST_MAIN, ...args] });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(1280, 800);
  });
  return { app, page };
}

async function openPdf(app: ElectronApplication, page: Page, filePath: string): Promise<void> {
  await app.evaluate(({ BrowserWindow }, fp) => {
    BrowserWindow.getAllWindows()[0].webContents.send('open-file', fp);
  }, filePath);
  await page.waitForSelector('#nav-label', { timeout: 15000 });
  await page.waitForFunction(
    () => /Page \d+ \/ \d+/.test(document.querySelector('#nav-label')?.textContent ?? ''),
    { timeout: 15000 }
  );
}

async function shot(page: Page, filename: string): Promise<void> {
  await page.waitForTimeout(SETTLE_MS);
  await page.screenshot({ path: path.join(OUT_DIR, filename) });
  console.log(`  ✓ ${filename}`);
}

async function captureWelcome(): Promise<void> {
  console.log('Instance 1: welcome screen');
  const { app, page } = await launch();
  try {
    await page.waitForSelector('#welcome-screen', { timeout: 10000 });
    await shot(page, '01-welcome.png');
  } finally {
    await app.close();
  }
}

async function capturePdfStates(): Promise<void> {
  console.log('Instance 2: PDF states');
  const { app, page } = await launch([FIXTURE_PDF]);
  try {
    await page.waitForFunction(
      () => /Page \d+ \/ \d+/.test(document.querySelector('#nav-label')?.textContent ?? ''),
      { timeout: 15000 }
    );

    // 02 — normal PDF view
    await shot(page, '02-pdf-open.png');

    // 03 — half-mode (left half)
    await page.click('#btn-half');
    await shot(page, '03-half-mode.png');
    // Exit half-mode
    await page.click('#btn-half');
    await page.waitForTimeout(SETTLE_MS);

    // 04 — bookmark bar with one bookmark
    await page.click('#btn-add-bookmark');
    await page.waitForTimeout(200);
    await page.click('#btn-toggle-bookmarks-nav'); // hidden → 1-line mode
    await shot(page, '04-bookmarks-bar.png');

    // 05 — bookmark overlay (long press on bookmark button)
    const btn = page.locator('#btn-toggle-bookmarks-nav');
    const box = await btn.boundingBox();
    if (!box) throw new Error('#btn-toggle-bookmarks-nav not found');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    await shot(page, '05-bookmarks-overlay.png');
    // Close overlay
    await page.click('#bookmark-overlay-backdrop');
    await page.waitForTimeout(SETTLE_MS);

    // 06 — fullscreen
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true));
    await page.waitForFunction(
      () => document.body.classList.contains('fullscreen') ||
            window.outerHeight === window.screen.height,
      { timeout: 10000 }
    );
    await shot(page, '06-fullscreen.png');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false));
    await page.waitForTimeout(1000);

    // 07 — rotated 90° CW
    await page.click('#btn-rotate-cw');
    await shot(page, '07-rotated-90.png');
    // Restore rotation
    await page.click('#btn-rotate-ccw');
  } finally {
    await app.close();
  }
}

async function captureRecentFiles(): Promise<void> {
  console.log('Instance 3: populate recent files history');
  const { app, page } = await launch();
  try {
    await openPdf(app, page, FIXTURE_PDF);
  } finally {
    await app.close();
  }

  console.log('Instance 4: recent files on welcome screen');
  const { app: app2, page: page2 } = await launch();
  try {
    await page2.waitForSelector('#welcome-screen', { timeout: 10000 });
    await page2.waitForSelector('#recent-files-list li', { timeout: 10000 });
    await shot(page2, '08-recent-files.png');
  } finally {
    await app2.close();
  }
}

(async () => {
  console.log('Taking screenshots...');
  await captureWelcome();
  await capturePdfStates();
  await captureRecentFiles();
  console.log(`Done. Screenshots saved to docs/screenshots/`);
})();
