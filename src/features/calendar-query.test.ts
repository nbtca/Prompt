import { describe, it, expect } from 'vitest';
import { createCalendar, parseCalendar, type CalendarEvent } from '@nbtca/nbtcal';
import {
  currentEvents,
  dayRange,
  weekRange,
  monthRange,
  filterEvents,
  countdownParts,
  isCountdownUrgent,
  buildExportFilename,
} from './calendar-query.js';

function ev(o: Partial<CalendarEvent>): CalendarEvent {
  return {
    uid: 'u',
    title: 'T',
    start: new Date(),
    end: null,
    isAllDay: false,
    location: null,
    description: null,
    recurring: false,
    ...o,
  };
}

describe('dayRange', () => {
  it('spans the local day of the given instant', () => {
    const r = dayRange(new Date(2026, 8, 26, 15, 55));
    expect(r.start).toEqual(new Date(2026, 8, 26));
    expect(r.end).toEqual(new Date(2026, 8, 27));
  });
});

describe('currentEvents', () => {
  const calendar = createCalendar(
    parseCalendar(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        ...[
          ['all-day', 'DTSTART;VALUE=DATE:20260926', 'DTEND;VALUE=DATE:20260927'],
          ['all-day-no-end', 'DTSTART;VALUE=DATE:20260926'],
          ['ended', 'DTSTART:20260926T080000', 'DTEND:20260926T090000'],
          ['ongoing', 'DTSTART:20260926T150000', 'DTEND:20260926T170000'],
          ['later', 'DTSTART:20260926T190000', 'DTEND:20260926T200000'],
          ['yesterday', 'DTSTART;VALUE=DATE:20260925', 'DTEND;VALUE=DATE:20260926'],
        ].flatMap(([uid, ...times]) => [
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `SUMMARY:${uid}`,
          ...times,
          'END:VEVENT',
        ]),
        'END:VCALENDAR',
      ].join('\r\n'),
    ),
  );

  it("keeps today's all-day and ongoing events and drops finished ones", () => {
    const uids = currentEvents(calendar, new Date(2026, 8, 26, 15, 55)).map((e) => e.uid);
    expect(uids.sort()).toEqual(['all-day', 'all-day-no-end', 'later', 'ongoing']);
  });
});

describe('weekRange', () => {
  it('spans Monday 00:00 to the next Monday 00:00', () => {
    const wed = new Date(2026, 2, 25, 15, 0, 0); // Wed 2026-03-25
    const { start, end } = weekRange(wed);
    expect(start.getDay()).toBe(1); // Monday
    expect(start.getHours()).toBe(0);
    expect(start.getDate()).toBe(23); // Mon 2026-03-23
    expect(end.getDate()).toBe(30); // next Mon 2026-03-30
    expect(Math.round((end.getTime() - start.getTime()) / 86400000)).toBe(7);
  });
});

describe('monthRange', () => {
  it('spans the 1st of this month to the 1st of next month', () => {
    const { start, end } = monthRange(new Date(2026, 2, 25));
    expect(start.getMonth()).toBe(2);
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(end.getMonth()).toBe(3);
    expect(end.getDate()).toBe(1);
  });
});

describe('filterEvents', () => {
  const events = [
    ev({ title: 'Hack Night', location: 'Lab' }),
    ev({ title: 'Study Group', location: 'Library' }),
  ];
  it('matches title case-insensitively', () => {
    expect(filterEvents(events, 'hack').map((e) => e.title)).toEqual(['Hack Night']);
  });
  it('matches location', () => {
    expect(filterEvents(events, 'library').map((e) => e.title)).toEqual(['Study Group']);
  });
  it('empty query returns all', () => {
    expect(filterEvents(events, '  ')).toHaveLength(2);
  });
});

describe('countdownParts', () => {
  const now = new Date('2026-03-25T12:00:00Z');
  it('breaks a future delta into d/h/m', () => {
    const t = new Date('2026-03-28T16:30:00Z'); // +3d 4h 30m
    expect(countdownParts(t, now)).toEqual({ past: false, days: 3, hours: 4, minutes: 30 });
  });
  it('marks a non-future target as past', () => {
    expect(countdownParts(new Date('2026-03-25T11:00:00Z'), now).past).toBe(true);
  });
});

describe('isCountdownUrgent', () => {
  it('is urgent at exactly the 15-minute threshold', () => {
    expect(isCountdownUrgent({ past: false, days: 0, hours: 0, minutes: 15 })).toBe(true);
  });
  it('is not urgent one minute past the threshold', () => {
    expect(isCountdownUrgent({ past: false, days: 0, hours: 0, minutes: 16 })).toBe(false);
  });
  it('is urgent with any minutes when 0 hours/days', () => {
    expect(isCountdownUrgent({ past: false, days: 0, hours: 0, minutes: 1 })).toBe(true);
  });
  it('is never urgent once hours or days are involved', () => {
    expect(isCountdownUrgent({ past: false, days: 0, hours: 1, minutes: 0 })).toBe(false);
    expect(isCountdownUrgent({ past: false, days: 1, hours: 0, minutes: 0 })).toBe(false);
  });
  it('a past countdown is never urgent (nothing to hurry for)', () => {
    expect(isCountdownUrgent({ past: true, days: 0, hours: 0, minutes: 0 })).toBe(false);
  });
  it('respects a custom threshold', () => {
    expect(isCountdownUrgent({ past: false, days: 0, hours: 0, minutes: 20 }, 30)).toBe(true);
  });
});

describe('buildExportFilename', () => {
  it('sanitizes to a safe .ics name', () => {
    expect(buildExportFilename(ev({ title: 'Hack Night: v2 / 2026' }))).toBe(
      'Hack-Night-v2-2026.ics',
    );
  });
  it('falls back to event.ics for empty/odd titles', () => {
    expect(buildExportFilename(ev({ title: null }))).toBe('event.ics');
    expect(buildExportFilename(ev({ title: '///' }))).toBe('event.ics');
  });
});
