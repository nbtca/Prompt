# Personal Schedule TUI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A personalized post-login "课表" experience in the interactive TUI — today's classes, next-class countdown, weekly grid, in-TUI login/term-switch/export, plus a personalized startup line.

**Architecture:** Pure query/render modules on top of `@nbtca/nbtcal/timetable` + the existing `src/auth/` session; the week-1 Monday is prompted once and persisted per term; an interactive `showSchedule()` hub wired into the main menu; a best-effort cached next-class line at startup. All reuse the Quiet-Precision widgets/tokens.

**Tech Stack:** TypeScript (ESM `.js` specifiers), Node ≥20.12, `vitest`. No new deps. `@nbtca/nbtcal@0.4.0` `/timetable` (locally linked; published later).

## Global Constraints

- Node ≥20.12; ESM only; `.js` import specifiers; no new npm deps; do not edit `package.json`'s nbtcal version.
- Timetable types import from `@nbtca/nbtcal/timetable`.
- Campus weekday is `1..7` (Mon=1); JS `Date.getDay()` is Sun=0.
- Week-1 Monday is a `YYYY-MM-DD` string; all date math derives from it (campus returns no calendar dates).
- No credentials stored; persisted files (week-one config, timetable cache) are non-credential, written `0600` in the state/config dir (`getWritableStateDir`/`getWritableConfigDir`, mode via the existing `writePrivateIcs`-style `{mode:0o600}`).
- New UI strings in `Translations.timetable` + both locales; render via `type`/`space`/`glyph`/`pickIcon` — no bare Unicode literals; degrade under non-TTY/reduced-motion; cancel = `=== null`.
- Only touch schedule-related files (listed per task); the existing CLI `schedule` command behavior is unchanged.
- Co-located `*.test.ts`; render tests strip ANSI + pin/restore icon mode; `setLanguage('en')`.

---

### Task 1: `schedule-query.ts` — pure date/week helpers

**Files:** Create `src/features/schedule-query.ts`, `src/features/schedule-query.test.ts`.

**Interfaces (Produces):**
- `currentWeekNumber(weekOneMonday: string, now: Date): number`
- `campusWeekday(now: Date): number` (Mon=1..Sun=7)
- `meetingsInWeek(meetings, week): TimetableMeeting[]`
- `meetingsOnDay(meetings, weekday, week): TimetableMeeting[]` (sorted by startPeriod)
- `periodStartDate(weekOneMonday, week, weekday, period, periods): Date | null`
- `interface NextClass { meeting: TimetableMeeting; start: Date }`
- `nextMeeting(meetings, periods, weekOneMonday, now): NextClass | null`

- [ ] **Step 1: Failing test**

```ts
// src/features/schedule-query.test.ts
import { describe, it, expect } from 'vitest';
import type { TimetableMeeting, TimetablePeriod } from '@nbtca/nbtcal/timetable';
import { currentWeekNumber, campusWeekday, meetingsInWeek, meetingsOnDay, periodStartDate, nextMeeting } from './schedule-query.js';

const periods: TimetablePeriod[] = [
  { period: 1, label: null, start: '08:00', end: '08:45' },
  { period: 2, label: null, start: '08:55', end: '09:40' },
  { period: 3, label: null, start: '10:00', end: '10:45' },
];
function m(o: Partial<TimetableMeeting>): TimetableMeeting {
  return { sourceId: null, courseName: 'C', teacherNames: [], location: null, weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1], kind: 'regular', ...o };
}

describe('currentWeekNumber', () => {
  it('week 1 on the Monday itself and mid-week', () => {
    expect(currentWeekNumber('2026-09-07', new Date('2026-09-07T09:00:00'))).toBe(1);
    expect(currentWeekNumber('2026-09-07', new Date('2026-09-11T09:00:00'))).toBe(1);
  });
  it('week 2 after 7 days; pre-semester is <= 0', () => {
    expect(currentWeekNumber('2026-09-07', new Date('2026-09-14T00:00:00'))).toBe(2);
    expect(currentWeekNumber('2026-09-07', new Date('2026-09-06T00:00:00'))).toBe(0);
  });
});

describe('campusWeekday', () => {
  it('maps Sunday=7, Monday=1', () => {
    expect(campusWeekday(new Date('2026-09-07T00:00:00'))).toBe(1); // Monday
    expect(campusWeekday(new Date('2026-09-13T00:00:00'))).toBe(7); // Sunday
  });
});

describe('meetings filters', () => {
  const list = [m({ courseName: 'Math', weekday: 1, weeks: [1, 3] }), m({ courseName: 'Phys', weekday: 2, weeks: [1] })];
  it('meetingsInWeek', () => { expect(meetingsInWeek(list, 3).map(x => x.courseName)).toEqual(['Math']); });
  it('meetingsOnDay filters weekday+week', () => { expect(meetingsOnDay(list, 1, 1).map(x => x.courseName)).toEqual(['Math']); });
});

describe('periodStartDate + nextMeeting', () => {
  it('computes the real datetime of a period', () => {
    const d = periodStartDate('2026-09-07', 2, 3, 3, periods)!; // week2 Wed period3 10:00
    expect(d.getFullYear()).toBe(2026);
    expect(d.getHours()).toBe(10); expect(d.getMinutes()).toBe(0);
  });
  it('nextMeeting returns the soonest future class', () => {
    const list = [m({ courseName: 'Math', weekday: 1, startPeriod: 1, weeks: [1] })]; // Mon wk1 08:00
    const n = nextMeeting(list, periods, '2026-09-07', new Date('2026-09-07T06:00:00'));
    expect(n?.meeting.courseName).toBe('Math');
    expect(n?.start.getHours()).toBe(8);
  });
  it('nextMeeting is null when nothing is left', () => {
    const list = [m({ weekday: 1, startPeriod: 1, weeks: [1] })];
    expect(nextMeeting(list, periods, '2026-09-07', new Date('2027-01-01T00:00:00'))).toBeNull();
  });
});
```

- [ ] **Step 2:** `npx vitest run src/features/schedule-query.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// src/features/schedule-query.ts
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
```

- [ ] **Step 4:** `npx vitest run src/features/schedule-query.test.ts` → PASS. `npm run build`.
- [ ] **Step 5:** Commit `feat(schedule): pure week/day query helpers`.

---

### Task 2: i18n keys for the schedule TUI

**Files:** Modify `src/i18n/index.ts` (`Translations.timetable`), `src/i18n/locales/en.json`, `src/i18n/locales/zh.json`.

- [ ] **Step 1:** Add these fields to the `timetable` block of the `Translations` interface:

```ts
    hubToday: string;
    hubWeek: string;
    hubAll: string;
    hubSwitchTerm: string;
    hubExport: string;
    hubLogout: string;
    nextClass: string;
    noClassToday: string;
    noNextClass: string;
    nowLabel: string;
    weekLabel: string;
    periodShort: string;
    promptWeekOne: string;
    menuEntry: string;
```

- [ ] **Step 2:** Add to `en.json` `timetable`:

```json
    "hubToday": "Today",
    "hubWeek": "This week",
    "hubAll": "All courses",
    "hubSwitchTerm": "Switch term",
    "hubExport": "Export .ics",
    "hubLogout": "Log out",
    "nextClass": "Next",
    "noClassToday": "No classes today",
    "noNextClass": "No upcoming classes",
    "nowLabel": "now",
    "weekLabel": "Week",
    "periodShort": "P",
    "promptWeekOne": "First-week Monday (YYYY-MM-DD)",
    "menuEntry": "Schedule"
```

- [ ] **Step 3:** Add to `zh.json` `timetable`:

```json
    "hubToday": "今日",
    "hubWeek": "本周",
    "hubAll": "全部课程",
    "hubSwitchTerm": "切换学期",
    "hubExport": "导出 .ics",
    "hubLogout": "退出登录",
    "nextClass": "下一节",
    "noClassToday": "今天没有课",
    "noNextClass": "没有即将开始的课",
    "nowLabel": "进行中",
    "weekLabel": "第",
    "periodShort": "第",
    "promptWeekOne": "第一周周一 (YYYY-MM-DD)",
    "menuEntry": "课表"
```

- [ ] **Step 4:** `npm run build` (interface↔locale sync gate) → clean. `npx vitest run` → green.
- [ ] **Step 5:** Commit `feat(i18n): schedule TUI strings`.

---

### Task 3: `schedule-render.ts` — next-class banner + today's classes

**Files:** Create `src/features/schedule-render.ts`, `src/features/schedule-render.test.ts`.

**Interfaces:** Consumes `countdownParts` from `./calendar-query.js`; `NextClass`/query types; `type`/`space`/`glyph`/`pickIcon`; `t()`. Produces:
- `renderNextClassBanner(next: NextClass | null, now: Date): string`
- `renderTodayClasses(meetings: readonly TimetableMeeting[], periods: readonly TimetablePeriod[], now: Date): string` (marks the in-progress/next row)

- [ ] **Step 1: Failing test**

```ts
// src/features/schedule-render.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { TimetableMeeting, TimetablePeriod } from '@nbtca/nbtcal/timetable';
import { renderNextClassBanner, renderTodayClasses } from './schedule-render.js';
import { setLanguage } from '../i18n/index.js';
import { resetIconCache } from '../core/icons.js';
import { stripAnsi } from '../core/text.js';

beforeAll(() => setLanguage('en'));
beforeEach(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });
const done = () => { process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache(); };

const periods: TimetablePeriod[] = [
  { period: 1, label: null, start: '08:00', end: '08:45' },
  { period: 2, label: null, start: '08:55', end: '09:40' },
];
function mk(o: Partial<TimetableMeeting>): TimetableMeeting {
  return { sourceId: null, courseName: 'Math', teacherNames: ['Dr Li'], location: 'Room 201', weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1], kind: 'regular', ...o };
}

describe('renderNextClassBanner', () => {
  it('shows the course + countdown', () => {
    const out = stripAnsi(renderNextClassBanner({ meeting: mk({}), start: new Date('2026-09-07T08:00:00') }, new Date('2026-09-07T06:30:00')));
    expect(out).toContain('Next'); expect(out).toContain('Math'); expect(out).toMatch(/1h/); done();
  });
  it('empty when no next class', () => { expect(renderNextClassBanner(null, new Date())).toBe(''); done(); });
});

describe('renderTodayClasses', () => {
  it('lists a class with its time and location', () => {
    const out = stripAnsi(renderTodayClasses([mk({})], periods, new Date('2026-09-07T07:00:00')));
    expect(out).toContain('08:00'); expect(out).toContain('Math'); expect(out).toContain('Room 201'); done();
  });
  it('shows an empty-state line when there are none', () => {
    expect(stripAnsi(renderTodayClasses([], periods, new Date()))).toContain('No classes today'); done();
  });
});
```

- [ ] **Step 2:** run → FAIL.

- [ ] **Step 3: Implement** (compose with tokens; time = `periods[startPeriod].start`–`periods[endPeriod].end`; mark a meeting "now" when `now` is within its span):

```ts
// src/features/schedule-render.ts
import type { TimetableMeeting, TimetablePeriod } from '@nbtca/nbtcal/timetable';
import { countdownParts } from './calendar-query.js';
import type { NextClass } from './schedule-query.js';
import { type, space, glyph } from '../core/theme.js';
import { pickIcon } from '../core/icons.js';
import { t } from '../i18n/index.js';

function span(m: TimetableMeeting, periods: readonly TimetablePeriod[]): string {
  const s = periods.find((p) => p.period === m.startPeriod)?.start ?? '';
  const e = periods.find((p) => p.period === m.endPeriod)?.end ?? '';
  return e ? `${s}–${e}` : s;
}

export function renderNextClassBanner(next: NextClass | null, now: Date): string {
  const trans = t();
  if (!next) return '';
  const p = countdownParts(next.start, now);
  const when = p.past ? trans.timetable.nowLabel
    : p.days > 0 ? `${p.days}d ${p.hours}h`
    : p.hours > 0 ? `${p.hours}h ${p.minutes}m`
    : `${p.minutes}m`;
  const dot = pickIcon('·', '-');
  const loc = next.meeting.location ? `  ${dot}  ${next.meeting.location}` : '';
  return `${space.indent}${type.heading(glyph.cursor())} ${type.label(trans.timetable.nextClass)}  ${dot}  ${type.body(next.meeting.courseName)}${loc}  ${dot}  ${type.hint(when)}`;
}

export function renderTodayClasses(meetings: readonly TimetableMeeting[], periods: readonly TimetablePeriod[], now: Date): string {
  const trans = t();
  const sorted = [...meetings].sort((a, b) => a.startPeriod - b.startPeriod);
  if (sorted.length === 0) return `${space.indent}${type.hint(trans.timetable.noClassToday)}`;
  const dot = pickIcon('·', '-');
  const marker = pickIcon('▸', '>');
  const lines = sorted.map((m) => {
    const time = span(m, periods);
    const startStr = periods.find((p) => p.period === m.startPeriod)?.start ?? '00:00';
    const endStr = periods.find((p) => p.period === m.endPeriod)?.end ?? '23:59';
    const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const live = nowStr >= startStr && nowStr <= endStr;
    const head = live ? `${type.heading(marker)} ` : '  ';
    const loc = m.location ? `  ${dot}  ${type.hint(m.location)}` : '';
    return `${space.indent}${head}${type.hint(time)}  ${live ? type.heading(m.courseName) : type.body(m.courseName)}${loc}`;
  });
  return lines.join('\n');
}
```

- [ ] **Step 4:** run tests → PASS; `npm run build`.
- [ ] **Step 5:** Commit `feat(schedule): next-class banner + today's classes render`.

---

### Task 4: `schedule-render.ts` — weekly grid

**Files:** Modify `src/features/schedule-render.ts` (append), `src/features/schedule-render.test.ts` (append).

**Interfaces:** Produces `renderWeekGrid(meetings, periods, weekNumber, now): string` — Mon–Sun columns × period rows; each cell shows the course (truncated) for that weekday/period/week; empty cells are a dim placeholder.

- [ ] **Step 1: Failing test** (append; add `renderWeekGrid` to the import):

```ts
describe('renderWeekGrid', () => {
  it('renders weekday headers and places a course in its cell', () => {
    const out = stripAnsi(renderWeekGrid([mk({ courseName: 'Math', weekday: 1, startPeriod: 1, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00')));
    expect(out).toMatch(/Mon/);         // weekday header
    expect(out).toContain('Math');      // placed in Mon / period 1
    done();
  });
});
```

- [ ] **Step 2:** run → FAIL.

- [ ] **Step 3: Implement** (append; use `visualWidth`/`padEndV` from `../core/text.js` for CJK-aware columns; keep it compact — one abbreviated course token per cell):

```ts
import { visualWidth, padEndV, truncate } from '../core/text.js';
import { meetingsInWeek } from './schedule-query.js';

const WEEKDAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function renderWeekGrid(meetings: readonly TimetableMeeting[], periods: readonly TimetablePeriod[], weekNumber: number, _now: Date): string {
  const week = meetingsInWeek(meetings, weekNumber);
  const cellW = 10;
  const rowHeadW = 4;
  // cell lookup: weekday(1..7) × period → course
  const at = (wd: number, period: number): string => {
    const m = week.find((x) => x.weekday === wd && period >= x.startPeriod && period <= x.endPeriod);
    return m ? truncate(m.courseName, cellW) : '';
  };
  const lines: string[] = [];
  const header = padEndV('', rowHeadW) + WEEKDAY_KEYS.map((d) => padEndV(type.hint(d), cellW)).join('');
  lines.push(space.indent + header);
  for (const p of periods) {
    const rowHead = type.hint(padEndV(`P${p.period}`, rowHeadW));
    const cells = [1, 2, 3, 4, 5, 6, 7].map((wd) => {
      const v = at(wd, p.period);
      return padEndV(v ? type.body(v) : type.hint(pickIcon('·', '.')), cellW);
    }).join('');
    lines.push(space.indent + rowHead + cells);
  }
  return lines.join('\n');
}
```
(`_now` reserved for a future "current cell" marker; unused now to keep it simple. If `noUnusedParameters` complains, keep the leading underscore.)

- [ ] **Step 4:** run tests → PASS; `npm run build`.
- [ ] **Step 5:** Commit `feat(schedule): weekly grid render`.

---

### Task 5: week-one config store + timetable cache

**Files:** Create `src/features/schedule-store.ts`, `src/features/schedule-store.test.ts`.

**Interfaces:** Consumes `getWritableConfigDir`/`getWritableStateDir`/`getConfigDir`/`getStateDir` from `../config/paths.js`. Produces:
- `loadWeekOne(termKey: string): string | null`
- `saveWeekOne(termKey: string, iso: string): void`
- `saveTimetableCache(termKey: string, data: unknown): void`
- `loadTimetableCache(termKey: string): unknown | null`
- `termKey(term: { academicYear: string; semester: string }): string` → `"<year>-<semester>"`

- [ ] **Step 1: Failing test**

```ts
// src/features/schedule-store.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { termKey, saveWeekOne, loadWeekOne, saveTimetableCache, loadTimetableCache } from './schedule-store.js';

describe('schedule-store', () => {
  it('termKey composes year-semester', () => {
    expect(termKey({ academicYear: '2026', semester: '3' })).toBe('2026-3');
  });
  it('week-one round-trips per term via an injected dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sched-'));
    try {
      saveWeekOne('2026-3', '2026-09-07', dir);
      expect(loadWeekOne('2026-3', dir)).toBe('2026-09-07');
      expect(loadWeekOne('2025-1', dir)).toBeNull();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('timetable cache round-trips', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sched-'));
    try {
      saveTimetableCache('2026-3', { meetings: [1, 2] }, dir);
      expect(loadTimetableCache('2026-3', dir)).toEqual({ meetings: [1, 2] });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 2:** run → FAIL.

- [ ] **Step 3: Implement** (each fn takes an optional `dir` for tests; defaults to the config/state dir; write mode `0o600`):

```ts
// src/features/schedule-store.ts
import fs from 'fs';
import path from 'path';
import { getWritableConfigDir, getConfigDir, getWritableStateDir, getStateDir } from '../config/paths.js';

export function termKey(term: { academicYear: string; semester: string }): string {
  return `${term.academicYear}-${term.semester}`;
}

function readJson(file: string): unknown | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* best effort */ }
}

function weekOnePath(dir?: string): string {
  return path.join(dir ?? getWritableConfigDir(), 'week-one.json');
}
export function saveWeekOne(termKey: string, iso: string, dir?: string): void {
  const file = weekOnePath(dir);
  const store = (readJson(file) as Record<string, string> | null) ?? {};
  store[termKey] = iso;
  writeJson(file, store);
}
export function loadWeekOne(termKey: string, dir?: string): string | null {
  const file = path.join(dir ?? getConfigDir(), 'week-one.json');
  const store = readJson(file) as Record<string, string> | null;
  return store?.[termKey] ?? null;
}

function cachePath(termKey: string, dir?: string): string {
  return path.join(dir ?? getWritableStateDir(), `timetable-${termKey}.json`);
}
export function saveTimetableCache(termKey: string, data: unknown, dir?: string): void {
  writeJson(cachePath(termKey, dir), data);
}
export function loadTimetableCache(termKey: string, dir?: string): unknown | null {
  const file = path.join(dir ?? getStateDir(), `timetable-${termKey}.json`);
  return readJson(file);
}
```

- [ ] **Step 4:** run tests → PASS; `npm run build`.
- [ ] **Step 5:** Commit `feat(schedule): week-one config + timetable cache stores`.

---

### Task 6: `schedule-view.ts` — the interactive hub

**Files:** Create `src/features/schedule-view.ts`.

**Interfaces:** Consumes the query/render/store modules; `createNbtTimetableClient`, `timetableToIcs`, types from `@nbtca/nbtcal/timetable`; from `./student-timetable.js` reuse `interactiveLogin`, `withAuthenticatedSession`, `resolveTerm`, `relevantTerms`, `writePrivateIcs` (export these from `student-timetable.ts` if not already exported); `runMenu`/`menuFooter`, `runTextInput`, `enterScreen`/`breadcrumb`, `createSpinner`, `success`/`error`, tokens, `t`. Produces `export async function showSchedule(): Promise<void>`.

- [ ] **Step 1: Ensure reuse exports.** In `src/features/student-timetable.ts`, add `export` to `interactiveLogin`, `withAuthenticatedSession`, `writePrivateIcs`, `clientFor` if they are not already exported (they are module-internal today). Also export a `JWXT_ORIGIN` const. Verify with `grep -n "export" src/features/student-timetable.ts`. No behavior change.

- [ ] **Step 2: Implement `showSchedule`.**

```ts
// src/features/schedule-view.ts
import { createNbtTimetableClient, timetableToIcs, type AcademicTermRef, type Timetable } from '@nbtca/nbtcal/timetable';
import { runMenu, menuFooter } from '../core/components/menu.js';
import { runTextInput } from '../core/components/text-input.js';
import { enterScreen, breadcrumb } from '../core/transitions.js';
import { createSpinner, success, error } from '../core/ui.js';
import { c, type, space } from '../core/theme.js';
import { t } from '../i18n/index.js';
import { withAuthenticatedSession, resolveTerm, relevantTerms, writePrivateIcs, JWXT_ORIGIN } from './student-timetable.js';
import { currentWeekNumber, campusWeekday, meetingsOnDay } from './schedule-query.js';
import { renderNextClassBanner, renderTodayClasses, renderWeekGrid } from './schedule-render.js';
import { termKey, loadWeekOne, saveWeekOne, saveTimetableCache } from './schedule-store.js';
import { nextMeeting } from './schedule-query.js';

async function ensureWeekOne(key: string): Promise<string | null> {
  const saved = loadWeekOne(key);
  if (saved) return saved;
  const trans = t();
  const value = await runTextInput({ message: trans.timetable.promptWeekOne, placeholder: 'YYYY-MM-DD' });
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  saveWeekOne(key, value.trim());
  return value.trim();
}

export async function showSchedule(): Promise<void> {
  const trans = t();
  await enterScreen(breadcrumb(trans.timetable.menuEntry));

  await withAuthenticatedSession(async (session) => {
    const client = createNbtTimetableClient(session.timetableTransport, { baseUrl: JWXT_ORIGIN });
    let term = resolveTerm(await client.listTerms());
    let key = termKey(term);
    let weekOne = await ensureWeekOne(key);
    if (!weekOne) return 0;

    const spinner = createSpinner(trans.calendar.loading);
    let tt: Timetable;
    try { tt = await client.fetchTerm(term as AcademicTermRef); spinner.stop(); }
    catch { spinner.error(trans.timetable.genericError); return 1; }
    saveTimetableCache(key, tt);

    while (true) {
      const now = new Date();
      const week = currentWeekNumber(weekOne!, now);
      const today = meetingsOnDay(tt.meetings, campusWeekday(now), week);
      console.log();
      console.log(renderNextClassBanner(nextMeeting(tt.meetings, tt.periods, weekOne!, now), now));
      console.log();
      console.log(renderTodayClasses(today, tt.periods, now));
      console.log();

      const action = await runMenu({
        title: `${trans.timetable.menuEntry}  ${c.muted(term.academicYearLabel)}  ${c.muted(trans.timetable.weekLabel + week)}`,
        options: [
          { value: 'today', label: trans.timetable.hubToday, hint: String(today.length) },
          { value: 'week',  label: trans.timetable.hubWeek },
          { value: 'term',  label: trans.timetable.hubSwitchTerm, hint: term.academicYearLabel },
          { value: 'export', label: trans.timetable.hubExport },
        ],
        footer: menuFooter(),
      });
      if (action === null) return 0;
      if (action === 'today') { /* already shown; loop repaints */ }
      else if (action === 'week') { console.log(); console.log(renderWeekGrid(tt.meetings, tt.periods, week, now)); console.log(); }
      else if (action === 'term') {
        const picked = await runMenu({
          title: trans.timetable.hubSwitchTerm,
          options: relevantTerms(await client.listTerms()).map((tm) => ({ value: `${tm.academicYear}:${tm.semester}`, label: `${tm.academicYearLabel}`, hint: tm.current ? trans.common.current : undefined })),
          footer: menuFooter(),
        });
        if (picked !== null) {
          term = resolveTerm(await client.listTerms(), picked);
          key = termKey(term);
          weekOne = await ensureWeekOne(key);
          if (!weekOne) return 0;
          const sp2 = createSpinner(trans.calendar.loading);
          try { tt = await client.fetchTerm(term as AcademicTermRef); sp2.stop(); saveTimetableCache(key, tt); }
          catch { sp2.error(trans.timetable.genericError); return 1; }
        }
      } else if (action === 'export') {
        const ics = timetableToIcs(tt, { weekOneMonday: weekOne!, calendarName: `NBT ${term.academicYearLabel}` });
        const out = `timetable-${key}.ics`;
        try { writePrivateIcs(out, ics); success(`${trans.timetable.exported}: ${out}`); }
        catch (e) { error(`${trans.timetable.genericError}`); }
      }
    }
  }, { isInteractive: true });
}
```

(If `withAuthenticatedSession`'s option shape differs, match its actual signature — read `student-timetable.ts`. The handler returns a number exit code; `showSchedule` ignores it.)

- [ ] **Step 3:** `npm run build` → clean; `npx vitest run` → green (no unit test for the interactive hub; verified live in Task 9).
- [ ] **Step 4:** Commit `feat(schedule): interactive schedule hub`.

---

### Task 7: wire "课表" into the main menu

**Files:** Modify `src/core/menu.ts`.

- [ ] **Step 1:** In `getMainMenuOptions`, add an entry `{ value: 'schedule', label: t().timetable.menuEntry }` (place it after `events`). Add `schedule` to the `MenuAction` type and to `runMenuAction`'s switch: `case 'schedule': await showSchedule(); break;` (import `showSchedule` from `../features/schedule-view.js`).
- [ ] **Step 2:** `npm run build` → clean; `npx vitest run` → green.
- [ ] **Step 3:** Commit `feat(menu): add Schedule to the main menu`.

---

### Task 8: personalized startup line

**Files:** Modify `src/main.ts`; add a helper `peekNextClass` (in `schedule-view.ts` or a small `schedule-peek.ts`).

- [ ] **Step 1:** Add `export function peekNextClassLine(): string` to `src/features/schedule-view.ts` (or a new `schedule-peek.ts`): read the cached timetable + week-one for the current term **from cache only** (no network); if a session/cache/week-one exists and there's a next class, return `renderNextClassBanner(...)`, else `''`. It must never throw (best-effort).

```ts
export function peekNextClassLine(now: Date = new Date()): string {
  try {
    // Find the most-recently-cached term: iterate week-one keys; pick the one whose cache exists.
    // (Simple: read the single most recent timetable cache. If your store lacks a "current" pointer,
    //  store a `current-term.json` pointer in saveTimetableCache and read it here.)
    // Return '' on any missing piece.
    return '';
  } catch { return ''; }
}
```

Because the store has no "current term" pointer, extend Task 5's `saveTimetableCache` to also write a `current-term.json` (the last `termKey` + its `weekOne`), and `peekNextClassLine` reads that pointer → loads the cached timetable → `nextMeeting` → `renderNextClassBanner`. Keep it dependency-light and best-effort.

- [ ] **Step 2:** In `src/main.ts`, after `showEventsPreview()` (and before the menu), call `const line = peekNextClassLine(); if (line) console.log(line);` guarded so it only prints when non-empty (i.e., a logged-in student with a cached timetable). Never block or throw.
- [ ] **Step 3:** `npm run build` → clean; `npx vitest run` → green (add a unit test that `peekNextClassLine` returns `''` when no cache exists).
- [ ] **Step 4:** Commit `feat(startup): personalized next-class line when signed in`.

---

### Task 9: live end-to-end verification (controller)

**Not a subagent task** — the controller runs this with real credentials, transiently, never committing/logging them:
- Build; drive `showSchedule` reachable via the menu; confirm login → week-one prompt (persisted) → today's classes + next-class banner + weekly grid render correctly with real data; export writes a `0600` `.ics`; re-launch shows the personalized startup line from cache (offline).
- Confirm the CLI `schedule ...` commands still behave as before; full suite green; `bash scripts/test-cli.sh` passes.

## Self-Review

- Today/next/week all derive from the persisted week-one Monday (the campus-no-dates crux) → Tasks 1, 5, 6. ✅
- Menu「课表」+ today (Task 7 + 6/3), next-class countdown (3), weekly grid (4), interactive login/term/export (6, reusing existing auth) → all four selected pieces. ✅
- Personalized startup (8). ✅
- No new deps; no credential storage; `0600` files; degradation via existing widgets. ✅
- **Placeholder note:** Task 8's `peekNextClassLine` body is intentionally sketched — its final form is "read `current-term.json` pointer → cached timetable → nextMeeting → banner"; the implementer wires that concretely (Task 5's cache gains the pointer). The unit test pins the empty-cache path; the populated path is covered by the Task 9 live check.
