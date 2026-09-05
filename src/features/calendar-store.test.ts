import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveFeedCache, loadFeedCache } from './calendar-store.js';

describe('calendar-store', () => {
  it('round-trips the feed via an injected dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cal-'));
    try {
      saveFeedCache('BEGIN:VCALENDAR\nEND:VCALENDAR', dir);
      expect(loadFeedCache(dir)).toBe('BEGIN:VCALENDAR\nEND:VCALENDAR');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports a miss when nothing was cached', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cal-'));
    try {
      expect(loadFeedCache(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a feed older than the max age', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cal-'));
    try {
      saveFeedCache('stale', dir);
      const longAgo = new Date(Date.now() - 60 * 60 * 1000);
      utimesSync(join(dir, 'calendar-feed.ics'), longAgo, longAgo);
      expect(loadFeedCache(dir, 30 * 60 * 1000)).toBeNull();
      expect(loadFeedCache(dir, 2 * 60 * 60 * 1000)).toBe('stale');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stays quiet when the directory cannot be written', () => {
    expect(() => {
      saveFeedCache('x', join(tmpdir(), 'cal-missing', 'deeper'));
    }).not.toThrow();
  });
});
