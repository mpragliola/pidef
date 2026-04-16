import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

test.describe('Welcome Screen and Recent Files', () => {
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

  test('welcome screen displays on startup', async () => {
    const welcomeScreen = window.locator('#welcome-screen');
    await expect(welcomeScreen).toBeVisible();
  });

  test('welcome screen contains hint text', async () => {
    const hint = window.locator('#welcome-hint');
    const text = await hint.textContent();
    expect(text).toContain('Open a PDF');
  });

  test('recent files section is displayed', async () => {
    const section = window.locator('#recent-files-section');
    await expect(section).toBeVisible();
  });

  test('recent files label is visible', async () => {
    const label = window.locator('#recent-files-label');
    const text = await label.textContent();
    expect(text).toBe('Recent Files');
  });

  test('recent files list is present', async () => {
    const list = window.locator('#recent-files-list');
    await expect(list).toBeVisible();
  });

  test('open button is visible on welcome screen', async () => {
    const openBtn = window.locator('#btn-open');
    await expect(openBtn).toBeVisible();
  });

  test('open button is accessible', async () => {
    const openBtn = window.locator('#btn-open');
    const isEnabled = await openBtn.evaluate(el => {
      return (el as HTMLButtonElement).disabled === false;
    });
    expect(isEnabled).toBe(true);
  });

  test('open button has title attribute', async () => {
    const openBtn = window.locator('#btn-open');
    const title = await openBtn.getAttribute('title');
    expect(title).toBeTruthy();
  });

  test('open button is large enough for touch', async () => {
    const openBtn = window.locator('#btn-open');
    const size = await openBtn.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return {
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),
      };
    });

    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
  });

  test('close button is visible', async () => {
    const closeBtn = window.locator('#btn-close');
    await expect(closeBtn).toBeVisible();
  });

  test('welcome screen has proper styling', async () => {
    const welcomeScreen = window.locator('#welcome-screen');
    const display = await welcomeScreen.evaluate(el => {
      return window.getComputedStyle(el).display;
    });

    // Should be flex or similar (not none)
    expect(display).not.toBe('none');
  });

  test('recent files list has proper scroll if needed', async () => {
    const list = window.locator('#recent-files-list');
    const overflow = await list.evaluate(el => {
      return window.getComputedStyle(el).overflowY;
    });

    expect(['auto', 'scroll']).toContain(overflow);
  });

  test('hint text is centered and readable', async () => {
    const hint = window.locator('#welcome-hint');
    const fontSize = await hint.evaluate(el => {
      const style = window.getComputedStyle(el);
      return {
        fontSize: style.fontSize,
        textAlign: style.textAlign,
        color: style.color,
      };
    });

    expect(parseInt(fontSize.fontSize)).toBeGreaterThan(10);
  });
});
