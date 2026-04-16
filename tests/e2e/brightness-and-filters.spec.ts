import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { generatePDF } from './fixtures/generate-pdf';

test.describe('Brightness and Filter Controls', () => {
  let app: ElectronApplication;
  let window: Page;
  let testPdfPath: string;

  test.beforeEach(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pidef-test-'));
    testPdfPath = path.join(tmpDir, 'test.pdf');
    await generatePDF(testPdfPath, 3);

    app = await electron.launch({
      args: [path.resolve('dist/main.js'), testPdfPath],
    });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    await app.close();
    if (fs.existsSync(testPdfPath)) {
      fs.unlinkSync(testPdfPath);
    }
  });

  test('sepia button toggles sepia filter', async () => {
    const sepiaBtn = window.locator('#btn-sepia');
    const canvas = window.locator('#pdf-canvas');

    // Initially no active class
    await expect(sepiaBtn).not.toHaveClass(/active/);

    // Click to enable
    await sepiaBtn.click();
    await expect(sepiaBtn).toHaveClass(/active/);

    // Click to disable
    await sepiaBtn.click();
    await expect(sepiaBtn).not.toHaveClass(/active/);
  });

  test('invert button toggles invert filter', async () => {
    const invertBtn = window.locator('#btn-invert');

    await expect(invertBtn).not.toHaveClass(/active/);

    await invertBtn.click();
    await expect(invertBtn).toHaveClass(/active/);

    await invertBtn.click();
    await expect(invertBtn).not.toHaveClass(/active/);
  });

  test('sharpen button toggles sharpen filter', async () => {
    const sharpenBtn = window.locator('#btn-sharpen');

    await expect(sharpenBtn).not.toHaveClass(/active/);

    await sharpenBtn.click();
    await expect(sharpenBtn).toHaveClass(/active/);

    await sharpenBtn.click();
    await expect(sharpenBtn).not.toHaveClass(/active/);
  });

  test('multiple filters can be active simultaneously', async () => {
    const sepiaBtn = window.locator('#btn-sepia');
    const invertBtn = window.locator('#btn-invert');
    const sharpenBtn = window.locator('#btn-sharpen');

    // Enable all three
    await sepiaBtn.click();
    await invertBtn.click();
    await sharpenBtn.click();

    // All should be active
    await expect(sepiaBtn).toHaveClass(/active/);
    await expect(invertBtn).toHaveClass(/active/);
    await expect(sharpenBtn).toHaveClass(/active/);

    // Disable sepia
    await sepiaBtn.click();

    // Invert and sharpen still active
    await expect(sepiaBtn).not.toHaveClass(/active/);
    await expect(invertBtn).toHaveClass(/active/);
    await expect(sharpenBtn).toHaveClass(/active/);
  });

  test('brightness controls are accessible', async () => {
    const brightnessHud = window.locator('#brightness-hud');
    await expect(brightnessHud).toBeVisible();
  });

  test('filter buttons have proper touch target sizes', async () => {
    const sepiaBtn = window.locator('#btn-sepia');

    const size = await sepiaBtn.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
      };
    });

    // Should be at least 44x44px for touch
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
  });
});
