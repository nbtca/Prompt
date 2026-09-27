import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as Nbtcal from '@nbtca/nbtcal';
import type { FeedCache } from './calendar-store.js';
import type * as CalendarModule from './calendar.js';

function feed(uid: string): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    'SUMMARY:Event',
    'DTSTART:20260926T190000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

const fetchFeedConditional = vi.fn();
const parseCalendar = vi.fn();
const loadFeedCache = vi.fn<() => FeedCache | null>();
const saveFeedCache = vi.fn();
const touchFeedCache = vi.fn();

vi.mock('@nbtca/nbtcal', async (importOriginal) => {
  const original = await importOriginal<typeof Nbtcal>();
  parseCalendar.mockImplementation(original.parseCalendar);
  return { ...original, fetchFeedConditional, parseCalendar };
});
vi.mock('./calendar-store.js', () => ({ loadFeedCache, saveFeedCache, touchFeedCache }));

const cached: FeedCache = { text: feed('cached'), validators: { etag: '"v1"' } };

async function freshCalendar(): Promise<typeof CalendarModule> {
  vi.resetModules();
  return import('./calendar.js');
}

function uids(calendar: Nbtcal.Calendar): string[] {
  return calendar.inRange(new Date(0), new Date(2030, 0, 1)).map((e) => e.uid);
}

function sentValidators(): unknown {
  return (fetchFeedConditional.mock.calls.at(-1)?.[1] as Nbtcal.FetchFeedConditionalOptions)
    .validators;
}

beforeEach(() => {
  vi.useRealTimers();
  fetchFeedConditional.mockReset();
  loadFeedCache.mockReset();
  saveFeedCache.mockReset();
  touchFeedCache.mockReset();
  parseCalendar.mockClear();
});

describe('loadCalendarOrCache', () => {
  it('falls back to the cached feed when the network fails', async () => {
    const { loadCalendarOrCache } = await freshCalendar();
    fetchFeedConditional.mockRejectedValue(new Error('offline'));
    loadFeedCache.mockReturnValue(cached);
    const { calendar, stale } = await loadCalendarOrCache();
    expect(stale).toBe(true);
    expect(uids(calendar)).toEqual(['cached']);
  });

  it('fails when there is nothing cached', async () => {
    const { loadCalendarOrCache } = await freshCalendar();
    fetchFeedConditional.mockRejectedValue(new Error('offline'));
    loadFeedCache.mockReturnValue(null);
    await expect(loadCalendarOrCache()).rejects.toThrow('offline');
  });
});

describe('loadCalendarOrThrow', () => {
  it('fetches unconditionally without a cached feed and stores the response', async () => {
    const { loadCalendarOrThrow } = await freshCalendar();
    loadFeedCache.mockReturnValue(null);
    const result = { status: 'modified', text: feed('fresh'), validators: { etag: '"v2"' } };
    fetchFeedConditional.mockResolvedValue(result);

    expect(uids(await loadCalendarOrThrow())).toEqual(['fresh']);
    expect(sentValidators()).toEqual({});
    expect(saveFeedCache).toHaveBeenCalledWith('calendar-feed', result);
  });

  it('reuses the peeked calendar on 304 without parsing it again', async () => {
    const { loadCalendarOrThrow, peekCalendar } = await freshCalendar();
    loadFeedCache.mockReturnValue(cached);
    const peeked = peekCalendar();
    fetchFeedConditional.mockResolvedValue({
      status: 'not-modified',
      validators: { etag: '"v1"' },
    });

    expect(await loadCalendarOrThrow()).toBe(peeked);
    expect(sentValidators()).toEqual({ etag: '"v1"' });
    expect(parseCalendar).toHaveBeenCalledTimes(1);
    expect(saveFeedCache).not.toHaveBeenCalled();
    expect(touchFeedCache).toHaveBeenCalledWith('calendar-feed', { etag: '"v1"' });

    await loadCalendarOrThrow();
    expect(fetchFeedConditional).toHaveBeenCalledTimes(1);
  });

  it('revalidates with the latest validators after the memo expires', async () => {
    vi.useFakeTimers();
    const { loadCalendarOrThrow } = await freshCalendar();
    loadFeedCache.mockReturnValue(cached);
    fetchFeedConditional.mockResolvedValue({
      status: 'not-modified',
      validators: { etag: '"v1"', lastModified: 'Thu, 24 Sep 2026 10:00:00 GMT' },
    });
    await loadCalendarOrThrow();
    vi.advanceTimersByTime(6 * 60 * 1000);
    await loadCalendarOrThrow();

    expect(fetchFeedConditional).toHaveBeenCalledTimes(2);
    expect(sentValidators()).toEqual({
      etag: '"v1"',
      lastModified: 'Thu, 24 Sep 2026 10:00:00 GMT',
    });
    expect(parseCalendar).toHaveBeenCalledTimes(1);
  });

  it('replaces the calendar and cache on 200', async () => {
    const { loadCalendarOrThrow, peekCalendar } = await freshCalendar();
    loadFeedCache.mockReturnValue(cached);
    peekCalendar();
    const result = { status: 'modified', text: feed('changed'), validators: { etag: '"v2"' } };
    fetchFeedConditional.mockResolvedValue(result);

    const calendar = await loadCalendarOrThrow();
    expect(uids(calendar)).toEqual(['changed']);
    expect(peekCalendar()).toBe(calendar);
    expect(saveFeedCache).toHaveBeenCalledWith('calendar-feed', result);
    expect(touchFeedCache).not.toHaveBeenCalled();
  });

  it('fetches unconditionally when the cached feed cannot be parsed', async () => {
    const { loadCalendarOrThrow } = await freshCalendar();
    loadFeedCache.mockReturnValue({ text: 'garbage', validators: { etag: '"v1"' } });
    fetchFeedConditional.mockResolvedValue({
      status: 'modified',
      text: feed('fresh'),
      validators: {},
    });

    expect(uids(await loadCalendarOrThrow())).toEqual(['fresh']);
    expect(sentValidators()).toEqual({});
  });

  it('rejects a 304 it did not ask for', async () => {
    const { loadCalendarOrThrow } = await freshCalendar();
    loadFeedCache.mockReturnValue(null);
    fetchFeedConditional.mockResolvedValue({ status: 'not-modified', validators: {} });
    await expect(loadCalendarOrThrow()).rejects.toThrow('HTTP 304');
  });
});

describe('loadSchoolCalendar', () => {
  it('fetches the school feed into its own cache', async () => {
    const { loadSchoolCalendar, loadCalendarOrThrow } = await freshCalendar();
    loadFeedCache.mockReturnValue(null);
    const school = { status: 'modified', text: feed('school'), validators: {} };
    fetchFeedConditional.mockResolvedValueOnce(school);
    expect(uids(await loadSchoolCalendar())).toEqual(['school']);
    expect(fetchFeedConditional.mock.calls[0]?.[0]).toBe('https://ical.nbtca.space/school.ics');
    expect(saveFeedCache).toHaveBeenCalledWith('school-feed', school);
    fetchFeedConditional.mockResolvedValueOnce({
      status: 'modified',
      text: feed('club'),
      validators: {},
    });
    expect(uids(await loadCalendarOrThrow())).toEqual(['club']);
  });

  it('falls back to the cached school feed when the network fails', async () => {
    const { loadSchoolCalendar } = await freshCalendar();
    fetchFeedConditional.mockRejectedValue(new Error('offline'));
    loadFeedCache.mockReturnValue(cached);
    expect(uids(await loadSchoolCalendar())).toEqual(['cached']);
    expect(loadFeedCache).toHaveBeenCalledWith('school-feed');
  });
});
