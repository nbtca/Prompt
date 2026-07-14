# App-Shell TUI — Design (Phase B: native migration)

**Status:** Approved (design agreed in conversation)
**Date:** 2026-07-14
**Branch:** `feat/schedule` (the consolidated Prompt branch).

## Goal

Phase A (merged) gave the app a polished, persistent-chrome, alt-screen Home dashboard,
but Schedule / Docs / Events / Settings are still reached through a "classic bridge":
switching to any of them leaves the alt-screen, runs the old `console.log` + blocking
`runMenu` loop, then re-enters and returns to Home. Every tab switch or in-surface action
blinks the whole screen out and back — the exact kind of rough edge that makes a TUI feel
unfinished even when every feature works. Phase B migrates all four into native,
in-place-redrawn `View`s so the app never leaves the alt-screen except for one deliberate,
scoped case (reading a full markdown doc via glow/less).

This phase is grounded in a live probe against the real JWXT timetable (one-shot login,
nothing persisted) run during design, which confirmed the existing week-one-Monday design
and also found a real, currently-shipping bug: `Timetable.unresolvedItems` (e.g. a
`大学生体能测试Ⅰ` practice record with no fixed weekday) is computed by nbtcal and counted
in CLI export warnings, but the interactive Schedule hub never displays it — a student
today has no way to discover it exists short of running `nbtca schedule export` and
reading stderr.

## Shared building blocks (new)

Both blocking widgets already separate pure state/render logic from their blocking
stdin-listener wrapper (`renderMenu`/`nextIndex`/`parseKey` inside `runMenu`;
`renderInput`/`applyInputEvent`/`parseInputData` inside `runTextInput`). Phase B reuses
that pure logic as-is and adds thin **non-blocking** adapters that plug into the app
loop's single `stdin.on('data')` listener instead of attaching their own:

- **`app/fields/list-field.ts`**: `createListField(config) → { render(): string; handleKey(key): { selected?: string; cancelled?: boolean } }`. Holds `selectedIndex` internally; `handleKey` calls the existing `parseKey`/`nextIndex`.
- **`app/fields/text-field.ts`**: same shape around `renderInput`/`applyInputEvent`/`parseInputData`; covers plain text (week-one date, export path) and secret (student id/password, `secret: true`).
- **`chrome.ts`** exports `HEADER_LINES = 3` and `FOOTER_LINES = 2` (matching `renderHeader`/`renderFooter`'s current fixed line counts).
- **`AppContext`** gains `bodyRows: number` (`size.rows - HEADER_LINES - FOOTER_LINES`, floored at 0) so a view can size its own list or scroll region without duplicating the chrome's layout math.

No new dependency; no change to the pure widgets' existing tests or their still-used
blocking call sites (`showAbout`'s `note`, any surface not yet migrated).

## Per-view design

Each view is a `mode`-based state machine (module-level state, like `homeView`'s `data`),
composed from the shared fields plus the feature module's existing pure renderers
(`renderTodayClasses`, `renderWeekGrid`, `renderEventsTable`, …) and pure query/store
functions (`currentWeekNumber`, `meetingsOnDay`, …) — those are unchanged. Only the
interactive *shell* around them moves from blocking `runMenu` loops to `render()`/
`handleKey()`.

**A view keeps its last `mode` when the user tabs away and back** (like lazygit/k9s
per-tab state), rather than resetting to the top level — `load()` re-runs on re-entry to
refresh cache-backed data (session/timetable may have changed), but does not reset `mode`.

### `views/schedule.ts`

Modes: `loading` → `needsLogin` (id field → password field, mirrors `interactiveLogin`) →
`needsWeekOne` (date text field, mirrors `ensureWeekOne`) → `hub` (action list: 今日 / 本周
网格 / 切换学期 / 导出 / **待处理事项** / 退出登录) → `week` (grid) → `termPicker` (list).

Two concrete fixes land here:
- **Unresolved items are surfaced.** The hub action list gets a `待处理事项` row with a
  count badge whenever `timetable.unresolvedItems.length > 0`; selecting it shows each
  item's raw source fields (course name, week/description text) — nbtcal already carries
  this data (`sourceFields.kcmc`, `sjkcgs`, etc.), it just wasn't rendered anywhere
  interactive.
- **The week grid marks real breaks.** `renderWeekGrid` gets an optional gap marker: when
  the gap between one period's `end` and the next period's `start` exceeds 30 minutes (the
  probed data has a 75min lunch gap and a 95min dinner gap), a dim separator row is
  inserted between them, so the grid reads as "these are actually far apart" instead of
  implying back-to-back periods.

Auth/session logic (`withAuthenticatedSession`, `loginWithStudentPassword`,
`restoreNbtSession`) is unchanged — only the calling shell becomes non-blocking.

### `views/docs.ts`

Modes: `sections` (list) → `files` / `archived` (list, existing grouping logic from
`buildSections`/`getArchivedGroups` reused as-is) → `search` (text field → results list).
All native list navigation.

Opening a file is the **one deliberate exception**: the view calls
`ctx.runClassic(() => viewMarkdownFile(path))` itself (not the app-level `classicFor`
table), so glow/less still take over the terminal for that single action — consistent with
how lazygit drops to `$EDITOR`. On return, the view stays in `files`/`search` mode at the
same list position, not back at Home. `openDocsInBrowser` (fire-and-forget `open()`) needs
no bridge — it doesn't take over the terminal.

### `views/events.ts`

Modes: `hub` (countdown banner + heatmap + action list: 即将开始 / 本周 / 本月 / 搜索 / 已结束)
→ `list` → `detail` (+ 导出 .ics) → `search` (text field). Reuses `renderEventsTable`,
`renderCountdownBanner`, `renderHeatmap`, `filterEvents`, `exportEventIcs` unchanged.

### `views/settings.ts`

Modes: `menu` (action list: 语言 / 图标 / 颜色 / 重置 / 关于) → sub-lists for each → `about`
(static panel, reuses the existing content builder). No child processes, no bridge at all
— the simplest of the four.

## App shell changes

`app.ts`'s `classicFor` map is removed once all four are native (Docs keeps its own
internal, scoped `runClassic` call for file-reading only, invoked from inside
`views/docs.ts`, not from the app-level table). `switchTo` no longer suspends/resumes for
these tabs. The tab list and global key routing (`routeGlobalKey`, digits/Tab/Esc/q) are
unchanged.

## Data flow

Unchanged from Phase A: views fetch in `load()` (best-effort, cache-first where a cache
exists — e.g. Schedule's cached timetable) and call `ctx.rerender()` on arrival; pure
renderers/query functions are untouched; only the interactive shell moves from blocking
`runMenu`/`runTextInput` loops to `render()`/`handleKey()` state machines.

## Error handling

Reuses each feature's existing sanitized error mapping (`safeMessage`/`safeErrorMessage`
for auth/timetable errors). Since a view can no longer `console.error` inside the
alt-screen frame, errors become an inline line in the view's own `render()` output
(mirroring how Home already shows a placeholder instead of crashing on a failed panel
load) rather than a separate `error()`/`warning()` call.

## Testing

- Pure: `list-field`/`text-field` state transitions (mirrors existing `nextIndex`/
  `applyInputEvent` tests), `HEADER_LINES`/`FOOTER_LINES`/`bodyRows` arithmetic, each
  view's `mode` reducer given fixed input (login → hub, hub → week, unresolved-items
  badge presence, gap-marker insertion in the grid, docs section → file → search
  transitions, settings sub-list round trips).
- Integration: live-launch check per view (tab in, navigate, trigger the one Docs bridge
  action and confirm return-to-same-list, tab out and back and confirm mode persisted,
  resize, q restores the terminal) — matching how Phase A's app loop was verified.
- Existing pure-renderer tests (`schedule-render.test.ts`, `calendar.test.ts`, etc.) are
  unchanged; CLI command mode (`nbtca schedule export`, `nbtca events`, …) is untouched.

## Out of scope

- Mouse support, panel/side-by-side layouts (still Phase C per the original app-shell
  spec).
- An in-app markdown reader/pager — glow/less stay for full-document reading (see Docs
  design above); revisit only if that scoped bridge itself becomes a UX complaint.
- Any change to nbtcal or @nbtca/docs — both already provide everything these views need
  (confirmed against real timetable data during design); this phase is Prompt-only.

## Compatibility

Additive within `src/app/` and `src/features/*.ts`; non-interactive CLI command mode
(`src/index.ts`) is untouched. Once all four views are native, the classic
`showSchedule`/`showCalendar`/`showDocsMenu`/`showSettingsMenu` functions become dead code
for the interactive app path but stay as the CLI's non-TTY-adjacent fallback surfaces
(`showMainMenu` path) and are not deleted in this phase.
