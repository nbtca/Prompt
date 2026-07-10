# TUI Redesign — Phase 2A (Widgets & Screen) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the self-rendered widget library — `Screen` frame, message helpers, `Spinner`, a shared raw-input session, `TextInput`, `Confirm`, and `Note` — that Phase 2B swaps in to unify every surface and remove `@clack/prompts`.

**Architecture:** Same layering as Phase 1. Each widget splits a pure, tested core (render function and/or key reducer returning strings) from a thin interactive driver that reuses `core/canvas.ts` (ANSI) and `core/capabilities.ts` (degradation). Widgets consume the Phase 1 design tokens (`glyph`/`type`/`space` in `theme.ts`). Nothing is wired into features here — that is Phase 2B. This plan produces a tested component library.

**Tech Stack:** TypeScript (ESM, `.js` specifiers), Node ≥20.12, `chalk`, `vitest`. No new dependencies. Widgets are drop-in replacements for these `@clack/prompts` APIs (swapped in 2B): `spinner`→`startSpinner`, `log.*`→`messages`, `note`→`note`, `text`→`runTextInput`, `confirm`→`runConfirm`.

## Global Constraints

- Node ≥ 20.12.0; ESM only; all relative imports use `.js` specifiers.
- **No new npm dependencies.**
- Every widget degrades: non-TTY / `NO_COLOR` / ascii icon mode / reduced-motion → static, no cursor control, no animation. Read this from `getCapabilities()` (Phase 1) — do not re-detect the environment.
- Alignment/width math uses `visualWidth`/`padEndV` from `core/text.js` (CJK-aware) — never raw `.length`/`.padEnd`.
- All glyphs go through the Phase 1 `glyph` tokens or `pickIcon(unicode, ascii)` with an ASCII fallback — never a bare Unicode literal in output.
- Interactive widgets (`TextInput`, `Confirm`) MUST disable vim-key translation while active (`setVimKeysActive(false)` on start, `true` on stop) so typed letters like `j`/`k` are not rewritten to arrow escapes.
- Co-located `*.test.ts`; tests strip ANSI (`stripAnsi` from `core/text.js`) and pin icon mode via `process.env.NBTCA_ICON_MODE` + `resetIconCache()`, restoring `'unicode'` afterward.
- Do NOT modify any file under `src/features/` or `src/core/ui.ts`/`src/core/menu.ts` in this plan — wiring is Phase 2B.
- Terminal safety: any widget that hides the cursor or enters raw mode restores both on every exit path; call `ensureCursorRestored()` from `core/canvas.js` as a belt-and-suspenders.

---

### Task 1: Screen frame renderer

**Files:**
- Create: `src/core/components/screen.ts`
- Test: `src/core/components/screen.test.ts`

**Interfaces:**
- Consumes: `glyph`, `type`, `space` from `../theme.js`; `visualWidth` from `../text.js`.
- Produces:
  - `interface ScreenOptions { title?: string; body: string; footer?: string; width?: number }`
  - `screenWidth(): number` — `Math.min(process.stdout.columns || 80, 64)`
  - `renderScreen(opts: ScreenOptions): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/components/screen.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderScreen } from './screen.js';
import { stripAnsi } from '../text.js';
import { resetIconCache } from '../icons.js';

describe('renderScreen', () => {
  beforeEach(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });

  function plain(opts: Parameters<typeof renderScreen>[0]): string[] {
    const out = stripAnsi(renderScreen(opts)).split('\n');
    process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache();
    return out;
  }

  it('renders title, a hairline rule under it, body, and footer', () => {
    const lines = plain({ title: 'nbtca › Status', body: '  hello body', footer: 'q back', width: 20 });
    expect(lines[0]).toContain('nbtca › Status');
    expect(lines[1]).toMatch(/^\s+-{3,}$/);          // ascii rule
    expect(lines.some(l => l.includes('hello body'))).toBe(true);
    expect(lines[lines.length - 1]).toContain('q back');
  });

  it('omits header when no title and omits footer when none', () => {
    const lines = plain({ body: '  only body', width: 20 });
    expect(lines.some(l => l.includes('only body'))).toBe(true);
    expect(lines.some(l => /^\s+-{3,}$/.test(l))).toBe(false);
  });

  it('rule width honors the provided width', () => {
    const lines = plain({ title: 't', body: 'b', width: 10 });
    const rule = lines[1]!.trim();
    expect(rule.length).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/components/screen.test.ts`
Expected: FAIL — cannot find module `./screen.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/components/screen.ts
import { glyph, type, space } from '../theme.js';

export interface ScreenOptions {
  title?: string;
  body: string;
  footer?: string;
  width?: number;
}

export function screenWidth(): number {
  return Math.min(process.stdout.columns || 80, 64);
}

export function renderScreen(opts: ScreenOptions): string {
  const width = opts.width ?? screenWidth();
  const lines: string[] = [];

  if (opts.title) {
    lines.push(space.indent + type.heading(opts.title));
    lines.push(space.indent + type.hint(glyph.rule().repeat(width)));
  }

  lines.push(opts.body);

  if (opts.footer) {
    lines.push('');
    lines.push(space.indent + type.hint(opts.footer));
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/components/screen.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/components/screen.ts src/core/components/screen.test.ts
git commit -m "feat(screen): add shared Screen frame renderer"
```

---

### Task 2: Message helpers

**Files:**
- Create: `src/core/components/messages.ts`
- Test: `src/core/components/messages.test.ts`

**Interfaces:**
- Consumes: `c` from `../theme.js`; `space` from `../theme.js`; `pickIcon` from `../icons.js`.
- Produces:
  - `type MessageKind = 'success' | 'error' | 'warn' | 'info'`
  - `renderMessage(kind: MessageKind, msg: string): string`
  - `success(msg: string): void`, `error(msg: string): void`, `warning(msg: string): void`, `info(msg: string): void` — each `console.log(renderMessage(...))`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/components/messages.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderMessage } from './messages.js';
import { stripAnsi } from '../text.js';
import { resetIconCache } from '../icons.js';

describe('renderMessage', () => {
  beforeEach(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });
  function plain(kind: Parameters<typeof renderMessage>[0], msg: string): string {
    const out = stripAnsi(renderMessage(kind, msg));
    process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache();
    return out;
  }

  it('prefixes an ascii marker and includes the message', () => {
    expect(plain('success', 'done')).toBe('   + done');
    expect(plain('error', 'boom')).toBe('   x boom');
    expect(plain('warn', 'careful')).toBe('   ! careful');
    expect(plain('info', 'note')).toBe('   > note');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/components/messages.test.ts`
Expected: FAIL — cannot find module `./messages.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/components/messages.ts
import { c, space } from '../theme.js';
import { pickIcon } from '../icons.js';

export type MessageKind = 'success' | 'error' | 'warn' | 'info';

const MARKERS: Record<MessageKind, { icon: () => string; color: (s: string) => string }> = {
  success: { icon: () => pickIcon('✓', '+'), color: c.success },
  error:   { icon: () => pickIcon('✕', 'x'), color: c.error },
  warn:    { icon: () => pickIcon('⚠', '!'), color: c.warn },
  info:    { icon: () => pickIcon('›', '>'), color: c.accent },
};

export function renderMessage(kind: MessageKind, msg: string): string {
  const m = MARKERS[kind];
  return `${space.indent}${m.color(m.icon())} ${msg}`;
}

export function success(msg: string): void { console.log(renderMessage('success', msg)); }
export function error(msg: string): void { console.log(renderMessage('error', msg)); }
export function warning(msg: string): void { console.log(renderMessage('warn', msg)); }
export function info(msg: string): void { console.log(renderMessage('info', msg)); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/components/messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/components/messages.ts src/core/components/messages.test.ts
git commit -m "feat(messages): add success/error/warn/info line renderers"
```

---

### Task 3: Spinner

**Files:**
- Create: `src/core/components/spinner.ts`
- Test: `src/core/components/spinner.test.ts`

**Interfaces:**
- Consumes: `getCapabilities` from `../capabilities.js`; `ansi`, `ensureCursorRestored` from `../canvas.js`; `renderMessage` from `./messages.js`; `pickIcon` from `../icons.js`; `c`, `space` from `../theme.js`.
- Produces:
  - `interface Spinner { message(msg: string): void; stop(msg?: string): void; error(msg?: string): void }`
  - `renderSpinnerFrame(frame: string, msg: string): string`
  - `interface SpinnerOptions { reducedMotion?: boolean; write?: (s: string) => void }`
  - `startSpinner(msg?: string, opts?: SpinnerOptions): Spinner` — auto-starts; drop-in for the current `createSpinner(msg)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/components/spinner.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderSpinnerFrame, startSpinner } from './spinner.js';
import { stripAnsi } from '../text.js';
import { resetIconCache } from '../icons.js';

describe('spinner', () => {
  beforeEach(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });
  const done = () => { process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache(); };

  it('renderSpinnerFrame places frame then message', () => {
    const out = stripAnsi(renderSpinnerFrame('|', 'loading'));
    expect(out).toBe('   | loading');
    done();
  });

  it('reduced-motion: start writes nothing, stop writes a success line', () => {
    const out: string[] = [];
    const s = startSpinner('working', { reducedMotion: true, write: (x) => out.push(x) });
    expect(out).toEqual([]);                       // no animation frames on start
    s.stop('finished');
    expect(stripAnsi(out.join(''))).toContain('+ finished');
    done();
  });

  it('reduced-motion: error writes an error line', () => {
    const out: string[] = [];
    const s = startSpinner('working', { reducedMotion: true, write: (x) => out.push(x) });
    s.error('failed');
    expect(stripAnsi(out.join(''))).toContain('x failed');
    done();
  });

  it('reduced-motion: stop with no message writes nothing', () => {
    const out: string[] = [];
    const s = startSpinner('working', { reducedMotion: true, write: (x) => out.push(x) });
    s.stop();
    expect(out.join('')).toBe('');
    done();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/components/spinner.test.ts`
Expected: FAIL — cannot find module `./spinner.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/components/spinner.ts
import { getCapabilities } from '../capabilities.js';
import { ansi, ensureCursorRestored } from '../canvas.js';
import { renderMessage } from './messages.js';
import { pickIcon } from '../icons.js';
import { c, space } from '../theme.js';

export interface Spinner {
  message(msg: string): void;
  stop(msg?: string): void;
  error(msg?: string): void;
}

export interface SpinnerOptions {
  reducedMotion?: boolean;
  write?: (s: string) => void;
}

const FRAMES_UNICODE = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const FRAMES_ASCII = ['|', '/', '-', '\\'];

export function renderSpinnerFrame(frame: string, msg: string): string {
  return `${space.indent}${c.accent(frame)} ${msg}`;
}

export function startSpinner(msg = '', opts: SpinnerOptions = {}): Spinner {
  const write = opts.write ?? ((s: string) => { process.stdout.write(s); });
  const reduced = opts.reducedMotion ?? getCapabilities().reducedMotion;
  const frames = pickIcon('u', 'a') === 'u' ? FRAMES_UNICODE : FRAMES_ASCII;

  let current = msg;
  let timer: ReturnType<typeof setInterval> | null = null;
  let i = 0;

  const clearLine = () => write(ansi.cursorToCol0 + ansi.eraseDown);

  const paint = () => {
    clearLine();
    write(renderSpinnerFrame(frames[i % frames.length]!, current));
    i++;
  };

  if (!reduced) {
    ensureCursorRestored();
    write(ansi.hideCursor);
    paint();
    timer = setInterval(paint, 80);
  }

  const finish = (line: string | null) => {
    if (timer) { clearInterval(timer); timer = null; }
    if (!reduced) { clearLine(); write(ansi.showCursor); }
    if (line) write(line + '\n');
  };

  return {
    message: (m: string) => { current = m; },
    stop: (m?: string) => finish(m ? renderMessage('success', m) : null),
    error: (m?: string) => finish(m ? renderMessage('error', m) : null),
  };
}
```

Note on `pickIcon('u','a') === 'u'`: this reuses the Phase 1 unicode/ascii decision (`pickIcon` returns its first arg in unicode mode, second in ascii mode) to pick the frame set without re-detecting capabilities.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/components/spinner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/components/spinner.ts src/core/components/spinner.test.ts
git commit -m "feat(spinner): add self-rendered spinner with reduced-motion fallback"
```

---

### Task 4: Shared raw-input session

**Files:**
- Create: `src/core/components/input-session.ts`
- Test: `src/core/components/input-session.test.ts`

**Interfaces:**
- Consumes: `ansi`, `ensureCursorRestored` from `../canvas.js`.
- Produces:
  - `interface RawInputHandle { stop(): void }`
  - `startRawInput(onData: (data: Buffer) => void): RawInputHandle | null` — enters raw mode, hides cursor, forwards `data`; returns `null` when not a TTY. `stop()` removes the listener, disables raw mode, shows the cursor (idempotent).

- [ ] **Step 1: Write the failing test**

```ts
// src/core/components/input-session.test.ts
import { describe, it, expect } from 'vitest';
import { startRawInput } from './input-session.js';

describe('startRawInput', () => {
  it('returns null when stdin is not a TTY (vitest)', () => {
    const handle = startRawInput(() => {});
    expect(handle).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/components/input-session.test.ts`
Expected: FAIL — cannot find module `./input-session.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/components/input-session.ts
import { ansi, ensureCursorRestored } from '../canvas.js';

export interface RawInputHandle {
  stop(): void;
}

export function startRawInput(onData: (data: Buffer) => void): RawInputHandle | null {
  const stdin = process.stdin;
  if (!stdin.isTTY || !process.stdout.isTTY) return null;

  let stopped = false;
  ensureCursorRestored();
  stdin.setRawMode(true);
  stdin.resume();
  process.stdout.write(ansi.hideCursor);
  stdin.on('data', onData);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      stdin.removeListener('data', onData);
      if (stdin.isTTY) stdin.setRawMode(false);
      process.stdout.write(ansi.showCursor);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/components/input-session.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/components/input-session.ts src/core/components/input-session.test.ts
git commit -m "feat(input): add shared raw-input session helper"
```

---

### Task 5: TextInput reducers + renderer

**Files:**
- Create: `src/core/components/text-input.ts`
- Test: `src/core/components/text-input.test.ts`

**Interfaces:**
- Consumes: `glyph`, `type`, `space` from `../theme.js`.
- Produces:
  - `type InputEvent = { type: 'char'; ch: string } | { type: 'backspace' } | { type: 'enter' } | { type: 'cancel' } | { type: 'none' }`
  - `parseInputData(data: Buffer | string): InputEvent`
  - `applyInputEvent(value: string, ev: InputEvent): string`
  - `renderInput(opts: { message: string; value: string; placeholder?: string }): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/components/text-input.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { parseInputData, applyInputEvent, renderInput } from './text-input.js';
import { stripAnsi } from '../text.js';
import { resetIconCache } from '../icons.js';

describe('parseInputData', () => {
  it('classifies control keys', () => {
    expect(parseInputData('\r').type).toBe('enter');
    expect(parseInputData('\n').type).toBe('enter');
    expect(parseInputData('\x03').type).toBe('cancel');
    expect(parseInputData('\x1b').type).toBe('cancel');
    expect(parseInputData('\x7f').type).toBe('backspace');
    expect(parseInputData('\b').type).toBe('backspace');
  });
  it('classifies a printable character', () => {
    expect(parseInputData('a')).toEqual({ type: 'char', ch: 'a' });
    expect(parseInputData('中')).toEqual({ type: 'char', ch: '中' });
  });
  it('ignores other control/escape sequences as none', () => {
    expect(parseInputData('\x1b[A').type).toBe('none');
  });
});

describe('applyInputEvent', () => {
  it('appends chars and removes on backspace', () => {
    let v = '';
    v = applyInputEvent(v, { type: 'char', ch: 'h' });
    v = applyInputEvent(v, { type: 'char', ch: 'i' });
    expect(v).toBe('hi');
    v = applyInputEvent(v, { type: 'backspace' });
    expect(v).toBe('h');
  });
  it('backspace on empty stays empty; non-edit events are no-ops', () => {
    expect(applyInputEvent('', { type: 'backspace' })).toBe('');
    expect(applyInputEvent('x', { type: 'enter' })).toBe('x');
  });
});

describe('renderInput', () => {
  beforeEach(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });
  function plain(o: Parameters<typeof renderInput>[0]): string {
    const out = stripAnsi(renderInput(o));
    process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache();
    return out;
  }
  it('shows the message and the current value', () => {
    expect(plain({ message: 'Search', value: 'abc' })).toContain('Search');
    expect(plain({ message: 'Search', value: 'abc' })).toContain('abc');
  });
  it('shows the placeholder when value is empty', () => {
    expect(plain({ message: 'Search', value: '', placeholder: 'type here' })).toContain('type here');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/components/text-input.test.ts`
Expected: FAIL — cannot find module `./text-input.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/components/text-input.ts
import { glyph, type, space } from '../theme.js';

export type InputEvent =
  | { type: 'char'; ch: string }
  | { type: 'backspace' }
  | { type: 'enter' }
  | { type: 'cancel' }
  | { type: 'none' };

export function parseInputData(data: Buffer | string): InputEvent {
  const s = data.toString();
  if (s === '\r' || s === '\n') return { type: 'enter' };
  if (s === '\x03' || s === '\x1b') return { type: 'cancel' };
  if (s === '\x7f' || s === '\b') return { type: 'backspace' };
  // Single printable character (not a control byte, not a multi-byte escape seq)
  if ([...s].length === 1 && s >= ' ') return { type: 'char', ch: s };
  return { type: 'none' };
}

export function applyInputEvent(value: string, ev: InputEvent): string {
  if (ev.type === 'char') return value + ev.ch;
  if (ev.type === 'backspace') return [...value].slice(0, -1).join('');
  return value;
}

export function renderInput(opts: { message: string; value: string; placeholder?: string }): string {
  const shown = opts.value.length > 0
    ? type.body(opts.value)
    : type.hint(opts.placeholder ?? '');
  return [
    space.indent + type.label(opts.message),
    `${space.indent}${type.heading(glyph.cursor())} ${shown}`,
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/components/text-input.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/components/text-input.ts src/core/components/text-input.test.ts
git commit -m "feat(text-input): add input reducers and renderer"
```

---

### Task 6: TextInput interactive loop

**Files:**
- Modify: `src/core/components/text-input.ts` (append)
- Test: `src/core/components/text-input.test.ts` (append)

**Interfaces:**
- Consumes: `startRawInput` from `./input-session.js`; `ansi` from `../canvas.js`; `setVimKeysActive` from `../vim-keys.js`; local `parseInputData`/`applyInputEvent`/`renderInput`.
- Produces:
  - `interface RunTextInputConfig { message: string; placeholder?: string }`
  - `runTextInput(config: RunTextInputConfig): Promise<string | null>` — resolves the entered text on Enter, or `null` on cancel / non-TTY.

- [ ] **Step 1: Write the failing test**

Append to `src/core/components/text-input.test.ts` (add `runTextInput` to the import from `./text-input.js`):

```ts
describe('runTextInput', () => {
  it('resolves null when not attached to a TTY (vitest)', async () => {
    const result = await runTextInput({ message: 'Search', placeholder: 'x' });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/components/text-input.test.ts`
Expected: FAIL — `runTextInput` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/core/components/text-input.ts` (add the imports at the top of the file):

```ts
import { startRawInput } from './input-session.js';
import { ansi } from '../canvas.js';
import { setVimKeysActive } from '../vim-keys.js';

export interface RunTextInputConfig {
  message: string;
  placeholder?: string;
}

export function runTextInput(config: RunTextInputConfig): Promise<string | null> {
  return new Promise((resolve) => {
    let value = '';
    let painted = 0;

    const frame = () => renderInput({ message: config.message, value, placeholder: config.placeholder });

    const paint = () => {
      const f = frame();
      const lineCount = f.split('\n').length;
      if (painted > 0) {
        process.stdout.write(ansi.cursorUp(painted - 1) + ansi.cursorToCol0 + ansi.eraseDown);
      }
      process.stdout.write(f);
      painted = lineCount;
    };

    const onData = (data: Buffer) => {
      const ev = parseInputData(data);
      if (ev.type === 'cancel') { finish(null); return; }
      if (ev.type === 'enter') { finish(value); return; }
      const next = applyInputEvent(value, ev);
      if (next !== value) { value = next; paint(); }
    };

    const finish = (result: string | null) => {
      handle?.stop();
      setVimKeysActive(true);
      process.stdout.write('\n');
      resolve(result);
    };

    setVimKeysActive(false);
    const handle = startRawInput(onData);
    if (!handle) { setVimKeysActive(true); resolve(null); return; }
    paint();
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/components/text-input.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/components/text-input.ts src/core/components/text-input.test.ts
git commit -m "feat(text-input): add interactive runTextInput loop"
```

---

### Task 7: Confirm

**Files:**
- Create: `src/core/components/confirm.ts`
- Test: `src/core/components/confirm.test.ts`

**Interfaces:**
- Consumes: `startRawInput` from `./input-session.js`; `ansi` from `../canvas.js`; `setVimKeysActive` from `../vim-keys.js`; `glyph`, `type`, `space` from `../theme.js`.
- Produces:
  - `type ConfirmEvent = 'yes' | 'no' | 'toggle' | 'submit' | 'cancel' | 'none'`
  - `parseConfirmData(data: Buffer | string): ConfirmEvent`
  - `renderConfirm(opts: { message: string; value: boolean }): string`
  - `interface RunConfirmConfig { message: string; initial?: boolean }`
  - `runConfirm(config: RunConfirmConfig): Promise<boolean | null>` — resolves the choice, or `null` on cancel / non-TTY.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/components/confirm.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { parseConfirmData, renderConfirm, runConfirm } from './confirm.js';
import { stripAnsi } from '../text.js';
import { resetIconCache } from '../icons.js';

describe('parseConfirmData', () => {
  it('maps y/n, toggles, submit, and cancel', () => {
    expect(parseConfirmData('y')).toBe('yes');
    expect(parseConfirmData('Y')).toBe('yes');
    expect(parseConfirmData('n')).toBe('no');
    expect(parseConfirmData('N')).toBe('no');
    expect(parseConfirmData('\t')).toBe('toggle');
    expect(parseConfirmData('\x1b[C')).toBe('toggle');
    expect(parseConfirmData('\x1b[D')).toBe('toggle');
    expect(parseConfirmData('\r')).toBe('submit');
    expect(parseConfirmData('\x03')).toBe('cancel');
    expect(parseConfirmData('\x1b')).toBe('cancel');
    expect(parseConfirmData('q')).toBe('none');
  });
});

describe('renderConfirm', () => {
  beforeEach(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });
  function plain(o: Parameters<typeof renderConfirm>[0]): string {
    const out = stripAnsi(renderConfirm(o));
    process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache();
    return out;
  }
  it('shows message and both options', () => {
    const out = plain({ message: 'Open browser?', value: true });
    expect(out).toContain('Open browser?');
    expect(out).toContain('Yes');
    expect(out).toContain('No');
  });
});

describe('runConfirm', () => {
  it('resolves null when not attached to a TTY (vitest)', async () => {
    expect(await runConfirm({ message: 'ok?' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/components/confirm.test.ts`
Expected: FAIL — cannot find module `./confirm.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/components/confirm.ts
import { startRawInput } from './input-session.js';
import { ansi } from '../canvas.js';
import { setVimKeysActive } from '../vim-keys.js';
import { glyph, type, space } from '../theme.js';

export type ConfirmEvent = 'yes' | 'no' | 'toggle' | 'submit' | 'cancel' | 'none';

export function parseConfirmData(data: Buffer | string): ConfirmEvent {
  const s = data.toString();
  if (s === 'y' || s === 'Y') return 'yes';
  if (s === 'n' || s === 'N') return 'no';
  if (s === '\t' || s === '\x1b[C' || s === '\x1b[D') return 'toggle';
  if (s === '\r' || s === '\n') return 'submit';
  if (s === '\x03' || s === '\x1b') return 'cancel';
  return 'none';
}

export function renderConfirm(opts: { message: string; value: boolean }): string {
  const cursor = glyph.cursor();
  const gap = ' '.repeat(cursor.length);
  const yes = opts.value ? `${type.heading(cursor)} ${type.heading('Yes')}` : `${gap} ${type.body('Yes')}`;
  const no = opts.value ? `${gap} ${type.body('No')}` : `${type.heading(cursor)} ${type.heading('No')}`;
  return [
    space.indent + type.label(opts.message),
    `${space.indent}${yes}   ${no}`,
  ].join('\n');
}

export interface RunConfirmConfig {
  message: string;
  initial?: boolean;
}

export function runConfirm(config: RunConfirmConfig): Promise<boolean | null> {
  return new Promise((resolve) => {
    let value = config.initial ?? true;
    let painted = 0;

    const frame = () => renderConfirm({ message: config.message, value });

    const paint = () => {
      const f = frame();
      const lineCount = f.split('\n').length;
      if (painted > 0) {
        process.stdout.write(ansi.cursorUp(painted - 1) + ansi.cursorToCol0 + ansi.eraseDown);
      }
      process.stdout.write(f);
      painted = lineCount;
    };

    const finish = (result: boolean | null) => {
      handle?.stop();
      setVimKeysActive(true);
      process.stdout.write('\n');
      resolve(result);
    };

    const onData = (data: Buffer) => {
      const ev = parseConfirmData(data);
      if (ev === 'cancel') { finish(null); return; }
      if (ev === 'submit') { finish(value); return; }
      if (ev === 'yes' && value !== true) { value = true; paint(); return; }
      if (ev === 'no' && value !== false) { value = false; paint(); return; }
      if (ev === 'toggle') { value = !value; paint(); return; }
    };

    setVimKeysActive(false);
    const handle = startRawInput(onData);
    if (!handle) { setVimKeysActive(true); resolve(null); return; }
    paint();
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/components/confirm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/components/confirm.ts src/core/components/confirm.test.ts
git commit -m "feat(confirm): add yes/no confirm prompt"
```

---

### Task 8: Note

**Files:**
- Create: `src/core/components/note.ts`
- Test: `src/core/components/note.test.ts`

**Interfaces:**
- Consumes: `glyph`, `type`, `space` from `../theme.js`; `visualWidth` from `../text.js`.
- Produces:
  - `renderNote(message: string, title?: string): string` — title heading + hairline rule sized to content + indented body lines.
  - `note(message: string, title?: string): void` — `console.log(renderNote(...))`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/components/note.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderNote } from './note.js';
import { stripAnsi } from '../text.js';
import { resetIconCache } from '../icons.js';

describe('renderNote', () => {
  beforeEach(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });
  function plain(msg: string, title?: string): string[] {
    const out = stripAnsi(renderNote(msg, title)).split('\n');
    process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache();
    return out;
  }

  it('renders title, a rule, and each body line indented', () => {
    const lines = plain('line one\nline two', 'About');
    expect(lines[0]).toContain('About');
    expect(lines.some(l => /^\s+-{3,}$/.test(l))).toBe(true);
    expect(lines.some(l => l.includes('line one'))).toBe(true);
    expect(lines.some(l => l.includes('line two'))).toBe(true);
  });

  it('works without a title (no rule)', () => {
    const lines = plain('just body');
    expect(lines.some(l => l.includes('just body'))).toBe(true);
    expect(lines.some(l => /^\s+-{3,}$/.test(l))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/components/note.test.ts`
Expected: FAIL — cannot find module `./note.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/components/note.ts
import { glyph, type, space } from '../theme.js';
import { visualWidth } from '../text.js';

export function renderNote(message: string, title?: string): string {
  const bodyLines = message.split('\n');
  const lines: string[] = [];

  if (title) {
    const width = Math.max(
      visualWidth(title),
      ...bodyLines.map((l) => visualWidth(l)),
    );
    lines.push(space.indent + type.heading(title));
    lines.push(space.indent + type.hint(glyph.rule().repeat(width)));
  }

  for (const line of bodyLines) {
    lines.push(space.indent + line);
  }

  return lines.join('\n');
}

export function note(message: string, title?: string): void {
  console.log(renderNote(message, title));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/components/note.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `npx vitest run` — Expected: all tests PASS.

```bash
git add src/core/components/note.ts src/core/components/note.test.ts
git commit -m "feat(note): add quiet note block renderer"
```

---

## Self-Review

**Spec coverage (Phase 2A slice — the reusable widget library):**
- `Screen` shared frame → Task 1. ✅
- Message/log helpers (replace clack `log.*`) → Task 2. ✅
- `Spinner`/loading rhythm (replace clack `spinner`) → Task 3. ✅
- Shared raw-input plumbing → Task 4. ✅
- `TextInput` (replace clack `text`) → Tasks 5–6. ✅
- `Confirm` (replace clack `confirm`) → Task 7. ✅
- `Note` (replace clack `note`) → Task 8. ✅
- **Deferred to Phase 2B:** wiring every widget into `status`/`calendar`/`docs`/`links`/`settings`, repointing `core/ui.ts`, and removing `@clack/prompts`. (By design — 2A is the component library; 2B is migration + removal.)

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every test step shows real assertions. ✅

**Type consistency:** `Spinner`, `SpinnerOptions`, `RawInputHandle`, `InputEvent`, `RunTextInputConfig`, `ConfirmEvent`, `RunConfirmConfig` are defined once and reused with matching names; `startSpinner`/`startRawInput`/`runTextInput`/`runConfirm`/`renderScreen`/`renderMessage`/`renderNote` signatures are consistent across tasks. ✅

**Notes on interactive coverage:** `runTextInput`/`runConfirm` keypress loops are not unit-tested (their logic lives in the pure, tested `parse*`/`apply*`/`render*` functions); each has a non-TTY guard test, and full interactive verification happens in Phase 2B when they are wired into `docs`. The `Spinner` animation timer is likewise covered only via its pure `renderSpinnerFrame` + the reduced-motion path; the animated branch is exercised live in 2B.

**YAGNI check:** Every widget has a known consumer in Phase 2B (Screen→all surfaces; messages/Spinner→all loads; TextInput/Confirm→docs; Note→settings about). None is speculative.
