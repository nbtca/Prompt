# App-Shell Phase B — Native Settings View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Settings tab from the classic bridge into a native app-shell `View` — the last of the four Phase B migrations. No child processes, no network, the simplest of the four.

**Architecture:** Same `mode`-state-machine pattern as Schedule/Docs/Events, built from `ListField` only (no `TextField` — nothing here is free text). Reuses `src/config/preferences.ts` and `src/i18n/index.ts` unchanged; no new i18n keys (`theme.*`/`language.*`/`about.*` already cover everything).

**Tech Stack:** TypeScript, Node.js, Vitest. No new dependencies.

## Global Constraints

- Node.js >= 20.12.0. No new npm dependency.
- `src/features/settings.ts`'s classic `showSettingsMenu()` is not deleted — stays reachable from `showMainMenu`.
- Once this view is wired in, `classicFor` becomes empty and the classic-bridge machinery in `app.ts` (`runClassic`, `suspended`, `enter()`/`leave()` around it) may be simplified in a follow-up — **not** in this plan, to keep this change reviewable on its own.

---

### Task 1: `renderSettings` — pure per-mode body renderer

**Files:**
- Create: `src/app/views/settings-render.ts`
- Test: `src/app/views/settings-render.test.ts`

**Interfaces:**
- Consumes: `ListField` (`src/app/fields/list-field.ts`).
- Produces: `export interface SettingsViewState { mode: SettingsMode; ... }`, `export function renderSettings(state: SettingsViewState): string[]`. Consumed by Task 2.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/views/settings-render.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { renderSettings, type SettingsViewState } from './settings-render.js';
import { ListField } from '../fields/list-field.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi } from '../../core/text.js';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

describe('renderSettings', () => {
  it('menu mode shows the settings action list', () => {
    const menuField = new ListField({ title: 'Settings', options: [{ value: 'language', label: 'Language' }] });
    const out = stripAnsi(renderSettings({ mode: 'menu', menuField }).join('\n'));
    expect(out).toContain('Language');
  });

  it('a sub-list mode shows its list field', () => {
    const subField = new ListField({ title: 'Language', options: [{ value: 'zh', label: '简体中文' }, { value: 'en', label: 'English' }] });
    const out = stripAnsi(renderSettings({ mode: 'language', subField }).join('\n'));
    expect(out).toContain('English');
  });

  it('about mode shows the about lines and a back field', () => {
    const backField = new ListField({ title: 'About', options: [{ value: '__back__', label: 'Back' }] });
    const out = stripAnsi(renderSettings({ mode: 'about', aboutLines: ['NBTCA Prompt', 'v1.4.0'], backField }).join('\n'));
    expect(out).toContain('NBTCA Prompt');
    expect(out).toContain('Back');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/views/settings-render.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/views/settings-render.ts
import { space, type } from '../../core/theme.js';
import { ListField } from '../fields/list-field.js';

export type SettingsMode = 'menu' | 'language' | 'icon' | 'color' | 'about';

export interface SettingsViewState {
  mode: SettingsMode;
  menuField?: ListField;
  subField?: ListField;
  aboutLines?: string[];
  backField?: ListField;
  statusMessage?: string;
}

function hint(label: string): string {
  return `${space.indent}${type.hint(label)}`;
}

export function renderSettings(state: SettingsViewState): string[] {
  switch (state.mode) {
    case 'menu':
      return [
        ...(state.statusMessage ? [hint(state.statusMessage), ''] : []),
        ...(state.menuField?.render() ?? []),
      ];
    case 'language':
    case 'icon':
    case 'color':
      return state.subField?.render() ?? [];
    case 'about':
      return [
        ...(state.aboutLines ?? []).map((l) => `${space.indent}${l}`),
        '',
        ...(state.backField?.render() ?? []),
      ];
    default:
      return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/views/settings-render.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/views/settings-render.ts src/app/views/settings-render.test.ts
git commit -m "feat(app): pure per-mode renderer for the native Settings view"
```

---

### Task 2: `views/settings.ts` — the stateful native Settings view

**Files:**
- Create: `src/app/views/settings.ts`
- Test: `src/app/views/settings.test.ts`

**Interfaces:**
- Consumes: `SettingsViewState`, `renderSettings` (Task 1); `ListField`; `AppContext`, `View`; `loadPreferences`, `setIconMode`, `setColorMode`, `resetPreferences`, `applyColorModePreference` (`src/config/preferences.ts`, unchanged); `resetIconCache` (`src/core/icons.ts`, unchanged); `getCurrentLanguage`, `setLanguage`, `clearTranslationCache` (`src/i18n/index.ts`, unchanged); `APP_INFO`, `URLS` (`src/config/data.ts`, unchanged).
- Produces: `export const settingsView: View` with `id: 'settings'`. Consumed by Task 3.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/views/settings.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { settingsView } from './settings.js';
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

describe('settingsView', () => {
  it('has the expected id and title', () => {
    expect(settingsView.id).toBe('settings');
    expect(typeof settingsView.title).toBe('string');
  });

  it('render() never throws before load() has run', () => {
    const ctx = fakeCtx();
    expect(() => settingsView.render(ctx)).not.toThrow();
  });

  it('load() then render() shows the settings menu', async () => {
    const ctx = fakeCtx();
    await settingsView.load?.(ctx);
    const out = stripAnsi(settingsView.render(ctx).join('\n'));
    expect(out.trim().length).toBeGreaterThan(0);
  });

  it('capturesInput is false or absent (no text fields in this view)', () => {
    expect(settingsView.capturesInput?.() ?? false).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/views/settings.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/views/settings.ts
import type { AppContext, View } from '../view.js';
import { ListField } from '../fields/list-field.js';
import { renderSettings, type SettingsViewState } from './settings-render.js';
import {
  applyColorModePreference, loadPreferences, resetPreferences, setColorMode, setIconMode,
  type ColorMode, type IconMode,
} from '../../config/preferences.js';
import { resetIconCache } from '../../core/icons.js';
import { APP_INFO, URLS } from '../../config/data.js';
import { t, getCurrentLanguage, setLanguage, clearTranslationCache, type Language } from '../../i18n/index.js';

let state: SettingsViewState = { mode: 'menu' };

function buildMenuField(statusMessage?: string): SettingsViewState {
  const trans = t();
  const prefs = loadPreferences();
  const currentLang = getCurrentLanguage();
  const options = [
    { value: 'language', label: trans.language.selectLanguage, hint: currentLang === 'zh' ? trans.language.zh : trans.language.en },
    { value: 'icon', label: trans.theme.iconMode, hint: prefs.iconMode },
    { value: 'color', label: trans.theme.colorMode, hint: prefs.colorMode },
    { value: 'reset', label: trans.theme.resetLabel },
    { value: 'about', label: trans.about.title },
  ];
  return { mode: 'menu', statusMessage, menuField: new ListField({ title: trans.theme.chooseAction, options }) };
}

function goToMenu(statusMessage?: string): void {
  state = buildMenuField(statusMessage);
}

export const settingsView: View = {
  id: 'settings',
  title: t().menu.settings,

  async load(_ctx: AppContext): Promise<void> {
    goToMenu();
  },

  render(_ctx: AppContext): string[] {
    return renderSettings(state);
  },

  capturesInput(): boolean {
    return false;
  },

  handleKey(key: string, _ctx: AppContext): void {
    const trans = t();
    switch (state.mode) {
      case 'menu': {
        const result = state.menuField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === 'language') {
          const currentLang = getCurrentLanguage();
          const options = [
            { value: 'zh', label: trans.language.zh, hint: currentLang === 'zh' ? trans.common.current : undefined },
            { value: 'en', label: trans.language.en, hint: currentLang === 'en' ? trans.common.current : undefined },
          ];
          state = { mode: 'language', subField: new ListField({ title: trans.language.selectLanguage, options, initialIndex: currentLang === 'en' ? 1 : 0 }) };
          return;
        }
        if (result.selected === 'icon') {
          const prefs = loadPreferences();
          const options = [
            { value: 'auto', label: trans.theme.modeAuto, hint: prefs.iconMode === 'auto' ? trans.common.current : undefined },
            { value: 'ascii', label: trans.theme.modeAscii, hint: prefs.iconMode === 'ascii' ? trans.common.current : undefined },
            { value: 'unicode', label: trans.theme.modeUnicode, hint: prefs.iconMode === 'unicode' ? trans.common.current : undefined },
          ];
          const idx = Math.max(0, options.findIndex((o) => o.value === prefs.iconMode));
          state = { mode: 'icon', subField: new ListField({ title: trans.theme.chooseIconMode, options, initialIndex: idx }) };
          return;
        }
        if (result.selected === 'color') {
          const prefs = loadPreferences();
          const options = [
            { value: 'auto', label: trans.theme.modeAuto, hint: prefs.colorMode === 'auto' ? trans.common.current : undefined },
            { value: 'on', label: trans.theme.modeOn, hint: prefs.colorMode === 'on' ? trans.common.current : undefined },
            { value: 'off', label: trans.theme.modeOff, hint: prefs.colorMode === 'off' ? trans.common.current : undefined },
          ];
          const idx = Math.max(0, options.findIndex((o) => o.value === prefs.colorMode));
          state = { mode: 'color', subField: new ListField({ title: trans.theme.chooseColorMode, options, initialIndex: idx }) };
          return;
        }
        if (result.selected === 'reset') {
          const saved = resetPreferences();
          resetIconCache();
          applyColorModePreference(false);
          goToMenu(saved ? trans.theme.reset : trans.theme.resetSessionOnly);
          return;
        }
        if (result.selected === 'about') {
          const pad = 12;
          const row = (label: string, value: string) => `${label.padEnd(pad)}${value}`;
          state = {
            mode: 'about',
            aboutLines: [
              row(trans.about.project, APP_INFO.name),
              row(trans.about.version, `v${APP_INFO.version}`),
              row(trans.about.description, trans.about.descriptionText),
              '',
              row(trans.about.github, APP_INFO.repository),
              row(trans.about.website, URLS.homepage),
              row(trans.about.email, URLS.email),
              '',
              row(trans.about.license, `MIT  ·  ${trans.about.author}: m1ngsama`),
            ],
            backField: new ListField({ title: trans.about.title, options: [{ value: '__back__', label: trans.common.back }] }),
          };
        }
        return;
      }
      case 'language': {
        const result = state.subField?.handleKey(key);
        if (!result?.selected) return;
        const currentLang = getCurrentLanguage();
        if (result.selected !== currentLang) {
          const saved = setLanguage(result.selected as Language);
          clearTranslationCache();
          goToMenu(saved ? t().language.changed : t().language.changedSessionOnly);
        } else {
          goToMenu();
        }
        return;
      }
      case 'icon': {
        const result = state.subField?.handleKey(key);
        if (!result?.selected) return;
        const saved = setIconMode(result.selected as IconMode);
        resetIconCache();
        goToMenu(saved ? trans.theme.updated : trans.theme.updatedSessionOnly);
        return;
      }
      case 'color': {
        const result = state.subField?.handleKey(key);
        if (!result?.selected) return;
        const saved = setColorMode(result.selected as ColorMode);
        applyColorModePreference(false);
        goToMenu(saved ? trans.theme.updated : trans.theme.updatedSessionOnly);
        return;
      }
      case 'about': {
        const result = state.backField?.handleKey(key);
        if (result?.selected === '__back__') goToMenu();
        return;
      }
      default:
        return;
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/views/settings.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full test suite and build**

Run: `npm run build && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/views/settings.ts src/app/views/settings.test.ts
git commit -m "feat(app): native Settings view (language, icon, color, reset, about)"
```

---

### Task 3: Wire the native Settings view into the app shell

**Files:**
- Modify: `src/app/app.ts`

- [ ] **Step 1: Update imports and the `nativeViews`/`classicFor` maps**

Remove `import { showSettingsMenu } from '../features/settings.js';` and add:

```typescript
import { settingsView } from './views/settings.js';
```

```typescript
  const nativeViews: Partial<Record<ViewId, View>> = {
    home: homeView,
    schedule: scheduleView,
    docs: docsView,
    events: eventsView,
    settings: settingsView,
  };

  const classicFor: Partial<Record<ViewId, () => Promise<void>>> = {};
```

`classicFor` is now empty but stays declared (not deleted) — the `runClassic`/`suspended` machinery it feeds is left in place for this plan; simplifying/removing it is a follow-up, not part of this change.

- [ ] **Step 2: Build and run the full test suite**

Run: `npm run build && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Manual live-launch verification**

Run: `npx tsx src/index.ts` in an interactive terminal.
- [ ] Tab to Settings: menu shows Language/Icon mode/Color mode/Reset/About with current-value hints.
- [ ] Change language: menu re-renders in the new language immediately, with a confirmation line.
- [ ] Change icon mode to `ascii`: chrome/menu glyphs switch to ascii fallbacks immediately.
- [ ] Open About: shows project info; Back returns to the menu.
- [ ] Reset: confirmation line shown, hints return to defaults (auto/auto).
- [ ] Tab away and back: menu reflects current values (no stale state).
- [ ] `q` from Settings: terminal fully restored.

- [ ] **Step 4: Commit**

```bash
git add src/app/app.ts
git commit -m "feat(app): switch Settings tab to the native app-shell view (Phase B complete)"
```

## Definition of done

- All 3 tasks committed.
- `npm run build && npx vitest run` passes with zero failures.
- The manual live-launch checklist in Task 3 Step 3 is checked off against a real terminal session.
- `src/features/settings.ts`'s `showSettingsMenu` still exists, still compiles, stays reachable from `showMainMenu`.
- `classicFor` in `app.ts` is now `{}` — Phase B (native migration of Schedule/Docs/Events/Settings) is complete. Removing the now-dead classic-bridge scaffolding (`runClassic`, `suspended`, the `leave()`/`enter()` pair around it) is a separate cleanup, not required for this plan to be done.
