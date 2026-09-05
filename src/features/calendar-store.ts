import fs from 'fs';
import path from 'path';
import { getStateDir, getWritableStateDir } from '../config/paths.js';

const FEED_FILE = 'calendar-feed.ics';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function saveFeedCache(text: string, dir?: string): void {
  try {
    fs.writeFileSync(path.join(dir ?? getWritableStateDir(), FEED_FILE), text, {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch {
    /* best effort */
  }
}

export function loadFeedCache(dir?: string, maxAgeMs = MAX_AGE_MS): string | null {
  try {
    const file = path.join(dir ?? getStateDir(), FEED_FILE);
    if (Date.now() - fs.statSync(file).mtimeMs > maxAgeMs) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}
