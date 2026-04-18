import { _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_PDF = path.join(ROOT, 'docs/fixtures/bach-cello-suite-1-bwv1007.pdf');
const OUT_DIR = path.join(ROOT, 'docs/screenshots');
const DIST_MAIN = path.join(ROOT, 'dist/main.js');
const SETTLE_MS = 400;

// Isolated userData dir for this script run — never touches real user state
const TEMP_USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'pidef-screenshots-'));

if (fs.existsSync(OUT_DIR)) {
  for (const f of fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.png'))) {
    fs.unlinkSync(path.join(OUT_DIR, f));
  }
}
fs.mkdirSync(OUT_DIR, { recursive: true });

if (!fs.existsSync(FIXTURE_PDF)) {
  console.error(`Fixture PDF not found: ${FIXTURE_PDF}`);
  process.exit(1);
}

async function launch(args: string[] = []): Promise<{ app: ElectronApplication; page: Page }> {
  // --user-data-dir isolates this run from real user state (localStorage, recent-files, etc.)
  const app = await electron.launch({ args: [DIST_MAIN, `--user-data-dir=${TEMP_USER_DATA}`, ...args] });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(1280, 800);
  });
  return { app, page };
}

async function waitForPdf(page: Page): Promise<void> {
  await page.waitForFunction(
    () => /Page \d+ \/ \d+/.test(document.querySelector('#nav-label')?.textContent ?? ''),
    { timeout: 15000 }
  );
  // Wait for welcome screen to disappear (signals pdfDoc is set and canvas is active)
  await page.waitForFunction(
    () => document.querySelector('#welcome-screen') === null,
    { timeout: 10000 }
  );
  // Give the renderer one frame to paint the first page
  await page.waitForTimeout(600);
}

async function shot(page: Page, filename: string): Promise<void> {
  await page.waitForTimeout(SETTLE_MS);
  await page.screenshot({ path: path.join(OUT_DIR, filename) });
  console.log(`  ✓ ${filename}`);
}

async function shotElement(page: Page, selector: string, filename: string): Promise<void> {
  await page.waitForTimeout(SETTLE_MS);
  const el = page.locator(selector);
  await el.screenshot({ path: path.join(OUT_DIR, filename) });
  console.log(`  ✓ ${filename}`);
}

async function longPress(page: Page, selector: string): Promise<void> {
  const btn = page.locator(selector);
  const box = await btn.boundingBox();
  if (!box) throw new Error(`${selector} not found`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
}

function seedBookmarks(): void {
  // Write bookmark sidecar JSON directly — no UI interaction needed.
  // Labels use number+letter prefixes so all three width modes (s/m/l) look meaningful.
  const bookmarks = [
    { page: 0,  label: '1 — Prélude' },
    { page: 1,  label: '2 — Allemande' },
    { page: 2,  label: '3 — Courante' },
    { page: 3,  label: '4 — Sarabande' },
    { page: 4,  label: '5a — Double' },
    { page: 5,  label: '5b — Menuet I' },
    { page: 6,  label: '5c — Menuet II' },
    { page: 7,  label: '6 — Gigue' },
    { page: 8,  label: '7a — Bourée I' },
    { page: 9,  label: '7b — Bourée II' },
    { page: 10, label: '8 — Gavotte' },
    { page: 11, label: '9a — Loure' },
    { page: 12, label: '9b — Loure var.' },
    { page: 13, label: '10 — Chaconne' },
    { page: 14, label: '11a — Chac. A' },
    { page: 15, label: '11b — Chac. B' },
    { page: 16, label: '12 — Finale' },
  ];
  fs.writeFileSync(
    `${FIXTURE_PDF}.json`,
    JSON.stringify({ bookmarks }, null, 2)
  );
}

function cleanBookmarks(): void {
  const jsonPath = `${FIXTURE_PDF}.json`;
  if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
}

function seedRecentFiles(): void {
  console.log('Seeding fake recent files...');
  // Fake entries must point to real files (main process filters by fs.existsSync).
  // Create stub PDFs in a temp subdir with believable names.
  const stubDir = path.join(TEMP_USER_DATA, 'stubs');
  fs.mkdirSync(stubDir, { recursive: true });
  const stubs = [
    { name: 'beethoven-sonata-op27.pdf', page: 3 },
    { name: 'bach-invention-no1.pdf', page: 0 },
    { name: 'chopin-nocturne-op9.pdf', page: 1 },
  ];
  // Copy the fixture PDF as each stub (it's a valid PDF so the app won't choke)
  for (const stub of stubs) {
    fs.copyFileSync(FIXTURE_PDF, path.join(stubDir, stub.name));
  }
  const fakeRecentFiles = stubs.map(s => ({ path: path.join(stubDir, s.name), page: s.page }));
  fs.writeFileSync(
    path.join(TEMP_USER_DATA, 'recent-files.json'),
    JSON.stringify(fakeRecentFiles, null, 2)
  );
}

async function captureWelcome(): Promise<void> {
  console.log('Instance: welcome screen');
  const { app, page } = await launch();
  try {
    await page.waitForSelector('#welcome-screen', { timeout: 10000 });
    // Poll until IPC effect populates the recent files list
    await page.waitForFunction(
      () => document.querySelectorAll('#recent-files-list li').length > 0,
      { timeout: 10000 }
    );
    await shot(page, '01-welcome.png');
  } finally {
    await app.close();
  }
}

async function capturePdfStates(): Promise<void> {
  console.log('Instance: PDF states');
  const { app, page } = await launch();
  try {
    // Send open-file after domcontentloaded so React's IPC listener is registered
    await app.evaluate(({ BrowserWindow }, fp) => {
      BrowserWindow.getAllWindows()[0].webContents.send('open-file', fp);
    }, FIXTURE_PDF);
    await waitForPdf(page);

    // 02 — normal PDF view
    await shot(page, '02-pdf-open.png');

    // 03 — half-mode
    await page.click('#btn-half');
    await shot(page, '03-half-mode.png');
    await page.click('#btn-half'); // exit half-mode
    await page.waitForTimeout(SETTLE_MS);

    // Bookmarks seeded programmatically — show bar immediately in 1-line mode
    await page.click('#btn-toggle-bookmarks-nav'); // hidden → 1-line
    await page.waitForSelector('.bookmark-pill', { timeout: 5000 });

    // 04/05/06 — bookmark bar cropped to bar only, cycling width modes
    await shotElement(page, '#bookmark-bar', '04-bookmarks-s.png');

    await page.click('#btn-width-control'); // s → m
    await shotElement(page, '#bookmark-bar', '05-bookmarks-m.png');

    await page.click('#btn-width-control'); // m → l
    await shotElement(page, '#bookmark-bar', '06-bookmarks-l.png');

    // 07 — bookmark overlay (long press)
    await longPress(page, '#btn-toggle-bookmarks-nav');
    await shot(page, '07-bookmarks-overlay.png');
    await page.click('#bookmark-overlay-backdrop');
    await page.waitForTimeout(SETTLE_MS);

    // 08 — sepia filter
    await page.click('#btn-sepia');
    await shot(page, '08-sepia.png');
    await page.click('#btn-sepia'); // turn sepia off

    // 09 — invert filter
    await page.click('#btn-invert');
    await shot(page, '09-invert.png');
    await page.click('#btn-invert'); // turn invert off

    // 10 — rotated 90° CW
    await page.click('#btn-rotate-cw');
    await shot(page, '10-rotated.png');
    await page.click('#btn-rotate-ccw'); // restore
  } finally {
    await app.close();
  }
}

(async () => {
  console.log('Taking screenshots...');
  seedBookmarks();
  seedRecentFiles();
  await captureWelcome();
  await capturePdfStates();
  cleanBookmarks();
  fs.rmSync(TEMP_USER_DATA, { recursive: true, force: true });
  console.log('Done. Screenshots saved to docs/screenshots/');
})();
