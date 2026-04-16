import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { generateTestPdf } from './fixtures/generate-pdf';

test.describe('Recent Files', () => {
  let app: ElectronApplication;
  let window: Page;
  let testPdfPath: string;

  test.beforeEach(async () => {
    testPdfPath = await generateTestPdf(3);
  });

  test.afterEach(async () => {
    if (app) {
      await app.close();
    }
    if (testPdfPath && fs.existsSync(testPdfPath)) {
      fs.unlinkSync(testPdfPath);
    }
  });

  test('recent file appears immediately after opening', async () => {
    // Launch app
    app = await electron.launch({
      args: [path.resolve('dist/main.js')],
    });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Verify welcome screen is visible initially
    await expect(window.locator('#welcome-screen')).toBeVisible();

    // Check initial recent files count (should be 0)
    let listItems = window.locator('#recent-files-list li');
    let count = await listItems.count();
    console.log(`Initial recent files count: ${count}`);

    // Open a PDF file by sending IPC message
    await app.evaluate(({ BrowserWindow }, filePath) => {
      console.log(`[test] Sending open-file IPC with path: ${filePath}`);
      BrowserWindow.getAllWindows()[0].webContents.send('open-file', filePath);
    }, testPdfPath);

    // Wait for the file to open
    await expect(window.locator('canvas')).toBeVisible({ timeout: 10000 });
    console.log(`[test] Canvas is visible, file opened`);

    // Check if recent file appears in the recent files list right after opening
    // Note: the welcome screen is now hidden, so we need to check a different way
    // Let's close the file to get back to the welcome screen
    await window.click('#btn-close');
    await expect(window.locator('#welcome-screen')).toBeVisible();

    // Debug: check welcome screen HTML
    const welcomeHTML = await window.locator('#welcome-screen').innerHTML();
    console.log(`Welcome screen HTML length: ${welcomeHTML.length}`);

    // Now check recent files
    listItems = window.locator('#recent-files-list li');
    count = await listItems.count();
    console.log(`Recent files count after opening: ${count}`);

    // Debug: check the actual HTML structure
    const listHTML = await window.locator('#recent-files-list').innerHTML();
    console.log(`Recent files list HTML: "${listHTML}"`);

    expect(count).toBeGreaterThan(0);

    // Check that the filename appears
    const filename = testPdfPath.split('/').pop();
    const filelistText = await window.locator('#recent-files-list').textContent();
    expect(filelistText).toContain(filename);
  });
});
