import { describe, expect, it } from 'vitest';
import type { AcademicTerm, Timetable } from '@nbtca/nbtcal/timetable';
import { sanitizeAcademicTerm, sanitizeTimetable } from './timetable-sanitize.js';

const timetable: Timetable = {
  term: { academicYear: '2026', semester: '3' },
  meetings: [
    {
      sourceId: null,
      courseName: 'Math\nforged\u001B[2J',
      teacherNames: ['Dr\tLi\u001B]52;c;YWJj\u0007'],
      location: 'Room\n201',
      weekday: 1,
      startPeriod: 1,
      endPeriod: 1,
      weeks: [1],
      kind: 'regular',
    },
  ],
  unresolvedItems: [
    { kind: 'practice', itemIndex: 0, sourceFields: { kcmc: 'Fitness\u001B[31m' } },
  ],
  periods: [{ period: 1, label: 'First\nperiod', start: '08:00', end: '08:45' }],
  calendarDays: [],
  warnings: [],
  fetchedAt: new Date('2026-09-07T00:00:00Z'),
};

describe('timetable sanitization', () => {
  it('sanitizes every remote display field as a terminal line', () => {
    const result = sanitizeTimetable(timetable);
    expect(result.meetings[0]).toMatchObject({
      courseName: 'Math forged',
      teacherNames: ['Dr Li'],
      location: 'Room 201',
    });
    expect(result.periods[0]?.label).toBe('First period');
    expect(result.unresolvedItems[0]?.sourceFields).toEqual({ kcmc: 'Fitness' });
  });

  it('validates term codes and sanitizes labels', () => {
    const term: AcademicTerm = {
      academicYear: '2026',
      semester: '3',
      academicYearLabel: '2026\nforged',
      semesterLabel: 'Term\u001B[31m',
      current: true,
    };
    expect(sanitizeAcademicTerm(term)).toMatchObject({
      academicYearLabel: '2026 forged',
      semesterLabel: 'Term',
    });
    expect(() => sanitizeAcademicTerm({ ...term, semester: '../escape' })).toThrow();
  });
});
