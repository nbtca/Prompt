# App-Shell TUI — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A full-screen alternate-screen TUI app loop with persistent chrome, a Dashboard home, global instant navigation, and a "classic bridge" so existing surfaces keep working — the shell that Phase B migrates views into.

**Architecture:** New `src/app/` layer: pure `frame` compositor + `keys` router + `chrome`, a `View` interface, a `home` dashboard view, and an event-driven `app` loop (alt-screen, raw input, full-frame redraw, resize, async loads, classic bridge). `main.ts` launches it for interactive TTYs; the classic `showMainMenu` remains as the non-TTY fallback.

**Tech Stack:** TypeScript (ESM `.js` specifiers), Node ≥20.12, `vitest`. No new deps. Reuses `core/canvas`, `core/text`, tokens, and every existing surface renderer.

## Global Constraints

- Node ≥20.12; ESM `.js` specifiers; no new deps.
- The app loop runs ONLY on an interactive TTY; non-TTY / CI / pipes keep the classic `showMainMenu`. CLI command mode (`src/index.ts`) is untouched.
- Terminal safety: entering the alternate screen + raw mode MUST be undone (leave alt, show cursor, cooked mode) on quit, uncaught error, and SIGINT.
- All output via tokens/`pickIcon` (no bare Unicode literals); ANSI-aware width via `visualWidth` from `core/text.js`; degrade under reduced-motion (static frames).
- Co-located `*.test.ts`; render tests strip ANSI + pin/restore icon mode; `setLanguage('en')`.

---

### Task 1: canvas alt-screen primitives

**Files:** Modify `src/core/canvas.ts`; Test `src/core/canvas.test.ts` (append).

- [ ] **Step 1: Failing test** — append to `canvas.test.ts`:

```ts
describe('alt-screen ansi', () => {
  it('exposes enter/leave alt, home, clearAll', () => {
    expect(ansi.enterAlt).toBe('\x1b[?1049h');
    expect(ansi.leaveAlt).toBe('\x1b[?1049l');
    expect(ansi.home).toBe('\x1b[H');
    expect(ansi.clearAll).toBe('\x1b[2J');
  });
});
```

- [ ] **Step 2:** run `npx vitest run src/core/canvas.test.ts` → FAIL.
- [ ] **Step 3:** In `src/core/canvas.ts`, add to the `ansi` object:

```ts
  enterAlt: `${CSI}?1049h`,
  leaveAlt: `${CSI}?1049l`,
  home: `${CSI}H`,
  clearAll: `${CSI}2J`,
```

- [ ] **Step 4:** run → PASS; `npm run build`.
- [ ] **Step 5:** Commit `feat(canvas): alternate-screen ansi primitives`.

---

### Task 2: frame compositor (`app/frame.ts`)

**Files:** Create `src/app/frame.ts`, `src/app/frame.test.ts`.

**Interfaces:** Consumes `visualWidth` from `../core/text.js`. Produces:
- `clipToWidth(line: string, cols: number): string` (ANSI-aware truncate to `cols` visual width, resets color)
- `fitLine(line: string, cols: number): string` (clip if over, pad with spaces to exactly `cols`)
- `fitBody(lines: string[], height: number, scroll: number, cols: number): string[]` (viewport slice + pad to `height`, scroll clamped)
- `composeFrame(header: string[], body: string[], footer: string[], rows: number, cols: number, scroll: number): string`

- [ ] **Step 1: Failing test**

```ts
// src/app/frame.test.ts
import { describe, it, expect } from 'vitest';
import { fitLine, fitBody, composeFrame } from './frame.js';
import { visualWidth } from '../core/text.js';

describe('fitLine', () => {
  it('pads a short line to exactly cols', () => {
    expect(fitLine('hi', 5)).toBe('hi   ');
    expect(visualWidth(fitLine('hi', 5))).toBe(5);
  });
  it('clips an over-wide line to cols visual width', () => {
    expect(visualWidth(fitLine('abcdefgh', 4))).toBeLessThanOrEqual(4);
  });
});

describe('fitBody', () => {
  it('slices to height and pads short content', () => {
    const b = fitBody(['a', 'b'], 4, 0, 3);
    expect(b).toHaveLength(4);
    expect(b[0]).toBe('a  '); expect(b[3]).toBe('   ');
  });
  it('scrolls and clamps past the end', () => {
    const b = fitBody(['a', 'b', 'c', 'd'], 2, 10, 1);
    expect(b.map(s => s.trim())).toEqual(['c', 'd']); // clamped to last window
  });
});

describe('composeFrame', () => {
  it('produces exactly rows lines, each cols wide', () => {
    const f = composeFrame(['H'], ['x', 'y'], ['F'], 5, 3, 0).split('\n');
    expect(f).toHaveLength(5);
    for (const line of f) expect(visualWidth(line)).toBe(3);
    expect(f[0]!.trim()).toBe('H'); expect(f[4]!.trim()).toBe('F');
  });
});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement**

```ts
// src/app/frame.ts
import { visualWidth } from '../core/text.js';

export function clipToWidth(line: string, cols: number): string {
  if (visualWidth(line) <= cols) return line;
  let out = '';
  let w = 0;
  let i = 0;
  while (i < line.length) {
    const esc = line.slice(i).match(/^\x1b\[[0-9;]*m/);
    if (esc) { out += esc[0]; i += esc[0].length; continue; }
    const cp = line.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const cw = visualWidth(ch);
    if (w + cw > cols) break;
    out += ch; w += cw; i += ch.length;
  }
  return out + '\x1b[0m';
}

export function fitLine(line: string, cols: number): string {
  const clipped = visualWidth(line) > cols ? clipToWidth(line, cols) : line;
  const pad = cols - visualWidth(clipped);
  return pad > 0 ? clipped + ' '.repeat(pad) : clipped;
}

export function fitBody(lines: string[], height: number, scroll: number, cols: number): string[] {
  const maxScroll = Math.max(0, lines.length - height);
  const start = Math.max(0, Math.min(scroll, maxScroll));
  const out = lines.slice(start, start + height).map((l) => fitLine(l, cols));
  while (out.length < height) out.push(' '.repeat(cols));
  return out;
}

export function composeFrame(
  header: string[], body: string[], footer: string[], rows: number, cols: number, scroll: number,
): string {
  const h = header.map((l) => fitLine(l, cols));
  const f = footer.map((l) => fitLine(l, cols));
  const bodyH = Math.max(0, rows - h.length - f.length);
  const b = fitBody(body, bodyH, scroll, cols);
  return [...h, ...b, ...f].slice(0, rows).join('\n');
}
```

- [ ] **Step 4:** run → PASS; `npm run build`.
- [ ] **Step 5:** Commit `feat(app): frame compositor (fit/compose viewport)`.

---

### Task 3: global key router (`app/keys.ts`)

**Files:** Create `src/app/keys.ts`, `src/app/keys.test.ts`.

**Interfaces:** Produces `type ViewId = 'home'|'events'|'schedule'|'docs'|'status'|'links'|'settings'`; `interface GlobalKeyResult { switchTo?: ViewId; back?: boolean; quit?: boolean; handled: boolean }`; `routeGlobalKey(key, viewIds, current): GlobalKeyResult`.

- [ ] **Step 1: Failing test**

```ts
// src/app/keys.test.ts
import { describe, it, expect } from 'vitest';
import { routeGlobalKey, type ViewId } from './keys.js';
const ids: ViewId[] = ['home', 'events', 'schedule', 'docs', 'status', 'links', 'settings'];

describe('routeGlobalKey', () => {
  it('q and ctrl-c quit', () => {
    expect(routeGlobalKey('q', ids, 'home')).toEqual({ quit: true, handled: true });
    expect(routeGlobalKey('\x03', ids, 'events')).toEqual({ quit: true, handled: true });
  });
  it('esc quits at home, backs elsewhere', () => {
    expect(routeGlobalKey('\x1b', ids, 'home')).toEqual({ quit: true, handled: true });
    expect(routeGlobalKey('\x1b', ids, 'events')).toEqual({ back: true, handled: true });
  });
  it('digit selects the view by 1-based index', () => {
    expect(routeGlobalKey('2', ids, 'home')).toEqual({ switchTo: 'events', handled: true });
    expect(routeGlobalKey('9', ids, 'home')).toEqual({ handled: false }); // out of range
  });
  it('tab cycles to the next view', () => {
    expect(routeGlobalKey('\t', ids, 'settings')).toEqual({ switchTo: 'home', handled: true });
  });
  it('other keys are not handled (delegated to the view)', () => {
    expect(routeGlobalKey('j', ids, 'events')).toEqual({ handled: false });
  });
});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement**

```ts
// src/app/keys.ts
export type ViewId = 'home' | 'events' | 'schedule' | 'docs' | 'status' | 'links' | 'settings';

export interface GlobalKeyResult {
  switchTo?: ViewId;
  back?: boolean;
  quit?: boolean;
  handled: boolean;
}

export function routeGlobalKey(key: string, viewIds: readonly ViewId[], current: ViewId): GlobalKeyResult {
  if (key === 'q' || key === '\x03') return { quit: true, handled: true };
  if (key === '\x1b') return current === 'home' ? { quit: true, handled: true } : { back: true, handled: true };
  if (key === '\t') {
    const i = viewIds.indexOf(current);
    return { switchTo: viewIds[(i + 1) % viewIds.length], handled: true };
  }
  if (/^[1-9]$/.test(key)) {
    const idx = Number(key) - 1;
    if (idx < viewIds.length) return { switchTo: viewIds[idx], handled: true };
  }
  return { handled: false };
}
```

- [ ] **Step 4:** run → PASS; `npm run build`.
- [ ] **Step 5:** Commit `feat(app): global key router`.

---

### Task 4: chrome (`app/chrome.ts`)

**Files:** Create `src/app/chrome.ts`, `src/app/chrome.test.ts`.

**Interfaces:** Consumes `type`/`space`/`glyph` from `../core/theme.js`, `pickIcon` from `../core/icons.js`, `t` from `../i18n/index.js`, `ViewId` from `./keys.js`. Produces:
- `renderHeader(views: {id: ViewId; title: string}[], active: ViewId, cols: number): string[]` — line 1: `nbtca` brand; line 2: a tab bar (each title, active one marked); line 3: a dim rule.
- `renderFooter(active: ViewId, cols: number): string[]` — one keyhint line.

- [ ] **Step 1: Failing test**

```ts
// src/app/chrome.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { renderHeader, renderFooter } from './chrome.js';
import { setLanguage } from '../i18n/index.js';
import { resetIconCache } from '../core/icons.js';
import { stripAnsi } from '../core/text.js';

beforeAll(() => setLanguage('en'));
beforeEach(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });
const done = () => { process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache(); };
const views = [{ id: 'home' as const, title: 'Home' }, { id: 'events' as const, title: 'Events' }];

describe('renderHeader', () => {
  it('shows the brand and a tab bar with the active tab marked', () => {
    const lines = renderHeader(views, 'events', 40).map(stripAnsi);
    expect(lines[0]).toContain('nbtca');
    const tabs = lines.join('\n');
    expect(tabs).toContain('Home'); expect(tabs).toContain('Events');
    done();
  });
});

describe('renderFooter', () => {
  it('renders a keyhint line', () => {
    const f = renderFooter('home', 40).map(stripAnsi).join(' ');
    expect(f).toMatch(/q/); expect(f).toMatch(/quit|Quit|退出/i);
    done();
  });
});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** (reuse existing `menu.hintQuit` etc. for words; mark the active tab with `glyph`/emphasis; no bare Unicode):

```ts
// src/app/chrome.ts
import { type, space, glyph } from '../core/theme.js';
import { pickIcon } from '../core/icons.js';
import { t } from '../i18n/index.js';
import type { ViewId } from './keys.js';

export function renderHeader(views: { id: ViewId; title: string }[], active: ViewId, cols: number): string[] {
  const brand = `${space.indent}${type.heading('nbtca')}`;
  const sep = `  ${pickIcon('·', '-')}  `;
  const tabs = space.indent + views
    .map((v) => (v.id === active ? type.heading(`[${v.title}]`) : type.hint(v.title)))
    .join(sep);
  const rule = space.indent + type.hint(glyph.rule().repeat(Math.max(1, cols - 6)));
  return [brand, tabs, rule];
}

export function renderFooter(_active: ViewId, cols: number): string[] {
  const trans = t();
  const dot = pickIcon('·', '-');
  const rule = space.indent + type.hint(glyph.rule().repeat(Math.max(1, cols - 6)));
  const hint = space.indent + type.hint(
    `1-7 / Tab ${dot} ${trans.menu.hintMove} ${dot} ${trans.menu.hintOpen} ${dot} Esc ${dot} q ${trans.menu.hintQuit}`,
  );
  return [rule, hint];
}
```

- [ ] **Step 4:** run → PASS; `npm run build`.
- [ ] **Step 5:** Commit `feat(app): persistent header + footer chrome`.

---

### Task 5: View interface (`app/view.ts`)

**Files:** Create `src/app/view.ts`.

- [ ] **Step 1: Implement** (types only — no test needed; verified by consumers compiling):

```ts
// src/app/view.ts
import type { ViewId } from './keys.js';

export interface AppSize { rows: number; cols: number; }

export interface AppContext {
  size: AppSize;
  /** Re-render the whole screen from current state (call after async data lands). */
  rerender(): void;
  /** Suspend the app (leave alt-screen), run a classic surface, then resume. */
  runClassic(fn: () => Promise<void>): Promise<void>;
  quit(): void;
}

export interface View {
  id: ViewId;
  title: string;
  /** Optional async data fetch; call ctx.rerender() when data lands. */
  load?(ctx: AppContext): Promise<void>;
  /** Body lines for the viewport (the compositor clips/pads them). */
  render(ctx: AppContext): string[];
  /** View-local keys (global keys are handled before this). */
  handleKey?(key: string, ctx: AppContext): void;
}
```

- [ ] **Step 2:** `npm run build` → clean.
- [ ] **Step 3:** Commit `feat(app): View interface + AppContext`.

---

### Task 6: Home dashboard view (`app/views/home.ts`)

**Files:** Create `src/app/views/home.ts`, `src/app/views/home.test.ts`.

**Interfaces:** Consumes `View`/`AppContext`; `type`/`space` tokens; `t`; existing data: `fetchEvents`, `renderEventsTable` from `../../features/calendar.js`; `checkServices`, `countServiceHealth` from `../../features/status.js`; `peekNextClassLine` from `../../features/schedule-view.js`. Produces `renderHome(data): string[]` (pure) and `homeView: View`.

- [ ] **Step 1: Failing test**

```ts
// src/app/views/home.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { renderHome } from './home.js';
import { setLanguage } from '../../i18n/index.js';
import { stripAnsi } from '../../core/text.js';

beforeAll(() => setLanguage('en'));

describe('renderHome', () => {
  it('shows section titles + the next-class line + an events summary + health', () => {
    const out = stripAnsi(renderHome({
      nextClassLine: '  Next class in 2h',
      eventsSummary: '  3 upcoming',
      health: { up: 6, down: 0 },
      loading: false,
    }).join('\n'));
    expect(out).toContain('Next class in 2h');
    expect(out).toContain('3 upcoming');
    expect(out).toMatch(/6/); // up count
  });
  it('renders a loading state before data lands', () => {
    const out = stripAnsi(renderHome({ loading: true }).join('\n'));
    expect(out.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** — `renderHome(data)` composes labelled panels (Next class / Upcoming events / Service health), each with a token heading + its line(s), or a dim "loading…" when `data.loading`. Then `homeView: View` with a `load(ctx)` that fires the three fetches in parallel (best-effort, each try/catch), stores results in a module-level `data` object, and calls `ctx.rerender()`; `render(ctx)` returns `renderHome(data)`. Use `peekNextClassLine()` for the next-class line, `fetchEvents()` (slice/length) for the events summary, `checkServices()`+`countServiceHealth()` for health. Keep it token-styled, no bare Unicode. (Full code: model it on the existing `showEventsPreview`/`showServiceStatus` data usage.)

- [ ] **Step 4:** run → PASS; `npm run build`.
- [ ] **Step 5:** Commit `feat(app): Home dashboard view`.

---

### Task 7: the app loop + classic bridge (`app/app.ts`)

**Files:** Create `src/app/app.ts`.

**Interfaces:** Consumes canvas `ansi`; `frame`, `keys`, `chrome`, `view`; `homeView`; the existing surfaces (`showCalendar`, `showSchedule`, `showServiceStatus`, `showDocsMenu`, `showLinksMenu`, `showSettingsMenu`). Produces `runApp(): Promise<void>`.

- [ ] **Step 1: Implement** (integration; no unit test — verified live):

The loop, event-driven:
- Guard: if `!process.stdin.isTTY || !process.stdout.isTTY` return immediately (caller falls back to classic).
- `enter()`: `process.stdout.write(ansi.enterAlt + ansi.hideCursor)`, `stdin.setRawMode(true)`, `stdin.resume()`.
- `leave()`: `stdin.setRawMode(false)`, `process.stdout.write(ansi.showCursor + ansi.leaveAlt)`. Register `leave` on `process.on('exit')` and restore on SIGINT; wrap the whole loop in try/finally so an error still calls `leave()`.
- State: `let view: ViewId = 'home'; let scroll = 0;` A `views: Record<ViewId, View>` map: `home` → `homeView`; the other six are thin bridge views whose `render` returns a one-line "Opening classic…" and whose selection triggers `ctx.runClassic(<existing surface>)` (see below). Simplest: keep a `classicFor: Partial<Record<ViewId, () => Promise<void>>>` mapping events→showCalendar, schedule→showSchedule, status→showServiceStatus, docs→showDocsMenu, links→showLinksMenu, settings→showSettingsMenu.
- `size()`: `{ rows: process.stdout.rows || 24, cols: process.stdout.columns || 80 }`.
- `ctx: AppContext = { size, rerender: render, runClassic, quit }`.
- `render()`: build `views` list for chrome; `header = renderHeader(list, view, cols)`, `footer = renderFooter(view, cols)`, `body = activeView.render(ctx)`; `process.stdout.write(ansi.home + composeFrame(header, body, footer, rows, cols, scroll))`.
- `switchTo(id)`: `view = id; scroll = 0;` if the target is a classic-bridge view, immediately `await runClassic(classicFor[id])` then set `view='home'`; else if it has `load`, fire `activeView.load(ctx)` (async, best-effort) and `render()`.
- `onKey(data)`: `const key = data.toString(); const g = routeGlobalKey(key, viewIds, view);` if `g.quit` → `quit()`; if `g.back` → `view='home'; render()`; if `g.switchTo` → `switchTo(g.switchTo)`; else `activeView.handleKey?.(key, ctx)` and `render()`.
- `runClassic(fn)`: `leaveScreen()` (leave alt + show cursor + cooked mode + remove the data listener) → `await fn()` → `enterScreen()` (re-enter alt + raw + re-add listener) → `render()`.
- `quit()`: set a `running=false`, remove listeners, `leave()`, resolve the run promise.
- Wire `stdout.on('resize', () => { render(); })`.
- Kick off: `enter(); homeView.load?.(ctx); render();` return a promise that resolves on quit.

Write this concretely, matching the real signatures of the imported surfaces (all are `(): Promise<void>` except they may take no args — verify by reading them).

- [ ] **Step 2: Build + manual note**

Run: `npm run build && npx vitest run` — build clean; full suite green. The interactive loop is verified live by the controller after Task 8 (launch, Tab through tabs, open a classic surface + return, resize, q restores terminal).

- [ ] **Step 3:** Commit `feat(app): alternate-screen app loop + classic bridge`.

---

### Task 8: wire `main.ts` to launch the app

**Files:** Modify `src/main.ts`.

- [ ] **Step 1:** In `src/main.ts`, for an interactive TTY, replace `await showMainMenu();` with the app launch, keeping a classic fallback:

```ts
    if (process.stdin.isTTY && process.stdout.isTTY) {
      const { runApp } = await import('./app/app.js');
      await runApp();
    } else {
      await showMainMenu();
    }
```

Keep `runStartup()` (brief logo) before it if desired, or move the logo into the app's first frame — for Phase A, keep `runStartup()` then `runApp()`. Leave `showEventsPreview()` only in the classic path (the dashboard replaces it); i.e., guard the events-preview call so it only runs in the non-app (classic) branch, OR remove it from `main.ts` since Home now shows events. Choose: run `showEventsPreview()` only in the `else` (classic) branch.

- [ ] **Step 2: Build + full verification**

Run:
```bash
npm run build
npx vitest run
node dist/index.js --help | head -3        # CLI unchanged
node dist/index.js status --json | head -3  # CLI unchanged
echo | node dist/index.js 2>&1 | head -3    # non-TTY → classic path, no crash
bash scripts/test-cli.sh
```
Expected: build clean; suite green; CLI unchanged; non-TTY doesn't try the app loop.

- [ ] **Step 3:** Commit `feat(tui): launch the app shell for interactive terminals`.

---

## Self-Review

- Full-screen in-place redraw (no scroll) → Tasks 1,2,7 (alt-screen + composeFrame + loop). ✅
- Persistent top/bottom chrome → Task 4. ✅
- Dashboard home → Task 6. ✅
- Instant global nav / no dead-ends (digits/Tab/Esc/q) → Tasks 3,7. ✅
- Classic bridge (existing surfaces still work) → Task 7. ✅
- Non-TTY fallback + CLI untouched + terminal-safe cleanup → Tasks 7,8. ✅
- **Deferred (Phase B):** native in-app migration of Events/Schedule/Docs/Links/Settings (they run via the classic bridge in Phase A); per-view scroll/selection polish; transitions.
- **Placeholder note:** Task 6's `renderHome`/`homeView.load` and Task 7's loop are described with concrete structure but not byte-complete code (they compose existing renderers/surfaces whose exact call shapes the implementer confirms by reading `features/calendar.ts`, `features/status.ts`, `features/schedule-view.ts`, and the surface entry points). The pure compositor/router/chrome (Tasks 2-4) are byte-complete and TDD'd; the loop is integration verified live.
