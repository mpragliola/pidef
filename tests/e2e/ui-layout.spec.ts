import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { generatePDF } from './fixtures/generate-pdf';

test.describe('UI Layout and Touch Targets', () => {
  let app: ElectronApplication;
  let page: Page;
  let testPdfPath: string;

  test.beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pidef-test-'));
    testPdfPath = path.join(tmpDir, 'test.pdf');
    await generatePDF(testPdfPath, 10);

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
    // Close overlay if open, and reset bookmark bar to hidden
    const overlay = page.locator('#bookmark-overlay');
    const isOverlayHidden = (await overlay.getAttribute('class') ?? '').includes('hidden');
    if (!isOverlayHidden) {
      const backdrop = page.locator('#bookmark-overlay-backdrop');
      await backdrop.click();
    }
    const bookmarkBar = page.locator('#bookmark-bar');
    while (!(await bookmarkBar.getAttribute('class') ?? '').includes('hidden')) {
      await page.click('#btn-toggle-bookmarks-nav');
      await page.waitForTimeout(50);
    }
  });

  test('all navigation buttons meet 44x44px minimum', async () => {
    const buttons = ['#btn-first', '#btn-prev', '#btn-next', '#btn-last'];

    for (const selector of buttons) {
      const button = page.locator(selector);
      const size = await button.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
      });

      expect(size.width).toBeGreaterThanOrEqual(44);
      expect(size.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('page label displays correctly', async () => {
    const navLabel = page.locator('#nav-label');
    // Should show page count
    const text = await navLabel.textContent();
    expect(text).toMatch(/Page \d+ \/ \d+/);
  });

  test('nav bar layout is horizontal', async () => {
    const navBar = page.locator('#nav-bar');
    const flexDirection = await navBar.evaluate(el => {
      return window.getComputedStyle(el).flexDirection;
    });

    expect(flexDirection).toBe('row');
  });

  test('nav-left and nav-right are separated', async () => {
    const navBar = page.locator('#nav-bar');
    const justifyContent = await navBar.evaluate(el => {
      return window.getComputedStyle(el).justifyContent;
    });

    // Should be space-between to separate left and right
    expect(['space-between', 'space-around'].includes(justifyContent)).toBe(true);
  });

  test('canvas container is visible and resizable', async () => {
    const container = page.locator('#canvas-container');
    await expect(container).toBeVisible();

    const bounds = await container.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
      };
    });

    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  });

  test('page slider is accessible', async () => {
    const slider = page.locator('#page-slider');
    await expect(slider).toBeVisible();

    const sliderAttrs = await slider.evaluate(el => ({
      min: el.getAttribute('min'),
      max: el.getAttribute('max'),
      value: el.getAttribute('value'),
    }));

    expect(sliderAttrs.min).toBe('0');
    expect(parseInt(sliderAttrs.max!)).toBeGreaterThan(0);
    expect(sliderAttrs.value).toBeDefined();
  });

  test('toolbar buttons have minimum touch size', async () => {
    const toolbarButtons = [
      '#btn-open',
      '#btn-close',
      '#btn-rotate-ccw',
      '#btn-rotate-cw',
    ];

    for (const selector of toolbarButtons) {
      const button = page.locator(selector);
      const size = await button.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
      });

      expect(size.width).toBeGreaterThanOrEqual(44);
      expect(size.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('no small hover-dependent UI elements', async () => {
    // Verify all interactive elements are touch-friendly
    const allButtons = page.locator('button');
    const count = await allButtons.count();

    for (let i = 0; i < count; i++) {
      const button = allButtons.nth(i);
      const size = await button.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return {
          width: Math.ceil(rect.width),
          height: Math.ceil(rect.height),
          visible: rect.width > 0 && rect.height > 0,
        };
      });

      // All visible buttons should be at least 40x40 (preferably 44+)
      if (size.visible) {
        expect(size.width).toBeGreaterThanOrEqual(40);
        expect(size.height).toBeGreaterThanOrEqual(40);
      }
    }
  });

  test('overlay panel styling', async () => {
    // Show bookmarks and enter overlay
    const bookmarkBtn = page.locator('#btn-toggle-bookmarks-nav');
    await bookmarkBtn.click();
    await bookmarkBtn.dispatchEvent('pointerdown');
    await page.waitForTimeout(600);
    await bookmarkBtn.dispatchEvent('pointerup');

    const overlayPills = page.locator('#bookmark-overlay-pills');
    const style = await overlayPills.evaluate(el => ({
      position: window.getComputedStyle(el).position,
      zIndex: window.getComputedStyle(el).zIndex,
      width: window.getComputedStyle(el).width,
    }));

    expect(style.position).toBe('fixed');
    expect(parseInt(style.zIndex)).toBeGreaterThan(0);
    expect(style.width).toBe('200px');
  });

  test('overlay backdrop is modal (blocks interaction)', async () => {
    const bookmarkBtn = page.locator('#btn-toggle-bookmarks-nav');
    await bookmarkBtn.click();
    await bookmarkBtn.dispatchEvent('pointerdown');
    await page.waitForTimeout(600);
    await bookmarkBtn.dispatchEvent('pointerup');

    const backdrop = page.locator('#bookmark-overlay-backdrop');
    const pointerEvents = await backdrop.evaluate(el => {
      return window.getComputedStyle(el).pointerEvents;
    });

    expect(pointerEvents).toBe('auto');
  });
});
