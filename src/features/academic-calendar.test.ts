import { describe, it, expect } from 'vitest';
import {
  isAcademicBreakEvent, findBreakEvents, currentAcademicWindow, inferWeekOneMonday,
} from './academic-calendar.js';
import type { CalendarEvent } from '@nbtca/nbtcal';

function breakEvent(title: string, start: string, end: string): CalendarEvent {
  return {
    uid: `${title}-${start}`, title, start: new Date(`${start}T00:00:00`),
    end: new Date(`${end}T00:00:00`), isAllDay: true, location: null, description: null,
    recurring: false,
  };
}

// Real 2026-2027 academic calendar (school-published), used as ground truth:
// summer break ends 2026-09-13 -> classes begin Mon 2026-09-14 (term 1);
// winter break ends 2027-02-28 -> classes begin Mon 2027-03-01 (term 2).
const SUMMER_2026 = breakEvent('暑假', '2026-07-13', '2026-09-14');
const WINTER_2027 = breakEvent('寒假', '2027-01-13', '2027-03-01');
const SUMMER_2027 = breakEvent('暑假', '2027-06-22', '2027-09-13');

describe('isAcademicBreakEvent', () => {
  it('accepts an all-day multi-day 寒假/暑假 event', () => {
    expect(isAcademicBreakEvent(SUMMER_2026)).toBe(true);
  });
  it('rejects a same-titled but non-all-day event', () => {
    expect(isAcademicBreakEvent({ ...SUMMER_2026, isAllDay: false })).toBe(false);
  });
  it('rejects a short (<3 day) span even if titled correctly', () => {
    expect(isAcademicBreakEvent(breakEvent('暑假', '2026-09-13', '2026-09-14'))).toBe(false);
  });
  it('rejects an unrelated club event', () => {
    expect(isAcademicBreakEvent(breakEvent('纳新', '2026-09-01', '2026-09-05'))).toBe(false);
  });
});

describe('findBreakEvents', () => {
  it('returns only break events, sorted by start', () => {
    const club = breakEvent('纳新', '2026-09-01', '2026-09-05');
    const found = findBreakEvents([WINTER_2027, club, SUMMER_2026]);
    expect(found).toEqual([SUMMER_2026, WINTER_2027]);
  });
});

describe('currentAcademicWindow', () => {
  it('returns null when the feed has no break events at all', () => {
    expect(currentAcademicWindow([], new Date('2026-10-01'))).toBeNull();
  });

  it('identifies term 1, week 3, with the correct academic-year label', () => {
    const now = new Date('2026-10-01T09:00:00'); // 3rd Mon-Sun week starting 2026-09-14
    const w = currentAcademicWindow([SUMMER_2026, WINTER_2027], now);
    expect(w).toEqual({
      status: 'inTerm', academicYear: '2026-2027', semester: '1',
      weekOneMonday: '2026-09-14', currentWeek: 3, nextBreakStart: '2027-01-13',
      nextBreakTitle: '寒假',
    });
  });

  it('identifies term 2, with the correct academic-year label', () => {
    const now = new Date('2027-03-08T09:00:00'); // week 2 of term 2
    const w = currentAcademicWindow([SUMMER_2026, WINTER_2027, SUMMER_2027], now);
    expect(w).toEqual({
      status: 'inTerm', academicYear: '2026-2027', semester: '2',
      weekOneMonday: '2027-03-01', currentWeek: 2, nextBreakStart: '2027-06-22',
      nextBreakTitle: '暑假',
    });
  });

  it('omits nextBreakStart/nextBreakTitle when no future break event is known yet', () => {
    const now = new Date('2026-10-01T09:00:00');
    const w = currentAcademicWindow([SUMMER_2026], now); // no WINTER_2027 in the feed yet
    expect(w).toEqual({
      status: 'inTerm', academicYear: '2026-2027', semester: '1',
      weekOneMonday: '2026-09-14', currentWeek: 3,
    });
  });

  it('reports onBreak while inside a break period', () => {
    const now = new Date('2027-02-01T00:00:00');
    const w = currentAcademicWindow([SUMMER_2026, WINTER_2027], now);
    expect(w).toEqual({ status: 'onBreak', breakTitle: '寒假' });
  });
});

describe('inferWeekOneMonday', () => {
  it('returns the week-one date while in term', () => {
    const now = new Date('2026-10-01T09:00:00');
    expect(inferWeekOneMonday([SUMMER_2026, WINTER_2027], now)).toBe('2026-09-14');
  });
  it('returns null with no matching break data', () => {
    expect(inferWeekOneMonday([], new Date('2026-10-01'))).toBeNull();
  });
  it('returns null while on break (no current term to infer week-one for)', () => {
    const now = new Date('2027-02-01T00:00:00');
    expect(inferWeekOneMonday([SUMMER_2026, WINTER_2027], now)).toBeNull();
  });
});
