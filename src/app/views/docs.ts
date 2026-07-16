import type { DocItem } from '@nbtca/docs';
import type { AppContext, View } from '../view.js';
import { captureFooterHint } from '../chrome.js';
import { ListField, computeMaxVisible } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { renderDocs, type DocsViewState } from './docs-render.js';
import { setVimKeysActive } from '../../core/vim-keys.js';
import { t } from '../../i18n/index.js';
import {
  fetchSections, fetchAllDocs, getArchivedGroups, cleanFileName, displayDocTitle, viewMarkdownFile, openDocsInBrowser,
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

function buildFilesField(section: DocSection, maxVisible: number): ListField {
  const files = section.files.filter((f) => f.name !== 'index.md' && !f.name.startsWith('index.'));
  const options = [
    ...files.map((f) => ({ value: f.path, label: displayDocTitle(f.path, f.name) })),
    { value: '__back__', label: backLabel() },
  ];
  return new ListField({ title: section.label, options, maxVisible });
}

function buildArchivedGroupsField(groups: Map<string, DocItem[]>, maxVisible: number): ListField {
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
  return new ListField({ title: trans.docs.categoryArchived, options, maxVisible });
}

function buildArchivedFilesField(groupKey: string, groupFiles: DocItem[], maxVisible: number): ListField {
  const trans = t();
  const subDirs = new Set(groupFiles.map((f) => f.path.split('/')[2]).filter(Boolean));
  const options = [
    ...groupFiles.map((f) => {
      const sub = f.path.split('/').slice(2, -1).join('/');
      return { value: f.path, label: cleanFileName(f.name), hint: subDirs.size > 1 ? sub : undefined };
    }),
    { value: '__back__', label: backLabel() },
  ];
  return new ListField({ title: `${trans.docs.categoryArchived} · ${groupKey}`, options, maxVisible });
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

  render(ctx: AppContext): string[] {
    // Sync every visible field's scroll window to the *current* terminal
    // size on every frame (not just construction time) — this is what
    // keeps a long list correctly windowed across a live resize.
    const maxVisible = computeMaxVisible(ctx.bodyRows);
    state.filesField?.setMaxVisible(maxVisible);
    state.archivedGroupsField?.setMaxVisible(maxVisible);
    state.archivedFilesField?.setMaxVisible(maxVisible);
    state.searchResultsField?.setMaxVisible(maxVisible);
    return renderDocs(state);
  },

  capturesInput(): boolean {
    return state.mode === 'search';
  },

  footerHint(): string | undefined {
    return state.mode === 'search' ? captureFooterHint() : undefined;
  },

  handleBack(ctx: AppContext): boolean {
    if (state.mode === 'archivedFiles') {
      state = { mode: 'archivedGroups', archivedGroupsField: buildArchivedGroupsField(archivedGroups, computeMaxVisible(ctx.bodyRows)) };
      return true;
    }
    if (state.mode === 'search') {
      setVimKeysActive(true);
      goToSections();
      return true;
    }
    if (state.mode === 'files' || state.mode === 'archivedGroups' || state.mode === 'searchResults') {
      goToSections();
      return true;
    }
    return false;
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
          state = { mode: 'archivedGroups', archivedGroupsField: buildArchivedGroupsField(archivedGroups, computeMaxVisible(ctx.bodyRows)) };
        } else {
          state = { mode: 'files', filesField: buildFilesField(section, computeMaxVisible(ctx.bodyRows)) };
        }
        return;
      }
      case 'files': {
        const result = state.filesField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__back__') { goToSections(); return; }
        void openFile(ctx, result.selected).then(() => {
          if (activeSection) state = { mode: 'files', filesField: buildFilesField(activeSection, computeMaxVisible(ctx.bodyRows)) };
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
        state = { mode: 'archivedFiles', archivedFilesField: buildArchivedFilesField(result.selected, groupFiles, computeMaxVisible(ctx.bodyRows)) };
        return;
      }
      case 'archivedFiles': {
        const result = state.archivedFilesField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__back__') {
          state = { mode: 'archivedGroups', archivedGroupsField: buildArchivedGroupsField(archivedGroups, computeMaxVisible(ctx.bodyRows)) };
          return;
        }
        const groupKey = activeGroupKey;
        void openFile(ctx, result.selected).then(() => {
          if (groupKey) state = { mode: 'archivedFiles', archivedFilesField: buildArchivedFilesField(groupKey, archivedGroups.get(groupKey) ?? [], computeMaxVisible(ctx.bodyRows)) };
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
                label: displayDocTitle(r.path, r.name),
                hint: r.path.includes('/') ? r.path.split('/').slice(0, -1).join('/') : undefined,
              })),
              { value: '__back__', label: backLabel() },
            ];
            state = {
              mode: 'searchResults',
              searchResultsEmpty: matches.length === 0,
              searchResultsField: new ListField({ title: trans.docs.chooseDoc, options, maxVisible: computeMaxVisible(ctx.bodyRows) }),
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
