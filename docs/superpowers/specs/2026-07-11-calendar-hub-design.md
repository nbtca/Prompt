# Full-Feature Calendar Hub — Design (nbtcal `.ics` export + Prompt CLI hub)

**Status:** Approved structure, detailing components
**Date:** 2026-07-11
**Scope:** Two coordinated sub-projects — (1) add `.ics` serialization to the `@nbtca/nbtcal` library; (2) build a full-feature "calendar hub" in the Prompt CLI that fully uses nbtcal's query surface (`next`, `inRange`, `recurring`) plus the new export.

## Motivation

The Prompt CLI uses only `upcoming`/`past`/`heatmap` from nbtcal and ignores `next()`, `inRange()`, the `recurring` flag, and `uid`. The goal is a "全功能" calendar: a countdown to the next event, browsable week/month/range views, recurring-event markers, keyword search, and single-event `.ics` export. `.ics` serialization is a data-layer concern, so it lands in nbtcal (which already owns ICS parsing); everything else is CLI presentation on top of the existing library API.

## Sub-project 1 — nbtcal: `.ics` serialization

**Repo:** `/Users/m1ng/code/github/nbtca/nbtcal` (sibling; separate spec→plan→release cycle).

**New module `src/serialize.ts`:**
- `eventToICS(event: CalendarEvent, options?: { prodId?: string; now?: Date }): string` — returns a complete, valid `VCALENDAR` wrapping one `VEVENT`.
- Produces RFC 5545-compliant output:
  - `BEGIN:VCALENDAR` / `VERSION:2.0` / `PRODID:-//nbtca//nbtcal//EN` / `CALSCALE:GREGORIAN` / `METHOD:PUBLISH` … `END:VCALENDAR`.
  - `VEVENT` with `UID` (event.uid), `DTSTAMP` (options.now ?? new Date, UTC), `DTSTART`/`DTEND`, `SUMMARY` (title), `LOCATION`, `DESCRIPTION`.
  - **Timed events:** `DTSTART:YYYYMMDDTHHMMSSZ` (UTC). If `end` is null, omit `DTEND`.
  - **All-day events** (`isAllDay`): `DTSTART;VALUE=DATE:YYYYMMDD` using the event's local date; `DTEND;VALUE=DATE:` = day after start (RFC exclusive-end convention) or the given end.
  - **Text escaping** (RFC 5545 §3.3.11): backslash, comma, semicolon → `\\`,`\,`,`\;`; newlines → `\n`. Applied to SUMMARY/LOCATION/DESCRIPTION.
  - **Line folding** (§3.1): fold lines longer than 75 octets with `\r\n ` (CRLF + space). All line endings are CRLF.
  - Null `title`/`location`/`description` → those properties omitted.
- Export `eventToICS` from `src/index.ts`.

**Tests (`src/serialize.test.ts`):** valid envelope + required props; timed vs all-day formatting; escaping of special chars; long-line folding at 75 octets; null-field omission; a round-trip sanity check (feed the output through `parseCalendar` and assert the event survives).

**Release:** bump nbtcal to `0.4.0` (additive). The Prompt CLI consumes it via a local build during the working branch (`npm install ../nbtcal`); pinning the published `^0.4.0` version is a release step.

## Sub-project 2 — Prompt CLI: the calendar hub

**Architecture:** split the growing `features/calendar.ts` by responsibility (it will exceed 400 lines with these features), following the existing `calendar` + `calendar-heatmap` sibling pattern:

- **`features/calendar-query.ts`** (pure data/math, fully testable): `toDisplayEvent` (now carries `recurring` and `uid`), `fetchEvents`, `fetchHeatmapBuckets`, `serializeEvents` (adds `recurring`/`uid` to JSON — additive), `weekRange(now)`, `monthRange(now)`, `filterEvents(events, query)` (case-insensitive title/location match), `formatCountdown(target, now)` (`in 3d 4h` / `in 2h 15m` / `starting now` / `in progress`).
  - **Range semantics (pinned):** `weekRange(now)` = Monday 00:00 of the current week → the following Monday 00:00 (Mon-start calendar week, local time). `monthRange(now)` = 1st of the current month 00:00 → 1st of next month 00:00 (local time). Both return `{ start: Date, end: Date }` with an exclusive end, passed straight to `cal.inRange(start, end)`.
- **`features/calendar-render.ts`** (pure render): `renderEventsTable` (moved here; adds a `↻` marker column for `recurring`, `pickIcon('↻','~')`), `renderCountdownBanner(event, now)`, event-detail lines.
- **`features/calendar.ts`** (interactive surface): the hub + views + detail + export. Re-exports `fetchEvents`, `fetchHeatmapBuckets`, `renderEventsTable`, `serializeEvents`, `showEventsPreview`, `showCalendar` so `index.ts`/`menu.ts` imports are unchanged.

**Hub flow (`showCalendar`):**
1. `enterScreen(breadcrumb(events))` (Phase-3 transition).
2. Countdown banner from `cal.next(1)` (or the first upcoming), via `renderCountdownBanner`.
3. Heatmap (kept).
4. `runMenu`: `Upcoming · This Week · This Month · Search · Past · Subscribe` (+ Back).
5. Each view fetches the relevant `CalendarEvent[]` (`upcoming` / `inRange(weekRange)` / `inRange(monthRange)` / `filterEvents(upcoming-wide, query)` / `past`), renders the table (recurring marked), then a `runMenu` of events → **event detail**.
6. **Event detail**: title, date/time, location, `↻ recurring` line when applicable, description; a `runMenu`: `Export .ics · Back`.
7. **Export**: `eventToICS(rawEvent)` → write to `process.cwd()/<safe-title>.ics` → success message with the path (`success(...)`), graceful error on write failure. The hub keeps the raw `CalendarEvent[]` (with `uid`) so export has full fidelity.

**Search:** `runTextInput` for the keyword (null-safe), then `filterEvents` over a wide upcoming window (e.g. `inRange(now, now+365d)`); empty result → the Phase-3 quiet empty state.

**CLI (non-interactive) additions to the `events` command** (read-only, degrade like existing flags, JSON-able): `--week`, `--month` (via `inRange`), `--search=<q>` (via `filterEvents`). `--next=<n>`/`--today`/`--heatmap`/`--json`/`--plain` unchanged. Export stays interactive-only (writing files from a flag is out of scope). `serializeEvents` JSON gains `recurring`/`uid` (additive).

## Data Flow

`loadCalendar()` → `Calendar` → query (`upcoming`/`next`/`inRange`/`past`) → `CalendarEvent[]` → `toDisplayEvent` (adds `recurring`, keeps `uid`) → render (table/countdown/detail). Export path: selected raw `CalendarEvent` → nbtcal `eventToICS` → file write. Non-interactive CLI paths reuse the pure query/render/serialize functions with `color`/`plain` flags exactly as today.

## Error Handling

- Feed errors (`FeedFetchError`/`FeedParseError`) keep the existing spinner-error + hint flow.
- Export file-write errors → `error(...)` with the attempted path; never throw out of the hub.
- Empty search/range → quiet empty state (Phase-3 `type.hint`), not an error.
- All new interactive widgets already degrade under non-TTY/reduced-motion (Phases 1–3).

## Testing

- **nbtcal:** `serialize.test.ts` as above.
- **CLI pure units:** `formatCountdown` (deltas incl. past/now/in-progress), `weekRange`/`monthRange` (boundaries, week start), `filterEvents` (match/no-match/case), `toDisplayEvent` (carries `recurring`/`uid`), `renderEventsTable` (shows `↻` for recurring, absent otherwise), `renderCountdownBanner`, `serializeEvents` (includes new fields).
- **CLI integration:** existing `scripts/test-cli.sh` + `events --week/--month/--search` produce output; JSON shape additive.
- **Interactive hub:** live end-to-end verification (countdown → each view → detail → export writes a valid `.ics`).

## Out of Scope / Non-Goals

- Reminders/notifications/persistence (stateful, a CLI can't notify when not running).
- A full ASCII month *grid* (range list views cover month browsing; a grid is deferred).
- Editing/creating events (the feed is read-only).
- Multi-event bulk export (single-event export only for now).

## Compatibility

- nbtcal change is additive (`eventToICS` new export; no breaking changes) → `0.4.0`.
- CLI: existing `events` flags and JSON output unchanged except additive `recurring`/`uid` fields; interactive calendar re-exports keep `index.ts`/`menu.ts` working; all new motion degrades gracefully.

## Cross-Repo Sequencing

1. nbtcal `eventToICS` (Sub-project 1) — implement, test, build, bump `0.4.0`.
2. Prompt CLI: install local nbtcal build, then build the hub (Sub-project 2).
3. Release coordination (publish nbtcal `0.4.0`, pin `^0.4.0` in the CLI) — flagged, done at release time, not part of the feature branches.
