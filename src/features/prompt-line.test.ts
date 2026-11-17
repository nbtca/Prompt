import { describe, it, expect, beforeEach } from 'vitest';
import { campusDateTime, type Timetable } from '@nbtca/nbtcal/timetable';
import { promptClass, promptLine, serializePromptClass } from './prompt-line.js';
import { setLanguage } from '../i18n/index.js';

const meeting = (courseName: string, startPeriod: number) => ({
  sourceId: null,
  courseName,
  teacherNames: [],
  location: '3-201',
  weekday: 1 as const,
  startPeriod,
  endPeriod: startPeriod,
  weeks: [1, 2],
  kind: 'regular' as const,
});

const cached = {
  weekOneMonday: '2026-09-14',
  timetable: {
    term: { academicYear: '2026', semester: '1' },
    meetings: [meeting('Calculus', 1), meeting('Computer Networks and Distributed Systems', 2)],
    unresolvedItems: [],
    periods: [
      { period: 1, label: null, start: '08:00', end: '09:40' },
      { period: 2, label: null, start: '14:00', end: '15:40' },
    ],
    calendarDays: [],
    warnings: [],
    fetchedAt: new Date('2026-09-01T00:00:00Z'),
  } satisfies Timetable,
};

const at = (time: string, date = '2026-09-14') => campusDateTime(date, time);

beforeEach(() => {
  setLanguage('en');
});

describe('promptClass', () => {
  it('counts down to the end of the class in progress', () => {
    const value = promptClass(cached, at('09:23'));
    expect(value).toMatchObject({ state: 'live', course: 'Calculus', minutes: 17 });
    expect(promptLine(value, true)).toBe('● Calculus · 3-201 · 17 min left');
  });

  it('counts down to a class starting within the hour', () => {
    expect(promptLine(promptClass(cached, at('13:48')), true)).toBe(
      '○ Computer Networ… · 3-201 · in 12 min',
    );
  });

  it('shows the start time of a later class and uses ASCII when asked', () => {
    expect(promptLine(promptClass(cached, at('10:00')), false)).toBe(
      '- Computer Netw... | 3-201 | 14:00',
    );
  });

  it('stays silent once the day is over, even with classes later in the term', () => {
    const value = promptClass(cached, at('16:00'));
    expect(value).toBeUndefined();
    expect(promptLine(value, true)).toBe('');
    expect(serializePromptClass(value)).toBeNull();
  });

  it('localizes the countdown', () => {
    setLanguage('zh');
    expect(promptLine(promptClass(cached, at('09:23')), true)).toBe(
      '● Calculus · 3-201 · 还剩 17 分钟',
    );
  });
});
