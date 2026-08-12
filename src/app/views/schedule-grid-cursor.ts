import {
  createTimetableSchedule,
  type Timetable,
  type TimetableMeeting,
  type TimetablePeriod,
  type Weekday,
} from '@nbtca/nbtcal/timetable';

export interface GridCursor {
  weekday: Weekday;
  period: number;
}

export const KEY_ARROW_LEFT = '\x1b[D';
export const KEY_ARROW_RIGHT = '\x1b[C';
export const KEY_ARROW_UP = '\x1b[A';
export const KEY_ARROW_DOWN = '\x1b[B';
export const KEY_ENTER_CR = '\r';
export const KEY_ENTER_LF = '\n';

export function defaultGridCursor(
  todayWeekday: number,
  periods: readonly TimetablePeriod[],
): GridCursor {
  const sorted = [...periods].sort((a, b) => a.period - b.period);
  const firstPeriod = sorted[0]?.period ?? 1;
  const weekday = (todayWeekday >= 1 && todayWeekday <= 5 ? todayWeekday : 1) as Weekday;
  return { weekday, period: firstPeriod };
}

export function moveCursorWeekday(cursor: GridCursor, delta: -1 | 1): GridCursor {
  return {
    ...cursor,
    weekday: Math.max(1, Math.min(7, cursor.weekday + delta)) as Weekday,
  };
}

export function moveCursorPeriod(
  cursor: GridCursor,
  periods: readonly TimetablePeriod[],
  delta: -1 | 1,
): GridCursor {
  const sorted = [...periods].sort((a, b) => a.period - b.period);
  if (sorted.length === 0) return cursor;
  const idx = sorted.findIndex((p) => p.period === cursor.period);
  const nextIdx = Math.max(0, Math.min(sorted.length - 1, (idx === -1 ? 0 : idx) + delta));
  const nextPeriod = sorted[nextIdx];
  return nextPeriod ? { ...cursor, period: nextPeriod.period } : cursor;
}

export type GridKeyResult =
  | { kind: 'moveCursor'; cursor: GridCursor }
  | { kind: 'openDetail'; meeting: TimetableMeeting }
  | { kind: 'none' };

export function handleGridKey(
  key: string,
  cursor: GridCursor,
  tt: Timetable,
  week: number,
): GridKeyResult {
  if (key === KEY_ARROW_LEFT) return { kind: 'moveCursor', cursor: moveCursorWeekday(cursor, -1) };
  if (key === KEY_ARROW_RIGHT) return { kind: 'moveCursor', cursor: moveCursorWeekday(cursor, 1) };
  if (key === KEY_ARROW_UP)
    return { kind: 'moveCursor', cursor: moveCursorPeriod(cursor, tt.periods, -1) };
  if (key === KEY_ARROW_DOWN)
    return { kind: 'moveCursor', cursor: moveCursorPeriod(cursor, tt.periods, 1) };
  if (key === KEY_ENTER_CR || key === KEY_ENTER_LF) {
    const meeting = createTimetableSchedule(tt).meetingAt(week, cursor.weekday, cursor.period);
    return meeting ? { kind: 'openDetail', meeting } : { kind: 'none' };
  }
  return { kind: 'none' };
}
