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
    const wasFullscreen = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const fs = win.isFullScreen();
      if (fs) win.setFullScreen(false);
      return fs;
    });
    await expect.poll(() =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()),
      { timeout: 15000 }
    ).toBe(false);
    // Allow the window manager extra time to settle after a fullscreen exit
    // before the next test issues another fullscreen request.
    if (wasFullscreen) await window.waitForTimeout(1000);
  });

  test('F11 enters fullscreen', async () => {
    await window.keyboard.press('F11');
    await expect.poll(() =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()),
      { timeout: 15000 }
    ).toBe(true);
  });

  test('Escape exits fullscreen', async () => {
    // Enter fullscreen programmatically — F11 via keyboard is unreliable on
    // Linux after a prior programmatic setFullScreen(false) in beforeEach.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true));
    await expect.poll(() =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()),
      { timeout: 15000 }
    ).toBe(true);
    // Send Escape via webContents so it reaches the DOM keydown handler
    // regardless of OS-level window focus state.
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    });
    await expect.poll(() =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()),
      { timeout: 15000 }
    ).toBe(false);
  });
});
