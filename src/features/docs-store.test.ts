import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveDocsIndex, loadDocsIndex } from './docs-store.js';

const docs = [
  { name: 'index.md', path: 'about/index.md', type: 'file' as const },
  { name: 'about', path: 'about', type: 'dir' as const },
];

function withDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'docs-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('docs-store', () => {
  it('round-trips the index via an injected dir', () => {
    withDir((dir) => {
      saveDocsIndex(docs, dir);
      expect(loadDocsIndex(dir)).toEqual(docs);
    });
  });

  it('reports a miss when nothing was cached', () => {
    withDir((dir) => {
      expect(loadDocsIndex(dir)).toBeNull();
    });
  });

  it('refuses an index older than the max age', () => {
    withDir((dir) => {
      saveDocsIndex(docs, dir);
      const longAgo = new Date(Date.now() - 60 * 60 * 1000);
      utimesSync(join(dir, 'docs-index.json'), longAgo, longAgo);
      expect(loadDocsIndex(dir, 30 * 60 * 1000)).toBeNull();
      expect(loadDocsIndex(dir, 2 * 60 * 60 * 1000)).toEqual(docs);
    });
  });

  it('refuses anything that is not a list of doc items', () => {
    for (const bad of [
      '{}',
      '[{"name":"a"}]',
      '[{"name":"a","path":"b","type":"other"}]',
      'nope',
    ]) {
      withDir((dir) => {
        writeFileSync(join(dir, 'docs-index.json'), bad, 'utf8');
        expect(loadDocsIndex(dir)).toBeNull();
      });
    }
  });

  it('stays quiet when the directory cannot be written', () => {
    expect(() => {
      saveDocsIndex(docs, join(tmpdir(), 'docs-missing', 'deeper'));
    }).not.toThrow();
  });
});
