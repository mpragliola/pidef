import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

test.describe('Fullscreen', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeAll(async () => {
    app = await electron.launch({
      args: [path.resolve('dist/main.js')],
    });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    await app.close();
  });

  test.beforeEach(async () => {
    // Ensure we start each test in non-fullscreen state
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win.isFullScreen()) win.setFullScreen(false);
    });
    await expect.poll(() =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())
    ).toBe(false);
  });

  test('F11 enters fullscreen', async () => {
    await window.keyboard.press('F11');
    await expect.poll(() =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()),
      { timeout: 15000 }
    ).toBe(true);
  });

  test('Escape exits fullscreen', async () => {
    await window.keyboard.press('F11');
    await expect.poll(() =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()),
      { timeout: 15000 }
    ).toBe(true);
    await window.keyboard.press('Escape');
    await expect.poll(() =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()),
      { timeout: 15000 }
    ).toBe(false);
  });
});
