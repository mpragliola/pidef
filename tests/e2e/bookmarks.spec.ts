import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { generatePDF } from './fixtures/generate-pdf';

test.describe('Bookmark Display Modes', () => {
  let app: ElectronApplication;
  let page: Page;
  let testPdfPath: string;

  test.beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pidef-test-'));
    testPdfPath = path.join(tmpDir, 'test.pdf');
    await generatePDF(testPdfPath, 5); // 5 page PDF

    app = await electron.launch({
      args: [path.resolve('dist/main.js'), testPdfPath],
    });
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    await app.close();
    if (fs.existsSync(testPdfPath)) {
      fs.unlinkSync(testPdfPath);
    }
  });

  test.beforeEach(async () => {
    // Ensure bookmark bar is hidden before each test by cycling to hidden state
    const bookmarkBar = page.locator('#bookmark-bar');
    while (!(await bookmarkBar.getAttribute('class') ?? '').includes('hidden')) {
      await page.click('#btn-toggle-bookmarks-nav');
    }
  });

  test('bookmark bar is hidden by default', async () => {
    const bookmarkBar = page.locator('#bookmark-bar');
    await expect(bookmarkBar).toHaveClass(/hidden/);
  });

  test('clicking 🔖 button shows 1-line mode', async () => {
    const bookmarkButton = page.locator('#btn-toggle-bookmarks-nav');
    await bookmarkButton.click();

    const bookmarkBar = page.locator('#bookmark-bar');
    await expect(bookmarkBar).not.toHaveClass(/hidden/);
    await expect(bookmarkBar).toHaveClass(/mode-1-line/);
  });

  test('clicking 🔖 again cycles to all mode', async () => {
    const bookmarkButton = page.locator('#btn-toggle-bookmarks-nav');

    // 1st click: show (1-line)
    await bookmarkButton.click();
    const bookmarkBar = page.locator('#bookmark-bar');
    await expect(bookmarkBar).toHaveClass(/mode-1-line/);

    // 2nd click: cycle to all
    await bookmarkButton.click();
    await expect(bookmarkBar).toHaveClass(/mode-all/);
  });

  test('clicking 🔖 third time hides bookmarks', async () => {
    const bookmarkButton = page.locator('#btn-toggle-bookmarks-nav');

    // Show mode
    await bookmarkButton.click();
    await bookmarkButton.click();

    // 3rd click: hide
    await bookmarkButton.click();
    const bookmarkBar = page.locator('#bookmark-bar');
    await expect(bookmarkBar).toHaveClass(/hidden/);
  });

  test('long-pressing 🔖 button enters overlay mode', async () => {
    const bookmarkButton = page.locator('#btn-toggle-bookmarks-nav');

    // Show bookmarks first
    await bookmarkButton.click();

    // Long press: 600ms (pointer down then up after 600ms)
    await bookmarkButton.dispatchEvent('pointerdown');
    await page.waitForTimeout(600);
    await bookmarkButton.dispatchEvent('pointerup');

    const overlay = page.locator('#bookmark-overlay');
    // Overlay should be visible in DOM
    const isHidden = await overlay.evaluate(el => el.classList.contains('hidden'));
    expect(isHidden).toBe(false);
  });

  test('clicking overlay backdrop closes overlay', async () => {
    const bookmarkButton = page.locator('#btn-toggle-bookmarks-nav');

    // Show and enter overlay
    await bookmarkButton.click();
    await bookmarkButton.dispatchEvent('pointerdown');
    await page.waitForTimeout(600);
    await bookmarkButton.dispatchEvent('pointerup');

    const backdrop = page.locator('#bookmark-overlay-backdrop');
    await backdrop.click();

    // Should return to previous mode
    const bookmarkBar = page.locator('#bookmark-bar');
    await expect(bookmarkBar).toHaveClass(/mode-1-line/);
  });

  test('1-line mode shows horizontal scrollbar', async () => {
    const bookmarkButton = page.locator('#btn-toggle-bookmarks-nav');
    await bookmarkButton.click();

    const pills = page.locator('#bookmark-pills');
    const computedStyle = await pills.evaluate(el => {
      const style = window.getComputedStyle(el);
      return {
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        flexWrap: style.flexWrap,
      };
    });

    expect(computedStyle.overflowX).toBe('auto');
    expect(computedStyle.overflowY).toBe('hidden');
    expect(computedStyle.flexWrap).toBe('nowrap');
  });

  test('all mode shows vertical scrollbar', async () => {
    const bookmarkButton = page.locator('#btn-toggle-bookmarks-nav');

    // Click twice to get to all mode
    await bookmarkButton.click();
    await bookmarkButton.click();

    const pills = page.locator('#bookmark-pills');
    const computedStyle = await pills.evaluate(el => {
      const style = window.getComputedStyle(el);
      return {
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        flexWrap: style.flexWrap,
      };
    });

    expect(computedStyle.overflowY).toBe('auto');
    expect(computedStyle.overflowX).toBe('hidden');
    expect(computedStyle.flexWrap).toBe('wrap');
  });

  test('add bookmark button is visible in 1-line mode', async () => {
    const bookmarkButton = page.locator('#btn-toggle-bookmarks-nav');
    await bookmarkButton.click();

    const addButton = page.locator('#btn-add-bookmark');
    await expect(addButton).toBeVisible();
  });

  test('bookmark controls display horizontally', async () => {
    const bookmarkButton = page.locator('#btn-toggle-bookmarks-nav');
    await bookmarkButton.click();

    const controls = page.locator('#bookmark-controls');
    const flexDirection = await controls.evaluate(el => {
      return window.getComputedStyle(el).flexDirection;
    });

    expect(flexDirection).toBe('row');
  });
});
