import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Generates a minimal PDF with `pageCount` blank A4 pages,
 * writes it to a temp file, and returns the file path.
 * Caller is responsible for deleting the file when done.
 */
export async function generateTestPdf(pageCount: number = 3): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    pdfDoc.addPage([595, 842]); // A4 portrait
  }
  const pdfBytes = await pdfDoc.save();
  const tmpPath = path.join(
    os.tmpdir(),
    `pidef-test-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`
  );
  fs.writeFileSync(tmpPath, pdfBytes);
  return tmpPath;
}

/**
 * Generates a minimal PDF with `pageCount` blank A4 pages and writes it to `filePath`.
 */
export async function generatePDF(filePath: string, pageCount: number = 3): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    pdfDoc.addPage([595, 842]); // A4 portrait
  }
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(filePath, pdfBytes);
}
