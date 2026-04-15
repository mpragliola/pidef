import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readBookmarks, writeBookmarks, Bookmark } from '../../src/bookmarks';

let tmpDir: string;
let pdfPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pidef-bookmarks-test-'));
  pdfPath = path.join(tmpDir, 'test.pdf');
  fs.writeFileSync(pdfPath, '%PDF-1.4');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('readBookmarks', () => {
  it('returns [] when companion file does not exist', () => {
    expect(readBookmarks(pdfPath)).toEqual([]);
  });

  it('returns [] when companion file is malformed JSON', () => {
    fs.writeFileSync(`${pdfPath}.json`, 'not json');
    expect(readBookmarks(pdfPath)).toEqual([]);
  });

  it('returns [] when bookmarks field is not an array', () => {
    fs.writeFileSync(`${pdfPath}.json`, JSON.stringify({ bookmarks: 'bad' }));
    expect(readBookmarks(pdfPath)).toEqual([]);
  });

  it('reads bookmarks and returns them sorted by page', () => {
    const raw: Bookmark[] = [
      { label: 'Chorus', page: 3 },
      { label: 'Intro', page: 0 },
    ];
    fs.writeFileSync(`${pdfPath}.json`, JSON.stringify({ bookmarks: raw }));
    expect(readBookmarks(pdfPath)).toEqual([
      { label: 'Intro', page: 0 },
      { label: 'Chorus', page: 3 },
    ]);
  });
});

describe('writeBookmarks', () => {
  it('writes bookmarks sorted by page', () => {
    const bookmarks: Bookmark[] = [
      { label: 'Bridge', page: 7 },
      { label: 'Intro', page: 1 },
    ];
    writeBookmarks(pdfPath, bookmarks);
    const raw = JSON.parse(fs.readFileSync(`${pdfPath}.json`, 'utf-8'));
    expect(raw.bookmarks).toEqual([
      { label: 'Intro', page: 1 },
      { label: 'Bridge', page: 7 },
    ]);
  });

  it('round-trips: write then read returns same bookmarks', () => {
    const bookmarks: Bookmark[] = [
      { label: 'Chorus', page: 4 },
      { label: 'Intro', page: 1 },
    ];
    writeBookmarks(pdfPath, bookmarks);
    expect(readBookmarks(pdfPath)).toEqual([
      { label: 'Intro', page: 1 },
      { label: 'Chorus', page: 4 },
    ]);
  });

  it('writes empty bookmarks array correctly', () => {
    writeBookmarks(pdfPath, []);
    expect(readBookmarks(pdfPath)).toEqual([]);
  });
});
