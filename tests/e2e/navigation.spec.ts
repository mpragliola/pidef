import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { generateTestPdf } from './fixtures/generate-pdf';

test.describe('Navigation', () => {
  let app: ElectronApplication;
  let window: Page;
  let pdfPath: string;

  test.beforeEach(async () => {
    pdfPath = await generateTestPdf(3);
    app = await electron.launch({
      args: [path.resolve('dist/main.js')],
    });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Open the PDF by sending the IPC message from the main process
    await app.evaluate(({ BrowserWindow }, filePath) => {
      BrowserWindow.getAllWindows()[0].webContents.send('open-file', filePath);
    }, pdfPath);

    // Wait for the PDF to finish loading
    await expect(window.locator('#page-label')).toHaveText('Page 1 / 3', {
      timeout: 15000,
    });
  });

  test.afterEach(async () => {
    await app.close();
    fs.unlinkSync(pdfPath);
  });

  test('page label shows page 1 of 3 after opening', async () => {
    await expect(window.locator('#page-label')).toHaveText('Page 1 / 3');
  });

  test('next button advances to page 2', async () => {
    await window.click('#btn-next');
    await expect(window.locator('#page-label')).toHaveText('Page 2 / 3');
  });

  test('prev button goes back to page 1', async () => {
    await window.click('#btn-next');
    await expect(window.locator('#page-label')).toHaveText('Page 2 / 3');
    await window.click('#btn-prev');
    await expect(window.locator('#page-label')).toHaveText('Page 1 / 3');
  });

  test('last button jumps to final page', async () => {
    await window.click('#btn-last');
    await expect(window.locator('#page-label')).toHaveText('Page 3 / 3');
  });

  test('first button returns to page 1', async () => {
    await window.click('#btn-last');
    await expect(window.locator('#page-label')).toHaveText('Page 3 / 3');
    await window.click('#btn-first');
    await expect(window.locator('#page-label')).toHaveText('Page 1 / 3');
  });

  test('ArrowRight key advances page', async () => {
    await window.keyboard.press('ArrowRight');
    await expect(window.locator('#page-label')).toHaveText('Page 2 / 3');
  });

  test('ArrowLeft key goes back a page', async () => {
    await window.keyboard.press('ArrowRight');
    await expect(window.locator('#page-label')).toHaveText('Page 2 / 3');
    await window.keyboard.press('ArrowLeft');
    await expect(window.locator('#page-label')).toHaveText('Page 1 / 3');
  });
});
