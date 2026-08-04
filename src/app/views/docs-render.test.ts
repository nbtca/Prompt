import { describe, it, expect, beforeAll } from 'vitest';
import { renderDocs, type DocsViewState } from './docs-render.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi, visualWidth } from '../../core/text.js';

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

  it('keeps the selected document visible in a two-row body', () => {
    const filesField = new ListField({
      title: 'Tutorial',
      options: [{ value: 'a.md', label: 'Getting Started' }, { value: '__back__', label: 'Back' }],
    });
    const lines = renderDocs({ mode: 'files', filesField }, 80, 2);

    expect(stripAnsi(lines.slice(0, 2).join('\n'))).toContain('Getting Started');
  });

  it.each([
    ['Community governance and operations', 'Current'],
    ['社区治理与组织协作运行机制', '当前'],
  ])('fits standalone docs lists within twenty columns', (label, hint) => {
    const createField = () => new ListField({
      title: 'Documentation',
      options: [{ value: 'item', label, hint }],
    });
    const states: DocsViewState[] = [
      { mode: 'sections', sectionsField: createField() },
      { mode: 'files', filesField: createField() },
      { mode: 'archivedGroups', archivedGroupsField: createField() },
      { mode: 'archivedFiles', archivedFilesField: createField() },
      { mode: 'reader', readerLinksField: createField() },
    ];

    for (const state of states) {
      const lines = renderDocs(state, 20, 6);
      const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

      expect(lines.length).toBeLessThanOrEqual(6);
      expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
      expect(text).toContain(label.replace(/\s/g, ''));
      expect(text).toContain(hint);
      expect(lines.filter((line) => /[→>]/u.test(stripAnsi(line)))).toHaveLength(1);
    }
  });

  it('search mode renders the text field', () => {
    const searchField = new TextField({ message: 'Search docs' });
    const out = stripAnsi(renderDocs({ mode: 'search', searchField }).join('\n'));
    expect(out).toContain('Search docs');
  });

  it.each([
    ['Search documents by title:', 'Enter a keyword or full document title'],
    ['按文档标题与正文关键词搜索', '输入关键词或完整文档标题'],
  ])('fits a complete docs search input within twenty columns', (message, placeholder) => {
    const searchField = new TextField({ message, placeholder });
    const lines = renderDocs({ mode: 'search', searchField }, 20, 5);
    const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(text).toContain(message.replace(/\s/g, ''));
    expect(text).toContain(placeholder.replace(/\s/g, ''));
    expect(lines.filter((line) => /[→>]/u.test(stripAnsi(line)))).toHaveLength(1);
  });

  it('searchResults mode renders the results list field', () => {
    const searchResultsField = new ListField({ title: 'Results', options: [{ value: 'x.md', label: 'X Doc' }] });
    const out = stripAnsi(renderDocs({ mode: 'searchResults', searchResultsField }).join('\n'));
    expect(out).toContain('X Doc');
  });

  it.each([
    ['en', 'Community governance and operations', 'Current', 'No documents match your search'],
    ['zh', '社区治理与组织协作运行机制', '当前', '未找到匹配的文档'],
  ] as const)('fits empty search results and their action within twenty columns', (language, label, hint, empty) => {
    setLanguage(language);
    try {
      const searchResultsField = new ListField({
        title: 'Results',
        options: [{ value: 'item', label, hint }],
      });
      const lines = renderDocs({ mode: 'searchResults', searchResultsField, searchResultsEmpty: true }, 20, 9);
      const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

      expect(lines.length).toBeLessThanOrEqual(9);
      expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
      expect(text).toContain(empty.replace(/\s/g, ''));
      expect(text).toContain(label.replace(/\s/g, ''));
      expect(text).toContain(hint);
      expect(lines.filter((line) => /[→>]/u.test(stripAnsi(line)))).toHaveLength(1);
    } finally {
      setLanguage('en');
    }
  });

  it('error mode shows the error message', () => {
    const out = stripAnsi(renderDocs({ mode: 'error', errorMessage: 'Broke' }).join('\n'));
    expect(out).toContain('Broke');
  });

  it.each([
    ['en', 'The documentation service could not complete this request'],
    ['zh', '文档服务暂时无法完成当前请求，请稍后重试'],
  ] as const)('fits every docs loading and error surface within twenty columns', (language, errorMessage) => {
    setLanguage(language);
    try {
      const sectionsField = new ListField({
        title: 'Documentation',
        options: [{ value: 'retry', label: 'Retry' }],
      });
      const states: DocsViewState[] = [
        { mode: 'loading' },
        { mode: 'readerLoading' },
        { mode: 'error', errorMessage },
        { mode: 'sections', errorMessage, sectionsField },
      ];

      for (const state of states) {
        const lines = renderDocs(state, 20, 8);
        expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
      }
      const errorText = renderDocs({ mode: 'error', errorMessage }, 20)
        .map(stripAnsi).join('').replace(/\s/g, '');
      expect(errorText).toContain(errorMessage.replace(/\s/g, ''));
    } finally {
      setLanguage('en');
    }
  });

  it.each([
    ['Documentation request failed', 'Return to document categories'],
    ['文档请求处理失败，请稍后重试', '返回文档分类列表'],
  ])('shares six rows between an error and its selected action', (errorMessage, label) => {
    const sectionsField = new ListField({
      title: 'Documentation',
      options: [{ value: 'back', label }],
    });
    const lines = renderDocs({ mode: 'sections', errorMessage, sectionsField }, 20, 6);
    const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

    expect(lines.length).toBeLessThanOrEqual(6);
    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(text).toContain(errorMessage.replace(/\s/g, ''));
    expect(text).toContain(label.replace(/\s/g, ''));
    expect(lines.filter((line) => /[→>]/u.test(stripAnsi(line)))).toHaveLength(1);
  });

  it('wraps Chinese reader text without dropping content', () => {
    const source = '刚认识这个社区？这一栏带你快速看懂：我们是谁、怎么加入、怎么运转。';
    const lines = renderDocs({ mode: 'reader', readerLines: [source] }, 20).map(stripAnsi);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(lines.every((line) => line.startsWith('   '))).toBe(true);
    expect(lines.map((line) => line.slice(3)).join('')).toBe(source);
  });

  it('reflows the same reader content when the terminal width changes', () => {
    const state: DocsViewState = {
      mode: 'reader',
      readerLines: ['文档正文需要随着终端宽度变化重新排版，不能继续沿用第一次打开时的宽度。'],
    };

    const narrow = renderDocs(state, 20);
    const wide = renderDocs(state, 60);

    expect(narrow.length).toBeGreaterThan(wide.length);
    expect(narrow.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(wide.every((line) => visualWidth(line) <= 60)).toBe(true);
  });
});
