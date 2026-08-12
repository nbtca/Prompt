import type { AppContext, View } from '../view.js';
import { captureFooterHint, digitTabHint, fitFooterHint, passiveFooterHint } from '../chrome.js';
import { ListField, computeMaxVisible } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { renderDocs, type DocsViewState } from './docs-render.js';
import { setVimKeysActive } from '../../core/vim-keys.js';
import { pickIcon } from '../../core/icons.js';
import { getCurrentLanguage, t, type Language } from '../../i18n/index.js';
import { sanitizeTerminalLine, truncate } from '../../core/text.js';
import {
  localizeDocSections,
  fetchSections,
  fetchDocMetadata,
  fetchSectionMetadata,
  searchDocuments,
  getArchivedGroups,
  displayDocTitle,
  loadDocForReader,
  openDocsInBrowser,
  clearDocsCache,
  type DocSection,
  type DocLink,
  type ListedDoc,
  type SearchDoc,
} from '../../features/docs.js';

let state: DocsViewState = { mode: 'loading' };
let sections: DocSection[] = [];
let archivedGroups = new Map<string, ListedDoc[]>();
let loaded = false;
let loadedLanguage: Language | null = null;
let currentSectionKey: string | null = null;
let currentArchivedGroupKey: string | null = null;
let currentSearchResults: SearchDoc[] = [];
let sectionsRequestId = 0;
let metadataRequestId = 0;
let searchRequestId = 0;

let readerCurrentPath: string | null = null;
let readerNavStack: string[] = [];
let readerPrevState: DocsViewState | null = null;
let readerLoadingPrevState: DocsViewState | null = null;
let readerRequestId = 0;

const DOC_HINT_WIDTH = 44;

function backLabel(): string {
  return t().common.back;
}

function optionalHint(hint: string | undefined): { hint?: string } {
  return hint === undefined ? {} : { hint };
}

function docHint(value: string | undefined): string | undefined {
  return value ? truncate(value, DOC_HINT_WIDTH) : undefined;
}

function withoutReaderLinksField(value: DocsViewState): DocsViewState {
  const next = { ...value };
  delete next.readerLinksField;
  return next;
}

function withoutErrorMessage(value: DocsViewState): DocsViewState {
  const next = { ...value };
  delete next.errorMessage;
  return next;
}

function buildSectionsField(): ListField {
  const trans = t();
  const options = [
    ...sections.map((sec) => ({ value: sec.key, label: sec.label, hint: String(sec.count) })),
    { value: '__search__', label: trans.docs.searchPrompt.replace(':', '') },
    { value: '__refresh__', label: trans.docs.refreshCache },
    { value: '__browser__', label: trans.docs.openBrowser },
  ];
  return new ListField({ title: trans.docs.chooseCategory, options });
}

function buildFilesField(section: DocSection, maxVisible: number, initialIndex = 0): ListField {
  const trans = t();
  const isIndex = (file: ListedDoc) => file.name === 'index.md' || file.name.startsWith('index.');
  const index = section.files.find(isIndex);
  const files = section.files.filter((f) => !isIndex(f));
  const options = [
    ...(index ? [{ value: index.path, label: trans.docs.overviewLabel }] : []),
    ...files.map((file) => ({
      value: file.path,
      label: displayDocTitle(file.name, file.title),
      ...optionalHint(docHint(file.summary)),
    })),
    { value: '__back__', label: backLabel() },
  ];
  return new ListField({ title: section.label, options, maxVisible, initialIndex });
}

function buildArchivedGroupsField(
  groups: Map<string, ListedDoc[]>,
  maxVisible: number,
  initialIndex = 0,
): ListField {
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
    ...sortedKeys.map((k) => ({ value: k, label: k, hint: String(groups.get(k)?.length ?? 0) })),
    { value: '__back__', label: backLabel() },
  ];
  return new ListField({ title: trans.docs.categoryArchived, options, maxVisible, initialIndex });
}

function buildArchivedFilesField(
  groupKey: string,
  groupFiles: ListedDoc[],
  maxVisible: number,
  initialIndex = 0,
): ListField {
  const trans = t();
  const subDirs = new Set(groupFiles.map((f) => f.path.split('/')[2]).filter(Boolean));
  const options = [
    ...groupFiles.map((f) => {
      const sub = f.path.split('/').slice(2, -1).join('/');
      return {
        value: f.path,
        label: displayDocTitle(f.name, f.title),
        ...optionalHint(
          docHint(
            subDirs.size > 1
              ? [sanitizeTerminalLine(sub), f.summary].filter(Boolean).join(' · ')
              : f.summary,
          ),
        ),
      };
    }),
    { value: '__back__', label: backLabel() },
  ];
  return new ListField({
    title: `${trans.docs.categoryArchived} · ${groupKey}`,
    options,
    maxVisible,
    initialIndex,
  });
}

function buildReaderLinksField(links: DocLink[], maxVisible: number, initialIndex = 0): ListField {
  const trans = t();
  const options = [
    ...links.map((l) => ({ value: l.href, label: l.text })),
    { value: '__back__', label: backLabel() },
  ];
  return new ListField({ title: trans.docs.readerLinksTitle, options, maxVisible, initialIndex });
}

function buildSearchResultsField(
  matches: SearchDoc[],
  maxVisible: number,
  initialIndex = 0,
): ListField {
  const trans = t();
  const options = [
    ...matches.map((result) => ({
      value: result.path,
      label: displayDocTitle(result.name, result.title),
      ...optionalHint(
        docHint(
          result.excerpt ||
            result.summary ||
            (result.path.includes('/')
              ? sanitizeTerminalLine(result.path.split('/').slice(0, -1).join('/'))
              : undefined),
        ),
      ),
    })),
    { value: '__back__', label: backLabel() },
  ];
  return new ListField({ title: trans.docs.chooseDoc, options, maxVisible, initialIndex });
}

function relocalizeStateFields(value: DocsViewState, maxVisible: number): DocsViewState {
  if (value.mode === 'sections') {
    return { ...value, sectionsField: buildSectionsField() };
  }
  if (value.mode === 'files' && currentSectionKey) {
    const section = sections.find((candidate) => candidate.key === currentSectionKey);
    return section
      ? {
          ...value,
          filesField: buildFilesField(section, maxVisible, value.filesField?.selectedIndex),
        }
      : value;
  }
  if (value.mode === 'archivedGroups') {
    return {
      ...value,
      archivedGroupsField: buildArchivedGroupsField(
        archivedGroups,
        maxVisible,
        value.archivedGroupsField?.selectedIndex,
      ),
    };
  }
  if (value.mode === 'archivedFiles' && currentArchivedGroupKey) {
    return {
      ...value,
      archivedFilesField: buildArchivedFilesField(
        currentArchivedGroupKey,
        archivedGroups.get(currentArchivedGroupKey) ?? [],
        maxVisible,
        value.archivedFilesField?.selectedIndex,
      ),
    };
  }
  if (value.mode === 'searchResults') {
    return {
      ...value,
      searchResultsField: buildSearchResultsField(
        currentSearchResults,
        maxVisible,
        value.searchResultsField?.selectedIndex,
      ),
    };
  }
  if (value.mode === 'reader' && value.readerLinksField) {
    return {
      ...value,
      readerLinksField: buildReaderLinksField(
        value.readerLinks ?? [],
        maxVisible,
        value.readerLinksField.selectedIndex,
      ),
    };
  }
  return value;
}

function goToSections(): void {
  currentSectionKey = null;
  currentArchivedGroupKey = null;
  currentSearchResults = [];
  state = { mode: 'sections', sectionsField: buildSectionsField() };
}

function replaceSection(section: DocSection): void {
  sections = sections.map((current) => (current.key === section.key ? section : current));
}

async function openSectionFiles(ctx: AppContext, section: DocSection): Promise<void> {
  const requestId = ++metadataRequestId;
  currentSectionKey = section.key;
  state = {
    mode: 'files',
    filesField: buildFilesField(section, computeMaxVisible(ctx.bodyRows)),
  };
  ctx.rerender();
  try {
    const hydrated = await fetchSectionMetadata(section);
    if (
      requestId !== metadataRequestId ||
      state.mode !== 'files' ||
      currentSectionKey !== section.key
    )
      return;
    const localized = localizeDocSections([hydrated], t())[0] ?? hydrated;
    replaceSection(localized);
    state = {
      mode: 'files',
      filesField: buildFilesField(
        localized,
        computeMaxVisible(ctx.bodyRows),
        state.filesField?.selectedIndex,
      ),
    };
  } catch {
    if (
      requestId !== metadataRequestId ||
      state.mode !== 'files' ||
      currentSectionKey !== section.key
    )
      return;
    state = { ...state, errorMessage: t().docs.loadError };
  }
  ctx.rerender();
}

async function openArchivedFiles(
  ctx: AppContext,
  groupKey: string,
  groupFiles: ListedDoc[],
): Promise<void> {
  const requestId = ++metadataRequestId;
  currentArchivedGroupKey = groupKey;
  state = {
    mode: 'archivedFiles',
    archivedFilesField: buildArchivedFilesField(
      groupKey,
      groupFiles,
      computeMaxVisible(ctx.bodyRows),
    ),
  };
  ctx.rerender();
  try {
    const hydrated = await fetchDocMetadata(groupFiles);
    if (
      requestId !== metadataRequestId ||
      state.mode !== 'archivedFiles' ||
      currentArchivedGroupKey !== groupKey
    )
      return;
    archivedGroups.set(groupKey, hydrated);
    state = {
      mode: 'archivedFiles',
      archivedFilesField: buildArchivedFilesField(
        groupKey,
        hydrated,
        computeMaxVisible(ctx.bodyRows),
        state.archivedFilesField?.selectedIndex,
      ),
    };
  } catch {
    if (
      requestId !== metadataRequestId ||
      state.mode !== 'archivedFiles' ||
      currentArchivedGroupKey !== groupKey
    )
      return;
    state = {
      ...state,
      errorMessage: t().docs.loadError,
    };
  }
  ctx.rerender();
}

async function runSearch(ctx: AppContext, query: string): Promise<void> {
  const requestId = ++searchRequestId;
  state = { mode: 'searchLoading' };
  ctx.rerender();
  try {
    const matches = await searchDocuments(query);
    if (requestId !== searchRequestId) return;
    currentSearchResults = matches;
    state = {
      mode: 'searchResults',
      searchResultsEmpty: matches.length === 0,
      searchResultsField: buildSearchResultsField(matches, computeMaxVisible(ctx.bodyRows)),
    };
  } catch {
    if (requestId !== searchRequestId) return;
    currentSearchResults = [];
    goToSections();
    state = { ...state, errorMessage: t().docs.loadError };
  }
  ctx.rerender();
}

async function openInReader(ctx: AppContext, path: string, pushCurrent: boolean): Promise<void> {
  const requestId = ++readerRequestId;
  const previousState = state;
  const previousPath = readerCurrentPath;
  readerLoadingPrevState = previousState;
  state = { mode: 'readerLoading' };
  ctx.rerender();
  try {
    const doc = await loadDocForReader(path);
    if (requestId !== readerRequestId) return;
    if (pushCurrent && previousPath) readerNavStack.push(previousPath);
    readerCurrentPath = path;
    readerLoadingPrevState = null;
    state = {
      mode: 'reader',
      readerTitle: doc.title,
      readerLines: doc.lines,
      readerLinks: doc.links,
    };
    ctx.resetScroll();
  } catch {
    if (requestId !== readerRequestId) return;
    readerLoadingPrevState = null;
    const fallbackState =
      pushCurrent && previousState.mode === 'reader'
        ? withoutReaderLinksField(previousState)
        : previousState;
    state = { ...fallbackState, errorMessage: t().docs.loadError };
  }
  ctx.rerender();
}

function enterReaderFrom(ctx: AppContext, path: string): void {
  readerPrevState = state;
  readerNavStack = [];
  readerCurrentPath = null;
  void openInReader(ctx, path, false);
}

export const docsView = {
  id: 'docs',
  title: t().menu.docs,

  async load(ctx: AppContext): Promise<void> {
    if (loaded) {
      const language = getCurrentLanguage();
      if (loadedLanguage !== language) {
        sections = localizeDocSections(sections, t());
        loadedLanguage = language;
        const maxVisible = computeMaxVisible(ctx.bodyRows);
        state = relocalizeStateFields(state, maxVisible);
        if (readerPrevState) readerPrevState = relocalizeStateFields(readerPrevState, maxVisible);
        ctx.rerender();
      }
      return;
    }
    const requestId = ++sectionsRequestId;
    state = { mode: 'loading' };
    ctx.rerender();
    try {
      const nextSections = await fetchSections();
      if (requestId !== sectionsRequestId) return;
      sections = nextSections;
      loaded = true;
      loadedLanguage = getCurrentLanguage();
      goToSections();
    } catch {
      if (requestId !== sectionsRequestId) return;
      state = { mode: 'error', errorMessage: t().docs.loadError };
    }
    ctx.rerender();
  },

  render(ctx: AppContext): string[] {
    const maxVisible = computeMaxVisible(ctx.bodyRows);
    state.filesField?.setMaxVisible(maxVisible);
    state.archivedGroupsField?.setMaxVisible(maxVisible);
    state.archivedFilesField?.setMaxVisible(maxVisible);
    state.searchResultsField?.setMaxVisible(maxVisible);
    state.readerLinksField?.setMaxVisible(maxVisible);
    return renderDocs(state, ctx.size.cols, ctx.bodyRows);
  },

  capturesInput(): boolean {
    return state.mode === 'search';
  },

  capturesPageKeys(): boolean {
    return (
      state.mode === 'sections' ||
      state.mode === 'files' ||
      state.mode === 'archivedGroups' ||
      state.mode === 'archivedFiles' ||
      state.mode === 'searchResults' ||
      (state.mode === 'reader' && state.readerLinksField !== undefined)
    );
  },

  footerHint(tabCount: number, cols = Number.POSITIVE_INFINITY): string | undefined {
    if (state.mode === 'search') return captureFooterHint(cols);
    if (state.mode === 'loading' || state.mode === 'searchLoading' || state.mode === 'error')
      return passiveFooterHint(tabCount, cols);
    if (state.mode === 'readerLoading') {
      return fitFooterHint(
        cols,
        `${digitTabHint(tabCount)}q ${t().menu.hintQuit}`,
        `${digitTabHint(tabCount)}q`,
        'q',
      );
    }
    if (state.mode === 'reader' && !state.readerLinksField) {
      const trans = t();
      const dot = pickIcon('·', '-');
      const hasLinks = (state.readerLinks?.length ?? 0) > 0;
      const linkHint = hasLinks ? `f ${trans.docs.readerLinksHint} ${dot} ` : '';
      const pageHint = `PgUp/PgDn ${dot} `;
      const localFull = `${pageHint}${linkHint}b ${trans.docs.openBrowser} ${dot} Esc ${dot} q ${trans.menu.hintQuit}`;
      const localCompact = `${pageHint}${hasLinks ? `f ${dot} ` : ''}b ${dot} Esc ${dot} q`;
      return fitFooterHint(
        cols,
        `${digitTabHint(tabCount)}${localFull}`,
        localFull,
        localCompact,
        `${hasLinks ? 'f ' : ''}b Esc q`,
        'Esc q',
        'q',
      );
    }
    return undefined;
  },

  handleBack(ctx: AppContext): boolean {
    if (state.mode === 'searchLoading') {
      searchRequestId++;
      goToSections();
      return true;
    }
    if (state.mode === 'reader' || state.mode === 'readerLoading') {
      if (state.mode === 'readerLoading') {
        const previousState = readerLoadingPrevState;
        readerRequestId++;
        readerLoadingPrevState = null;
        if (!previousState) return false;
        state = previousState;
        return true;
      }
      if (state.readerLinksField) {
        state = withoutReaderLinksField(state);
        return true;
      }
      const prevPath = readerNavStack.pop();
      if (prevPath) {
        void openInReader(ctx, prevPath, false);
        return true;
      }
      if (readerPrevState) {
        state = readerPrevState;
        readerPrevState = null;
        readerCurrentPath = null;
        return true;
      }
      return false;
    }
    if (state.mode === 'archivedFiles') {
      state = {
        mode: 'archivedGroups',
        archivedGroupsField: buildArchivedGroupsField(
          archivedGroups,
          computeMaxVisible(ctx.bodyRows),
        ),
      };
      return true;
    }
    if (state.mode === 'search') {
      setVimKeysActive(true);
      goToSections();
      return true;
    }
    if (
      state.mode === 'files' ||
      state.mode === 'archivedGroups' ||
      state.mode === 'searchResults'
    ) {
      goToSections();
      return true;
    }
    return false;
  },

  handleKey(key: string, ctx: AppContext): void {
    if (state.mode !== 'error' && state.errorMessage) state = withoutErrorMessage(state);
    switch (state.mode) {
      case 'sections': {
        const result = state.sectionsField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__search__') {
          setVimKeysActive(false);
          state = {
            mode: 'search',
            searchField: new TextField({
              message: t().docs.searchPrompt,
              placeholder: t().docs.searchPlaceholder,
              allowEmpty: true,
            }),
          };
          return;
        }
        if (result.selected === '__refresh__') {
          clearDocsCache();
          sectionsRequestId++;
          metadataRequestId++;
          searchRequestId++;
          loaded = false;
          loadedLanguage = null;
          sections = [];
          archivedGroups = new Map();
          currentSectionKey = null;
          currentArchivedGroupKey = null;
          currentSearchResults = [];
          readerCurrentPath = null;
          readerNavStack = [];
          readerPrevState = null;
          readerLoadingPrevState = null;
          readerRequestId++;
          void docsView.load(ctx);
          return;
        }
        if (result.selected === '__browser__') {
          void ctx.runClassic(() => openDocsInBrowser());
          return;
        }
        const section = sections.find((s) => s.key === result.selected);
        if (!section) return;
        if (section.key === 'archived') {
          metadataRequestId++;
          currentSectionKey = null;
          currentArchivedGroupKey = null;
          archivedGroups = getArchivedGroups(section.files);
          state = {
            mode: 'archivedGroups',
            archivedGroupsField: buildArchivedGroupsField(
              archivedGroups,
              computeMaxVisible(ctx.bodyRows),
            ),
          };
        } else {
          void openSectionFiles(ctx, section);
        }
        return;
      }
      case 'files': {
        const result = state.filesField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__back__') {
          goToSections();
          return;
        }
        enterReaderFrom(ctx, result.selected);
        return;
      }
      case 'archivedGroups': {
        const result = state.archivedGroupsField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__back__') {
          goToSections();
          return;
        }
        const groupFiles = archivedGroups.get(result.selected) ?? [];
        void openArchivedFiles(ctx, result.selected, groupFiles);
        return;
      }
      case 'archivedFiles': {
        const result = state.archivedFilesField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__back__') {
          currentArchivedGroupKey = null;
          state = {
            mode: 'archivedGroups',
            archivedGroupsField: buildArchivedGroupsField(
              archivedGroups,
              computeMaxVisible(ctx.bodyRows),
            ),
          };
          return;
        }
        enterReaderFrom(ctx, result.selected);
        return;
      }
      case 'search': {
        const result = state.searchField?.handleKey(key);
        if (result?.cancelled) {
          setVimKeysActive(true);
          goToSections();
          return;
        }
        if (result?.submitted !== undefined) {
          const query = result.submitted.trim().toLowerCase();
          setVimKeysActive(true);
          if (!query) {
            goToSections();
            return;
          }
          void runSearch(ctx, query);
        }
        return;
      }
      case 'searchResults': {
        const result = state.searchResultsField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__back__') {
          goToSections();
          return;
        }
        enterReaderFrom(ctx, result.selected);
        return;
      }
      case 'reader': {
        if (state.readerLinksField) {
          const result = state.readerLinksField.handleKey(key);
          if (result.cancelled || result.selected === '__back__') {
            state = withoutReaderLinksField(state);
            return;
          }
          if (result.selected) void openInReader(ctx, result.selected, true);
          return;
        }
        if (key === 'f' && (state.readerLinks?.length ?? 0) > 0) {
          state = {
            ...state,
            readerLinksField: buildReaderLinksField(
              state.readerLinks ?? [],
              computeMaxVisible(ctx.bodyRows),
            ),
          };
          return;
        }
        if (key === 'b') {
          void ctx.runClassic(() => openDocsInBrowser(readerCurrentPath ?? undefined));
          return;
        }
        return;
      }
      case 'error':
      case 'loading':
      case 'readerLoading':
      case 'searchLoading':
        return;
    }
  },
} satisfies View;
