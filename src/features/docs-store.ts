import fs from 'fs';
import path from 'path';
import type { DocItem } from '@nbtca/docs';
import { getStateDir, getWritableStateDir } from '../config/paths.js';

const INDEX_FILE = 'docs-index.json';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isDocItem(value: unknown): value is DocItem {
  const item = value as Partial<DocItem> | null;
  return (
    typeof item?.name === 'string' &&
    typeof item.path === 'string' &&
    (item.type === 'file' || item.type === 'dir')
  );
}

export function saveDocsIndex(docs: readonly DocItem[], dir?: string): void {
  try {
    fs.writeFileSync(path.join(dir ?? getWritableStateDir(), INDEX_FILE), JSON.stringify(docs), {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch {
    /* best effort */
  }
}

export function loadDocsIndex(dir?: string, maxAgeMs = MAX_AGE_MS): DocItem[] | null {
  try {
    const file = path.join(dir ?? getStateDir(), INDEX_FILE);
    if (Date.now() - fs.statSync(file).mtimeMs > maxAgeMs) return null;
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) && parsed.every(isDocItem) ? parsed : null;
  } catch {
    return null;
  }
}
