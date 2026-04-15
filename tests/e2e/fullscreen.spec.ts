import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

test.describe('Fullscreen', () => {
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
    // Ensure we exit fullscreen before closing so the window tears down cleanly
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win.isFullScreen()) win.setFullScreen(false);
    });
    await app.close();
  });

  test('F11 enters fullscreen', async () => {
    await window.keyboard.press('F11');
    // Give the IPC round-trip and OS fullscreen animation time to complete
    await window.waitForTimeout(1000);
    const isFullscreen = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isFullScreen()
    );
    expect(isFullscreen).toBe(true);
  });

  test('Escape exits fullscreen', async () => {
    await window.keyboard.press('F11');
    await window.waitForTimeout(1000);
    await window.keyboard.press('Escape');
    await window.waitForTimeout(1000);
    const isFullscreen = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isFullScreen()
    );
    expect(isFullscreen).toBe(false);
  });
});
