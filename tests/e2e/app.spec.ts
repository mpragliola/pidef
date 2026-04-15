import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

test.describe('App smoke', () => {
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

  test('launches without crashing', async () => {
    expect(app).toBeTruthy();
  });

  test('welcome screen is visible on startup', async () => {
    await expect(window.locator('#welcome-screen')).toBeVisible();
  });

  test('window title is pidef', async () => {
    await expect(window).toHaveTitle('pidef');
  });
});
