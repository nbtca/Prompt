import { type, space } from '../../core/theme.js';
import { t } from '../../i18n/index.js';
import { ListField, renderListFieldWithContext } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import type { DocLink } from '../../features/docs.js';
import { visualWidth, wrapAnsiToVisualWidth } from '../../core/text.js';

export type DocsMode =
  | 'loading'
  | 'sections'
  | 'files'
  | 'archivedGroups'
  | 'archivedFiles'
  | 'search'
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
  // 'reader': an in-app doc view (fetched via loadDocForReader, no shell-out
  // to less/glow) that supports following its own internal links. Body
  // scrolling is the app's existing global PageUp/PageDown mechanism --
  // readerLines just needs to be longer than one screen for that to kick in,
  // same as any other view. readerLinksField is only set while the "jump to
  // a linked doc" picker (opened with 'f') is showing; its presence is what
  // switches render() between "show the doc" and "show the link picker".
  readerTitle?: string;
  readerLines?: string[];
  readerLinks?: DocLink[];
  readerLinksField?: ListField;
}

function hintLines(label: string, cols: number): string[] {
  const width = Number.isFinite(cols) ? Math.max(1, Math.floor(cols)) : Number.POSITIVE_INFINITY;
  const styled = type.hint(label);
  const preferredIndent = visualWidth(space.indent) < width ? space.indent : '';
  const indent = preferredIndent
    && visualWidth(styled) > width - visualWidth(preferredIndent)
    && visualWidth(styled) <= width
    ? ''
    : preferredIndent;
  const contentWidth = Math.max(1, width - visualWidth(indent));
  return wrapAnsiToVisualWidth(styled, contentWidth).map((line) => `${indent}${line}`);
}

function renderReader(lines: string[], cols: number): string[] {
  const contentWidth = Math.max(1, Math.min(80, cols - visualWidth(space.indent)));
  return lines.flatMap((line) => (
    wrapAnsiToVisualWidth(line, contentWidth).map((part) => `${space.indent}${part}`)
  ));
}

function listFieldForState(state: DocsViewState): ListField | undefined {
  switch (state.mode) {
    case 'sections': return state.sectionsField;
    case 'files': return state.filesField;
    case 'archivedGroups': return state.archivedGroupsField;
    case 'archivedFiles': return state.archivedFilesField;
    case 'searchResults': return state.searchResultsField;
    case 'reader': return state.readerLinksField;
    default: return undefined;
  }
}

export function renderDocs(state: DocsViewState, cols = 80, bodyRows = Number.POSITIVE_INFINITY): string[] {
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
    case 'searchResults':
      lines = state.searchResultsField ? renderListFieldWithContext([
        ...(state.searchResultsEmpty ? [...hintLines(trans.docs.searchNoResults, cols), ''] : []),
      ], state.searchResultsField, bodyRows, cols) : [];
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
    default:
      lines = [];
  }
  if (!state.errorMessage) return lines;
  const errorContext = [...hintLines(state.errorMessage, cols), ''];
  const listField = listFieldForState(state);
  if (!listField) return [...errorContext, ...lines];
  const context = state.mode === 'searchResults' && state.searchResultsEmpty
    ? [...errorContext, ...hintLines(trans.docs.searchNoResults, cols), '']
    : errorContext;
  return renderListFieldWithContext(context, listField, bodyRows, cols);
}
