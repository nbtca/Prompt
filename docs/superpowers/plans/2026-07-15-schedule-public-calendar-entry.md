# Schedule: Public Calendar Data + Entry-Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Part A (public academic-calendar data + auto week-one derivation) and Part
B (entry-flow redesign: Schedule defaults to a public, no-login view) of
`docs/superpowers/specs/2026-07-15-schedule-public-calendar-and-visual-redesign.md`. Part C
(post-login visual redesign) is a separate, later plan.

**Architecture:** A new pure module `src/features/academic-calendar.ts` derives "which term is
`now` in, what week, and when's the next break" from `寒假`/`暑假` all-day events already
reachable via the existing public `ical.nbtca.space` feed client (`loadCalendarOrThrow()` in
`src/features/calendar.ts` — the same one Events/Home already use, no new client/feed code).
`src/app/views/schedule.ts` gains a new `'public'` mode that replaces "no session → demand
login" with "no session → show public status"; login becomes an explicit action. The login flow
tries the same inference before falling back to today's manual week-one prompt.

**Tech Stack:** TypeScript, vitest, existing hand-rolled TUI renderer (no new dependencies).

## Global Constraints

- No new npm dependencies.
- Every new pure renderer function that can return a multi-line string MUST have its call site
  split on `'\n'` before pushing into a body-lines array (`lines.push(...x.split('\n'))`, never
  `lines.push(x)`) — see the regression tests already in `events-render.test.ts` /
  `schedule-render.test.ts` for the exact bug this guards against (collapsed multi-line strings
  silently corrupt the frame compositor's row count and push the header off-screen).
- Every new i18n string needs an entry in `src/i18n/locales/en.json`, `src/i18n/locales/zh.json`,
  AND the `Translations` interface in `src/i18n/index.ts` — all three or the build fails/strings
  silently fall back.
- Follow this session's established verification bar: `npm run build`, `npx vitest run`, then a
  live pty check against the real built `dist/` (see `Task 5`) before considering any task done.
- Commit messages: this repo's shell mangles backticks/parens typed directly into `git commit
  -m`; always write the message to a temp file and use `git commit -F <file>`.

---

### Task 1: `inferWeekOneMonday` / `currentAcademicWindow` pure functions

**Files:**
- Create: `src/features/academic-calendar.ts`
- Test: `src/features/academic-calendar.test.ts`

**Interfaces:**
- Consumes: `CalendarEvent` from `@nbtca/nbtcal` (`{ uid, title, start, end, isAllDay, location,
  description, recurring }`, `title`/`end` nullable); `currentWeekNumber(weekOneMonday: string,
  now: Date): number` from `./schedule-query.js`.
- Produces: `isAcademicBreakEvent(e: CalendarEvent): boolean`, `findBreakEvents(events:
  readonly CalendarEvent[]): CalendarEvent[]`, `AcademicWindow` type, `OnBreak` type,
  `currentAcademicWindow(events: readonly CalendarEvent[], now: Date): AcademicWindow | OnBreak
  | null`, `inferWeekOneMonday(events: readonly CalendarEvent[], now: Date): string | null` — all
  consumed by Task 3 (renderer) and Task 4 (`schedule.ts` wiring).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/features/academic-calendar.test.ts
import { describe, it, expect } from 'vitest';
import {
  isAcademicBreakEvent, findBreakEvents, currentAcademicWindow, inferWeekOneMonday,
} from './academic-calendar.js';
import type { CalendarEvent } from '@nbtca/nbtcal';

function breakEvent(title: string, start: string, end: string): CalendarEvent {
  return {
    uid: `${title}-${start}`, title, start: new Date(`${start}T00:00:00`),
    end: new Date(`${end}T00:00:00`), isAllDay: true, location: null, description: null,
    recurring: false,
  };
}

// Real 2026-2027 academic calendar (school-published), used as ground truth:
// summer break ends 2026-09-13 -> classes begin Mon 2026-09-14 (term 1);
// winter break ends 2027-02-28 -> classes begin Mon 2027-03-01 (term 2).
const SUMMER_2026 = breakEvent('暑假', '2026-07-13', '2026-09-14');
const WINTER_2027 = breakEvent('寒假', '2027-01-13', '2027-03-01');
const SUMMER_2027 = breakEvent('暑假', '2027-06-22', '2027-09-13');

describe('isAcademicBreakEvent', () => {
  it('accepts an all-day multi-day 寒假/暑假 event', () => {
    expect(isAcademicBreakEvent(SUMMER_2026)).toBe(true);
  });
  it('rejects a same-titled but non-all-day event', () => {
    expect(isAcademicBreakEvent({ ...SUMMER_2026, isAllDay: false })).toBe(false);
  });
  it('rejects a short (<3 day) span even if titled correctly', () => {
    expect(isAcademicBreakEvent(breakEvent('暑假', '2026-09-13', '2026-09-14'))).toBe(false);
  });
  it('rejects an unrelated club event', () => {
    expect(isAcademicBreakEvent(breakEvent('纳新', '2026-09-01', '2026-09-05'))).toBe(false);
  });
});

describe('findBreakEvents', () => {
  it('returns only break events, sorted by start', () => {
    const club = breakEvent('纳新', '2026-09-01', '2026-09-05');
    const found = findBreakEvents([WINTER_2027, club, SUMMER_2026]);
    expect(found).toEqual([SUMMER_2026, WINTER_2027]);
  });
});

describe('currentAcademicWindow', () => {
  it('returns null when the feed has no break events at all', () => {
    expect(currentAcademicWindow([], new Date('2026-10-01'))).toBeNull();
  });

  it('identifies term 1, week 3, with the correct academic-year label', () => {
    const now = new Date('2026-10-01T09:00:00'); // 3rd Mon-Sun week starting 2026-09-14
    const w = currentAcademicWindow([SUMMER_2026, WINTER_2027], now);
    expect(w).toEqual({
      status: 'inTerm', academicYear: '2026-2027', semester: '1',
      weekOneMonday: '2026-09-14', currentWeek: 3, nextBreakStart: '2027-01-13',
      nextBreakTitle: '寒假',
    });
  });

  it('identifies term 2, with the correct academic-year label', () => {
    const now = new Date('2027-03-08T09:00:00'); // week 2 of term 2
    const w = currentAcademicWindow([SUMMER_2026, WINTER_2027, SUMMER_2027], now);
    expect(w).toEqual({
      status: 'inTerm', academicYear: '2026-2027', semester: '2',
      weekOneMonday: '2027-03-01', currentWeek: 2, nextBreakStart: '2027-06-22',
      nextBreakTitle: '暑假',
    });
  });

  it('omits nextBreakStart/nextBreakTitle when no future break event is known yet', () => {
    const now = new Date('2026-10-01T09:00:00');
    const w = currentAcademicWindow([SUMMER_2026], now); // no WINTER_2027 in the feed yet
    expect(w).toEqual({
      status: 'inTerm', academicYear: '2026-2027', semester: '1',
      weekOneMonday: '2026-09-14', currentWeek: 3,
    });
  });

  it('reports onBreak while inside a break period', () => {
    const now = new Date('2027-02-01T00:00:00');
    const w = currentAcademicWindow([SUMMER_2026, WINTER_2027], now);
    expect(w).toEqual({ status: 'onBreak', breakTitle: '寒假' });
  });
});

describe('inferWeekOneMonday', () => {
  it('returns the week-one date while in term', () => {
    const now = new Date('2026-10-01T09:00:00');
    expect(inferWeekOneMonday([SUMMER_2026, WINTER_2027], now)).toBe('2026-09-14');
  });
  it('returns null with no matching break data', () => {
    expect(inferWeekOneMonday([], new Date('2026-10-01'))).toBeNull();
  });
  it('returns null while on break (no current term to infer week-one for)', () => {
    const now = new Date('2027-02-01T00:00:00');
    expect(inferWeekOneMonday([SUMMER_2026, WINTER_2027], now)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/academic-calendar.test.ts`
Expected: FAIL — `Cannot find module './academic-calendar.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/features/academic-calendar.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/academic-calendar.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/academic-calendar.ts src/features/academic-calendar.test.ts
cat > /tmp/commit_msg.txt <<'EOF'
feat(schedule): infer the current term/week from public 寒假/暑假 calendar events

Pure derivation over the existing public ical.nbtca.space feed (no new
data source): the club will maintain all-day 寒假/暑假 events there,
and the Monday on/after the most recent one's end is the term's week
one. Validated against the real 2026-2027 school calendar. Returns
null whenever the feed doesn't have the relevant break data yet
(expected today) so callers can fall back gracefully.
EOF
git commit -F /tmp/commit_msg.txt
rm -f /tmp/commit_msg.txt
```

---

### Task 2: i18n keys for the public Schedule view

**Files:**
- Modify: `src/i18n/index.ts` (the `Translations` interface, `timetable` block)
- Modify: `src/i18n/locales/en.json` (the `timetable` block)
- Modify: `src/i18n/locales/zh.json` (the `timetable` block)

**Interfaces:**
- Produces: new `Translations.timetable` fields consumed by Task 3's renderer and Task 4's
  `schedule.ts` changes: `semester1`, `semester2`, `weekLabel2` (fmt, `{week}`),
  `academicYearSuffix` (fmt, `{year}`), `onBreak` (fmt, `{title}`), `publicUnavailable`,
  `daysUntilBreak` (fmt, `{title}`, `{days}`), `publicLoginAction`, `publicLoginHint`,
  `weekOneAutoFailed`.

  (`weekLabel` already exists and is reused as-is by `schedule-render.ts`'s existing week grid —
  do not rename it. The new `weekLabel2` fmt key is for the public view's "第 N 周" line, which
  needs a different template shape than the existing plain label.)

- [ ] **Step 1: Add fields to the `Translations` interface**

In `src/i18n/index.ts`, inside the `timetable` block (after `menuEntry: string;` at line 261),
add:

```typescript
    semester1: string;
    semester2: string;
    weekLabel2: string;
    academicYearSuffix: string;
    onBreak: string;
    publicUnavailable: string;
    daysUntilBreak: string;
    publicLoginAction: string;
    publicLoginHint: string;
    weekOneAutoFailed: string;
```

- [ ] **Step 2: Add the English strings**

In `src/i18n/locales/en.json`, inside `"timetable"`, add (after `"menuEntry"`):

```json
    "semester1": "Term 1",
    "semester2": "Term 2",
    "weekLabel2": "Week {week}",
    "academicYearSuffix": "{year}",
    "onBreak": "On break · {title}",
    "publicUnavailable": "Academic calendar not available yet",
    "daysUntilBreak": "{days} days until {title}",
    "publicLoginAction": "Log in to see my timetable",
    "publicLoginHint": "Log in to export your timetable (.ics)",
    "weekOneAutoFailed": "Couldn't infer the term's first week automatically — please confirm it once"
```

- [ ] **Step 3: Add the Chinese strings**

In `src/i18n/locales/zh.json`, inside `"timetable"`, add (after `"menuEntry"`):

```json
    "semester1": "第一学期",
    "semester2": "第二学期",
    "weekLabel2": "第 {week} 周",
    "academicYearSuffix": "{year}学年",
    "onBreak": "假期中 · {title}",
    "publicUnavailable": "校历数据暂不可用",
    "daysUntilBreak": "距离{title}还有 {days} 天",
    "publicLoginAction": "登录查看我的课表",
    "publicLoginHint": "登录后可导出课表 (.ics)",
    "weekOneAutoFailed": "未能从校历自动推算学期第一周，请手动确认一次"
```

- [ ] **Step 4: Verify JSON validity and type-check**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/en.json','utf8'))" && node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/zh.json','utf8'))" && npx tsc --noEmit -p .`
Expected: no output, exit code 0 (valid JSON, and `Translations` interface matches usage so far
— usage lands in Task 3/4).

- [ ] **Step 5: Commit**

```bash
git add src/i18n/index.ts src/i18n/locales/en.json src/i18n/locales/zh.json
cat > /tmp/commit_msg.txt <<'EOF'
feat(i18n): strings for the public (no-login) Schedule view
EOF
git commit -F /tmp/commit_msg.txt
rm -f /tmp/commit_msg.txt
```

---

### Task 3: `'public'` mode in `ScheduleViewState` + pure renderer

**Files:**
- Modify: `src/app/views/schedule-render.ts`
- Modify: `src/app/views/schedule-render.test.ts`

**Interfaces:**
- Consumes: `AcademicWindow | OnBreak | null | undefined` from Task 1 (`undefined` = still
  loading, `null` = feed reachable but no break data, a value = derived window);
  `Event`/`renderEventBrief` from `../../features/calendar.js` (already used by
  `events-render.ts` — same shape, no new type); `ListField` from `../fields/list-field.js`.
- Produces: `ScheduleMode` gains `'public'`; `ScheduleViewState` gains `publicField?: ListField`,
  `publicWindow?: AcademicWindow | OnBreak | null`, `publicUpcoming?: Event[]`. `renderSchedule`
  handles `case 'public'`. Consumed by Task 4 (`schedule.ts`'s `goToPublic`).

- [ ] **Step 1: Write the failing tests**

Add to `src/app/views/schedule-render.test.ts` (check the existing file's imports/setup first —
follow its established `setLanguage('en')` / `resetIconCache()` pattern):

```typescript
import { ListField } from '../fields/list-field.js';
import type { Event } from '../../features/calendar.js';

describe('renderSchedule — public mode', () => {
  it('shows a loading hint while publicWindow is undefined', () => {
    const out = stripAnsi(renderSchedule({ mode: 'public' }, new Date()).join('\n'));
    expect(out.trim().length).toBeGreaterThan(0);
  });

  it('shows the unavailable hint when publicWindow is null', () => {
    const out = stripAnsi(renderSchedule({ mode: 'public', publicWindow: null }, new Date()).join('\n'));
    expect(out).toContain('Academic calendar not available yet');
  });

  it('shows the on-break state', () => {
    const state = { mode: 'public' as const, publicWindow: { status: 'onBreak' as const, breakTitle: '暑假' } };
    const out = stripAnsi(renderSchedule(state, new Date()).join('\n'));
    expect(out).toContain('On break');
    expect(out).toContain('暑假');
  });

  it('shows term/week and a progress bar when nextBreakStart is known', () => {
    const state = {
      mode: 'public' as const,
      publicWindow: {
        status: 'inTerm' as const, academicYear: '2026-2027', semester: '1' as const,
        weekOneMonday: '2026-09-14', currentWeek: 3,
        nextBreakStart: '2027-01-13', nextBreakTitle: '寒假',
      },
    };
    const out = stripAnsi(renderSchedule(state, new Date('2026-10-01')).join('\n'));
    expect(out).toContain('2026-2027');
    expect(out).toContain('Term 1');
    expect(out).toContain('Week 3');
    expect(out).toContain('days until');
  });

  it('shows term/week without a progress bar when nextBreakStart is unknown', () => {
    const state = {
      mode: 'public' as const,
      publicWindow: {
        status: 'inTerm' as const, academicYear: '2026-2027', semester: '1' as const,
        weekOneMonday: '2026-09-14', currentWeek: 3,
      },
    };
    expect(() => renderSchedule(state, new Date('2026-10-01'))).not.toThrow();
  });

  it('renders upcoming public events via the shared briefing format', () => {
    const upcoming: Event[] = [{
      date: '10-01', time: '', title: 'National Day', location: 'TBD', description: '',
      startDate: new Date('2026-10-01'), recurring: true, uid: 'nd-1',
    }];
    const state = { mode: 'public' as const, publicWindow: null, publicUpcoming: upcoming };
    const out = stripAnsi(renderSchedule(state, new Date()).join('\n'));
    expect(out).toContain('National Day');
  });

  it('renders the login action field', () => {
    const publicField = new ListField({ title: 'x', options: [{ value: 'login', label: 'Log in' }] });
    const out = stripAnsi(renderSchedule({ mode: 'public', publicField }, new Date()).join('\n'));
    expect(out).toContain('Log in');
  });

  it('never collapses a multi-line renderer output into one array entry', () => {
    const publicField = new ListField({ title: 'x', options: [{ value: 'login', label: 'Log in' }] });
    const state = {
      mode: 'public' as const,
      publicWindow: {
        status: 'inTerm' as const, academicYear: '2026-2027', semester: '1' as const,
        weekOneMonday: '2026-09-14', currentWeek: 3,
        nextBreakStart: '2027-01-13', nextBreakTitle: '寒假',
      },
      publicUpcoming: [{
        date: '10-01', time: '', title: 'National Day', location: 'TBD', description: '',
        startDate: new Date('2026-10-01'), recurring: true, uid: 'nd-1',
      }] as Event[],
      publicField,
    };
    for (const line of renderSchedule(state, new Date('2026-10-01'))) {
      expect(line).not.toContain('\n');
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/views/schedule-render.test.ts`
Expected: FAIL — `mode: 'public'` not assignable / `renderSchedule` returns `[]` for an unhandled
mode, assertions fail.

- [ ] **Step 3: Implement**

In `src/app/views/schedule-render.ts`:

```typescript
// add to imports at the top:
import { pickIcon } from '../../core/icons.js';
import { fmt } from '../../i18n/index.js';
import { currentWeekNumber } from '../../features/schedule-query.js';
import type { AcademicWindow, OnBreak } from '../../features/academic-calendar.js';
import { renderEventBrief, type Event } from '../../features/calendar.js';
```

(`currentWeekNumber` and `type`/`space`/`t` are already imported in this file — add only what's
missing; check the current import block before editing so you don't duplicate an import.)

```typescript
// add 'public' to the ScheduleMode union:
export type ScheduleMode =
  | 'loading'
  | 'public'
  | 'needsLoginId'
  ...
```

```typescript
// add to ScheduleViewState:
  publicField?: ListField;
  publicWindow?: AcademicWindow | OnBreak | null;
  publicUpcoming?: Event[];
```

```typescript
const TERM_PROGRESS_WIDTH = 20;

function renderTermProgressBar(w: AcademicWindow, now: Date): string | null {
  if (!w.nextBreakStart) return null;
  const weekOneMs = new Date(`${w.weekOneMonday}T00:00:00`).getTime();
  const nextBreakMs = new Date(`${w.nextBreakStart}T00:00:00`).getTime();
  const totalWeeks = Math.max(1, Math.round((nextBreakMs - weekOneMs) / (7 * 86400000)));
  const currentWeek = currentWeekNumber(w.weekOneMonday, now);
  const filledCols = Math.max(0, Math.min(
    TERM_PROGRESS_WIDTH, Math.round((currentWeek / totalWeeks) * TERM_PROGRESS_WIDTH),
  ));
  const filledChar = pickIcon('█', '#');
  const emptyChar = pickIcon('░', '-');
  const bar = filledChar.repeat(filledCols) + emptyChar.repeat(TERM_PROGRESS_WIDTH - filledCols);
  return `${space.indent}${type.body(bar)}  ${type.hint(`${currentWeek}/${totalWeeks}${t().timetable.weekLabel2.replace('{week}', '').trim()}`)}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / 86400000));
}

function renderPublicBody(state: ScheduleViewState, now: Date): string[] {
  const trans = t();
  const lines: string[] = [];
  const w = state.publicWindow;

  if (w === undefined) {
    lines.push(hint(trans.common.loading));
  } else if (w === null) {
    lines.push(hint(trans.timetable.publicUnavailable));
  } else if (w.status === 'onBreak') {
    lines.push(heading(fmt(trans.timetable.onBreak, { title: w.breakTitle })));
  } else {
    const semesterLabel = w.semester === '1' ? trans.timetable.semester1 : trans.timetable.semester2;
    lines.push(heading(
      `${fmt(trans.timetable.academicYearSuffix, { year: w.academicYear })} · ${semesterLabel} · ${fmt(trans.timetable.weekLabel2, { week: String(w.currentWeek) })}`,
    ));
    const bar = renderTermProgressBar(w, now);
    if (bar) { lines.push(''); lines.push(bar); }
    if (w.nextBreakStart && w.nextBreakTitle) {
      lines.push('');
      lines.push(hint(fmt(trans.timetable.daysUntilBreak, {
        title: w.nextBreakTitle,
        days: String(daysBetween(now, new Date(`${w.nextBreakStart}T00:00:00`))),
      })));
    }
  }
  lines.push('');

  if (state.publicUpcoming && state.publicUpcoming.length > 0) {
    lines.push(heading(trans.calendar.recentActivity));
    for (const e of state.publicUpcoming) lines.push(renderEventBrief(e, now));
    lines.push('');
  }

  lines.push(hint(trans.timetable.publicLoginHint));
  lines.push('');
  if (state.publicField) lines.push(...state.publicField.render());
  return lines;
}
```

```typescript
// in renderSchedule's switch, add:
    case 'public':
      return renderPublicBody(state, now);
```

Note: `hint()` here reuses this file's existing local `hint()` helper (defined near the top,
`` `${space.indent}${type.hint(label)}` ``) — do not redefine it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/views/schedule-render.test.ts`
Expected: PASS (all existing tests plus the 8 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/app/views/schedule-render.ts src/app/views/schedule-render.test.ts
cat > /tmp/commit_msg.txt <<'EOF'
feat(schedule): public (no-login) status view — term/week, progress bar, activity
EOF
git commit -F /tmp/commit_msg.txt
rm -f /tmp/commit_msg.txt
```

---

### Task 4: Wire the public view + auto week-one into `schedule.ts`

**Files:**
- Modify: `src/app/views/schedule.ts`
- Modify: `src/app/views/schedule.test.ts`

**Interfaces:**
- Consumes: `loadCalendarOrThrow` from `../../features/calendar.js`; `currentAcademicWindow`,
  `inferWeekOneMonday` from `../../features/academic-calendar.js`.
- Produces: `goToPublic(ctx)` (module-private) replaces the current unconditional
  `goToLoginId()` calls in `refreshFromNetwork`'s "no session" paths; `afterAuthenticated`
  attempts `inferWeekOneMonday` before falling back to the `needsWeekOne` prompt; `hubLogout`
  and the `needsLoginId` cancel path go to `goToPublic(ctx)` instead of resetting to a bare
  login field.

- [ ] **Step 1: Write the failing tests**

Add to `src/app/views/schedule.test.ts`. This file already mocks `../../auth/session-store.js`,
`../../auth/nbt-auth.js`, `@nbtca/nbtcal/timetable`, and `../../features/schedule-store.js` (from
the earlier session-expiry regression tests) — reuse those same mocks and add one for the public
feed:

```typescript
// near the top, alongside the existing vi.mock calls:
const calendarUpcoming = vi.fn().mockReturnValue([]);
const calendarInRange = vi.fn().mockReturnValue([]);
vi.mock('../../features/calendar.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/calendar.js')>();
  return {
    ...actual,
    loadCalendarOrThrow: vi.fn().mockResolvedValue({
      upcoming: calendarUpcoming, past: vi.fn().mockReturnValue([]),
      next: vi.fn().mockReturnValue([]), inRange: calendarInRange,
      heatmap: vi.fn().mockReturnValue([]),
    }),
  };
});
```

Add the import at the top alongside the other `await import(...)` lines:

```typescript
const { loadCalendarOrThrow } = await import('../../features/calendar.js');
```

Then add:

```typescript
describe('scheduleView.load() with no session — public view', () => {
  function fakeCtx(): AppContext {
    return {
      size: { rows: 24, cols: 80 }, bodyRows: 19, rerender: vi.fn(),
      runClassic: vi.fn(async (fn: () => Promise<void>) => { await fn(); }), quit: vi.fn(),
    };
  }

  it('shows the public view (not a login prompt) when there is no persisted session', async () => {
    vi.mocked(loadCurrentPointer).mockReturnValue(null);
    sessionStoreLoad.mockReturnValue(null); // no persisted session at all

    const ctx = fakeCtx();
    await scheduleView.load(ctx);

    expect(scheduleView.capturesInput?.()).toBe(false); // public hub is a ListField, not a text field
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.publicLoginAction);
    expect(out).not.toContain(t().timetable.studentId);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/views/schedule.test.ts`
Expected: FAIL — public view shows the login field instead (current behavior).

- [ ] **Step 3: Implement**

In `src/app/views/schedule.ts`, add imports:

```typescript
import { loadCalendarOrThrow, toDisplayEvent } from '../../features/calendar.js';
import type { Event } from '../../features/calendar.js';
import { currentAcademicWindow, inferWeekOneMonday, isAcademicBreakEvent } from '../../features/academic-calendar.js';
import type { AcademicWindow, OnBreak } from '../../features/academic-calendar.js';
```

(Check the current import block first — `ListField`/`TextField`/`t` etc. are already imported;
add only what's missing.)

Add `buildPublicField` and `goToPublic`, near `goToLoginId`:

```typescript
function buildPublicField(): ListField {
  const trans = t();
  return new ListField({
    title: trans.timetable.menuEntry,
    options: [{ value: 'login', label: trans.timetable.publicLoginAction }],
    footer: trans.menu.hintMove,
  });
}

async function goToPublic(ctx: AppContext): Promise<void> {
  setVimKeysActive(true);
  state = { mode: 'public', publicField: buildPublicField() };
  ctx.rerender();
  try {
    const cal = await loadCalendarOrThrow();
    const now = new Date();
    const windowEvents = cal.inRange(
      new Date(now.getTime() - 400 * 86400000), new Date(now.getTime() + 400 * 86400000),
    );
    const publicWindow: AcademicWindow | OnBreak | null = currentAcademicWindow(windowEvents, now);
    const publicUpcoming: Event[] = cal.upcoming({ days: 30 })
      .filter((e) => !isAcademicBreakEvent(e))
      .slice(0, 5)
      .map(toDisplayEvent);
    state = { ...state, publicWindow, publicUpcoming };
  } catch {
    state = { ...state, publicWindow: null };
  }
  ctx.rerender();
}
```

Note: `publicUpcoming` excludes `寒假`/`暑假` markers from the generic activity list via the
same `isAcademicBreakEvent` predicate Task 1 exports — they're already shown via the
header/countdown above, so repeating them here would be redundant.

Change `refreshFromNetwork` to call `goToPublic` instead of `goToLoginId` in both no-session
branches:

```typescript
async function refreshFromNetwork(ctx: AppContext): Promise<void> {
  const hadCache = state.mode === 'hub';
  try {
    const store = createSessionStore();
    const persisted = store.load();
    if (!persisted) {
      if (!hadCache) await goToPublic(ctx);
      return;
    }
    const restored = await restoreNbtSession(persisted);
    await afterAuthenticated(ctx, restored);
  } catch (err) {
    if (!hadCache) {
      if (err instanceof AuthError && isSessionExpired(err)) {
        createSessionStore().clear();
      }
      await goToPublic(ctx);
    }
  }
}
```

Change the `hub` mode's `logout` handler (inside `handleKey`) from `goToLoginId()` to
`void goToPublic(ctx);` (it's already inside a function that receives `ctx`).

Change `needsLoginId`'s cancel handling (inside `handleKey`) from `goToLoginId()` to
`void goToPublic(ctx)`.

Add a `'login'` case to a new `'public'` branch in `handleKey`'s switch:

```typescript
      case 'public': {
        const result = state.publicField?.handleKey(key);
        if (result?.selected === 'login') goToLoginId();
        return;
      }
```

Update `capturesInput()` — unchanged (public mode's `ListField` doesn't capture input, same as
`hub`).

Update `afterAuthenticated` to try inference before the manual prompt:

```typescript
    catalog = await client.listTerms();
    const term = resolveTerm(catalog);
    const key = termKey(term);
    let weekOne = loadWeekOne(key);
    if (!weekOne) {
      weekOne = await tryInferWeekOne();
      if (weekOne) saveWeekOne(key, weekOne);
    }
    if (!weekOne) {
      setVimKeysActive(false);
      state = {
        mode: 'needsWeekOne',
        key,
        term,
        errorMessage: t().timetable.weekOneAutoFailed,
        weekOneField: new TextField({ message: t().timetable.weekOne, placeholder: t().timetable.weekOneHint }),
      };
      ctx.rerender();
      return;
    }
    await fetchAndShowHub(ctx, term, key, weekOne);
```

Add the helper near `afterAuthenticated`:

```typescript
async function tryInferWeekOne(): Promise<string | null> {
  try {
    const cal = await loadCalendarOrThrow();
    const now = new Date();
    const events = cal.inRange(new Date(now.getTime() - 400 * 86400000), new Date(now.getTime() + 30 * 86400000));
    return inferWeekOneMonday(events, now);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/views/schedule.test.ts`
Expected: PASS (all existing tests, including the two session-expiry regression tests from the
earlier fix, plus the new public-view test)

- [ ] **Step 5: Run the full suite and type-check**

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: 0 type errors, all test files pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/views/schedule.ts src/app/views/schedule.test.ts
cat > /tmp/commit_msg.txt <<'EOF'
feat(schedule): default to the public view; login becomes an explicit action

refreshFromNetwork no longer forces a login prompt the moment there's
no persisted session — it shows the public term/week status instead
(sourced from the same public calendar feed Events already uses).
Logging out and cancelling the login prompt both return to the public
view rather than a bare login field. Login now also tries to infer
week-one from the public calendar before falling back to the existing
manual prompt.
EOF
git commit -F /tmp/commit_msg.txt
rm -f /tmp/commit_msg.txt
```

---

### Task 5: Build + live verification

**Files:** none (verification only)

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 2: Live pty check — public view on a clean, session-less launch**

Using the same pty-harness pattern established earlier in this codebase's history (isolated
`XDG_STATE_HOME`/`XDG_CONFIG_HOME` pointing at an empty scratch dir, `select()`-based reads with
a timeout — a blocking `os.read` loop will hang forever once the app goes idle, so do not repeat
that mistake), launch `dist/index.js`, press Tab once to reach the Schedule tab, and confirm:
- The header (`Home · [Schedule] · Events · Docs · Settings`) stays visible (no
  multi-line-collapse regression).
- The body shows `发布Login action` label text (`t().timetable.publicLoginAction`) — i.e. the
  public hub, not a 学号/password prompt.
- No thrown/unhandled error is printed to the pty output.

Since the real `ical.nbtca.space` feed has no `寒假`/`暑假` events yet, `publicWindow` will
resolve to `null` in this live check — confirm the `publicUnavailable` hint text appears instead
of a crash or a stuck "loading" state (i.e. the promise in `goToPublic` actually resolves and
`ctx.rerender()` is called on both the network-success and network-failure paths).

- [ ] **Step 3: Live pty check — selecting "login" reaches the existing login field**

From the public view, select the single "登录查看我的课表" option and press Enter; confirm the
existing 学号 (student ID) `TextField` prompt appears exactly as it did before this change
(this path is unmodified — only how you *arrive* at it changed).

Report back (in the same terse style used earlier in this session for similar live checks) what
was actually observed, not just that the commands ran.
