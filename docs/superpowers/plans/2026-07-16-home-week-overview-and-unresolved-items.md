# Home Week-Overview + Unresolved-Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Parts D/E of `docs/superpowers/specs/2026-07-16-schedule-term-density-and-home-control-center-design.md` — a combined class+event density grid for the coming week (`本周概览`) on Home, plus surfacing unresolved schedule items directly on Home instead of only inside Schedule's own hub menu.

**Architecture:** Two new cache-only "peek" functions in `src/features/schedule-view.ts` (matching the existing `peekTodayLines`/`peekNextClassLine` convention exactly — same file, same never-throws contract, same real-filesystem-fixture test style), a new pure grid renderer co-located in `src/app/views/home.ts` (matching how `renderDayProgress` already lives directly in that file rather than being promoted to `features/`, since nothing else in the app uses it), and a rework of `homeView.load()` to fetch the calendar feed exactly once and reuse that single `Calendar` instance for both the existing "upcoming events" list and the new week-ahead event row (currently `load()` calls the `fetchEvents()` wrapper, which internally creates a `Calendar` and discards it — this plan replaces that call with direct `loadCalendarOrThrow()` + `.upcoming()` so the same instance can also serve `.inRange()`).

**Tech Stack:** TypeScript, vitest, this codebase's existing cache-file fixture pattern (`XDG_STATE_HOME` + real `mkdirSync`/`writeFileSync`, not mocks, for the cache-only functions), `vi.mock` only for the one unavoidable network boundary (`loadCalendarOrThrow`).

## Global Constraints

- `peekWeekAheadInfo`/`peekUnresolvedCount` must never throw — same contract as `peekTodayLines`/`peekNextClassLine` (wrap all cache reads in try/catch, return a safe empty value on any failure).
- The week-overview panel is **hidden entirely** (not shown with empty/placeholder cells) when there's no set-up personal timetable (`loadCurrentPointer()` returns `null`) **or** the term hasn't started yet (current week number `< 1`) — this exact "before term start" case was already a real, fixed bug in Schedule's own hub this session ("Regression: weekOne can be auto-inferred ahead of now while on break... produced a nonsensical negative week number and an empty-but-present class grid"); this plan must not reintroduce that bug class in a new location.
- **No color ramp** anywhere in the new grid — `type.body`/`type.hint` only, never `type.active` or `c.brand`. This is a deliberate, explicit restraint per the spec's "Visual language decision" (the grid summarizes two *other* already-colored things; it doesn't need its own color language).
- **Weekend asymmetry is real, not a copy-paste bug:** the class row hardcodes Saturday/Sunday to the "weekend/N-A" glyph regardless of any data (campus never has weekend classes); the event row does **not** hardcode weekend — a real Saturday club event must show as "busy," not "weekend."
- Every multi-line renderer in this codebase returns one `'\n'`-joined string; callers `.split('\n')` before pushing into a lines array. The new grid renderer follows this convention, and gets the standard "never collapses into one array entry" regression test every other renderer in this app already has.
- `homeView.load()` must call `loadCalendarOrThrow()` **exactly once** per load — the whole point of this rework is eliminating a second, redundant network fetch.

---

## Task 1: Add Home week-overview i18n keys

**Files:**
- Modify: `src/i18n/index.ts:296` (end of the `timetable` interface block, just before its closing `};`)
- Modify: `src/i18n/locales/en.json:277` (end of the `"timetable"` object, just before its closing `},`)
- Modify: `src/i18n/locales/zh.json:277` (same)

**Interfaces:**
- Produces: `Translations['timetable']` gains `weekOverviewTitle`, `weekAheadClasses`, `weekAheadBusy`, `weekAheadFree`, `weekAheadNone` — all `string`. Tasks 3/4 read these via `t().timetable.<key>`. (The event row's label reuses the *existing* `t().menu.events` key — no new key needed for it, since it's already exactly "Events"/"活动".)

- [ ] **Step 1: Add the keys to the `Translations` interface**

In `src/i18n/index.ts`, the `timetable` block currently ends like this (lines 295–297):

```ts
    weekdayPrefix: string;
  };
```

Change it to:

```ts
    weekdayPrefix: string;
    weekOverviewTitle: string;
    weekAheadClasses: string;
    weekAheadBusy: string;
    weekAheadFree: string;
    weekAheadNone: string;
  };
```

- [ ] **Step 2: Add the English values**

In `src/i18n/locales/en.json`, the `"timetable"` object currently ends like this (lines 276–278):

```json
    "weekdayPrefix": ""
  },
```

Change it to:

```json
    "weekdayPrefix": "",
    "weekOverviewTitle": "Week overview",
    "weekAheadClasses": "Classes",
    "weekAheadBusy": "Busy",
    "weekAheadFree": "Free",
    "weekAheadNone": "N/A"
  },
```

- [ ] **Step 3: Add the Chinese values**

In `src/i18n/locales/zh.json`, the `"timetable"` object currently ends like this (lines 276–278):

```json
    "weekdayPrefix": "周"
  },
```

Change it to:

```json
    "weekdayPrefix": "周",
    "weekOverviewTitle": "本周概览",
    "weekAheadClasses": "课程",
    "weekAheadBusy": "较满",
    "weekAheadFree": "较空",
    "weekAheadNone": "无"
  },
```

- [ ] **Step 4: Verify with a type check**

Run: `npx tsc --noEmit`
Expected: no new errors. Re-read both JSON diffs by eye to confirm all 5 keys landed in both files (there's no automated en/zh parity test in this codebase).

- [ ] **Step 5: Commit**

```bash
git add src/i18n/index.ts src/i18n/locales/en.json src/i18n/locales/zh.json
git commit -m "i18n: add Home week-overview translation keys"
```

---

## Task 2: `peekWeekAheadInfo` and `peekUnresolvedCount` (cache-only reads)

**Files:**
- Modify: `src/features/schedule-view.ts` (add two new exported functions)
- Test: `src/features/schedule-view.test.ts` (add two new `describe` blocks, following the exact real-filesystem-fixture pattern the existing `peekTodayLines`/`peekNextClassLine` tests already use)

**Interfaces:**
- Consumes: `loadCurrentPointer`, `loadTimetableCache` (from `./schedule-store.js`, already imported in this file), `currentWeekNumber`, `meetingsOnDay` (from `./schedule-query.js`, already imported).
- Produces:
  - `export interface WeekAheadInfo { weekStartDate: Date; classDays: boolean[]; }` — `classDays[0]` is Monday, `classDays[6]` is Sunday, raw per-day "has any meeting" booleans with **no** weekend override applied (that's the render layer's job in Task 3, mirroring how `renderWeekStrip`'s own data-gathering doesn't know about weekends either).
  - `export function peekWeekAheadInfo(now: Date = new Date()): WeekAheadInfo | null` — `null` when there's no set-up timetable, the cache is unusable, or the current week number is `< 1` (term hasn't started).
  - `export function peekUnresolvedCount(): number` — `0` when there's no set-up timetable or the cache is unusable.
  - Consumed by Task 5 (`home.ts`'s `load()`), which also reads `WeekAheadInfo.weekStartDate` directly.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/schedule-view.test.ts` (after the existing `describe('peekTodayLines', ...)` block):

```ts
describe('peekWeekAheadInfo', () => {
  let dir: string;
  let prevStateHome: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sched-peek-week-'));
    prevStateHome = process.env['XDG_STATE_HOME'];
    process.env['XDG_STATE_HOME'] = dir;
  });

  afterEach(() => {
    if (prevStateHome === undefined) delete process.env['XDG_STATE_HOME'];
    else process.env['XDG_STATE_HOME'] = prevStateHome;
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when no current-term pointer/cache exists', () => {
    expect(peekWeekAheadInfo()).toBeNull();
  });

  it('returns null when the term has not started yet (negative week)', () => {
    mkdirSync(join(dir, 'nbtca'), { recursive: true });
    writeFileSync(join(dir, 'nbtca', 'current-term.json'), JSON.stringify({ termKey: '2026-1', weekOneMonday: '2099-01-05' }));
    writeFileSync(join(dir, 'nbtca', 'timetable-2026-1.json'), JSON.stringify({
      term: { academicYear: '2099', semester: '1' }, meetings: [], unresolvedItems: [],
      periods: [], calendarDays: [], warnings: [], fetchedAt: '2026-09-14T00:00:00Z',
    }));
    expect(peekWeekAheadInfo(new Date('2026-09-14T12:00:00'))).toBeNull();
  });

  it('computes raw per-day classDays with no weekend override applied', () => {
    mkdirSync(join(dir, 'nbtca'), { recursive: true });
    writeFileSync(join(dir, 'nbtca', 'current-term.json'), JSON.stringify({ termKey: '2026-1', weekOneMonday: '2026-09-14' }));
    writeFileSync(join(dir, 'nbtca', 'timetable-2026-1.json'), JSON.stringify({
      term: { academicYear: '2026', semester: '1' },
      meetings: [
        { sourceId: null, courseName: 'Math', teacherNames: [], location: null, weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1], kind: 'regular' },
        // A weekday-6 (Saturday) meeting on purpose: this function's own
        // contract is the *raw* per-day signal, no weekend override — that
        // override is applied later, at render time (Task 3).
        { sourceId: null, courseName: 'PE', teacherNames: [], location: null, weekday: 6, startPeriod: 1, endPeriod: 1, weeks: [1], kind: 'regular' },
      ],
      unresolvedItems: [], periods: [{ period: 1, label: null, start: '08:00', end: '08:45' }],
      calendarDays: [], warnings: [], fetchedAt: '2026-09-14T00:00:00Z',
    }));
    const info = peekWeekAheadInfo(new Date('2026-09-14T12:00:00')); // Monday of week 1
    expect(info).not.toBeNull();
    expect(info!.classDays).toEqual([true, false, false, false, false, true, false]);
  });

  it('returns the Monday of the current campus week as weekStartDate', () => {
    mkdirSync(join(dir, 'nbtca'), { recursive: true });
    writeFileSync(join(dir, 'nbtca', 'current-term.json'), JSON.stringify({ termKey: '2026-1', weekOneMonday: '2026-09-14' }));
    writeFileSync(join(dir, 'nbtca', 'timetable-2026-1.json'), JSON.stringify({
      term: { academicYear: '2026', semester: '1' }, meetings: [], unresolvedItems: [],
      periods: [], calendarDays: [], warnings: [], fetchedAt: '2026-09-14T00:00:00Z',
    }));
    // 2026-09-23 is a Wednesday in week 2 (weekOneMonday + 9 days) -> that
    // week's Monday is 2026-09-21.
    const info = peekWeekAheadInfo(new Date('2026-09-23T12:00:00'));
    expect(info).not.toBeNull();
    expect(info!.weekStartDate.getFullYear()).toBe(2026);
    expect(info!.weekStartDate.getMonth()).toBe(8); // September, 0-indexed
    expect(info!.weekStartDate.getDate()).toBe(21);
  });

  it('never throws even with a corrupt cache', () => {
    expect(() => peekWeekAheadInfo()).not.toThrow();
  });
});

describe('peekUnresolvedCount', () => {
  let dir: string;
  let prevStateHome: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sched-peek-unresolved-'));
    prevStateHome = process.env['XDG_STATE_HOME'];
    process.env['XDG_STATE_HOME'] = dir;
  });

  afterEach(() => {
    if (prevStateHome === undefined) delete process.env['XDG_STATE_HOME'];
    else process.env['XDG_STATE_HOME'] = prevStateHome;
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns 0 when no current-term pointer/cache exists', () => {
    expect(peekUnresolvedCount()).toBe(0);
  });

  it('returns the real unresolved item count from the cache', () => {
    mkdirSync(join(dir, 'nbtca'), { recursive: true });
    writeFileSync(join(dir, 'nbtca', 'current-term.json'), JSON.stringify({ termKey: '2026-1', weekOneMonday: '2026-09-14' }));
    writeFileSync(join(dir, 'nbtca', 'timetable-2026-1.json'), JSON.stringify({
      term: { academicYear: '2026', semester: '1' }, meetings: [],
      unresolvedItems: [
        { kind: 'practice', itemIndex: 0, sourceFields: { kcmc: 'Fitness test' } },
        { kind: 'practice', itemIndex: 1, sourceFields: { kcmc: 'Lab' } },
      ],
      periods: [], calendarDays: [], warnings: [], fetchedAt: '2026-09-14T00:00:00Z',
    }));
    expect(peekUnresolvedCount()).toBe(2);
  });

  it('never throws even with a corrupt cache', () => {
    expect(() => peekUnresolvedCount()).not.toThrow();
  });
});
```

Widen this test file's import line from:

```ts
import { peekNextClassLine, peekTodayLines } from './schedule-view.js';
```

to:

```ts
import { peekNextClassLine, peekTodayLines, peekWeekAheadInfo, peekUnresolvedCount } from './schedule-view.js';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/schedule-view.test.ts -t "peekWeekAheadInfo|peekUnresolvedCount"`
Expected: FAIL — neither function is exported yet.

- [ ] **Step 3: Implement both functions**

Append to the end of `src/features/schedule-view.ts`:

```ts
export interface WeekAheadInfo {
  weekStartDate: Date;
  /** Raw per-day "has any meeting" signal, index 0 = Monday .. index 6 =
   * Sunday. No weekend override applied here — that's a display decision
   * made by the caller's renderer, not this cache read. */
  classDays: boolean[];
}

/** Best-effort, cache-only (no network) computation of this week's per-day
 * class signal, for Home's combined week-overview grid. Returns null when
 * there's no set-up personal timetable, the cache is unusable, or the term
 * hasn't started yet (current week < 1) — the same "before term start"
 * guard already fixed once for Schedule's own hub (a future-dated weekOne,
 * auto-inferred while on break, must not render a nonsensical negative
 * week's worth of content). */
export function peekWeekAheadInfo(now: Date = new Date()): WeekAheadInfo | null {
  try {
    const ptr = loadCurrentPointer();
    if (!ptr) return null;
    const cached = loadTimetableCache(ptr.termKey) as { meetings?: unknown } | null;
    if (!cached || !Array.isArray(cached.meetings)) return null;
    const week = currentWeekNumber(ptr.weekOneMonday, now);
    if (week < 1) return null;
    const meetings = cached.meetings as Timetable['meetings'];
    const classDays = [1, 2, 3, 4, 5, 6, 7].map((wd) => meetingsOnDay(meetings, wd, week).length > 0);
    const base = new Date(`${ptr.weekOneMonday}T00:00:00`);
    const weekStartDate = new Date(base.getTime() + (week - 1) * 7 * 86400000);
    return { weekStartDate, classDays };
  } catch {
    return null;
  }
}

/** Best-effort, cache-only (no network) read of how many timetable items
 * still need the student's attention — the same data buildHubField()
 * (schedule.ts) already surfaces inside Schedule's own hub menu, exposed
 * here so Home can show it too without a second source of truth. */
export function peekUnresolvedCount(): number {
  try {
    const ptr = loadCurrentPointer();
    if (!ptr) return 0;
    const cached = loadTimetableCache(ptr.termKey) as { unresolvedItems?: unknown } | null;
    if (!cached || !Array.isArray(cached.unresolvedItems)) return 0;
    return cached.unresolvedItems.length;
  } catch {
    return 0;
  }
}
```

`Timetable` is already imported at the top of this file (`import { ... type Timetable } from '@nbtca/nbtcal/timetable';`) — no new import needed for that. `currentWeekNumber`/`meetingsOnDay`/`loadCurrentPointer`/`loadTimetableCache` are also already imported in this file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/schedule-view.test.ts`
Expected: PASS (all tests in the file, including the new ones)

- [ ] **Step 5: Commit**

```bash
git add src/features/schedule-view.ts src/features/schedule-view.test.ts
git commit -m "feat: add peekWeekAheadInfo and peekUnresolvedCount cache-only reads"
```

---

## Task 3: `renderWeekAheadGrid` pure renderer

**Files:**
- Modify: `src/app/views/home.ts` (add a new local function, not exported — it's used only by `renderHome` in the same file, matching `renderDayProgress`'s existing treatment)
- Test: `src/app/views/home.test.ts` (new `describe('renderHome — week overview panel (Part D)', ...)` block, since the grid renderer isn't exported on its own — it's tested through `renderHome`'s public output, same as `renderDayProgress` already is)

**Interfaces:**
- Consumes: `weekdayShortLabel` (new import from `../../features/schedule-render.js`), `pickIcon` (new import from `../../core/icons.js`), `padEndV`/`visualWidth` (new import from `../../core/text.js`).
- Produces: a local `renderWeekAheadGrid(classDays: readonly boolean[], eventDays: readonly boolean[] | undefined): string` — one `'\n'`-joined 4-line string (header, class row, event row, legend). Consumed by Task 4's `renderHome` wiring.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/views/home.test.ts`:

```ts
describe('renderHome — week overview panel (Part D)', () => {
  it('does not show the week overview panel at all when weekAhead is absent', () => {
    const out = stripAnsi(renderHome({ loading: false }, noon).join('\n'));
    expect(out).not.toContain('Week overview');
  });

  it('shows the panel with class/event row labels and a legend when weekAhead data is present', () => {
    const lines = renderHome({
      loading: false,
      weekAhead: { classDays: [true, false, true, false, false, false, false], eventDays: [false, true, false, false, true, false, false] },
    }, noon).map((l) => stripAnsi(l));
    const titleIdx = lines.findIndex((l) => l.includes('Week overview'));
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(lines[titleIdx + 2]).toContain('Classes');
    expect(lines[titleIdx + 3]).toContain('Events');
    expect(lines[titleIdx + 4]).toContain('Busy');
    expect(lines[titleIdx + 4]).toContain('Free');
    expect(lines[titleIdx + 4]).toContain('N/A');
  });

  it('hardcodes weekend cells on the class row regardless of classDays data', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    try {
      const lines = renderHome({
        loading: false,
        // classDays[5]/[6] (Sat/Sun) are true on purpose -- the render
        // layer must still show them as weekend/N-A, not "busy".
        weekAhead: { classDays: [false, false, false, false, false, true, true] },
      }, noon).map((l) => stripAnsi(l));
      const titleIdx = lines.findIndex((l) => l.includes('Week overview'));
      const classCells = lines[titleIdx + 2]!.trim().split(/\s+/).slice(1);
      expect(classCells[5]).toBe('··');
      expect(classCells[6]).toBe('··');
    } finally {
      process.env['NBTCA_ICON_MODE'] = 'ascii';
      resetIconCache();
    }
  });

  it('does NOT hardcode weekend cells on the event row -- a real weekend event shows as busy', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    try {
      const lines = renderHome({
        loading: false,
        weekAhead: {
          classDays: [false, false, false, false, false, false, false],
          eventDays: [false, false, false, false, false, true, false], // Saturday has an event
        },
      }, noon).map((l) => stripAnsi(l));
      const titleIdx = lines.findIndex((l) => l.includes('Week overview'));
      const eventCells = lines[titleIdx + 3]!.trim().split(/\s+/).slice(1);
      expect(eventCells[5]).toBe('▓▓'); // Saturday: busy, not weekend/N-A
      expect(eventCells[6]).toBe('░░'); // Sunday: free, not weekend/N-A
    } finally {
      process.env['NBTCA_ICON_MODE'] = 'ascii';
      resetIconCache();
    }
  });

  it('renders the event row with no glyphs at all when eventDays is not yet known', () => {
    const lines = renderHome({
      loading: false,
      weekAhead: { classDays: [true, false, false, false, false, false, false] }, // no eventDays
    }, noon).map((l) => stripAnsi(l));
    const titleIdx = lines.findIndex((l) => l.includes('Week overview'));
    const eventLine = lines[titleIdx + 3]!;
    expect(eventLine).not.toMatch(/[▓░]/);
  });

  it('never collapses the grid into one array entry', () => {
    const lines = renderHome({
      loading: false,
      weekAhead: { classDays: [true, false, false, false, false, false, false], eventDays: [false, true, false, false, false, false, false] },
    }, noon);
    for (const l of lines) expect(l).not.toContain('\n');
  });
});
```

Note: `titleIdx + 1` is the day-labels header row (not asserted on directly above, but present), `+2` class row, `+3` event row, `+4` legend — this positional structure is exact and is what Task 4 wires up.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/views/home.test.ts -t "week overview panel"`
Expected: FAIL — `renderHome` doesn't know about `weekAhead` yet (`HomeData` has no such field), and the panel never appears.

- [ ] **Step 3: Implement `renderWeekAheadGrid`**

Widen the imports at the top of `src/app/views/home.ts` from:

```ts
import { type, space, glyph } from '../../core/theme.js';
import { t } from '../../i18n/index.js';
import { peekNextClassLine, peekTodayLines } from '../../features/schedule-view.js';
import { fetchEvents, renderEventBrief } from '../../features/calendar.js';
import type { View, AppContext } from '../view.js';
```

to:

```ts
import { type, space, glyph } from '../../core/theme.js';
import { t } from '../../i18n/index.js';
import { pickIcon } from '../../core/icons.js';
import { padEndV, visualWidth } from '../../core/text.js';
import { peekNextClassLine, peekTodayLines } from '../../features/schedule-view.js';
import { fetchEvents, renderEventBrief } from '../../features/calendar.js';
import { weekdayShortLabel } from '../../features/schedule-render.js';
import type { View, AppContext } from '../view.js';
```

`fetchEvents` stays here — `load()` still calls it unchanged at this point in the plan; Task 5 is where it's finally replaced with `loadCalendarOrThrow` + inline `.upcoming()`. `c` is deliberately NOT added yet either — nothing in this task's own code uses it (Task 4 adds it, when it actually introduces `c.warn(...)`). Adding either change early, before the task that actually needs it, breaks the build with an unused-import or missing-name error under this project's strict `tsc --noEmit` (`noUnusedLocals: true`) — each task's import diff must only add what that same task's own new code actually references.

Add this function right after `renderDayProgress` (before `renderHome`):

```ts
/** Combined class+event density grid for the coming campus week — the one
 * visualization neither Schedule nor Events alone can produce, since it
 * needs both data sources at once. Deliberately coarser (binary, not
 * 5-level) than Schedule's own term-density strip, and deliberately
 * uncolored (see the design spec's "Visual language decision") since it's
 * an overview of two other already-colored things, not a third color
 * language to learn. */
function renderWeekAheadGrid(classDays: readonly boolean[], eventDays: readonly boolean[] | undefined): string {
  const trans = t();
  const hasClassChar = pickIcon('▓▓', '##');
  const freeChar = pickIcon('░░', '..');
  const weekendChar = pickIcon('··', '..');
  const blankCell = '  ';

  const rowLabelW = Math.max(visualWidth(trans.timetable.weekAheadClasses), visualWidth(trans.menu.events)) + 1;

  const days = [1, 2, 3, 4, 5, 6, 7];
  const dayLabels = days.map((wd) => type.hint(weekdayShortLabel(wd))).join('  ');
  const headerLine = `${space.indent}${padEndV('', rowLabelW)}${dayLabels}`;

  // Class row: weekend is hardcoded to the "N/A" glyph regardless of
  // classDays data (campus never has weekend classes) -- matches
  // renderWeekStrip's own established weekend treatment exactly.
  const classCells = days.map((wd) => {
    const isWeekend = wd === 6 || wd === 7;
    const glyphChar = isWeekend ? weekendChar : (classDays[wd - 1] ? hasClassChar : freeChar);
    return type.body(glyphChar);
  }).join('  ');
  const classLine = `${space.indent}${type.hint(padEndV(trans.timetable.weekAheadClasses, rowLabelW))}${classCells}`;

  // Event row: deliberately NOT hardcoding weekend -- a club event can
  // happen on a Saturday, so this row checks real data for all 7 days.
  // undefined eventDays (events still loading, or the fetch failed) means
  // "not yet known" -- rendered as blank, not the "free" glyph, to
  // visually distinguish "no data yet" from "checked, nothing happening".
  const eventCells = days.map((wd) => {
    if (!eventDays) return blankCell;
    return type.body(eventDays[wd - 1] ? hasClassChar : freeChar);
  }).join('  ');
  const eventLine = `${space.indent}${type.hint(padEndV(trans.menu.events, rowLabelW))}${eventCells}`;

  const legend = `${space.indent}${type.hint(`${hasClassChar} ${trans.timetable.weekAheadBusy}  ${freeChar} ${trans.timetable.weekAheadFree}  ${weekendChar} ${trans.timetable.weekAheadNone}`)}`;

  return [headerLine, classLine, eventLine, legend].join('\n');
}
```

- [ ] **Step 4: Wire a minimal call site into `renderHome` so the tests above can pass**

This task only needs `renderHome` to place the panel correctly when `data.weekAhead` is present — the full `HomeData`/`load()` wiring (including the `unresolvedCount` line placement from Part E) is Task 4. Insert this block into `renderHome`, right after the existing "Today's classes" block's trailing `lines.push('');` and before the existing "Upcoming events" block's `lines.push(panelHeading(trans.menu.events));`:

```ts
  // Week overview (Part D): only when the student has a set-up, in-term
  // personal timetable -- mirrors peekWeekAheadInfo's own "not set up yet
  // / term hasn't started" -> null contract, hiding the whole panel rather
  // than showing empty/misleading cells.
  if (data.weekAhead) {
    lines.push(panelHeading(trans.timetable.weekOverviewTitle));
    lines.push(...renderWeekAheadGrid(data.weekAhead.classDays, data.weekAhead.eventDays).split('\n'));
    lines.push('');
  }
```

And widen the `HomeData` interface (near the top of the file) from:

```ts
export interface HomeData {
  loading?: boolean;
  nextClassLine?: string;
  todayLines?: string[];
  eventLines?: string[];
  eventsError?: boolean;
}
```

to:

```ts
export interface HomeData {
  loading?: boolean;
  nextClassLine?: string;
  todayLines?: string[];
  eventLines?: string[];
  eventsError?: boolean;
  weekAhead?: { classDays: boolean[]; eventDays?: boolean[] };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/app/views/home.test.ts`
Expected: PASS (all tests in the file, including the new ones — the pre-existing tests must still pass unchanged, since this task only adds a new conditional block)

- [ ] **Step 6: Commit**

```bash
git add src/app/views/home.ts src/app/views/home.test.ts
git commit -m "feat: add renderWeekAheadGrid, Home's combined class+event week overview"
```

---

## Task 4: Unresolved-items warning line (Part E)

**Files:**
- Modify: `src/app/views/home.ts`
- Test: `src/app/views/home.test.ts`

**Interfaces:**
- Consumes: `c.warn`, `pickIcon('⚠', '!')` (both already available via this task's imports — `c` was added to the theme import in Task 3, `pickIcon` too), `t().timetable.hubUnresolved` (pre-existing key, already used by `buildHubField()` in `schedule.ts` for the identical concept).
- Produces: `HomeData` gains `unresolvedCount?: number`; `renderHome` shows a single warn-styled line when `(data.unresolvedCount ?? 0) > 0`, placed after the week-overview block and before the events block.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/views/home.test.ts`:

```ts
describe('renderHome — unresolved items warning (Part E)', () => {
  it('does not show a warning line when unresolvedCount is 0 or absent', () => {
    const out = stripAnsi(renderHome({ loading: false }, noon).join('\n'));
    expect(out).not.toContain('Needs attention');
  });

  it('shows a warning line with the real count when unresolvedCount > 0', () => {
    const out = stripAnsi(renderHome({ loading: false, unresolvedCount: 3 }, noon).join('\n'));
    expect(out).toContain('Needs attention');
    expect(out).toContain('3');
  });

  it('places the warning after Today/Week overview and before Events', () => {
    const lines = renderHome({
      loading: false, unresolvedCount: 1,
      weekAhead: { classDays: [false, false, false, false, false, false, false] },
    }, noon).map((l) => stripAnsi(l));
    const todayIdx = lines.findIndex((l) => l.includes('Today'));
    const weekIdx = lines.findIndex((l) => l.includes('Week overview'));
    const warnIdx = lines.findIndex((l) => l.includes('Needs attention'));
    expect(warnIdx).toBeGreaterThan(todayIdx);
    expect(warnIdx).toBeGreaterThan(weekIdx);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/views/home.test.ts -t "unresolved items warning"`
Expected: FAIL — `HomeData` has no `unresolvedCount` field and `renderHome` never emits this line.

- [ ] **Step 3: Implement the warning line**

First, widen the theme import at the top of `src/app/views/home.ts` (this task is the first one whose own code actually uses `c`) from:

```ts
import { type, space, glyph } from '../../core/theme.js';
```

to:

```ts
import { c, type, space, glyph } from '../../core/theme.js';
```

Then widen `HomeData` (from Task 3's version) from:

```ts
export interface HomeData {
  loading?: boolean;
  nextClassLine?: string;
  todayLines?: string[];
  eventLines?: string[];
  eventsError?: boolean;
  weekAhead?: { classDays: boolean[]; eventDays?: boolean[] };
}
```

to:

```ts
export interface HomeData {
  loading?: boolean;
  nextClassLine?: string;
  todayLines?: string[];
  eventLines?: string[];
  eventsError?: boolean;
  weekAhead?: { classDays: boolean[]; eventDays?: boolean[] };
  unresolvedCount?: number;
}
```

In `renderHome`, right after the week-overview block added in Task 3 (and still before the existing "Upcoming events" block), add:

```ts
  // Unresolved schedule items (Part E): surfaced directly on Home instead
  // of only inside Schedule's own hub menu -- same c.warn + ⚠ treatment
  // buildHubField() (schedule.ts) already uses for this exact condition,
  // matching the "everything that needs your attention, in one place"
  // spirit of a gh-status-like control center.
  if ((data.unresolvedCount ?? 0) > 0) {
    lines.push(`${space.indent}${c.warn(`${pickIcon('⚠', '!')} ${trans.timetable.hubUnresolved} · ${data.unresolvedCount}`)}`);
    lines.push('');
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/views/home.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add src/app/views/home.ts src/app/views/home.test.ts
git commit -m "feat: surface unresolved schedule items directly on Home"
```

---

## Task 5: Wire `homeView.load()` — single Calendar fetch, populate weekAhead + unresolvedCount

**Files:**
- Modify: `src/app/views/home.ts`
- Test: `src/app/views/home.test.ts`

**Interfaces:**
- Consumes: `loadCalendarOrThrow`, `toDisplayEvent` (new imports from `../../features/calendar.js`, replacing `fetchEvents`), `campusWeekday` (new import from `../../features/schedule-query.js`), `peekWeekAheadInfo`, `peekUnresolvedCount` (added to the existing `schedule-view.js` import).
- Produces: `homeView.load()` populates `data.unresolvedCount` and `data.weekAhead.classDays` synchronously (cache-only, before any network call), then fills in `data.weekAhead.eventDays` once the single `Calendar` fetch resolves — calling `loadCalendarOrThrow()` exactly once per load, `.inRange()` only when there's a set-up timetable to correlate it against.

- [ ] **Step 1: Write the failing tests**

Widen the top of `src/app/views/home.test.ts` from:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { renderHome } from './home.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi } from '../../core/text.js';
```

to:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi } from '../../core/text.js';
import type { AppContext } from '../view.js';

const calendarUpcoming = vi.fn().mockReturnValue([]);
const calendarInRange = vi.fn().mockReturnValue([]);
const loadCalendarOrThrowMock = vi.fn().mockResolvedValue({
  upcoming: calendarUpcoming, inRange: calendarInRange,
  past: vi.fn().mockReturnValue([]), next: vi.fn().mockReturnValue([]), heatmap: vi.fn().mockReturnValue([]),
});
vi.mock('../../features/calendar.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/calendar.js')>();
  return { ...actual, loadCalendarOrThrow: loadCalendarOrThrowMock };
});

const { renderHome, homeView } = await import('./home.js');
```

(`renderHome` moves from the static top-level import into this dynamic `await import(...)`, after the `vi.mock` call, so the mock is in place before `home.ts` — and its `calendar.js` import — is evaluated. This mirrors the exact pattern already used in `schedule.test.ts`.)

Append a new describe block at the end of the file:

```ts
describe('homeView.load()', () => {
  let dir: string;
  let prevStateHome: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    calendarUpcoming.mockReturnValue([]);
    calendarInRange.mockReturnValue([]);
    loadCalendarOrThrowMock.mockResolvedValue({
      upcoming: calendarUpcoming, inRange: calendarInRange,
      past: vi.fn().mockReturnValue([]), next: vi.fn().mockReturnValue([]), heatmap: vi.fn().mockReturnValue([]),
    });
    dir = mkdtempSync(join(tmpdir(), 'home-load-'));
    prevStateHome = process.env['XDG_STATE_HOME'];
    process.env['XDG_STATE_HOME'] = dir;
  });

  afterEach(() => {
    if (prevStateHome === undefined) delete process.env['XDG_STATE_HOME'];
    else process.env['XDG_STATE_HOME'] = prevStateHome;
    rmSync(dir, { recursive: true, force: true });
  });

  function fakeCtx(): AppContext {
    return {
      size: { rows: 24, cols: 80 }, bodyRows: 19, rerender: vi.fn(),
      runClassic: vi.fn(async (fn: () => Promise<void>) => { await fn(); }), quit: vi.fn(),
    };
  }

  // 2020-01-06 is a real, permanently-past Monday -- safe to use as
  // weekOneMonday in these tests regardless of when the suite actually
  // runs (unlike a near-future date, which would eventually put the
  // fixture's "current week" before term start and make peekWeekAheadInfo
  // return null instead of the populated data these tests need).
  function writeSetUpFixture(dir: string): void {
    mkdirSync(join(dir, 'nbtca'), { recursive: true });
    writeFileSync(join(dir, 'nbtca', 'current-term.json'), JSON.stringify({ termKey: '2020-1', weekOneMonday: '2020-01-06' }));
    writeFileSync(join(dir, 'nbtca', 'timetable-2020-1.json'), JSON.stringify({
      term: { academicYear: '2020', semester: '1' }, meetings: [], unresolvedItems: [],
      periods: [], calendarDays: [], warnings: [], fetchedAt: '2020-01-06T00:00:00Z',
    }));
  }

  it('fetches the calendar exactly once and reuses it for both upcoming events and the week-ahead event row', async () => {
    writeSetUpFixture(dir);
    const ctx = fakeCtx();
    await homeView.load(ctx);
    expect(loadCalendarOrThrowMock).toHaveBeenCalledTimes(1);
    expect(calendarUpcoming).toHaveBeenCalledTimes(1);
    expect(calendarInRange).toHaveBeenCalledTimes(1);
  });

  it('does not call inRange at all when there is no set-up personal timetable', async () => {
    const ctx = fakeCtx();
    await homeView.load(ctx);
    expect(loadCalendarOrThrowMock).toHaveBeenCalledTimes(1);
    expect(calendarUpcoming).toHaveBeenCalledTimes(1);
    expect(calendarInRange).not.toHaveBeenCalled();
  });

  it('populates unresolvedCount and weekAhead.classDays synchronously, before the network call resolves', async () => {
    mkdirSync(join(dir, 'nbtca'), { recursive: true });
    writeFileSync(join(dir, 'nbtca', 'current-term.json'), JSON.stringify({ termKey: '2020-1', weekOneMonday: '2020-01-06' }));
    writeFileSync(join(dir, 'nbtca', 'timetable-2020-1.json'), JSON.stringify({
      term: { academicYear: '2020', semester: '1' },
      meetings: [{ sourceId: null, courseName: 'Math', teacherNames: [], location: null, weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1], kind: 'regular' }],
      unresolvedItems: [{ kind: 'practice', itemIndex: 0, sourceFields: { kcmc: 'Fitness test' } }],
      periods: [{ period: 1, label: null, start: '08:00', end: '08:45' }],
      calendarDays: [], warnings: [], fetchedAt: '2020-01-06T00:00:00Z',
    }));
    let capturedSync = false;
    const ctx: AppContext = {
      size: { rows: 24, cols: 80 }, bodyRows: 19,
      rerender: vi.fn(() => {
        if (!capturedSync) {
          capturedSync = true;
          const out = stripAnsi(homeView.render(ctx).join('\n'));
          expect(out).toContain('Needs attention');
          expect(out).toContain('Week overview');
        }
      }),
      runClassic: vi.fn(async (fn: () => Promise<void>) => { await fn(); }), quit: vi.fn(),
    };
    await homeView.load(ctx);
    expect(capturedSync).toBe(true); // sanity: the sync-phase rerender actually happened and was inspected
  });

  it('fills in weekAhead.eventDays from the real week-of-events after the network call resolves', async () => {
    writeSetUpFixture(dir);
    // 2020-01-06 (the fixture's weekOneMonday, and thus also the Monday of
    // "this week" for any `now` far enough in the future) has an event.
    calendarInRange.mockReturnValue([{ start: new Date('2020-01-06T18:00:00'), title: 'Club meetup' }]);
    const ctx = fakeCtx();
    await homeView.load(ctx);
    // Not a meaningful assertion about *which* week is "current" relative
    // to whatever "now" the test happens to run at -- just that eventDays
    // was populated at all (some cell is a real glyph, not blank), proving
    // the inRange result actually flowed into the rendered grid.
    const out = stripAnsi(homeView.render(ctx).join('\n'));
    const lines = out.split('\n');
    const titleIdx = lines.findIndex((l) => l.includes('Week overview'));
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    const eventLine = lines[titleIdx + 3]!;
    expect(eventLine).toMatch(/[▓░]/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/views/home.test.ts -t "homeView.load"`
Expected: FAIL — `load()` still calls `fetchEvents()` (a second, hidden `Calendar` fetch under the hood) and never populates `weekAhead`/`unresolvedCount`.

- [ ] **Step 3: Implement the `load()` rework**

Widen the imports at the top of `src/app/views/home.ts` (from Task 4's version) from:

```ts
import { c, type, space, glyph } from '../../core/theme.js';
import { t } from '../../i18n/index.js';
import { pickIcon } from '../../core/icons.js';
import { padEndV, visualWidth } from '../../core/text.js';
import { peekNextClassLine, peekTodayLines } from '../../features/schedule-view.js';
import { fetchEvents, renderEventBrief } from '../../features/calendar.js';
import { weekdayShortLabel } from '../../features/schedule-render.js';
import type { View, AppContext } from '../view.js';
```

to:

```ts
import { c, type, space, glyph } from '../../core/theme.js';
import { t } from '../../i18n/index.js';
import { pickIcon } from '../../core/icons.js';
import { padEndV, visualWidth } from '../../core/text.js';
import { peekNextClassLine, peekTodayLines, peekWeekAheadInfo, peekUnresolvedCount } from '../../features/schedule-view.js';
import { loadCalendarOrThrow, toDisplayEvent, renderEventBrief } from '../../features/calendar.js';
import { weekdayShortLabel } from '../../features/schedule-render.js';
import { campusWeekday } from '../../features/schedule-query.js';
import type { View, AppContext } from '../view.js';
```

Replace the entire `load()` method (currently):

```ts
  async load(ctx: AppContext): Promise<void> {
    // Schedule panels are cache-only and instant — populate them synchronously first.
    try {
      data = { loading: true, nextClassLine: peekNextClassLine(), todayLines: peekTodayLines() };
    } catch {
      data = { loading: true };
    }
    ctx.rerender();

    // Events is the only networked panel; best-effort. Fetches more than a
    // small terminal could ever show — renderHome trims to what actually
    // fits at render time based on real bodyRows. 15 is a glance-panel
    // ceiling, not a "full list" (Events' own tab is where you browse
    // everything); it just needs to be at least as many as the tallest
    // reasonable terminal could fit.
    const HOME_EVENT_FETCH_CAP = 15;
    try {
      const items = await fetchEvents();
      const now = new Date();
      const eventLines = items.slice(0, HOME_EVENT_FETCH_CAP).map((e) => renderEventBrief(e, now));
      data = { ...data, eventLines };
    } catch {
      data = { ...data, eventsError: true };
    } finally {
      data = { ...data, loading: false };
      ctx.rerender();
    }
  },
```

with:

```ts
  async load(ctx: AppContext): Promise<void> {
    // Schedule panels are cache-only and instant — populate them
    // synchronously first. weekAheadSync is computed once here and reused
    // below (peekWeekAheadInfo is itself cache-only/cheap, but capturing
    // its result avoids a second, redundant cache read for weekStartDate).
    const weekAheadSync = peekWeekAheadInfo();
    try {
      data = {
        loading: true,
        nextClassLine: peekNextClassLine(),
        todayLines: peekTodayLines(),
        unresolvedCount: peekUnresolvedCount(),
        weekAhead: weekAheadSync ? { classDays: weekAheadSync.classDays } : undefined,
      };
    } catch {
      data = { loading: true };
    }
    ctx.rerender();

    // Events is the only networked panel; best-effort. Fetches the calendar
    // exactly once and reuses that same Calendar instance for both the
    // upcoming-events list below and the week-ahead event row (when there's
    // a personal timetable to correlate it against) — not two separate
    // network round-trips for what both come from the same public feed.
    const HOME_EVENT_FETCH_CAP = 15;
    try {
      const cal = await loadCalendarOrThrow();
      const now = new Date();
      const items = cal.upcoming({ days: 30 }).slice(0, HOME_EVENT_FETCH_CAP).map(toDisplayEvent);
      const eventLines = items.map((e) => renderEventBrief(e, now));

      let weekAhead = data.weekAhead;
      if (weekAheadSync) {
        const weekEnd = new Date(weekAheadSync.weekStartDate.getTime() + 7 * 86400000);
        const weekEvents = cal.inRange(weekAheadSync.weekStartDate, weekEnd);
        const daySet = new Set(weekEvents.map((e) => campusWeekday(e.start)));
        weekAhead = { classDays: weekAheadSync.classDays, eventDays: [1, 2, 3, 4, 5, 6, 7].map((wd) => daySet.has(wd)) };
      }
      data = { ...data, eventLines, weekAhead };
    } catch {
      data = { ...data, eventsError: true };
    } finally {
      data = { ...data, loading: false };
      ctx.rerender();
    }
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/views/home.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — every test in the repo. Also run `npx tsc --noEmit` — expected clean (this task removes the `fetchEvents` import; confirm no other file in `src/` still relies on `home.ts` re-exporting it, and that `fetchEvents` itself is still exported from `calendar.ts` for anything else that uses it directly).

- [ ] **Step 6: Commit**

```bash
git add src/app/views/home.ts src/app/views/home.test.ts
git commit -m "feat: wire Home's week overview + unresolved-items into load()"
```

---

## Task 6: Live verification against real data

No code changes — the live pty check this session has used for every prior feature, confirming real rendering (real cache data, real network feed) matches the unit-tested behavior.

- [ ] **Step 1: Confirm there is real cached timetable data**

The Schedule term-density/by-location plan's live verification already confirmed real cached data exists at `~/.local/state/nbtca/timetable-<key>.json` (18 meetings, 12 periods) with `weekOneMonday` in `~/.config/nbtca/week-one.json`. Reuse it. If it's since been cleared, log in once via `npx tsx src/index.ts` (Schedule tab → sign in) to repopulate it.

- [ ] **Step 2: Launch the app in a real pty and inspect Home**

Note from the Schedule plan's own live-verification task: **drain the pty's output between every keystroke** (`select()` + `read()` in a loop while waiting, not a bare `time.sleep()`) — sending a second keystroke without draining fills the child's output buffer and makes the app appear to hang. This is a harness requirement, not an app bug; it was root-caused during this session's own Schedule verification.

```bash
python3 - <<'EOF'
import pty, os, fcntl, termios, struct, time, sys, select

def run(rows, cols, steps, label, wait_start=4.0):
    pid, fd = pty.fork()
    if pid == 0:
        os.chdir('/Users/m1ng/code/github/nbtca/Prompt')
        os.execv('/Users/m1ng/code/github/nbtca/Prompt/node_modules/.bin/tsx', ['tsx', 'src/index.ts'])
    else:
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
        collected = b''
        def drain(duration):
            nonlocal collected
            t0 = time.time()
            while time.time() - t0 < duration:
                r, _, _ = select.select([fd], [], [], 0.2)
                if fd in r:
                    try:
                        chunk = os.read(fd, 65536)
                        if chunk: collected += chunk
                    except OSError:
                        break
        drain(wait_start)
        for key, wait_after in steps:
            os.write(fd, key.encode())
            drain(wait_after)
        deadline = time.time() + 2.5
        try:
            while time.time() < deadline:
                r, _, _ = select.select([fd], [], [], 0.3)
                if fd in r:
                    chunk = os.read(fd, 65536)
                    if not chunk: break
                    collected += chunk
                    deadline = time.time() + 1
        except OSError:
            pass
        try:
            os.kill(pid, 9)
        except ProcessLookupError:
            pass
        sys.stderr.write(f"=== {label} ({rows}x{cols}) === {len(collected)} bytes\n")
        with open(f'/tmp/pty_{label}.txt', 'wb') as f:
            f.write(collected)

# Home is the default tab on launch -- no navigation needed, just capture
# the landed frame at both a normal and a tall terminal size.
run(30, 90, [], 'home_normal', wait_start=4.5)
run(50, 100, [], 'home_tall', wait_start=4.5)
EOF
```

- [ ] **Step 3: Visually confirm**

- With the real cached timetable (weekOneMonday in the future relative to today's real date), the `本周概览`/"Week overview" panel does **not** appear at all — the term hasn't started, matching `peekWeekAheadInfo`'s `week < 1` guard. This is the expected, correct behavior for the real data currently cached, not a bug.
- If the unresolved-items count in the real cache is `> 0` (the live verification for the Schedule plan found exactly one such item, "Fitness test" / a practice record), a `⚠ Needs attention · 1` line appears on Home, between Today and Events, styled the same warn-yellow as the equivalent line in Schedule's own hub menu.
- The existing Next/Today/Events panels still render exactly as before (this task must not have visibly changed anything about them).
- Both terminal sizes render without visual corruption or a collapsed/missing header (the standard multi-line-collapse regression check, done visually here in addition to Task 3's automated one).

- [ ] **Step 4: No commit for this task** — verification-only. If it surfaces a real bug, fix it in a new commit and re-run Steps 2–3.

---

## Summary of what this plan does NOT do

- Does not touch Schedule's term-density/by-location work (already shipped, separate plan) — Home's grid pulls from the same cache format but does not modify `schedule-render.ts`, `schedule.ts`, or the features-layer renderers those already use.
- Does not add a "compare weeks" or historical view to Home — out of scope, not part of the design spec.
- Does not change `fetchEvents()`'s own signature or remove it from `calendar.ts` — it's still exported and used elsewhere (e.g. the CLI's classic `showEventsPreview` path); only `home.ts`'s own call site stops using it, in favor of the lower-level `loadCalendarOrThrow` + `.upcoming()` it already wraps.
