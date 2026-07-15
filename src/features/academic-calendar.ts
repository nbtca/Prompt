import type { CalendarEvent } from '@nbtca/nbtcal';
import { currentWeekNumber } from './schedule-query.js';

const BREAK_TITLES = new Set(['寒假', '暑假']);
const MIN_BREAK_DAYS = 3;
const DAY_MS = 86400000;

/** An all-day, multi-day event titled exactly 寒假/暑假 — the club-maintained
 * convention this feature relies on (see the 2026-07-15 design spec). Plain
 * title matching, no CATEGORIES/prefix: the feed is hand-edited via the
 * Google Calendar UI with no schema enforcement, and this is what a
 * maintainer would type anyway. */
export function isAcademicBreakEvent(e: CalendarEvent): boolean {
  if (!e.title || !BREAK_TITLES.has(e.title) || !e.isAllDay || !e.end) return false;
  return (e.end.getTime() - e.start.getTime()) / DAY_MS >= MIN_BREAK_DAYS;
}

export function findBreakEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  return events.filter(isAcademicBreakEvent).sort((a, b) => a.start.getTime() - b.start.getTime());
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** RFC5545 all-day DTEND is exclusive, so a break event's `end` is already
 * the first day back — the Monday on/after it (never earlier) is week one. */
function mondayOnOrAfter(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0=Sun..6=Sat
  const add = day === 1 ? 0 : (8 - day) % 7;
  d.setDate(d.getDate() + add);
  return d;
}

export interface AcademicWindow {
  status: 'inTerm';
  academicYear: string;
  semester: '1' | '2';
  weekOneMonday: string;
  currentWeek: number;
  /** Only present when a future break event already exists in the feed —
   * never guessed. Consumers must treat its absence as "unknown", not zero. */
  nextBreakStart?: string;
  nextBreakTitle?: string;
}

export interface OnBreak {
  status: 'onBreak';
  breakTitle: string;
}

/** Derives "which term is `now` in" purely from 寒假/暑假 boundary events —
 * no JWXT session involved. Returns null when the feed has no usable break
 * data yet (expected today; see the design spec's Part A). */
export function currentAcademicWindow(
  events: readonly CalendarEvent[], now: Date,
): AcademicWindow | OnBreak | null {
  const breaks = findBreakEvents(events);
  if (breaks.length === 0) return null;

  const active = breaks.find(
    (e) => e.start.getTime() <= now.getTime() && e.end!.getTime() > now.getTime(),
  );
  if (active) return { status: 'onBreak', breakTitle: active.title! };

  const past = breaks.filter((e) => e.end!.getTime() <= now.getTime());
  if (past.length === 0) return null;
  const lastBreak = past.reduce((a, b) => (b.end!.getTime() > a.end!.getTime() ? b : a));

  const weekOneMondayDate = mondayOnOrAfter(lastBreak.end!);
  const weekOneMonday = toIsoDate(weekOneMondayDate);
  const endYear = lastBreak.end!.getFullYear();
  const semester: '1' | '2' = lastBreak.title === '暑假' ? '1' : '2';
  const academicYear = semester === '1' ? `${endYear}-${endYear + 1}` : `${endYear - 1}-${endYear}`;
  const currentWeek = currentWeekNumber(weekOneMonday, now);

  const future = breaks.find((e) => e.start.getTime() > now.getTime());
  return {
    status: 'inTerm', academicYear, semester, weekOneMonday, currentWeek,
    ...(future ? { nextBreakStart: toIsoDate(future.start), nextBreakTitle: future.title! } : {}),
  };
}

/** Best-effort auto-fill for the login flow's "week one Monday" prompt.
 * Returns null (not a thrown error) whenever there's nothing to infer yet —
 * the caller falls back to the existing manual prompt. */
export function inferWeekOneMonday(events: readonly CalendarEvent[], now: Date): string | null {
  const window = currentAcademicWindow(events, now);
  return window && window.status === 'inTerm' ? window.weekOneMonday : null;
}
