import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveFeedCache, loadFeedCache, touchFeedCache } from './calendar-store.js';

const validators = { etag: '"v1"', lastModified: 'Wed, 23 Sep 2026 10:00:00 GMT' };

function withDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'cal-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('calendar-store', () => {
  it('round-trips the feed and its validators via an injected dir', () => {
    withDir((dir) => {
      saveFeedCache({ text: 'BEGIN:VCALENDAR\nEND:VCALENDAR', validators }, dir);
      expect(loadFeedCache(dir)).toEqual({ text: 'BEGIN:VCALENDAR\nEND:VCALENDAR', validators });
    });
  });

  it.runIf(process.platform !== 'win32')('keeps both files private', () => {
    withDir((dir) => {
      saveFeedCache({ text: 'x', validators }, dir);
      expect(statSync(join(dir, 'calendar-feed.ics')).mode & 0o777).toBe(0o600);
      expect(statSync(join(dir, 'calendar-feed.json')).mode & 0o777).toBe(0o600);
    });
  });

  it('reports a miss when nothing was cached', () => {
    withDir((dir) => {
      expect(loadFeedCache(dir)).toBeNull();
    });
  });

  it.each([
    ['missing', null],
    ['corrupt', '{not json'],
    ['not an object', 'null'],
    ['an unsafe header value', JSON.stringify({ etag: '"v1"\r\nX: y', lastModified: 42 })],
  ])('drops validators that are %s', (_label, content) => {
    withDir((dir) => {
      saveFeedCache({ text: 'x', validators }, dir);
      const file = join(dir, 'calendar-feed.json');
      if (content === null) rmSync(file);
      else writeFileSync(file, content);
      expect(loadFeedCache(dir)).toEqual({ text: 'x', validators: {} });
    });
  });

  it('refuses a feed older than the max age', () => {
    withDir((dir) => {
      saveFeedCache({ text: 'stale', validators: {} }, dir);
      const longAgo = new Date(Date.now() - 60 * 60 * 1000);
      utimesSync(join(dir, 'calendar-feed.ics'), longAgo, longAgo);
      expect(loadFeedCache(dir, 30 * 60 * 1000)).toBeNull();
      expect(loadFeedCache(dir, 2 * 60 * 60 * 1000)?.text).toBe('stale');
    });
  });

  it('renews the feed age and validators when the feed is unchanged', () => {
    withDir((dir) => {
      saveFeedCache({ text: 'same', validators }, dir);
      const longAgo = new Date(Date.now() - 60 * 60 * 1000);
      utimesSync(join(dir, 'calendar-feed.ics'), longAgo, longAgo);
      touchFeedCache({ etag: '"v2"' }, dir);
      expect(loadFeedCache(dir, 30 * 60 * 1000)).toEqual({
        text: 'same',
        validators: { etag: '"v2"' },
      });
    });
  });

  it('stays quiet when the directory cannot be written', () => {
    const missing = join(tmpdir(), 'cal-missing', 'deeper');
    expect(() => {
      saveFeedCache({ text: 'x', validators }, missing);
      touchFeedCache(validators, missing);
    }).not.toThrow();
  });
});
