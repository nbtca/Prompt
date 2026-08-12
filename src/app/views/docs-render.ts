import { type, space } from '../../core/theme.js';
import { t } from '../../i18n/index.js';
import { type ListField, renderListFieldWithContext } from '../fields/list-field.js';
import type { TextField } from '../fields/text-field.js';
import type { DocLink } from '../../features/docs.js';
import { visualWidth, wrapAnsiToVisualWidth, wrapAnsiWithIndent } from '../../core/text.js';

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
  sectionsField?: ListField;
  filesField?: ListField;
  archivedGroupsField?: ListField;
  archivedFilesField?: ListField;
  searchField?: TextField;
  searchResultsField?: ListField;
  searchResultsEmpty?: boolean;
  readerTitle?: string;
  readerLines?: string[];
  readerLinks?: DocLink[];
  readerLinksField?: ListField;
}

function hintLines(label: string, cols: number): string[] {
  return wrapAnsiWithIndent(type.hint(label), cols, space.indent);
}

function renderReader(lines: string[], cols: number): string[] {
  const contentWidth = Math.max(1, Math.min(80, cols - visualWidth(space.indent)));
  return lines.flatMap((line) =>
    wrapAnsiToVisualWidth(line, contentWidth).map((part) => `${space.indent}${part}`),
  );
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
      lines = hintLines(trans.common.loading, cols);
      break;
    case 'sections':
      lines = state.sectionsField?.render(bodyRows, cols) ?? [];
      break;
    case 'files':
      lines = state.filesField?.render(bodyRows, cols) ?? [];
      break;
    case 'archivedGroups':
      lines = state.archivedGroupsField?.render(bodyRows, cols) ?? [];
      break;
    case 'archivedFiles':
      lines = state.archivedFilesField?.render(bodyRows, cols) ?? [];
      break;
    case 'search':
      lines = state.searchField?.render(cols) ?? [];
      break;
    case 'searchLoading':
      lines = hintLines(trans.docs.searching, cols);
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
      lines = hintLines(trans.docs.loadingFile, cols);
      break;
    case 'reader':
      lines = state.readerLinksField
        ? state.readerLinksField.render(bodyRows, cols)
        : renderReader(state.readerLines ?? [], cols);
      break;
    case 'error':
      return hintLines(state.errorMessage ?? trans.docs.loadError, cols);
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
