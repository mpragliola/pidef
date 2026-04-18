import { _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_PDF = path.join(ROOT, 'docs/fixtures/bach-cello-suite-1-bwv1007.pdf');
const OUT_DIR = path.join(ROOT, 'docs/screenshots');
const DIST_MAIN = path.join(ROOT, 'dist/main.js');
const SETTLE_MS = 400;

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
  const app = await electron.launch({ args: [DIST_MAIN, ...args] });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(1280, 800);
  });
  // Reset all persisted UI state so every instance starts at known defaults
  await page.evaluate(() => {
    localStorage.setItem('pidef-rotation', '0');
    localStorage.setItem('pidef-sepia', 'false');
    localStorage.setItem('pidef-invert', 'false');
    localStorage.setItem('pidef-bookmark-display-mode', '"hidden"');
    localStorage.removeItem('pidef-brightness');
  });
  // Force a reload so the reset values are picked up by React state
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

async function waitForPdf(page: Page): Promise<void> {
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

async function longPress(page: Page, selector: string): Promise<void> {
  const btn = page.locator(selector);
  const box = await btn.boundingBox();
  if (!box) throw new Error(`${selector} not found`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
}

async function seedRecentFiles(): Promise<void> {
  console.log('Seeding fake recent files...');
  const { app } = await launch();
  try {
    const userDataPath = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'));
    const fakeRecentFiles = [
      { path: '/home/user/Music/beethoven-sonata-op27.pdf', page: 3 },
      { path: '/home/user/Documents/bach-invention-no1.pdf', page: 0 },
      { path: '/home/user/Music/chopin-nocturne-op9.pdf', page: 1 },
    ];
    fs.writeFileSync(
      path.join(userDataPath, 'recent-files.json'),
      JSON.stringify(fakeRecentFiles, null, 2)
    );
  } finally {
    await app.close();
  }
}

async function captureWelcome(): Promise<void> {
  console.log('Instance: welcome screen');
  const { app, page } = await launch();
  try {
    await page.waitForSelector('#welcome-screen', { timeout: 10000 });
    // Wait for the IPC bridge and React effect to populate the recent files list
    await page.waitForFunction(
      () => document.querySelectorAll('#recent-files-list li').length > 0,
      { timeout: 15000 }
    );
    await shot(page, '01-welcome.png');
  } finally {
    await app.close();
  }
}

async function capturePdfStates(): Promise<void> {
  console.log('Instance: PDF states');
  const { app, page } = await launch([FIXTURE_PDF]);
  try {
    await waitForPdf(page);

    // 02 — normal PDF view
    await shot(page, '02-pdf-open.png');

    // 03 — half-mode
    await page.click('#btn-half');
    await shot(page, '03-half-mode.png');
    await page.click('#btn-half'); // exit half-mode
    await page.waitForTimeout(SETTLE_MS);

    // Add bookmarks on pages 1, 2, 3 — bookmark bar must be shown first
    await page.click('#btn-toggle-bookmarks-nav'); // hidden → 1-line
    await page.click('#btn-add-bookmark'); // bookmark page 1
    await page.waitForTimeout(200);
    await page.click('#btn-next');
    await page.waitForTimeout(300);
    await page.click('#btn-add-bookmark'); // bookmark page 2
    await page.waitForTimeout(200);
    await page.click('#btn-next');
    await page.waitForTimeout(300);
    await page.click('#btn-add-bookmark'); // bookmark page 3
    await page.waitForTimeout(200);
    await page.click('#btn-first');
    await page.waitForTimeout(300);

    // 04 — bookmark bar 1-line mode (already in 1-line)
    await shot(page, '04-bookmarks-1line.png');

    // 05 — bookmark bar all mode
    await page.click('#btn-toggle-bookmarks-nav'); // 1-line → all
    await shot(page, '05-bookmarks-all.png');

    // 06 — bookmark overlay (long press)
    await longPress(page, '#btn-toggle-bookmarks-nav');
    await shot(page, '06-bookmarks-overlay.png');
    await page.click('#bookmark-overlay-backdrop');
    await page.waitForTimeout(SETTLE_MS);

    // 07 — sepia filter
    await page.click('#btn-sepia');
    await shot(page, '07-sepia.png');
    await page.click('#btn-sepia'); // turn sepia off

    // 08 — invert filter
    await page.click('#btn-invert');
    await shot(page, '08-invert.png');
    await page.click('#btn-invert'); // turn invert off

    // 09 — rotated 90° CW
    await page.click('#btn-rotate-cw');
    await shot(page, '09-rotated.png');
    await page.click('#btn-rotate-ccw'); // restore
  } finally {
    await app.close();
  }
}

(async () => {
  console.log('Taking screenshots...');
  await seedRecentFiles();
  await captureWelcome();
  await capturePdfStates();
  console.log('Done. Screenshots saved to docs/screenshots/');
})();
