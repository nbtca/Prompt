import type { Calendar, CalendarEvent } from '@nbtca/nbtcal';
import { addLocalDays } from '../core/calendar-day.js';
import { fmt, t } from '../i18n/index.js';

const UPCOMING_DAYS = 30;
const YEAR_DAYS = 365;

export function weekRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const mondayOffset = (start.getDay() + 6) % 7; // days since Monday
  start.setDate(start.getDate() - mondayOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

export function dayRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start, end };
}

export function eventEnd(event: CalendarEvent): Date {
  return (
    event.end ??
    (event.isAllDay
      ? new Date(event.start.getFullYear(), event.start.getMonth(), event.start.getDate() + 1)
      : event.start)
  );
}

export function hasEnded(event: CalendarEvent, now: Date): boolean {
  return event.start < now && eventEnd(event) <= now;
}

export function currentEvents(calendar: Pick<Calendar, 'inRange'>, now: Date): CalendarEvent[] {
  const { start } = dayRange(now);
  const end = new Date(now.getTime() + UPCOMING_DAYS * 86_400_000);
  return calendar.inRange(start, end).filter((event) => !hasEnded(event, now));
}

export function pastYearRange(now: Date): { start: Date; end: Date } {
  return { start: addLocalDays(now, -YEAR_DAYS), end: now };
}

export function pastEvents(calendar: Pick<Calendar, 'inRange'>, now: Date): CalendarEvent[] {
  const { start, end } = pastYearRange(now);
  return calendar
    .inRange(start, end)
    .filter((event) => hasEnded(event, now))
    .reverse();
}

export function searchEvents(
  calendar: Pick<Calendar, 'inRange'>,
  query: string,
  now: Date,
): { upcoming: CalendarEvent[]; past: CalendarEvent[] } {
  const pool = calendar.inRange(pastYearRange(now).start, addLocalDays(now, YEAR_DAYS));
  const matches = filterEvents(pool, query);
  return {
    upcoming: matches.filter((event) => !hasEnded(event, now)),
    past: matches.filter((event) => hasEnded(event, now)).reverse(),
  };
}

export function monthRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

export function filterEvents(events: CalendarEvent[], query: string): CalendarEvent[] {
  const q = query.trim().toLowerCase();
  if (!q) return events;
  return events.filter(
    (e) =>
      (e.title ?? '').toLowerCase().includes(q) || (e.location ?? '').toLowerCase().includes(q),
  );
}

export interface Countdown {
  past: boolean;
  days: number;
  hours: number;
  minutes: number;
}

export function countdownParts(target: Date, now: Date): Countdown {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return { past: true, days: 0, hours: 0, minutes: 0 };
  const totalMin = Math.floor(ms / 60000);
  return {
    past: false,
    days: Math.floor(totalMin / 1440),
    hours: Math.floor((totalMin % 1440) / 60),
    minutes: totalMin % 60,
  };
}

export function formatDuration(p: Countdown): string {
  const d = t().calendar.duration;
  if (p.days > 0) return fmt(d.days, { days: p.days, hours: p.hours });
  if (p.hours > 0) return fmt(d.hours, { hours: p.hours, minutes: p.minutes });
  return fmt(d.minutes, { minutes: p.minutes });
}

/** True once a countdown is close enough to call out visually (default: 15
 * minutes or less). A `past` countdown is never urgent — there's nothing
 * left to hurry for. */
export function isCountdownUrgent(p: Countdown, thresholdMinutes = 15): boolean {
  if (p.past) return false;
  const totalMinutes = p.days * 1440 + p.hours * 60 + p.minutes;
  return totalMinutes <= thresholdMinutes;
}

export function buildExportFilename(event: CalendarEvent): string {
  const cleaned = (event.title ?? '')
    .replace(/[^\p{L}\p{N}\-_ ]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return `${cleaned || 'event'}.ics`;
}
