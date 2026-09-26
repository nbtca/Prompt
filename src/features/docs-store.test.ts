import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync, statSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDocsStore } from './docs-store.js';

function withDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'docs-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('docs-store', () => {
  it('round-trips values in a private directory', () => {
    withDir((dir) => {
      const store = createDocsStore(dir);
      store.write('tree', '[]');
      expect(store.read('tree')).toBe('[]');
      expect(statSync(join(dir, 'docs')).mode & 0o777).toBe(0o700);
      expect(statSync(join(dir, 'docs', 'tree')).mode & 0o777).toBe(0o600);
    });
  });

  it('throws on a miss so the client treats it as uncached', () => {
    withDir((dir) => {
      expect(() => createDocsStore(dir).read('tree')).toThrow();
    });
  });

  it('refuses keys that could leave the cache directory', () => {
    withDir((dir) => {
      const store = createDocsStore(dir);
      expect(() => {
        store.write('../escape', 'x');
      }).toThrow(TypeError);
      expect(() => store.read('../escape')).toThrow(TypeError);
    });
  });

  it('evicts the least recently used entries past the size cap', () => {
    withDir((dir) => {
      const store = createDocsStore(dir, 10);
      store.write('blob-a', 'aaaa');
      store.write('blob-b', 'bbbb');
      const old = new Date(Date.now() - 60_000);
      utimesSync(join(dir, 'docs', 'blob-a'), old, old);
      const recent = new Date(Date.now() - 30_000);
      utimesSync(join(dir, 'docs', 'blob-b'), recent, recent);
      store.write('blob-c', 'cccc');
      expect(existsSync(join(dir, 'docs', 'blob-a'))).toBe(false);
      expect(store.read('blob-b')).toBe('bbbb');
      expect(store.read('blob-c')).toBe('cccc');
    });
  });
});
