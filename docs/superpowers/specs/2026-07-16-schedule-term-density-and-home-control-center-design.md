# Schedule Term-Density + Home Control-Center — Design

**Status:** Approved (design agreed in conversation)
**Date:** 2026-07-16
**Branch:** `main` (Prompt)

## Goal

Events has a real, narrative visualization (the activity heatmap) that Schedule and
Home don't have equivalents of — both currently rely on status bars and text lists
rather than anything that tells a shape-at-a-glance story. This spec adds two new
visualizations, each personalized to data the *other* views can't show:

- **Schedule**: a term-length class-density strip (`学期活跃度`) and a by-location
  view (`按教室`), both reached from the hub menu — the hub itself stays anchored on
  today's timeline as the default, with the menu explicitly reading as "zoom out to a
  wider dimension" (今日 → 本周 → 学期活跃度 / 按教室).
- **Home**: a combined class+event density grid for the coming week (`本周概览`) —
  the one visualization neither Schedule nor Events alone can produce, since it
  requires both data sources at once — plus surfacing unresolved schedule items
  directly on Home instead of only inside Schedule's own menu, matching the
  "everything that needs your attention, in one place" spirit of `gh status`.

## Context / building blocks (already exist)

- `src/features/calendar-heatmap.ts` — `renderHeatmap(buckets, now, {color})`, the
  established 5-level density-glyph vocabulary (`countToGlyph`: `·`/`░`/`▒`/`▓`/`█`)
  and its `applyColor` green ramp. This spec reuses the *glyph* vocabulary for the new
  visualizations but not `renderHeatmap` itself (different grid shape/domain), and
  does not reuse the green color ramp for personal-schedule data — see Visual
  language below.
- `src/features/schedule-query.ts` — `meetingsInWeek`, `campusWeekday`,
  `currentWeekNumber`, `meetingsOnDay`.
- `src/features/schedule-render.ts` — `renderTodayTimeline`, `renderWeekGrid`,
  `renderWeekStrip`, `weekdayShortLabel`. This is where the two new pure renderers
  belong (matches the existing home of every other schedule visualization).
- `src/app/views/schedule.ts` / `schedule-render.ts` — the native Schedule view/hub,
  already has the adaptive-density mechanism (`bodyRows`-aware inline-vs-drill-down)
  from the immediately preceding round of work.
- `src/app/views/home.ts` — `renderHome(data, now, bodyRows)`, already adaptive for
  its event-count panel.
- `@nbtca/nbtcal`'s `Calendar.inRange`/`Calendar.heatmap` — the public feed query
  surface Events/Schedule's public view already use for event data.
- `glyph.barFilled()`/`glyph.barEmpty()` (`theme.ts`) — the two-level bar vocabulary,
  a *different, deliberately coarser* vocabulary from the 5-level density glyphs;
  this spec does not blur the two.

## Visual language decision

The 5-level density glyphs (`·░▒▓█`) are reused verbatim for both new visualizations
— same shapes, same meaning ("more filled = more of this thing"), so a student who's
already learned to read the Events heatmap reads these instantly. Color is **not**
reused verbatim: Events' green ramp specifically signals "club activity," and
reusing it for personal class load or a combined Home overview would blur what's
whose data. Personal-schedule density (Schedule's term strip) uses the app's brand
color ramp (dimmer-to-brighter along the existing `#0ea5e9`-family hex, matching how
`type.active` already claims brand color for "this matters" elsewhere) instead of
green. Home's combined grid — being neither purely "schedule" nor purely "events" —
renders both rows in **plain dim/body text, no color ramp at all**, deliberately
restrained: it's an overview of two other colored things, not a third color language
to learn.

## Part A — Schedule: `学期活跃度` (term density strip)

### Data

For the *current* term's `Timetable.meetings`, compute a `weekStart..weekEnd` range
from the union of every meeting's `weeks` array (`min`/`max` across all of them — not
a fixed assumption like "18 weeks," since terms vary). For each week number in that
range, sum `(endPeriod - startPeriod + 1)` across every meeting scheduled that week —
"period-slots," a proxy for total class-hours that week that doesn't require period
start/end time-of-day math.

### Bucketing (relative, not fixed-absolute)

Let `M` = the maximum per-week period-slot sum across the whole computed range (0 if
there are no meetings at all, in which case every week renders as `·`). Bucket each
week's value `v` into the same 5 levels `countToGlyph` already uses, but by fraction
of `M` rather than fixed absolute thresholds (a fixed "9-16 slots = medium" guess
would misclassify a light-course-load student's whole term as uniformly "light," or
a heavy one as uniformly "busy" — relative-to-your-own-term's-max is what actually
produces a readable shape for *any* student):

```
v == 0         -> level 0 (·)
0 < v <= M*0.25 -> level 1 (░)
M*0.25 < v <= M*0.5 -> level 2 (▒)
M*0.5 < v <= M*0.75 -> level 3 (▓)
M*0.75 < v <= M -> level 4 (█)
```

### Layout

```
   学期活跃度

   9月    10月      11月     12月      1月
   ▓ ▓ ░ · ▓ ▓ ░ ▓ ▓ ▓ ░ ▓ ▓ █ ▓ ░ ▓ ▓
                     ↑ 本周

   少 ·░▒▓█ 多
```

- One glyph per week (not per day — this is a *term*-scale view, coarser than the
  Events heatmap's per-day grid), joined with a single space between glyphs (matching
  the mockup's `▓ ▓ ░ ·` spacing) — unlike the Events heatmap's 2-column-per-day grid
  cells, so the month-label and current-week-marker column math below is simpler:
  each week occupies exactly 2 display columns (1 glyph + 1 joining space) starting
  right after `space.indent`.
- A month-label row above the glyph row: for each week index `i` in the computed
  range, derive that week's representative date as `weekOneMonday + i*7 days`; when
  its month differs from the previous week's, write the month's short label
  (`Intl.DateTimeFormat` short month, same as the Events heatmap's own month
  formatting) into a character buffer at column `i*2` (letting it overflow rightward
  into the following weeks' columns, exactly as the Events heatmap already does —
  months are always more than a couple of weeks apart, so labels never collide).
- A marker row below the glyph row: an `↑` character (plus, in English, the label
  `This week`) placed at column `currentWeekIndex*2` (`currentWeekIndex` = the
  current week's position within the computed range, 0-based) — a plain hint-styled
  row of otherwise-blank spaces with the caret at that one column, *not* a recolored
  glyph cell. Deliberately not `type.active`-coloring the glyph itself: the whole
  strip is already one cohesive "this is the shape of the term" reading, and a single
  recolored cell would read as "something is wrong with this week" rather than "you
  are here."
- Legend line matches the Events heatmap's own legend line construction exactly
  (`少 ...glyphs... 多` / `Less ...glyphs... More`), including its `space.indent`
  prefix (the bug fixed earlier this session in `calendar-heatmap.ts` — the new
  renderer must ship correctly indented from the start, not repeat that mistake).

### New pure function

`src/features/schedule-render.ts`:

```ts
export function renderTermDensity(
  meetings: readonly TimetableMeeting[],
  weekOneMonday: string,
  currentWeek: number,
): string
```

Returns one `'\n'`-joined multi-line string (matching every other renderer in this
file) — callers must `.split('\n')` before pushing, per this codebase's established
convention and its regression-tested pitfall.

### Where it's reached

New hub menu option `学期活跃度` / `Term density`, alongside the existing `本周`
option. Selecting it enters a new `ScheduleMode` (`'termDensity'`), a pure read-only
detail view — same "any key / Esc returns to hub" pattern as `'week'`/`'unresolved'`.

## Part B — Schedule: `按教室` (by-location view)

### Data

For the current week's meetings (`meetingsInWeek`, already exists), group by
`location` (skipping meetings with `location: null`), and within each location list
which weekday(s)/period(s) put you there, sorted by weekday then start period.

### Layout

```
   本周 · 按教室

   教1-302
   · 周三 第3节  数据结构

   教3-201
   · 周一 第1节  高等数学Ⅱ
   · 周四 第1节  高等数学Ⅱ

   操场
   · 周一 第1-2节  体育
```

Each location becomes its own small heading + list, reusing the exact `heading()`/
`hint()`/bullet conventions already used everywhere else in this file — no new
visual vocabulary needed here, this is a re-sort of already-familiar list rendering,
not a new density visualization.

### New pure function

`src/features/schedule-render.ts`:

```ts
export function renderMeetingsByLocation(
  meetings: readonly TimetableMeeting[],
  weekNumber: number,
): string
```

Same `'\n'`-joined-string convention as above.

### Where it's reached

New hub menu option `按教室` / `By location`, new `ScheduleMode` (`'byLocation'`),
same read-only-detail-view pattern.

## Part C — Schedule hub menu, final shape

```
课表
→ 本周
  学期活跃度
  按教室
  切换学期
  导出 .ics
  ⚠ 待处理事项   (only when unresolvedItems.length > 0, unchanged from today)
  退出登录
```

`本周`/`学期活跃度`/`按教室` are grouped first (three "zoom levels" on the same
timetable data), existing actions follow unchanged. `buildHubField()` in
`schedule.ts` gains the two new options; `handleKey`'s `'hub'` case gains their
selection handling; `renderSchedule`'s mode switch gains the two new render cases;
`handleBack`/`handleKey`'s read-only-mode list gains both new modes.

## Part D — Home: `本周概览` (combined week-ahead density grid)

### Data

For the coming 7 days (`now` through `now + 6 days`, campus-weekday-aligned same as
`renderWeekStrip`'s own Monday-start convention):

- **Class row**: for each of the 7 days, does the cached personal timetable
  (`loadCurrentPointer`/`loadTimetableCache`, the same cache-only, instant,
  no-network source `peekTodayLines`/`peekNextClassLine` already use) have any
  meeting that day? Binary has/hasn't (matches `renderWeekStrip`'s own binary
  has-class glyph — Home's grid is intentionally coarser than a density strip, since
  it's a glance-panel component, not a destination view).
- **Event row**: for the same 7 days, does the public calendar feed
  (`calendar.inRange`, already available via `loadCalendarOrThrow` — Home already
  does one networked fetch for its existing "Activity" panel; this reuses that same
  loaded `Calendar` instance rather than fetching twice) have any event that day?
  Same binary has/hasn't.

Both rows binary (not 5-level density) — deliberately coarser than Schedule's own
term-density strip, matching Home's role as a glance panel that points *at* detail
views rather than replacing them.

### Layout

```
   本周概览
        一   二   三   四   五   六   日
   课程  ▓▓  ░░  ▓▓  ▓▓  ░░  ··  ··
   活动  ░░  ▓▓  ░░  ░░  ▓▓  ░░  ··
        ▓▓ 较满  ░░ 较空  ·· 无
```

No color ramp (see Visual language above) — `type.body`/`type.hint` only, `··` for
weekend columns on *both* rows (a weekend can still have a club event, so unlike
Schedule's own week strip, the event row's weekend cells are **not** hardcoded to
`··` — only the class row is, since campus classes never happen on weekends; this is
a real, deliberate asymmetry between the two rows' weekend treatment, not a copy-paste
of `renderWeekStrip`'s own logic).

### New pure function

`src/app/views/home.ts` (or promoted to `src/features/schedule-render.ts` if it turns
out to want the same testing/reuse treatment as the term-density strip — implementer's
call at plan-writing time, following this codebase's existing precedent for where
similar pure view-composition logic already lives).

### Data flow / loading

`homeView.load(ctx)` already does one cache-only sync pass (next class + today) and
one networked pass (events). The week-ahead grid's class row is itself cache-only
(reuses the already-loaded timetable cache — no new I/O); its event row needs the
same `Calendar` instance already being loaded for the existing "Activity" panel — so
this is computed alongside that fetch, not a third network round-trip.

## Part E — Home: surfacing unresolved schedule items

### Data

Cache-only: `loadCurrentPointer()` + `loadTimetableCache()` (exactly what
`peekTodayLines`/`peekNextClassLine` already read), checking
`Timetable.unresolvedItems.length`.

### Layout

A single warn-colored line (matching the exact same `c.warn` + `⚠` treatment
`buildHubField()` in `schedule.ts` already uses for this), shown only when
`unresolvedItems.length > 0`:

```
   ⚠ 待处理事项 · 1
```

Placed after the "今日"/"本周概览" blocks, before "活动" — a warning is more urgent
than a glance-panel event list, but less urgent than "what's happening to me right
now" (next class / today).

### New pure function

Extends `renderHome`'s existing structure directly — no new renderer needed, this is
a conditional single line using patterns (`c.warn`, `pickIcon('⚠','!')`) already
established in `schedule.ts`.

## Data flow summary

- Schedule term-density / by-location: pure functions over `Timetable.meetings`
  already loaded for the hub — no new I/O.
- Home's combined grid: cache-only timetable read (existing) + the same `Calendar`
  fetch Home's Activity panel already performs (existing) — one new pure computation
  combining data from two already-loaded sources, zero new network calls.
- Home's unresolved-items line: cache-only, zero new I/O.

## Error handling

All of the above degrade the same way their existing neighbors do: missing/absent
cache data renders an empty-but-non-crashing result (e.g. term-density with zero
meetings renders an all-`·` strip, not an error); Home's combined grid's event row
falls back to all-blank (not all-`·`, to visually distinguish "no data yet" from "no
events") while `data.loading`/`data.eventsError` is true, mirroring the existing
Activity panel's own three-state handling.

## Testing

- `renderTermDensity`: bucketing correctness at each of the 5 relative levels
  (fabricate meetings producing known per-week totals), current-week marker
  placement, empty-meetings all-`·` case, multi-line-collapse regression guard (every
  other renderer in this file already has this exact test pattern).
- `renderMeetingsByLocation`: grouping correctness, sort order, `location: null`
  exclusion, empty-week case.
- Schedule hub/mode wiring: new menu options selectable, new modes render, any-key/Esc
  returns to hub (mirrors the exact test pattern already used for `'week'`/
  `'unresolved'` in `schedule.test.ts`).
- Home's combined grid: class-row/event-row correctness against fabricated cache +
  fabricated `Calendar.inRange` results, weekend-asymmetry case (event row shows an
  event on a Saturday, class row doesn't), loading/error fallback state.
- Home's unresolved-items line: shown/hidden based on fixture `unresolvedItems`
  length, matches existing `peekTodayLines`-style cache-only test pattern
  (`schedule-view.test.ts`'s established real-filesystem-fixture approach).
- Live pty verification against real cached timetable + real feed data, at both a
  normal and a tall terminal size, following this session's established methodology
  throughout every prior feature in this app.

## Out of scope

- Recoloring or otherwise touching the existing Events heatmap, week grid, or week
  strip — this spec only adds new views alongside them.
- Any change to the adaptive-density thresholds/mechanism itself (Part A/B/C/D of the
  immediately preceding round of work) — the new term-density/by-location modes are
  drill-down destinations, not candidates for the "show inline on a tall terminal"
  treatment (a personal decision left for a later, separate round if ever wanted).
- A "compare terms" or multi-term historical view — explicitly floated in
  conversation as a *possible* further dimension but not committed to here.

## Versioning

Prompt-side only; no `@nbtca/nbtcal` or `@nbtca/docs` changes required — all new data
needed is already exposed by the existing `Timetable`/`Calendar` surfaces.
