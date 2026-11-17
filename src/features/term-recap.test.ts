import { describe, it, expect } from 'vitest';
import { campusDateTime, type Timetable, type TimetableMeeting } from '@nbtca/nbtcal/timetable';
import { termRecap } from './term-recap.js';

const meeting = (
  courseName: string,
  weekday: TimetableMeeting['weekday'],
  startPeriod: number,
  endPeriod: number,
  location: string | null,
): TimetableMeeting => ({
  sourceId: null,
  courseName,
  teacherNames: [],
  location,
  weekday,
  startPeriod,
  endPeriod,
  weeks: [1, 2],
  kind: 'regular',
});

const timetable: Timetable = {
  term: { academicYear: '2026', semester: '1' },
  meetings: [
    meeting('Calculus', 1, 1, 2, '3-201'),
    meeting('Physics', 1, 3, 3, '3-201'),
    meeting('Networks', 3, 4, 4, 'Lab 402'),
  ],
  unresolvedItems: [],
  periods: [
    { period: 1, label: null, start: '08:00', end: '08:45' },
    { period: 2, label: null, start: '08:55', end: '09:40' },
    { period: 3, label: null, start: '10:00', end: '11:50' },
    { period: 4, label: null, start: '18:30', end: '21:15' },
  ],
  calendarDays: [],
  warnings: [],
  fetchedAt: new Date('2026-09-01T00:00:00Z'),
};

const WEEK_ONE = '2026-09-14';

describe('termRecap', () => {
  it('counts only the classes that have ended', () => {
    const recap = termRecap(timetable, WEEK_ONE, campusDateTime('2026-09-16', '12:00'));
    expect(recap).toMatchObject({
      finished: false,
      classes: 2,
      hours: 3.5,
      courses: 2,
      weeks: 1,
      earlyClasses: 1,
      busiestDay: { date: '2026-09-14', classes: 2, from: '08:00', to: '11:50' },
      topCourse: { name: 'Physics', hours: 1.8 },
      favoriteRoom: { name: '3-201', visits: 2 },
    });
    expect(recap?.progress).toBeCloseTo(2 / 6);
    expect(recap?.events).toBeUndefined();
  });

  it('marks the term finished and counts club events between the first and last class', () => {
    const seen: [Date, Date][] = [];
    const recap = termRecap(timetable, WEEK_ONE, campusDateTime('2026-10-01', '00:00'), (s, e) => {
      seen.push([s, e]);
      return 4;
    });
    expect(recap).toMatchObject({ finished: true, progress: 1, classes: 6, weeks: 2, events: 4 });
    expect(seen).toEqual([
      [campusDateTime('2026-09-14', '08:00'), campusDateTime('2026-09-23', '21:15')],
    ]);
  });

  it('returns nothing before the first class ends or when the timetable cannot be scheduled', () => {
    expect(termRecap(timetable, WEEK_ONE, campusDateTime('2026-09-14', '08:30'))).toBeUndefined();
    expect(termRecap(timetable, '2026-09-15', new Date('2026-12-01'))).toBeUndefined();
  });
});
