import { type, space, bodyEdge } from '../../core/theme.js';
import { fmt, t } from '../../i18n/index.js';
import { type ListField, renderListFieldWithContext } from '../fields/list-field.js';
import { offlineNotice } from '../chrome.js';
import type { TextField } from '../fields/text-field.js';
import type { DocLink } from '../../features/docs.js';
import { visualWidth, wrapAnsiWithIndent } from '../../core/text.js';
import { loadingLines } from '../../core/components/spinner.js';

export type DocsMode =
  | 'loading'
  | 'sections'
  | 'files'
  | 'archivedGroups'
  | 'archivedFiles'
  | 'search'
  | 'searchLoading'
  | 'searchResults'
  | 'reader'
  | 'readerLoading'
  | 'error';

export interface DocsViewState {
  mode: DocsMode;
  errorMessage?: string;
  errorField?: ListField;
  stale?: boolean;
  sectionsField?: ListField;
  filesField?: ListField;
  archivedGroupsField?: ListField;
  archivedFilesField?: ListField;
  searchField?: TextField;
  searchResultsField?: ListField;
  searchResultsEmpty?: boolean;
  searchProgress?: { done: number; total: number };
  readerTitle?: string;
  readerRender?: (width: number) => string[];
  readerLinks?: DocLink[];
  readerLinksField?: ListField;
}

function hintLines(label: string, cols: number): string[] {
  return wrapAnsiWithIndent(type.hint(label), cols, space.indent);
}

function renderReader(render: (width: number) => string[], cols: number): string[] {
  const contentWidth = Math.max(1, Math.min(80, bodyEdge(cols) - visualWidth(space.indent)));
  return render(contentWidth).map((line) => (line ? `${space.indent}${line}` : ''));
}

function listFieldForState(state: DocsViewState): ListField | undefined {
  switch (state.mode) {
    case 'sections':
      return state.sectionsField;
    case 'files':
      return state.filesField;
    case 'archivedGroups':
      return state.archivedGroupsField;
    case 'archivedFiles':
      return state.archivedFilesField;
    case 'searchResults':
      return state.searchResultsField;
    case 'reader':
      return state.readerLinksField;
    case 'error':
      return state.errorField;
    case 'loading':
    case 'readerLoading':
    case 'search':
    case 'searchLoading':
      return undefined;
  }
}

export function renderDocs(
  state: DocsViewState,
  cols = 80,
  bodyRows = Number.POSITIVE_INFINITY,
): string[] {
  const trans = t();
  let lines: string[];
  switch (state.mode) {
    case 'loading':
      lines = loadingLines(trans.common.loading, cols);
      break;
    case 'sections': {
      const context = state.stale ? offlineNotice(cols) : [];
      if (Number.isFinite(bodyRows)) {
        state.sectionsField?.setMaxVisible(Math.max(1, Math.floor(bodyRows) - context.length - 1));
      }
      lines = state.sectionsField
        ? renderListFieldWithContext(context, state.sectionsField, bodyRows, cols)
        : [];
      break;
    }
    case 'files':
      lines = state.filesField?.render(bodyRows, cols) ?? loadingLines(trans.common.loading, cols);
      break;
    case 'archivedGroups':
      lines = state.archivedGroupsField?.render(bodyRows, cols) ?? [];
      break;
    case 'archivedFiles':
      lines =
        state.archivedFilesField?.render(bodyRows, cols) ??
        loadingLines(trans.common.loading, cols);
      break;
    case 'search':
      lines = state.searchField?.render(cols) ?? [];
      break;
    case 'searchLoading':
      lines = loadingLines(
        state.searchProgress
          ? fmt(trans.docs.searchProgress, state.searchProgress)
          : trans.docs.searching,
        cols,
      );
      break;
    case 'searchResults':
      lines = state.searchResultsField
        ? renderListFieldWithContext(
            [
              ...(state.searchResultsEmpty
                ? [...hintLines(trans.docs.searchNoResults, cols), '']
                : []),
            ],
            state.searchResultsField,
            bodyRows,
            cols,
          )
        : [];
      break;
    case 'readerLoading':
      lines = loadingLines(trans.docs.loadingFile, cols);
      break;
    case 'reader':
      lines = state.readerLinksField
        ? state.readerLinksField.render(bodyRows, cols)
        : renderReader(state.readerRender ?? (() => []), cols);
      break;
    case 'error': {
      const context = [
        ...wrapAnsiWithIndent(
          type.body(state.errorMessage ?? trans.docs.loadError),
          cols,
          space.indent,
        ),
        ...hintLines(trans.docs.offlineHint, cols),
        '',
      ];
      return state.errorField
        ? renderListFieldWithContext(context, state.errorField, bodyRows, cols)
        : context;
    }
  }
  if (!state.errorMessage) return lines;
  const errorContext = [...hintLines(state.errorMessage, cols), ''];
  const listField = listFieldForState(state);
  if (!listField) return [...errorContext, ...lines];
  const context =
    state.mode === 'searchResults' && state.searchResultsEmpty
      ? [...errorContext, ...hintLines(trans.docs.searchNoResults, cols), '']
      : errorContext;
  return renderListFieldWithContext(context, listField, bodyRows, cols);
}
