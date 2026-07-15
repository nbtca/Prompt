import type { CalendarEvent } from '@nbtca/nbtcal';

export function weekRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const mondayOffset = (start.getDay() + 6) % 7; // days since Monday
  start.setDate(start.getDate() - mondayOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
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
      (e.title ?? '').toLowerCase().includes(q) ||
      (e.location ?? '').toLowerCase().includes(q),
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
