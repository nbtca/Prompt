# App-Shell TUI — Design (Phase A)

**Status:** Approved (self-rendered app shell; Phase A = core + dashboard + classic bridge)
**Date:** 2026-07-12
**Branch:** `feat/schedule` (the consolidated Prompt branch).

## Goal

Turn the CLI from a print-and-scroll menu flow into a **full-screen, in-place-redrawn TUI application** (like lazygit/k9s): an alternate-screen app loop with persistent top/bottom chrome, a Dashboard home, and instant global navigation. Phase A delivers the shell + Dashboard + a bridge that runs the not-yet-migrated surfaces in "classic" mode so nothing is lost; Phase B migrates each surface into a native in-app view.

## Model shift

Today: each surface `console.log`s content and calls `runMenu` (content scrolls down the terminal). New: a single **event-driven app loop** owns global state; every keypress (and every async data arrival) re-renders the **entire screen** into the alternate buffer — a stable frame of exactly `rows` lines, never scrolling the main terminal.

## Architecture (new `src/app/` layer; reuses all existing renderers)

- **`core/canvas.ts` additions:** `ansi.enterAlt` (`\x1b[?1049h`), `ansi.leaveAlt` (`\x1b[?1049l`), `ansi.home` (`\x1b[H`), `ansi.clearAll` (`\x1b[2J`). `ensureAppCleanup()` restores (leave alt, show cursor, cooked mode) on exit/SIGINT.
- **`app/frame.ts` (pure):** `fitLine(line, cols)` (truncate to / pad to `cols` visual width, ANSI-aware), `fitBody(lines, height, scroll, cols)` (viewport slice + pad to `height`), `composeFrame(header, body, footer, rows, cols, scroll)` → one frame string of exactly `rows` lines (body region = `rows − header − footer`).
- **`app/chrome.ts` (pure):** `renderHeader(state, cols)` → app name · a tab bar (Home Events Schedule Docs Status Links Settings, active highlighted) · login status; `renderFooter(state, cols)` → context keyhints (`1-7/Tab switch · ↑↓ move · ⏎ open · Esc back · q quit`). Tokens/`pickIcon` only.
- **`app/view.ts`:** `type ViewId = 'home'|'events'|'schedule'|'docs'|'status'|'links'|'settings'`; `interface AppContext { size:{rows;cols}; rerender():void; runClassic(fn):Promise<void>; quit():void }`; `interface View { id; title; load?(ctx):Promise<void>; render(ctx):string[]; handleKey?(key,ctx):void }`.
- **`app/keys.ts` (pure reducer):** `routeGlobalKey(key, viewIds, current): { switchTo?: ViewId; back?: boolean; quit?: boolean; handled: boolean }` — digits `1..N`/Tab switch, `Esc` back-to-home (or quit at home), `q`/Ctrl-C quit; anything else `handled:false` (delegated to the view).
- **`app/views/home.ts`:** the Dashboard. `load` fetches (best-effort, independent): next-class (cache peek), today's classes, upcoming events (`fetchEvents`), service health (`checkServices`); `render` composes labelled panels; a spinner/skeleton per panel until its data lands.
- **`app/app.ts`:** `runApp(): Promise<void>` — enter alt-screen + hide cursor + raw mode + `ensureAppCleanup`; hold `state = { view:'home', scroll:0 }`; `render()` = `composeFrame(renderHeader, activeView.render(ctx), renderFooter, rows, cols, scroll)` written after `ansi.home`; `stdin.on('data')` → `routeGlobalKey` then view `handleKey`, mutate state, re-render; `stdout.on('resize')` → update size + re-render; async loads call `ctx.rerender()` on arrival; quit → cleanup + resolve.
- **Classic bridge:** `ctx.runClassic(fn)` leaves the alt-screen (restores cooked mode + cursor), `await fn()` (an existing surface like `showCalendar`/`showSchedule`/…), then re-enters the alt-screen + raw mode + re-renders. Non-migrated tabs (Events/Schedule/Docs/Links/Settings) dispatch to their existing functions through this bridge in Phase A, so all features keep working during migration.
- **`main.ts`:** for an interactive TTY, `await runStartup()` (brief logo) then `await runApp()` instead of `showMainMenu()`. Non-TTY / `runApp` unavailable → fall back to the existing `showMainMenu` (so CI/pipes are unaffected). CLI command mode (`src/index.ts`) is untouched.

## Data flow

The app loop is single-threaded/event-driven: keypresses and async `load()` callbacks both mutate `state` and call `render()`. No view blocks the loop; each view fetches in `load()` and re-renders on arrival. Views reuse the existing pure renderers (`renderEventsTable`, schedule renders, `renderServiceStatusTable`, `renderMenu`, etc.) as body content, clipped to the viewport by `fitBody`.

## Error handling & degradation

- `runApp` only runs on an interactive TTY; otherwise `main` uses the classic `showMainMenu` (unchanged), so non-TTY/CI/`--json` are unaffected.
- Cleanup (leave alt-screen, show cursor, cooked mode) runs on quit, uncaught error, and SIGINT — the terminal is never left corrupted.
- Per-panel/per-view load errors render an inline error line, never crash the loop.
- Full redraw each frame is fine on modern terminals; if `reducedMotion`, skip any intra-frame animation (static frames only). Resize is handled.

## Testing

- Pure: `fitLine`/`fitBody`/`composeFrame` (truncation, padding to exact rows×cols, scroll clamping, ANSI-aware width), `renderHeader`/`renderFooter` (active tab, ascii degradation), `routeGlobalKey` (digit/Tab/Esc/quit/delegate), Home panel rendering given fixed data.
- Integration: the app loop + classic bridge verified live (launch → dashboard → Tab through views → classic surfaces open and return → resize → q restores the terminal cleanly).

## Out of scope (Phase B/C)

- Native in-app migration of Events/Schedule/Docs/Links/Settings (Phase A runs them via the classic bridge).
- Panel/side-by-side layouts, per-view scroll polish, transitions, richer dashboard — Phase C.
- Mouse support.

## Compatibility

- Additive: new `src/app/` layer + a `main.ts` entry swap for interactive TTYs; the classic `showMainMenu` and all surfaces remain and are reused. No new deps. CLI command mode unchanged.
