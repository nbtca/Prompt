# Schedule Interactive Grid + Compact Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `docs/superpowers/specs/2026-07-17-schedule-interactive-grid-and-compact-hub-design.md`: make the Schedule week grid cursor-navigable with a drill-down meeting-detail card (Parts A/B), and replace the hub's always-visible vertical `ListField` menu with a single-line keyboard-shortcut bar (Part C).

**Architecture:** A new pure cursor-math module (`src/app/views/schedule-grid-cursor.ts`) owns cursor movement and key-to-action mapping, shared by hub mode's inline grid and the standalone `'week'` mode. `renderWeekGrid` (`src/features/schedule-render.ts`) gains an optional cursor parameter and a new `type.cursor` visual token (`src/core/theme.ts`), distinct from `type.active`. A new pure `renderMeetingDetail` renderer (same file) draws the untruncated detail card for a new `'meetingDetail'` `ScheduleMode`. The hub's `ListField` menu is replaced by `hubShortcuts()` (data) + `renderShortcutBar()` (rendering) in `src/app/views/schedule-render.ts`, consumed by both the renderer and `src/app/views/schedule.ts`'s key handling, so the visible bar and the actual key bindings can never drift apart.

**Tech Stack:** TypeScript, vitest, chalk (via `src/core/theme.ts`'s `c`/`type`/`glyph` tokens), the existing `pickIcon` ASCII-fallback icon system.

## Global Constraints

- Every renderer in `src/features/schedule-render.ts` returns one `'\n'`-joined string; every call site MUST `.split('\n')` before pushing into a lines array — this file's established, regression-tested convention.
- `type.cursor` (new) is visually and semantically distinct from `type.active`: `active` means "today" (grid header) / "currently selected" (every `ListField`); `cursor` means "your cursor is here." Never conflate them, even when the cursor lands on today's own column — both tokens apply independently in that case (cursor wins the cell's own text styling; today's `•` weekday-header marker is untouched).
- Grid cursor navigation (`ArrowLeft`/`Right`/`Up`/`Down`) clamps at the edges with **no wraparound** — a deliberate departure from `ListField`'s own wrap-at-the-ends behavior (spec Part A).
- Shortcut-bar key bindings are **`w`, `t`, `s`, `e`, `u` (conditional), `x`** — not `l` for logout. `src/core/vim-keys.ts` remaps a raw `l` keypress to Enter (`\r`) before it ever reaches a view's own key handler (ranger-style `hjkl`, always active by default). Binding logout to `l` would mean the letter shown in the bar silently never fires. This was found while writing this plan and is reflected in the spec (see its Part A/C notes).
- `hubShortcuts(tt)` (`src/app/views/schedule-render.ts`) is the single source of truth for the shortcut bar's visible letters. `src/app/views/schedule.ts`'s key handling looks up the pressed key in this same array — never hardcode a shortcut letter in only one of the two places.
- `gridCursor` is computed fresh via `defaultGridCursor` on every path that lands in `'hub'` mode from *outside* the hub — `load()`'s cached-hub branch and `fetchAndShowHub` (covers both first login and every term switch, since a term switch can change the period table entirely, so the old cursor may not even be valid against the new one — this is also what satisfies the spec's Error Handling re-clamp requirement, with no extra code needed). `returnToHub()` — the path used when *stepping back* from `'week'`/`'termDensity'`/`'unresolved'`/`'meetingDetail'` to the hub — instead **carries over** the existing cursor via `state.gridCursor ?? defaultGridCursor(...)`, only falling back to a fresh default if somehow unset. This is a deliberate reading of the spec's "initialized when entering hub mode (or re-entering it via `returnToHub()`)": re-initializing on every `returnToHub()` call would silently discard the student's navigation every time they closed a detail card, which isn't what the spec's own UX intent (purposeful cell-by-cell navigation) implies. `state.gridCursor ?? defaultGridCursor(...)` is also used defensively at the top of `handleKey`'s `'hub'`/`'week'` cases, in case a cursor read is ever reached before one of the above assignment points has run.
- `tsconfig.json` has `noUnusedLocals`/`noUnusedParameters` enabled — removing `buildHubField` and the old hub `ListField` leaves some existing imports (`c`, `pickIcon` in `schedule.ts`; `computeMaxVisible` in `schedule-render.ts`) unused. Each task below that removes their last call site also removes the now-dead import. Run `npx tsc --noEmit` at the end of any task that removes code, not just the ones that add it.

---

## Task 1: `type.cursor` theme token

**Files:**
- Modify: `src/core/theme.ts`
- Test: `src/core/theme.test.ts`

**Interfaces:**
- Produces: `type.cursor: (s: string) => string` — a solid brand-colored background block with black text (`chalk.bgHex('#0ea5e9').black(s)`). Consumed by Task 4 (`renderWeekGrid`).

- [ ] **Step 1: Write the failing tests**

Append to the `describe('design tokens', ...)` block in `src/core/theme.test.ts`, after the existing `type.active` tests:

```ts
  it('type.cursor returns its text unchanged once ANSI codes are stripped', () => {
    expect(stripAnsi(type.cursor('go'))).toBe('go');
  });

  it('type.cursor renders as a solid brand-colored background block, distinct from type.active', () => {
    const level = chalk.level;
    chalk.level = 3;
    try {
      // Background truecolor escape (48;2;...), not type.active's foreground
      // truecolor (38;2;...) -- the whole point is these read as visually
      // different mechanisms (fill vs. text color), not just different hues.
      expect(type.cursor('go')).toContain('\x1b[48;2;14;165;233m');
      expect(type.cursor('go')).not.toBe(type.active('go'));
    } finally {
      chalk.level = level;
    }
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/theme.test.ts -t "type.cursor"`
Expected: FAIL — `type.cursor` is not defined.

- [ ] **Step 3: Add the token**

In `src/core/theme.ts`, change the end of the `type` object from:

```ts
  active:  (s: string) => chalk.bold(c.brand(s)),
};
```

to:

```ts
  active:  (s: string) => chalk.bold(c.brand(s)),
  /** The grid cursor's own visual signal: a solid brand-colored background
   * block, deliberately distinct from `active` (bold text on the default
   * background) so "this is today" and "this is where your cursor is" never
   * share one visual language, even when the cursor lands on today's own
   * column. */
  cursor:  (s: string) => chalk.bgHex('#0ea5e9').black(s),
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/theme.test.ts`
Expected: PASS (all tests in the file, including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/core/theme.ts src/core/theme.test.ts
git commit -m "feat: add type.cursor theme token for the grid cursor"
```

---

## Task 2: New i18n keys

**Files:**
- Modify: `src/i18n/index.ts:296` (end of the `timetable` interface block)
- Modify: `src/i18n/locales/en.json:277` (end of the `"timetable"` object)
- Modify: `src/i18n/locales/zh.json:277` (same)

**Interfaces:**
- Produces: `Translations['timetable']` gains `hubFullGrid`, `detailTime`, `detailLocation`, `detailTeacher`, `detailWeeks`, `teacherSeparator` — all `string`. Consumed by Task 5 (`renderMeetingDetail`) and Task 7 (`hubShortcuts`).

There's no automated en/zh key-parity test in this codebase — verification is a manual read-back plus `tsc`'s structural check (a key missing from either JSON file surfaces as `undefined` at runtime, not a compile error, since `Translations` doesn't cross-check the two JSON files against each other).

- [ ] **Step 1: Add the keys to the `Translations` interface**

In `src/i18n/index.ts`, the `timetable` block currently ends like this (lines 294–297):

```ts
    weekAheadFree: string;
    weekAheadNone: string;
    termPreviewWeek: string;
  };
```

Change it to:

```ts
    weekAheadFree: string;
    weekAheadNone: string;
    termPreviewWeek: string;
    hubFullGrid: string;
    detailTime: string;
    detailLocation: string;
    detailTeacher: string;
    detailWeeks: string;
    teacherSeparator: string;
  };
```

- [ ] **Step 2: Add the English values**

In `src/i18n/locales/en.json`, the `"timetable"` object currently ends like this (lines 275–278):

```json
    "weekAheadFree": "Free",
    "weekAheadNone": "N/A",
    "termPreviewWeek": "Week 1 preview"
  },
```

Change it to:

```json
    "weekAheadFree": "Free",
    "weekAheadNone": "N/A",
    "termPreviewWeek": "Week 1 preview",
    "hubFullGrid": "Full grid",
    "detailTime": "Time",
    "detailLocation": "Location",
    "detailTeacher": "Teacher",
    "detailWeeks": "Weeks",
    "teacherSeparator": ", "
  },
```

- [ ] **Step 3: Add the Chinese values**

In `src/i18n/locales/zh.json`, the `"timetable"` object currently ends the same way (lines 275–278), with `"termPreviewWeek": "第一周预览"` as the last entry before the closing `},`. Change it to:

```json
    "weekAheadFree": "较空",
    "weekAheadNone": "无",
    "termPreviewWeek": "第一周预览",
    "hubFullGrid": "完整课表",
    "detailTime": "时间",
    "detailLocation": "地点",
    "detailTeacher": "教师",
    "detailWeeks": "周次",
    "teacherSeparator": "、"
  },
```

- [ ] **Step 4: Verify with a type check**

Run: `npx tsc --noEmit`
Expected: no new errors. Re-read both JSON diffs by eye to confirm both files got all 6 keys.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/index.ts src/i18n/locales/en.json src/i18n/locales/zh.json
git commit -m "i18n: add shortcut-bar and meeting-detail translation keys"
```

---

## Task 3: `meetingAtCursor` query helper

**Files:**
- Modify: `src/features/schedule-query.ts`
- Test: `src/features/schedule-query.test.ts`

**Interfaces:**
- Consumes: `TimetableMeeting` (already imported), `meetingsInWeek` (already defined in this file).
- Produces: `export function meetingAtCursor(meetings: readonly TimetableMeeting[], week: number, cursor: { weekday: number; period: number }): TimetableMeeting | null`. Consumed by Task 6 (`schedule-grid-cursor.ts`'s `handleGridKey`).

- [ ] **Step 1: Write the failing tests**

Append to `src/features/schedule-query.test.ts`:

```ts
describe('meetingAtCursor', () => {
  const list = [m({ courseName: 'Math', weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1] })];

  it('finds a meeting whose span covers the cursor period, not just its starting period', () => {
    expect(meetingAtCursor(list, 1, { weekday: 1, period: 2 })?.courseName).toBe('Math');
  });
  it('returns null when the cursor is on an empty cell', () => {
    expect(meetingAtCursor(list, 1, { weekday: 1, period: 3 })).toBeNull();
  });
  it('returns null when the meeting is not in the given week', () => {
    expect(meetingAtCursor(list, 2, { weekday: 1, period: 1 })).toBeNull();
  });
  it('returns null when the weekday does not match', () => {
    expect(meetingAtCursor(list, 1, { weekday: 2, period: 1 })).toBeNull();
  });
});
```

Add `meetingAtCursor` to this test file's existing import from `./schedule-query.js`:

```ts
import { currentWeekNumber, campusWeekday, meetingsInWeek, meetingsOnDay, periodStartDate, nextMeeting, meetingAtCursor } from './schedule-query.js';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/schedule-query.test.ts -t "meetingAtCursor"`
Expected: FAIL — `meetingAtCursor` is not exported / not defined.

- [ ] **Step 3: Implement `meetingAtCursor`**

Append to the end of `src/features/schedule-query.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/schedule-query.test.ts`
Expected: PASS (all tests in the file, including the 4 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/features/schedule-query.ts src/features/schedule-query.test.ts
git commit -m "feat: add meetingAtCursor query helper"
```

---

## Task 4: `renderWeekGrid` cursor parameter

**Files:**
- Modify: `src/features/schedule-render.ts`
- Test: `src/features/schedule-render.test.ts`

**Interfaces:**
- Consumes: `type.cursor` (Task 1).
- Produces: `renderWeekGrid`'s signature gains a 6th optional parameter `cursor?: { weekday: number; period: number }`. Consumed by Task 7 (`app/views/schedule-render.ts`).

- [ ] **Step 1: Write the failing tests**

Add `import chalk from 'chalk';` to the top of `src/features/schedule-render.test.ts` (needed to force truecolor output for the exact-ANSI assertions below, matching `theme.test.ts`'s own pattern):

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import chalk from 'chalk';
import type { TimetableMeeting, TimetablePeriod, TimetableUnresolvedItem } from '@nbtca/nbtcal/timetable';
```

Append a new describe block inside the existing `describe('renderWeekGrid', ...)` block (anywhere after the `'consecutive periods...'` describe block, before its closing `});`):

```ts
  describe('cursor visual treatment', () => {
    it('applies a distinct cursor style to the cursor cell, different from the same render with no cursor', () => {
      const level = chalk.level;
      chalk.level = 3;
      try {
        const meeting = mk({ courseName: 'Math', location: null, weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1] });
        const withCursor = renderWeekGrid([meeting], periods, 1, new Date('2026-09-07T09:00:00'), 80, { weekday: 1, period: 1 });
        const withoutCursor = renderWeekGrid([meeting], periods, 1, new Date('2026-09-07T09:00:00'), 80);
        expect(withCursor).not.toBe(withoutCursor);
        expect(withCursor).toContain('\x1b[48;2;14;165;233m'); // type.cursor's solid background escape
      } finally {
        chalk.level = level;
      }
      done();
    });

    it('does not style a non-cursor cell with the cursor token', () => {
      const level = chalk.level;
      chalk.level = 3;
      try {
        // cursor sits at Mon/period1, an empty cell -- Math is on Tue/period1.
        const meeting = mk({ courseName: 'Math', location: null, weekday: 2, startPeriod: 1, endPeriod: 1, weeks: [1] });
        const out = renderWeekGrid([meeting], periods, 1, new Date('2026-09-07T09:00:00'), 80, { weekday: 1, period: 1 });
        const mathIndex = out.indexOf('Math');
        const nearMath = out.slice(Math.max(0, mathIndex - 15), mathIndex);
        expect(nearMath).not.toContain('\x1b[48;2;14;165;233m');
      } finally {
        chalk.level = level;
      }
      done();
    });

    it('does not crash when the cursor points at an empty cell', () => {
      expect(() => renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00'), 80, { weekday: 1, period: 1 })).not.toThrow();
      done();
    });

    it('shows the cursor token even when the cursor lands on today\'s own column', () => {
      const level = chalk.level;
      chalk.level = 3;
      try {
        // now = 2026-09-07 is a Monday (weekday 1) -- cursor also at weekday
        // 1, the exact "cursor on today's column" collision case.
        const out = renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00'), 80, { weekday: 1, period: 1 });
        expect(out).toContain('\x1b[48;2;14;165;233m');
      } finally {
        chalk.level = level;
      }
      done();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/schedule-render.test.ts -t "cursor visual treatment"`
Expected: FAIL — `renderWeekGrid` doesn't accept a 6th argument yet, so no cell gets cursor styling; the "distinct" and "background escape" assertions fail.

- [ ] **Step 3: Implement the cursor parameter**

In `src/features/schedule-render.ts`, change `renderWeekGrid`'s signature from:

```ts
export function renderWeekGrid(
  meetings: readonly TimetableMeeting[], periods: readonly TimetablePeriod[], weekNumber: number, now: Date, cols = 80,
): string {
```

to:

```ts
export function renderWeekGrid(
  meetings: readonly TimetableMeeting[], periods: readonly TimetablePeriod[], weekNumber: number, now: Date, cols = 80,
  cursor?: { weekday: number; period: number },
): string {
```

Then change the cell-rendering closure inside the `sorted.forEach((p, i) => { ... })` loop from:

```ts
    const cells = [1, 2, 3, 4, 5, 6, 7].map((wd) => {
      const isToday = wd === todayWd;
      const starting = startingAt(wd, p.period);
      let text: string;
      if (starting) {
        const content = gridCellContent(starting, cellW);
        text = isToday ? type.active(content) : type.body(content);
      } else if (continuingAt(wd, p.period)) {
        text = type.hint(connector);
      } else {
        text = type.hint(pickIcon('·', '.'));
      }
      return padEndV(text, cellW);
    }).join('');
```

to:

```ts
    const cells = [1, 2, 3, 4, 5, 6, 7].map((wd) => {
      const isToday = wd === todayWd;
      const isCursor = cursor !== undefined && cursor.weekday === wd && cursor.period === p.period;
      const starting = startingAt(wd, p.period);
      let text: string;
      if (starting) {
        const content = gridCellContent(starting, cellW);
        text = isCursor ? type.cursor(content) : (isToday ? type.active(content) : type.body(content));
      } else if (continuingAt(wd, p.period)) {
        text = isCursor ? type.cursor(connector) : type.hint(connector);
      } else {
        const emptyGlyph = pickIcon('·', '.');
        text = isCursor ? type.cursor(emptyGlyph) : type.hint(emptyGlyph);
      }
      return padEndV(text, cellW);
    }).join('');
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/schedule-render.test.ts`
Expected: PASS (all tests in the file, including the 4 new ones — this also re-runs every pre-existing `renderWeekGrid` test to confirm the optional 6th parameter didn't change any of them)

- [ ] **Step 5: Commit**

```bash
git add src/features/schedule-render.ts src/features/schedule-render.test.ts
git commit -m "feat: add cursor parameter and visual treatment to renderWeekGrid"
```

---

## Task 5: `renderMeetingDetail` pure renderer

**Files:**
- Modify: `src/features/schedule-render.ts` (append after `renderWeekGrid`)
- Test: `src/features/schedule-render.test.ts`

**Interfaces:**
- Consumes: `weekdayShortLabel`, `span` (both already defined earlier in this file), `visualWidth`, `padEndV` (already imported), the i18n keys from Task 2.
- Produces: `export function renderMeetingDetail(meeting: TimetableMeeting, periods: readonly TimetablePeriod[]): string`. Consumed by Task 7 (`app/views/schedule-render.ts`'s new `'meetingDetail'` mode).

- [ ] **Step 1: Write the failing tests**

Append a new describe block to `src/features/schedule-render.test.ts` (after the `describe('renderWeekGrid gap marker', ...)` block, before `describe('renderTodayTimeline', ...)`, or anywhere at the top level):

```ts
describe('renderMeetingDetail', () => {
  it('shows the full, untruncated course name as the title', () => {
    const long = '习近平新时代中国特色社会主义思想概论';
    const out = stripAnsi(renderMeetingDetail(mk({ courseName: long, weekday: 1, startPeriod: 1, endPeriod: 2 }), periods));
    expect(out).toContain(long);
  });

  it('shows weekday + real clock time range', () => {
    const out = stripAnsi(renderMeetingDetail(mk({ weekday: 3, startPeriod: 1, endPeriod: 2 }), periods));
    expect(out).toContain('Wed');
    expect(out).toContain('08:00-09:40');
  });

  it('shows the location when present', () => {
    const out = stripAnsi(renderMeetingDetail(mk({ location: 'sl707' }), periods));
    expect(out).toContain('sl707');
  });

  it('omits the location row entirely when there is none, rather than showing an empty value', () => {
    const out = stripAnsi(renderMeetingDetail(mk({ location: null }), periods));
    expect(out).not.toContain('Location');
  });

  it('joins multiple teachers with the locale separator', () => {
    const out = stripAnsi(renderMeetingDetail(mk({ teacherNames: ['Dr Li', 'Dr Wu'] }), periods));
    expect(out).toContain('Dr Li, Dr Wu');
  });

  it('omits the teacher row entirely when there are none', () => {
    const out = stripAnsi(renderMeetingDetail(mk({ teacherNames: [] }), periods));
    expect(out).not.toContain('Teacher');
  });

  it('formats a contiguous week span as a range', () => {
    const out = stripAnsi(renderMeetingDetail(mk({ weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] }), periods));
    expect(out).toContain('1-16');
  });

  it('falls back to a comma list for a non-contiguous week span', () => {
    const out = stripAnsi(renderMeetingDetail(mk({ weeks: [1, 3, 5] }), periods));
    expect(out).toContain('1, 3, 5');
  });

  it('never collapses into one array entry when split on newlines', () => {
    const out = renderMeetingDetail(mk({}), periods);
    expect(out.split('\n').length).toBeGreaterThan(1);
    for (const line of out.split('\n')) expect(line).not.toContain('\n');
  });
});
```

Add `renderMeetingDetail` to this test file's existing import from `./schedule-render.js`:

```ts
import {
  renderNextClassBanner, renderTodayClasses, renderWeekGrid, renderUnresolvedItems,
  renderTodayTimeline, renderWeekStrip, renderTermDensity, renderMeetingDetail,
} from './schedule-render.js';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/schedule-render.test.ts -t "renderMeetingDetail"`
Expected: FAIL — `renderMeetingDetail` is not exported / not defined.

- [ ] **Step 3: Implement `renderMeetingDetail`**

Append to the end of `src/features/schedule-render.ts`, right after `renderWeekGrid`'s closing brace (before `renderUnresolvedItems`):

```ts
function formatWeekRange(weeks: readonly number[]): string {
  if (weeks.length === 0) return '';
  const sorted = [...weeks].sort((a, b) => a - b);
  const isContiguous = sorted.every((w, i) => i === 0 || w === sorted[i - 1]! + 1);
  if (isContiguous) {
    return sorted.length > 1 ? `${sorted[0]}-${sorted[sorted.length - 1]}` : `${sorted[0]}`;
  }
  // A genuinely non-contiguous week pattern is rare but must not crash or
  // silently drop data -- fall back to listing every week.
  return sorted.join(', ');
}

/** The full, untruncated detail behind one grid cell -- reached by drilling
 * into a meeting from the interactive grid (Enter on a cursor cell). Unlike
 * the grid's own cells, nothing here is truncated: this is the "show it all
 * on demand" counterpart to the grid's "cram what fits, drill down for the
 * rest" cell format. */
export function renderMeetingDetail(meeting: TimetableMeeting, periods: readonly TimetablePeriod[]): string {
  const trans = t();
  const rows: Array<[string, string]> = [
    [trans.timetable.detailTime, `${weekdayShortLabel(meeting.weekday)} ${span(meeting, periods)}`],
  ];
  if (meeting.location) rows.push([trans.timetable.detailLocation, meeting.location]);
  if (meeting.teacherNames.length > 0) {
    rows.push([trans.timetable.detailTeacher, meeting.teacherNames.join(trans.timetable.teacherSeparator)]);
  }
  rows.push([trans.timetable.detailWeeks, formatWeekRange(meeting.weeks)]);

  const labelWidth = rows.reduce((w, [label]) => Math.max(w, visualWidth(label)), 0);
  const lines = [
    `${space.indent}${type.heading(meeting.courseName)}`,
    '',
    ...rows.map(([label, value]) => `${space.indent}${type.label(padEndV(label, labelWidth))}   ${type.body(value)}`),
  ];
  return lines.join('\n');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/schedule-render.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add src/features/schedule-render.ts src/features/schedule-render.test.ts
git commit -m "feat: add renderMeetingDetail, an untruncated meeting detail card"
```

---

## Task 6: `schedule-grid-cursor.ts` — cursor math + key mapping

**Files:**
- Create: `src/app/views/schedule-grid-cursor.ts`
- Test: `src/app/views/schedule-grid-cursor.test.ts` (new file)

**Interfaces:**
- Consumes: `meetingAtCursor` (Task 3).
- Produces: `GridCursor` type, `defaultGridCursor`, `moveCursorWeekday`, `moveCursorPeriod`, `handleGridKey`, and the `KEY_ARROW_*`/`KEY_ENTER_*` constants — all exported. Consumed by Task 7 (`ScheduleViewState.gridCursor`'s type) and Task 8 (`schedule.ts`'s key handling).

- [ ] **Step 1: Write the failing tests**

Create `src/app/views/schedule-grid-cursor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { TimetableMeeting, TimetablePeriod } from '@nbtca/nbtcal/timetable';
import {
  defaultGridCursor, moveCursorWeekday, moveCursorPeriod, handleGridKey,
  KEY_ARROW_RIGHT, KEY_ENTER_CR,
} from './schedule-grid-cursor.js';

const periods: TimetablePeriod[] = [
  { period: 1, label: null, start: '08:00', end: '08:45' },
  { period: 2, label: null, start: '08:55', end: '09:40' },
  { period: 3, label: null, start: '10:00', end: '10:45' },
];
function mk(o: Partial<TimetableMeeting>): TimetableMeeting {
  return { sourceId: null, courseName: 'Math', teacherNames: [], location: null, weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1], kind: 'regular', ...o };
}

describe('defaultGridCursor', () => {
  it('defaults to today\'s weekday and the first defined period', () => {
    expect(defaultGridCursor(3, periods)).toEqual({ weekday: 3, period: 1 });
  });
  it('falls back to Monday on a weekend', () => {
    expect(defaultGridCursor(6, periods)).toEqual({ weekday: 1, period: 1 });
    expect(defaultGridCursor(7, periods)).toEqual({ weekday: 1, period: 1 });
  });
  it('uses the lowest period number when the period table starts above 1', () => {
    const laterPeriods = [{ period: 3, label: null, start: '10:00', end: '10:45' }];
    expect(defaultGridCursor(1, laterPeriods)).toEqual({ weekday: 1, period: 3 });
  });
});

describe('moveCursorWeekday', () => {
  it('moves left/right within [1,7]', () => {
    expect(moveCursorWeekday({ weekday: 3, period: 1 }, -1)).toEqual({ weekday: 2, period: 1 });
    expect(moveCursorWeekday({ weekday: 3, period: 1 }, 1)).toEqual({ weekday: 4, period: 1 });
  });
  it('does not wrap past Monday or Sunday', () => {
    expect(moveCursorWeekday({ weekday: 1, period: 1 }, -1)).toEqual({ weekday: 1, period: 1 });
    expect(moveCursorWeekday({ weekday: 7, period: 1 }, 1)).toEqual({ weekday: 7, period: 1 });
  });
});

describe('moveCursorPeriod', () => {
  it('moves to the previous/next defined period', () => {
    expect(moveCursorPeriod({ weekday: 1, period: 2 }, periods, -1)).toEqual({ weekday: 1, period: 1 });
    expect(moveCursorPeriod({ weekday: 1, period: 2 }, periods, 1)).toEqual({ weekday: 1, period: 3 });
  });
  it('does not wrap past the first or last period', () => {
    expect(moveCursorPeriod({ weekday: 1, period: 1 }, periods, -1)).toEqual({ weekday: 1, period: 1 });
    expect(moveCursorPeriod({ weekday: 1, period: 3 }, periods, 1)).toEqual({ weekday: 1, period: 3 });
  });
  it('is a no-op when the period table is empty', () => {
    expect(moveCursorPeriod({ weekday: 1, period: 1 }, [], 1)).toEqual({ weekday: 1, period: 1 });
  });
});

describe('handleGridKey', () => {
  const tt = { meetings: [mk({ weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1] })], periods };

  it('moves the cursor on an arrow key', () => {
    const result = handleGridKey(KEY_ARROW_RIGHT, { weekday: 1, period: 1 }, tt, 1);
    expect(result).toEqual({ kind: 'moveCursor', cursor: { weekday: 2, period: 1 } });
  });

  it('opens detail on Enter when the cursor cell has a meeting, whether starting or continuing', () => {
    const starting = handleGridKey(KEY_ENTER_CR, { weekday: 1, period: 1 }, tt, 1);
    expect(starting.kind).toBe('openDetail');
    const continuing = handleGridKey(KEY_ENTER_CR, { weekday: 1, period: 2 }, tt, 1);
    expect(continuing.kind).toBe('openDetail');
  });

  it('is a no-op on Enter when the cursor cell is empty', () => {
    expect(handleGridKey(KEY_ENTER_CR, { weekday: 2, period: 1 }, tt, 1)).toEqual({ kind: 'none' });
  });

  it('is a no-op for any other key', () => {
    expect(handleGridKey('x', { weekday: 1, period: 1 }, tt, 1)).toEqual({ kind: 'none' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/views/schedule-grid-cursor.test.ts`
Expected: FAIL — the module `./schedule-grid-cursor.js` doesn't exist yet.

- [ ] **Step 3: Implement the module**

Create `src/app/views/schedule-grid-cursor.ts`:

```ts
import type { Timetable, TimetableMeeting, TimetablePeriod } from '@nbtca/nbtcal/timetable';
import { meetingAtCursor } from '../../features/schedule-query.js';

export interface GridCursor { weekday: number; period: number; }

export const KEY_ARROW_LEFT = '\x1b[D';
export const KEY_ARROW_RIGHT = '\x1b[C';
export const KEY_ARROW_UP = '\x1b[A';
export const KEY_ARROW_DOWN = '\x1b[B';
export const KEY_ENTER_CR = '\r';
export const KEY_ENTER_LF = '\n';

/** The cursor's starting position on entering hub/week mode: today's own
 * weekday (falling back to Monday on a weekend, since the grid's Sat/Sun
 * columns are always empty for a personal timetable) and the first period
 * this term's own period table actually defines. */
export function defaultGridCursor(todayWeekday: number, periods: readonly TimetablePeriod[]): GridCursor {
  const sorted = [...periods].sort((a, b) => a.period - b.period);
  const firstPeriod = sorted[0]?.period ?? 1;
  const weekday = todayWeekday >= 1 && todayWeekday <= 5 ? todayWeekday : 1;
  return { weekday, period: firstPeriod };
}

/** Moves the cursor one weekday left/right, clamped to [1, 7] with no
 * wraparound -- a 7-day week has a real fixed edge, unlike a scrollable
 * list where wrapping back to the top makes sense. */
export function moveCursorWeekday(cursor: GridCursor, delta: -1 | 1): GridCursor {
  return { ...cursor, weekday: Math.max(1, Math.min(7, cursor.weekday + delta)) };
}

/** Moves the cursor to the previous/next *defined* period in the sorted
 * period table (not period±1 -- real period numbers aren't always
 * contiguous), clamped at the first/last period with no wraparound. */
export function moveCursorPeriod(cursor: GridCursor, periods: readonly TimetablePeriod[], delta: -1 | 1): GridCursor {
  const sorted = [...periods].sort((a, b) => a.period - b.period);
  if (sorted.length === 0) return cursor;
  const idx = sorted.findIndex((p) => p.period === cursor.period);
  const nextIdx = Math.max(0, Math.min(sorted.length - 1, (idx === -1 ? 0 : idx) + delta));
  return { ...cursor, period: sorted[nextIdx]!.period };
}

export type GridKeyResult =
  | { kind: 'moveCursor'; cursor: GridCursor }
  | { kind: 'openDetail'; meeting: TimetableMeeting }
  | { kind: 'none' };

/** Pure key-to-action mapping shared by hub mode's inline grid and the
 * standalone full-screen 'week' mode -- both are cursor-navigable over the
 * exact same rules, so this is the one place that logic lives. */
export function handleGridKey(
  key: string, cursor: GridCursor, tt: Pick<Timetable, 'meetings' | 'periods'>, week: number,
): GridKeyResult {
  if (key === KEY_ARROW_LEFT) return { kind: 'moveCursor', cursor: moveCursorWeekday(cursor, -1) };
  if (key === KEY_ARROW_RIGHT) return { kind: 'moveCursor', cursor: moveCursorWeekday(cursor, 1) };
  if (key === KEY_ARROW_UP) return { kind: 'moveCursor', cursor: moveCursorPeriod(cursor, tt.periods, -1) };
  if (key === KEY_ARROW_DOWN) return { kind: 'moveCursor', cursor: moveCursorPeriod(cursor, tt.periods, 1) };
  if (key === KEY_ENTER_CR || key === KEY_ENTER_LF) {
    const meeting = meetingAtCursor(tt.meetings, week, cursor);
    return meeting ? { kind: 'openDetail', meeting } : { kind: 'none' };
  }
  return { kind: 'none' };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/views/schedule-grid-cursor.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/views/schedule-grid-cursor.ts src/app/views/schedule-grid-cursor.test.ts
git commit -m "feat: add schedule-grid-cursor, pure cursor math + key mapping"
```

---

## Task 7: Wire the shortcut bar + cursor + meetingDetail mode into `app/views/schedule-render.ts`

**Files:**
- Modify: `src/app/views/schedule-render.ts`
- Test: `src/app/views/schedule-render.test.ts`

**Interfaces:**
- Consumes: `renderMeetingDetail` (Task 5), `GridCursor` (Task 6).
- Produces: `ScheduleMode` gains `'meetingDetail'`; `ScheduleViewState` gains `gridCursor`/`detailMeeting`/`detailFrom`, loses `hubField`; new exports `HubShortcut`, `hubShortcuts(tt)`. Consumed by Task 8 (`schedule.ts`).

- [ ] **Step 1: Write the failing tests**

In `src/app/views/schedule-render.test.ts`, every construction of `hubField` (`const hubField = new ListField(...)`) and every `hubField` property passed into a `renderSchedule(...)` state object must be removed — `ScheduleViewState` will no longer have that field once Step 3 lands, and the hub no longer needs one to render. Replace the whole file with:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { renderSchedule, hubShortcuts, type ScheduleViewState } from './schedule-render.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi } from '../../core/text.js';
import type { Timetable } from '@nbtca/nbtcal/timetable';
import type { Event } from '../../features/calendar.js';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

const timetable: Timetable = {
  term: { academicYear: '2026', semester: '3' },
  meetings: [{
    sourceId: null, courseName: 'Math', teacherNames: ['Dr Li'], location: 'Room 201',
    weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1], kind: 'regular',
  }],
  unresolvedItems: [{ kind: 'practice', itemIndex: 0, sourceFields: { kcmc: 'Fitness test' } }],
  periods: [{ period: 1, label: null, start: '08:00', end: '08:45' }],
  calendarDays: [],
  warnings: [],
  fetchedAt: new Date('2026-09-07T00:00:00Z'),
};

// A realistic full-day period table (matches the real campus period system,
// which defines up to 12 periods/day) — the single-period `timetable`
// fixture above is too small to ever exercise the "doesn't fit, fall back
// to the strip" branch of the adaptive hub.
const busyTimetable: Timetable = {
  ...timetable,
  meetings: [
    { sourceId: null, courseName: 'Math', teacherNames: ['Dr Li'], location: 'Room 201', weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1], kind: 'regular' },
    { sourceId: null, courseName: 'Physics', teacherNames: ['Dr Wu'], location: 'Room 105', weekday: 1, startPeriod: 3, endPeriod: 3, weeks: [1], kind: 'regular' },
  ],
  periods: Array.from({ length: 12 }, (_, i) => ({
    period: i + 1, label: null,
    start: `${String(8 + i).padStart(2, '0')}:00`, end: `${String(8 + i).padStart(2, '0')}:45`,
  })),
};

describe('renderSchedule', () => {
  it('loading mode shows a loading hint', () => {
    const out = stripAnsi(renderSchedule({ mode: 'loading' }, new Date()).join('\n'));
    expect(out.length).toBeGreaterThan(0);
  });

  it('needsLoginId mode renders the id field', () => {
    const idField = new TextField({ message: 'Student id' });
    const out = stripAnsi(renderSchedule({ mode: 'needsLoginId', idField }, new Date()).join('\n'));
    expect(out).toContain('Student id');
  });

  it('hub mode shows the next-class banner, today, and the unresolved badge', () => {
    const out = stripAnsi(renderSchedule({
      mode: 'hub', key: '2026-3', weekOne: '2026-09-07', timetable,
    }, new Date('2026-09-07T07:00:00')).join('\n'));
    expect(out).toContain('Math');
    expect(out).toContain('⚠ 1');
  });

  it('hub mode shows the shortcut bar instead of a vertical menu', () => {
    const out = stripAnsi(renderSchedule({
      mode: 'hub', key: '2026-3', weekOne: '2026-09-07', timetable,
    }, new Date('2026-09-07T07:00:00')).join('\n'));
    expect(out).toContain('[w] Full grid');
    expect(out).toContain('[t] Term density');
    expect(out).toContain('[s] Switch term');
    expect(out).toContain('[e] Export .ics');
    expect(out).toContain('[x] Log out');
  });

  it('hub mode shows a "term not started" state instead of a negative week when weekOne is in the future', () => {
    // Regression: weekOne can be auto-inferred *ahead* of `now` while on
    // break (it deliberately points at the upcoming term so it's ready
    // once classes start — see academic-calendar.ts). Rendering the
    // today/timeline/week-strip section anyway against a future weekOne
    // produced a nonsensical negative week number and an empty class grid
    // that read as "there are classes right now."
    const out = stripAnsi(renderSchedule({
      mode: 'hub', key: '2026-3', weekOne: '2099-01-05', timetable,
    }, new Date('2026-09-07T07:00:00')).join('\n'));
    expect(out).toContain("Term hasn't started yet");
    expect(out).toContain('2099-01-05');
    expect(out).not.toMatch(/Week -\d/);
  });

  describe('term-not-started week-1 preview', () => {
    it('shows a week-1 preview grid on a tall terminal even though the term has not started', () => {
      const out = stripAnsi(renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2099-01-05', timetable: busyTimetable,
      }, new Date('2026-09-07T07:00:00'), 45).join('\n'));
      expect(out).toContain("Term hasn't started yet");
      expect(out).toContain('Week 1 preview');
      expect(out).toContain('Room 105');
      expect(out).toContain('19:00'); // busyTimetable's 12-period table starts period 12 at 19:00
    });

    it('falls back to the week strip on a short terminal even though the term has not started', () => {
      const out = stripAnsi(renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2099-01-05', timetable: busyTimetable,
      }, new Date('2026-09-07T07:00:00'), 19).join('\n'));
      expect(out).toContain('Week 1 preview');
      expect(out).not.toContain('19:00');
      expect(out).toContain('has class'); // the strip's own legend text
    });

    it('shows an empty week-1 preview without crashing when there are no meetings at all', () => {
      const emptyTimetable: Timetable = { ...timetable, meetings: [] };
      expect(() => renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2099-01-05', timetable: emptyTimetable,
      }, new Date('2026-09-07T07:00:00'), 45)).not.toThrow();
      const out = stripAnsi(renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2099-01-05', timetable: emptyTimetable,
      }, new Date('2026-09-07T07:00:00'), 45).join('\n'));
      expect(out).toContain('Week 1 preview');
      expect(out).not.toContain('Math');
    });

    it('never collapses the week-1 preview into one array entry', () => {
      const lines = renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2099-01-05', timetable: busyTimetable,
      }, new Date('2026-09-07T07:00:00'), 45);
      for (const line of lines) {
        expect(line).not.toContain('\n');
      }
    });
  });

  it('hub mode never collapses a multi-line renderer output into one array entry', () => {
    const lines = renderSchedule({
      mode: 'hub', key: '2026-3', weekOne: '2026-09-07', timetable,
    }, new Date('2026-09-07T07:00:00'));
    for (const line of lines) {
      expect(line).not.toContain('\n');
    }
  });

  describe('adaptive week section', () => {
    it('shows the full week grid inline on a tall terminal, with the shortcut bar still reachable', () => {
      const out = stripAnsi(renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2026-09-07', timetable: busyTimetable,
      }, new Date('2026-09-07T07:00:00'), 45).join('\n'));
      expect(out).toContain('Physics'); // only the full grid places period-3 courses distinctly
      expect(out).toContain('19:00'); // busyTimetable's 12-period table starts period 12 at 19:00
      expect(out).toContain('Log out'); // shortcut bar still rendered underneath
    });

    it('stays with the compact week strip on a normal-size terminal', () => {
      const out = stripAnsi(renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2026-09-07', timetable: busyTimetable,
      }, new Date('2026-09-07T07:00:00'), 19).join('\n'));
      expect(out).not.toContain('19:00');
      expect(out).toContain('has class'); // the strip's own legend text
    });

    it('never collapses the inline grid into one array entry', () => {
      const lines = renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2026-09-07', timetable: busyTimetable,
      }, new Date('2026-09-07T07:00:00'), 45);
      for (const line of lines) {
        expect(line).not.toContain('\n');
      }
    });

    it('threads the real terminal column width down to the grid, so a wide terminal stops truncating real course names', () => {
      const longNameTimetable: Timetable = {
        ...timetable,
        meetings: [{ sourceId: null, courseName: '工业机器人系统', teacherNames: ['Dr Wu'], location: 'Room 105', weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1], kind: 'regular' }],
      };
      const narrowLines = renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2026-09-07', timetable: longNameTimetable,
      }, new Date('2026-09-07T07:00:00'), 45, 80).map((l) => stripAnsi(l));
      const wideLines = renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2026-09-07', timetable: longNameTimetable,
      }, new Date('2026-09-07T07:00:00'), 45, 210).map((l) => stripAnsi(l));
      const narrowHeadingIdx = narrowLines.findIndex((l) => l.includes('This week'));
      const wideHeadingIdx = wideLines.findIndex((l) => l.includes('This week'));
      const narrowGridRow = narrowLines.slice(narrowHeadingIdx).find((l) => l.trim().startsWith('08:00'))!;
      const wideGridRow = wideLines.slice(wideHeadingIdx).find((l) => l.trim().startsWith('08:00'))!;
      expect(narrowGridRow).not.toContain('工业机器人系统');
      expect(wideGridRow).toContain('工业机器人系统');
    });
  });

  it('week mode renders the grid', () => {
    const out = stripAnsi(renderSchedule({
      mode: 'week', key: '2026-3', weekOne: '2026-09-07', timetable,
    }, new Date('2026-09-07T09:00:00')).join('\n'));
    expect(out).toContain('Math');
  });

  it('week mode threads the cursor into renderWeekGrid', () => {
    const withCursor = renderSchedule({
      mode: 'week', key: '2026-3', weekOne: '2026-09-07', timetable, gridCursor: { weekday: 1, period: 1 },
    }, new Date('2026-09-07T09:00:00')).join('\n');
    const without = renderSchedule({
      mode: 'week', key: '2026-3', weekOne: '2026-09-07', timetable,
    }, new Date('2026-09-07T09:00:00')).join('\n');
    expect(withCursor).not.toBe(without);
  });

  it('meetingDetail mode renders the full meeting detail card', () => {
    const out = stripAnsi(renderSchedule({
      mode: 'meetingDetail', key: '2026-3', weekOne: '2026-09-07', timetable, detailMeeting: timetable.meetings[0],
    }, new Date('2026-09-07T09:00:00')).join('\n'));
    expect(out).toContain('Math');
    expect(out).toContain('Room 201');
  });

  it('meetingDetail mode shows an error message when there is no detail meeting to show', () => {
    const out = stripAnsi(renderSchedule({ mode: 'meetingDetail' }, new Date()).join('\n'));
    expect(out.trim().length).toBeGreaterThan(0);
  });

  it('unresolved mode lists the unresolved item', () => {
    const out = stripAnsi(renderSchedule({
      mode: 'unresolved', key: '2026-3', weekOne: '2026-09-07', timetable,
    }, new Date()).join('\n'));
    expect(out).toContain('Fitness test');
  });

  it('termDensity mode renders the term density strip with its own title', () => {
    const out = stripAnsi(renderSchedule({
      mode: 'termDensity', key: '2026-3', weekOne: '2026-09-07', timetable,
    }, new Date('2026-09-07T09:00:00')).join('\n'));
    expect(out).toContain('Term density');
  });

  it('error mode shows the error message', () => {
    const out = stripAnsi(renderSchedule({ mode: 'error', errorMessage: 'Something broke' }, new Date()).join('\n'));
    expect(out).toContain('Something broke');
  });
});

describe('hubShortcuts', () => {
  const baseTimetable: Omit<Timetable, 'unresolvedItems'> = {
    term: { academicYear: '2026', semester: '3' },
    meetings: [], periods: [], calendarDays: [], warnings: [],
    fetchedAt: new Date('2026-09-07T00:00:00Z'),
  };

  it('does not include an unresolved-items shortcut when there are none', () => {
    const shortcuts = hubShortcuts({ ...baseTimetable, unresolvedItems: [] });
    expect(shortcuts.find((s) => s.key === 'u')).toBeUndefined();
  });

  it('includes an unresolved-items shortcut with a count when there are unresolved items', () => {
    const shortcuts = hubShortcuts({
      ...baseTimetable,
      unresolvedItems: [{ kind: 'practice', itemIndex: 0, sourceFields: { kcmc: 'Fitness test' } }],
    });
    const unresolved = shortcuts.find((s) => s.key === 'u');
    expect(unresolved).toBeDefined();
    expect(unresolved?.label).toContain('1');
    expect(unresolved?.showKey).toBe(false);
  });

  it('always includes the full-grid, term-density, switch-term, export, and logout shortcuts', () => {
    const shortcuts = hubShortcuts({ ...baseTimetable, unresolvedItems: [] });
    expect(shortcuts.map((s) => s.key)).toEqual(['w', 't', 's', 'e', 'x']);
  });
});

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

  it('groups the term heading, progress bar, and countdown as one block with no blank lines inside it', () => {
    const state: ScheduleViewState = {
      mode: 'public',
      publicWindow: {
        status: 'inTerm', academicYear: '2026-2027', semester: '1',
        weekOneMonday: '2026-09-14', currentWeek: 3,
        nextBreakStart: '2027-01-13', nextBreakTitle: '寒假',
      },
    };
    const lines = renderSchedule(state, new Date('2026-10-01')).map((l) => stripAnsi(l));
    const headingIndex = lines.findIndex((l) => l.includes('2026-2027'));
    const barIndex = lines.findIndex((l) => /\d+\/\d+/.test(l));
    expect(lines[headingIndex + 1]?.trim()).not.toBe('');
    expect(barIndex).toBeGreaterThan(headingIndex);
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

  describe('adaptive public-upcoming count', () => {
    const manyUpcoming: Event[] = Array.from({ length: 12 }, (_, i) => ({
      date: `07-${17 + i}`, time: '', title: `Event${i}`, location: 'TBD', description: '',
      startDate: new Date('2026-07-17'), recurring: false, uid: `e-${i}`,
    }));

    it('shows only as many public-upcoming events as fit, reserving room for the login field, on a normal terminal', () => {
      const publicField = new ListField({ title: 'x', options: [{ value: 'login', label: 'Log in' }] });
      const out = stripAnsi(renderSchedule({
        mode: 'public', publicWindow: null, publicUpcoming: manyUpcoming, publicField,
      }, new Date(), 15).join('\n'));
      const visibleCount = manyUpcoming.filter((e) => out.includes(e.title)).length;
      expect(visibleCount).toBeLessThan(manyUpcoming.length);
      expect(visibleCount).toBeGreaterThan(0);
      expect(out).toContain('Log in');
    });

    it('shows more public-upcoming events on a tall terminal', () => {
      const publicField = new ListField({ title: 'x', options: [{ value: 'login', label: 'Log in' }] });
      const out = stripAnsi(renderSchedule({
        mode: 'public', publicWindow: null, publicUpcoming: manyUpcoming, publicField,
      }, new Date(), 45).join('\n'));
      for (const e of manyUpcoming) expect(out).toContain(e.title);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/views/schedule-render.test.ts`
Expected: FAIL — `hubShortcuts` isn't exported yet, `ScheduleViewState` doesn't accept `gridCursor`/`detailMeeting`/`detailFrom` (harmless at the transpile level, but the new assertions about the shortcut bar / cursor / meetingDetail fail at runtime), and the `'⚠ 1'`/`'[w] Full grid'` text isn't produced yet by the still-`ListField`-based hub.

- [ ] **Step 3: Implement the production changes**

Replace `src/app/views/schedule-render.ts` in full with:

```ts
import type { AcademicTerm, Timetable, TimetableMeeting } from '@nbtca/nbtcal/timetable';
import { c, type, space, glyph } from '../../core/theme.js';
import { pickIcon } from '../../core/icons.js';
import { t, fmt } from '../../i18n/index.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { currentWeekNumber, campusWeekday, meetingsOnDay, nextMeeting } from '../../features/schedule-query.js';
import {
  renderNextClassBanner, renderWeekGrid, renderUnresolvedItems, renderTodayTimeline, renderWeekStrip,
  weekdayShortLabel, renderTermDensity, renderMeetingDetail,
} from '../../features/schedule-render.js';
import type { AcademicWindow, OnBreak } from '../../features/academic-calendar.js';
import { renderEventBrief, type Event } from '../../features/calendar.js';
import type { GridCursor } from './schedule-grid-cursor.js';

export type ScheduleMode =
  | 'loading'
  | 'public'
  | 'needsLoginId'
  | 'needsLoginPassword'
  | 'authenticating'
  | 'needsWeekOne'
  | 'hub'
  | 'week'
  | 'termDensity'
  | 'termPicker'
  | 'unresolved'
  | 'meetingDetail'
  | 'error';

export interface ScheduleViewState {
  mode: ScheduleMode;
  errorMessage?: string;
  statusMessage?: string;
  idField?: TextField;
  passwordField?: TextField;
  weekOneField?: TextField;
  termField?: ListField;
  key?: string;
  term?: AcademicTerm;
  weekOne?: string;
  timetable?: Timetable;
  publicField?: ListField;
  publicWindow?: AcademicWindow | OnBreak | null;
  publicUpcoming?: Event[];
  gridCursor?: GridCursor;
  detailMeeting?: TimetableMeeting;
  detailFrom?: 'hub' | 'week';
}

function heading(label: string): string {
  return `${space.indent}${type.heading(label)}`;
}

function hint(label: string): string {
  return `${space.indent}${type.hint(label)}`;
}

export interface HubShortcut {
  key: string;
  label: string;
  /** False only for the unresolved-count badge -- its own "⚠ N" is the
   * visible cue, so it renders as "[label]" instead of "[key] label" even
   * though `key` is still the character that triggers it. */
  showKey?: boolean;
  warn?: boolean;
}

/** The hub's single-line shortcut bar, as data -- both renderShortcutBar
 * (below) and schedule.ts's key-handling switch consume this same array, so
 * the letters shown to the student and the letters that actually do
 * something can never drift apart. */
export function hubShortcuts(tt: Timetable): HubShortcut[] {
  const trans = t();
  const shortcuts: HubShortcut[] = [
    { key: 'w', label: trans.timetable.hubFullGrid },
    { key: 't', label: trans.timetable.hubTermDensity },
    { key: 's', label: trans.timetable.hubSwitchTerm },
    { key: 'e', label: trans.timetable.hubExport },
  ];
  if (tt.unresolvedItems.length > 0) {
    shortcuts.push({
      key: 'u',
      label: `${pickIcon('⚠', '!')} ${tt.unresolvedItems.length}`,
      showKey: false,
      warn: true,
    });
  }
  shortcuts.push({ key: 'x', label: trans.timetable.hubLogout });
  return shortcuts;
}

function renderShortcutBar(shortcuts: readonly HubShortcut[]): string {
  const parts = shortcuts.map((sc) => {
    const bracket = sc.showKey === false ? `[${sc.label}]` : `[${sc.key}] ${sc.label}`;
    return sc.warn ? c.warn(bracket) : type.hint(bracket);
  });
  return `${space.indent}${parts.join('  ')}`;
}

/** Renders the full weekday x period grid if it (plus a floor reserved for
 * the shortcut bar) fits within bodyRows, otherwise the fixed-height compact
 * strip. Shared by the "this week" and "term hasn't started yet, preview
 * week 1" branches of renderHubBody -- the same measure-and-fallback
 * decision, just against a different week number. */
function pushAdaptiveWeekGrid(
  lines: string[], tt: Timetable, week: number, todayWd: number, now: Date, bodyRows: number, cols: number,
  cursor: GridCursor | undefined,
): void {
  const gridLines = renderWeekGrid(tt.meetings, tt.periods, week, now, cols, cursor).split('\n');
  // The hub's own menu is now a fixed one-line shortcut bar (blank + the bar
  // itself), not a variable-height ListField -- no more "menu option count"
  // to reserve room for.
  const roomForShortcutBar = 2;
  if (lines.length + gridLines.length <= bodyRows - roomForShortcutBar) {
    lines.push(...gridLines);
  } else {
    lines.push(...renderWeekStrip(tt.meetings, week, todayWd).split('\n'));
  }
}

function renderHubBody(state: ScheduleViewState, now: Date, bodyRows: number, cols: number): string[] {
  const trans = t();
  const lines: string[] = [];
  const tt = state.timetable;
  if (tt && state.weekOne) {
    const week = currentWeekNumber(state.weekOne, now);
    const banner = renderNextClassBanner(nextMeeting(tt.meetings, tt.periods, state.weekOne, now), now);
    lines.push(banner || hint(trans.timetable.noNextClass));
    lines.push('');
    const todayWd = campusWeekday(now);
    if (week < 1) {
      // weekOne can be a *future* date -- auto-inferred while on break, it
      // deliberately points at the upcoming term (see academic-calendar.ts)
      // so it's ready the moment classes start. There is no "today" to show
      // yet, but the timetable's real week-1 data is already fetched -- show
      // it as an explicit preview rather than showing no grid at all
      // regardless of terminal height. The "Week 1 preview" heading keeps it
      // unambiguous that this isn't "happening right now".
      lines.push(heading(trans.timetable.termNotStarted));
      lines.push(hint(fmt(trans.timetable.termStartsIn, {
        date: state.weekOne,
        days: String(daysBetween(now, new Date(`${state.weekOne}T00:00:00`))),
      })));
      lines.push('');
      lines.push(heading(trans.timetable.termPreviewWeek));
      pushAdaptiveWeekGrid(lines, tt, 1, todayWd, now, bodyRows, cols, state.gridCursor);
      lines.push('');
    } else {
      const today = meetingsOnDay(tt.meetings, todayWd, week);
      lines.push(heading(fmt(trans.timetable.todayHeading, { weekday: weekdayShortLabel(todayWd), week: String(week) })));
      lines.push(...renderTodayTimeline(today, tt.periods, now).split('\n'));
      lines.push(heading(trans.timetable.hubWeek));
      pushAdaptiveWeekGrid(lines, tt, week, todayWd, now, bodyRows, cols, state.gridCursor);
      lines.push('');
    }
  }
  if (state.statusMessage) {
    lines.push(hint(state.statusMessage));
    lines.push('');
  }
  if (tt) {
    lines.push(renderShortcutBar(hubShortcuts(tt)));
  }
  return lines;
}

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
  const filledChar = glyph.barFilled();
  const emptyChar = glyph.barEmpty();
  const bar = filledChar.repeat(filledCols) + emptyChar.repeat(TERM_PROGRESS_WIDTH - filledCols);
  return `${space.indent}${type.body(bar)}  ${type.hint(`${currentWeek}/${totalWeeks}${t().timetable.weekLabel2.replace('{week}', '').trim()}`)}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / 86400000));
}

function renderPublicBody(state: ScheduleViewState, now: Date, bodyRows: number): string[] {
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
    if (bar) lines.push(bar);
    if (w.nextBreakStart && w.nextBreakTitle) {
      lines.push(hint(fmt(trans.timetable.daysUntilBreak, {
        title: w.nextBreakTitle,
        days: String(daysBetween(now, new Date(`${w.nextBreakStart}T00:00:00`))),
      })));
    }
  }
  lines.push('');

  if (state.publicUpcoming && state.publicUpcoming.length > 0) {
    lines.push(heading(trans.calendar.recentActivity));
    const floorForRest = 5;
    const remaining = Math.max(1, bodyRows - lines.length - 1 - floorForRest);
    for (const e of state.publicUpcoming.slice(0, remaining)) lines.push(renderEventBrief(e, now));
    lines.push('');
  }

  lines.push(hint(trans.timetable.publicLoginHint));
  lines.push('');
  if (state.publicField) lines.push(...state.publicField.render());
  return lines;
}

export function renderSchedule(state: ScheduleViewState, now: Date, bodyRows = 100, cols = 80): string[] {
  const trans = t();
  switch (state.mode) {
    case 'loading':
      return [hint(trans.common.loading)];
    case 'public':
      return renderPublicBody(state, now, bodyRows);
    case 'needsLoginId':
      return [
        ...(state.errorMessage ? [hint(state.errorMessage), ''] : []),
        ...(state.idField?.render() ?? []),
      ];
    case 'needsLoginPassword':
      return state.passwordField?.render() ?? [];
    case 'authenticating':
      return [hint(state.statusMessage ?? trans.common.loading)];
    case 'needsWeekOne':
      return [
        ...(state.errorMessage ? [hint(state.errorMessage), ''] : []),
        ...(state.weekOneField?.render() ?? []),
      ];
    case 'hub':
      return renderHubBody(state, now, bodyRows, cols);
    case 'week':
      return state.timetable && state.weekOne
        ? [
          heading(trans.timetable.hubWeek),
          '',
          ...renderWeekGrid(
            state.timetable.meetings, state.timetable.periods, currentWeekNumber(state.weekOne, now), now, cols, state.gridCursor,
          ).split('\n'),
        ]
        : [hint(trans.timetable.genericError)];
    case 'termDensity':
      return state.timetable && state.weekOne
        ? renderTermDensity(state.timetable.meetings, state.weekOne, currentWeekNumber(state.weekOne, now)).split('\n')
        : [hint(trans.timetable.genericError)];
    case 'termPicker':
      return state.termField?.render() ?? [];
    case 'unresolved':
      return [
        heading(trans.timetable.unresolvedTitle),
        '',
        ...renderUnresolvedItems(state.timetable?.unresolvedItems ?? []).split('\n'),
      ];
    case 'meetingDetail':
      return state.detailMeeting && state.timetable
        ? renderMeetingDetail(state.detailMeeting, state.timetable.periods).split('\n')
        : [hint(trans.timetable.genericError)];
    case 'error':
      return [hint(state.errorMessage ?? trans.timetable.genericError)];
    default:
      return [];
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/views/schedule-render.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors — this file no longer uses `computeMaxVisible` (dropped from the `list-field.js` import) or `hubField`, and its `ListField` import is still needed for `termField`/`publicField`.

- [ ] **Step 6: Commit**

```bash
git add src/app/views/schedule-render.ts src/app/views/schedule-render.test.ts
git commit -m "feat: replace hub ListField with a shortcut bar, wire cursor + meetingDetail mode"
```

---

## Task 8: Wire cursor navigation + shortcut keys into `app/views/schedule.ts`

**Files:**
- Modify: `src/app/views/schedule.ts`
- Test: `src/app/views/schedule.test.ts`

**Interfaces:**
- Consumes: `hubShortcuts` (Task 7), `defaultGridCursor`/`handleGridKey` (Task 6), `currentWeekNumber`/`campusWeekday` (`../../features/schedule-query.js`, already exist).
- Produces: `buildHubField` is removed. `scheduleView`'s `handleKey`/`handleBack`/`load()` fully drive the new cursor + shortcut-bar interaction. This is the final task before manual verification.

- [ ] **Step 1: Write the failing tests**

Replace `src/app/views/schedule.test.ts` in full with:

```ts
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { SessionExpiredError } from '../../auth/errors.js';

const sessionStoreClear = vi.fn();
const sessionStoreLoad = vi.fn();

vi.mock('../../auth/session-store.js', () => ({
  createSessionStore: () => ({
    filePath: '/tmp/fake-session.json',
    load: sessionStoreLoad,
    save: vi.fn(),
    clear: sessionStoreClear,
  }),
}));

vi.mock('../../auth/nbt-auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/nbt-auth.js')>();
  return {
    ...actual,
    restoreNbtSession: vi.fn().mockResolvedValue({
      timetableTransport: {},
      snapshot: vi.fn(),
      close: vi.fn(),
    }),
  };
});

const listTerms = vi.fn();
vi.mock('@nbtca/nbtcal/timetable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nbtca/nbtcal/timetable')>();
  return {
    ...actual,
    createNbtTimetableClient: () => ({ listTerms, fetchTerm: vi.fn() }),
  };
});

vi.mock('../../features/schedule-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/schedule-store.js')>();
  return { ...actual, loadCurrentPointer: vi.fn().mockReturnValue(null), loadTimetableCache: vi.fn().mockReturnValue(null) };
});

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

const { scheduleView } = await import('./schedule.js');
const { setLanguage } = await import('../../i18n/index.js');
const { resetIconCache } = await import('../../core/icons.js');
const { stripAnsi } = await import('../../core/text.js');
const { loadCurrentPointer, loadTimetableCache } = await import('../../features/schedule-store.js');
const { t } = await import('../../i18n/index.js');
import type { AppContext } from '../view.js';
import type { Timetable } from '@nbtca/nbtcal/timetable';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

beforeEach(() => {
  vi.clearAllMocks();
});

function fakeCtx(): AppContext {
  return {
    size: { rows: 24, cols: 80 },
    bodyRows: 19,
    rerender: vi.fn(),
    runClassic: vi.fn(async (fn: () => Promise<void>) => { await fn(); }),
    quit: vi.fn(),
  };
}

describe('scheduleView', () => {
  it('has the expected id and title', () => {
    expect(scheduleView.id).toBe('schedule');
    expect(typeof scheduleView.title).toBe('string');
  });

  it('render() never throws before load() has run', () => {
    const ctx = fakeCtx();
    expect(() => scheduleView.render(ctx)).not.toThrow();
  });

  it('render() output is non-empty text', () => {
    const ctx = fakeCtx();
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out.trim().length).toBeGreaterThan(0);
  });

  it('capturesInput() returns a boolean and does not throw', () => {
    expect(typeof scheduleView.capturesInput?.()).toBe('boolean');
  });

  it('handleBack() returns false when there is nothing to step back from', () => {
    expect(scheduleView.handleBack?.()).toBe(false);
  });
});

// hubShortcuts itself (its data shape, the unresolved-count badge, key
// ordering) is fully covered by src/app/views/schedule-render.test.ts
// (Task 7) -- no need to re-test the same pure function's behavior here.
// This file's own tests exercise it only through scheduleView's key
// handling, below.

describe('scheduleView.load() with an expired session', () => {
  function fakeCtx(): AppContext {
    return {
      size: { rows: 24, cols: 80 },
      bodyRows: 19,
      rerender: vi.fn(),
      runClassic: vi.fn(async (fn: () => Promise<void>) => { await fn(); }),
      quit: vi.fn(),
    };
  }

  it('routes to the login field (not a dead-end error) and clears the stale session, when launching with no cache', async () => {
    vi.mocked(loadCurrentPointer).mockReturnValue(null);
    sessionStoreLoad.mockReturnValue({
      version: 1, provider: 'nbt-webvpn', jar: { cookies: [] }, authenticatedAt: '2026-01-01T00:00:00Z', validatedAt: '2026-01-01T00:00:00Z',
    });
    listTerms.mockRejectedValue(new SessionExpiredError());

    const ctx = fakeCtx();
    await scheduleView.load(ctx);

    expect(sessionStoreClear).toHaveBeenCalled();
    expect(scheduleView.capturesInput?.()).toBe(true);
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.studentId);
  });

  it('keeps an already-shown cached hub on screen when a background session refresh fails', async () => {
    vi.mocked(loadCurrentPointer).mockReturnValue({ termKey: '2026-3', weekOneMonday: '2026-09-07' });
    vi.mocked(loadTimetableCache).mockReturnValue({
      term: { academicYear: '2026', semester: '3' },
      meetings: [], periods: [], calendarDays: [], warnings: [], unresolvedItems: [],
      fetchedAt: new Date('2026-09-07T00:00:00Z'),
    } as unknown as Timetable);
    sessionStoreLoad.mockReturnValue({
      version: 1, provider: 'nbt-webvpn', jar: { cookies: [] }, authenticatedAt: '2026-01-01T00:00:00Z', validatedAt: '2026-01-01T00:00:00Z',
    });
    listTerms.mockRejectedValue(new SessionExpiredError());

    const ctx = fakeCtx();
    await scheduleView.load(ctx);

    expect(sessionStoreClear).toHaveBeenCalled();
    expect(scheduleView.capturesInput?.()).toBe(false);
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.hubLogout); // shortcut bar's own "Log out" -- the hub's always-present anchor
  });
});

describe('scheduleView.load() with no session — public view', () => {
  function fakeCtx(): AppContext {
    return {
      size: { rows: 24, cols: 80 }, bodyRows: 19, rerender: vi.fn(),
      runClassic: vi.fn(async (fn: () => Promise<void>) => { await fn(); }), quit: vi.fn(),
    };
  }

  it('shows the public view (not a login prompt) when there is no persisted session', async () => {
    vi.mocked(loadCurrentPointer).mockReturnValue(null);
    sessionStoreLoad.mockReturnValue(null);

    const ctx = fakeCtx();
    await scheduleView.load(ctx);

    expect(scheduleView.capturesInput?.()).toBe(false);
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.publicLoginAction);
    expect(out).not.toContain(t().timetable.studentId);
  });
});

describe('scheduleView — hub navigation', () => {
  function fakeCtx(): AppContext {
    return {
      size: { rows: 24, cols: 80 }, bodyRows: 40, rerender: vi.fn(),
      runClassic: vi.fn(async (fn: () => Promise<void>) => { await fn(); }), quit: vi.fn(),
    };
  }

  async function loadIntoHub(timetable?: Partial<Timetable>): Promise<AppContext> {
    vi.mocked(loadCurrentPointer).mockReturnValue({ termKey: '2026-3', weekOneMonday: '2026-09-07' });
    vi.mocked(loadTimetableCache).mockReturnValue({
      term: { academicYear: '2026', semester: '3' },
      meetings: [], periods: [{ period: 1, label: null, start: '08:00', end: '08:45' }],
      calendarDays: [], warnings: [], unresolvedItems: [],
      fetchedAt: new Date('2026-09-07T00:00:00Z'),
      ...timetable,
    } as unknown as Timetable);
    sessionStoreLoad.mockReturnValue({
      version: 1, provider: 'nbt-webvpn', jar: { cookies: [] }, authenticatedAt: '2026-01-01T00:00:00Z', validatedAt: '2026-01-01T00:00:00Z',
    });
    listTerms.mockRejectedValue(new SessionExpiredError());
    const ctx = fakeCtx();
    await scheduleView.load(ctx);
    return ctx;
  }

  it('navigates into termDensity mode via the "t" shortcut and back to the hub on Esc', async () => {
    const ctx = await loadIntoHub();
    scheduleView.handleKey('t', ctx);
    let out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.termDensityTitle);

    expect(scheduleView.handleBack?.()).toBe(true);
    out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.hubLogout);
  });

  it('navigates into the standalone week grid via the "w" shortcut and back to the hub on any key', async () => {
    const ctx = await loadIntoHub();
    scheduleView.handleKey('w', ctx);
    let out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.hubWeek);

    scheduleView.handleKey('z', ctx); // any key returns
    out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.hubLogout);
  });

  it('opens a meeting detail card on Enter when the cursor cell has a class, and returns to the hub on any key', async () => {
    const ctx = await loadIntoHub({
      meetings: [{
        sourceId: null, courseName: 'Math', teacherNames: ['Dr Li'], location: 'Room 201',
        weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1], kind: 'regular',
      }],
    });
    // The default cursor starts at *today's real* weekday (whatever day this
    // test suite happens to run on), not a fixed fixture date -- move all
    // the way left first (no wraparound, so 7 presses guarantees landing on
    // Monday/weekday 1 regardless of the starting weekday) to deterministically
    // reach the cell that matches this fixture's Mon/period1 meeting.
    for (let i = 0; i < 7; i++) scheduleView.handleKey('\x1b[D', ctx);
    scheduleView.handleKey('\r', ctx);
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain('Math');
    expect(out).toContain('Room 201');

    scheduleView.handleKey('z', ctx);
    const back = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(back).toContain(t().timetable.hubLogout);
  });

  it('does not open a detail card on Enter when the cursor cell is empty', async () => {
    const ctx = await loadIntoHub();
    scheduleView.handleKey('\r', ctx);
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.hubLogout); // stayed on hub, not meetingDetail
  });

  it('moves the grid cursor right with ArrowRight and does not wrap past Sunday', async () => {
    const ctx = await loadIntoHub();
    for (let i = 0; i < 10; i++) scheduleView.handleKey('\x1b[C', ctx);
    // No direct cursor accessor from the view -- confirm indirectly: Enter
    // at the clamped-right edge (weekday 7) still doesn't crash and the
    // view stays on hub (no meeting there in this empty-meetings fixture).
    scheduleView.handleKey('\r', ctx);
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.hubLogout);
  });

  it('logs out via the "x" shortcut', async () => {
    const ctx = await loadIntoHub();
    scheduleView.handleKey('x', ctx);
    expect(sessionStoreClear).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/views/schedule.test.ts`
Expected: FAIL — `buildHubField` no longer being imported (removed from this file's import list already) means the old `describe('buildHubField', ...)` tests are gone; the new `'scheduleView — hub navigation'` tests fail because `schedule.ts` still uses the old `ListField`-driven hub (pressing `'t'`/`'w'`/`'\r'`/arrow keys does nothing yet).

- [ ] **Step 3: Implement the wiring**

In `src/app/views/schedule.ts`, change the import block from:

```ts
import path from 'node:path';
import {
  createNbtTimetableClient,
  timetableToIcs,
  type AcademicTerm,
  type AcademicTermRef,
  type NbtTimetableClient,
  type Timetable,
} from '@nbtca/nbtcal/timetable';
import type { AppContext, View } from '../view.js';
import { captureFooterHint } from '../chrome.js';
import { ListField, computeMaxVisible } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { renderSchedule, type ScheduleViewState } from './schedule-render.js';
import { setVimKeysActive } from '../../core/vim-keys.js';
import { c } from '../../core/theme.js';
import { pickIcon } from '../../core/icons.js';
import { t } from '../../i18n/index.js';
import { AuthError } from '../../auth/errors.js';
import { loginWithStudentPassword, restoreNbtSession, type AuthenticatedNbtSession } from '../../auth/nbt-auth.js';
import { createSessionStore } from '../../auth/session-store.js';
import {
  resolveTerm, relevantTerms, writePrivateIcs, isSessionExpired, JWXT_ORIGIN, safeMessage,
} from '../../features/student-timetable.js';
import {
  termKey, loadWeekOne, saveWeekOne, saveTimetableCache,
  saveCurrentPointer, loadCurrentPointer, loadTimetableCache, clearScheduleCache,
} from '../../features/schedule-store.js';
import { loadCalendarOrThrow, toDisplayEvent } from '../../features/calendar.js';
import type { Event } from '../../features/calendar.js';
import { currentAcademicWindow, inferWeekOneMonday, isAcademicBreakEvent } from '../../features/academic-calendar.js';
import type { AcademicWindow, OnBreak } from '../../features/academic-calendar.js';
```

to:

```ts
import path from 'node:path';
import {
  createNbtTimetableClient,
  timetableToIcs,
  type AcademicTerm,
  type AcademicTermRef,
  type NbtTimetableClient,
  type Timetable,
} from '@nbtca/nbtcal/timetable';
import type { AppContext, View } from '../view.js';
import { captureFooterHint } from '../chrome.js';
import { ListField, computeMaxVisible } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { renderSchedule, hubShortcuts, type ScheduleViewState } from './schedule-render.js';
import { defaultGridCursor, handleGridKey } from './schedule-grid-cursor.js';
import { setVimKeysActive } from '../../core/vim-keys.js';
import { t } from '../../i18n/index.js';
import { AuthError } from '../../auth/errors.js';
import { loginWithStudentPassword, restoreNbtSession, type AuthenticatedNbtSession } from '../../auth/nbt-auth.js';
import { createSessionStore } from '../../auth/session-store.js';
import {
  resolveTerm, relevantTerms, writePrivateIcs, isSessionExpired, JWXT_ORIGIN, safeMessage,
} from '../../features/student-timetable.js';
import {
  termKey, loadWeekOne, saveWeekOne, saveTimetableCache,
  saveCurrentPointer, loadCurrentPointer, loadTimetableCache, clearScheduleCache,
} from '../../features/schedule-store.js';
import { loadCalendarOrThrow, toDisplayEvent } from '../../features/calendar.js';
import type { Event } from '../../features/calendar.js';
import { currentAcademicWindow, inferWeekOneMonday, isAcademicBreakEvent } from '../../features/academic-calendar.js';
import type { AcademicWindow, OnBreak } from '../../features/academic-calendar.js';
import { currentWeekNumber, campusWeekday } from '../../features/schedule-query.js';
```

(`c` and `pickIcon` are dropped — their only use was inside `buildHubField`, removed below. `computeMaxVisible` stays — still used for `termField`.)

Remove `buildHubField` entirely — delete this whole function:

```ts
/** Exported for direct unit testing — pure given a Timetable, no module state. */
export function buildHubField(tt: Timetable): ListField {
  const trans = t();
  const options = [
    // 本周/学期活跃度 are grouped first as two "zoom levels" on the same
    // timetable data, before the existing term/export/logout actions.
    // (按教室 was removed once the week grid started showing location
    // directly in each cell, making a separate by-location view redundant.)
    { value: 'week', label: trans.timetable.hubWeek },
    { value: 'termDensity', label: trans.timetable.hubTermDensity },
    { value: 'term', label: trans.timetable.hubSwitchTerm },
    { value: 'export', label: trans.timetable.hubExport },
    ...(tt.unresolvedItems.length > 0
      ? [{
        value: 'unresolved',
        // Warn-colored so it stands out even when not the selected row —
        // this is the one thing on the hub that genuinely needs the
        // student's attention, unlike the routine actions around it.
        label: c.warn(`${pickIcon('⚠', '!')} ${trans.timetable.hubUnresolved}`),
        hint: String(tt.unresolvedItems.length),
      }]
      : []),
    { value: 'logout', label: trans.timetable.hubLogout },
  ];
  return new ListField({ title: trans.timetable.menuEntry, options, footer: trans.menu.hintMove });
}
```

Change `returnToHub` from:

```ts
function returnToHub(): boolean {
  const tt = state.timetable;
  const backKey = state.key;
  const backWeekOne = state.weekOne;
  if (tt && backKey && backWeekOne) {
    state = { mode: 'hub', key: backKey, term: state.term, weekOne: backWeekOne, timetable: tt, hubField: buildHubField(tt) };
    return true;
  }
  return false;
}
```

to:

```ts
function returnToHub(): boolean {
  const tt = state.timetable;
  const backKey = state.key;
  const backWeekOne = state.weekOne;
  if (tt && backKey && backWeekOne) {
    // Carries over the existing cursor rather than resetting it -- closing a
    // meeting's detail card (or backing out of term density/unresolved)
    // should leave the student's grid navigation exactly where it was, not
    // silently jump back to today.
    state = {
      mode: 'hub', key: backKey, term: state.term, weekOne: backWeekOne, timetable: tt,
      gridCursor: state.gridCursor ?? defaultGridCursor(campusWeekday(new Date()), tt.periods),
    };
    return true;
  }
  return false;
}
```

Change `fetchAndShowHub`'s success branch from:

```ts
    const timetable = await client.fetchTerm(term as AcademicTermRef);
    saveTimetableCache(key, timetable);
    saveCurrentPointer(key, weekOne);
    state = { mode: 'hub', key, term, weekOne, timetable, hubField: buildHubField(timetable) };
```

to:

```ts
    const timetable = await client.fetchTerm(term as AcademicTermRef);
    saveTimetableCache(key, timetable);
    saveCurrentPointer(key, weekOne);
    state = {
      mode: 'hub', key, term, weekOne, timetable,
      gridCursor: defaultGridCursor(campusWeekday(new Date()), timetable.periods),
    };
```

Change `scheduleView.load`'s cached-hub branch from:

```ts
    if (ptr && isTimetableLike(cached)) {
      state = { mode: 'hub', key: ptr.termKey, weekOne: ptr.weekOneMonday, timetable: cached, hubField: buildHubField(cached) };
    } else {
```

to:

```ts
    if (ptr && isTimetableLike(cached)) {
      state = {
        mode: 'hub', key: ptr.termKey, weekOne: ptr.weekOneMonday, timetable: cached,
        gridCursor: defaultGridCursor(campusWeekday(new Date()), cached.periods),
      };
    } else {
```

Change `handleBack` from:

```ts
  handleBack(): boolean {
    if (
      state.mode === 'week' || state.mode === 'unresolved' || state.mode === 'termPicker'
      || state.mode === 'termDensity'
    ) {
      return returnToHub();
    }
    return false;
  },
```

to:

```ts
  handleBack(): boolean {
    if (state.mode === 'meetingDetail') {
      // Esc respects where the detail card was opened from -- from the
      // standalone 'week' mode, it steps back there, not all the way to hub.
      if (state.detailFrom === 'week') { state = { ...state, mode: 'week' }; return true; }
      return returnToHub();
    }
    if (
      state.mode === 'week' || state.mode === 'unresolved' || state.mode === 'termPicker'
      || state.mode === 'termDensity'
    ) {
      return returnToHub();
    }
    return false;
  },
```

Finally, in `handleKey`, replace the entire `case 'hub':` block and the `case 'week': case 'unresolved': case 'termDensity':` group. Before:

```ts
      case 'hub': {
        const result = state.hubField?.handleKey(key);
        const tt = state.timetable;
        const hubKey = state.key;
        const hubWeekOne = state.weekOne;
        if (!result?.selected || !tt || !hubKey || !hubWeekOne) return;
        if (result.selected === 'week') { state = { ...state, mode: 'week' }; return; }
        if (result.selected === 'termDensity') { state = { ...state, mode: 'termDensity' }; return; }
        if (result.selected === 'unresolved') { state = { ...state, mode: 'unresolved' }; return; }
        if (result.selected === 'term') {
          const options = relevantTerms(catalog).map((tm) => ({
            value: `${tm.academicYear}:${tm.semester}`,
            label: tm.academicYearLabel,
            hint: tm.current ? t().common.current : undefined,
          }));
          options.push({ value: '__back__', label: t().common.back, hint: undefined });
          state = {
            ...state,
            mode: 'termPicker',
            termField: new ListField({ title: t().timetable.hubSwitchTerm, options, maxVisible: computeMaxVisible(ctx.bodyRows) }),
          };
          return;
        }
        if (result.selected === 'export') {
          try {
            const ics = timetableToIcs(tt, { weekOneMonday: hubWeekOne, calendarName: `NBT ${state.term?.academicYearLabel ?? ''}` });
            const out = `timetable-${hubKey}.ics`;
            writePrivateIcs(out, ics);
            state = { ...state, statusMessage: `${t().common.success}: ${path.resolve(out)}` };
          } catch {
            state = { ...state, statusMessage: t().timetable.genericError };
          }
          return;
        }
        if (result.selected === 'logout') {
          createSessionStore().clear();
          clearScheduleCache();
          void session?.close();
          session = null;
          client = null;
          void goToPublic(ctx);
        }
        return;
      }
      case 'week':
      case 'unresolved':
      case 'termDensity': {
        returnToHub();
        return;
      }
```

After:

```ts
      case 'hub': {
        const tt = state.timetable;
        const hubKey = state.key;
        const hubWeekOne = state.weekOne;
        if (!tt || !hubKey || !hubWeekOne) return;
        const cursor = state.gridCursor ?? defaultGridCursor(campusWeekday(new Date()), tt.periods);
        const week = Math.max(1, currentWeekNumber(hubWeekOne, new Date()));
        const nav = handleGridKey(key, cursor, tt, week);
        if (nav.kind === 'moveCursor') { state = { ...state, gridCursor: nav.cursor }; return; }
        if (nav.kind === 'openDetail') { state = { ...state, mode: 'meetingDetail', detailMeeting: nav.meeting, detailFrom: 'hub' }; return; }

        const shortcut = hubShortcuts(tt).find((sc) => sc.key === key);
        if (!shortcut) return;
        if (shortcut.key === 'w') { state = { ...state, mode: 'week' }; return; }
        if (shortcut.key === 't') { state = { ...state, mode: 'termDensity' }; return; }
        if (shortcut.key === 'u') { state = { ...state, mode: 'unresolved' }; return; }
        if (shortcut.key === 's') {
          const options = relevantTerms(catalog).map((tm) => ({
            value: `${tm.academicYear}:${tm.semester}`,
            label: tm.academicYearLabel,
            hint: tm.current ? t().common.current : undefined,
          }));
          options.push({ value: '__back__', label: t().common.back, hint: undefined });
          state = {
            ...state,
            mode: 'termPicker',
            termField: new ListField({ title: t().timetable.hubSwitchTerm, options, maxVisible: computeMaxVisible(ctx.bodyRows) }),
          };
          return;
        }
        if (shortcut.key === 'e') {
          try {
            const ics = timetableToIcs(tt, { weekOneMonday: hubWeekOne, calendarName: `NBT ${state.term?.academicYearLabel ?? ''}` });
            const out = `timetable-${hubKey}.ics`;
            writePrivateIcs(out, ics);
            state = { ...state, statusMessage: `${t().common.success}: ${path.resolve(out)}` };
          } catch {
            state = { ...state, statusMessage: t().timetable.genericError };
          }
          return;
        }
        if (shortcut.key === 'x') {
          createSessionStore().clear();
          clearScheduleCache();
          void session?.close();
          session = null;
          client = null;
          void goToPublic(ctx);
        }
        return;
      }
      case 'week': {
        const tt = state.timetable;
        const weekOne = state.weekOne;
        if (!tt || !weekOne) { returnToHub(); return; }
        const cursor = state.gridCursor ?? defaultGridCursor(campusWeekday(new Date()), tt.periods);
        const week = Math.max(1, currentWeekNumber(weekOne, new Date()));
        const nav = handleGridKey(key, cursor, tt, week);
        if (nav.kind === 'moveCursor') { state = { ...state, gridCursor: nav.cursor }; return; }
        if (nav.kind === 'openDetail') { state = { ...state, mode: 'meetingDetail', detailMeeting: nav.meeting, detailFrom: 'week' }; return; }
        returnToHub();
        return;
      }
      case 'meetingDetail': {
        if (state.detailFrom === 'week') { state = { ...state, mode: 'week' }; return; }
        returnToHub();
        return;
      }
      case 'unresolved':
      case 'termDensity': {
        returnToHub();
        return;
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/views/schedule.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors — confirms `c`/`pickIcon` are no longer imported unused in `schedule.ts`.

Run: `npx vitest run`
Expected: PASS — every test in the repo, confirming nothing in Tasks 1–8 broke an unrelated file.

- [ ] **Step 6: Commit**

```bash
git add src/app/views/schedule.ts src/app/views/schedule.test.ts
git commit -m "feat: wire cursor navigation and shortcut keys into the Schedule hub"
```

---

## Task 9: Live verification against real cached timetable data

This task has no code changes — it's the live pty check this session has used for every prior feature, confirming the feature reads correctly with real terminal rendering (cursor visibility, column alignment, key responsiveness) rather than only fabricated-fixture unit tests.

- [ ] **Step 1: Confirm there is real cached timetable data to render against**

Run: `find "$(node -e "console.log(require('node:os').homedir())")/.local/state/nbtca" -iname '*timetable*' 2>/dev/null || find ~/.nbtca -iname '*timetable*' 2>/dev/null`

If nothing is found, log in once via `npx tsx src/index.ts` (Schedule tab → sign in) to populate a real cache, or skip to Step 3 and rely on the public (no-login) view plus the unit tests from Tasks 1–8 as sufficient coverage — the interactive grid and shortcut bar are both authenticated-only.

- [ ] **Step 2: Launch the app in a real pty and drive it through the new interactions**

Use a Python pty harness with a `drain()` step between every keystroke (sending a second keystroke via `os.write()` without draining accumulated output first stalls the app — the pty's kernel buffer fills and it looks like a hang, not an app bug):

```bash
python3 - <<'EOF'
import pty, os, fcntl, termios, struct, select, time, sys

def drain(fd, timeout=0.3):
    out = b''
    while True:
        r, _, _ = select.select([fd], [], [], timeout)
        if not r: break
        try:
            chunk = os.read(fd, 65536)
        except OSError:
            break
        if not chunk: break
        out += chunk
    return out

pid, fd = pty.fork()
if pid == 0:
    os.execvp('npx', ['npx', 'tsx', 'src/index.ts'])
else:
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 50, 140, 0, 0))
    time.sleep(2)
    drain(fd)
    # Adjust the key sequence below to reach the Schedule tab for your
    # build's actual tab order (digit key), then exercise: arrow-key
    # cursor movement, Enter on a populated cell (detail card), any key to
    # return, 't'/'w'/'s'/'e'/'x' shortcuts.
    for k in ['2', '\x1b[C', '\x1b[C', '\x1b[B', '\r', 'z', 't', 'z', 'w']:
        os.write(fd, k.encode())
        time.sleep(0.3)
        drain(fd)
    time.sleep(0.5)
    out = drain(fd)
    os.kill(pid, 9)
    sys.stdout.buffer.write(out[-6000:])
    print()
EOF
```

- [ ] **Step 3: Visually confirm**

- The grid cursor renders as a solid brand-colored block, visibly distinct from today's own bold-text column header, even when the cursor sits in today's column.
- Arrow keys move the cursor and stop (no wraparound) at Monday/Sunday and the first/last period.
- Enter on a populated cell opens a meeting detail card showing the full course name, weekday + real time range, location, teacher(s), and week range — nothing truncated.
- Enter on an empty cell does nothing.
- Any key (or Esc) closes the detail card back to where it was opened from.
- The hub shows a single-line shortcut bar (`[w] Full grid  [t] Term density  [s] Switch term  [e] Export .ics  [x] Log out`, plus `[⚠ N]` when there are unresolved items) instead of a vertical menu, and each bracketed letter works when pressed directly.
- On a narrow terminal, the hub still falls back to the non-interactive compact week strip (unaffected by this feature).

- [ ] **Step 4: No commit for this task** — it's a verification-only step. If it surfaces a real bug, fix it in a new commit and re-run this task's Steps 2–3.

---

## Summary of what this plan does NOT do

Per the design spec's own "Out of scope" section — confirmed unchanged by this plan:

- No change to `renderWeekStrip`, `renderTermDensity`, or the term-picker `ListField` — only the hub's own top-level menu and the grid's own interactivity are in scope.
- No change to Home's own week-overview grid (`src/app/views/home.ts`) — intentionally coarser/non-interactive, out of scope here.
- No multi-cell selection, editing, or write operations on the grid — this is read-only drill-down, same as every other Schedule destination.
