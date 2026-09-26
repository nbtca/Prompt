import {
  campusDateTime,
  campusIsoDate,
  createTimetableSchedule,
  type Timetable,
  type TimetableSchedule,
  type Weekday,
} from '@nbtca/nbtcal/timetable';
import { renderNextClassBanner, renderTodayTimeline } from './schedule-render.js';
import { loadCurrentPointer, loadTimetableCache } from './schedule-store.js';
import { sanitizeTimetable } from './timetable-sanitize.js';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const satisfies readonly Weekday[];
const WEEK_MS = 7 * 86_400_000;

export interface CachedSchedule {
  timetable: Timetable;
  weekOneMonday: string;
}

function loadCachedTimetable(): CachedSchedule | null {
  const pointer = loadCurrentPointer();
  if (!pointer) return null;
  const value = loadTimetableCache(pointer.termKey);
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<Timetable>;
  if (
    !Array.isArray(candidate.meetings) ||
    !Array.isArray(candidate.periods) ||
    !Array.isArray(candidate.unresolvedItems) ||
    !Array.isArray(candidate.calendarDays) ||
    !Array.isArray(candidate.warnings)
  ) {
    return null;
  }
  const fetchedAt = new Date(candidate.fetchedAt as unknown as string);
  if (Number.isNaN(fetchedAt.getTime())) return null;
  return {
    timetable: sanitizeTimetable({ ...candidate, fetchedAt } as Timetable),
    weekOneMonday: pointer.weekOneMonday,
  };
}

export function peekSchedule(): CachedSchedule | null {
  try {
    return loadCachedTimetable();
  } catch {
    return null;
  }
}

function scheduleOf(cached: CachedSchedule): TimetableSchedule {
  return createTimetableSchedule(cached.timetable, { weekOneMonday: cached.weekOneMonday });
}

export function nextClassLine(
  cached: CachedSchedule,
  now: Date = new Date(),
  cols = Number.POSITIVE_INFINITY,
): string {
  try {
    return renderNextClassBanner(scheduleOf(cached).next(now), now, cols, false);
  } catch {
    return '';
  }
}

export function todayLines(
  cached: CachedSchedule,
  now: Date = new Date(),
  cols = Number.POSITIVE_INFINITY,
): string[] {
  try {
    const schedule = scheduleOf(cached);
    const today = schedule.meetingsOnDay(schedule.weekAt(now), schedule.weekdayAt(now));
    return renderTodayTimeline(today, cached.timetable.periods, now, cols).split('\n');
  } catch {
    return [];
  }
}

export interface WeekAheadInfo {
  weekStart: string;
  classDays: boolean[];
}

export function weekAheadInfo(
  cached: CachedSchedule,
  now: Date = new Date(),
): WeekAheadInfo | null {
  try {
    const schedule = scheduleOf(cached);
    const week = schedule.weekAt(now);
    if (week < 1) return null;
    const classDays = WEEKDAYS.map((weekday) => schedule.meetingsOnDay(week, weekday).length > 0);
    const weekStart =
      campusDateTime(cached.weekOneMonday, '00:00').getTime() + (week - 1) * WEEK_MS;
    return { weekStart: campusIsoDate(new Date(weekStart)), classDays };
  } catch {
    return null;
  }
}
