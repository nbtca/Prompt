import type { CalendarEvent } from '@nbtca/nbtcal';
import { currentWeekNumber } from './schedule-query.js';

const DAY_MS = 86400000;

/** Institutional calendar entries on the shared feed carry a bracketed
 * source prefix (e.g. "[NBT] 秋季学期开始上课") to distinguish them from
 * club social events — strip it before matching known official titles.
 * Club events (no such prefix) pass through unchanged and simply won't
 * match anything below. */
function officialTitle(e: CalendarEvent): string | null {
  if (!e.title) return null;
  return e.title.replace(/^\[[^\]]*\]\s*/, '').trim();
}

/** Direct "classes begin" markers — the club posts these explicitly every
 * year, so week one is read straight off the event date. No inference,
 * no "Monday after the break ends" heuristic: that guess doesn't actually
 * hold in practice (e.g. registration day can sit *between* the break's
 * end and the first class). */
const SEMESTER_START_SEMESTER: Record<string, '1' | '2'> = {
  '秋季学期开始上课': '1',
  '春季学期开始上课': '2',
};

// Real-world naming is inconsistent between years ("暑假" vs "暑期") — match
// every alias actually in use rather than a single assumed spelling.
const BREAK_TITLES = new Set(['寒假', '暑假', '暑期']);
const EXAM_WEEK_TITLE = '期末考试周';
const MIN_BREAK_DAYS = 3;

/** An all-day, multi-day break period (寒假/暑假/暑期). Exact title match
 * against a curated set — never a substring/"contains 假" check, which
 * would also catch short public holidays like 国庆节放假. */
export function isAcademicBreakEvent(e: CalendarEvent): boolean {
  const title = officialTitle(e);
  if (!title || !BREAK_TITLES.has(title) || !e.isAllDay || !e.end) return false;
  return (e.end.getTime() - e.start.getTime()) / DAY_MS >= MIN_BREAK_DAYS;
}

function isSemesterStartEvent(e: CalendarEvent): boolean {
  const title = officialTitle(e);
  return !!title && title in SEMESTER_START_SEMESTER;
}

function isExamWeekEvent(e: CalendarEvent): boolean {
  return officialTitle(e) === EXAM_WEEK_TITLE;
}

export function findBreakEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  return events.filter(isAcademicBreakEvent).sort((a, b) => a.start.getTime() - b.start.getTime());
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface AcademicWindow {
  status: 'inTerm';
  academicYear: string;
  semester: '1' | '2';
  weekOneMonday: string;
  currentWeek: number;
  /** The next known calendar milestone worth counting down to — an exam
   * week, a break, or the following semester's start, whichever comes
   * first in the feed. Not necessarily a "break" despite the name; only
   * present when the feed actually has a matching future event, never
   * guessed. */
  nextBreakStart?: string;
  nextBreakTitle?: string;
}

export interface OnBreak {
  status: 'onBreak';
  breakTitle: string;
}

/** Derives "which term is `now` in" from the club's own explicit calendar
 * markers — no JWXT session involved. Returns null when the feed has none
 * of these markers yet. */
export function currentAcademicWindow(
  events: readonly CalendarEvent[], now: Date,
): AcademicWindow | OnBreak | null {
  // A genuine between-term break takes priority even if a semester-start
  // event technically already exists in the feed for the *next* term
  // (registration-day events can predate the break's own end).
  const activeBreak = findBreakEvents(events).find(
    (e) => e.start.getTime() <= now.getTime() && e.end!.getTime() > now.getTime(),
  );
  if (activeBreak) return { status: 'onBreak', breakTitle: officialTitle(activeBreak)! };

  const starts = events
    .filter(isSemesterStartEvent)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const past = starts.filter((e) => e.start.getTime() <= now.getTime());
  if (past.length === 0) return null;
  const current = past[past.length - 1]!;

  const title = officialTitle(current)!;
  const semester = SEMESTER_START_SEMESTER[title]!;
  const startYear = current.start.getFullYear();
  const academicYear = semester === '1' ? `${startYear}-${startYear + 1}` : `${startYear - 1}-${startYear}`;
  const weekOneMonday = toIsoDate(current.start);
  const currentWeek = currentWeekNumber(weekOneMonday, now);

  const future = [...events]
    .filter((e) => e.start.getTime() > now.getTime()
      && (isExamWeekEvent(e) || isAcademicBreakEvent(e) || isSemesterStartEvent(e)))
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];

  return {
    status: 'inTerm', academicYear, semester, weekOneMonday, currentWeek,
    ...(future ? { nextBreakStart: toIsoDate(future.start), nextBreakTitle: officialTitle(future)! } : {}),
  };
}

/** Best-effort auto-fill for the login flow's "week one Monday" prompt.
 * Returns null (not a thrown error) whenever there's nothing to infer yet —
 * the caller falls back to the existing manual prompt. */
export function inferWeekOneMonday(events: readonly CalendarEvent[], now: Date): string | null {
  const window = currentAcademicWindow(events, now);
  if (window && window.status === 'inTerm') return window.weekOneMonday;

  // While on break, the term JWXT resolves as "current" (and the one a
  // student logging in during break almost certainly wants) is the
  // *upcoming* one, not the one that just ended — use the next explicit
  // semester-start marker directly when the feed already has it, instead
  // of giving up just because `now` itself isn't inside any term yet.
  const upcoming = events
    .filter((e) => isSemesterStartEvent(e) && e.start.getTime() > now.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  return upcoming ? toIsoDate(upcoming.start) : null;
}
