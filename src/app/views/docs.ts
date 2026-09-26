import type { AppContext, View } from '../view.js';
import { captureFooterHint, digitTabHint, fitFooterHint, passiveFooterHint } from '../chrome.js';
import { ListField, computeMaxVisible } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { renderDocs, type DocsViewState } from './docs-render.js';
import { setVimKeysActive } from '../../core/vim-keys.js';
import { pickIcon } from '../../core/icons.js';
import { glyph } from '../../core/theme.js';
import { fmt, getCurrentLanguage, t, type Language } from '../../i18n/index.js';
import { sanitizeTerminalLine } from '../../core/text.js';
import {
  localizeDocSections,
  fetchSections,
  peekSections,
  fetchDocMetadata,
  fetchSectionMetadata,
  peekListedDocs,
  searchDocuments,
  getArchivedGroups,
  displayDocTitle,
  loadDocForReader,
  openDocsInBrowser,
  docsUrlFromPath,
  clearDocsCache,
  withFileNameTitle,
  type DocSection,
  type DocLink,
  type ListedDoc,
  type SearchDoc,
} from '../../features/docs.js';
import { launchBrowserUrl } from '../../features/links.js';

let state: DocsViewState = { mode: 'loading' };
let sections: DocSection[] = [];
let archivedGroups = new Map<string, ListedDoc[]>();
let loaded = false;
let stale = false;
let loadedLanguage: Language | null = null;
let currentSectionKey: string | null = null;
let currentArchivedGroupKey: string | null = null;
let currentSearchResults: SearchDoc[] = [];
let currentSearchQuery = '';
let sectionsRequestId = 0;
let metadataRequestId = 0;
let searchRequestId = 0;

let readerCurrentPath: string | null = null;
let readerNavStack: string[] = [];
let readerPrevState: DocsViewState | null = null;
let readerLoadingPrevState: DocsViewState | null = null;
let readerRequestId = 0;
let lifecycleGeneration = 0;

function isLifecycleActive(ctx: AppContext, generation: number): boolean {
  return generation === lifecycleGeneration && ctx.signal?.aborted !== true;
}

function sectionsSignature(value: readonly DocSection[]): string {
  return value.map((section) => `${section.key}:${String(section.files.length)}`).join('|');
}

function dedupeAdjacent(segments: string[]): string[] {
  return segments.filter((segment, index) => segment !== segments[index - 1]);
}

function backLabel(): string {
  return t().common.back;
}

function optionalHint(hint: string | undefined): { hint?: string; hintColumn?: boolean } {
  return hint ? { hint, hintColumn: true } : {};
}

function docLabel(doc: ListedDoc): { label: string; dim?: boolean } {
  return doc.title ? { label: doc.title } : { label: pickIcon('…', '...'), dim: true };
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

async function openBrowserFromView(
  ctx: AppContext,
  path?: string,
  generation = lifecycleGeneration,
): Promise<void> {
  await openUrlFromView(
    ctx,
    docsUrlFromPath(path),
    () => openDocsInBrowser(path, ctx.signal),
    generation,
  );
}

async function openUrlFromView(
  ctx: AppContext,
  url: string,
  open: () => Promise<boolean>,
  generation = lifecycleGeneration,
): Promise<void> {
  let opened: boolean | undefined;
  await ctx.runClassic(async () => {
    opened = await open();
  });
  if (!isLifecycleActive(ctx, generation) || opened === true) return;

  state = {
    ...state,
    errorMessage: sanitizeTerminalLine(fmt(t().docs.browserErrorManual, { url })),
  };
  ctx.rerender();
}

function countHints(counts: readonly number[]): string[] {
  const width = Math.max(0, ...counts.map((count) => String(count).length));
  return counts.map((count) => String(count).padStart(width));
}

function buildSectionsField(): ListField {
  const trans = t();
  const counts = countHints(sections.map((sec) => sec.count));
  const options = [
    ...sections.map((sec, index) => ({
      value: sec.key,
      label: sec.label,
      hint: counts[index] ?? '',
    })),
    { value: '__search__', label: trans.docs.searchPrompt },
    { value: '__refresh__', label: trans.docs.refreshCache },
    { value: '__browser__', label: trans.docs.openBrowser },
  ];
  return new ListField({ options });
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
      ...docLabel(file),
      ...optionalHint(file.summary),
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
  const counts = countHints(sortedKeys.map((k) => groups.get(k)?.length ?? 0));
  const options = [
    ...sortedKeys.map((k, index) => ({ value: k, label: k, hint: counts[index] ?? '' })),
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
        ...docLabel(f),
        ...optionalHint(
          subDirs.size > 1
            ? [sanitizeTerminalLine(sub), f.summary].filter(Boolean).join(` ${glyph.sep()} `)
            : f.summary,
        ),
      };
    }),
    { value: '__back__', label: backLabel() },
  ];
  return new ListField({
    title: `${trans.docs.categoryArchived} ${glyph.sep()} ${groupKey}`,
    options,
    maxVisible,
    initialIndex,
  });
}

function buildReaderLinksField(links: DocLink[], maxVisible: number, initialIndex = 0): ListField {
  const trans = t();
  const options = [
    ...links.map((l) => {
      const address = l.external ? l.href.replace(/^https?:\/\//i, '').replace(/\/$/, '') : '';
      return {
        value: l.href,
        label: l.text,
        ...optionalHint(address === l.text ? undefined : address),
      };
    }),
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
        result.excerpt ||
          result.summary ||
          (result.path.includes('/')
            ? sanitizeTerminalLine(result.path.split('/').slice(0, -1).join('/'))
            : undefined),
      ),
      hintFocus: currentSearchQuery,
    })),
    { value: '__back__', label: backLabel() },
  ];
  return new ListField({
    title: fmt(trans.docs.searchResultsTitle, {
      query: currentSearchQuery,
      count: matches.length,
      sep: glyph.sep(),
    }),
    options,
    maxVisible,
    initialIndex,
  });
}

function relocalizeStateFields(value: DocsViewState, maxVisible: number): DocsViewState {
  if (value.mode === 'sections') {
    return { ...value, sectionsField: buildSectionsField() };
  }
  if (value.mode === 'files' && value.filesField && currentSectionKey) {
    const section = sections.find((candidate) => candidate.key === currentSectionKey);
    return section
      ? {
          ...value,
          filesField: buildFilesField(section, maxVisible, value.filesField.selectedIndex),
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
  if (value.mode === 'archivedFiles' && value.archivedFilesField && currentArchivedGroupKey) {
    return {
      ...value,
      archivedFilesField: buildArchivedFilesField(
        currentArchivedGroupKey,
        archivedGroups.get(currentArchivedGroupKey) ?? [],
        maxVisible,
        value.archivedFilesField.selectedIndex,
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
  state = { mode: 'sections', sectionsField: buildSectionsField(), stale };
}

function showLoadError(): void {
  const trans = t();
  state = {
    mode: 'error',
    errorMessage: trans.docs.offlineError,
    errorField: new ListField({
      options: [
        { value: '__retry__', label: trans.docs.retryLoad },
        { value: '__browser__', label: trans.docs.openBrowser },
      ],
    }),
  };
}

function replaceSection(section: DocSection): void {
  sections = sections.map((current) => (current.key === section.key ? section : current));
}

async function openSectionFiles(ctx: AppContext, section: DocSection): Promise<void> {
  const generation = lifecycleGeneration;
  if (!isLifecycleActive(ctx, generation)) return;
  const requestId = ++metadataRequestId;
  currentSectionKey = section.key;
  const stored = peekListedDocs(section.files);
  const known = { ...section, files: stored.docs };
  const isCurrent = () =>
    isLifecycleActive(ctx, generation) &&
    requestId === metadataRequestId &&
    state.mode === 'files' &&
    currentSectionKey === section.key;
  const show = (value: DocSection, extra: Partial<DocsViewState> = {}) => {
    state = {
      mode: 'files',
      filesField: buildFilesField(
        value,
        computeMaxVisible(ctx.bodyRows),
        state.filesField?.selectedIndex,
      ),
      ...extra,
    };
  };
  show(known);
  if (stored.complete) {
    replaceSection(known);
    return;
  }
  ctx.rerender();
  try {
    const hydrated = await fetchSectionMetadata(section, ctx.signal, (index, doc) => {
      if (!isCurrent() || known.files[index]?.title) return;
      known.files[index] = doc;
      show(known);
      ctx.rerender();
    });
    if (!isCurrent()) return;
    const localized = localizeDocSections([hydrated], t())[0] ?? hydrated;
    replaceSection(localized);
    show(localized);
  } catch {
    if (!isCurrent()) return;
    show(
      { ...known, files: known.files.map(withFileNameTitle) },
      { errorMessage: t().docs.loadError },
    );
  }
  if (isLifecycleActive(ctx, generation)) ctx.rerender();
}

async function openArchivedFiles(
  ctx: AppContext,
  groupKey: string,
  groupFiles: ListedDoc[],
): Promise<void> {
  const generation = lifecycleGeneration;
  if (!isLifecycleActive(ctx, generation)) return;
  const requestId = ++metadataRequestId;
  currentArchivedGroupKey = groupKey;
  const stored = peekListedDocs(groupFiles);
  const isCurrent = () =>
    isLifecycleActive(ctx, generation) &&
    requestId === metadataRequestId &&
    state.mode === 'archivedFiles' &&
    currentArchivedGroupKey === groupKey;
  const show = (files: ListedDoc[], extra: Partial<DocsViewState> = {}) => {
    state = {
      mode: 'archivedFiles',
      archivedFilesField: buildArchivedFilesField(
        groupKey,
        files,
        computeMaxVisible(ctx.bodyRows),
        state.archivedFilesField?.selectedIndex,
      ),
      ...extra,
    };
  };
  show(stored.docs);
  if (stored.complete) {
    archivedGroups.set(groupKey, stored.docs);
    return;
  }
  ctx.rerender();
  try {
    const hydrated = await fetchDocMetadata(groupFiles, ctx.signal, (index, doc) => {
      if (!isCurrent() || stored.docs[index]?.title) return;
      stored.docs[index] = doc;
      show(stored.docs);
      ctx.rerender();
    });
    if (!isCurrent()) return;
    archivedGroups.set(groupKey, hydrated);
    show(hydrated);
  } catch {
    if (!isCurrent()) return;
    show(stored.docs.map(withFileNameTitle), { errorMessage: t().docs.loadError });
  }
  if (isLifecycleActive(ctx, generation)) ctx.rerender();
}

async function runSearch(ctx: AppContext, query: string): Promise<void> {
  const generation = lifecycleGeneration;
  if (!isLifecycleActive(ctx, generation)) return;
  const requestId = ++searchRequestId;
  state = { mode: 'searchLoading' };
  ctx.rerender();
  try {
    const matches = await searchDocuments(query, ctx.signal, (done, total) => {
      if (!isLifecycleActive(ctx, generation) || requestId !== searchRequestId) return;
      state = { mode: 'searchLoading', searchProgress: { done, total } };
      ctx.rerender();
    });
    if (!isLifecycleActive(ctx, generation) || requestId !== searchRequestId) return;
    currentSearchQuery = query;
    currentSearchResults = matches;
    state = {
      mode: 'searchResults',
      searchResultsEmpty: matches.length === 0,
      searchResultsField: buildSearchResultsField(matches, computeMaxVisible(ctx.bodyRows)),
    };
  } catch {
    if (!isLifecycleActive(ctx, generation) || requestId !== searchRequestId) return;
    currentSearchResults = [];
    goToSections();
    state = { ...state, errorMessage: t().docs.loadError };
  }
  if (isLifecycleActive(ctx, generation)) ctx.rerender();
}

async function openInReader(ctx: AppContext, path: string, pushCurrent: boolean): Promise<void> {
  const generation = lifecycleGeneration;
  if (!isLifecycleActive(ctx, generation)) return;
  const requestId = ++readerRequestId;
  const previousState = state;
  const previousPath = readerCurrentPath;
  readerLoadingPrevState = previousState;
  state = { mode: 'readerLoading' };
  ctx.rerender();
  try {
    const doc = await loadDocForReader(path, ctx.signal);
    if (!isLifecycleActive(ctx, generation) || requestId !== readerRequestId) return;
    if (pushCurrent && previousPath) readerNavStack.push(previousPath);
    readerCurrentPath = path;
    readerLoadingPrevState = null;
    state = {
      mode: 'reader',
      readerTitle: doc.title,
      readerRender: doc.render,
      readerLinks: doc.links,
    };
    ctx.resetScroll();
  } catch {
    if (!isLifecycleActive(ctx, generation) || requestId !== readerRequestId) return;
    readerLoadingPrevState = null;
    const fallbackState =
      pushCurrent && previousState.mode === 'reader'
        ? withoutReaderLinksField(previousState)
        : previousState;
    state = { ...fallbackState, errorMessage: t().docs.loadError };
  }
  if (isLifecycleActive(ctx, generation)) ctx.rerender();
}

function enterReaderFrom(ctx: AppContext, path: string): void {
  readerPrevState = state;
  readerNavStack = [];
  readerCurrentPath = null;
  void openInReader(ctx, path, false);
}

function reloadDocs(ctx: AppContext): void {
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
}

export const docsView = {
  id: 'docs',
  title: t().menu.docs,

  async load(ctx: AppContext): Promise<void> {
    const generation = loaded ? lifecycleGeneration : ++lifecycleGeneration;
    if (!isLifecycleActive(ctx, generation)) return;
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
    const cached = peekSections();
    if (cached) {
      sections = localizeDocSections(cached, t());
      loadedLanguage = getCurrentLanguage();
      goToSections();
    } else {
      state = { mode: 'loading' };
    }
    ctx.rerender();
    try {
      const nextSections = await fetchSections(ctx.signal);
      if (!isLifecycleActive(ctx, generation) || requestId !== sectionsRequestId) return;
      const localized = localizeDocSections(nextSections, t());
      const changed = sectionsSignature(localized) !== sectionsSignature(sections);
      sections = localized;
      loaded = true;
      loadedLanguage = getCurrentLanguage();
      stale = false;
      if (!cached || (changed && state.mode === 'sections')) goToSections();
      else if (state.mode === 'sections') state = { ...state, stale };
    } catch {
      if (!isLifecycleActive(ctx, generation) || requestId !== sectionsRequestId) return;
      if (cached) {
        loaded = true;
        stale = true;
        if (state.mode === 'sections') state = { ...state, stale };
      } else {
        showLoadError();
      }
    }
    if (isLifecycleActive(ctx, generation)) ctx.rerender();
  },

  dispose(): void {
    lifecycleGeneration += 1;
    sectionsRequestId += 1;
    metadataRequestId += 1;
    searchRequestId += 1;
    readerRequestId += 1;
    clearDocsCache();
    setVimKeysActive(true);
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

  isBusy(): boolean {
    return (
      state.mode === 'loading' || state.mode === 'searchLoading' || state.mode === 'readerLoading'
    );
  },

  capturesInput(): boolean {
    return state.mode === 'search';
  },

  contextPath(): readonly string[] | undefined {
    const trans = t();
    const section = sections.find((candidate) => candidate.key === currentSectionKey);
    const branch =
      currentArchivedGroupKey !== null
        ? [trans.docs.categoryArchived, currentArchivedGroupKey]
        : section
          ? [section.label]
          : [];
    switch (state.mode) {
      case 'reader':
      case 'readerLoading':
        return dedupeAdjacent([
          trans.menu.docs,
          ...branch,
          ...(state.readerTitle ? [state.readerTitle] : []),
        ]);
      case 'files':
      case 'archivedFiles':
      case 'archivedGroups':
        return [trans.menu.docs, ...branch];
      case 'sections':
      case 'search':
      case 'searchLoading':
      case 'searchResults':
      case 'loading':
      case 'error':
        return undefined;
    }
  },

  shortcuts(): readonly { key: string; label: string }[] {
    const trans = t();
    if (state.mode !== 'reader') return [];
    return [
      ...((state.readerLinks?.length ?? 0) > 0
        ? [{ key: 'f', label: trans.docs.readerLinksHint }]
        : []),
      { key: 'b', label: trans.docs.openBrowser },
    ];
  },

  scrollsBody(): boolean {
    return state.mode === 'reader' && state.readerLinksField === undefined;
  },

  capturesPageKeys(): boolean {
    return (
      state.mode === 'sections' ||
      state.mode === 'files' ||
      state.mode === 'archivedGroups' ||
      state.mode === 'archivedFiles' ||
      state.mode === 'searchResults' ||
      (state.mode === 'error' && state.errorField !== undefined) ||
      (state.mode === 'reader' && state.readerLinksField !== undefined)
    );
  },

  footerHint(tabCount: number, cols = Number.POSITIVE_INFINITY): string | undefined {
    if (state.mode === 'search') return captureFooterHint(cols);
    if (
      state.mode === 'loading' ||
      state.mode === 'searchLoading' ||
      (state.mode === 'error' && !state.errorField)
    )
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
      const dot = glyph.sep();
      const hasLinks = (state.readerLinks?.length ?? 0) > 0;
      const linkHint = hasLinks ? `f ${trans.docs.readerLinksHint} ${dot} ` : '';
      const pageHint = `${glyph.updown()} PgUp/PgDn ${dot} `;
      const localFull = `${pageHint}${linkHint}b ${trans.docs.openBrowser} ${dot} Esc ${trans.menu.hintBack} ${dot} q ${trans.menu.hintQuit}`;
      const localCompact = `${pageHint}${hasLinks ? `f ${dot} ` : ''}b ${dot} Esc ${dot} q`;
      return fitFooterHint(
        cols,
        `${digitTabHint(tabCount)}${localFull} ${dot} ${trans.help.hint}`,
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
          reloadDocs(ctx);
          return;
        }
        if (result.selected === '__browser__') {
          void openBrowserFromView(ctx);
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
          const link = state.readerLinks?.find((candidate) => candidate.href === result.selected);
          if (link?.external) {
            const href = link.href;
            state = withoutReaderLinksField(state);
            void openUrlFromView(ctx, href, () => launchBrowserUrl(href));
          } else if (result.selected) {
            void openInReader(ctx, result.selected, true);
          }
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
          void openBrowserFromView(ctx, readerCurrentPath ?? undefined);
          return;
        }
        return;
      }
      case 'error': {
        const result = state.errorField?.handleKey(key);
        if (result?.selected === '__retry__') reloadDocs(ctx);
        if (result?.selected === '__browser__') void openBrowserFromView(ctx);
        return;
      }
      case 'loading':
      case 'readerLoading':
      case 'searchLoading':
        return;
    }
  },
} satisfies View;
