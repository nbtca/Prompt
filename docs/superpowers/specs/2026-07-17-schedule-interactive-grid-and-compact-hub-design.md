# Schedule: Interactive Grid + Compact Hub — Design

**Status:** Approved (design agreed in conversation)
**Date:** 2026-07-17
**Branch:** `main` (Prompt)

## Goal

The Schedule hub's week grid and hub menu were reworked repeatedly this session
(location-priority cells, real clock-time row labels, no-duplicate continuation
rows, wide-terminal cell growth) but a live wide-terminal screenshot still read
as visually poor: content pinned to the left third of the screen, a long
always-visible vertical menu competing with the grid for vertical space, and no
way to see a truncated cell's full information short of widening cells further
(which was already reaching diminishing returns — location + a real course name
routinely exceeds what any reasonable cell width can show in full).

This spec replaces cramming-more-into-each-cell with **drilling into a cell for
detail on demand**, and replaces the always-visible vertical hub menu with a
**single-line shortcut bar** — both aimed at the same goal: let the grid be the
dominant, glanceable content, and put everything else out of its way.

## Context / building blocks (already exist)

- `src/features/schedule-render.ts` — `renderWeekGrid` (this session's current
  version: real clock-time row labels, location-priority cell content,
  no-duplicate continuation cells via a `│` connector, adaptive cell width).
  This spec adds a cursor parameter and a distinct "selected" visual treatment
  on top of the existing rendering; it does not change the underlying
  location-priority/continuation/adaptive-width logic.
- `src/app/views/schedule.ts` / `schedule-render.ts` — the hub view/render
  split, `ScheduleViewState`, `buildHubField` (currently a `ListField` with 6
  options: This week / Term density / Switch term / Export .ics / conditional
  Needs attention / Log out).
- `src/core/components/menu.ts` — `renderMenu`'s existing "selected row" visual
  convention (`glyph.cursor()` + `type.active`) — the precedent this spec's new
  grid-cursor visual treatment deliberately does **not** reuse (see below).
- `src/core/theme.ts` — `type.active` (bold + brand, used for "today" in the
  grid and for the currently-selected row in every `ListField`-based menu in
  this app). This spec adds a new `type.cursor` token, distinct from
  `type.active`.

## Part A — Grid becomes cursor-navigable

### Cursor state

A new 2D cursor `{ weekday: 1..7; period: number }`, held in `schedule.ts`'s
module-level `ScheduleViewState` (`gridCursor?: { weekday: number; period:
number }`). Initialized when entering hub mode (or re-entering it via
`returnToHub()`) to today's weekday and the first defined period (falling back
to weekday 1 if today is a weekend, since the grid's weekend columns are always
empty for personal timetables).

### Key handling (hub mode)

- `ArrowLeft`/`ArrowRight`: move `gridCursor.weekday`, clamped to `[1, 7]` —
  hitting the edge stays put, with **no wraparound**. This is a deliberate
  departure from `ListField`'s own wrap-at-the-ends behavior: a 7-day week has
  a real, fixed edge (there's no "Monday before Sunday" the way a scrollable
  list wrapping back to its top makes sense), so wrapping here would just be
  confusing.
- `ArrowUp`/`ArrowDown`: move `gridCursor.period` to the previous/next defined
  period in the sorted period table, clamped at the first/last period (same
  no-wrap reasoning as above).
- `Enter`: if the cell at the cursor has a meeting (starting or continuing
  there), enter the new `'meetingDetail'` mode (Part B) for that meeting. If
  the cell is empty, no-op.
- Single letter keys (`w`, `t`, `s`, `e`, `l`, and `u` when applicable) trigger
  the corresponding hub action directly — see Part C.
- `Esc`/back: unchanged, leaves the Schedule tab (hub mode has nothing further
  to step back from — it's the tab's own root).

### Cursor visual treatment

A new `type.cursor` token in `theme.ts`: `chalk.bgHex('#0ea5e9').black(s)` — a
solid brand-colored block with black text. This is deliberately **not**
`type.active` (bold brand text on the default background, already claimed by
"today" for both the grid's weekday header and, elsewhere in the app, every
`ListField`'s selected row) — reusing it for the cursor would mean two
different signals ("this is today" and "this is where your cursor is") share
one visual language, which is exactly the ambiguity `type.active`'s own
documentation warns against. A solid background block is unambiguous even when
the cursor happens to land on today's own column (today's dim "•" header
marker and the cursor's solid block coexist without conflict, since they're
different visual mechanisms — one is a text color, the other is a background).

The cursor cell's content itself is unchanged (same `gridCellContent` output,
same truncation rules) — only the styling wrapper changes, replacing whatever
`type.active`/`type.body`/`type.hint` would have applied for that cell.

### `renderWeekGrid` signature change

```ts
export function renderWeekGrid(
  meetings: readonly TimetableMeeting[],
  periods: readonly TimetablePeriod[],
  weekNumber: number,
  now: Date,
  cols = 80,
  cursor?: { weekday: number; period: number },
): string
```

When `cursor` is provided and matches a cell, that cell's content is wrapped in
`type.cursor(...)` instead of its normal styling. `renderWeekStrip` (the
compact fallback for short terminals) is **not** given a cursor — it's a
non-interactive summary, and the standalone `'week'` full-screen mode (reached
via the `w` key, see Part C) is where the interactive grid lives when the
hub's own inline view had to fall back to the strip.

## Part B — Meeting detail card

A new read-only `ScheduleMode`: `'meetingDetail'`. Entered from the hub (Enter
on a cursor cell with a meeting) or from the standalone `'week'` mode (which
also becomes cursor-navigable, sharing the same cursor state and key handling).
Any key / Esc returns to wherever it was entered from — matches the existing
"read-only detail view" pattern already used by `'termDensity'`.

### Layout

```
   PLC原理课程设计

   时间   周一 08:00-08:45
   地点   sl707
   教师   李英道
   周次   1-16 周
```

- Title: the full, untruncated course name (`type.heading`).
- `时间`/`地点`/`教师`/`周次` rows: a fixed-width label column (matching this
  file's established `heading()`/`hint()` label-then-value convention) +
  value. `教师` joins `teacherNames` with `、` (already the natural Chinese
  list separator used elsewhere in this app's real data). `周次` compresses
  the `weeks` array into a range string (`1-16`) when contiguous, falling back
  to a comma-joined list when not contiguous (a genuinely non-contiguous week
  pattern is rare but must not crash or silently drop data).
- New pure function `renderMeetingDetail(meeting: TimetableMeeting, periods:
  readonly TimetablePeriod[]): string` in `src/features/schedule-render.ts`,
  following this file's established `'\n'`-joined-string convention.

## Part C — Hub menu becomes a single-line shortcut bar

`buildHubField`'s `ListField` is removed from the hub entirely. In its place,
a single hint line (styled like this app's own footer hint bar, `type.hint`)
listing available actions:

```
   [w] Full grid  [t] Term density  [s] Switch term  [e] Export .ics  [⚠ 1]  [l] Log out
```

- `[⚠ 1]` only appears when `unresolvedItems.length > 0` (same condition as
  today), styled with `c.warn` (unchanged treatment, just relocated from a
  menu row to this bar) and bound to the `u` key.
- Pressing the bracketed letter executes that action directly — no navigating
  into a list first. `w` → the standalone full-screen `'week'` mode (the only
  way to reach the interactive grid when the hub's own inline view had to
  fall back to the non-interactive compact strip on a short terminal), `t` →
  term density, `s` → the existing term-picker `ListField` (unchanged —
  switching terms is a genuine list-of-terms choice, not a single action, so
  it keeps its own interactive list), `e` → export (unchanged behavior, still
  shows the resulting status message), `u` → unresolved items, `l` → log out
  (unchanged behavior).

### Data flow / state

`ScheduleViewState.hubField` (the `ListField`) is removed. `buildHubField` is
removed (or repurposed into a pure `hubShortcuts(tt: Timetable):
Array<{key: string; label: string; warn?: boolean}>` that both the bar
renderer and the key-handling switch consume, so the visible bar and the
actual key bindings can never drift apart from each other).

### Vertical space this frees up

The hub body's structure becomes: Next banner → Today/term-not-started section
→ grid (now interactive, interactive is a strict superset of the current
adaptive grid/strip logic) → **one line** shortcut bar. No more
`computeMaxVisible`/`setMaxVisible` reservation math for a multi-row menu field
— `renderHubBody`'s "reserve room for the menu" logic (`roomForMenu = 4 +
optionCount`) collapses to reserving exactly 2 lines (blank + the bar itself).

## Error handling

- `gridCursor` pointing at a weekday/period combination that no longer exists
  after a term switch (different period table) is re-clamped the same way
  `ListField.setMaxVisible` already re-clamps an out-of-range selection —
  reset to the default (today's weekday, first period) whenever `switchTerm`
  completes.
- A meeting's `teacherNames` being empty renders `教师` as omitted entirely
  (not a bare empty value) — matches this app's established "don't show a
  label with nothing next to it" convention (e.g. `renderNextClassBanner`
  already omits the location segment entirely when there's none).

## Testing

- `renderWeekGrid` cursor tests: cursor cell gets `type.cursor` treatment, a
  non-cursor cell does not, cursor on an empty cell doesn't crash, cursor
  coexists with the today-column dimming without visual-token collision
  (assert the exact ANSI sequence used, not just presence of *a* color).
- `renderMeetingDetail` tests: full course name shown untruncated, teacher
  list joined correctly, empty teacher list omits the row, contiguous vs.
  non-contiguous week-range formatting, single-`'\n'`-joined-string
  regression guard (this file's established pattern).
- Hub key-handling tests: arrow keys move the cursor within bounds and do not
  wrap at the edges, Enter on a populated cell enters `'meetingDetail'`, Enter
  on an empty cell is a no-op, each shortcut-bar letter triggers its bound
  action, the shortcut bar's visible letters and the actual key bindings are
  derived from the same source (so a test can assert they can't drift).
- Live pty verification against real cached timetable data at a genuinely
  wide terminal (matching the screenshot that prompted this spec) and a
  narrow one (confirming the strip fallback is unaffected, non-interactive,
  and unaffected by any of this).

## Out of scope

- Changing `renderWeekStrip`, `renderTermDensity`, or the term-picker
  `ListField` — only the hub's own top-level menu and the grid's own
  interactivity are in scope.
- Any change to Home's own week-overview grid (`src/app/views/home.ts`) —
  that grid is intentionally coarser/non-interactive and out of scope here.
- Multi-cell selection, editing, or any write operation on the grid — this is
  read-only drill-down, same as every other Schedule destination.

## Versioning

Prompt-side only; no `@nbtca/nbtcal` or `@nbtca/docs` changes required.
