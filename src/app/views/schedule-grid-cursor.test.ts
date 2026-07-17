import { describe, it, expect } from 'vitest';
import type { TimetableMeeting, TimetablePeriod } from '@nbtca/nbtcal/timetable';
import {
  defaultGridCursor, moveCursorWeekday, moveCursorPeriod, handleGridKey,
  KEY_ARROW_RIGHT, KEY_ENTER_CR,
} from './schedule-grid-cursor.js';

const periods: TimetablePeriod[] = [
  { period: 1, label: null, start: '08:00', end: '08:45' },
  { period: 2, label: null, start: '08:55', end: '09:40' },
  { period: 3, label: null, start: '10:00', end: '10:45' },
];
function mk(o: Partial<TimetableMeeting>): TimetableMeeting {
  return { sourceId: null, courseName: 'Math', teacherNames: [], location: null, weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1], kind: 'regular', ...o };
}

describe('defaultGridCursor', () => {
  it('defaults to today\'s weekday and the first defined period', () => {
    expect(defaultGridCursor(3, periods)).toEqual({ weekday: 3, period: 1 });
  });
  it('falls back to Monday on a weekend', () => {
    expect(defaultGridCursor(6, periods)).toEqual({ weekday: 1, period: 1 });
    expect(defaultGridCursor(7, periods)).toEqual({ weekday: 1, period: 1 });
  });
  it('uses the lowest period number when the period table starts above 1', () => {
    const laterPeriods = [{ period: 3, label: null, start: '10:00', end: '10:45' }];
    expect(defaultGridCursor(1, laterPeriods)).toEqual({ weekday: 1, period: 3 });
  });
});

describe('moveCursorWeekday', () => {
  it('moves left/right within [1,7]', () => {
    expect(moveCursorWeekday({ weekday: 3, period: 1 }, -1)).toEqual({ weekday: 2, period: 1 });
    expect(moveCursorWeekday({ weekday: 3, period: 1 }, 1)).toEqual({ weekday: 4, period: 1 });
  });
  it('does not wrap past Monday or Sunday', () => {
    expect(moveCursorWeekday({ weekday: 1, period: 1 }, -1)).toEqual({ weekday: 1, period: 1 });
    expect(moveCursorWeekday({ weekday: 7, period: 1 }, 1)).toEqual({ weekday: 7, period: 1 });
  });
});

describe('moveCursorPeriod', () => {
  it('moves to the previous/next defined period', () => {
    expect(moveCursorPeriod({ weekday: 1, period: 2 }, periods, -1)).toEqual({ weekday: 1, period: 1 });
    expect(moveCursorPeriod({ weekday: 1, period: 2 }, periods, 1)).toEqual({ weekday: 1, period: 3 });
  });
  it('does not wrap past the first or last period', () => {
    expect(moveCursorPeriod({ weekday: 1, period: 1 }, periods, -1)).toEqual({ weekday: 1, period: 1 });
    expect(moveCursorPeriod({ weekday: 1, period: 3 }, periods, 1)).toEqual({ weekday: 1, period: 3 });
  });
  it('is a no-op when the period table is empty', () => {
    expect(moveCursorPeriod({ weekday: 1, period: 1 }, [], 1)).toEqual({ weekday: 1, period: 1 });
  });
  it('uses table lookup, not period±1 arithmetic, with non-contiguous periods', () => {
    const nonContiguousPeriods: TimetablePeriod[] = [
      { period: 1, label: null, start: '08:00', end: '08:45' },
      { period: 3, label: null, start: '10:00', end: '10:45' },
      { period: 5, label: null, start: '13:00', end: '13:45' },
    ];
    // Moving from period 1 should land on period 3 (the next defined period in the table),
    // NOT period 2 (which doesn't exist)
    expect(moveCursorPeriod({ weekday: 1, period: 1 }, nonContiguousPeriods, 1)).toEqual({ weekday: 1, period: 3 });
    // Moving backward from period 5 should land on period 3, not period 4
    expect(moveCursorPeriod({ weekday: 1, period: 5 }, nonContiguousPeriods, -1)).toEqual({ weekday: 1, period: 3 });
  });
});

describe('handleGridKey', () => {
  const tt = { meetings: [mk({ weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1] })], periods };

  it('moves the cursor on an arrow key', () => {
    const result = handleGridKey(KEY_ARROW_RIGHT, { weekday: 1, period: 1 }, tt, 1);
    expect(result).toEqual({ kind: 'moveCursor', cursor: { weekday: 2, period: 1 } });
  });

  it('opens detail on Enter when the cursor cell has a meeting, whether starting or continuing', () => {
    const starting = handleGridKey(KEY_ENTER_CR, { weekday: 1, period: 1 }, tt, 1);
    expect(starting.kind).toBe('openDetail');
    const continuing = handleGridKey(KEY_ENTER_CR, { weekday: 1, period: 2 }, tt, 1);
    expect(continuing.kind).toBe('openDetail');
  });

  it('is a no-op on Enter when the cursor cell is empty', () => {
    expect(handleGridKey(KEY_ENTER_CR, { weekday: 2, period: 1 }, tt, 1)).toEqual({ kind: 'none' });
  });

  it('is a no-op for any other key', () => {
    expect(handleGridKey('x', { weekday: 1, period: 1 }, tt, 1)).toEqual({ kind: 'none' });
  });
});
