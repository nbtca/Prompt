/**
 * Tests for toDisplayEvent() in calendar.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { CalendarEvent } from '@nbtca/nbtcal';
import { toDisplayEvent, renderEventsTable, renderCountdownBanner } from './calendar.js';
import { setLanguage } from '../i18n/index.js';
import { stripAnsi } from '../core/text.js';
import { resetIconCache } from '../core/icons.js';

beforeAll(() => {
  setLanguage('en');
});

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    uid: 'test-uid',
    title: 'Test Event',
    start: new Date('2025-06-17T10:00:00'),
    end: new Date('2025-06-17T11:00:00'),
    isAllDay: false,
    location: 'Room 101',
    description: 'Some description',
    recurring: false,
    ...overrides,
  };
}

describe('toDisplayEvent', () => {
  it('maps a basic event', () => {
    const e = makeEvent();
    const result = toDisplayEvent(e);
    expect(result.title).toBe('Test Event');
    expect(result.location).toBe('Room 101');
    expect(result.description).toBe('Some description');
    expect(result.startDate).toBe(e.start);
  });

  it('null title falls back to "Untitled Event"', () => {
    const e = makeEvent({ title: null });
    const result = toDisplayEvent(e);
    expect(result.title).toBe('Untitled Event');
  });

  it('null location falls back to "TBD"', () => {
    const e = makeEvent({ location: null });
    const result = toDisplayEvent(e);
    expect(result.location).toBe('TBD');
  });

  it('null description becomes empty string', () => {
    const e = makeEvent({ description: null });
    const result = toDisplayEvent(e);
    expect(result.description).toBe('');
  });

  it('all-day event yields empty time string', () => {
    const e = makeEvent({ isAllDay: true });
    const result = toDisplayEvent(e);
    expect(result.time).toBe('');
  });

  it('non-all-day event has a time string', () => {
    const e = makeEvent({ isAllDay: false });
    const result = toDisplayEvent(e);
    expect(result.time).not.toBe('');
    expect(result.time).toMatch(/^\d{2}:\d{2}$/);
  });

  it('startDate is the same Date instance as e.start', () => {
    const e = makeEvent();
    const result = toDisplayEvent(e);
    expect(result.startDate).toBe(e.start);
  });

  it('different-year date includes the year in date string', () => {
    // Use a far-future date so the year differs from "now"
    const futureDate = new Date(2099, 5, 17, 10, 0, 0);
    const e = makeEvent({ start: futureDate, end: futureDate });
    const result = toDisplayEvent(e);
    expect(result.date).toContain('2099');
  });

  it('same-year date omits the year', () => {
    const now = new Date();
    const sameYear = new Date(now.getFullYear(), 6, 1, 10, 0, 0);
    const e = makeEvent({ start: sameYear, end: sameYear });
    const result = toDisplayEvent(e);
    expect(result.date).not.toContain(String(now.getFullYear()));
    // Should be MM-DD format
    expect(result.date).toMatch(/^\d{2}-\d{2}$/);
  });
});

describe('toDisplayEvent recurring/uid', () => {
  it('carries recurring and uid from the source event', () => {
    const e = makeEvent({ recurring: true, uid: 'abc-123' });
    const result = toDisplayEvent(e);
    expect(result.recurring).toBe(true);
    expect(result.uid).toBe('abc-123');
  });
});

describe('renderEventsTable recurring marker', () => {
  it('prefixes recurring events with the ascii recurring marker', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache();
    const events = [toDisplayEvent(makeEvent({ title: 'Weekly Sync', recurring: true }))];
    const out = stripAnsi(renderEventsTable(events, { color: false }));
    process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache();
    expect(out).toContain('~ Weekly Sync');
  });
  it('does not mark non-recurring events', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache();
    const events = [toDisplayEvent(makeEvent({ title: 'One Off', recurring: false }))];
    const out = stripAnsi(renderEventsTable(events, { color: false }));
    process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache();
    expect(out).not.toContain('~ One Off');
    expect(out).toContain('One Off');
  });
});

describe('renderCountdownBanner', () => {
  it('shows the next event title and a d/h countdown', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache();
    const now = new Date('2026-03-25T12:00:00');
    const e = toDisplayEvent(makeEvent({ title: 'Hack Night', start: new Date('2026-03-28T16:00:00'), end: new Date('2026-03-28T18:00:00') }));
    const out = stripAnsi(renderCountdownBanner(e, now));
    process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache();
    expect(out).toContain('Next');
    expect(out).toContain('Hack Night');
    expect(out).toMatch(/3d/);
  });
  it('returns empty string when there is no event', () => {
    expect(renderCountdownBanner(undefined, new Date())).toBe('');
  });
});
