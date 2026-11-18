import { describe, it, expect } from 'vitest';
import { campusDateTime, type Timetable, type TimetableMeeting } from '@nbtca/nbtcal/timetable';
import { courseProgress } from './course-progress.js';

const meeting = (o: Partial<TimetableMeeting>): TimetableMeeting => ({
  sourceId: null,
  courseName: 'Accounting',
  teacherNames: [],
  location: 'SF104',
  weekday: 4,
  startPeriod: 1,
  endPeriod: 2,
  weeks: [1, 2, 3],
  kind: 'regular',
  ...o,
});

const thursday = meeting({});
const makeUp = meeting({ weekday: 1, weeks: [4] });
const timetable: Timetable = {
  term: { academicYear: '2026', semester: '3' },
  meetings: [thursday, makeUp, meeting({ courseName: 'Other', weekday: 2, weeks: [1, 2, 3, 4] })],
  unresolvedItems: [],
  periods: [
    { period: 1, label: null, start: '08:00', end: '08:45' },
    { period: 2, label: null, start: '08:50', end: '09:35' },
  ],
  calendarDays: [],
  warnings: [],
  fetchedAt: new Date('2026-09-01T00:00:00Z'),
};
const WEEK_ONE = '2026-09-14';

describe('courseProgress', () => {
  it('counts every slot of the course and finds the next session', () => {
    const now = campusDateTime('2026-09-25', '12:00');
    const progress = courseProgress(timetable, WEEK_ONE, thursday, now);
    expect(progress).toMatchObject({ held: 2, total: 4, termWeeks: 4, currentWeek: 2 });
    expect(progress?.next?.date).toBe('2026-10-01');
    expect(progress?.live).toBeUndefined();
    expect(progress?.others).toEqual([makeUp]);
  });

  it('reports the session in progress', () => {
    const now = campusDateTime('2026-09-17', '08:30');
    const progress = courseProgress(timetable, WEEK_ONE, thursday, now);
    expect(progress?.live?.date).toBe('2026-09-17');
    expect(progress?.held).toBe(0);
  });

  it('has no next session once the course is over', () => {
    const progress = courseProgress(timetable, WEEK_ONE, thursday, new Date('2026-12-01'));
    expect(progress).toMatchObject({ held: 4, total: 4 });
    expect(progress?.next).toBeUndefined();
  });
});
