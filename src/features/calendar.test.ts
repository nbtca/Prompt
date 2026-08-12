import { describe, it, expect, beforeAll } from 'vitest';
import type { CalendarEvent } from '@nbtca/nbtcal';
import {
  toDisplayEvent,
  renderEventsTable,
  renderCountdownBanner,
  renderEventBrief,
  exportEventIcs,
} from './calendar.js';
import { setLanguage } from '../i18n/index.js';
import { stripAnsi, visualWidth } from '../core/text.js';
import { resetIconCache } from '../core/icons.js';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

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

  it('sanitizes remote terminal control sequences and single-line fields', () => {
    const result = toDisplayEvent(
      makeEvent({
        title: 'Title\nforged\u001B]52;c;YWJj\u0007',
        location: 'Room\t1\u001B[31m',
        description: 'line one\nline two\u001B[2J',
      }),
    );
    expect(result.title).toBe('Title forged');
    expect(result.location).toBe('Room 1');
    expect(result.description).toBe('line one\nline two');
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
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    resetIconCache();
    const events = [toDisplayEvent(makeEvent({ title: 'Weekly Sync', recurring: true }))];
    const out = stripAnsi(renderEventsTable(events, { color: false }));
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    expect(out).toContain('~ Weekly Sync');
  });
  it('does not mark non-recurring events', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    resetIconCache();
    const events = [toDisplayEvent(makeEvent({ title: 'One Off', recurring: false }))];
    const out = stripAnsi(renderEventsTable(events, { color: false }));
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    expect(out).not.toContain('~ One Off');
    expect(out).toContain('One Off');
  });

  it('uses a complete compact layout on narrow terminals', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    resetIconCache();
    const event = toDisplayEvent(
      makeEvent({
        title: 'International developer conference',
        location: 'Engineering building room 201',
        recurring: true,
      }),
    );
    const lines = renderEventsTable([event], { color: false, width: 20 }).split('\n');
    const text = lines.join('').replace(/\s/gu, '');
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();

    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(text).toContain('Internationaldeveloperconference');
    expect(text).toContain('Engineeringbuildingroom201');
    expect(text).toContain('~');
    expect(text).toContain('@');
  });

  it('drops compact indentation when a wide glyph would overflow', () => {
    const event = toDisplayEvent(makeEvent({ title: '界abc', location: 'Lab' }));
    const lines = renderEventsTable([event], { color: false, width: 4 }).split('\n');

    expect(lines.every((line) => visualWidth(line) <= 4)).toBe(true);
  });

  it('keeps the table layout when enough columns are available', () => {
    const event = toDisplayEvent(makeEvent());
    const lines = stripAnsi(renderEventsTable([event], { color: false, width: 80 })).split('\n');

    expect(lines[0]).toContain('Date & Time');
    expect(lines[0]).toContain('Event Name');
    expect(lines[0]).toContain('Location');
  });

  it('wraps the empty state to the terminal width', () => {
    const lines = renderEventsTable([], { color: false, width: 8 }).split('\n');

    expect(lines.every((line) => visualWidth(line) <= 8)).toBe(true);
    expect(lines.join('').replace(/\s/gu, '')).toBe('Noupcomingevents');
  });
});

describe('renderEventBrief', () => {
  const e = toDisplayEvent(
    makeEvent({ title: 'Hack Night', start: new Date('2026-07-15T20:00:00') }),
  );

  it('includes the date/time and title', () => {
    const out = stripAnsi(renderEventBrief(e, new Date('2026-07-15T09:00:00')));
    expect(out).toContain('Hack Night');
    expect(out).toMatch(/20:00/);
  });

  it('marks a recurring event', () => {
    const recurring = toDisplayEvent(
      makeEvent({ title: 'Weekly Sync', recurring: true, start: new Date('2026-07-15T20:00:00') }),
    );
    const out = stripAnsi(renderEventBrief(recurring, new Date('2026-07-15T09:00:00')));
    expect(out).toContain('Weekly Sync');
  });

  it('does not throw for an event on a different day than now', () => {
    const future = toDisplayEvent(
      makeEvent({ title: 'Next Week', start: new Date('2026-07-22T20:00:00') }),
    );
    expect(() => renderEventBrief(future, new Date('2026-07-15T09:00:00'))).not.toThrow();
  });
});

describe('renderCountdownBanner', () => {
  it('shows the next event title and a d/h countdown', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    resetIconCache();
    const now = new Date('2026-03-25T12:00:00');
    const e = toDisplayEvent(
      makeEvent({
        title: 'Hack Night',
        start: new Date('2026-03-28T16:00:00'),
        end: new Date('2026-03-28T18:00:00'),
      }),
    );
    const out = stripAnsi(renderCountdownBanner(e, now));
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    expect(out).toContain('Next');
    expect(out).toContain('Hack Night');
    expect(out).toMatch(/3d/);
  });
  it('wraps a complete long countdown banner at twenty columns', () => {
    const now = new Date('2026-09-30T09:30:00');
    const title = 'International innovation and entrepreneurship competition';
    const event = toDisplayEvent(
      makeEvent({
        title,
        start: new Date('2026-10-01T09:30:00'),
        end: new Date('2026-10-01T11:30:00'),
      }),
    );
    const lines = renderCountdownBanner(event, now, 20).split('\n');
    const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(text).toContain(title.replace(/\s/g, ''));
    expect(text).toContain('Next');
    expect(text).toContain('1d0h');
    expect(lines.filter((line) => /[→>]/u.test(stripAnsi(line)))).toHaveLength(1);
  });
  it('returns empty string when there is no event', () => {
    expect(renderCountdownBanner(undefined, new Date())).toBe('');
  });
});

describe('exportEventIcs', () => {
  it('writes a valid .ics file and returns its path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ics-'));
    try {
      const event = {
        uid: 'u1',
        title: 'Hack Night',
        start: new Date('2026-03-25T12:00:00Z'),
        end: new Date('2026-03-25T14:00:00Z'),
        isAllDay: false,
        location: 'Lab',
        description: null,
        recurring: false,
      };
      const res = exportEventIcs(event, dir);
      expect(res.ok).toBe(true);
      expect(res.path).toBe(join(dir, 'Hack-Night.ics'));
      const contents = readFileSync(res.path, 'utf-8');
      expect(contents).toContain('BEGIN:VCALENDAR');
      expect(contents).toContain('SUMMARY:Hack Night');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns ok:false on an unwritable directory instead of throwing', () => {
    const event = {
      uid: 'u1',
      title: 'X',
      start: new Date(),
      end: null,
      isAllDay: false,
      location: null,
      description: null,
      recurring: false,
    };
    const res = exportEventIcs(event, '/nonexistent-dir-xyz-123');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('does not overwrite an existing file — uses a -N suffix', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ics-'));
    try {
      const event = {
        uid: 'u1',
        title: 'Hack Night',
        start: new Date('2026-03-25T12:00:00Z'),
        end: null,
        isAllDay: false,
        location: null,
        description: null,
        recurring: false,
      };
      const first = exportEventIcs(event, dir);
      const second = exportEventIcs(event, dir);
      expect(first.path).toBe(join(dir, 'Hack-Night.ics'));
      expect(second.path).toBe(join(dir, 'Hack-Night-1.ics'));
      expect(second.ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
