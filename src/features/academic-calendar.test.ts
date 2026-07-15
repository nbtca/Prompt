import { describe, it, expect } from 'vitest';
import {
  isAcademicBreakEvent, findBreakEvents, currentAcademicWindow, inferWeekOneMonday,
} from './academic-calendar.js';
import type { CalendarEvent } from '@nbtca/nbtcal';

function ev(title: string, start: string, end: string, isAllDay = true): CalendarEvent {
  return {
    uid: `${title}-${start}`, title, start: new Date(`${start}T00:00:00`),
    end: new Date(`${end}T00:00:00`), isAllDay, location: null, description: null,
    recurring: false,
  };
}

// Real ical.nbtca.space data (fetched 2026-07-15) — the club's actual
// naming convention: a "[NBT] " source prefix, "暑期" (not "暑假") for the
// 2026 summer break, and direct "X季学期开始上课" markers rather than any
// break-boundary inference.
const FALL_2026_START = ev('[NBT] 秋季学期开始上课', '2026-09-14', '2026-09-15');
const SPRING_2027_START = ev('[NBT] 春季学期开始上课', '2027-03-01', '2027-03-02');
const SUMMER_2026 = ev('[NBT] 暑期', '2026-07-11', '2026-09-14');
const WINTER_2027 = ev('[NBT] 寒假', '2027-01-20', '2027-02-26');
const EXAM_WEEK_FALL_2026 = ev('[NBT] 期末考试周', '2027-01-13', '2027-01-20');
const NATIONAL_DAY = ev('[NBT] 国庆节放假', '2026-10-01', '2026-10-08'); // 7-day public holiday, must NOT be treated as a term break
const CLUB_EVENT = ev('NWDC', '2026-07-17', '2026-07-18', false); // no bracket prefix, not all-day

describe('isAcademicBreakEvent', () => {
  it('accepts the real "暑期" summer-break event (not just "暑假")', () => {
    expect(isAcademicBreakEvent(SUMMER_2026)).toBe(true);
  });
  it('accepts "寒假" winter break', () => {
    expect(isAcademicBreakEvent(WINTER_2027)).toBe(true);
  });
  it('rejects a short public holiday even though its title also ends in 假', () => {
    expect(isAcademicBreakEvent(NATIONAL_DAY)).toBe(false);
  });
  it('rejects a same-titled but non-all-day event', () => {
    expect(isAcademicBreakEvent({ ...SUMMER_2026, isAllDay: false })).toBe(false);
  });
  it('rejects a club event with no institutional prefix', () => {
    expect(isAcademicBreakEvent(CLUB_EVENT)).toBe(false);
  });
});

describe('findBreakEvents', () => {
  it('returns only break events, sorted by start, ignoring public holidays and club events', () => {
    const found = findBreakEvents([WINTER_2027, NATIONAL_DAY, CLUB_EVENT, SUMMER_2026]);
    expect(found).toEqual([SUMMER_2026, WINTER_2027]);
  });
});

describe('currentAcademicWindow', () => {
  it('returns null when the feed has no institutional markers at all', () => {
    expect(currentAcademicWindow([CLUB_EVENT], new Date('2026-10-01'))).toBeNull();
  });

  it('reports onBreak while inside the real 暑期 window (e.g. "today")', () => {
    // This is literally today's real date in the session this was built in.
    const now = new Date('2026-07-15T12:00:00');
    const w = currentAcademicWindow([FALL_2026_START, SUMMER_2026, SPRING_2027_START], now);
    expect(w).toEqual({ status: 'onBreak', breakTitle: '暑期' });
  });

  it('identifies term 1 directly from the semester-start marker, week-one = its exact date', () => {
    const now = new Date('2026-10-01T09:00:00');
    const w = currentAcademicWindow(
      [FALL_2026_START, SUMMER_2026, WINTER_2027, EXAM_WEEK_FALL_2026], now,
    );
    expect(w).toEqual({
      status: 'inTerm', academicYear: '2026-2027', semester: '1',
      weekOneMonday: '2026-09-14', currentWeek: 3,
      nextBreakStart: '2027-01-13', nextBreakTitle: '期末考试周',
    });
  });

  it('identifies term 2 with the correct academic-year label', () => {
    const now = new Date('2027-03-08T09:00:00');
    const w = currentAcademicWindow([FALL_2026_START, SPRING_2027_START, WINTER_2027], now);
    expect(w).toEqual({
      status: 'inTerm', academicYear: '2026-2027', semester: '2',
      weekOneMonday: '2027-03-01', currentWeek: 2,
    });
  });

  it('a short public holiday mid-term does not get reported as onBreak', () => {
    const now = new Date('2026-10-03T09:00:00'); // inside 国庆节放假
    const w = currentAcademicWindow([FALL_2026_START, SUMMER_2026, NATIONAL_DAY], now);
    expect(w).toMatchObject({ status: 'inTerm', semester: '1' });
  });

  it('omits nextBreakStart/nextBreakTitle when no future milestone is known yet', () => {
    const now = new Date('2026-10-01T09:00:00');
    const w = currentAcademicWindow([FALL_2026_START, SUMMER_2026], now);
    expect(w).toEqual({
      status: 'inTerm', academicYear: '2026-2027', semester: '1',
      weekOneMonday: '2026-09-14', currentWeek: 3,
    });
  });
});

describe('inferWeekOneMonday', () => {
  it('returns the exact semester-start date while in term', () => {
    const now = new Date('2026-10-01T09:00:00');
    expect(inferWeekOneMonday([FALL_2026_START, SUMMER_2026], now)).toBe('2026-09-14');
  });
  it('returns null with no matching institutional data', () => {
    expect(inferWeekOneMonday([CLUB_EVENT], new Date('2026-10-01'))).toBeNull();
  });
  it('while on break, infers the *upcoming* term\'s date directly — the term a student logging in during break almost certainly wants', () => {
    const now = new Date('2026-07-15T12:00:00'); // literally today, inside the real 暑期 window
    expect(inferWeekOneMonday([FALL_2026_START, SUMMER_2026], now)).toBe('2026-09-14');
  });

  it('returns null while on break with no known upcoming semester-start marker yet', () => {
    const now = new Date('2026-07-15T12:00:00');
    expect(inferWeekOneMonday([SUMMER_2026], now)).toBeNull();
  });
});
