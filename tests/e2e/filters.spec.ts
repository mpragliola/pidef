import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

test.describe('Filters', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    app = await electron.launch({
      args: [path.resolve('dist/main.js')],
    });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    await app.close();
  });

  test('sepia button gains active class on click', async () => {
    await window.click('#btn-sepia');
    await expect(window.locator('#btn-sepia')).toHaveClass(/active/);
  });

  test('sepia button loses active class on second click', async () => {
    await window.click('#btn-sepia');
    await window.click('#btn-sepia');
    await expect(window.locator('#btn-sepia')).not.toHaveClass(/active/);
  });

  test('invert button gains active class on click', async () => {
    await window.click('#btn-invert');
    await expect(window.locator('#btn-invert')).toHaveClass(/active/);
  });

  test('invert button loses active class on second click', async () => {
    await window.click('#btn-invert');
    await window.click('#btn-invert');
    await expect(window.locator('#btn-invert')).not.toHaveClass(/active/);
  });

  test('sharpen button gains active class on click', async () => {
    await window.click('#btn-sharpen');
    await expect(window.locator('#btn-sharpen')).toHaveClass(/active/);
  });

  test('sharpen button loses active class on second click', async () => {
    await window.click('#btn-sharpen');
    await window.click('#btn-sharpen');
    await expect(window.locator('#btn-sharpen')).not.toHaveClass(/active/);
  });
});
