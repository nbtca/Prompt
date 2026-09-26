import fs from 'fs';
import path from 'path';
import type { DocsStore } from '@nbtca/docs';
import { getStateDir, getWritableStateDir } from '../config/paths.js';

const DIR = 'docs';
const MAX_BYTES = 4 * 1024 * 1024;
const KEY_RE = /^[\w-]{1,80}$/;

function keyFile(dir: string, key: string): string {
  if (!KEY_RE.test(key)) throw new TypeError('Invalid docs cache key.');
  return path.join(dir, key);
}

function evict(dir: string, maxBytes: number): void {
  const files = fs
    .readdirSync(dir)
    .map((name) => {
      const file = path.join(dir, name);
      const stat = fs.statSync(file);
      return { file, size: stat.size, usedAt: stat.mtimeMs };
    })
    .sort((left, right) => right.usedAt - left.usedAt);
  let total = 0;
  for (const { file, size } of files) {
    total += size;
    if (total > maxBytes) fs.rmSync(file, { force: true });
  }
}

export function createDocsStore(root?: string, maxBytes = MAX_BYTES): DocsStore {
  return {
    read(key) {
      const file = keyFile(path.join(root ?? getStateDir(), DIR), key);
      const value = fs.readFileSync(file, 'utf8');
      const now = new Date();
      fs.utimes(file, now, now, () => undefined);
      return value;
    },
    write(key, value) {
      const dir = path.join(root ?? getWritableStateDir(), DIR);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(keyFile(dir, key), value, { encoding: 'utf8', mode: 0o600 });
      evict(dir, maxBytes);
    },
  };
}
