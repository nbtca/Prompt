import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { DocSection, ListedDoc, ReaderDoc, SearchDoc } from '../../features/docs.js';
import type * as DocsModule from '../../features/docs.js';

const fetchSectionsMock = vi.fn().mockResolvedValue([
  {
    key: 'guide',
    label: 'Guide',
    count: 2,
    files: [
      { name: 'index.md', path: 'tutorial/index.md', type: 'file' },
      { name: 'os-skills.md', path: 'tutorial/manual/os-skills.md', type: 'file' },
    ],
  },
]);

const readerDocs: Record<string, ReaderDoc> = {
  'tutorial/manual/os-skills.md': {
    path: 'tutorial/manual/os-skills.md',
    title: 'OS Skills',
    lines: ['OS Skills content', '', 'See also linked doc.'],
    links: [{ href: 'tutorial/manual/other-doc.md', text: 'linked doc' }],
  },
  'tutorial/manual/other-doc.md': {
    path: 'tutorial/manual/other-doc.md',
    title: 'Other Doc',
    lines: ['Other doc content, no further links.'],
    links: [],
  },
};
function readerDoc(path: string): ReaderDoc {
  const doc = readerDocs[path];
  if (!doc) throw new Error(`no fixture for ${path}`);
  return doc;
}

const loadDocForReaderMock = vi.fn((path: string) => Promise.resolve(readerDoc(path)));
const fetchDocMetadataMock = vi.fn((files: ListedDoc[]) => Promise.resolve(files));
const fetchSectionMetadataMock = vi.fn((section: DocSection) => Promise.resolve(section));
const searchDocumentsMock = vi.fn().mockResolvedValue([]);
const openDocsInBrowserMock = vi.fn().mockResolvedValue(true);
const clearDocsCacheMock = vi.fn();

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

vi.mock('../../features/docs.js', async (importOriginal) => {
  const actual = await importOriginal<typeof DocsModule>();
  return {
    ...actual,
    fetchSections: fetchSectionsMock,
    fetchDocMetadata: fetchDocMetadataMock,
    fetchSectionMetadata: fetchSectionMetadataMock,
    searchDocuments: searchDocumentsMock,
    loadDocForReader: loadDocForReaderMock,
    openDocsInBrowser: openDocsInBrowserMock,
    clearDocsCache: clearDocsCacheMock,
  };
});

const { docsView } = await import('./docs.js');
const { setLanguage, t } = await import('../../i18n/index.js');
const { resetIconCache } = await import('../../core/icons.js');
const { stripAnsi, visualWidth } = await import('../../core/text.js');
import type { AppContext } from '../view.js';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

function fakeCtx() {
  return {
    signal: new AbortController().signal,
    size: { rows: 24, cols: 80 },
    bodyRows: 19,
    rerender: vi.fn(),
    resetScroll: vi.fn(),
    runClassic: vi.fn(async (fn: () => Promise<void>) => {
      await fn();
    }),
    quit: vi.fn(),
  } satisfies AppContext;
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
    expect(typeof docsView.capturesInput()).toBe('boolean');
  });

  it('handleBack() returns false when there is nothing to step back from', () => {
    expect(docsView.handleBack(fakeCtx())).toBe(false);
  });

  it('does not offer move or open actions while loading', () => {
    const hint = stripAnsi(docsView.footerHint(5, 80) ?? '');
    expect(hint).toContain('1-5');
    expect(hint).not.toContain(t().menu.hintMove);
    expect(hint).not.toContain(t().menu.hintOpen);
  });

  it('does not offer move or open actions on an error screen', async () => {
    fetchSectionsMock.mockRejectedValueOnce(new Error('Broke'));
    vi.resetModules();
    const { docsView: freshDocsView } = await import('./docs.js');
    await freshDocsView.load(fakeCtx());
    const hint = stripAnsi(freshDocsView.footerHint(5, 80) ?? '');
    expect(hint).toContain('1-5');
    expect(hint).not.toContain(t().menu.hintMove);
    expect(hint).not.toContain(t().menu.hintOpen);
  });

  it('rebuilds the cached section menu after a language change without fetching again', async () => {
    setLanguage('zh');
    fetchSectionsMock.mockClear();
    fetchSectionsMock.mockResolvedValueOnce([
      {
        key: 'guide',
        label: '指南',
        count: 1,
        files: [{ name: 'os-skills.md', path: 'tutorial/manual/os-skills.md', type: 'file' }],
      },
    ]);
    vi.resetModules();
    const { docsView: freshDocsView } = await import('./docs.js');
    const { setLanguage: setFreshLanguage } = await import('../../i18n/index.js');
    const ctx = fakeCtx();

    try {
      setFreshLanguage('zh');
      await freshDocsView.load(ctx);
      expect(stripAnsi(freshDocsView.render(ctx).join('\n'))).toContain('指南');

      setLanguage('en');
      setFreshLanguage('en');
      await freshDocsView.load(ctx);
      const out = stripAnsi(freshDocsView.render(ctx).join('\n'));
      expect(out).toContain('Guide');
      expect(out).not.toContain('指南');
      expect(fetchSectionsMock).toHaveBeenCalledTimes(1);
    } finally {
      setFreshLanguage('en');
      setLanguage('en');
    }
  });

  it('rebuilds a cached file list in place and preserves its selection after a language change', async () => {
    setLanguage('zh');
    fetchSectionsMock.mockClear();
    fetchSectionsMock.mockResolvedValueOnce([
      {
        key: 'guide',
        label: '指南',
        count: 2,
        files: [
          { name: 'index.md', path: 'tutorial/index.md', type: 'file' },
          { name: 'os-skills.md', path: 'tutorial/manual/os-skills.md', type: 'file' },
        ],
      },
    ]);
    vi.resetModules();
    const { docsView: freshDocsView } = await import('./docs.js');
    const { setLanguage: setFreshLanguage } = await import('../../i18n/index.js');
    const ctx = fakeCtx();

    try {
      setFreshLanguage('zh');
      await freshDocsView.load(ctx);
      freshDocsView.handleKey('\r', ctx);
      freshDocsView.handleKey('\x1b[B', ctx);

      setLanguage('en');
      setFreshLanguage('en');
      await freshDocsView.load(ctx);
      const out = stripAnsi(freshDocsView.render(ctx).join('\n'));
      expect(out).toContain('Guide');
      expect(out).toContain('Overview');
      expect(out).toContain('Back');
      const selected = out.split('\n').find((line) => line.includes('Os Skills'));
      expect(selected?.trim().startsWith('→')).toBe(true);
      expect(fetchSectionsMock).toHaveBeenCalledTimes(1);
    } finally {
      setFreshLanguage('en');
      setLanguage('en');
    }
  });

  it('rebuilds cached archived navigation in place after a language change', async () => {
    setLanguage('zh');
    fetchSectionsMock.mockClear();
    fetchSectionsMock.mockResolvedValueOnce([
      {
        key: 'archived',
        label: '归档',
        count: 2,
        files: [
          { name: 'alpha.md', path: 'archived/2026/alpha.md', type: 'file' },
          { name: 'beta.md', path: 'archived/2025/beta.md', type: 'file' },
        ],
      },
    ]);
    vi.resetModules();
    const { docsView: freshDocsView } = await import('./docs.js');
    const { setLanguage: setFreshLanguage } = await import('../../i18n/index.js');
    const ctx = fakeCtx();

    try {
      setFreshLanguage('zh');
      await freshDocsView.load(ctx);
      freshDocsView.handleKey('\r', ctx);
      freshDocsView.handleKey('\x1b[B', ctx);
      freshDocsView.handleKey('\r', ctx);
      freshDocsView.handleKey('\x1b[B', ctx);

      setLanguage('en');
      setFreshLanguage('en');
      await freshDocsView.load(ctx);
      const out = stripAnsi(freshDocsView.render(ctx).join('\n'));
      expect(out).toContain('Archived · 2025');
      const selected = out.split('\n').find((line) => line.includes('Back'));
      expect(selected?.trim().startsWith('→')).toBe(true);
      expect(fetchSectionsMock).toHaveBeenCalledTimes(1);
    } finally {
      setFreshLanguage('en');
      setLanguage('en');
    }
  });

  it('rebuilds cached search results in place after a language change', async () => {
    setLanguage('zh');
    fetchSectionsMock.mockClear();
    searchDocumentsMock.mockClear();
    searchDocumentsMock.mockResolvedValueOnce([
      {
        name: 'os-skills.md',
        path: 'tutorial/manual/os-skills.md',
        type: 'file',
        title: 'OS Skills',
        summary: 'A practical guide',
        excerpt: 'Learn operating system skills',
        route: '/tutorial/manual/os-skills',
        score: 80,
        section: 'tutorial',
      },
    ]);
    vi.resetModules();
    const { docsView: freshDocsView } = await import('./docs.js');
    const { setLanguage: setFreshLanguage } = await import('../../i18n/index.js');
    const ctx = fakeCtx();

    try {
      setFreshLanguage('zh');
      await freshDocsView.load(ctx);
      freshDocsView.handleKey('\x1b[B', ctx);
      freshDocsView.handleKey('\r', ctx);
      freshDocsView.handleKey('o', ctx);
      freshDocsView.handleKey('\r', ctx);
      await new Promise((resolve) => setTimeout(resolve, 0));
      freshDocsView.handleKey('\x1b[B', ctx);

      setLanguage('en');
      setFreshLanguage('en');
      await freshDocsView.load(ctx);
      const out = stripAnsi(freshDocsView.render(ctx).join('\n'));
      expect(out).toContain('Choose a document or directory:');
      const selected = out.split('\n').find((line) => line.includes('Back'));
      expect(selected?.trim().startsWith('→')).toBe(true);
      expect(searchDocumentsMock).toHaveBeenCalledWith('o', ctx.signal);
      expect(fetchSectionsMock).toHaveBeenCalledTimes(1);
    } finally {
      setFreshLanguage('en');
      setLanguage('en');
    }
  });
});

describe('docsView file list', () => {
  it('derives a readable title from a tutorial filename', async () => {
    const ctx = fakeCtx();
    await docsView.load(ctx);
    docsView.handleKey('\r', ctx); // sections field has one option (tutorial) selected by default

    const out = stripAnsi(docsView.render(ctx).join('\n'));
    expect(out).toContain('Os Skills');
  });

  it('pins index.md at the top as "Overview", not filtered out or shown as a literal filename', () => {
    const ctx = fakeCtx();
    const out = stripAnsi(docsView.render(ctx).join('\n'));
    expect(out).toContain('Overview');
    expect(out).not.toContain('index.md');
    expect(out).not.toContain('Index');
    const overviewLine = out.split('\n').findIndex((l) => l.includes('Overview'));
    const skillsLine = out.split('\n').findIndex((l) => l.includes('Os Skills'));
    expect(overviewLine).toBeGreaterThan(-1);
    expect(overviewLine).toBeLessThan(skillsLine);
  });
});

describe('docsView native reader (no shell-out to less/glow)', () => {
  let freshDocsView: typeof docsView;

  beforeEach(async () => {
    fetchSectionsMock.mockClear();
    loadDocForReaderMock.mockClear();
    fetchDocMetadataMock.mockReset().mockImplementation((files) => Promise.resolve(files));
    fetchSectionMetadataMock.mockReset().mockImplementation((section) => Promise.resolve(section));
    searchDocumentsMock.mockReset().mockResolvedValue([]);
    openDocsInBrowserMock.mockReset().mockResolvedValue(true);
    clearDocsCacheMock.mockClear();
    vi.resetModules();
    const { setLanguage: setFreshLanguage } = await import('../../i18n/index.js');
    setFreshLanguage('en');
    ({ docsView: freshDocsView } = await import('./docs.js'));
  });

  async function openTutorialFiles(ctx: AppContext): Promise<void> {
    await freshDocsView.load(ctx);
    freshDocsView.handleKey('\r', ctx); // sections -> files
  }

  function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('opens a selected file directly into the reader (not the classic pager)', async () => {
    const ctx = fakeCtx();
    await openTutorialFiles(ctx);
    freshDocsView.handleKey('\x1b[B', ctx); // files: Overview is first, move down to os-skills.md
    freshDocsView.handleKey('\r', ctx); // select it
    await flush();

    expect(loadDocForReaderMock).toHaveBeenCalledWith('tutorial/manual/os-skills.md', ctx.signal);
    expect(ctx.runClassic).not.toHaveBeenCalled();
    const out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).toContain('OS Skills content');
  });

  it('ignores a deferred section response after abort', async () => {
    const pending = deferred<DocSection[]>();
    fetchSectionsMock.mockReturnValueOnce(pending.promise);
    vi.resetModules();
    const { docsView: loadingView } = await import('./docs.js');
    const lifecycle = new AbortController();
    const ctx = { ...fakeCtx(), signal: lifecycle.signal } satisfies AppContext;
    const loading = loadingView.load(ctx);
    const renders = ctx.rerender.mock.calls.length;

    lifecycle.abort();
    pending.resolve([
      {
        key: 'guide',
        label: 'Late guide',
        count: 0,
        files: [],
      },
    ]);
    await loading;

    expect(ctx.rerender).toHaveBeenCalledTimes(renders);
    expect(stripAnsi(loadingView.render(ctx).join('\n'))).not.toContain('Late guide');
  });

  it('ignores deferred metadata after abort', async () => {
    const pending = deferred<DocSection>();
    fetchSectionMetadataMock.mockReturnValueOnce(pending.promise);
    const lifecycle = new AbortController();
    const ctx = { ...fakeCtx(), signal: lifecycle.signal } satisfies AppContext;
    await freshDocsView.load(ctx);
    freshDocsView.handleKey('\r', ctx);
    const renders = ctx.rerender.mock.calls.length;

    lifecycle.abort();
    pending.resolve({
      key: 'guide',
      label: 'Guide',
      count: 1,
      files: [
        {
          name: 'os-skills.md',
          path: 'tutorial/manual/os-skills.md',
          type: 'file',
          title: 'Late metadata',
          summary: 'Late summary',
        },
      ],
    });
    await flush();

    expect(ctx.rerender).toHaveBeenCalledTimes(renders);
    const out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).not.toContain('Late metadata');
    expect(out).not.toContain('Late summary');
  });

  it('ignores deferred search results after abort', async () => {
    const pending = deferred<SearchDoc[]>();
    searchDocumentsMock.mockReturnValueOnce(pending.promise);
    const lifecycle = new AbortController();
    const ctx = { ...fakeCtx(), signal: lifecycle.signal } satisfies AppContext;
    await freshDocsView.load(ctx);
    freshDocsView.handleKey('\x1b[B', ctx);
    freshDocsView.handleKey('\r', ctx);
    freshDocsView.handleKey('late', ctx);
    freshDocsView.handleKey('\r', ctx);
    const renders = ctx.rerender.mock.calls.length;

    lifecycle.abort();
    pending.resolve([
      {
        name: 'late.md',
        path: 'tutorial/late.md',
        type: 'file',
        title: 'Late result',
        summary: '',
        excerpt: '',
        route: '/tutorial/late',
        score: 1,
        section: 'tutorial',
      },
    ]);
    await flush();

    expect(ctx.rerender).toHaveBeenCalledTimes(renders);
    expect(stripAnsi(freshDocsView.render(ctx).join('\n'))).not.toContain('Late result');
  });

  it('ignores a deferred reader response after abort', async () => {
    const pending = deferred<ReaderDoc>();
    loadDocForReaderMock.mockReturnValueOnce(pending.promise);
    const lifecycle = new AbortController();
    const ctx = { ...fakeCtx(), signal: lifecycle.signal } satisfies AppContext;
    await openTutorialFiles(ctx);
    freshDocsView.handleKey('\x1b[B', ctx);
    freshDocsView.handleKey('\r', ctx);
    const renders = ctx.rerender.mock.calls.length;

    lifecycle.abort();
    pending.resolve(readerDoc('tutorial/manual/os-skills.md'));
    await flush();

    expect(ctx.rerender).toHaveBeenCalledTimes(renders);
    expect(stripAnsi(freshDocsView.render(ctx).join('\n'))).not.toContain('OS Skills content');
  });

  it('replaces filename fallbacks with document titles without moving the selection', async () => {
    let resolveMetadata!: (section: DocSection) => void;
    fetchSectionMetadataMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMetadata = resolve;
        }),
    );
    const ctx = fakeCtx();
    await openTutorialFiles(ctx);
    freshDocsView.handleKey('\x1b[B', ctx);

    resolveMetadata({
      key: 'guide',
      label: 'Guide',
      count: 2,
      files: [
        {
          name: 'index.md',
          path: 'tutorial/index.md',
          type: 'file',
          title: 'Guide landing page',
          summary: '',
        },
        {
          name: 'os-skills.md',
          path: 'tutorial/manual/os-skills.md',
          type: 'file',
          title: 'Operating Systems Handbook',
          summary: 'Practical workstation skills',
        },
      ],
    });
    await flush();

    const out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).toContain('Operating Systems Handbook');
    expect(out).toContain('Practical workstation skills');
    const selected = out.split('\n').find((line) => line.includes('Operating Systems Handbook'));
    expect(selected?.trim().startsWith('→')).toBe(true);
  });

  it('does not let late metadata replace a document opened from the fallback list', async () => {
    let resolveMetadata!: (section: DocSection) => void;
    fetchSectionMetadataMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMetadata = resolve;
        }),
    );
    const ctx = fakeCtx();
    await openTutorialFiles(ctx);
    freshDocsView.handleKey('\x1b[B', ctx);
    freshDocsView.handleKey('\r', ctx);
    await flush();

    resolveMetadata({
      key: 'guide',
      label: 'Guide',
      count: 0,
      files: [],
    });
    await flush();

    expect(stripAnsi(freshDocsView.render(ctx).join('\n'))).toContain('OS Skills content');
  });

  it('ignores search results that arrive after leaving the search screen', async () => {
    let resolveSearch!: (results: SearchDoc[]) => void;
    searchDocumentsMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );
    const ctx = fakeCtx();
    await freshDocsView.load(ctx);
    freshDocsView.handleKey('\x1b[B', ctx);
    freshDocsView.handleKey('\r', ctx);
    freshDocsView.handleKey('o', ctx);
    freshDocsView.handleKey('\r', ctx);

    expect(freshDocsView.handleBack(ctx)).toBe(true);
    resolveSearch([
      {
        name: 'os-skills.md',
        path: 'tutorial/manual/os-skills.md',
        type: 'file',
        title: 'Late result',
        summary: '',
        excerpt: '',
        route: '/tutorial/manual/os-skills',
        score: 1,
        section: 'tutorial',
      },
    ]);
    await flush();

    const out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).toContain('Guide');
    expect(out).not.toContain('Late result');
  });

  it('runs the root browser action outside the full-screen app', async () => {
    const ctx = fakeCtx();
    await freshDocsView.load(ctx);
    freshDocsView.handleKey('\x1b[F', ctx);
    freshDocsView.handleKey('\r', ctx);
    await flush();

    expect(ctx.runClassic).toHaveBeenCalledTimes(1);
    expect(openDocsInBrowserMock).toHaveBeenCalledWith(undefined, ctx.signal);
  });

  it('clears caches and reloads the document tree from the root menu', async () => {
    fetchSectionsMock.mockClear();
    const ctx = fakeCtx();
    await freshDocsView.load(ctx);
    freshDocsView.handleKey('\x1b[F', ctx);
    freshDocsView.handleKey('\x1b[A', ctx);
    freshDocsView.handleKey('\r', ctx);
    await flush();

    expect(clearDocsCacheMock).toHaveBeenCalledTimes(1);
    expect(fetchSectionsMock).toHaveBeenCalledTimes(2);
    expect(stripAnsi(freshDocsView.render(ctx).join('\n'))).toContain('Guide');
  });

  it('runs the reader browser action outside the full-screen app', async () => {
    const ctx = fakeCtx();
    await openTutorialFiles(ctx);
    freshDocsView.handleKey('\x1b[B', ctx);
    freshDocsView.handleKey('\r', ctx);
    await flush();
    freshDocsView.handleKey('b', ctx);
    await flush();

    expect(ctx.runClassic).toHaveBeenCalledTimes(1);
    expect(openDocsInBrowserMock).toHaveBeenCalledWith('tutorial/manual/os-skills.md', ctx.signal);
  });

  it('keeps the reader and a manual URL visible when the browser fails', async () => {
    openDocsInBrowserMock.mockResolvedValueOnce(false);
    const ctx = fakeCtx();
    await openTutorialFiles(ctx);
    freshDocsView.handleKey('\x1b[B', ctx);
    freshDocsView.handleKey('\r', ctx);
    await flush();
    freshDocsView.handleKey('b', ctx);
    await flush();

    const out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).toContain('Failed to open browser');
    expect(out).toContain('https://docs.nbtca.space/tutorial/manual/os-skills');
    expect(out).toContain('OS Skills content');
  });

  it('ignores a late browser failure after the view lifecycle is aborted', async () => {
    const lifecycle = new AbortController();
    openDocsInBrowserMock.mockImplementationOnce(() => {
      lifecycle.abort();
      return Promise.resolve(false);
    });
    const ctx = { ...fakeCtx(), signal: lifecycle.signal } satisfies AppContext;
    await openTutorialFiles(ctx);
    freshDocsView.handleKey('\x1b[B', ctx);
    freshDocsView.handleKey('\r', ctx);
    await flush();
    freshDocsView.handleKey('b', ctx);
    await flush();

    const out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).not.toContain('Failed to open browser');
    expect(out).not.toContain('Open manually');
    expect(out).toContain('OS Skills content');
  });

  it('Esc cancels an in-flight reader load and keeps the restored file list', async () => {
    let resolveLoad!: (doc: ReaderDoc) => void;
    loadDocForReaderMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const ctx = fakeCtx();
    await openTutorialFiles(ctx);
    freshDocsView.handleKey('\x1b[B', ctx);
    freshDocsView.handleKey('\r', ctx);

    expect(freshDocsView.handleBack(ctx)).toBe(true);
    let out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).toContain('Os Skills');

    resolveLoad(readerDoc('tutorial/manual/os-skills.md'));
    await flush();
    out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).toContain('Os Skills');
    expect(out).not.toContain('OS Skills content');
  });

  it('"f" opens a link picker listing the doc\'s own internal links; selecting one follows it', async () => {
    const ctx = fakeCtx();
    await openTutorialFiles(ctx);
    freshDocsView.handleKey('\x1b[B', ctx);
    freshDocsView.handleKey('\r', ctx); // now reading os-skills.md
    await flush();

    freshDocsView.handleKey('f', ctx);
    let out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).toContain('linked doc');

    freshDocsView.handleKey('\r', ctx); // link picker's only real option, selected by default
    await flush();
    expect(loadDocForReaderMock).toHaveBeenCalledWith('tutorial/manual/other-doc.md', ctx.signal);
    out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).toContain('Other doc content, no further links.');
  });

  it('keeps the current document and navigation stack when an internal link fails to load', async () => {
    const ctx = fakeCtx();
    await openTutorialFiles(ctx);
    freshDocsView.handleKey('\x1b[B', ctx);
    freshDocsView.handleKey('\r', ctx);
    await flush();
    freshDocsView.handleKey('f', ctx);
    loadDocForReaderMock.mockRejectedValueOnce(new Error('offline'));
    freshDocsView.handleKey('\r', ctx);
    await flush();

    const out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).toContain(t().docs.loadError);
    expect(out).toContain('OS Skills content');
    expect(out).not.toContain('Other doc content, no further links.');

    expect(freshDocsView.handleBack(ctx)).toBe(true);
    expect(stripAnsi(freshDocsView.render(ctx).join('\n'))).toContain('Os Skills');
  });

  it('rebuilds an open reader link picker in place after a language change', async () => {
    const { setLanguage: setFreshLanguage } = await import('../../i18n/index.js');
    const ctx = fakeCtx();
    try {
      setLanguage('zh');
      setFreshLanguage('zh');
      await openTutorialFiles(ctx);
      freshDocsView.handleKey('\x1b[B', ctx);
      freshDocsView.handleKey('\r', ctx);
      await flush();
      freshDocsView.handleKey('f', ctx);
      freshDocsView.handleKey('\x1b[B', ctx);

      setLanguage('en');
      setFreshLanguage('en');
      await freshDocsView.load(ctx);
      const out = stripAnsi(freshDocsView.render(ctx).join('\n'));
      expect(out).toContain('Jump to');
      const selected = out.split('\n').find((line) => line.includes('Back'));
      expect(selected?.trim().startsWith('→')).toBe(true);
    } finally {
      setFreshLanguage('en');
      setLanguage('en');
    }
  });

  it('rebuilds the reader return target after a language change', async () => {
    const { setLanguage: setFreshLanguage } = await import('../../i18n/index.js');
    const ctx = fakeCtx();
    try {
      setLanguage('zh');
      setFreshLanguage('zh');
      await openTutorialFiles(ctx);
      freshDocsView.handleKey('\x1b[B', ctx);
      freshDocsView.handleKey('\r', ctx);
      await flush();

      setLanguage('en');
      setFreshLanguage('en');
      await freshDocsView.load(ctx);
      expect(freshDocsView.handleBack(ctx)).toBe(true);
      const out = stripAnsi(freshDocsView.render(ctx).join('\n'));
      expect(out).toContain('Guide');
      expect(out).toContain('Overview');
      expect(out).toContain('Back');
      const selected = out.split('\n').find((line) => line.includes('Os Skills'));
      expect(selected?.trim().startsWith('→')).toBe(true);
    } finally {
      setFreshLanguage('en');
      setLanguage('en');
    }
  });

  it('"f" is a no-op on a doc with no links (nothing to jump to)', async () => {
    const ctx = fakeCtx();
    await openTutorialFiles(ctx);
    freshDocsView.handleKey('\x1b[B', ctx);
    freshDocsView.handleKey('\r', ctx);
    await flush();
    freshDocsView.handleKey('f', ctx); // -> other-doc.md (has links)
    freshDocsView.handleKey('\r', ctx);
    await flush();
    freshDocsView.handleKey('f', ctx); // other-doc.md has zero links -- must not open a picker

    const out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).toContain('Other doc content, no further links.');
    expect(out).not.toContain('Overview'); // i.e. did not fall back into some other field's rendering
  });

  it('Esc pops the link-following nav stack one doc at a time, then returns to the file list', async () => {
    const ctx = fakeCtx();
    await openTutorialFiles(ctx);
    freshDocsView.handleKey('\x1b[B', ctx);
    freshDocsView.handleKey('\r', ctx); // reading os-skills.md
    await flush();
    freshDocsView.handleKey('f', ctx);
    freshDocsView.handleKey('\r', ctx); // followed the link -> reading other-doc.md
    await flush();

    expect(freshDocsView.handleBack(ctx)).toBe(true);
    await flush();
    let out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).toContain('OS Skills content'); // back to the doc we linked from

    expect(freshDocsView.handleBack(ctx)).toBe(true);
    out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).toContain('Os Skills'); // back to the file list itself
  });

  it('Esc while the link picker is open closes the picker but stays on the same doc (does not pop the nav stack)', async () => {
    const ctx = fakeCtx();
    await openTutorialFiles(ctx);
    freshDocsView.handleKey('\x1b[B', ctx);
    freshDocsView.handleKey('\r', ctx); // reading os-skills.md
    await flush();
    freshDocsView.handleKey('f', ctx); // link picker open

    expect(freshDocsView.handleBack(ctx)).toBe(true);
    const out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).toContain('OS Skills content'); // still on os-skills.md, picker just closed
  });

  it('footerHint drops move/open while reading (no field), but not while the link picker is open', async () => {
    const ctx = fakeCtx();
    await openTutorialFiles(ctx);
    freshDocsView.handleKey('\x1b[B', ctx);
    freshDocsView.handleKey('\r', ctx); // reading os-skills.md (has a link)
    await flush();

    const readingHint = freshDocsView.footerHint(5, 80);
    expect(readingHint).toContain(t().docs.readerLinksHint);
    expect(readingHint).toContain('PgUp/PgDn');
    expect(readingHint).toContain('\u2191\u2193');
    expect(readingHint).not.toContain(t().menu.hintMove);

    const compactHint = freshDocsView.footerHint(5, 40) ?? '';
    expect(visualWidth(compactHint)).toBeLessThanOrEqual(37);
    expect(compactHint).toContain('PgUp/PgDn');
    expect(compactHint).toContain('f');
    expect(compactHint).toContain('b');
    expect(compactHint).toContain('Esc');
    expect(compactHint).toContain('q');
    expect(compactHint).not.toContain('Tab');

    const narrowHint = freshDocsView.footerHint(5, 20) ?? '';
    expect(visualWidth(narrowHint)).toBeLessThanOrEqual(17);
    expect(narrowHint).toContain('f');
    expect(narrowHint).toContain('b');
    expect(narrowHint).toContain('Esc');
    expect(narrowHint).toContain('q');

    freshDocsView.handleKey('f', ctx); // link picker open now -- a real ListField
    expect(freshDocsView.footerHint(5, 80)).toBeUndefined(); // falls through to chrome's generic move/open hint
  });
});
