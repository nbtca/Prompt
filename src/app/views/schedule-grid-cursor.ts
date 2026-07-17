import type { Timetable, TimetableMeeting, TimetablePeriod } from '@nbtca/nbtcal/timetable';
import { meetingAtCursor } from '../../features/schedule-query.js';

export interface GridCursor { weekday: number; period: number; }

export const KEY_ARROW_LEFT = '\x1b[D';
export const KEY_ARROW_RIGHT = '\x1b[C';
export const KEY_ARROW_UP = '\x1b[A';
export const KEY_ARROW_DOWN = '\x1b[B';
export const KEY_ENTER_CR = '\r';
export const KEY_ENTER_LF = '\n';

/** The cursor's starting position on entering hub/week mode: today's own
 * weekday (falling back to Monday on a weekend, since the grid's Sat/Sun
 * columns are always empty for a personal timetable) and the first period
 * this term's own period table actually defines. */
export function defaultGridCursor(todayWeekday: number, periods: readonly TimetablePeriod[]): GridCursor {
  const sorted = [...periods].sort((a, b) => a.period - b.period);
  const firstPeriod = sorted[0]?.period ?? 1;
  const weekday = todayWeekday >= 1 && todayWeekday <= 5 ? todayWeekday : 1;
  return { weekday, period: firstPeriod };
}

/** Moves the cursor one weekday left/right, clamped to [1, 7] with no
 * wraparound -- a 7-day week has a real fixed edge, unlike a scrollable
 * list where wrapping back to the top makes sense. */
export function moveCursorWeekday(cursor: GridCursor, delta: -1 | 1): GridCursor {
  return { ...cursor, weekday: Math.max(1, Math.min(7, cursor.weekday + delta)) };
}

/** Moves the cursor to the previous/next *defined* period in the sorted
 * period table (not period±1 -- real period numbers aren't always
 * contiguous), clamped at the first/last period with no wraparound. */
export function moveCursorPeriod(cursor: GridCursor, periods: readonly TimetablePeriod[], delta: -1 | 1): GridCursor {
  const sorted = [...periods].sort((a, b) => a.period - b.period);
  if (sorted.length === 0) return cursor;
  const idx = sorted.findIndex((p) => p.period === cursor.period);
  const nextIdx = Math.max(0, Math.min(sorted.length - 1, (idx === -1 ? 0 : idx) + delta));
  return { ...cursor, period: sorted[nextIdx]!.period };
}

export type GridKeyResult =
  | { kind: 'moveCursor'; cursor: GridCursor }
  | { kind: 'openDetail'; meeting: TimetableMeeting }
  | { kind: 'none' };

/** Pure key-to-action mapping shared by hub mode's inline grid and the
 * standalone full-screen 'week' mode -- both are cursor-navigable over the
 * exact same rules, so this is the one place that logic lives. */
export function handleGridKey(
  key: string, cursor: GridCursor, tt: Pick<Timetable, 'meetings' | 'periods'>, week: number,
): GridKeyResult {
  if (key === KEY_ARROW_LEFT) return { kind: 'moveCursor', cursor: moveCursorWeekday(cursor, -1) };
  if (key === KEY_ARROW_RIGHT) return { kind: 'moveCursor', cursor: moveCursorWeekday(cursor, 1) };
  if (key === KEY_ARROW_UP) return { kind: 'moveCursor', cursor: moveCursorPeriod(cursor, tt.periods, -1) };
  if (key === KEY_ARROW_DOWN) return { kind: 'moveCursor', cursor: moveCursorPeriod(cursor, tt.periods, 1) };
  if (key === KEY_ENTER_CR || key === KEY_ENTER_LF) {
    const meeting = meetingAtCursor(tt.meetings, week, cursor);
    return meeting ? { kind: 'openDetail', meeting } : { kind: 'none' };
  }
  return { kind: 'none' };
}
