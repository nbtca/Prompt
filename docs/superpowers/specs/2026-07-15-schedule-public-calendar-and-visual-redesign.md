# Schedule: Public Calendar Entry + Auto Week-One + Visual Redesign

**Status:** Approved (design agreed in conversation)
**Date:** 2026-07-15
**Branch:** `feat/schedule` (Prompt)

## Goal

Schedule currently forces every visitor into a student-ID/password login before showing
anything at all, and after login it asks the student to manually type the term's "week one
Monday" from memory. Neither is acceptable: login should be optional (only needed for the
*personal* timetable), the school's public term/week status should be visible to anyone, and
"week one" should be derived automatically wherever possible instead of asked. Separately, the
post-login personal-timetable views should be redrawn in the same hand-drawn, ASCII-forward
visual language the rest of the app (Home's day-progress bar, Events' heatmap) already uses,
instead of the current plain list/table treatment.

This spec has three parts, meant to ship as two sequential implementation passes:

- **Part A — Public academic-calendar data** (foundation)
- **Part B — Entry-flow redesign** (consumes Part A)
- **Part C — Post-login visual redesign** (independent of A/B except for reusing the
  auto-derived week-one value; can ship second)

## Context / building blocks (already exist)

- `src/app/views/schedule.ts` / `schedule-render.ts` — the native Schedule view. `load()` →
  `refreshFromNetwork()` → `afterAuthenticated()` currently always ends in either
  `needsLoginId` (no session) or the personal hub (session present). There is no unauthenticated
  path today.
- `src/features/schedule-store.ts` — `loadWeekOne(termKey)` / `saveWeekOne(termKey, iso)`, plain
  JSON, `0600`. Currently the *only* source of week-one; filled exclusively via the
  `needsWeekOne` `TextField` prompt in `schedule.ts`.
- `@nbtca/nbtcal` (`/Users/m1ng/code/github/nbtca/nbtcal`) — `src/feed.ts` / `src/calendar.ts`
  already fetch and parse the public, unauthenticated ICS feed at `https://ical.nbtca.space`
  (a hand-maintained Google Calendar export; current maintainer `@LazuliKao`) via `ical.js`.
  `toCalendarEvent()` (`src/calendar.ts:5-21`) maps each `VEVENT` to `{ uid, title, start, end,
  isAllDay, location, description, recurring }`. `Calendar` (`src/query.ts`) exposes `upcoming`,
  `past`, `next`, `inRange`, `heatmap` — all pure date-range queries, no category/type filter.
  This is the exact same feed the Events tab already consumes (`loadCalendarOrThrow()` in
  `src/features/calendar.ts`).
- `src/app/views/home.ts` — `renderDayProgress(now)`, a 20-cell block bar
  (`████████████░░░░░░░░ 59%`) already used for "today's progress" on the Home screen. Part C
  reuses this exact visual language for a term-progress bar.
- `src/features/calendar-heatmap.ts` — precedent for hand-drawn, block-character TUI
  visualization of date-range data (used by Events).

## Part A — Public academic-calendar data

### Data source and convention

No new data file, no new feed, no per-year manual transcription in this repo. The club will add
**all-day, multi-day events titled exactly `寒假` or `暑假`** to the *existing* `ical.nbtca.space`
feed, spanning the winter/summer break date ranges — the same feed already used for club
activities. This was chosen over a dedicated repo-side JSON (rejected: someone would have to
re-transcribe the school's yearly calendar *image* — the school publishes no structured data —
every single year) and over an ICS `CATEGORIES`/title-prefix convention (rejected: the feed is
hand-edited via the Google Calendar UI by rotating club members with no schema enforcement;
"name the all-day event `寒假`/`暑假`" is what a maintainer would type anyway, zero new
training).

This convention was validated against the real 2026–2027 academic calendar (fetched from
`https://www.nbt.edu.cn/xysh/nlxl.htm`, the school's official published calendar images):

- Summer break ends Sun 2026-09-13 → next Monday 2026-09-14 = the school's own printed "开始上课"
  (classes begin) date for term 1. ✓
- Winter break ends Sun 2027-02-28 → next Monday 2027-03-01 = the school's own printed "开始上课"
  date for term 2. ✓

**As of this writing the feed has no `寒假`/`暑假` events yet** — the club maintainer confirmed
this data isn't populated. Part A must therefore degrade gracefully (see below) and start
working automatically the moment the feed is populated, with no code changes required.

### Deriving the current term label and week number without login

The no-login public view (Part B) needs more than a single week-one date — it needs to label
*which* term `now` falls in and count the current week, with no JWXT session to ask. Both come
from the same break-event data: two consecutive `寒假`/`暑假` events bound a term window
(`end` of one break → `start` of the next); `now` falling inside that window identifies the
active term. The academic-year label (`2026–2027学年`) is the calendar-year pair the window
starts/ends in; whether it's "第一学期" or "第二学期" is a fixed rule (a window starting after
`暑假` ends in autumn is term 1; a window starting after `寒假` ends in spring is term 2) — not
guessed per year. If `now` falls inside a break itself (no bounding term window is "current"),
the public view shows the *upcoming* term's label and a "还没开学" state instead of a week
number.

### Derivation rule

```
weekOneMonday(term, now) =
  latest 寒假/暑假 event (by title, isAllDay, multi-day) whose `end` is
    on or before the term's known/assumed start window
  → the Monday on or immediately after that event's `end`
```

New pure function in `@nbtca/nbtcal` (or `Prompt/src/features/schedule-query.ts` if it's judged
too timetable-specific to belong in nbtcal — implementer's call, follow existing precedent for
where similar pure date logic already lives):

```ts
function inferWeekOneMonday(events: CalendarEvent[], termWindow: { after: Date }): Date | null
```

Returns `null` (not a thrown error) when no matching break event is found — this is the normal,
expected state today, not a bug.

### Fallback behavior

- Login flow calls `inferWeekOneMonday()` after fetching the term catalog. If it returns a date,
  save it via `saveWeekOne(termKey, iso)` exactly as if the user had typed it, and skip the
  `needsWeekOne` prompt entirely — the student never sees it.
- If it returns `null`, fall back to today's exact `needsWeekOne` `TextField` prompt, with the
  hint text changed to explain *why* ("无法从校历自动推算学期第一周，请手动确认一次" instead of
  today's generic hint) so it reads as a fallback, not the default flow.
- Once a value is saved (auto or manual) it is cached per `termKey` exactly as today — this
  logic only runs once per term either way.

## Part B — Entry-flow redesign

### Default (no-login) view

Entering the Schedule tab with no active session shows a **public status view** instead of
demanding login:

- Current academic year + term + current teaching week (computed from the same `寒假`/`暑假`
  break data as Part A, applied to "which term window contains `now`", not tied to any
  individual's JWXT account).
- A term-progress bar in the Home day-progress visual language (see mockup below).
- Countdown(s) to the next break / next term start.
- A short list of upcoming calendar events from the same public feed (reusing
  `renderEventBrief` from `src/features/calendar.ts`, already built for Events' briefing) —
  whatever the feed has, not gated on being a `寒假`/`暑假` event specifically.
- A hub menu with an explicit **"登录查看我的课表"** action (this is what triggers
  `needsLoginId` today) plus any actions that don't require a session (nothing today; export
  requires personal data).

When the public feed itself can't be loaded (network error, same as Events' existing error
path), fall back to a minimal message — never block on it; login must still be reachable.

### Session-aware entry

- If a valid session is already restorable (the existing `refreshFromNetwork` path), skip the
  public view and go straight to the personal hub — this is today's "cached hub shows
  immediately, refreshes in background" behavior, unchanged.
- Logging out (`hubLogout` today) returns to the public view, not to a bare login prompt.

### Mockup (agreed in conversation)

```
nbtca
Home  ·  [Schedule]  ·  Events  ·  Docs  ·  设置
──────────────────────────────────────────────────────

  2026–2027学年 · 第一学期 · 第 7 周

  ▪▪▪▪▪▪▪████████████████░░░░░░░░░░░░░░░░░░  7/18周

  → 距离国庆假期还有 3 天
  → 距离期末考试周还有 11 周

  校历
  · 10月1日   国庆节放假（7天）
  · 10月29日  校运动会

  ──────────────────────────
  ▸ 登录查看我的课表
  ▸ 导出我的课表 (.ics)          [需要登录]
  ──────────────────────────

──────────────────────────────────────────────────────
1-7 / Tab 移动 · 打开 · Esc/q 退出
```

Items requiring a session (export today) stay visible but visually marked `[需要登录]` rather
than hidden, so the menu communicates what login unlocks instead of the student having to
discover it by trial.

## Part C — Post-login visual redesign

Reuses all existing data plumbing (`Timetable`, `schedule-query.ts`, `schedule-store.ts`)
unchanged. Only the rendering in `schedule-render.ts` changes.

### Today's classes: timeline instead of a list

Replace the current flat "today's classes" list with a vertical timeline that marks the
in-progress class distinctly (`▶` marker + remaining-minutes countdown, reusing the same
countdown math `renderNextClassBanner`/`isCountdownUrgent` already compute elsewhere) and
visually dims finished classes:

```
  今日 · 周三 · 第7教学周

  08:00 ─┬─ 高等数学Ⅱ            已结束
  09:50 ─┼─ 大学物理             已结束
  ▶13:30 ─┼─ 数据结构            进行中 · 还剩 25 分钟   教1-302
  15:20 ─┴─ 无
```

### Week summary: block strip instead of a full grid-per-default

The hub's default view shows a compact one-line-per-day block strip (▓ = has class, ░ = free,
· = weekend) instead of jumping straight to the dense weekday×period grid; the existing full
grid (`renderWeekGrid`) becomes the destination of the hub's "本周课表" action, unchanged in its
own internals — this is purely about what the hub shows *before* drilling in:

```
  本周
  一  二  三  四  五  六  日
  ░░  ░░  ▓▓  ░░  ░░  ··  ··     ▓ = 有课  ░ = 空  · = 周末
```

### Hub menu

Unchanged set of actions (本周课表 / 切换学期 / 导出 / 退出登录 / ⚠ 待确认项), restyled to sit
under the new timeline + week-strip rather than being the first thing shown.

## Data flow (Part A + B)

`ical.nbtca.space` feed (public, no auth) → `inferWeekOneMonday()` → either silently saved via
`saveWeekOne` or falls back to the manual prompt. Public status view reads the same feed via the
existing `Calendar`/`CalendarEvent` query surface Events already uses — no new feed, no new
client. Personal hub (Part C) is unchanged data-wise: JWXT `client.listTerms()`/`fetchTerm()`
behind login, as today.

## Error handling

- Public feed unreachable → public view shows a minimal fallback, login remains reachable
  (never a dead end — this mirrors the fix already shipped in commit `baea62a` for the
  session-expired dead-end).
- No `寒假`/`暑假` events found for the relevant window → `null` from `inferWeekOneMonday`,
  fall back to manual prompt (expected, not an error).
- Personal-hub errors (auth/network/session-expired) unchanged from current behavior.

## Security

No change. Public feed is already unauthenticated and non-personal. Week-one Monday remains
non-sensitive, `0600`, per-term cached data regardless of whether it was typed or inferred.

## Testing

- Part A: `inferWeekOneMonday()` — unit tests against fabricated `寒假`/`暑假` events (both
  terms' real 2026–2027 boundaries as fixtures, matching the validation above), no matching
  event → `null`, event present but its own year doesn't cover `now` → `null`, multiple
  candidate break events → picks the correct (latest-before-window) one.
  `schedule.ts`'s login flow — mocked-feed tests (same pattern as the `afterAuthenticated`
  session-expiry regression tests added in `schedule.test.ts`) for: inferred value skips
  `needsWeekOne`; `null` still shows the (reworded) manual prompt.
- Part B: `renderSchedule` new "public" mode — pure render tests (loading/empty-feed/populated),
  live pty verification of the no-login default view and the `登录查看我的课表` → existing
  `needsLoginId` handoff.
- Part C: `renderTodayClasses`/new week-strip renderer — pure render tests for in-progress vs.
  finished class marking, empty-day case, weekend handling in the strip; live pty verification
  against real (or realistically fabricated) `Timetable` data, checking the
  multi-line-collapse regression pattern (`for (const line of lines) expect(line).not.toContain
  ('\n')`) established earlier in this codebase's history for every new renderer added here.

## Out of scope

- Any new data source or file format for the academic calendar beyond the `寒假`/`暑假`
  convention on the existing feed — no repo-side yearly transcription tooling.
- GitHub-login-based "NBTCA activity" module (mentioned in conversation as a future,
  separate feature).
- Reminders/notifications for upcoming breaks/classes.
- Multi-account / non-NBT-campus timetable sources.

## Versioning

Prompt-side feature; Part A's `inferWeekOneMonday` may land in `@nbtca/nbtcal` (published
separately) or in `Prompt/src/features/schedule-query.ts` — implementer decides based on where
`CalendarEvent`-consuming pure logic already lives at plan-writing time.
