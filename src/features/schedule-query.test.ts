import { describe, it, expect } from 'vitest';
import type { TimetableMeeting, TimetablePeriod } from '@nbtca/nbtcal/timetable';
import { currentWeekNumber, campusWeekday, meetingsInWeek, meetingsOnDay, periodStartDate, nextMeeting } from './schedule-query.js';

const periods: TimetablePeriod[] = [
  { period: 1, label: null, start: '08:00', end: '08:45' },
  { period: 2, label: null, start: '08:55', end: '09:40' },
  { period: 3, label: null, start: '10:00', end: '10:45' },
];
function m(o: Partial<TimetableMeeting>): TimetableMeeting {
  return { sourceId: null, courseName: 'C', teacherNames: [], location: null, weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1], kind: 'regular', ...o };
}

describe('currentWeekNumber', () => {
  it('week 1 on the Monday itself and mid-week', () => {
    expect(currentWeekNumber('2026-09-07', new Date('2026-09-07T09:00:00'))).toBe(1);
    expect(currentWeekNumber('2026-09-07', new Date('2026-09-11T09:00:00'))).toBe(1);
  });
  it('week 2 after 7 days; pre-semester is <= 0', () => {
    expect(currentWeekNumber('2026-09-07', new Date('2026-09-14T00:00:00'))).toBe(2);
    expect(currentWeekNumber('2026-09-07', new Date('2026-09-06T00:00:00'))).toBe(0);
  });
});

describe('campusWeekday', () => {
  it('maps Sunday=7, Monday=1', () => {
    expect(campusWeekday(new Date('2026-09-07T00:00:00'))).toBe(1); // Monday
    expect(campusWeekday(new Date('2026-09-13T00:00:00'))).toBe(7); // Sunday
  });
});

describe('meetings filters', () => {
  const list = [m({ courseName: 'Math', weekday: 1, weeks: [1, 3] }), m({ courseName: 'Phys', weekday: 2, weeks: [1] })];
  it('meetingsInWeek', () => { expect(meetingsInWeek(list, 3).map(x => x.courseName)).toEqual(['Math']); });
  it('meetingsOnDay filters weekday+week', () => { expect(meetingsOnDay(list, 1, 1).map(x => x.courseName)).toEqual(['Math']); });
});

describe('periodStartDate + nextMeeting', () => {
  it('computes the real datetime of a period', () => {
    const d = periodStartDate('2026-09-07', 2, 3, 3, periods)!; // week2 Wed period3 10:00
    expect(d.getFullYear()).toBe(2026);
    expect(d.getHours()).toBe(10); expect(d.getMinutes()).toBe(0);
  });
  it('nextMeeting returns the soonest future class', () => {
    const list = [m({ courseName: 'Math', weekday: 1, startPeriod: 1, weeks: [1] })]; // Mon wk1 08:00
    const n = nextMeeting(list, periods, '2026-09-07', new Date('2026-09-07T06:00:00'));
    expect(n?.meeting.courseName).toBe('Math');
    expect(n?.start.getHours()).toBe(8);
  });
  it('nextMeeting is null when nothing is left', () => {
    const list = [m({ weekday: 1, startPeriod: 1, weeks: [1] })];
    expect(nextMeeting(list, periods, '2026-09-07', new Date('2027-01-01T00:00:00'))).toBeNull();
  });
});
