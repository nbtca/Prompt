# TUI Redesign — Phase 3 (Polish) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the final "Quiet Precision" polish — consistent screen transitions with a breadcrumb header, progressive per-item status lighting, a correctness fix for the repaint painter, and snapshot/empty-state hardening.

**Architecture:** Reuse the Phase 1/2A primitives (`typeReveal`, `clearScreen`, `renderScreen`, `createPainter`, `getCapabilities`). A new `core/transitions.ts` gives every surface a clean-screen entry with a `nbtca › X` breadcrumb that reveals under motion and is instant when reduced. Status gains progressive lighting via `createPainter`. All motion degrades to the current static behavior under non-TTY / reduced-motion.

**Tech Stack:** TypeScript (ESM, `.js` specifiers), Node ≥20.12, `vitest`. No new dependencies.

## Global Constraints

- Node ≥ 20.12.0; ESM only; `.js` import specifiers.
- **No new npm dependencies.**
- Every new visual effect degrades: non-TTY / `NO_COLOR` / ascii / reduced-motion → static, no cursor control. Read `getCapabilities()` — do not re-detect.
- **Do not change** the non-interactive CLI command mode in `src/index.ts`, nor the pure `renderServiceStatusTable`/`renderEventsTable`/`renderHeatmap` outputs for already-resolved items (CLI depends on them). Adding an *optional* `pending` state to a status item must not alter output when `pending` is falsy.
- Glyphs via `glyph` tokens / `pickIcon` with ascii fallbacks — no bare literals.
- Alignment via `visualWidth`/`padEndV` (CJK-aware).
- Co-located `*.test.ts`; render tests strip ANSI and pin/restore icon mode.

---

### Task 1: Screen transition helper

**Files:**
- Create: `src/core/transitions.ts`
- Test: `src/core/transitions.test.ts`

**Interfaces:**
- Consumes: `clearScreen` from `./ui.js`; `typeReveal` from `./motion.js`; `glyph`, `type`, `space` from `./theme.js`; `screenWidth` from `./components/screen.js`; `pickIcon` from `./icons.js`.
- Produces:
  - `breadcrumb(label: string): string` — `nbtca › <label>` (`›` via pickIcon fallback `>`).
  - `buildScreenHeaderLines(crumb: string): string[]` — `[heading, rule, '']`.
  - `enterScreen(crumb: string): Promise<void>` — clears the screen, then reveals the header (instant under reduced-motion).

- [ ] **Step 1: Write the failing test**

```ts
// src/core/transitions.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { breadcrumb, buildScreenHeaderLines } from './transitions.js';
import { stripAnsi } from './text.js';
import { resetIconCache } from './icons.js';

describe('transitions header', () => {
  beforeEach(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });
  const done = () => { process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache(); };

  it('breadcrumb composes nbtca > label with an ascii separator', () => {
    expect(stripAnsi(breadcrumb('Status'))).toBe('nbtca > Status'); done();
  });

  it('buildScreenHeaderLines yields heading, a rule, and a trailing blank', () => {
    const lines = buildScreenHeaderLines('nbtca > Status').map(stripAnsi);
    expect(lines[0]).toContain('nbtca > Status');
    expect(lines[1]!.trim()).toMatch(/^-{3,}$/);
    expect(lines[2]).toBe('');
    done();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/transitions.test.ts`
Expected: FAIL — cannot find module `./transitions.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/transitions.ts
import { clearScreen } from './ui.js';
import { typeReveal } from './motion.js';
import { glyph, type, space } from './theme.js';
import { screenWidth } from './components/screen.js';
import { pickIcon } from './icons.js';

export function breadcrumb(label: string): string {
  return `nbtca ${pickIcon('›', '>')} ${label}`;
}

export function buildScreenHeaderLines(crumb: string): string[] {
  return [
    space.indent + type.heading(crumb),
    space.indent + type.hint(glyph.rule().repeat(screenWidth())),
    '',
  ];
}

export async function enterScreen(crumb: string): Promise<void> {
  clearScreen();
  await typeReveal(buildScreenHeaderLines(crumb));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/transitions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/transitions.ts src/core/transitions.test.ts
git commit -m "feat(transitions): add enterScreen breadcrumb transition"
```

---

### Task 2: Adopt transition + breadcrumb across surfaces; clear the main-menu loop

**Files:**
- Modify: `src/core/menu.ts`, `src/features/status.ts`, `src/features/calendar.ts`, `src/features/docs.ts`, `src/features/links.ts`, `src/features/settings.ts`

**Interfaces:**
- Consumes: `enterScreen`, `breadcrumb` from `../core/transitions.js` (features) / `./transitions.js` (menu.ts); `clearScreen` from `../core/ui.js`.

- [ ] **Step 1: Clear the screen each main-menu iteration**

In `src/core/menu.ts` `showMainMenu`, import `clearScreen` from `./ui.js` and call it at the very top of the `while (true)` loop body (before building the footer / `runMenu`). This stops sub-screen output from stacking under the menu:

```ts
export async function showMainMenu(): Promise<void> {
  while (true) {
    clearScreen();
    const trans = t();
    // ...existing footer + runMenu...
```

- [ ] **Step 2: Add an entry transition to each surface**

At the very start of each interactive entry point, `await enterScreen(breadcrumb(<label>))` (import both from `../core/transitions.js`). Use the existing i18n menu labels:
- `src/features/status.ts` `showServiceStatus`: `await enterScreen(breadcrumb(t().menu.status));` as the first line (before the spinner).
- `src/features/calendar.ts` `showCalendar`: `await enterScreen(breadcrumb(trans.menu.events));` after `const trans = t();`. (Leave `showPastEvents`/`showEventsPreview` alone — `showPastEvents` is a sub-view reached from within, and `showEventsPreview` runs at launch under the logo.)
- `src/features/docs.ts` `showDocsMenu`: `await enterScreen(breadcrumb(t().menu.docs));` before `let sections = await loadSections();`.
- `src/features/links.ts` `showLinksMenu`: `await enterScreen(breadcrumb(trans.menu.links));` after `const trans = t();`.
- `src/features/settings.ts` `showSettingsMenu`: `await enterScreen(breadcrumb(t().menu.settings));` at the top of the function, before the `while (true)`.

- [ ] **Step 3: Build + smoke**

Run: `npm run build && npx vitest run`
Expected: build clean; full suite green (no test asserts on these interactive entry side-effects, so behavior is unchanged for tests).

- [ ] **Step 4: Commit**

```bash
git add src/core/menu.ts src/features/status.ts src/features/calendar.ts src/features/docs.ts src/features/links.ts src/features/settings.ts
git commit -m "feat(tui): breadcrumb transitions on surface entry; clear main menu between actions"
```

---

### Task 3: Progressive per-item status lighting

**Files:**
- Modify: `src/features/status.ts`
- Test: `src/features/status.test.ts` (create)

**Interfaces:**
- Consumes: `getCapabilities` from `../core/capabilities.js`; `createPainter` from `../core/components/painter.js`; `c` from `../core/theme.js`.
- Produces: `ServiceStatus` gains optional `pending?: boolean`; `checkServiceWithRetry` is exported; `renderServiceStatusTable` renders a dim pending row when `item.pending` is true.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/status.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { renderServiceStatusTable, type ServiceStatus } from './status.js';
import { setLanguage } from '../i18n/index.js';
import { resetIconCache } from '../core/icons.js';
import { stripAnsi } from '../core/text.js';

beforeAll(() => { setLanguage('en'); process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache(); });

describe('renderServiceStatusTable pending state', () => {
  it('renders a pending marker for a not-yet-resolved service and keeps resolved rows', () => {
    const items: ServiceStatus[] = [
      { name: 'Homepage', url: 'x', ok: true, latencyMs: 42, group: 'nbtca' },
      { name: 'Docs', url: 'y', ok: false, group: 'nbtca', pending: true },
    ];
    const out = stripAnsi(renderServiceStatusTable(items, { color: false }));
    expect(out).toContain('Homepage');
    expect(out).toContain('42ms');
    expect(out).toContain('Docs');
    expect(out).toContain('…');           // pending glyph (unicode)
  });

  it('output for fully-resolved items is unchanged by the pending feature', () => {
    const items: ServiceStatus[] = [
      { name: 'Homepage', url: 'x', ok: true, latencyMs: 42, group: 'nbtca' },
    ];
    const out = stripAnsi(renderServiceStatusTable(items, { color: false }));
    expect(out).not.toContain('…');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/status.test.ts`
Expected: FAIL — `pending` not handled / glyph absent.

- [ ] **Step 3: Implement pending rendering + progressive lighting**

In `src/features/status.ts`:

1. Add `pending?: boolean;` to the `ServiceStatus` interface.
2. Add these imports: `import { getCapabilities } from '../core/capabilities.js';`, `import { createPainter } from '../core/components/painter.js';`, `import { c } from '../core/theme.js';`.
3. Export the retry helper: change `async function checkServiceWithRetry(` to `export async function checkServiceWithRetry(`.
4. In `renderServiceStatusTable`, add a pending branch. Locate the status-label block:

```ts
    let statusLabel: string;
    if (item.pending) {
      statusLabel = applyDim(`${pickIcon('…', '.')} ${trans.status.checking}`);
    } else if (item.ok) {
      statusLabel = applyGreen(`${onIcon} ${trans.status.up}`);
    } else if (item.intranet) {
      statusLabel = applyDim(`${lanIcon} ${trans.status.down}`);
    } else {
      statusLabel = applyRed(`${offIcon} ${trans.status.down}`);
    }
```

Also make the latency column show `—` while pending (change the latency line to `const latencyCol = !item.pending && item.ok && item.latencyMs != null ? applyLatency(item.latencyMs) : applyDim('—');`) and use the dim name for pending rows (`const nameCol = padEndV(item.pending ? applyDim(item.name) : (item.intranet ? applyDim(item.name) : applyCyan(item.name)), nameWidth);`).

5. Rewrite `showServiceStatus` with a progressive path that degrades:

```ts
export async function showServiceStatus(): Promise<ServiceStatus[]> {
  const trans = t();
  const targets = getServiceTargets();

  if (getCapabilities().reducedMotion) {
    const spinner = createSpinner(trans.status.checking);
    const items = await checkServices();
    const hasFailures = hasServiceFailures(items);
    if (hasFailures) spinner.error(trans.status.summaryFail);
    else spinner.stop(trans.status.summaryOk);
    console.log();
    console.log(renderServiceStatusTable(items, { color: !!process.stdout.isTTY }));
    console.log();
    return items;
  }

  const items: ServiceStatus[] = targets.map((tg) => ({
    name: tg.name, url: tg.url, ok: false, group: tg.group, intranet: tg.intranet, pending: true,
  }));
  const paint = createPainter(() => renderServiceStatusTable(items, { color: true }));
  console.log();
  paint();
  await Promise.all(targets.map(async (target, i) => {
    const status = await checkServiceWithRetry(target, 6000, 1);
    items[i] = { ...status, pending: false };
    paint();
  }));
  console.log('\n');
  const hasFailures = hasServiceFailures(items);
  console.log(hasFailures ? c.warn(trans.status.summaryFail) : c.success(trans.status.summaryOk));
  console.log();
  return items;
}
```

`getServiceTargets` and `checkServices` already exist in this file. Do NOT touch `checkServices` (CLI uses it) or the CLI-facing `serializeServiceStatus`/`countServiceHealth`.

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run src/features/status.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/status.ts src/features/status.test.ts
git commit -m "feat(status): progressive per-item lighting with reduced-motion fallback"
```

---

### Task 4: Painter soft-wrap correctness fix

**Files:**
- Modify: `src/core/components/painter.ts`
- Test: `src/core/components/painter.test.ts` (append)

**Interfaces:**
- Consumes: `visualWidth` from `../text.js`.
- Produces: `frameRows(frame: string, cols: number): number` — visual row count accounting for soft-wrap; `createPainter` uses it instead of `split('\n').length`.

- [ ] **Step 1: Write the failing test**

Append to `src/core/components/painter.test.ts` (add `frameRows` to the import from `./painter.js`):

```ts
describe('frameRows', () => {
  it('counts one row per short line', () => {
    expect(frameRows('abc', 80)).toBe(1);
    expect(frameRows('a\nb\nc', 80)).toBe(3);
  });
  it('counts wrapped rows for over-wide lines', () => {
    expect(frameRows('x'.repeat(90), 80)).toBe(2);
    expect(frameRows('x'.repeat(161), 80)).toBe(3);
  });
  it('treats an empty line as one row', () => {
    expect(frameRows('', 80)).toBe(1);
    expect(frameRows('a\n\nb', 80)).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/components/painter.test.ts`
Expected: FAIL — `frameRows` not exported.

- [ ] **Step 3: Implement**

Rewrite `src/core/components/painter.ts`:

```ts
import { ansi } from '../canvas.js';
import { visualWidth } from '../text.js';

/** Visual row count for a frame, accounting for terminal soft-wrap. */
export function frameRows(frame: string, cols: number): number {
  return frame.split('\n').reduce((n, line) => {
    const w = visualWidth(line);
    return n + Math.max(1, Math.ceil(w / cols));
  }, 0);
}

export function createPainter(
  frame: () => string,
  write: (s: string) => void = (s) => { process.stdout.write(s); },
): () => void {
  let painted = 0;
  return () => {
    const f = frame();
    const cols = process.stdout.columns || 80;
    const rows = frameRows(f, cols);
    if (painted > 0) {
      write(ansi.cursorUp(painted - 1) + ansi.cursorToCol0 + ansi.eraseDown);
    }
    write(f);
    painted = rows;
  };
}
```

(The existing `createPainter` tests use short lines, so `frameRows` returns the line count and they still pass.)

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run src/core/components/painter.test.ts && npm run build`
Expected: PASS (new frameRows tests + existing painter tests); build clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/components/painter.ts src/core/components/painter.test.ts
git commit -m "fix(painter): count wrapped visual rows so wide frames repaint correctly"
```

---

### Task 5: Snapshot hardening + quiet empty states

**Files:**
- Create: `src/core/components/frames.snapshot.test.ts`
- Modify: `src/features/calendar.ts` (empty-state polish only)

**Interfaces:**
- Consumes (tests): `renderMenu` from `./menu.js`; `renderScreen` from `./screen.js`; `stripAnsi` from `../text.js`; `resetIconCache` from `../icons.js`.

- [ ] **Step 1: Write frame snapshot tests**

```ts
// src/core/components/frames.snapshot.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { renderMenu } from './menu.js';
import { renderScreen } from './screen.js';
import { stripAnsi } from '../text.js';
import { resetIconCache } from '../icons.js';

beforeAll(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });

describe('frame snapshots (ascii, no-color)', () => {
  it('main menu frame', () => {
    const frame = stripAnsi(renderMenu({
      title: 'nbtca',
      selectedIndex: 0,
      options: [
        { value: 'events', label: 'Events', hint: '3 upcoming' },
        { value: 'docs', label: 'Docs', hint: 'Knowledge base' },
      ],
      footer: 'up/down move   enter open   q quit',
    }));
    expect(frame).toMatchInlineSnapshot();
  });

  it('screen frame', () => {
    const frame = stripAnsi(renderScreen({ title: 'nbtca > Status', body: '  body line', footer: 'q back', width: 20 }));
    expect(frame).toMatchInlineSnapshot();
  });
});
```

- [ ] **Step 2: Generate the snapshots**

Run: `npx vitest run src/core/components/frames.snapshot.test.ts -u`
This fills in the inline snapshots. Then open the file and confirm the captured frames look correct (cursor on the selected row, aligned hints, hairline rule). Re-run without `-u` to confirm they pass:
Run: `npx vitest run src/core/components/frames.snapshot.test.ts`
Expected: PASS.

- [ ] **Step 3: Quiet empty-state in calendar**

In `src/features/calendar.ts`, the `renderEventsTable` empty branch currently returns `  ${trans.calendar.noEvents}`. Make it quiet and consistent with the token system:

```ts
  if (events.length === 0) return `${space.indent}${type.hint(trans.calendar.noEvents)}`;
```

Add `import { type, space } from '../core/theme.js';` if not already importing them (the file imports `c` from theme; extend that import to `import { c, type, space } from '../core/theme.js';`). Leave all other calendar logic unchanged.

- [ ] **Step 4: Run the full suite + build**

Run: `npx vitest run && npm run build`
Expected: all green; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/components/frames.snapshot.test.ts src/features/calendar.ts
git commit -m "test(frames): snapshot menu/screen frames; quiet calendar empty state"
```

---

## Self-Review

**Spec coverage (Phase 3):**
- Screen transitions (enter sub-screen ≠ hard cut; consistent breadcrumb header) → Tasks 1–2. ✅
- Main menu no longer stacks output between actions → Task 2 Step 1. ✅
- Per-item loading rhythm (status rows light up as checks resolve) → Task 3. ✅
- Deferred soft-wrap repaint fix (from the 2A review) → Task 4. ✅
- Snapshot tests of Menu/Screen frames + quiet empty-state polish → Task 5. ✅
- **Intentionally not included (YAGNI / diminishing returns):** micro-motion beyond what Phase 1 already ships; `Screen`-frame wrapping of the *interior* of data tables (the breadcrumb header already unifies orientation, and rewrapping the working tables risks their alignment); making `runMenu` generic for enum type-safety (noted as an optional future cleanup, not visual polish).

**Placeholder scan:** No TBD/TODO. The only intentionally-empty construct is `toMatchInlineSnapshot()` in Task 5, which Step 2 fills via `-u` — that is the documented vitest workflow, not a placeholder.

**Type/behavior consistency:** `pending?: boolean` is additive and optional, so CLI paths and fully-resolved renders are unchanged (asserted by a test); `checkServiceWithRetry` export signature `(target, timeoutMs, retries)` matches its call in `showServiceStatus`; `frameRows(frame, cols)` and `createPainter` signatures are consistent; `enterScreen`/`breadcrumb`/`buildScreenHeaderLines` names match across tasks.

**Degradation:** `enterScreen` reveal and status progressive lighting both branch on `reducedMotion`/`typeReveal`'s reduced path → static under non-TTY / CI / NO_COLOR / ascii / `NBTCA_NO_MOTION`. CLI command mode untouched.

**Risk note:** The interactive transitions and status lighting cannot be keypress-verified in the harness; the controller performs a live end-to-end pass (launch → each surface shows its breadcrumb on a clean screen → status rows light up → back to a cleared menu) plus the automated build/test/CLI-smoke gates after Task 5.
