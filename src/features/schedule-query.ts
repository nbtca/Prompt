import type { TimetableMeeting, TimetablePeriod } from '@nbtca/nbtcal/timetable';

const DAY_MS = 86400000;

export function currentWeekNumber(weekOneMonday: string, now: Date): number {
  const base = new Date(`${weekOneMonday}T00:00:00`);
  const days = Math.floor((now.getTime() - base.getTime()) / DAY_MS);
  return Math.floor(days / 7) + 1;
}

export function campusWeekday(now: Date): number {
  return ((now.getDay() + 6) % 7) + 1;
}

export function meetingsInWeek(meetings: readonly TimetableMeeting[], week: number): TimetableMeeting[] {
  return meetings.filter((mtg) => mtg.weeks.includes(week));
}

export function meetingsOnDay(meetings: readonly TimetableMeeting[], weekday: number, week: number): TimetableMeeting[] {
  return meetings
    .filter((mtg) => mtg.weekday === weekday && mtg.weeks.includes(week))
    .sort((a, b) => a.startPeriod - b.startPeriod);
}

export function periodStartDate(
  weekOneMonday: string, week: number, weekday: number, period: number, periods: readonly TimetablePeriod[],
): Date | null {
  const p = periods.find((x) => x.period === period);
  if (!p) return null;
  const base = new Date(`${weekOneMonday}T00:00:00`);
  const date = new Date(base.getTime() + ((week - 1) * 7 + (weekday - 1)) * DAY_MS);
  const parts = p.start.split(':');
  date.setHours(Number.parseInt(parts[0] ?? '0', 10), Number.parseInt(parts[1] ?? '0', 10), 0, 0);
  return date;
}

export interface NextClass { meeting: TimetableMeeting; start: Date; }

export function nextMeeting(
  meetings: readonly TimetableMeeting[], periods: readonly TimetablePeriod[], weekOneMonday: string, now: Date,
): NextClass | null {
  let best: NextClass | null = null;
  for (const meeting of meetings) {
    for (const week of meeting.weeks) {
      const start = periodStartDate(weekOneMonday, week, meeting.weekday, meeting.startPeriod, periods);
      if (start && start.getTime() > now.getTime() && (!best || start.getTime() < best.start.getTime())) {
        best = { meeting, start };
      }
    }
  }
  return best;
}

/** The meeting occupying a grid cell, whether it starts there or is a later
 * period of a meeting that started earlier the same day -- one condition
 * (`startPeriod <= period <= endPeriod`) covers both cases, matching
 * renderWeekGrid's own starting/continuing lookup so "does this cell have a
 * meeting" and "what does the grid actually draw there" never disagree. */
export function meetingAtCursor(
  meetings: readonly TimetableMeeting[], week: number, cursor: { weekday: number; period: number },
): TimetableMeeting | null {
  return meetingsInWeek(meetings, week).find(
    (m) => m.weekday === cursor.weekday && m.startPeriod <= cursor.period && cursor.period <= m.endPeriod,
  ) ?? null;
}
