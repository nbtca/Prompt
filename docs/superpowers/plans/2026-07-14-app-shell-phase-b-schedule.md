# App-Shell Phase B — Native Schedule View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Schedule tab from the classic bridge (leave alt-screen → blocking menu loop → return) into a native, in-place-redrawn app-shell `View`, fixing a real bug found during design (`unresolvedItems` like a fitness-test practice record are computed by nbtcal but never shown anywhere in the interactive hub) and adding a visual break marker to the week grid for real gaps (lunch/dinner) discovered against live JWXT data.

**Architecture:** Two small non-blocking field controllers (`ListField`, `TextField`) wrap the *already-pure* render/state logic that `runMenu`/`runTextInput` are built on, so the app loop's single stdin listener can drive them without opening a second listener. `AppContext` gains `bodyRows` (so a view can size itself) and `View` gains `capturesInput?()` (so a view can temporarily own every keypress while a text field is focused, otherwise global Tab/digit/Esc/q routing keeps working). `views/schedule.ts` is a `mode`-based state machine, cache-first on entry (mirrors `homeView`'s "instant from cache, refresh in background" pattern), built from the same pure feature-layer functions the classic hub already uses.

**Tech Stack:** TypeScript, Node.js, Vitest. No new dependencies.

## Global Constraints

- Node.js >= 20.12.0 (from `package.json` `engines`).
- No new npm dependency for this plan.
- All new user-facing strings need both `src/i18n/locales/en.json` and `src/i18n/locales/zh.json` entries (existing project rule — see `2026-07-10-tui-redesign-design.md` "Out of Scope / Non-Goals").
- Non-interactive CLI command mode (`src/index.ts`, `nbtca schedule export` etc.) must not change behavior — this plan only touches the interactive app-shell path.
- Existing classic `showSchedule()` (`src/features/schedule-view.ts`) is not deleted in this plan — only removed from the app-shell's `classicFor` dispatch table. It stays reachable from `showMainMenu`.
- Ctrl-C (`\x03`) must always quit the app, even while a view has `capturesInput()` true.

---

### Task 1: `ListField` — non-blocking list navigation controller

**Files:**
- Create: `src/app/fields/list-field.ts`
- Test: `src/app/fields/list-field.test.ts`

**Interfaces:**
- Consumes: `renderMenu`, `nextIndex`, `parseKey`, `type MenuOption` from `src/core/components/menu.ts` (all already exported, unchanged).
- Produces: `class ListField` with `constructor(config: ListFieldConfig)`, `get selectedIndex(): number`, `render(): string[]`, `handleKey(key: string): ListFieldResult` where `ListFieldResult = { selected?: string; cancelled?: boolean }`. Used by Task 7 (`views/schedule.ts`) and later Docs/Events/Settings views.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/fields/list-field.test.ts
import { describe, it, expect } from 'vitest';
import { ListField } from './list-field.js';

describe('ListField', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma' },
  ];

  it('starts at index 0 by default', () => {
    const field = new ListField({ title: 'Pick', options });
    expect(field.selectedIndex).toBe(0);
  });

  it('starts at initialIndex when given', () => {
    const field = new ListField({ title: 'Pick', options, initialIndex: 2 });
    expect(field.selectedIndex).toBe(2);
  });

  it('moves selection down/up on arrow keys', () => {
    const field = new ListField({ title: 'Pick', options });
    field.handleKey('\x1b[B');
    expect(field.selectedIndex).toBe(1);
    field.handleKey('\x1b[A');
    expect(field.selectedIndex).toBe(0);
  });

  it('wraps at the ends', () => {
    const field = new ListField({ title: 'Pick', options });
    field.handleKey('\x1b[A');
    expect(field.selectedIndex).toBe(2);
  });

  it('returns the selected value on enter', () => {
    const field = new ListField({ title: 'Pick', options });
    field.handleKey('\x1b[B');
    expect(field.handleKey('\r')).toEqual({ selected: 'b' });
  });

  it('returns cancelled on esc/ctrl-c', () => {
    const field = new ListField({ title: 'Pick', options });
    expect(field.handleKey('\x1b')).toEqual({ cancelled: true });
    expect(field.handleKey('\x03')).toEqual({ cancelled: true });
  });

  it('render() includes the title and every option label', () => {
    const field = new ListField({ title: 'Pick one', options });
    const text = field.render().join('\n');
    expect(text).toContain('Pick one');
    expect(text).toContain('Alpha');
    expect(text).toContain('Beta');
    expect(text).toContain('Gamma');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/fields/list-field.test.ts`
Expected: FAIL — `Cannot find module './list-field.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/fields/list-field.ts
import { renderMenu, nextIndex, parseKey, type MenuOption } from '../../core/components/menu.js';

export interface ListFieldConfig {
  title: string;
  options: MenuOption[];
  footer?: string;
  initialIndex?: number;
}

export interface ListFieldResult {
  selected?: string;
  cancelled?: boolean;
}

/** Non-blocking equivalent of `runMenu`: a view holds one of these in its own
 * state and drives it from the app loop's single stdin listener via
 * `handleKey`, instead of `runMenu` attaching a second listener and blocking
 * on a Promise. */
export class ListField {
  private index: number;

  constructor(private readonly config: ListFieldConfig) {
    this.index = config.initialIndex ?? 0;
  }

  get selectedIndex(): number {
    return this.index;
  }

  render(): string[] {
    return renderMenu({
      title: this.config.title,
      options: this.config.options,
      selectedIndex: this.index,
      footer: this.config.footer,
    }).split('\n');
  }

  handleKey(key: string): ListFieldResult {
    const parsed = parseKey(key);
    if (parsed === 'cancel') return { cancelled: true };
    if (parsed === 'enter') return { selected: this.config.options[this.index]?.value };
    const next = nextIndex(this.index, parsed, this.config.options.length);
    if (next !== this.index) this.index = next;
    return {};
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/fields/list-field.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/fields/list-field.ts src/app/fields/list-field.test.ts
git commit -m "feat(app): non-blocking ListField for native app-shell views"
```

---

### Task 2: `TextField` — non-blocking text/secret input controller

**Files:**
- Create: `src/app/fields/text-field.ts`
- Test: `src/app/fields/text-field.test.ts`

**Interfaces:**
- Consumes: `renderInput`, `applyInputEvent`, `parseInputData` from `src/core/components/text-input.ts` (already exported, unchanged).
- Produces: `class TextField` with `constructor(config: TextFieldConfig)`, `get currentValue(): string`, `render(): string[]`, `handleKey(key: string): TextFieldResult` where `TextFieldResult = { submitted?: string; cancelled?: boolean }`. Used by Task 7.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/fields/text-field.test.ts
import { describe, it, expect } from 'vitest';
import { TextField } from './text-field.js';

describe('TextField', () => {
  it('starts empty', () => {
    const field = new TextField({ message: 'Name' });
    expect(field.currentValue).toBe('');
  });

  it('appends typed characters', () => {
    const field = new TextField({ message: 'Name' });
    field.handleKey('h');
    field.handleKey('i');
    expect(field.currentValue).toBe('hi');
  });

  it('backspace removes the last character', () => {
    const field = new TextField({ message: 'Name' });
    field.handleKey('h');
    field.handleKey('i');
    field.handleKey('\x7f');
    expect(field.currentValue).toBe('h');
  });

  it('submits the value on enter', () => {
    const field = new TextField({ message: 'Name' });
    field.handleKey('h');
    field.handleKey('i');
    expect(field.handleKey('\r')).toEqual({ submitted: 'hi' });
  });

  it('rejects an empty submit unless allowEmpty', () => {
    const field = new TextField({ message: 'Name' });
    expect(field.handleKey('\r')).toEqual({});
    const allowEmptyField = new TextField({ message: 'Name', allowEmpty: true });
    expect(allowEmptyField.handleKey('\r')).toEqual({ submitted: '' });
  });

  it('returns cancelled on esc/ctrl-c', () => {
    const field = new TextField({ message: 'Name' });
    expect(field.handleKey('\x1b')).toEqual({ cancelled: true });
    expect(field.handleKey('\x03')).toEqual({ cancelled: true });
  });

  it('render() never reveals the value when secret', () => {
    const field = new TextField({ message: 'Password', secret: true });
    field.handleKey('s');
    field.handleKey('e');
    field.handleKey('c');
    expect(field.render().join('\n')).not.toContain('sec');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/fields/text-field.test.ts`
Expected: FAIL — `Cannot find module './text-field.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/fields/text-field.ts
import { renderInput, applyInputEvent, parseInputData } from '../../core/components/text-input.js';

export interface TextFieldConfig {
  message: string;
  placeholder?: string;
  secret?: boolean;
  mask?: string;
  /** Defaults to false: enter is ignored while the value is empty. */
  allowEmpty?: boolean;
}

export interface TextFieldResult {
  submitted?: string;
  cancelled?: boolean;
}

/** Non-blocking equivalent of `runTextInput`/`runSecretInput`: a view holds
 * one of these and drives it via `handleKey` from the app loop's single
 * stdin listener. Does not touch vim-key activation — the owning view is
 * responsible for `setVimKeysActive(false)` while a TextField is focused
 * (mirrors what `runTextInput` already does for the blocking widget). */
export class TextField {
  private value = '';

  constructor(private readonly config: TextFieldConfig) {}

  get currentValue(): string {
    return this.value;
  }

  render(): string[] {
    return renderInput({
      message: this.config.message,
      value: this.value,
      placeholder: this.config.placeholder,
      secret: this.config.secret,
      mask: this.config.mask,
    }).split('\n');
  }

  handleKey(key: string): TextFieldResult {
    const ev = parseInputData(key);
    if (ev.type === 'cancel') return { cancelled: true };
    if (ev.type === 'enter') {
      if (this.value.length > 0 || this.config.allowEmpty === true) return { submitted: this.value };
      return {};
    }
    this.value = applyInputEvent(this.value, ev);
    return {};
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/fields/text-field.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/fields/text-field.ts src/app/fields/text-field.test.ts
git commit -m "feat(app): non-blocking TextField for native app-shell views"
```

---

### Task 3: `bodyRows` + `capturesInput` — extend the app shell's contract

**Files:**
- Modify: `src/app/frame.ts`
- Modify: `src/app/frame.test.ts`
- Modify: `src/app/chrome.ts`
- Modify: `src/app/view.ts`
- Modify: `src/app/app.ts`

**Interfaces:**
- Consumes: existing `AppSize`, `ViewId` (`src/app/view.ts`, `src/app/keys.ts`).
- Produces: `computeBodyRows(rows: number, headerLines: number, footerLines: number): number` (`frame.ts`); `HEADER_LINES = 3`, `FOOTER_LINES = 2` (`chrome.ts`); `AppContext.bodyRows: number`; `View.capturesInput?(): boolean` (`view.ts`). Consumed by Task 7's `scheduleView`.

- [ ] **Step 1: Write the failing test for `computeBodyRows`**

Add to `src/app/frame.test.ts` (append to the existing `describe` blocks — read the file first, it already imports `fitLine`/`fitBody`/`composeFrame` from `./frame.js`):

```typescript
import { computeBodyRows } from './frame.js';

describe('computeBodyRows', () => {
  it('subtracts header and footer line counts from total rows', () => {
    expect(computeBodyRows(24, 3, 2)).toBe(19);
  });
  it('floors at 0 when header+footer exceed total rows', () => {
    expect(computeBodyRows(4, 3, 2)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/frame.test.ts`
Expected: FAIL — `computeBodyRows is not a function` / import error

- [ ] **Step 3: Implement `computeBodyRows`**

Add to `src/app/frame.ts` (append, do not remove existing exports):

```typescript
export function computeBodyRows(rows: number, headerLines: number, footerLines: number): number {
  return Math.max(0, rows - headerLines - footerLines);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/frame.test.ts`
Expected: PASS (all existing tests plus the 2 new ones)

- [ ] **Step 5: Export header/footer line-count constants from `chrome.ts`**

In `src/app/chrome.ts`, add near the top (after the existing imports, before `renderHeader`):

```typescript
/** `renderHeader` always returns exactly this many lines (brand, tabs, rule). */
export const HEADER_LINES = 3;
/** `renderFooter` always returns exactly this many lines (rule, keyhints). */
export const FOOTER_LINES = 2;
```

- [ ] **Step 6: Extend `AppContext` and `View` in `view.ts`**

Replace the full contents of `src/app/view.ts`:

```typescript
import type { ViewId } from './keys.js';

export interface AppSize { rows: number; cols: number; }

export interface AppContext {
  size: AppSize;
  /** `size.rows` minus the chrome's header/footer line counts — how many
   * lines a view's `render()` body actually has room for. */
  bodyRows: number;
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
  /** View-local keys (global keys are handled before this, unless capturesInput() is true). */
  handleKey?(key: string, ctx: AppContext): void;
  /** True while this view wants every keypress (e.g. a focused text field) —
   * global Tab/digit/Esc routing is skipped and every key goes straight to
   * handleKey. Ctrl-C still quits regardless. Defaults to false when absent. */
  capturesInput?(): boolean;
}
```

- [ ] **Step 7: Wire `bodyRows` and `capturesInput` into `app.ts`**

In `src/app/app.ts`:

1. Update the import line for `chrome.js` to also pull the new constants:

```typescript
import { renderHeader, renderFooter, HEADER_LINES, FOOTER_LINES } from './chrome.js';
```

2. Add the `computeBodyRows` import next to the existing `frame.js` import:

```typescript
import { composeFrame, computeBodyRows } from './frame.js';
```

3. In the `ctx` object literal, add a `bodyRows` getter right after the existing `size` getter:

```typescript
  const ctx: AppContext = {
    get size(): AppSize { return size(); },
    get bodyRows(): number { return computeBodyRows(size().rows, HEADER_LINES, FOOTER_LINES); },
    rerender(): void { render(); },
    runClassic(fn: () => Promise<void>): Promise<void> { return runClassic(fn); },
    quit(): void { quit(); },
  };
```

4. In `onKey`, capture-input views must see every key before global routing. Replace the current body of `onKey` with:

```typescript
  function onKey(data: Buffer): void {
    const key = data.toString();
    if (key === '\x03') { quit(); return; } // Ctrl-C always quits, even mid-capture.
    const active = nativeViews[view];
    if (active?.capturesInput?.()) {
      active.handleKey?.(key, ctx);
      render();
      return;
    }
    const g = routeGlobalKey(key, viewIds, view);
    if (g.quit) {
      quit();
      return;
    }
    if (g.back) {
      view = 'home';
      void nativeViews['home']?.load?.(ctx)?.catch(() => {});
      render();
      return;
    }
    if (g.switchTo) {
      void switchTo(g.switchTo);
      return;
    }
    active?.handleKey?.(key, ctx);
    render();
  }
```

(This generalizes the old `if (view === 'home') homeView.handleKey?.(key, ctx);` branch to any native view, and fixes a latent bug where a future native view other than `home` would never receive its own keys.)

- [ ] **Step 8: Introduce the `nativeViews` map (Home only for now) and generalize `render`/`switchTo`**

Still in `app.ts`, replace the single-view `render()` and `switchTo()` with a map-driven version. Add near the top of `runApp`, right after the `tabs`/`viewIds` declarations:

```typescript
  // Views rendered natively inside the alt-screen frame. Anything not listed
  // here but present in `classicFor` still suspends the app and runs the old
  // menu-driven surface.
  const nativeViews: Partial<Record<ViewId, View>> = {
    home: homeView,
  };
```

(`View` must be imported: add `import type { AppContext, AppSize, View } from './view.js';` — replace the existing `import type { AppContext, AppSize } from './view.js';` line.)

Replace the body of `render()`:

```typescript
  function render(): void {
    if (suspended || !running) return;
    const { rows, cols } = size();
    const header = renderHeader(tabs, view, cols);
    const footer = renderFooter(view, cols);
    const body = nativeViews[view]?.render(ctx) ?? [];
    process.stdout.write(ansi.home + composeFrame(header, body, footer, rows, cols, scroll) + ansi.eraseDown);
  }
```

Replace the body of `switchTo()`:

```typescript
  async function switchTo(id: ViewId): Promise<void> {
    scroll = 0;
    const classic = classicFor[id];
    if (classic) {
      await runClassic(classic);
      view = 'home';
      void nativeViews['home']?.load?.(ctx)?.catch(() => {});
      render();
    } else {
      view = id;
      void nativeViews[id]?.load?.(ctx)?.catch(() => {});
      render();
    }
  }
```

- [ ] **Step 9: Build and run the full test suite**

Run: `npm run build && npx vitest run`
Expected: PASS, no TypeScript errors. (`schedule` is still in `classicFor` at this point — Task 7 removes it once the native view exists — so behavior is unchanged; this step only proves the refactor is behavior-preserving.)

- [ ] **Step 10: Manual smoke check**

Run: `npx tsx src/index.ts` in an interactive terminal, confirm Home still loads, Tab cycles through tabs, existing classic surfaces (Schedule/Events/Docs/Settings) still open and return correctly, `q` restores the terminal.

- [ ] **Step 11: Commit**

```bash
git add src/app/frame.ts src/app/frame.test.ts src/app/chrome.ts src/app/view.ts src/app/app.ts
git commit -m "refactor(app): generalize app loop to a native-views map; add bodyRows + capturesInput"
```

---

### Task 4: `schedule-render.ts` — week-grid gap marker + unresolved-items renderer

**Files:**
- Modify: `src/features/schedule-render.ts`
- Modify: `src/features/schedule-render.test.ts`

**Interfaces:**
- Consumes: `TimetableUnresolvedItem` type from `@nbtca/nbtcal/timetable` (already a dependency); existing `renderWeekGrid` signature is unchanged (no new parameters — the gap marker is automatic).
- Produces: `renderUnresolvedItems(items: readonly TimetableUnresolvedItem[]): string`. Consumed by Task 7.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/schedule-render.test.ts` (the file already imports `stripAnsi`, `setLanguage`, `resetIconCache`, and declares a local `periods` fixture — reuse it, and extend it with a third period that has a real gap after period 2):

```typescript
import { renderUnresolvedItems } from './schedule-render.js';
import type { TimetableUnresolvedItem } from '@nbtca/nbtcal/timetable';

const periodsWithGap: TimetablePeriod[] = [
  ...periods,
  { period: 3, label: null, start: '13:30', end: '14:15' }, // 09:40 -> 13:30 is a 3h50m gap
];

describe('renderWeekGrid gap marker', () => {
  it('inserts a separator line when the gap to the next period exceeds 30 minutes', () => {
    const out = stripAnsi(renderWeekGrid([], periodsWithGap, 1, new Date('2026-09-07T09:00:00')));
    const lines = out.split('\n');
    // period rows are 1-indexed after the weekday header row
    const p2Index = lines.findIndex((l) => l.includes('P2') || l.includes('第2'));
    const p3Index = lines.findIndex((l) => l.includes('P3') || l.includes('第3'));
    expect(p3Index).toBeGreaterThan(p2Index + 1); // at least one line between them
    done();
  });
  it('does not insert a separator between adjacent periods', () => {
    const out = stripAnsi(renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00')));
    const lines = out.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(1 + periods.length); // header + one row per period, no extra rows
    done();
  });
});

describe('renderUnresolvedItems', () => {
  const items: TimetableUnresolvedItem[] = [
    { kind: 'practice', itemIndex: 0, sourceFields: { kcmc: '大学生体能测试Ⅰ', sjkcgs: '大学生体能测试Ⅰ◇体育老师(共1周)/16周' } },
  ];

  it('lists each item by its course name and detail', () => {
    const out = stripAnsi(renderUnresolvedItems(items));
    expect(out).toContain('大学生体能测试Ⅰ');
    done();
  });

  it('shows an empty state for no items', () => {
    const out = stripAnsi(renderUnresolvedItems([]));
    expect(out.length).toBeGreaterThan(0);
    done();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/schedule-render.test.ts`
Expected: FAIL — `renderUnresolvedItems is not exported` and the gap-marker assertions fail against current output.

- [ ] **Step 3: Add the new i18n keys**

In `src/i18n/locales/en.json`, inside the `"timetable"` object, add after `"hubLogout": "Log out",`:

```json
    "hubUnresolved": "Needs attention",
    "unresolvedTitle": "Needs attention",
    "unresolvedEmpty": "Nothing needs attention",
    "unresolvedUnknownItem": "Unnamed item",
```

In `src/i18n/locales/zh.json`, inside the `"timetable"` object, add after `"hubLogout": "退出登录",`:

```json
    "hubUnresolved": "待处理事项",
    "unresolvedTitle": "待处理事项",
    "unresolvedEmpty": "没有待处理事项",
    "unresolvedUnknownItem": "未命名安排",
```

- [ ] **Step 4: Implement the gap marker and `renderUnresolvedItems`**

In `src/features/schedule-render.ts`, add the import for the unresolved-item type (extend the existing `type` import from `@nbtca/nbtcal/timetable`):

```typescript
import type { TimetableMeeting, TimetablePeriod, TimetableUnresolvedItem } from '@nbtca/nbtcal/timetable';
```

Add a helper above `renderWeekGrid`:

```typescript
const GAP_THRESHOLD_MINUTES = 30;

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => Number.parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}
```

Replace `renderWeekGrid`'s body:

```typescript
export function renderWeekGrid(meetings: readonly TimetableMeeting[], periods: readonly TimetablePeriod[], weekNumber: number, _now: Date): string {
  const week = meetingsInWeek(meetings, weekNumber);
  const cellW = 10;
  const rowHeadW = 4;
  const totalW = rowHeadW + cellW * 7;
  const at = (wd: number, period: number): string => {
    const m = week.find((x) => x.weekday === wd && period >= x.startPeriod && period <= x.endPeriod);
    return m ? truncate(m.courseName, cellW) : '';
  };
  const lines: string[] = [];
  const header = padEndV('', rowHeadW) + WEEKDAY_KEYS.map((d) => padEndV(type.hint(d), cellW)).join('');
  lines.push(space.indent + header);
  const sorted = [...periods].sort((a, b) => a.period - b.period);
  sorted.forEach((p, i) => {
    const rowHead = type.hint(padEndV(`${t().timetable.periodShort}${p.period}`, rowHeadW));
    const cells = [1, 2, 3, 4, 5, 6, 7].map((wd) => {
      const v = at(wd, p.period);
      return padEndV(v ? type.body(v) : type.hint(pickIcon('·', '.')), cellW);
    }).join('');
    lines.push(space.indent + rowHead + cells);

    const next = sorted[i + 1];
    if (next && minutesOf(next.start) - minutesOf(p.end) > GAP_THRESHOLD_MINUTES) {
      lines.push(space.indent + type.hint(pickIcon('╌', '-').repeat(totalW)));
    }
  });
  return lines.join('\n');
}

export function renderUnresolvedItems(items: readonly TimetableUnresolvedItem[]): string {
  const trans = t();
  if (items.length === 0) return `${space.indent}${type.hint(trans.timetable.unresolvedEmpty)}`;
  const dot = pickIcon('·', '-');
  const lines = items.map((item) => {
    const name = item.sourceFields.kcmc ?? trans.timetable.unresolvedUnknownItem;
    const detail = item.sourceFields.sjkcgs ?? item.sourceFields.qsjsz ?? '';
    return `${space.indent}${type.body(name)}${detail ? `  ${dot}  ${type.hint(detail)}` : ''}`;
  });
  return lines.join('\n');
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/features/schedule-render.test.ts`
Expected: PASS (all existing tests plus the new ones)

- [ ] **Step 6: Commit**

```bash
git add src/features/schedule-render.ts src/features/schedule-render.test.ts src/i18n/locales/en.json src/i18n/locales/zh.json
git commit -m "feat(schedule): week-grid break marker + render unresolved/practice items"
```

---

### Task 5: `renderSchedule` — pure per-mode body renderer

**Files:**
- Create: `src/app/views/schedule-render.ts`
- Create: `src/app/views/schedule-render.test.ts`

This file is intentionally separate from `src/features/schedule-render.ts` (which renders individual pieces like the grid) — it composes those pieces plus field `.render()` output into the *whole view body* for each mode, exactly the role `renderHome` plays for the Home view. Keeping it pure (no I/O, no module-level mutable state) makes every mode's layout independently testable, mirroring `src/app/views/home.ts` + `home.test.ts`.

**Interfaces:**
- Consumes: `ListField`/`TextField` (`render(): string[]`) from Task 1/2; `renderNextClassBanner`, `renderTodayClasses`, `renderWeekGrid`, `renderUnresolvedItems` from `src/features/schedule-render.ts` (Task 4); `currentWeekNumber`, `campusWeekday`, `meetingsOnDay`, `nextMeeting` from `src/features/schedule-query.ts` (unchanged); `Timetable`, `AcademicTerm` types from `@nbtca/nbtcal/timetable`.
- Produces: `export interface ScheduleViewState { mode: ScheduleMode; ...}` (full shape below) and `export function renderSchedule(state: ScheduleViewState, now: Date): string[]`. Consumed by Task 7 (`views/schedule.ts`), which owns `ScheduleViewState` as mutable module state and calls this function inside its `render()`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/views/schedule-render.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { renderSchedule, type ScheduleViewState } from './schedule-render.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi } from '../../core/text.js';
import type { Timetable } from '@nbtca/nbtcal/timetable';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

const timetable: Timetable = {
  term: { academicYear: '2026', semester: '3' },
  meetings: [{
    sourceId: null, courseName: 'Math', teacherNames: ['Dr Li'], location: 'Room 201',
    weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1], kind: 'regular',
  }],
  unresolvedItems: [{ kind: 'practice', itemIndex: 0, sourceFields: { kcmc: 'Fitness test' } }],
  periods: [{ period: 1, label: null, start: '08:00', end: '08:45' }],
  calendarDays: [],
  warnings: [],
  fetchedAt: new Date('2026-09-07T00:00:00Z'),
};

describe('renderSchedule', () => {
  it('loading mode shows a loading hint', () => {
    const out = stripAnsi(renderSchedule({ mode: 'loading' }, new Date()).join('\n'));
    expect(out.length).toBeGreaterThan(0);
  });

  it('needsLoginId mode renders the id field', () => {
    const idField = new ListField === undefined ? undefined : new TextField({ message: 'Student id' });
    const out = stripAnsi(renderSchedule({ mode: 'needsLoginId', idField }, new Date()).join('\n'));
    expect(out).toContain('Student id');
  });

  it('hub mode shows the next-class banner, today, and the unresolved badge', () => {
    const hubField = new ListField({
      title: 'Schedule',
      options: [
        { value: 'week', label: 'This week' },
        { value: 'unresolved', label: 'Needs attention', hint: '1' },
      ],
    });
    const out = stripAnsi(renderSchedule({
      mode: 'hub', key: '2026-3', weekOne: '2026-09-07', timetable, hubField,
    }, new Date('2026-09-07T07:00:00')).join('\n'));
    expect(out).toContain('Math');
    expect(out).toContain('Needs attention');
  });

  it('week mode renders the grid', () => {
    const out = stripAnsi(renderSchedule({
      mode: 'week', key: '2026-3', weekOne: '2026-09-07', timetable,
    }, new Date('2026-09-07T09:00:00')).join('\n'));
    expect(out).toContain('Math');
  });

  it('unresolved mode lists the unresolved item', () => {
    const out = stripAnsi(renderSchedule({
      mode: 'unresolved', key: '2026-3', weekOne: '2026-09-07', timetable,
    }, new Date()).join('\n'));
    expect(out).toContain('Fitness test');
  });

  it('error mode shows the error message', () => {
    const out = stripAnsi(renderSchedule({ mode: 'error', errorMessage: 'Something broke' }, new Date()).join('\n'));
    expect(out).toContain('Something broke');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/views/schedule-render.test.ts`
Expected: FAIL — module does not exist. (Fix the stray `new ListField === undefined ? undefined :` typo left in Step 1 before running — it should just be `const idField = new TextField({ message: 'Student id' });`.)

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/views/schedule-render.ts
import type { AcademicTerm, Timetable } from '@nbtca/nbtcal/timetable';
import { type, space } from '../../core/theme.js';
import { t } from '../../i18n/index.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { currentWeekNumber, campusWeekday, meetingsOnDay, nextMeeting } from '../../features/schedule-query.js';
import { renderNextClassBanner, renderTodayClasses, renderWeekGrid, renderUnresolvedItems } from '../../features/schedule-render.js';

export type ScheduleMode =
  | 'loading'
  | 'needsLoginId'
  | 'needsLoginPassword'
  | 'authenticating'
  | 'needsWeekOne'
  | 'hub'
  | 'week'
  | 'termPicker'
  | 'unresolved'
  | 'error';

export interface ScheduleViewState {
  mode: ScheduleMode;
  errorMessage?: string;
  statusMessage?: string;
  idField?: TextField;
  passwordField?: TextField;
  weekOneField?: TextField;
  hubField?: ListField;
  termField?: ListField;
  key?: string;
  term?: AcademicTerm;
  weekOne?: string;
  timetable?: Timetable;
}

function heading(label: string): string {
  return `${space.indent}${type.heading(label)}`;
}

function hint(label: string): string {
  return `${space.indent}${type.hint(label)}`;
}

function renderHubBody(state: ScheduleViewState, now: Date): string[] {
  const trans = t();
  const lines: string[] = [];
  const tt = state.timetable;
  if (tt && state.weekOne) {
    const week = currentWeekNumber(state.weekOne, now);
    const today = meetingsOnDay(tt.meetings, campusWeekday(now), week);
    const banner = renderNextClassBanner(nextMeeting(tt.meetings, tt.periods, state.weekOne, now), now);
    lines.push(banner || hint(trans.timetable.noNextClass));
    lines.push('');
    lines.push(heading(trans.timetable.hubToday));
    lines.push(renderTodayClasses(today, tt.periods, now));
    lines.push('');
  }
  if (state.statusMessage) {
    lines.push(hint(state.statusMessage));
    lines.push('');
  }
  if (state.hubField) lines.push(...state.hubField.render());
  return lines;
}

export function renderSchedule(state: ScheduleViewState, now: Date): string[] {
  const trans = t();
  switch (state.mode) {
    case 'loading':
      return [hint(trans.common.loading)];
    case 'needsLoginId':
      return [
        ...(state.errorMessage ? [hint(state.errorMessage), ''] : []),
        ...(state.idField?.render() ?? []),
      ];
    case 'needsLoginPassword':
      return state.passwordField?.render() ?? [];
    case 'authenticating':
      return [hint(state.statusMessage ?? trans.common.loading)];
    case 'needsWeekOne':
      return [
        ...(state.errorMessage ? [hint(state.errorMessage), ''] : []),
        ...(state.weekOneField?.render() ?? []),
      ];
    case 'hub':
      return renderHubBody(state, now);
    case 'week':
      return state.timetable && state.weekOne
        ? [
          heading(trans.timetable.hubWeek),
          '',
          renderWeekGrid(state.timetable.meetings, state.timetable.periods, currentWeekNumber(state.weekOne, now), now),
        ]
        : [hint(trans.timetable.genericError)];
    case 'termPicker':
      return state.termField?.render() ?? [];
    case 'unresolved':
      return [
        heading(trans.timetable.unresolvedTitle),
        '',
        renderUnresolvedItems(state.timetable?.unresolvedItems ?? []),
      ];
    case 'error':
      return [hint(state.errorMessage ?? trans.timetable.genericError)];
    default:
      return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/views/schedule-render.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/views/schedule-render.ts src/app/views/schedule-render.test.ts
git commit -m "feat(app): pure per-mode renderer for the native Schedule view"
```

---

### Task 6: `views/schedule.ts` — the stateful native Schedule view

**Files:**
- Create: `src/app/views/schedule.ts`
- Test: `src/app/views/schedule.test.ts`

**Interfaces:**
- Consumes: `ScheduleViewState`, `renderSchedule` (Task 5); `ListField`, `TextField` (Tasks 1–2); `AppContext`, `View` (Task 3); `loginWithStudentPassword`, `restoreNbtSession` (`src/auth/nbt-auth.ts`, unchanged); `createSessionStore` (`src/auth/session-store.ts`, unchanged); `AuthError` (`src/auth/errors.ts`, unchanged); `resolveTerm`, `relevantTerms`, `writePrivateIcs`, `isSessionExpired`, `JWXT_ORIGIN` (`src/features/student-timetable.ts`, unchanged, already exported); `termKey`, `loadWeekOne`, `saveWeekOne`, `saveTimetableCache`, `saveCurrentPointer`, `loadTimetableCache`, `loadCurrentPointer`, `clearScheduleCache` (`src/features/schedule-store.ts`, unchanged); `createNbtTimetableClient`, `timetableToIcs`, `TimetableError`, types (`@nbtca/nbtcal/timetable`); `setVimKeysActive` (`src/core/vim-keys.ts`, unchanged).
- Produces: `export const scheduleView: View` with `id: 'schedule'`. Consumed by Task 7 (wired into `app.ts`'s `nativeViews` map, removed from `classicFor`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/views/schedule.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { scheduleView } from './schedule.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi } from '../../core/text.js';
import type { AppContext } from '../view.js';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

function fakeCtx(): AppContext {
  return {
    size: { rows: 24, cols: 80 },
    bodyRows: 19,
    rerender: vi.fn(),
    runClassic: vi.fn(async (fn: () => Promise<void>) => { await fn(); }),
    quit: vi.fn(),
  };
}

describe('scheduleView', () => {
  it('has the expected id and title', () => {
    expect(scheduleView.id).toBe('schedule');
    expect(typeof scheduleView.title).toBe('string');
  });

  it('render() never throws before load() has run', () => {
    const ctx = fakeCtx();
    expect(() => scheduleView.render(ctx)).not.toThrow();
  });

  it('capturesInput() is false at rest (before any text field is focused)', () => {
    // Fresh module state: nothing has called load() with a login prompt yet in this test run.
    expect(scheduleView.capturesInput?.()).toBe(false);
  });

  it('render() output is non-empty text', () => {
    const ctx = fakeCtx();
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out.trim().length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/views/schedule.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/views/schedule.ts
import path from 'node:path';
import {
  createNbtTimetableClient,
  timetableToIcs,
  type AcademicTerm,
  type AcademicTermRef,
  type NbtTimetableClient,
  type Timetable,
} from '@nbtca/nbtcal/timetable';
import type { AppContext, View } from '../view.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { renderSchedule, type ScheduleViewState } from './schedule-render.js';
import { setVimKeysActive } from '../../core/vim-keys.js';
import { t } from '../../i18n/index.js';
import { AuthError } from '../../auth/errors.js';
import { loginWithStudentPassword, restoreNbtSession, type AuthenticatedNbtSession } from '../../auth/nbt-auth.js';
import { createSessionStore } from '../../auth/session-store.js';
import {
  resolveTerm, relevantTerms, writePrivateIcs, isSessionExpired, JWXT_ORIGIN,
} from '../../features/student-timetable.js';
import {
  termKey, loadWeekOne, saveWeekOne, saveTimetableCache,
  saveCurrentPointer, loadCurrentPointer, loadTimetableCache, clearScheduleCache,
} from '../../features/schedule-store.js';

let state: ScheduleViewState = { mode: 'loading' };
let session: AuthenticatedNbtSession | null = null;
let client: NbtTimetableClient | null = null;
let catalog: AcademicTerm[] = [];
let pendingId = '';

function isTimetableLike(value: unknown): value is Timetable {
  return !!value && typeof value === 'object'
    && Array.isArray((value as Timetable).meetings)
    && Array.isArray((value as Timetable).periods);
}

function buildHubField(tt: Timetable): ListField {
  const trans = t();
  const options = [
    { value: 'week', label: trans.timetable.hubWeek },
    { value: 'term', label: trans.timetable.hubSwitchTerm },
    { value: 'export', label: trans.timetable.hubExport },
    ...(tt.unresolvedItems.length > 0
      ? [{ value: 'unresolved', label: trans.timetable.hubUnresolved, hint: String(tt.unresolvedItems.length) }]
      : []),
    { value: 'logout', label: trans.timetable.hubLogout },
  ];
  return new ListField({ title: trans.timetable.menuEntry, options, footer: trans.menu.hintMove });
}

function goToLoginId(errorMessage?: string): void {
  pendingId = '';
  setVimKeysActive(false);
  state = {
    mode: 'needsLoginId',
    errorMessage,
    idField: new TextField({ message: t().timetable.studentId, placeholder: t().timetable.studentIdHint }),
  };
}

async function afterAuthenticated(ctx: AppContext, s: AuthenticatedNbtSession): Promise<void> {
  session = s;
  client = createNbtTimetableClient(s.timetableTransport, { baseUrl: JWXT_ORIGIN });
  try {
    catalog = await client.listTerms();
    const term = resolveTerm(catalog);
    const key = termKey(term);
    const weekOne = loadWeekOne(key);
    if (!weekOne) {
      setVimKeysActive(false);
      state = {
        mode: 'needsWeekOne',
        key,
        term,
        weekOneField: new TextField({ message: t().timetable.weekOne, placeholder: t().timetable.weekOneHint }),
      };
      ctx.rerender();
      return;
    }
    await fetchAndShowHub(ctx, term, key, weekOne);
  } catch {
    state = { mode: 'error', errorMessage: t().timetable.genericError };
    ctx.rerender();
  }
}

async function fetchAndShowHub(ctx: AppContext, term: AcademicTerm, key: string, weekOne: string): Promise<void> {
  if (!client) return;
  state = { mode: 'loading', statusMessage: t().calendar.loading };
  ctx.rerender();
  try {
    const timetable = await client.fetchTerm(term as AcademicTermRef);
    saveTimetableCache(key, timetable);
    saveCurrentPointer(key, weekOne);
    state = { mode: 'hub', key, term, weekOne, timetable, hubField: buildHubField(timetable) };
  } catch (err) {
    if (isSessionExpired(err)) {
      createSessionStore().clear();
      goToLoginId(t().timetable.expiredRelogin);
    } else {
      state = { mode: 'error', errorMessage: t().timetable.genericError };
    }
  }
  ctx.rerender();
}

async function refreshFromNetwork(ctx: AppContext): Promise<void> {
  const hadCache = state.mode === 'hub';
  try {
    const store = createSessionStore();
    const persisted = store.load();
    if (!persisted) {
      if (!hadCache) goToLoginId();
      return;
    }
    const restored = await restoreNbtSession(persisted);
    await afterAuthenticated(ctx, restored);
  } catch (err) {
    if (!hadCache) {
      if (err instanceof AuthError && isSessionExpired(err)) {
        createSessionStore().clear();
      }
      goToLoginId();
    }
    // best-effort: a cached hub already showed, keep it as-is on refresh failure.
  }
}

export const scheduleView: View = {
  id: 'schedule',
  title: t().timetable.menuEntry,

  async load(ctx: AppContext): Promise<void> {
    const ptr = loadCurrentPointer();
    const cached = ptr ? loadTimetableCache(ptr.termKey) : null;
    if (ptr && isTimetableLike(cached)) {
      state = { mode: 'hub', key: ptr.termKey, weekOne: ptr.weekOneMonday, timetable: cached, hubField: buildHubField(cached) };
    } else {
      state = { mode: 'loading' };
    }
    ctx.rerender();
    await refreshFromNetwork(ctx);
  },

  render(_ctx: AppContext): string[] {
    return renderSchedule(state, new Date());
  },

  capturesInput(): boolean {
    return state.mode === 'needsLoginId' || state.mode === 'needsLoginPassword' || state.mode === 'needsWeekOne';
  },

  handleKey(key: string, ctx: AppContext): void {
    switch (state.mode) {
      case 'needsLoginId': {
        const result = state.idField?.handleKey(key);
        if (result?.cancelled) { goToLoginId(); return; }
        if (result?.submitted !== undefined) {
          pendingId = result.submitted;
          state = {
            mode: 'needsLoginPassword',
            passwordField: new TextField({ message: t().timetable.password, placeholder: t().timetable.passwordHint, secret: true }),
          };
        }
        return;
      }
      case 'needsLoginPassword': {
        const result = state.passwordField?.handleKey(key);
        if (result?.cancelled) { goToLoginId(); return; }
        if (result?.submitted !== undefined) {
          const password = result.submitted;
          setVimKeysActive(true);
          state = { mode: 'authenticating', statusMessage: t().timetable.loginWillSave };
          ctx.rerender();
          void loginWithStudentPassword(pendingId, password)
            .then(async (s) => {
              createSessionStore().save(await s.snapshot());
              await afterAuthenticated(ctx, s);
            })
            .catch(() => {
              goToLoginId(t().timetable.invalidCredentials);
              ctx.rerender();
            });
        }
        return;
      }
      case 'needsWeekOne': {
        const result = state.weekOneField?.handleKey(key);
        if (result?.cancelled) { goToLoginId(); return; }
        if (result?.submitted !== undefined) {
          const trimmed = result.submitted.trim();
          const valid = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) && !Number.isNaN(new Date(`${trimmed}T00:00:00`).getTime());
          if (!valid || !state.key || !state.term) {
            state = { ...state, errorMessage: t().timetable.weekOneHint };
            return;
          }
          saveWeekOne(state.key, trimmed);
          setVimKeysActive(true);
          void fetchAndShowHub(ctx, state.term, state.key, trimmed);
        }
        return;
      }
      case 'hub': {
        const result = state.hubField?.handleKey(key);
        if (!result?.selected || !state.timetable || !state.key || !state.weekOne) return;
        if (result.selected === 'week') { state = { ...state, mode: 'week' }; return; }
        if (result.selected === 'unresolved') { state = { ...state, mode: 'unresolved' }; return; }
        if (result.selected === 'term') {
          const options = relevantTerms(catalog).map((tm) => ({
            value: `${tm.academicYear}:${tm.semester}`,
            label: tm.academicYearLabel,
            hint: tm.current ? t().common.current : undefined,
          }));
          options.push({ value: '__back__', label: t().common.back, hint: undefined });
          state = { ...state, mode: 'termPicker', termField: new ListField({ title: t().timetable.hubSwitchTerm, options }) };
          return;
        }
        if (result.selected === 'export') {
          try {
            const ics = timetableToIcs(state.timetable, { weekOneMonday: state.weekOne, calendarName: `NBT ${state.term?.academicYearLabel ?? ''}` });
            const out = `timetable-${state.key}.ics`;
            writePrivateIcs(out, ics);
            state = { ...state, statusMessage: `${t().common.success}: ${path.resolve(out)}` };
          } catch {
            state = { ...state, statusMessage: t().timetable.genericError };
          }
          return;
        }
        if (result.selected === 'logout') {
          createSessionStore().clear();
          clearScheduleCache();
          session = null;
          client = null;
          goToLoginId();
        }
        return;
      }
      case 'week':
      case 'unresolved': {
        if (state.timetable && state.key && state.weekOne) {
          state = { mode: 'hub', key: state.key, term: state.term, weekOne: state.weekOne, timetable: state.timetable, hubField: buildHubField(state.timetable) };
        }
        return;
      }
      case 'termPicker': {
        const result = state.termField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__back__' && state.timetable && state.key && state.weekOne) {
          state = { mode: 'hub', key: state.key, term: state.term, weekOne: state.weekOne, timetable: state.timetable, hubField: buildHubField(state.timetable) };
          return;
        }
        const term = resolveTerm(catalog, result.selected);
        const key = termKey(term);
        const weekOne = loadWeekOne(key);
        if (!weekOne) {
          setVimKeysActive(false);
          state = {
            mode: 'needsWeekOne',
            key,
            term,
            weekOneField: new TextField({ message: t().timetable.weekOne, placeholder: t().timetable.weekOneHint }),
          };
          return;
        }
        void fetchAndShowHub(ctx, term, key, weekOne);
        return;
      }
      default:
        return;
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/views/schedule.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full test suite and build**

Run: `npm run build && npx vitest run`
Expected: PASS, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/views/schedule.ts src/app/views/schedule.test.ts
git commit -m "feat(app): native Schedule view (login, week grid, term switch, export, unresolved items)"
```

---

### Task 7: Wire the native Schedule view into the app shell

**Files:**
- Modify: `src/app/app.ts`

**Interfaces:**
- Consumes: `scheduleView` from `src/app/views/schedule.js` (Task 6).
- Produces: `schedule` removed from `classicFor`; present in `nativeViews`. No new exports.

- [ ] **Step 1: Update imports in `app.ts`**

Remove `import { showSchedule } from '../features/schedule-view.js';` and add:

```typescript
import { scheduleView } from './views/schedule.js';
```

- [ ] **Step 2: Add `schedule` to `nativeViews` and remove it from `classicFor`**

```typescript
  const nativeViews: Partial<Record<ViewId, View>> = {
    home: homeView,
    schedule: scheduleView,
  };

  const classicFor: Partial<Record<ViewId, () => Promise<void>>> = {
    events: showCalendar,
    docs: showDocsMenu,
    settings: showSettingsMenu,
  };
```

- [ ] **Step 3: Build and run the full test suite**

Run: `npm run build && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Manual live-launch verification**

Run: `npx tsx src/index.ts` in an interactive terminal.
- [ ] Tab to Schedule: with no saved session, the id field appears immediately (not a blank/frozen screen) and typing digits (e.g. a student id) types digits — they must NOT switch tabs (this is the `capturesInput` fix; watch for it specifically since it's the easiest regression to reintroduce).
- [ ] Complete login with a real or intentionally-wrong credential pair; on success confirm the hub shows next-class/today, and if the account has any unresolved practice item, the hub shows a "Needs attention" row with a count.
- [ ] Open This week: grid renders; if the account's periods have a real gap (lunch/dinner), confirm a visible separator row appears between the affected period rows; press any key to return to hub.
- [ ] Switch term, then export; confirm the exported `.ics` path is echoed and the file exists on disk.
- [ ] Tab away to Home and back to Schedule: hub should still be showing (state persisted), not reset to a login prompt.
- [ ] Log out from the hub: returns to the id-entry field.
- [ ] Resize the terminal while in any Schedule mode: frame stays exactly `rows` lines, no scroll/corruption.
- [ ] `q` from Schedule: terminal fully restored (cursor visible, cooked mode, alt-screen left).

- [ ] **Step 5: Commit**

```bash
git add src/app/app.ts
git commit -m "feat(app): switch Schedule tab to the native app-shell view"
```

---

## Definition of done for this plan

- All 7 tasks committed.
- `npm run build && npx vitest run` passes with zero failures.
- The manual live-launch checklist in Task 7 Step 4 is fully checked off against a real terminal session.
- `src/features/schedule-view.ts` (`showSchedule`) still exists and still compiles — it is intentionally unused by the app-shell path now but remains reachable from `showMainMenu` (non-TTY fallback), per the Phase B spec's Compatibility section.

## Follow-on plans (not in this plan, per the approved spec's rollout order)

1. Native Docs view (`views/docs.ts`) — section/file/search lists native, file-reading still bridges to glow/less via `ctx.runClassic` from inside the view.
2. Native Events view (`views/events.ts`).
3. Native Settings view (`views/settings.ts`), after which `classicFor` and the "classic bridge" machinery in `app.ts` can be deleted entirely.

Each should get its own plan document under `docs/superpowers/plans/`, written the same way this one was, once this one has shipped and been used for real.
