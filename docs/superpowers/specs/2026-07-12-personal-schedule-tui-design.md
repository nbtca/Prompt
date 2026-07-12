# Personal Schedule TUI — Design

**Status:** Approved (design agreed in conversation)
**Date:** 2026-07-12
**Branch:** `feat/schedule` (Prompt); consumes published-later `@nbtca/nbtcal@0.4.0` `/timetable`.

## Goal

Bring the student timetable into the interactive Quiet-Precision TUI: a personalized post-login "课表" hub with today's classes, a next-class countdown, a weekly grid, and in-TUI login / term-switch / export — plus a personalized startup line.

## Context / building blocks (already exist)

- **nbtcal `/timetable`**: `createNbtTimetableClient(transport,{baseUrl})` → `{ listTerms(), fetchTerm(termRef), fetchTerms() }`; `Timetable = { term, meetings, periods, calendarDays, warnings, fetchedAt }`; `TimetableMeeting = { courseName, teacherNames[], location, weekday(1-7), startPeriod, endPeriod, weeks[], kind }`; `TimetablePeriod = { period, label, start:"HH:MM", end:"HH:MM" }`; `timetableToIcs`.
- **Prompt `src/auth/`**: `loginWithStudentPassword`, `restoreNbtSession`, session-store (session-only, no password), `session.timetableTransport`.
- **Prompt `src/features/student-timetable.ts`**: CLI flow + `interactiveLogin`, `withAuthenticatedSession`, `resolveTerm`, `writePrivateIcs`.
- **Widgets/tokens**: `runMenu`/`menuFooter`, `runTextInput`/`runSecretInput`, `enterScreen`/`breadcrumb`, `Screen`, `type`/`space`/`glyph`/`pickIcon`, `countdownParts` (from `calendar-query.ts`), `createSpinner`, `success`/`error`.

## The week-number crux (key decision)

The campus response for this account has **no calendar date map** (`calendarDays=[]`). So mapping "today → which classes" needs the **semester week-1 Monday**. Design: **prompt once (interactive `runTextInput`, `YYYY-MM-DD`), persist per term** in a small non-sensitive config store (separate from the session; `0600`). CLI's `--week-one=` reuses the same value. All week/today/next-class logic derives from it:

- `currentWeekNumber(weekOneMonday, now)` = `floor((now − weekOneMonday)/7d) + 1`.
- Today's classes = meetings with `weekday === todayWeekday` and `weeks.includes(currentWeek)`.
- A period's real datetime = weekOneMonday + (week−1)·7d + (weekday−1)d + `period.start` "HH:MM".

## Components

- **`features/schedule-query.ts`** (pure, tested): `currentWeekNumber`, `meetingsOnDay`, `meetingsInWeek`, `periodStartDate`, `nextMeeting(meetings,periods,weekOneMonday,now)→{meeting,start}|null`, `groupByPeriod` for the grid.
- **`features/schedule-render.ts`** (pure, tested, tokens only): `renderTodayClasses(meetings,periods,now,currentWeek,todayWeekday)`, `renderNextClassBanner(next,now)` (reuse `countdownParts`), `renderWeekGrid(meetings,periods,weekNumber,now)` (weekday×period grid, CJK-aware widths via `visualWidth`/`padEndV`, current cell marked, ascii fallbacks).
- **`auth/week-one-store.ts`** (or fold into a small config): `loadWeekOne(termKey)` / `saveWeekOne(termKey, iso)`; JSON in state dir, `0600`.
- **`features/timetable-cache.ts`**: `saveTimetable(termKey, timetable)` / `loadTimetable(termKey)` — local cache (personal data, `0600`) so the personalized startup line reads offline (no network at launch).
- **`features/schedule-view.ts`** (interactive hub `showSchedule()`): enterScreen(breadcrumb) → restore session or `interactiveLogin` → `listTerms`/resolve current → load-or-prompt week-one → `fetchTerm` (spinner) → cache it → show next-class banner + today's classes → `runMenu`: 今日 / 本周网格 / 全部课程 / 切换学期 / 导出.ics / 退出登录.
- **Main menu**: add a `schedule` entry (`core/menu.ts`) → `showSchedule()`.
- **Personalized startup** (`main.ts`): if a saved session + cached timetable + week-one exist, print `renderNextClassBanner` from cache (fast, offline, best-effort).

## Data flow

Session (restore/login) → transport → client.fetchTerm(term) → Timetable → cache + pure query/render. Week-one Monday from the config store drives all date math. Export reuses `timetableToIcs` + `writePrivateIcs`.

## Error handling

Reuse the existing sanitized `TimetableError`/`AuthError` messaging. No session / expired → prompt re-login. Missing week-one → prompt. Network/timeout → spinner error + hint. All new motion degrades under non-TTY/reduced-motion. Startup peek is best-effort (never blocks/breaks launch).

## Security

- No password stored (session-only, existing design). Week-one Monday + cached timetable are local, `0600`, non-credential.
- The published package never hardcodes credentials; login is interactive (masked) or restores a saved session.

## Testing

Pure units: `currentWeekNumber` (boundaries/pre-semester), `meetingsOnDay`/`meetingsInWeek`, `periodStartDate`, `nextMeeting` (today-remaining vs next-day, none-left), `renderTodayClasses`/`renderNextClassBanner`/`renderWeekGrid` (ascii, current-marking), store round-trips. Interactive hub + startup verified live (real login). CLI `schedule` behavior unchanged.

## Out of scope

- Semester auto-detection of week-1 (campus doesn't provide dates → user-supplied, cached).
- Reminders/notifications; multi-account.

## Versioning

Prompt-side feature only (no nbtcal change). Ships with the same Prompt release as the schedule reconciliation; nbtcal `0.4.0` published first.
