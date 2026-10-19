import fs from 'fs';
import path from 'path';
import type { FeedValidators } from '@nbtca/nbtcal';
import { getStateDir, getWritableStateDir } from '../config/paths.js';

const HEADER_VALUE = /^[\x21-\x7e][\x20-\x7e]*$/;

export interface FeedCache {
  text: string;
  validators: FeedValidators;
}

function headerValue(value: unknown): string | undefined {
  return typeof value === 'string' && HEADER_VALUE.test(value) ? value : undefined;
}

function readValidators(name: string, dir: string): FeedValidators {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8')) as Record<
      string,
      unknown
    >;
    const etag = headerValue(data['etag']);
    const lastModified = headerValue(data['lastModified']);
    return { ...(etag ? { etag } : {}), ...(lastModified ? { lastModified } : {}) };
  } catch {
    return {};
  }
}

// Validators are written after the text and read before it, so they can never be newer than the text.
export function saveFeedCache(name: string, { text, validators }: FeedCache, dir?: string): void {
  try {
    const target = dir ?? getWritableStateDir();
    fs.writeFileSync(path.join(target, `${name}.ics`), text, { encoding: 'utf8', mode: 0o600 });
    touchFeedCache(name, validators, target);
  } catch {
    /* best effort */
  }
}

export function touchFeedCache(name: string, validators: FeedValidators, dir?: string): void {
  try {
    const target = dir ?? getWritableStateDir();
    const now = new Date();
    fs.utimesSync(path.join(target, `${name}.ics`), now, now);
    fs.writeFileSync(path.join(target, `${name}.json`), JSON.stringify(validators), {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch {
    /* best effort */
  }
}

export function loadFeedCache(name: string, dir?: string): FeedCache | null {
  try {
    const source = dir ?? getStateDir();
    const validators = readValidators(name, source);
    const file = path.join(source, `${name}.ics`);
    return { text: fs.readFileSync(file, 'utf8'), validators };
  } catch {
    return null;
  }
}
