import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  FileRecord,
  RECENT_FILES_MAX,
  loadRecentFiles,
  addRecentFile,
  updateFilePage,
} from '../../src/recent-files';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pidef-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadRecentFiles', () => {
  it('returns [] when no file exists', () => {
    const result = loadRecentFiles(tmpDir);
    expect(result).toEqual([]);
  });

  it('migrates old string[] format to FileRecord[]', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'recent-files.json'),
      JSON.stringify(['/a/b.pdf', '/c/d.pdf'])
    );
    const result = loadRecentFiles(tmpDir);
    expect(result).toEqual([
      { path: '/a/b.pdf', page: 0 },
      { path: '/c/d.pdf', page: 0 },
    ]);
  });

  it('reads current FileRecord[] format correctly', () => {
    const records: FileRecord[] = [
      { path: '/a/b.pdf', page: 3 },
      { path: '/c/d.pdf', page: 7 },
    ];
    fs.writeFileSync(
      path.join(tmpDir, 'recent-files.json'),
      JSON.stringify(records)
    );
    expect(loadRecentFiles(tmpDir)).toEqual(records);
  });
});

describe('addRecentFile', () => {
  it('adds a new entry at the front', () => {
    addRecentFile('/a/b.pdf', 0, tmpDir);
    const result = loadRecentFiles(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ path: '/a/b.pdf', page: 0 });
  });

  it('deduplicates: moves an existing path to the front', () => {
    addRecentFile('/a/b.pdf', 0, tmpDir);
    addRecentFile('/c/d.pdf', 2, tmpDir);
    addRecentFile('/a/b.pdf', 5, tmpDir);
    const result = loadRecentFiles(tmpDir);
    expect(result[0]).toEqual({ path: '/a/b.pdf', page: 5 });
    expect(result.filter((f) => f.path === '/a/b.pdf')).toHaveLength(1);
  });

  it('trims list to RECENT_FILES_MAX entries', () => {
    for (let i = 0; i <= RECENT_FILES_MAX; i++) {
      addRecentFile(`/file${i}.pdf`, 0, tmpDir);
    }
    expect(loadRecentFiles(tmpDir)).toHaveLength(RECENT_FILES_MAX);
  });
});

describe('updateFilePage', () => {
  it('updates the page number for a known path', () => {
    addRecentFile('/a/b.pdf', 0, tmpDir);
    updateFilePage('/a/b.pdf', 42, tmpDir);
    const result = loadRecentFiles(tmpDir);
    expect(result.find((f) => f.path === '/a/b.pdf')?.page).toBe(42);
  });

  it('is a no-op for an unknown path', () => {
    addRecentFile('/a/b.pdf', 0, tmpDir);
    updateFilePage('/unknown.pdf', 99, tmpDir);
    const result = loadRecentFiles(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/a/b.pdf');
  });
});
