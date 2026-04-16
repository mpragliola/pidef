import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { generateTestPdf } from './fixtures/generate-pdf';

test.describe('Recent Files', () => {
  let app: ElectronApplication;
  let window: Page;
  let testPdfPath: string;

  test.beforeAll(async () => {
    testPdfPath = await generateTestPdf(3);
    app = await electron.launch({
      args: [path.resolve('dist/main.js')],
    });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (testPdfPath && fs.existsSync(testPdfPath)) {
      fs.unlinkSync(testPdfPath);
    }
  });

  test('recent file appears immediately after opening', async () => {
    // Verify welcome screen is visible initially
    await expect(window.locator('#welcome-screen')).toBeVisible();

    // Open a PDF file by sending IPC message
    await app.evaluate(({ BrowserWindow }, filePath) => {
      BrowserWindow.getAllWindows()[0].webContents.send('open-file', filePath);
    }, testPdfPath);

    // Wait for the file to open
    await expect(window.locator('#nav-label')).toHaveText(/Page \d+ \/ \d+/, { timeout: 10000 });

    // Close the file to return to the welcome screen
    await window.click('#btn-close');
    await expect(window.locator('#welcome-screen')).toBeVisible();

    // Check that the filename appears in recent files (poll to allow async refresh)
    const filename = testPdfPath.split('/').pop();
    await expect(window.locator('#recent-files-list')).toContainText(filename!, { timeout: 5000 });
  });
});
