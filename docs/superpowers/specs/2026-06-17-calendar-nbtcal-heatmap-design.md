# @nbtca/prompt — Calendar via @nbtca/nbtcal + Activity Heatmap (Design)

**Date:** 2026-06-17
**Status:** Approved (pending spec review)

## Summary

Two coupled changes to `@nbtca/prompt`'s calendar feature:

1. **Swap the data layer** to `@nbtca/nbtcal`. `fetchEvents()` currently inlines
   ICS fetch + parse and reads `event.startDate` once, silently dropping
   recurring (`RRULE`) events. The real feed (`ical.nbtca.space`) has 130 events,
   34 of them recurring, so this is a real correctness gap. nbtcal owns
   fetch/parse/recurrence; prompt keeps its presentation.
2. **Add a trailing-12-month activity heatmap** (GitHub-contributions style)
   rendered in the terminal, available via `nbtca events --heatmap` and shown as
   a header above the upcoming-events table in the interactive calendar view.

prompt stays the presentation layer; nbtcal stays the data layer.

## Decisions

- Scope: both changes in one effort, sequenced (swap first, then heatmap).
- Heatmap range: trailing 12 months (`now − 365d … now`), weekday rows × week
  columns.
- Surface: `events --heatmap` CLI flag **and** auto header in the interactive
  calendar view.
- Testing: introduce `vitest` for the new pure logic; keep the build + bash CLI
  smoke test.

## Architecture & module layout

`src/features/calendar.ts` mixes data and presentation and would grow with the
heatmap, so split by responsibility (matching prompt's flat `features/*.ts`):

- **`src/features/calendar.ts`** — data + existing renderers.
  - `fetchEvents()` keeps its signature (`Promise<Event[]>`) but is backed by
    nbtcal.
  - New `toDisplayEvent(e: CalendarEvent): Event` maps nbtcal's raw event to
    prompt's `Event` (date/time formatting + i18n "Untitled"/"TBD" fallbacks).
  - `renderEventsTable`, `showEventDetail`, `serializeEvents`, the `Event` /
    `EventOutputItem` types — unchanged.
  - `showCalendar()` gains a heatmap header above the table.
- **`src/features/calendar-heatmap.ts`** (new) — pure rendering:
  `renderHeatmap(buckets: HeatmapBucket[], today: Date, options?: { color?: boolean }): string`.

`ical.js` is removed from prompt's direct dependencies (only `calendar.ts` used
it); it arrives transitively through nbtcal.

## Data flow (one fetch per view)

`@nbtca/nbtcal`'s `loadCalendar()` returns a `Calendar` exposing both
`.upcoming()` and `.heatmap()`, so each view fetches the feed once and derives
both outputs:

- **Table / CLI:** `cal.upcoming({ days: 30 }).map(toDisplayEvent)` — now
  includes recurring occurrences.
- **Heatmap:** `cal.heatmap({ start: now − 365d, end: now, bucket: 'day' })`
  returns dense daily buckets → `renderHeatmap`.

A small helper centralizes loading + prompt-style error wrapping:

```ts
async function loadCalendarOrThrow(): Promise<Calendar> {
  try {
    return await loadCalendar();
  } catch (err) {
    const detail = err instanceof FeedFetchError || err instanceof FeedParseError
      ? err.message
      : String(err);
    throw new Error(`${t().calendar.error}: ${detail}`);
  }
}
```

`fetchEvents()` = `(await loadCalendarOrThrow()).upcoming({ days: 30 }).map(toDisplayEvent)`.
`showCalendar()` and the `--heatmap` CLI path call `loadCalendarOrThrow()` once
and use both `.upcoming()` and `.heatmap()`.

### Event mapping

```ts
function toDisplayEvent(e: CalendarEvent): Event {
  const trans = t();
  return {
    date: formatDate(e.start),
    time: e.isAllDay ? '' : formatTime(e.start),
    title: e.title || trans.calendar.untitledEvent,
    location: e.location || trans.calendar.tbdLocation,
    description: e.description || '',
    startDate: e.start,
  };
}
```

`formatDate` / `formatTime` are the existing helpers (kept). All-day events get
an empty `time`. The events table keeps prompt's current **local-time**
formatting (unchanged behavior); only the heatmap buckets in Asia/Shanghai
(nbtcal's default). For China users these coincide.

## Heatmap renderer

`renderHeatmap(buckets, today, { color })` lays the dense daily buckets into a
GitHub-style grid:

- **Grid:** 7 weekday rows (Mon…Sun), Monday-started week columns, ~53 columns
  for a trailing year. Leading/trailing cells outside the window render as blank
  padding so weekday alignment is correct.
- **Intensity (deterministic, testable):** fixed thresholds
  `0 → ·`, `1 → ░`, `2 → ▒`, `3 → ▓`, `≥4 → █`. With color on, a chalk green
  ramp is applied to the same cells.
- **Labels:** month abbreviations along the top via `Intl.DateTimeFormat`
  (auto-localized by current language); weekday labels Mon/Wed/Fri only (GitHub
  style); a `legendLess ░▒▓█ legendMore` legend line.
- **Theme:** glyphs go through `pickIcon` (ASCII fallback `.:-=#`); color honors
  `--plain` / the color-mode preference (same mechanism the tables use).
- **Empty feed:** all-zero buckets render as a full grid of `·`.

Input is nbtcal's dense `HeatmapBucket[]` (`{ date: 'YYYY-MM-DD', count }`),
already gap-filled, so the renderer only arranges and styles. It derives each
bucket's weekday/month by parsing the `date` string as a **civil date via a UTC
proxy** (`new Date(Date.UTC(y, m - 1, d))` + `getUTC*`), so the grid layout is
host-timezone-independent — the same approach nbtcal uses internally.

## CLI & interactive wiring

`src/index.ts`:

- Add `--heatmap` to `KNOWN_FLAGS` and to the `events` allowed flags
  (`getAllowedFlagsFor`).
- `runEventsCommand`: when `--heatmap` is present, load the calendar, build
  trailing-year buckets, and:
  - `--json` → `process.stdout.write(JSON.stringify(buckets, null, 2))`,
  - otherwise → `renderHeatmap(buckets, new Date(), { color })` where
    `color = !--plain && stdout.isTTY`.
  `--heatmap` takes precedence over `--today` / `--next=` (those filter the
  table, not the heatmap).
- Add a `--heatmap` line to `printHelp()`.

`showCalendar()` (interactive): render the heatmap header, then the existing
upcoming-events table and detail picker. Both come from one
`loadCalendarOrThrow()`.

## i18n

Add a `calendar.heatmap` block to `src/i18n/locales/en.json` and `zh.json`, and
to the `Translations` interface:

```jsonc
"heatmap": {
  "title": "Activity (last 12 months)",   // zh: 近一年活跃度
  "legendLess": "Less",                    // zh: 少
  "legendMore": "More"                     // zh: 多
}
```

Month and weekday labels come from `Intl.DateTimeFormat` using the current
language, so no per-name keys are needed.

## Dependencies

- `package.json`: add `@nbtca/nbtcal: ^0.2.0` to `dependencies`; remove
  `ical.js`; add `vitest` to `devDependencies`.
- `test` script runs vitest alongside the existing build + CLI smoke test, e.g.
  `npm run build && vitest run && bash scripts/test-cli.sh`.

## Testing (vitest)

Pure-logic unit tests (set language explicitly so i18n fallbacks are
deterministic):

- **`toDisplayEvent`:** null `title`/`location` → i18n fallback strings; a
  same-year date omits the year while a different-year date includes it; an
  all-day event yields empty `time`; `startDate` is passed through unchanged.
- **`renderHeatmap`:** correct row/column counts for a known window; threshold →
  glyph mapping (`0·1░2▒3▓4█`); ASCII mode vs Unicode mode (via the icon
  preference); legend line present; an all-zero bucket set renders a full grid
  of `·` without throwing.

The bash CLI smoke test (`scripts/test-cli.sh`) gains a check that
`events --heatmap` runs and produces output.

## Out of scope

- Changing the events table's time zone / formatting.
- `nbtca.space/calendar` (web) reuse of nbtcal — separate effort.
- Heatmap interactivity (drilling into a day) — render-only for now (YAGNI).

## Risks / notes

- Recurring events with no `UNTIL`/`COUNT` are expanded across the trailing year;
  nbtcal bounds this by the query window. With 34 recurring events the cost is
  small.
- The feed contains a `19700101` placeholder event and a few far-future ones;
  both fall outside the trailing-year window and are naturally excluded.
