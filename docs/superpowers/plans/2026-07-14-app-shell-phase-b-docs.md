# App-Shell Phase B — Native Docs View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Docs tab from the classic bridge into a native app-shell `View`: section/file/search navigation stays inside the alt-screen frame; opening an actual file is the one deliberate exception, bridging to glow/less via `ctx.runClassic` from inside the view itself (not the app-level `classicFor` table), then returning to the same list position — never to Home.

**Architecture:** Same pattern proven by the native Schedule view (`2026-07-14-app-shell-phase-b-schedule.md`): a `mode`-based state machine built from `ListField`/`TextField` (already built, reused as-is) plus the classic Docs feature module's already-pure grouping/formatting functions, now exported for reuse (`buildSections`, `getArchivedGroups`, `cleanFileName`, `fetchSections`, `viewMarkdownFile` — done in a prep commit ahead of this plan). A pure `renderDocs(state)` composes each mode's body, mirroring `views/schedule-render.ts`.

**Tech Stack:** TypeScript, Node.js, Vitest. No new dependencies.

## Global Constraints

- Node.js >= 20.12.0.
- No new npm dependency.
- All new user-facing strings need both `src/i18n/locales/en.json` and `src/i18n/locales/zh.json` entries.
- Non-interactive CLI command mode is untouched.
- `src/features/docs.ts`'s classic `showDocsMenu()` is not deleted — it stays reachable from `showMainMenu` (non-TTY fallback).
- Docs data (`fetchSections()`) is fetched once per app session and cached in the view's own module state — re-entering the tab must not re-fetch (unlike Schedule, there's no "freshness" requirement here; avoid hitting the GitHub-backed `@nbtca/docs` client on every tab switch).

---

### Task 1: `renderDocs` — pure per-mode body renderer

**Files:**
- Create: `src/app/views/docs-render.ts`
- Test: `src/app/views/docs-render.test.ts`

**Interfaces:**
- Consumes: `ListField`, `TextField` (`src/app/fields/*.ts`, unchanged); `DocSection` type (`src/features/docs.ts`, now exported); `DocItem` type (`@nbtca/docs`, already a dependency).
- Produces: `export interface DocsViewState { mode: DocsMode; ... }`, `export function renderDocs(state: DocsViewState): string[]`. Consumed by Task 2.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/views/docs-render.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { renderDocs, type DocsViewState } from './docs-render.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi } from '../../core/text.js';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

describe('renderDocs', () => {
  it('loading mode shows a loading hint', () => {
    const out = stripAnsi(renderDocs({ mode: 'loading' }).join('\n'));
    expect(out.trim().length).toBeGreaterThan(0);
  });

  it('sections mode renders the sections list field', () => {
    const sectionsField = new ListField({ title: 'Docs', options: [{ value: 'tutorial', label: 'Tutorial' }] });
    const out = stripAnsi(renderDocs({ mode: 'sections', sectionsField }).join('\n'));
    expect(out).toContain('Tutorial');
  });

  it('files mode renders the files list field', () => {
    const filesField = new ListField({ title: 'Tutorial', options: [{ value: 'a.md', label: 'Getting Started' }] });
    const out = stripAnsi(renderDocs({ mode: 'files', filesField }).join('\n'));
    expect(out).toContain('Getting Started');
  });

  it('search mode renders the text field', () => {
    const searchField = new TextField({ message: 'Search docs' });
    const out = stripAnsi(renderDocs({ mode: 'search', searchField }).join('\n'));
    expect(out).toContain('Search docs');
  });

  it('searchResults mode renders the results list field', () => {
    const searchResultsField = new ListField({ title: 'Results', options: [{ value: 'x.md', label: 'X Doc' }] });
    const out = stripAnsi(renderDocs({ mode: 'searchResults', searchResultsField }).join('\n'));
    expect(out).toContain('X Doc');
  });

  it('error mode shows the error message', () => {
    const out = stripAnsi(renderDocs({ mode: 'error', errorMessage: 'Broke' }).join('\n'));
    expect(out).toContain('Broke');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/views/docs-render.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/views/docs-render.ts
import { type, space } from '../../core/theme.js';
import { t } from '../../i18n/index.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';

export type DocsMode =
  | 'loading'
  | 'sections'
  | 'files'
  | 'archivedGroups'
  | 'archivedFiles'
  | 'search'
  | 'searchResults'
  | 'error';

export interface DocsViewState {
  mode: DocsMode;
  errorMessage?: string;
  sectionsField?: ListField;
  filesField?: ListField;
  archivedGroupsField?: ListField;
  archivedFilesField?: ListField;
  searchField?: TextField;
  searchResultsField?: ListField;
  searchResultsEmpty?: boolean;
}

function hint(label: string): string {
  return `${space.indent}${type.hint(label)}`;
}

export function renderDocs(state: DocsViewState): string[] {
  const trans = t();
  switch (state.mode) {
    case 'loading':
      return [hint(trans.common.loading)];
    case 'sections':
      return state.sectionsField?.render() ?? [];
    case 'files':
      return state.filesField?.render() ?? [];
    case 'archivedGroups':
      return state.archivedGroupsField?.render() ?? [];
    case 'archivedFiles':
      return state.archivedFilesField?.render() ?? [];
    case 'search':
      return state.searchField?.render() ?? [];
    case 'searchResults':
      return [
        ...(state.searchResultsEmpty ? [hint(trans.docs.searchNoResults), ''] : []),
        ...(state.searchResultsField?.render() ?? []),
      ];
    case 'error':
      return [hint(state.errorMessage ?? trans.docs.loadError)];
    default:
      return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/views/docs-render.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/views/docs-render.ts src/app/views/docs-render.test.ts
git commit -m "feat(app): pure per-mode renderer for the native Docs view"
```

---

### Task 2: `views/docs.ts` — the stateful native Docs view

**Files:**
- Create: `src/app/views/docs.ts`
- Test: `src/app/views/docs.test.ts`

**Interfaces:**
- Consumes: `DocsViewState`, `renderDocs` (Task 1); `ListField`, `TextField`; `AppContext`, `View`; `fetchSections`, `fetchAllDocs`, `getArchivedGroups`, `cleanFileName`, `viewMarkdownFile`, `openDocsInBrowser`, `type DocSection` (`src/features/docs.ts`, now exported).
- Produces: `export const docsView: View` with `id: 'docs'`. Consumed by Task 3.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/views/docs.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { docsView } from './docs.js';
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

describe('docsView', () => {
  it('has the expected id and title', () => {
    expect(docsView.id).toBe('docs');
    expect(typeof docsView.title).toBe('string');
  });

  it('render() never throws before load() has run', () => {
    const ctx = fakeCtx();
    expect(() => docsView.render(ctx)).not.toThrow();
  });

  it('render() output is non-empty text', () => {
    const ctx = fakeCtx();
    const out = stripAnsi(docsView.render(ctx).join('\n'));
    expect(out.trim().length).toBeGreaterThan(0);
  });

  it('capturesInput() returns a boolean and does not throw', () => {
    expect(typeof docsView.capturesInput?.()).toBe('boolean');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/views/docs.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/views/docs.ts
import type { DocItem } from '@nbtca/docs';
import type { AppContext, View } from '../view.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { renderDocs, type DocsViewState } from './docs-render.js';
import { setVimKeysActive } from '../../core/vim-keys.js';
import { t } from '../../i18n/index.js';
import {
  fetchSections, fetchAllDocs, getArchivedGroups, cleanFileName, viewMarkdownFile, openDocsInBrowser,
  type DocSection,
} from '../../features/docs.js';

let state: DocsViewState = { mode: 'loading' };
let sections: DocSection[] = [];
let activeSection: DocSection | null = null;
let archivedGroups: Map<string, DocItem[]> = new Map();
let activeGroupKey: string | null = null;
let loaded = false;

function backLabel(): string {
  return t().common.back;
}

function buildSectionsField(): ListField {
  const trans = t();
  const options = [
    ...sections.map((sec) => ({ value: sec.key, label: sec.label, hint: String(sec.count) })),
    { value: '__search__', label: trans.docs.searchPrompt.replace(':', '') },
    { value: '__browser__', label: trans.docs.openBrowser },
  ];
  return new ListField({ title: trans.docs.chooseCategory, options });
}

function buildFilesField(section: DocSection): ListField {
  const files = section.files.filter((f) => f.name !== 'index.md' && !f.name.startsWith('index.'));
  const options = [
    ...files.map((f) => ({ value: f.path, label: cleanFileName(f.name) })),
    { value: '__back__', label: backLabel() },
  ];
  return new ListField({ title: section.label, options });
}

function buildArchivedGroupsField(groups: Map<string, DocItem[]>): ListField {
  const trans = t();
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    const aYear = /^\d{4}$/.test(a);
    const bYear = /^\d{4}$/.test(b);
    if (aYear && bYear) return Number(b) - Number(a);
    if (aYear) return -1;
    if (bYear) return 1;
    return a.localeCompare(b);
  });
  const options = [
    ...sortedKeys.map((k) => ({ value: k, label: k, hint: String(groups.get(k)!.length) })),
    { value: '__back__', label: backLabel() },
  ];
  return new ListField({ title: trans.docs.categoryArchived, options });
}

function buildArchivedFilesField(groupKey: string, groupFiles: DocItem[]): ListField {
  const trans = t();
  const subDirs = new Set(groupFiles.map((f) => f.path.split('/')[2]).filter(Boolean));
  const options = [
    ...groupFiles.map((f) => {
      const sub = f.path.split('/').slice(2, -1).join('/');
      return { value: f.path, label: cleanFileName(f.name), hint: subDirs.size > 1 ? sub : undefined };
    }),
    { value: '__back__', label: backLabel() },
  ];
  return new ListField({ title: `${trans.docs.categoryArchived} · ${groupKey}`, options });
}

function goToSections(): void {
  state = { mode: 'sections', sectionsField: buildSectionsField() };
}

async function openFile(ctx: AppContext, path: string): Promise<void> {
  await ctx.runClassic(() => viewMarkdownFile(path));
}

export const docsView: View = {
  id: 'docs',
  title: t().menu.docs,

  async load(ctx: AppContext): Promise<void> {
    if (loaded) return; // fetched once per app session; re-entering the tab reuses it.
    state = { mode: 'loading' };
    ctx.rerender();
    try {
      sections = await fetchSections();
      loaded = true;
      goToSections();
    } catch {
      state = { mode: 'error', errorMessage: t().docs.loadError };
    }
    ctx.rerender();
  },

  render(_ctx: AppContext): string[] {
    return renderDocs(state);
  },

  capturesInput(): boolean {
    return state.mode === 'search';
  },

  handleKey(key: string, ctx: AppContext): void {
    switch (state.mode) {
      case 'sections': {
        const result = state.sectionsField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__search__') {
          setVimKeysActive(false);
          state = { mode: 'search', searchField: new TextField({ message: t().docs.searchPrompt, placeholder: t().docs.searchPlaceholder, allowEmpty: true }) };
          return;
        }
        if (result.selected === '__browser__') {
          void openDocsInBrowser();
          return;
        }
        const section = sections.find((s) => s.key === result.selected);
        if (!section) return;
        activeSection = section;
        if (section.key === 'archived') {
          archivedGroups = getArchivedGroups(section.files);
          state = { mode: 'archivedGroups', archivedGroupsField: buildArchivedGroupsField(archivedGroups) };
        } else {
          state = { mode: 'files', filesField: buildFilesField(section) };
        }
        return;
      }
      case 'files': {
        const result = state.filesField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__back__') { goToSections(); return; }
        void openFile(ctx, result.selected).then(() => {
          if (activeSection) state = { mode: 'files', filesField: buildFilesField(activeSection) };
          ctx.rerender();
        });
        return;
      }
      case 'archivedGroups': {
        const result = state.archivedGroupsField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__back__') { goToSections(); return; }
        activeGroupKey = result.selected;
        const groupFiles = archivedGroups.get(result.selected) ?? [];
        state = { mode: 'archivedFiles', archivedFilesField: buildArchivedFilesField(result.selected, groupFiles) };
        return;
      }
      case 'archivedFiles': {
        const result = state.archivedFilesField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__back__') {
          state = { mode: 'archivedGroups', archivedGroupsField: buildArchivedGroupsField(archivedGroups) };
          return;
        }
        const groupKey = activeGroupKey;
        void openFile(ctx, result.selected).then(() => {
          if (groupKey) state = { mode: 'archivedFiles', archivedFilesField: buildArchivedFilesField(groupKey, archivedGroups.get(groupKey) ?? []) };
          ctx.rerender();
        });
        return;
      }
      case 'search': {
        const result = state.searchField?.handleKey(key);
        if (result?.cancelled) { setVimKeysActive(true); goToSections(); return; }
        if (result?.submitted !== undefined) {
          const query = result.submitted.trim().toLowerCase();
          setVimKeysActive(true);
          if (!query) { goToSections(); return; }
          void fetchAllDocs().then((all) => {
            const matches = all.filter((item) => item.path.toLowerCase().includes(query));
            const trans = t();
            const options = [
              ...matches.map((r) => ({
                value: r.path,
                label: cleanFileName(r.name),
                hint: r.path.includes('/') ? r.path.split('/').slice(0, -1).join('/') : undefined,
              })),
              { value: '__back__', label: backLabel() },
            ];
            state = {
              mode: 'searchResults',
              searchResultsEmpty: matches.length === 0,
              searchResultsField: new ListField({ title: trans.docs.chooseDoc, options }),
            };
            ctx.rerender();
          }).catch(() => {
            state = { mode: 'error', errorMessage: t().docs.loadError };
            ctx.rerender();
          });
        }
        return;
      }
      case 'searchResults': {
        const result = state.searchResultsField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__back__') { goToSections(); return; }
        void openFile(ctx, result.selected).then(() => { ctx.rerender(); });
        return;
      }
      default:
        return;
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/views/docs.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full test suite and build**

Run: `npm run build && npx vitest run`
Expected: PASS, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/views/docs.ts src/app/views/docs.test.ts
git commit -m "feat(app): native Docs view (sections, files, archived drill-down, search)"
```

---

### Task 3: Wire the native Docs view into the app shell

**Files:**
- Modify: `src/app/app.ts`

- [ ] **Step 1: Update imports and the `nativeViews`/`classicFor` maps**

Remove `import { showDocsMenu } from '../features/docs.js';` and add:

```typescript
import { docsView } from './views/docs.js';
```

```typescript
  const nativeViews: Partial<Record<ViewId, View>> = {
    home: homeView,
    schedule: scheduleView,
    docs: docsView,
  };

  const classicFor: Partial<Record<ViewId, () => Promise<void>>> = {
    events: showCalendar,
    settings: showSettingsMenu,
  };
```

- [ ] **Step 2: Build and run the full test suite**

Run: `npm run build && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Manual live-launch verification**

Run: `npx tsx src/index.ts` in an interactive terminal.
- [ ] Tab to Docs: sections list appears (no blank/frozen screen).
- [ ] Open a non-archived section, open a file: glow/less takes over as before; on quitting the pager, you land back on the **same file list**, not Home.
- [ ] Open the Archived section: year/group list appears; drill into a group; open a file; confirm return-to-same-level behavior at each layer.
- [ ] Use Search: type a query with letters that would be vim-keys (`j`, `k`, `q`) and confirm they type literally into the field, not trigger menu navigation (the `capturesInput` + `setVimKeysActive(false)` combination).
- [ ] Tab away to Home and back to Docs: sections list should still be showing (no re-fetch, no reset to loading).
- [ ] Resize mid-navigation: frame stays exactly `rows` lines.
- [ ] `q` from Docs: terminal fully restored.

- [ ] **Step 4: Commit**

```bash
git add src/app/app.ts
git commit -m "feat(app): switch Docs tab to the native app-shell view"
```

## Definition of done

- All 3 tasks committed.
- `npm run build && npx vitest run` passes with zero failures.
- The manual live-launch checklist in Task 3 Step 3 is checked off against a real terminal session.
- `src/features/docs.ts`'s `showDocsMenu` still exists, still compiles, stays reachable from `showMainMenu`.

## Follow-on plans

1. Native Events view (`views/events.ts`).
2. Native Settings view (`views/settings.ts`), after which `classicFor` and the "classic bridge" machinery in `app.ts` can be deleted entirely.
