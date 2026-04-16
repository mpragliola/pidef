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
    // Wait for the PDF to fully load before tests run
    await expect(page.locator('#nav-label')).toHaveText(/Page \d+ \/ \d+/, { timeout: 15000 });
  });

  test.afterAll(async () => {
    await app.close();
    if (fs.existsSync(testPdfPath)) {
      fs.unlinkSync(testPdfPath);
    }
  });

  test.beforeEach(async () => {
    // Close overlay if open (overlay uses null-render, not hidden class)
    const overlay = page.locator('#bookmark-overlay');
    if (await overlay.isVisible()) {
      await page.click('#bookmark-overlay-backdrop');
      await expect(overlay).not.toBeVisible();
    }
    // Cycle bookmark bar to hidden state
    const bookmarkBar = page.locator('#bookmark-bar');
    while (await bookmarkBar.isVisible()) {
      await page.click('#btn-toggle-bookmarks-nav');
      await page.waitForTimeout(50);
    }
  });

  test('bookmark bar is hidden by default', async () => {
    const bookmarkBar = page.locator('#bookmark-bar');
    await expect(bookmarkBar).not.toBeVisible();
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
    await expect(bookmarkBar).not.toBeVisible();
  });

  test('long-pressing 🔖 button enters overlay mode', async () => {
    const bookmarkButton = page.locator('#btn-toggle-bookmarks-nav');
    const box = await bookmarkButton.boundingBox();
    if (!box) throw new Error('bookmark button not found');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();

    const overlay = page.locator('#bookmark-overlay');
    await expect(overlay).toBeVisible();
  });

  test('clicking overlay backdrop closes overlay', async () => {
    const bookmarkButton = page.locator('#btn-toggle-bookmarks-nav');
    const box = await bookmarkButton.boundingBox();
    if (!box) throw new Error('bookmark button not found');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();

    const overlay = page.locator('#bookmark-overlay');
    await expect(overlay).toBeVisible();

    await page.locator('#bookmark-overlay-backdrop').click();
    await expect(overlay).not.toBeVisible();
  });

  test('overlay pill navigates to bookmarked page', async () => {
    // Navigate to page 3 and add a bookmark there
    await page.locator('#btn-toggle-bookmarks-nav').click(); // show 1-line mode
    await page.locator('#btn-next').click();
    await page.locator('#btn-next').click();
    await expect(page.locator('#nav-label')).toHaveText('Page 3 / 5');

    await page.locator('#btn-add-bookmark').click();
    const labelInput = page.locator('#bookmark-input-wrap input');
    await labelInput.fill('Test Mark');
    await labelInput.press('Enter');

    // Navigate back to page 1
    await page.locator('#btn-first').click();
    await expect(page.locator('#nav-label')).toHaveText('Page 1 / 5');

    // Long-press to open overlay
    const bookmarkButton = page.locator('#btn-toggle-bookmarks-nav');
    const box = await bookmarkButton.boundingBox();
    if (!box) throw new Error('bookmark button not found');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();

    const overlay = page.locator('#bookmark-overlay');
    await expect(overlay).toBeVisible();

    // Click the pill for 'Test Mark'
    await page.locator('.overlay-pill', { hasText: 'Test Mark' }).click();

    // Overlay closes and page jumps to 3
    await expect(overlay).not.toBeVisible();
    await expect(page.locator('#nav-label')).toHaveText('Page 3 / 5');
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
