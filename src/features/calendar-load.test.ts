import { describe, it, expect, vi } from 'vitest';
import type * as Nbtcal from '@nbtca/nbtcal';

const FEED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:cached',
  'SUMMARY:Cached',
  'DTSTART:20260926T190000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const fetchFeed = vi.fn();
const loadFeedCache = vi.fn<() => string | null>();

vi.mock('@nbtca/nbtcal', async (importOriginal) => ({
  ...(await importOriginal<typeof Nbtcal>()),
  fetchFeed,
}));
vi.mock('./calendar-store.js', () => ({ loadFeedCache, saveFeedCache: vi.fn() }));

const { loadCalendarOrCache } = await import('./calendar.js');

describe('loadCalendarOrCache', () => {
  it('falls back to the cached feed when the network fails', async () => {
    fetchFeed.mockRejectedValue(new Error('offline'));
    loadFeedCache.mockReturnValue(FEED);
    const { calendar, stale } = await loadCalendarOrCache();
    expect(stale).toBe(true);
    expect(calendar.inRange(new Date(0), new Date(2030, 0, 1)).map((e) => e.uid)).toEqual([
      'cached',
    ]);
  });

  it('fails when there is nothing cached', async () => {
    vi.resetModules();
    const fresh = await import('./calendar.js');
    fetchFeed.mockRejectedValue(new Error('offline'));
    loadFeedCache.mockReturnValue(null);
    await expect(fresh.loadCalendarOrCache()).rejects.toThrow('offline');
  });
});
