# TUI Redesign — Phase 2B (Surface Migration & @clack Removal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap the Phase 2A widgets into every interactive surface (`ui.ts`, `links`, `settings`, `calendar`, `docs`) so the whole TUI speaks one visual language, then remove the `@clack/prompts` dependency entirely.

**Architecture:** No new components. Each surface's `@clack` calls are replaced with the equivalent Phase 2A widget: `select`→`runMenu`, `text`→`runTextInput`, `confirm`→`runConfirm`, `note`→`note`, and `core/ui.ts`'s `log.*`/`spinner` → `messages`/`startSpinner`. The pure data renderers (`renderEventsTable`, `renderServiceStatusTable`, `renderHeatmap`) are reused untouched. `isCancel(x)` cancel-detection becomes `x === null`.

**Tech Stack:** TypeScript (ESM, `.js` specifiers), Node ≥20.12, `vitest`. This plan REMOVES one dependency (`@clack/prompts`) and adds none.

## Global Constraints

- Node ≥ 20.12.0; ESM only; relative imports use `.js` specifiers.
- **No new npm dependencies.** This plan removes `@clack/prompts`.
- **Do not change** the non-interactive CLI command mode *behavior* in `src/index.ts` (flags, `--json`, `--plain`, exit codes). The only `index.ts` change allowed is swapping the `about` action's `note` source from `@clack/prompts` to `../core/components/note.js` — same rendered intent.
- `runMenu` / `runTextInput` / `runConfirm` return `value | null` (null = cancelled). Every migrated call must treat `null` as the old `isCancel(...)` case. **Where old code did `isCancel(x) || !x.trim()`, the new code must null-check first: `x === null || !x.trim()`** (calling `.trim()` on `null` throws).
- The interactive widgets self-manage vim-key translation (`setVimKeysActive`). Remove any now-redundant `setVimKeysActive(false/true)` wrappers around the migrated `text`/`confirm` call sites (docs.ts) — ownership moves into the widget.
- After each surface task, `npm run build` must be clean and `npx vitest run` green.
- Screen-frame wrapping of data views, transitions, and per-item loading are **out of scope** — those are Phase 3 polish. This plan is functional widget-swap + dependency removal.
- Follow existing conventions; keep existing i18n keys.

## Notes for the implementer

- `core/ui.ts` currently exports `success/error/warning/info/printDivider/clearScreen/printNewLine/createSpinner/handleGracefulExit`. Only `success/error/warning/info` (backed by clack `log`) and `createSpinner` (backed by clack `spinner`) touch `@clack`. Keep every export name and signature identical so feature imports don't change.
- The Phase 2A `startSpinner(msg)` returns `{ message, stop, error }` — the same methods the features call on the current spinner (`.stop(msg)`, `.error(msg)`).
- `runMenu({ title, options, footer?, initialIndex? })`: `options` is `{ value, label, hint? }[]`. It returns the selected `value` or `null`.

---

### Task 1: Rewire `core/ui.ts` off @clack

**Files:**
- Modify: `src/core/ui.ts`
- Test: `src/core/ui.test.ts` (create)

**Interfaces:**
- Consumes: `success`/`error`/`warning`/`info` from `./components/messages.js`; `startSpinner` from `./components/spinner.js`.
- Produces (unchanged names): `success`, `error`, `info`, `warning`, `printDivider`, `clearScreen`, `printNewLine`, `createSpinner`, `handleGracefulExit`.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/ui.test.ts
import { describe, it, expect } from 'vitest';
import * as ui from './ui.js';

describe('ui module (post-@clack)', () => {
  it('re-exports the message printers and a spinner factory', () => {
    expect(typeof ui.success).toBe('function');
    expect(typeof ui.error).toBe('function');
    expect(typeof ui.warning).toBe('function');
    expect(typeof ui.info).toBe('function');
    expect(typeof ui.createSpinner).toBe('function');
  });
  it('createSpinner returns an object with stop and error methods', () => {
    const s = ui.createSpinner('x'); // reduced-motion under vitest: no animation
    expect(typeof s.stop).toBe('function');
    expect(typeof s.error).toBe('function');
    s.stop();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/ui.test.ts`
Expected: FAIL — current `createSpinner` returns a clack spinner (or the import graph still pulls `@clack`); at minimum the test file is new. (If it passes by luck, proceed — the real gate is Step 3 removing the clack import.)

- [ ] **Step 3: Rewrite `src/core/ui.ts`**

Replace the top import block:

```ts
// REMOVE: import { log, spinner as clackSpinner } from '@clack/prompts';
import { success, error, warning, info } from './components/messages.js';
import { startSpinner } from './components/spinner.js';
import chalk from 'chalk';
import { pickIcon } from './icons.js';
import { t } from '../i18n/index.js';
```

Replace the four log wrappers and `createSpinner` with:

```ts
export { success, error, warning, info };

export function createSpinner(msg: string) {
  return startSpinner(msg);
}
```

Keep `printDivider`, `clearScreen`, `printNewLine`, and `handleGracefulExit` exactly as they are (they use `chalk`/`pickIcon`/`t`, no clack). Remove the old JSDoc-wrapped `success`/`error`/`info`/`warning` function definitions that called `log.*`.

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run src/core/ui.test.ts && npm run build`
Expected: test PASSES; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/ui.ts src/core/ui.test.ts
git commit -m "refactor(ui): back messages and spinner with self-rendered widgets"
```

---

### Task 2: Migrate `links.ts`

**Files:**
- Modify: `src/features/links.ts`

**Interfaces:**
- Consumes: `runMenu` from `../core/components/menu.js`; `t` for the footer keyhints (reuse `menu.hintMove/hintOpen/hintQuit` + `glyph`).

- [ ] **Step 1: Replace the imports**

In `src/features/links.ts`, remove `import { select, isCancel } from '@clack/prompts';` and add:

```ts
import { runMenu } from '../core/components/menu.js';
import { glyph } from '../core/theme.js';
```

- [ ] **Step 2: Replace `showLinksMenu`**

```ts
export async function showLinksMenu(): Promise<void> {
  const trans = t();
  const footer = `${glyph.updown()} ${trans.menu.hintMove}   ${glyph.enter()} ${trans.menu.hintOpen}   q ${trans.menu.hintQuit}`;

  const selected = await runMenu({
    title: trans.links.choose,
    options: [
      { value: URLS.homepage, label: trans.links.website },
      { value: URLS.github,   label: trans.links.github },
      { value: URLS.roadmap,  label: trans.links.roadmap },
      { value: URLS.repair,   label: trans.links.repair },
    ],
    footer,
  });

  if (selected === null) return;
  await openUrl(selected);
}
```

(`openUrl` is unchanged; it uses `createSpinner` from `../core/ui.js`, which is now the self-rendered spinner. The `chalk` import stays — `openUrl` still uses it.)

- [ ] **Step 3: Build + smoke**

Run: `npm run build && grep -c "@clack" src/features/links.ts`
Expected: build clean; grep prints `0`.

- [ ] **Step 4: Commit**

```bash
git add src/features/links.ts
git commit -m "refactor(links): use self-rendered runMenu"
```

---

### Task 3: Migrate `settings.ts`

**Files:**
- Modify: `src/features/settings.ts`

**Interfaces:**
- Consumes: `runMenu` from `../core/components/menu.js`; `note` from `../core/components/note.js`; `glyph` from `../core/theme.js`.

- [ ] **Step 1: Replace the imports**

Remove `import { select, isCancel, note } from '@clack/prompts';`. Add:

```ts
import { runMenu } from '../core/components/menu.js';
import { note } from '../core/components/note.js';
import { glyph } from '../core/theme.js';
```

- [ ] **Step 2: Add a footer helper and migrate the four menus**

At the top of `showSettingsMenu` (inside the `while`), build the footer once per iteration:

```ts
const footer = `${glyph.updown()} ${trans.menu.hintMove}   ${glyph.enter()} ${trans.menu.hintOpen}   q ${trans.menu.hintQuit}`;
```

Replace the main `select({ message: trans.theme.chooseAction, options: [...] })` with:

```ts
const action = await runMenu({
  title: trans.theme.chooseAction,
  options: [
    { value: 'language', label: trans.language.selectLanguage, hint: currentLang === 'zh' ? trans.language.zh : trans.language.en },
    { value: 'icon',     label: trans.theme.iconMode,  hint: prefs.iconMode },
    { value: 'color',    label: trans.theme.colorMode, hint: prefs.colorMode },
    { value: 'reset',    label: trans.theme.resetLabel },
    { value: 'about',    label: trans.about.title },
  ],
  footer,
});

if (action === null) return;
```

For the three sub-selects (`language`, `icon`, `color`), replace each `select<...>({ message, options, initialValue })` with `runMenu`, mapping `initialValue` to `initialIndex`. The current-value `hint: ... trans.common.current` entries stay. Example for language:

```ts
const langOptions = [
  { value: 'zh', label: trans.language.zh, hint: currentLang === 'zh' ? trans.common.current : undefined },
  { value: 'en', label: trans.language.en, hint: currentLang === 'en' ? trans.common.current : undefined },
];
const language = await runMenu({
  title: trans.language.selectLanguage,
  options: langOptions,
  footer,
  initialIndex: Math.max(0, langOptions.findIndex(o => o.value === currentLang)),
});
if (language === null) continue;
```

Apply the same shape to the `icon` menu (values `auto`/`ascii`/`unicode`, initial = `prefs.iconMode`) and the `color` menu (values `auto`/`on`/`off`, initial = `prefs.colorMode`). Replace every `isCancel(x)` with `x === null` and cast is no longer needed (`runMenu` returns the string value). The `setLanguage`/`setIconMode`/`setColorMode` calls and `notifyResult` stay unchanged. Keep the `chalk` import only if still used after edits; if not, remove it.

- [ ] **Step 3: Confirm `showAbout` uses the new `note`**

`showAbout` already calls `note(content, trans.about.title)` — with the new import it now renders via the self-rendered note. Leave its body unchanged.

- [ ] **Step 4: Build + smoke**

Run: `npm run build && grep -c "@clack" src/features/settings.ts`
Expected: build clean; grep prints `0`.

- [ ] **Step 5: Commit**

```bash
git add src/features/settings.ts
git commit -m "refactor(settings): use runMenu and self-rendered note"
```

---

### Task 4: Migrate `calendar.ts`

**Files:**
- Modify: `src/features/calendar.ts`

**Interfaces:**
- Consumes: `runMenu` from `../core/components/menu.js`; `glyph` from `../core/theme.js` (footer). `c` is already imported.

- [ ] **Step 1: Replace the imports**

Remove `import { select, isCancel } from '@clack/prompts';`. Add:

```ts
import { runMenu } from '../core/components/menu.js';
import { glyph } from '../core/theme.js';
```

- [ ] **Step 2: Migrate the two select sites**

Add a footer builder used by both (place near the top of each function, using `t()`):

```ts
const footer = `${glyph.updown()} ${trans.menu.hintMove}   ${glyph.enter()} ${trans.menu.hintOpen}   q ${trans.menu.hintQuit}`;
```

In `showPastEvents`, replace `select({ message: trans.calendar.viewPastDetail, options })` with:

```ts
const selected = await runMenu({ title: trans.calendar.viewPastDetail, options, footer });
if (selected !== null && selected !== '__back__') {
  const event = events[Number.parseInt(selected, 10)];
  if (event) await showEventDetail(event);
}
```

In `showCalendar`, replace `select({ message: trans.calendar.viewDetail, options })` with:

```ts
const selected = await runMenu({ title: trans.calendar.viewDetail, options, footer });
if (selected === null || selected === '__back__') return;
if (selected === '__past__') { await showPastEvents(); return; }
const event = events[Number.parseInt(selected, 10)];
if (event) await showEventDetail(event);
```

The `options` arrays (event rows + `__past__`/`__back__` entries) stay as-is — they are already `{ value, label, hint? }`. `showEventsPreview` and the pure renderers are unchanged.

- [ ] **Step 3: Build + smoke**

Run: `npm run build && grep -c "@clack" src/features/calendar.ts`
Expected: build clean; grep prints `0`.

- [ ] **Step 4: Commit**

```bash
git add src/features/calendar.ts
git commit -m "refactor(calendar): use runMenu for detail selection"
```

---

### Task 5: Migrate `docs.ts`

**Files:**
- Modify: `src/features/docs.ts`

**Interfaces:**
- Consumes: `runMenu` from `../core/components/menu.js`; `runTextInput` from `../core/components/text-input.js`; `runConfirm` from `../core/components/confirm.js`; `glyph` from `../core/theme.js`.

- [ ] **Step 1: Replace the imports**

Remove `import { select, isCancel, confirm, text } from '@clack/prompts';`. Add:

```ts
import { runMenu } from '../core/components/menu.js';
import { runTextInput } from '../core/components/text-input.js';
import { runConfirm } from '../core/components/confirm.js';
import { glyph } from '../core/theme.js';
```

Also remove `import { setVimKeysActive } from '../core/vim-keys.js';` **only if** it is no longer used after Step 4 (the widgets self-manage vim keys). Verify with grep before removing.

- [ ] **Step 2: Add a shared footer helper**

Add near the top of the module (after imports):

```ts
function menuFooter(): string {
  const trans = t();
  return `${glyph.updown()} ${trans.menu.hintMove}   ${glyph.enter()} ${trans.menu.hintOpen}   q ${trans.menu.hintQuit}`;
}
```

- [ ] **Step 3: Migrate every `select` site to `runMenu`**

Each `select({ message, options })` becomes `runMenu({ title: message, options, footer: menuFooter() })`, and each `if (isCancel(x) || x === '__back__')` / `if (isCancel(x))` becomes `if (x === null || x === '__back__')` / `if (x === null)`. The sites are:
- `showDocSection` (message `section.label`)
- `showArchivedSection` (two selects: `groupKey`, `fileSelected`)
- `viewMarkdownFile` (the `action` select with `back`/`browser`)
- `searchDocs` (the `selected` results select)
- `showDocsMenu` (the `action` category select)

For each, drop any `as string` cast (runMenu returns `string | null`). Keep the options arrays unchanged.

- [ ] **Step 4: Migrate `text` (search) and `confirm` (error prompt)**

In `searchDocs`, replace:

```ts
setVimKeysActive(false);
const query = await text({ message: trans.docs.searchPrompt, placeholder: trans.docs.searchPlaceholder });
setVimKeysActive(true);
if (isCancel(query) || !query.trim()) return;
```

with (the widget manages vim keys itself; **null-check before `.trim()`**):

```ts
const query = await runTextInput({ message: trans.docs.searchPrompt, placeholder: trans.docs.searchPlaceholder });
if (query === null || !query.trim()) return;
```

In `viewMarkdownFile`'s catch block, replace:

```ts
setVimKeysActive(false);
const openBrowser = await confirm({ message: trans.docs.openBrowserPrompt });
setVimKeysActive(true);
if (!isCancel(openBrowser) && openBrowser) {
  await openDocsInBrowser(filePath);
}
```

with:

```ts
const openBrowser = await runConfirm({ message: trans.docs.openBrowserPrompt });
if (openBrowser === true) {
  await openDocsInBrowser(filePath);
}
```

- [ ] **Step 5: Build + verify no clack and no dangling vim import**

Run: `npm run build && grep -c "@clack" src/features/docs.ts && grep -c "setVimKeysActive" src/features/docs.ts`
Expected: build clean; both greps print `0` (if `setVimKeysActive` count is not 0, it's still used somewhere — re-check and only remove the import if truly unused).

- [ ] **Step 6: Commit**

```bash
git add src/features/docs.ts
git commit -m "refactor(docs): use runMenu, runTextInput, and runConfirm"
```

---

### Task 6: Migrate `index.ts` about-note and remove @clack

**Files:**
- Modify: `src/index.ts` (the `about` action only)
- Modify: `package.json`, `package-lock.json` (dependency removal)

**Interfaces:**
- Consumes: `note` from `./core/components/note.js`.

- [ ] **Step 1: Replace the dynamic clack `note` import in the `about` action**

In `src/index.ts`, the `about` action currently does `const { note } = await import('@clack/prompts');`. Replace that line with `const { note } = await import('./core/components/note.js');`. Leave the rest of the `about` block (the `padEndV`/`row`/`link` construction and the final `note(content, trans.about.title)` call) unchanged.

- [ ] **Step 2: Verify zero remaining @clack references in source**

Run: `grep -rln "@clack" src`
Expected: **no output** (every source file is now clack-free).

- [ ] **Step 3: Remove the dependency**

```bash
npm uninstall @clack/prompts
```

- [ ] **Step 4: Full verification**

Run each and confirm:
```bash
npm run build                                   # clean
npx vitest run                                  # all green
grep -c "@clack/prompts" package.json           # 0
node dist/index.js status --json | head -3      # CLI mode unchanged
node dist/index.js --help | head -3             # CLI mode unchanged
node dist/index.js about                        # renders the self-rendered note block
bash scripts/test-cli.sh                         # existing CLI smoke tests pass
```

- [ ] **Step 5: Commit**

```bash
git add src/index.ts package.json package-lock.json
git commit -m "refactor: remove @clack/prompts dependency"
```

---

## Self-Review

**Spec coverage (Phase 2B slice):**
- Migrate every surface's interactive prompts to the Phase 2A widgets → Tasks 1–5. ✅
  - `status.ts` needs no direct edit: it has no `@clack` import and gets the new spinner/messages transitively via `core/ui.ts` (Task 1). ✅
- Remove `@clack/prompts` entirely → Task 6 (+ the `index.ts` about-note, the last dynamic clack usage). ✅
- Non-interactive CLI behavior preserved → Global Constraints + Task 6 Step 4 smoke checks. ✅
- **Deferred to Phase 3:** wrapping data views in the `Screen` frame, screen transitions, per-item status lighting, micro-motion, empty-state polish, and the still-open fixed-line repaint soft-wrap fix (now centralized in `painter.ts`).

**Placeholder scan:** No TBD/TODO; every migrated call site shows the exact old→new code.

**Type/behavior consistency:** All cancel paths use `x === null`; the one `.trim()`-on-input site (docs search) null-checks first per the review carry-over; `runMenu`/`runTextInput`/`runConfirm`/`startSpinner`/`note` signatures match their Phase 2A definitions; every surface footer uses the same `glyph.updown()/enter() + hintMove/hintOpen/hintQuit` composition as the main menu for visual consistency.

**Risk note:** This plan is the highest-touch of the redesign (rewires all user-facing surfaces + removes a dependency). Interactive keypress verification of each migrated surface cannot be automated here; the controller performs a live end-to-end pass (startup → each surface → back) after Task 6, in addition to the automated build/test/CLI-smoke gates in every task.
