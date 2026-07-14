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
