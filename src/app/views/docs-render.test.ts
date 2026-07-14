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
