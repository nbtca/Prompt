# TUI Redesign — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the self-rendered presentation foundation (capabilities, tokens, canvas, motion, an interactive `Menu`, and an animated startup) and wire it into the app's startup + main menu, in the "Quiet Precision" aesthetic.

**Architecture:** A thin presentation layer sits between environment detection and features. Pure, testable units (`capabilities`, `theme` tokens, `renderMenu`, `parseKey`/`nextIndex`, `buildLogoLines`) produce strings; thin side-effecting wrappers (`canvas`, `motion.typeReveal`, `runMenu`, `runStartup`) drive the terminal. Features keep returning pure strings. Motion always degrades to a static final frame.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Node ≥20.12, `chalk`, `gradient-string`, `vitest`. No new dependencies. `@clack/prompts` stays installed and used by sub-menus in Phase 1; it is removed in Phase 2.

## Global Constraints

- Node ≥ 20.12.0; ESM only; all relative imports use `.js` specifiers (e.g. `./theme.js`).
- **No new npm dependencies** in this phase.
- **Do not touch** the non-interactive CLI command mode in `src/index.ts` (flags, `--json`, `--plain`, etc.). This plan changes only interactive startup + main menu.
- Every visual effect must degrade: non-TTY / `NO_COLOR` / `CI` / `TERM=dumb` / ascii icon mode / `NBTCA_NO_MOTION` → static final frame, no cursor control, no color.
- Any new user-facing string gets both `en` and `zh` entries plus a field in the `Translations` interface.
- Single palette only — no multi-theme system.
- Follow existing conventions: co-located `*.test.ts`, `pickIcon(unicode, ascii)` for glyphs, `visualWidth`/`padEndV` from `core/text.js` for alignment.
- Tests run under vitest where `process.stdout.isTTY` is falsy; use `stripAnsi` from `core/text.js` when asserting on styled output.

---

### Task 1: Capabilities detection

**Files:**
- Create: `src/core/capabilities.ts`
- Test: `src/core/capabilities.test.ts`

**Interfaces:**
- Consumes: `useUnicodeIcons()` from `./icons.js`, `resolveColorMode()` from `../config/preferences.js`.
- Produces:
  - `interface Capabilities { isTTY: boolean; unicode: boolean; color: boolean; reducedMotion: boolean; }`
  - `deriveReducedMotion(o: { isTTY: boolean; color: boolean; unicode: boolean; env?: NodeJS.ProcessEnv }): boolean`
  - `getCapabilities(): Capabilities` (cached)
  - `resetCapabilities(): void`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/capabilities.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { deriveReducedMotion, getCapabilities, resetCapabilities } from './capabilities.js';

describe('deriveReducedMotion', () => {
  const base = { isTTY: true, color: true, unicode: true, env: {} as NodeJS.ProcessEnv };

  it('is false in a full-capability TTY with a clean env', () => {
    expect(deriveReducedMotion(base)).toBe(false);
  });
  it('is true when not a TTY', () => {
    expect(deriveReducedMotion({ ...base, isTTY: false })).toBe(true);
  });
  it('is true when color is off', () => {
    expect(deriveReducedMotion({ ...base, color: false })).toBe(true);
  });
  it('is true when unicode is off', () => {
    expect(deriveReducedMotion({ ...base, unicode: false })).toBe(true);
  });
  it('is true under CI', () => {
    expect(deriveReducedMotion({ ...base, env: { CI: '1' } })).toBe(true);
  });
  it('is true under NBTCA_NO_MOTION', () => {
    expect(deriveReducedMotion({ ...base, env: { NBTCA_NO_MOTION: '1' } })).toBe(true);
  });
  it('is true under TERM=dumb', () => {
    expect(deriveReducedMotion({ ...base, env: { TERM: 'dumb' } })).toBe(true);
  });
});

describe('getCapabilities', () => {
  afterEach(() => resetCapabilities());
  it('returns reducedMotion=true under vitest (non-TTY)', () => {
    expect(getCapabilities().reducedMotion).toBe(true);
    expect(getCapabilities().isTTY).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/capabilities.test.ts`
Expected: FAIL — cannot find module `./capabilities.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/capabilities.ts
import { useUnicodeIcons } from './icons.js';
import { resolveColorMode } from '../config/preferences.js';

export interface Capabilities {
  isTTY: boolean;
  unicode: boolean;
  color: boolean;
  reducedMotion: boolean;
}

export function deriveReducedMotion(o: {
  isTTY: boolean;
  color: boolean;
  unicode: boolean;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const env = o.env ?? process.env;
  if (!o.isTTY) return true;
  if (env['NBTCA_NO_MOTION']) return true;
  if (env['CI']) return true;
  if ((env['TERM'] || '').toLowerCase() === 'dumb') return true;
  if (!o.color) return true;
  if (!o.unicode) return true;
  return false;
}

function detectColor(): boolean {
  if (process.env['NO_COLOR']) return false;
  const mode = resolveColorMode();
  if (mode === 'off') return false;
  if (mode === 'on') return true;
  return !!process.stdout.isTTY;
}

let cached: Capabilities | null = null;

export function getCapabilities(): Capabilities {
  if (cached) return cached;
  const isTTY = !!process.stdout.isTTY && !!process.stdin.isTTY;
  const unicode = useUnicodeIcons();
  const color = detectColor();
  const reducedMotion = deriveReducedMotion({ isTTY, color, unicode });
  cached = { isTTY, unicode, color, reducedMotion };
  return cached;
}

export function resetCapabilities(): void {
  cached = null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/capabilities.test.ts`
Expected: PASS (all 9 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/core/capabilities.ts src/core/capabilities.test.ts
git commit -m "feat(core): add capabilities detection with reduced-motion derivation"
```

---

### Task 2: Design tokens (glyphs, type roles, spacing)

**Files:**
- Modify: `src/core/theme.ts` (append; keep existing `c` export unchanged)
- Test: `src/core/theme.test.ts`

**Interfaces:**
- Consumes: `pickIcon` from `./icons.js`, `chalk`.
- Produces:
  - `glyph: { cursor(): string; rule(): string; bullet(): string; dot(): string }`
  - `space: { indent: string }`
  - `type: { heading(s): string; label(s): string; body(s): string; hint(s): string }`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/theme.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { glyph, space, type } from './theme.js';
import { resetIconCache } from './icons.js';
import { stripAnsi } from './text.js';

describe('design tokens', () => {
  beforeEach(() => { resetIconCache(); });

  it('cursor glyph is → in unicode mode', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    expect(glyph.cursor()).toBe('→');
  });

  it('cursor glyph falls back to > in ascii mode', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    resetIconCache();
    expect(glyph.cursor()).toBe('>');
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
  });

  it('indent is three spaces', () => {
    expect(space.indent).toBe('   ');
  });

  it('type.hint returns its text (possibly styled)', () => {
    expect(stripAnsi(type.hint('go'))).toBe('go');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/theme.test.ts`
Expected: FAIL — `glyph`/`space`/`type` are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/core/theme.ts` (add the `pickIcon` import at the top alongside the existing `chalk` import):

```ts
import { pickIcon } from './icons.js';

export const glyph = {
  cursor: () => pickIcon('→', '>'),
  rule:   () => pickIcon('─', '-'),
  bullet: () => pickIcon('·', '.'),
  dot:    () => pickIcon('●', '*'),
};

export const space = {
  indent: '   ',
} as const;

export const type = {
  heading: (s: string) => chalk.bold.white(s),
  label:   (s: string) => chalk.white(s),
  body:    (s: string) => s,
  hint:    (s: string) => chalk.dim(s),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/theme.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/theme.ts src/core/theme.test.ts
git commit -m "feat(core): add design tokens — glyphs, type roles, spacing"
```

---

### Task 3: Canvas (ANSI primitives + cursor restore)

**Files:**
- Create: `src/core/canvas.ts`
- Test: `src/core/canvas.test.ts`

**Interfaces:**
- Produces:
  - `ansi: { hideCursor: string; showCursor: string; eraseDown: string; cursorToCol0: string; cursorUp(n: number): string }`
  - `ensureCursorRestored(): void` (idempotent; registers `exit`/`SIGINT` handlers that write `showCursor`)

- [ ] **Step 1: Write the failing test**

```ts
// src/core/canvas.test.ts
import { describe, it, expect } from 'vitest';
import { ansi, ensureCursorRestored } from './canvas.js';

describe('ansi builders', () => {
  it('hide/show cursor sequences', () => {
    expect(ansi.hideCursor).toBe('\x1b[?25l');
    expect(ansi.showCursor).toBe('\x1b[?25h');
  });
  it('cursorUp emits N-up sequence for positive N', () => {
    expect(ansi.cursorUp(3)).toBe('\x1b[3A');
  });
  it('cursorUp emits empty string for zero or negative N', () => {
    expect(ansi.cursorUp(0)).toBe('');
    expect(ansi.cursorUp(-2)).toBe('');
  });
  it('eraseDown and cursorToCol0 constants', () => {
    expect(ansi.eraseDown).toBe('\x1b[0J');
    expect(ansi.cursorToCol0).toBe('\r');
  });
});

describe('ensureCursorRestored', () => {
  it('is idempotent (safe to call twice)', () => {
    expect(() => { ensureCursorRestored(); ensureCursorRestored(); }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/canvas.test.ts`
Expected: FAIL — cannot find module `./canvas.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/canvas.ts
const CSI = '\x1b[';

export const ansi = {
  hideCursor: `${CSI}?25l`,
  showCursor: `${CSI}?25h`,
  eraseDown: `${CSI}0J`,
  cursorToCol0: '\r',
  cursorUp: (n: number): string => (n > 0 ? `${CSI}${n}A` : ''),
};

let registered = false;

export function ensureCursorRestored(): void {
  if (registered) return;
  registered = true;
  const restore = () => {
    if (process.stdout.isTTY) process.stdout.write(ansi.showCursor);
  };
  process.on('exit', restore);
  process.on('SIGINT', () => {
    restore();
    process.exit(0);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/canvas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/canvas.ts src/core/canvas.test.ts
git commit -m "feat(core): add canvas ANSI primitives and cursor-restore guard"
```

---

### Task 4: Motion (`typeReveal` with reduced-motion path)

**Files:**
- Create: `src/core/motion.ts`
- Test: `src/core/motion.test.ts`

**Interfaces:**
- Consumes: `getCapabilities()` from `./capabilities.js`.
- Produces:
  - `sleep(ms: number): Promise<void>`
  - `interface RevealOptions { reducedMotion?: boolean; stepMs?: number; write?: (s: string) => void }`
  - `typeReveal(lines: string[], opts?: RevealOptions): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/motion.test.ts
import { describe, it, expect } from 'vitest';
import { typeReveal } from './motion.js';

describe('typeReveal', () => {
  it('reduced motion writes all lines in a single call', async () => {
    const out: string[] = [];
    await typeReveal(['a', 'b', 'c'], { reducedMotion: true, write: (s) => out.push(s) });
    expect(out).toEqual(['a\nb\nc\n']);
  });

  it('animated mode writes one line per call', async () => {
    const out: string[] = [];
    await typeReveal(['a', 'b'], { reducedMotion: false, stepMs: 0, write: (s) => out.push(s) });
    expect(out).toEqual(['a\n', 'b\n']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/motion.test.ts`
Expected: FAIL — cannot find module `./motion.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/motion.ts
import { getCapabilities } from './capabilities.js';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RevealOptions {
  reducedMotion?: boolean;
  stepMs?: number;
  write?: (s: string) => void;
}

export async function typeReveal(lines: string[], opts: RevealOptions = {}): Promise<void> {
  const write = opts.write ?? ((s: string) => { process.stdout.write(s); });
  const reduced = opts.reducedMotion ?? getCapabilities().reducedMotion;

  if (reduced) {
    write(lines.join('\n') + '\n');
    return;
  }

  const stepMs = opts.stepMs ?? 45;
  for (const line of lines) {
    write(line + '\n');
    await sleep(stepMs);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/motion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/motion.ts src/core/motion.test.ts
git commit -m "feat(core): add typeReveal motion with reduced-motion fallback"
```

---

### Task 5: Menu reducers (`parseKey`, `nextIndex`)

**Files:**
- Create: `src/core/components/menu.ts`
- Test: `src/core/components/menu.test.ts`

**Interfaces:**
- Produces:
  - `type MenuKey = 'up' | 'down' | 'home' | 'end' | 'enter' | 'cancel' | 'none'`
  - `parseKey(data: Buffer | string): MenuKey`
  - `nextIndex(current: number, key: MenuKey, len: number): number`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/components/menu.test.ts
import { describe, it, expect } from 'vitest';
import { parseKey, nextIndex } from './menu.js';

describe('parseKey', () => {
  it('maps arrow sequences', () => {
    expect(parseKey('\x1b[A')).toBe('up');
    expect(parseKey('\x1b[B')).toBe('down');
    expect(parseKey('\x1b[H')).toBe('home');
    expect(parseKey('\x1b[F')).toBe('end');
  });
  it('maps enter (CR and LF)', () => {
    expect(parseKey('\r')).toBe('enter');
    expect(parseKey('\n')).toBe('enter');
  });
  it('maps ctrl-c and bare esc to cancel', () => {
    expect(parseKey('\x03')).toBe('cancel');
    expect(parseKey('\x1b')).toBe('cancel');
  });
  it('unknown input is none', () => {
    expect(parseKey('x')).toBe('none');
  });
  it('accepts a Buffer', () => {
    expect(parseKey(Buffer.from('\x1b[B'))).toBe('down');
  });
});

describe('nextIndex', () => {
  it('down wraps from last to first', () => {
    expect(nextIndex(2, 'down', 3)).toBe(0);
  });
  it('up wraps from first to last', () => {
    expect(nextIndex(0, 'up', 3)).toBe(2);
  });
  it('home and end jump to bounds', () => {
    expect(nextIndex(1, 'home', 3)).toBe(0);
    expect(nextIndex(1, 'end', 3)).toBe(2);
  });
  it('none keeps current', () => {
    expect(nextIndex(1, 'none', 3)).toBe(1);
  });
  it('empty list stays at 0', () => {
    expect(nextIndex(0, 'down', 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/components/menu.test.ts`
Expected: FAIL — cannot find module `./menu.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/components/menu.ts
export type MenuKey = 'up' | 'down' | 'home' | 'end' | 'enter' | 'cancel' | 'none';

export function parseKey(data: Buffer | string): MenuKey {
  const s = data.toString();
  switch (s) {
    case '\x1b[A': return 'up';
    case '\x1b[B': return 'down';
    case '\x1b[H': return 'home';
    case '\x1b[F': return 'end';
    case '\r':
    case '\n': return 'enter';
    case '\x03':
    case '\x1b': return 'cancel';
    default: return 'none';
  }
}

export function nextIndex(current: number, key: MenuKey, len: number): number {
  if (len <= 0) return 0;
  switch (key) {
    case 'up': return (current - 1 + len) % len;
    case 'down': return (current + 1) % len;
    case 'home': return 0;
    case 'end': return len - 1;
    default: return current;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/components/menu.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/components/menu.ts src/core/components/menu.test.ts
git commit -m "feat(menu): add key parsing and index navigation reducers"
```

---

### Task 6: `renderMenu` (pure frame renderer)

**Files:**
- Modify: `src/core/components/menu.ts` (append)
- Test: `src/core/components/menu.test.ts` (append)

**Interfaces:**
- Consumes: `glyph`, `type`, `space` from `../theme.js`; `visualWidth`, `padEndV` from `../text.js`.
- Produces:
  - `interface MenuOption { value: string; label: string; hint?: string }`
  - `interface MenuState { title: string; options: MenuOption[]; selectedIndex: number; footer?: string }`
  - `renderMenu(state: MenuState): string`

- [ ] **Step 1: Write the failing test**

Append to `src/core/components/menu.test.ts` (add `renderMenu` to the import from `./menu.js`, and add these imports at top: `import { stripAnsi } from '../text.js';` and `import { resetIconCache } from '../icons.js';`):

```ts
describe('renderMenu', () => {
  const state = {
    title: 'nbtca',
    options: [
      { value: 'events', label: 'Events', hint: '3 upcoming' },
      { value: 'docs', label: 'Docs', hint: 'wiki' },
    ],
    selectedIndex: 0,
    footer: 'up/down move',
  };

  function plain(): string[] {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    resetIconCache();
    const out = stripAnsi(renderMenu(state)).split('\n');
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    return out;
  }

  it('marks the selected option with the cursor glyph', () => {
    const lines = plain();
    const eventsLine = lines.find((l) => l.includes('Events'))!;
    const docsLine = lines.find((l) => l.includes('Docs'))!;
    expect(eventsLine).toContain('>');
    expect(docsLine).not.toContain('>');
  });

  it('includes the title and the footer', () => {
    const lines = plain();
    expect(lines[0]).toContain('nbtca');
    expect(lines[lines.length - 1]).toContain('up/down move');
  });

  it('renders hints for each option', () => {
    const lines = plain();
    expect(lines.some((l) => l.includes('3 upcoming'))).toBe(true);
    expect(lines.some((l) => l.includes('wiki'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/components/menu.test.ts`
Expected: FAIL — `renderMenu` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/core/components/menu.ts` (add imports at the top of the file):

```ts
import { glyph, type, space } from '../theme.js';
import { visualWidth, padEndV } from '../text.js';

export interface MenuOption {
  value: string;
  label: string;
  hint?: string;
}

export interface MenuState {
  title: string;
  options: MenuOption[];
  selectedIndex: number;
  footer?: string;
}

export function renderMenu(state: MenuState): string {
  const cursor = glyph.cursor();
  const gap = ' '.repeat(visualWidth(cursor));
  const labelWidth = state.options.reduce((w, o) => Math.max(w, visualWidth(o.label)), 0);

  const lines: string[] = [];
  lines.push(space.indent + type.heading(state.title));
  lines.push('');

  state.options.forEach((opt, i) => {
    const selected = i === state.selectedIndex;
    const marker = selected ? type.heading(cursor) : gap;
    const padded = padEndV(opt.label, labelWidth);
    const label = selected ? type.heading(padded) : type.body(padded);
    const hint = opt.hint ? '  ' + type.hint(opt.hint) : '';
    lines.push(`${space.indent}${marker} ${label}${hint}`);
  });

  if (state.footer) {
    lines.push('');
    lines.push(space.indent + type.hint(state.footer));
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/components/menu.test.ts`
Expected: PASS (reducer tests + renderMenu tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/components/menu.ts src/core/components/menu.test.ts
git commit -m "feat(menu): add pure renderMenu frame renderer"
```

---

### Task 7: `runMenu` (interactive input loop)

**Files:**
- Modify: `src/core/components/menu.ts` (append)
- Test: `src/core/components/menu.test.ts` (append)

**Interfaces:**
- Consumes: `ansi`, `ensureCursorRestored` from `../canvas.js`; `parseKey`, `nextIndex`, `renderMenu`, `MenuOption` (this file).
- Produces:
  - `interface RunMenuConfig { title: string; options: MenuOption[]; footer?: string; initialIndex?: number }`
  - `runMenu(config: RunMenuConfig): Promise<string | null>` — resolves the selected `value`, or `null` on cancel / non-TTY.

- [ ] **Step 1: Write the failing test**

Append to `src/core/components/menu.test.ts` (add `runMenu` to the import from `./menu.js`):

```ts
describe('runMenu', () => {
  it('resolves null when not attached to a TTY (vitest)', async () => {
    const result = await runMenu({
      title: 'nbtca',
      options: [{ value: 'events', label: 'Events' }],
    });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/components/menu.test.ts`
Expected: FAIL — `runMenu` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/core/components/menu.ts` (add the canvas import at the top):

```ts
import { ansi, ensureCursorRestored } from '../canvas.js';

export interface RunMenuConfig {
  title: string;
  options: MenuOption[];
  footer?: string;
  initialIndex?: number;
}

export function runMenu(config: RunMenuConfig): Promise<string | null> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY || !process.stdout.isTTY) {
      resolve(null);
      return;
    }

    let index = config.initialIndex ?? 0;
    let painted = 0;

    const frame = () =>
      renderMenu({
        title: config.title,
        options: config.options,
        selectedIndex: index,
        footer: config.footer,
      });

    const paint = () => {
      const f = frame();
      const lineCount = f.split('\n').length;
      if (painted > 0) {
        process.stdout.write(ansi.cursorUp(painted - 1) + ansi.cursorToCol0 + ansi.eraseDown);
      }
      process.stdout.write(f);
      painted = lineCount;
    };

    const cleanup = () => {
      stdin.removeListener('data', onData);
      if (stdin.isTTY) stdin.setRawMode(false);
      process.stdout.write('\n' + ansi.showCursor);
    };

    const onData = (data: Buffer) => {
      const key = parseKey(data);
      if (key === 'cancel') {
        cleanup();
        resolve(null);
        return;
      }
      if (key === 'enter') {
        cleanup();
        resolve(config.options[index]?.value ?? null);
        return;
      }
      const next = nextIndex(index, key, config.options.length);
      if (next !== index) {
        index = next;
        paint();
      }
    };

    ensureCursorRestored();
    stdin.setRawMode(true);
    stdin.resume();
    process.stdout.write(ansi.hideCursor);
    paint();
    stdin.on('data', onData);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/components/menu.test.ts`
Expected: PASS.

- [ ] **Step 5: Manual interactive verification**

```bash
npm run build && node dist/index.js --no-logo
```
Expected: the main menu renders with a `→` cursor on the first item. Arrow keys (and `j`/`k`) move the cursor with the highlight following; `Enter` opens a sub-menu; `q` / `Ctrl-C` prints goodbye and exits with the cursor visible. (This step depends on Task 9 wiring; run it after Task 9 if the menu is not yet wired.)

- [ ] **Step 6: Commit**

```bash
git add src/core/components/menu.ts src/core/components/menu.test.ts
git commit -m "feat(menu): add interactive runMenu input loop"
```

---

### Task 8: Animated startup

**Files:**
- Modify: `src/core/logo.ts`
- Test: `src/core/logo.test.ts`

**Interfaces:**
- Consumes: `typeReveal` from `./motion.js`; existing `readArt`, `paint`, `brand`, `TAGLINE`, `APP_INFO` in this file.
- Produces:
  - `buildLogoLines(): string[]` — flat list of single visual lines (blank, painted logo rows, blank, tagline, version, blank).
  - `runStartup(): Promise<void>` — reveals the logo via `typeReveal`; no-op when not a TTY.
- Keep `printLogo()` exported for now (unused after Task 9, removed in Phase 2) to avoid breaking any other importer.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/logo.test.ts
import { describe, it, expect } from 'vitest';
import { buildLogoLines } from './logo.js';
import { stripAnsi } from './text.js';

describe('buildLogoLines', () => {
  it('returns an array of single-line strings', () => {
    const lines = buildLogoLines();
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.every((l) => !l.includes('\n'))).toBe(true);
  });

  it('includes the tagline and a version line', () => {
    const text = buildLogoLines().map(stripAnsi).join('\n');
    expect(text).toContain('intersection of technology and liberal arts');
    expect(text).toMatch(/v\d+\.\d+\.\d+/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/logo.test.ts`
Expected: FAIL — `buildLogoLines` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/core/logo.ts`: add `import { typeReveal } from './motion.js';` near the other imports, then add the two functions (leave the existing `printLogo` in place):

```ts
export function buildLogoLines(): string[] {
  const color = !process.env['NO_COLOR'];
  const art = useUnicodeIcons() ? readArt('ca-dotmatrix.txt') : readArt('ascii-logo.txt');
  const paintedArt = paint(art ?? 'NBTCA', color).split('\n');

  return [
    '',
    ...paintedArt,
    '',
    color ? brand(TAGLINE) : TAGLINE,
    chalk.dim(`@nbtca/prompt  v${APP_INFO.version}`),
    '',
  ];
}

export async function runStartup(): Promise<void> {
  if (!process.stdout.isTTY) return;
  await typeReveal(buildLogoLines());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/logo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/logo.ts src/core/logo.test.ts
git commit -m "feat(startup): add buildLogoLines and animated runStartup"
```

---

### Task 9: Wire startup + main menu; add nav i18n

**Files:**
- Modify: `src/i18n/index.ts` (add three fields to `Translations.menu`)
- Modify: `src/i18n/locales/en.json`, `src/i18n/locales/zh.json` (add three menu keys)
- Modify: `src/main.ts` (use `runStartup`)
- Modify: `src/core/menu.ts` (use `runMenu`, drop `@clack`)

**Interfaces:**
- Consumes: `runStartup` from `./core/logo.js`; `runMenu`, `MenuOption` from `./components/menu.js`; `glyph`, `type`, `space` from `./theme.js`; `t()` from i18n.

- [ ] **Step 1: Add nav strings to the i18n type**

In `src/i18n/index.ts`, extend the `menu` block of the `Translations` interface (after `chooseAction: string;`):

```ts
    chooseAction: string;
    hintMove: string;
    hintOpen: string;
    hintQuit: string;
```

- [ ] **Step 2: Add nav strings to both locales**

In `src/i18n/locales/en.json`, within `"menu"`, change the `chooseAction` line to include the three new keys:

```json
    "chooseAction": "nbtca",
    "hintMove": "↑↓ move",
    "hintOpen": "⏎ open",
    "hintQuit": "q quit"
```

In `src/i18n/locales/zh.json`, within `"menu"`:

```json
    "chooseAction": "nbtca",
    "hintMove": "↑↓ 移动",
    "hintOpen": "⏎ 打开",
    "hintQuit": "q 退出"
```

- [ ] **Step 3: Wire `runStartup` into `main.ts`**

In `src/main.ts`, replace the import `import { printLogo } from './core/logo.js';` with `import { runStartup } from './core/logo.js';`, and replace the logo block:

```ts
    if (!options.skipLogo) {
      await runStartup();
    }
```

- [ ] **Step 4: Rewrite `showMainMenu` to use `runMenu`**

Replace the top imports and the `showMainMenu` function in `src/core/menu.ts`. Remove `import { select, isCancel, outro } from '@clack/prompts';` and `import chalk from 'chalk';`. Add:

```ts
import { runMenu, type MenuOption } from './components/menu.js';
import { type, space } from './theme.js';
```

Change `getMainMenuOptions` return type to `MenuOption[]` and rewrite `showMainMenu`:

```ts
export async function showMainMenu(): Promise<void> {
  while (true) {
    const trans = t();
    const footer = `${trans.menu.hintMove}   ${trans.menu.hintOpen}   ${trans.menu.hintQuit}`;
    const action = await runMenu({
      title: trans.menu.chooseAction,
      options: getMainMenuOptions(),
      footer,
    });

    if (action === null) {
      console.log(space.indent + type.hint(t().common.goodbye));
      process.exit(0);
    }

    await runMenuAction(action as MenuAction);
  }
}
```

(`getMainMenuOptions` already returns `{ value, label, hint }` objects, which satisfy `MenuOption[]`; add the `: MenuOption[]` return annotation.)

- [ ] **Step 5: Build and run the full test suite**

Run: `npm run build && npx vitest run`
Expected: build succeeds (no TypeScript errors — confirms `@clack` removal from `menu.ts` left no dangling references, and the `Translations` type matches both locale files); all tests PASS.

- [ ] **Step 6: Manual end-to-end verification**

```bash
node dist/index.js
```
Expected: logo reveals line-by-line, tagline appears, events preview shows, then the main menu renders with the `→` cursor and footer `↑↓ move   ⏎ open   q quit`. Arrows / `j` / `k` move; `Enter` opens a section; `q` exits with a `Goodbye!` line and a visible cursor. Then confirm graceful degradation:

```bash
NBTCA_NO_MOTION=1 node dist/index.js --no-logo   # menu paints statically, still navigable
node dist/index.js --plain                        # no color, ascii cursor '>'
node dist/index.js status --json | head -3        # CLI mode unchanged
```

- [ ] **Step 7: Commit**

```bash
git add src/i18n/index.ts src/i18n/locales/en.json src/i18n/locales/zh.json src/main.ts src/core/menu.ts
git commit -m "feat(tui): wire animated startup and self-rendered main menu"
```

---

## Self-Review

**Spec coverage (Phase 1 slice):**
- `capabilities` (isTTY/unicode/color/reducedMotion) → Task 1. ✅
- Tokens (palette use, glyphs, type roles, spacing) → Task 2. ✅ (full palette ramp lands as it's consumed; brand gradient already exists in `logo.ts`.)
- `canvas` (ANSI + cursor-restore on exit/SIGINT) → Task 3. ✅
- `motion` (reduced → final frame instantly) → Task 4. ✅
- `Menu` (cursor, aligned label·hint, keys, footer) → Tasks 5–7. ✅
- `Startup` (line-by-line reveal + tagline) → Task 8. ✅
- Wire startup + main menu, degrade gracefully, CLI untouched → Task 9. ✅
- `Screen` frame, `Spinner`/`Skeleton`, `TextInput`/`Confirm`/`Note`, per-surface migration, `@clack` removal, transitions → **deferred to Phase 2/3 plans** (by design; this plan is the foundation slice).

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every test step shows real assertions. ✅

**Type consistency:** `MenuOption`/`MenuState`/`MenuKey` defined in Tasks 5–6 and reused in Task 7/9 with matching names; `renderMenu(state: MenuState)`, `runMenu(config: RunMenuConfig): Promise<string | null>`, `typeReveal(lines, opts)`, `getCapabilities()`, `buildLogoLines()`, `runStartup()` names are consistent across tasks. ✅

**Note on interactive coverage:** `runMenu`'s keypress loop is not unit-tested (its logic is factored into the pure, tested `parseKey`/`nextIndex`/`renderMenu`); it is covered by the non-TTY guard test plus manual verification in Tasks 7 & 9.
