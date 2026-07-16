# Schedule Term-Density + By-Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new Schedule hub destinations — `学期活跃度` (term density strip) and `按教室` (by-location view) — implementing Parts A/B/C of `docs/superpowers/specs/2026-07-16-schedule-term-density-and-home-control-center-design.md`.

**Architecture:** Two new pure renderers in `src/features/schedule-render.ts` (`renderTermDensity`, `renderMeetingsByLocation`), each returning a single `'\n'`-joined string per this codebase's established renderer convention. They're wired into `src/app/views/schedule-render.ts`'s `ScheduleMode` union and `renderSchedule` mode switch, and reached from two new options in `src/app/views/schedule.ts`'s `buildHubField()`, following the exact same "read-only detail view, any key/Esc returns to hub" pattern already used by `'week'`/`'unresolved'`.

**Tech Stack:** TypeScript, vitest, chalk (via `src/core/theme.ts`'s `c`/`type`/`glyph` tokens), the existing `pickIcon` ASCII-fallback icon system.

## Global Constraints

- Every renderer in `schedule-render.ts` returns one `'\n'`-joined string; every call site MUST `.split('\n')` before pushing into a lines array — this file's established, regression-tested convention (see `EXPANDED_HUB_MIN_BODY_ROWS` comment history and the "second `space.indent`" bug class from earlier this session).
- The 5-level density glyph vocabulary (`·░▒▓█` / ASCII `' .:-='`) is reused verbatim from `calendar-heatmap.ts`'s `countToGlyph`, but **not** its green color ramp — term density uses the brand-color ramp instead (level 0 = `type.hint`, levels 1–3 = `c.brand`, level 4 = `type.active`), per the spec's "Visual language decision."
- Bucketing is **relative to each term's own max**, never fixed absolute thresholds (spec Part A, "Bucketing").
- No changes to the existing Events heatmap, Schedule week grid/strip, or the adaptive-density mechanism itself (spec "Out of scope").
- Every new test file/block follows this codebase's existing pattern: `stripAnsi()` + `NBTCA_ICON_MODE` env var for icon-mode-specific assertions, `setLanguage('en')` in `beforeAll`, any test that temporarily changes language or icon mode restores it in a `finally` block (regression: a prior test in this exact file leaked `'zh'` state into six unrelated tests when an assertion threw before its manual restore ran).

---

## Task 1: Add new i18n keys

**Files:**
- Modify: `src/i18n/index.ts:288` (end of the `timetable` interface block, just before its closing `};`)
- Modify: `src/i18n/locales/en.json:269` (end of the `"timetable"` object, just before its closing `},`)
- Modify: `src/i18n/locales/zh.json:269` (same)

**Interfaces:**
- Produces: `Translations['timetable']` gains `hubTermDensity`, `hubByLocation`, `termDensityTitle`, `termDensityThisWeek`, `byLocationTitle`, `byLocationEmpty`, `periodSuffix`, `weekdayPrefix` — all `string`. Tasks 2–5 read these via `t().timetable.<key>`.

There's no existing automated en/zh key-parity test in this codebase (checked: no test file references `en.json`/`zh.json`), so this task's verification is a manual read-back plus TypeScript's own structural check (the `Translations` interface makes a missing key in either JSON file surface as a type error the moment it's cast/used — see step 4).

- [ ] **Step 1: Add the keys to the `Translations` interface**

In `src/i18n/index.ts`, the `timetable` block currently ends like this (lines 287–289):

```ts
    termNotStarted: string;
    termStartsIn: string;
  };
```

Change it to:

```ts
    termNotStarted: string;
    termStartsIn: string;
    hubTermDensity: string;
    hubByLocation: string;
    termDensityTitle: string;
    termDensityThisWeek: string;
    byLocationTitle: string;
    byLocationEmpty: string;
    periodSuffix: string;
    weekdayPrefix: string;
  };
```

- [ ] **Step 2: Add the English values**

In `src/i18n/locales/en.json`, the `"timetable"` object currently ends like this (lines 268–270):

```json
    "termNotStarted": "Term hasn't started yet",
    "termStartsIn": "Classes begin {date} · {days} days to go"
  },
```

Change it to:

```json
    "termNotStarted": "Term hasn't started yet",
    "termStartsIn": "Classes begin {date} · {days} days to go",
    "hubTermDensity": "Term density",
    "hubByLocation": "By location",
    "termDensityTitle": "Term density",
    "termDensityThisWeek": "This week",
    "byLocationTitle": "This week · By location",
    "byLocationEmpty": "No located classes this week",
    "periodSuffix": "",
    "weekdayPrefix": ""
  },
```

- [ ] **Step 3: Add the Chinese values**

In `src/i18n/locales/zh.json`, the `"timetable"` object currently ends like this (lines 268–270):

```json
    "termNotStarted": "本学期尚未开始",
    "termStartsIn": "{date} 开学 · 还有 {days} 天"
  },
```

Change it to:

```json
    "termNotStarted": "本学期尚未开始",
    "termStartsIn": "{date} 开学 · 还有 {days} 天",
    "hubTermDensity": "学期活跃度",
    "hubByLocation": "按教室",
    "termDensityTitle": "学期活跃度",
    "termDensityThisWeek": "本周",
    "byLocationTitle": "本周 · 按教室",
    "byLocationEmpty": "本周没有可定位地点的课程",
    "periodSuffix": "节",
    "weekdayPrefix": "周"
  },
```

- [ ] **Step 4: Verify with a type check**

Run: `npx tsc --noEmit`
Expected: no new errors. (This is the closest thing this codebase has to an en/zh parity check — `Translations` is a single interface shared by both JSON files' runtime-loaded shape, so a key present in the interface but missing from either JSON file would only surface as `undefined` at runtime, not a compile error. Re-read both diffs above by eye to confirm both files got all 8 keys.)

- [ ] **Step 5: Commit**

```bash
git add src/i18n/index.ts src/i18n/locales/en.json src/i18n/locales/zh.json
git commit -m "i18n: add term density / by-location translation keys"
```

---

## Task 2: `renderTermDensity` pure renderer

**Files:**
- Modify: `src/features/schedule-render.ts` (append new code at the end of the file)
- Test: `src/features/schedule-render.test.ts` (append a new `describe('renderTermDensity', ...)` block)

**Interfaces:**
- Consumes: `TimetableMeeting` (`{ weekday, startPeriod, endPeriod, weeks: number[], courseName, location, ... }`, from `@nbtca/nbtcal/timetable`, already imported in this file), `c`/`type`/`space` from `../core/theme.js` (already imported), `pickIcon` from `../core/icons.js` (already imported), `t`/`fmt` from `../i18n/index.js` (already imported — this task adds `getCurrentLanguage` to that import).
- Produces: `export function renderTermDensity(meetings: readonly TimetableMeeting[], weekOneMonday: string, currentWeek: number): string` — a single `'\n'`-joined string, consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/schedule-render.test.ts` (after the existing `describe('renderUnresolvedItems', ...)` block, or anywhere at the top level — vitest doesn't care about order):

```ts
describe('renderTermDensity', () => {
  it('buckets each week into the correct relative density level', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    try {
      const meetings: TimetableMeeting[] = [
        mk({ weeks: [2], startPeriod: 1, endPeriod: 1 }), // 1 slot
        mk({ weeks: [3], startPeriod: 1, endPeriod: 2 }), // 2 slots
        mk({ weeks: [4], startPeriod: 1, endPeriod: 3 }), // 3 slots
        mk({ weeks: [5], startPeriod: 1, endPeriod: 4 }), // 4 slots (max)
      ];
      // week 1 has no meeting at all -> 0 slots -> level 0
      const out = stripAnsi(renderTermDensity(meetings, '2026-09-07', 1));
      const lines = out.split('\n');
      const glyphLine = lines[3] ?? '';
      expect(glyphLine.trim()).toBe('· ░ ▒ ▓ █');
    } finally {
      process.env['NBTCA_ICON_MODE'] = 'ascii';
      resetIconCache();
    }
  });

  it('places the current-week marker at the correct column', () => {
    // weeks present: 1 and 5 -> range is [1,5], 5 weeks, 2 display columns each.
    // currentWeek=3 -> index 2 -> column 2*2=4, plus the 3-char space.indent -> 7.
    const meetings: TimetableMeeting[] = [mk({ weeks: [1] }), mk({ weeks: [5] })];
    const out = stripAnsi(renderTermDensity(meetings, '2026-09-07', 3));
    const lines = out.split('\n');
    const markerLine = lines[4] ?? '';
    expect(markerLine.indexOf('^')).toBe(7);
    expect(markerLine).toContain('This week');
  });

  it('renders a single all-dot week when there are no meetings at all', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    try {
      const out = stripAnsi(renderTermDensity([], '2026-09-07', 5));
      const lines = out.split('\n');
      expect(lines[3]?.trim()).toBe('·');
    } finally {
      process.env['NBTCA_ICON_MODE'] = 'ascii';
      resetIconCache();
    }
  });

  it('never collapses into one array entry when split on newlines', () => {
    const out = renderTermDensity([mk({ weeks: [1] })], '2026-09-07', 1);
    const lines = out.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line).not.toContain('\n');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/schedule-render.test.ts -t "renderTermDensity"`
Expected: FAIL — `renderTermDensity` is not exported / not defined.

- [ ] **Step 3: Implement `renderTermDensity`**

First, widen the i18n import at the top of `src/features/schedule-render.ts` from:

```ts
import { t, fmt } from '../i18n/index.js';
```

to:

```ts
import { t, fmt, getCurrentLanguage } from '../i18n/index.js';
```

Then append the following to the end of `src/features/schedule-render.ts` (after `renderUnresolvedItems`):

```ts
const DENSITY_GLYPHS: Array<[string, string]> = [
  ['·', ' '], ['░', '.'], ['▒', ':'], ['▓', '-'], ['█', '='],
];

function levelGlyph(level: number): string {
  const pair = DENSITY_GLYPHS[Math.max(0, Math.min(4, level))] ?? DENSITY_GLYPHS[0]!;
  return pickIcon(pair[0], pair[1]);
}

/** Level 0 reads as an ordinary "no data" cell (matches renderWeekGrid's own
 * empty-cell treatment above); levels 1-3 use plain brand color; level 4
 * reuses type.active's exact bold+brand composition rather than inventing a
 * new top-tier shade — deliberately NOT the heatmap's green ramp, which
 * specifically means "club activity," not personal class load. */
function applyDensityColor(glyphChar: string, level: number): string {
  if (level <= 0) return type.hint(glyphChar);
  if (level >= 4) return type.active(glyphChar);
  return c.brand(glyphChar);
}

function weekStartDate(weekOneMonday: string, week: number): Date {
  const base = new Date(`${weekOneMonday}T00:00:00`);
  return new Date(base.getTime() + (week - 1) * 7 * 86400000);
}

/** A term-length, one-glyph-per-week density strip: coarser than the daily
 * Events heatmap (a term-scale view, not a day-scale one), bucketed relative
 * to this term's own busiest week rather than fixed absolute thresholds — a
 * fixed "9-16 slots = medium" guess would misclassify a light-course-load
 * student's whole term as uniformly light, or a heavy one as uniformly busy. */
export function renderTermDensity(
  meetings: readonly TimetableMeeting[],
  weekOneMonday: string,
  currentWeek: number,
): string {
  const trans = t();
  const lang = getCurrentLanguage();

  let minWeek = currentWeek;
  let maxWeek = currentWeek;
  for (const m of meetings) {
    for (const w of m.weeks) {
      if (w < minWeek) minWeek = w;
      if (w > maxWeek) maxWeek = w;
    }
  }
  const numWeeks = maxWeek - minWeek + 1;

  const weekSlots: number[] = [];
  for (let w = minWeek; w <= maxWeek; w++) {
    let slots = 0;
    for (const m of meetings) {
      if (m.weeks.includes(w)) slots += m.endPeriod - m.startPeriod + 1;
    }
    weekSlots.push(slots);
  }
  const max = Math.max(0, ...weekSlots);

  const levels = weekSlots.map((v) => {
    if (v === 0 || max === 0) return 0;
    if (v <= max * 0.25) return 1;
    if (v <= max * 0.5) return 2;
    if (v <= max * 0.75) return 3;
    return 4;
  });

  // Month-label row: same column-buffer-overflow technique as
  // calendar-heatmap.ts's own month row — each week occupies exactly 2
  // display columns (1 glyph + 1 joining space), so a month's label is
  // written starting at column i*2 and allowed to overflow rightward into
  // the following weeks' columns (months are always several weeks apart).
  const monthChars = new Array<string>(numWeeks * 2).fill(' ');
  let prevMonth = -1;
  for (let i = 0; i < numWeeks; i++) {
    const date = weekStartDate(weekOneMonday, minWeek + i);
    const month = date.getMonth();
    if (month !== prevMonth) {
      prevMonth = month;
      const label = lang === 'zh'
        ? `${month + 1}月`
        : new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
      const start = i * 2;
      for (let j = 0; j < label.length && start + j < monthChars.length; j++) {
        monthChars[start + j] = label[j] ?? ' ';
      }
    }
  }
  const monthLabelLine = `${space.indent}${monthChars.join('')}`;

  const glyphLine = `${space.indent}${levels.map((lvl) => applyDensityColor(levelGlyph(lvl), lvl)).join(' ')}`;

  // Current-week marker is a separate row below the strip, not a recolored
  // glyph cell — a single recolored cell would read as "something is wrong
  // with this week" rather than "you are here."
  const currentWeekIndex = Math.max(0, currentWeek - minWeek);
  const markerGlyph = pickIcon('↑', '^');
  const markerLine = `${space.indent}${type.hint(
    `${' '.repeat(currentWeekIndex * 2)}${markerGlyph} ${trans.timetable.termDensityThisWeek}`,
  )}`;

  const legendGlyphs = [0, 1, 2, 3, 4].map((lvl) => applyDensityColor(levelGlyph(lvl), lvl));
  const legendLine = `${space.indent}${type.hint(trans.calendar.heatmap.legendLess)} ${legendGlyphs.join('')} ${type.hint(trans.calendar.heatmap.legendMore)}`;

  return [
    `${space.indent}${type.heading(trans.timetable.termDensityTitle)}`,
    '',
    monthLabelLine,
    glyphLine,
    markerLine,
    '',
    legendLine,
  ].join('\n');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/schedule-render.test.ts -t "renderTermDensity"`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/schedule-render.ts src/features/schedule-render.test.ts
git commit -m "feat: add renderTermDensity, a term-length class-density strip"
```

---

## Task 3: `renderMeetingsByLocation` pure renderer

**Files:**
- Modify: `src/features/schedule-render.ts` (append at the end)
- Test: `src/features/schedule-render.test.ts` (append a new `describe('renderMeetingsByLocation', ...)` block)

**Interfaces:**
- Consumes: `meetingsInWeek` from `./schedule-query.js` (already imported in this file), `weekdayShortLabel` (already defined in this file, above).
- Produces: `export function renderMeetingsByLocation(meetings: readonly TimetableMeeting[], weekNumber: number): string`, consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/schedule-render.test.ts`:

```ts
describe('renderMeetingsByLocation', () => {
  it('groups by location (sorted) and lists each meeting sorted by weekday then period', () => {
    const meetings: TimetableMeeting[] = [
      mk({ courseName: 'Advanced Math', location: 'Room 3-201', weekday: 4, startPeriod: 1, endPeriod: 1, weeks: [1] }),
      mk({ courseName: 'Advanced Math', location: 'Room 3-201', weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1] }),
      mk({ courseName: 'Data Structures', location: 'Room 1-302', weekday: 3, startPeriod: 3, endPeriod: 3, weeks: [1] }),
    ];
    const out = stripAnsi(renderMeetingsByLocation(meetings, 1));
    const lines = out.split('\n');
    const idxRoom1 = lines.findIndex((l) => l.includes('Room 1-302'));
    const idxRoom3 = lines.findIndex((l) => l.includes('Room 3-201'));
    expect(idxRoom1).toBeGreaterThanOrEqual(0);
    expect(idxRoom3).toBeGreaterThan(idxRoom1); // 'Room 1-302' sorts before 'Room 3-201'
    const mondayLine = lines.findIndex((l) => l.includes('Mon'));
    const thursdayLine = lines.findIndex((l) => l.includes('Thu'));
    expect(mondayLine).toBeGreaterThan(idxRoom3);
    expect(thursdayLine).toBeGreaterThan(mondayLine); // Mon listed before Thu within the same location
  });

  it('excludes meetings with a null location', () => {
    const meetings: TimetableMeeting[] = [
      mk({ location: null, weekday: 1, weeks: [1] }),
      mk({ location: 'Room 201', weekday: 2, weeks: [1] }),
    ];
    const out = stripAnsi(renderMeetingsByLocation(meetings, 1));
    expect(out).toContain('Room 201');
    expect(out).not.toContain('null');
  });

  it('shows an empty-state line when no meetings are located this week', () => {
    const out = stripAnsi(renderMeetingsByLocation([], 1));
    expect(out).toContain('No located classes this week');
  });

  it('formats a multi-period meeting as a period range', () => {
    const out = stripAnsi(renderMeetingsByLocation(
      [mk({ location: 'Gym', weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1] })], 1,
    ));
    expect(out).toContain('P1-2');
  });

  it('formats a single-period meeting without a range', () => {
    const out = stripAnsi(renderMeetingsByLocation(
      [mk({ location: 'Room 201', weekday: 1, startPeriod: 3, endPeriod: 3, weeks: [1] })], 1,
    ));
    expect(out).toContain('P3');
    expect(out).not.toContain('P3-3');
  });

  it('never collapses into one array entry when split on newlines', () => {
    const out = renderMeetingsByLocation([mk({ location: 'Room 201', weekday: 1, weeks: [1] })], 1);
    for (const line of out.split('\n')) expect(line).not.toContain('\n');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/schedule-render.test.ts -t "renderMeetingsByLocation"`
Expected: FAIL — `renderMeetingsByLocation` is not exported / not defined.

- [ ] **Step 3: Implement `renderMeetingsByLocation`**

Append to the end of `src/features/schedule-render.ts` (after `renderTermDensity`):

```ts
function periodRangeLabel(start: number, end: number): string {
  const trans = t();
  const range = start === end ? `${start}` : `${start}-${end}`;
  return `${trans.timetable.periodShort}${range}${trans.timetable.periodSuffix}`;
}

/** Groups the current week's meetings by location — a re-sort of already-
 * familiar list rendering (heading()/hint()/bullet conventions used
 * everywhere else in this file), not a new density visualization. */
export function renderMeetingsByLocation(meetings: readonly TimetableMeeting[], weekNumber: number): string {
  const trans = t();
  const week = meetingsInWeek(meetings, weekNumber).filter((m) => m.location !== null);
  if (week.length === 0) return `${space.indent}${type.hint(trans.timetable.byLocationEmpty)}`;

  const byLocation = new Map<string, TimetableMeeting[]>();
  for (const m of week) {
    const loc = m.location as string;
    const list = byLocation.get(loc) ?? [];
    list.push(m);
    byLocation.set(loc, list);
  }
  // Plain string sort (not a locale-aware collation) so ordering is
  // deterministic across environments and installs, independent of the
  // host's configured locale.
  const locations = [...byLocation.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const dot = pickIcon('·', '-');
  const lines: string[] = [];
  locations.forEach((loc, i) => {
    if (i > 0) lines.push('');
    lines.push(`${space.indent}${type.heading(loc)}`);
    const sorted = [...(byLocation.get(loc) ?? [])].sort(
      (a, b) => a.weekday - b.weekday || a.startPeriod - b.startPeriod,
    );
    for (const m of sorted) {
      const weekdayLabel = `${trans.timetable.weekdayPrefix}${weekdayShortLabel(m.weekday)}`;
      const periodLabel = periodRangeLabel(m.startPeriod, m.endPeriod);
      lines.push(`${space.indent}${dot} ${type.body(weekdayLabel)} ${type.hint(periodLabel)}  ${type.body(m.courseName)}`);
    }
  });
  return lines.join('\n');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/schedule-render.test.ts -t "renderMeetingsByLocation"`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/schedule-render.ts src/features/schedule-render.test.ts
git commit -m "feat: add renderMeetingsByLocation, a by-location weekly view"
```

---

## Task 4: Wire the two new modes into `renderSchedule`

**Files:**
- Modify: `src/app/views/schedule-render.ts`
- Test: `src/app/views/schedule-render.test.ts`

**Interfaces:**
- Consumes: `renderTermDensity`, `renderMeetingsByLocation` from `../../features/schedule-render.js` (Tasks 2/3).
- Produces: `ScheduleMode` gains `'termDensity' | 'byLocation'`; `renderSchedule` handles both. Consumed by Task 5's hub wiring.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/views/schedule-render.test.ts`, inside the existing `describe('renderSchedule', ...)` block (anywhere after the `'unresolved mode lists the unresolved item'` test is fine):

```ts
  it('termDensity mode renders the term density strip with its own title', () => {
    const out = stripAnsi(renderSchedule({
      mode: 'termDensity', key: '2026-3', weekOne: '2026-09-07', timetable,
    }, new Date('2026-09-07T09:00:00')).join('\n'));
    expect(out).toContain('Term density');
  });

  it('byLocation mode renders the by-location list with a wrapping heading', () => {
    const out = stripAnsi(renderSchedule({
      mode: 'byLocation', key: '2026-3', weekOne: '2026-09-07', timetable,
    }, new Date('2026-09-07T09:00:00')).join('\n'));
    expect(out).toContain('This week · By location');
    expect(out).toContain('Room 201'); // from the fixture timetable's one meeting
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/views/schedule-render.test.ts -t "termDensity mode"`
Expected: FAIL — `renderSchedule` returns `[]` for an unhandled mode (falls through to `default`), so the assertions fail.

- [ ] **Step 3: Implement the wiring**

In `src/app/views/schedule-render.ts`, widen the import from `../../features/schedule-render.js`:

```ts
import {
  renderNextClassBanner, renderWeekGrid, renderUnresolvedItems, renderTodayTimeline, renderWeekStrip,
  weekdayShortLabel,
} from '../../features/schedule-render.js';
```

to:

```ts
import {
  renderNextClassBanner, renderWeekGrid, renderUnresolvedItems, renderTodayTimeline, renderWeekStrip,
  weekdayShortLabel, renderTermDensity, renderMeetingsByLocation,
} from '../../features/schedule-render.js';
```

Widen the `ScheduleMode` union from:

```ts
export type ScheduleMode =
  | 'loading'
  | 'public'
  | 'needsLoginId'
  | 'needsLoginPassword'
  | 'authenticating'
  | 'needsWeekOne'
  | 'hub'
  | 'week'
  | 'termPicker'
  | 'unresolved'
  | 'error';
```

to:

```ts
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
  | 'byLocation'
  | 'termPicker'
  | 'unresolved'
  | 'error';
```

In `renderSchedule`'s `switch (state.mode)`, add two new cases right after the existing `case 'week':` block:

```ts
    case 'week':
      return state.timetable && state.weekOne
        ? [
          heading(trans.timetable.hubWeek),
          '',
          ...renderWeekGrid(state.timetable.meetings, state.timetable.periods, currentWeekNumber(state.weekOne, now), now).split('\n'),
        ]
        : [hint(trans.timetable.genericError)];
    case 'termDensity':
      // renderTermDensity() already prints its own title (space.indent +
      // type.heading), matching Events' heatmap mode — this case doesn't
      // add a second heading on top.
      return state.timetable && state.weekOne
        ? renderTermDensity(state.timetable.meetings, state.weekOne, currentWeekNumber(state.weekOne, now)).split('\n')
        : [hint(trans.timetable.genericError)];
    case 'byLocation':
      return state.timetable && state.weekOne
        ? [
          heading(trans.timetable.byLocationTitle),
          '',
          ...renderMeetingsByLocation(state.timetable.meetings, currentWeekNumber(state.weekOne, now)).split('\n'),
        ]
        : [hint(trans.timetable.genericError)];
```

(The existing `case 'termPicker':` and `case 'unresolved':` cases stay unchanged below this.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/views/schedule-render.test.ts`
Expected: PASS (all tests in the file, including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/app/views/schedule-render.ts src/app/views/schedule-render.test.ts
git commit -m "feat: wire termDensity/byLocation modes into renderSchedule"
```

---

## Task 5: Add the two hub menu options and mode navigation

**Files:**
- Modify: `src/app/views/schedule.ts`
- Test: `src/app/views/schedule.test.ts`

**Interfaces:**
- Consumes: `ScheduleMode` (Task 4), `t().timetable.hubTermDensity`/`hubByLocation` (Task 1).
- Produces: final user-facing hub menu shape — `本周` / `学期活跃度` / `按教室` / `切换学期` / `导出.ics` / `⚠待处理事项`(conditional) / `退出登录`, matching spec Part C exactly.

- [ ] **Step 1: Write the failing tests**

Append to the existing `describe('buildHubField', ...)` block in `src/app/views/schedule.test.ts`:

```ts
  it('includes the term density and by-location options, grouped with This week', () => {
    const field = buildHubField({ ...baseTimetable, unresolvedItems: [] });
    const text = field.render().join('\n');
    expect(text).toContain('Term density');
    expect(text).toContain('By location');
  });
```

Then add a new top-level `describe` block (after the existing ones, before end of file):

```ts
describe('scheduleView — term density / by-location navigation', () => {
  function fakeCtx(): AppContext {
    return {
      size: { rows: 24, cols: 80 }, bodyRows: 40, rerender: vi.fn(),
      runClassic: vi.fn(async (fn: () => Promise<void>) => { await fn(); }), quit: vi.fn(),
    };
  }

  // Reuses the exact "cached hub survives a failed background refresh"
  // setup from the describe block above — the simplest reliable way to land
  // scheduleView in 'hub' mode with a real hubField, without also having to
  // mock a successful client.fetchTerm() round trip.
  async function loadIntoHub(): Promise<AppContext> {
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
    return ctx;
  }

  it('navigates into termDensity mode and back to the hub on Esc', async () => {
    const ctx = await loadIntoHub();
    scheduleView.handleKey('\x1b[B', ctx); // 'week' -> 'termDensity'
    scheduleView.handleKey('\r', ctx); // select
    let out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.termDensityTitle);

    expect(scheduleView.handleBack?.()).toBe(true);
    out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.menuEntry);
  });

  it('navigates into byLocation mode and back to the hub on any key', async () => {
    const ctx = await loadIntoHub();
    scheduleView.handleKey('\x1b[B', ctx); // 'week' -> 'termDensity'
    scheduleView.handleKey('\x1b[B', ctx); // 'termDensity' -> 'byLocation'
    scheduleView.handleKey('\r', ctx); // select
    let out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.byLocationTitle);

    scheduleView.handleKey('\r', ctx); // any key returns to hub
    out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.menuEntry);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/views/schedule.test.ts -t "term density"`
Expected: FAIL — `buildHubField` has no such options yet, and `handleKey('\x1b[B', ...)` twice still lands on an unrelated option.

- [ ] **Step 3: Implement the wiring**

In `src/app/views/schedule.ts`, change `buildHubField` from:

```ts
export function buildHubField(tt: Timetable): ListField {
  const trans = t();
  const options = [
    { value: 'week', label: trans.timetable.hubWeek },
    { value: 'term', label: trans.timetable.hubSwitchTerm },
    { value: 'export', label: trans.timetable.hubExport },
```

to:

```ts
export function buildHubField(tt: Timetable): ListField {
  const trans = t();
  const options = [
    // 本周/学期活跃度/按教室 are grouped first as three "zoom levels" on the
    // same timetable data, before the existing term/export/logout actions.
    { value: 'week', label: trans.timetable.hubWeek },
    { value: 'termDensity', label: trans.timetable.hubTermDensity },
    { value: 'byLocation', label: trans.timetable.hubByLocation },
    { value: 'term', label: trans.timetable.hubSwitchTerm },
    { value: 'export', label: trans.timetable.hubExport },
```

(the rest of the function — the conditional `unresolved` option and the trailing `logout` option — is unchanged.)

In `handleKey`'s `case 'hub':` block, add two new branches right after the existing `'week'` one:

```ts
        if (result.selected === 'week') { state = { ...state, mode: 'week' }; return; }
        if (result.selected === 'termDensity') { state = { ...state, mode: 'termDensity' }; return; }
        if (result.selected === 'byLocation') { state = { ...state, mode: 'byLocation' }; return; }
        if (result.selected === 'unresolved') { state = { ...state, mode: 'unresolved' }; return; }
```

Change the read-only-mode `handleKey` case group from:

```ts
      case 'week':
      case 'unresolved': {
        returnToHub();
        return;
      }
```

to:

```ts
      case 'week':
      case 'unresolved':
      case 'termDensity':
      case 'byLocation': {
        returnToHub();
        return;
      }
```

Change `handleBack` from:

```ts
  handleBack(): boolean {
    if (state.mode === 'week' || state.mode === 'unresolved' || state.mode === 'termPicker') {
      return returnToHub();
    }
    return false;
  },
```

to:

```ts
  handleBack(): boolean {
    if (
      state.mode === 'week' || state.mode === 'unresolved' || state.mode === 'termPicker'
      || state.mode === 'termDensity' || state.mode === 'byLocation'
    ) {
      return returnToHub();
    }
    return false;
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/views/schedule.test.ts`
Expected: PASS (all tests in the file, including the 3 new ones)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — every test in the repo, confirming nothing in Tasks 1–5 broke an unrelated file.

- [ ] **Step 6: Commit**

```bash
git add src/app/views/schedule.ts src/app/views/schedule.test.ts
git commit -m "feat: add term density / by-location options to the Schedule hub menu"
```

---

## Task 6: Live verification against real cached timetable data

This task has no code changes — it's the live pty check this session has used for every prior feature, confirming the feature reads correctly with real terminal rendering (column alignment, real month labels, real glyph coloring) rather than only fabricated-fixture unit tests.

- [ ] **Step 1: Confirm there is real cached timetable data to render against**

Run: `find "$(node -e "console.log(require('node:os').homedir())")/.local/state/nbtca" -iname '*timetable*' 2>/dev/null || find ~/.nbtca -iname '*timetable*' 2>/dev/null`

If nothing is found, log in once via `npx tsx src/index.ts` (Schedule tab → sign in) to populate a real cache, or skip to Step 3 and rely on the public (no-login) view plus the unit tests from Tasks 1–5 as sufficient coverage — term density and by-location are both authenticated-only destinations, so without a real cached timetable this step degrades to "confirm the app still launches and Schedule's public view is unaffected."

- [ ] **Step 2: Launch the app in a real pty at both a normal and a tall terminal size**

```bash
python3 - <<'EOF'
import pty, os, fcntl, termios, struct, subprocess, time, sys

def run(rows, cols, keys, label):
    pid, fd = pty.fork()
    if pid == 0:
        os.execvp('npx', ['npx', 'tsx', 'src/index.ts'])
    else:
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
        time.sleep(2)
        for k in keys:
            os.write(fd, k.encode())
            time.sleep(0.3)
        time.sleep(1)
        out = b''
        try:
            while True:
                out += os.read(fd, 65536)
        except OSError:
            pass
        os.kill(pid, 9)
        print(f"--- {label} ({rows}x{cols}) ---")
        sys.stdout.buffer.write(out[-4000:])
        print()

# Adjust the key sequence below to reach Schedule -> 学期活跃度/按教室 for
# your build's actual tab order and hub menu order.
run(24, 80, ['\x1b[B\x1b[B', '\r'], 'normal terminal')
run(50, 100, ['\x1b[B\x1b[B', '\r'], 'tall terminal')
EOF
```

- [ ] **Step 3: Visually confirm, at both sizes**

- The term-density strip's month-label row aligns with real month boundaries (no overlapping/garbled labels).
- The `↑ 本周`/`↑ This week` marker sits under the correct week column.
- Glyphs use the brand-color ramp (dim → `c.brand` → bold brand), not green.
- The by-location view's headings and weekday/period lines are readable and correctly indented (matches `space.indent` used everywhere else).
- Both destinations return to the hub on any key / Esc, and the hub menu shows `本周`/`学期活跃度`/`按教室` grouped first.

- [ ] **Step 4: No commit for this task** — it's a verification-only step. If it surfaces a real bug, fix it in a new commit and re-run this task's Steps 2–3.

---

## Summary of what this plan does NOT do

Per the design spec's own "Out of scope" section — confirmed unchanged by this plan:

- No changes to the existing Events heatmap, Schedule week grid, or week strip.
- No changes to the adaptive-density mechanism (the `bodyRows`-aware inline-vs-drill-down logic) itself.
- No "compare terms" historical view.
- No Home changes — Parts D/E (Home's `本周概览` grid and unresolved-items surfacing) are a separate plan, to be written and executed after this one is confirmed working.
