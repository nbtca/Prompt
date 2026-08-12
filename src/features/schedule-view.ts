import { createTimetableSchedule, type Timetable, type Weekday } from '@nbtca/nbtcal/timetable';
import { addLocalDays, parseLocalMonday } from '../core/calendar-day.js';
import { renderNextClassBanner, renderTodayTimeline } from './schedule-render.js';
import { loadCurrentPointer, loadTimetableCache } from './schedule-store.js';
import { sanitizeTimetable } from './timetable-sanitize.js';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const satisfies readonly Weekday[];

function loadCachedTimetable(): {
  timetable: Timetable;
  weekOneMonday: string;
} | null {
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

export function peekNextClassLine(now: Date = new Date()): string {
  try {
    const cached = loadCachedTimetable();
    if (!cached) return '';
    const schedule = createTimetableSchedule(cached.timetable, {
      weekOneMonday: cached.weekOneMonday,
    });
    return renderNextClassBanner(schedule.next(now), now);
  } catch {
    return '';
  }
}

export function peekTodayLines(now: Date = new Date()): string[] {
  try {
    const cached = loadCachedTimetable();
    if (!cached) return [];
    const schedule = createTimetableSchedule(cached.timetable, {
      weekOneMonday: cached.weekOneMonday,
    });
    const week = schedule.weekAt(now);
    const today = schedule.meetingsOnDay(week, schedule.weekdayAt(now));
    return renderTodayTimeline(today, cached.timetable.periods, now).split('\n');
  } catch {
    return [];
  }
}

export interface WeekAheadInfo {
  weekStartDate: Date;
  classDays: boolean[];
}

export function peekWeekAheadInfo(now: Date = new Date()): WeekAheadInfo | null {
  try {
    const cached = loadCachedTimetable();
    if (!cached) return null;
    const schedule = createTimetableSchedule(cached.timetable, {
      weekOneMonday: cached.weekOneMonday,
    });
    const week = schedule.weekAt(now);
    if (week < 1) return null;
    const classDays = WEEKDAYS.map((weekday) => schedule.meetingsOnDay(week, weekday).length > 0);
    const weekStartDate = addLocalDays(parseLocalMonday(cached.weekOneMonday), (week - 1) * 7);
    return { weekStartDate, classDays };
  } catch {
    return null;
  }
}

export function peekUnresolvedCount(): number {
  try {
    return loadCachedTimetable()?.timetable.unresolvedItems.length ?? 0;
  } catch {
    return 0;
  }
}
