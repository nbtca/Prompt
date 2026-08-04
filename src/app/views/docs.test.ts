import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { ReaderDoc } from '../../features/docs.js';

const fetchSectionsMock = vi.fn().mockResolvedValue([
  {
    key: 'guide', label: 'Guide', count: 2,
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
const loadDocForReaderMock = vi.fn(async (path: string) => {
  const doc = readerDocs[path];
  if (!doc) throw new Error(`no fixture for ${path}`);
  return doc;
});
const fetchAllDocsMock = vi.fn().mockResolvedValue([]);
const openDocsInBrowserMock = vi.fn().mockResolvedValue(undefined);
const clearDocsCacheMock = vi.fn();

vi.mock('../../features/docs.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/docs.js')>();
  return {
    ...actual,
    fetchSections: fetchSectionsMock,
    fetchAllDocs: fetchAllDocsMock,
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

function fakeCtx(): AppContext {
  return {
    size: { rows: 24, cols: 80 },
    bodyRows: 19,
    rerender: vi.fn(), resetScroll: vi.fn(),
    runClassic: vi.fn(async (fn: () => Promise<void>) => { await fn(); }),
    quit: vi.fn(),
  };
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
    expect(typeof docsView.capturesInput?.()).toBe('boolean');
  });

  it('handleBack() returns false when there is nothing to step back from', () => {
    // Fresh module state (no load() has run): not in a files/archived/search
    // sub-mode, so there is nothing for the view to step back to internally.
    expect(docsView.handleBack?.()).toBe(false);
  });

  it('does not offer move or open actions while loading', () => {
    const hint = stripAnsi(docsView.footerHint?.(5) ?? '');
    expect(hint).toContain('1-5');
    expect(hint).not.toContain(t().menu.hintMove);
    expect(hint).not.toContain(t().menu.hintOpen);
  });

  it('does not offer move or open actions on an error screen', async () => {
    fetchSectionsMock.mockRejectedValueOnce(new Error('Broke'));
    vi.resetModules();
    const { docsView: freshDocsView } = await import('./docs.js');
    await freshDocsView.load(fakeCtx());
    const hint = stripAnsi(freshDocsView.footerHint?.(5) ?? '');
    expect(hint).toContain('1-5');
    expect(hint).not.toContain(t().menu.hintMove);
    expect(hint).not.toContain(t().menu.hintOpen);
  });

  it('rebuilds the cached section menu after a language change without fetching again', async () => {
    setLanguage('zh');
    fetchSectionsMock.mockClear();
    fetchSectionsMock.mockResolvedValueOnce([
      {
        key: 'guide', label: '指南', count: 1,
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
        key: 'guide', label: '指南', count: 2,
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
      const selected = out.split('\n').find((line) => line.includes('基础操作系统的使用技术'));
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
        key: 'archived', label: '归档', count: 2,
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
    fetchAllDocsMock.mockClear();
    fetchAllDocsMock.mockResolvedValueOnce([
      { name: 'os-skills.md', path: 'tutorial/manual/os-skills.md', type: 'file' },
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
      expect(fetchAllDocsMock).toHaveBeenCalledTimes(1);
      expect(fetchSectionsMock).toHaveBeenCalledTimes(1);
    } finally {
      setFreshLanguage('en');
      setLanguage('en');
    }
  });
});

describe('docsView file list shows the real document title', () => {
  it('shows the known real title, not the filename-derived one, for a tutorial doc', async () => {
    // Regression: the tutorial/process/repair file list used to show
    // cleanFileName('os-skills.md') = "Os Skills" -- a mechanical
    // title-case of the English filename -- instead of the document's
    // own real (Chinese) title, even though these docs are entirely
    // Chinese content with English filenames by convention only.
    const ctx = fakeCtx();
    await docsView.load(ctx);
    docsView.handleKey('\r', ctx); // sections field has one option (tutorial) selected by default

    const out = stripAnsi(docsView.render(ctx).join('\n'));
    expect(out).toContain('基础操作系统的使用技术');
    expect(out).not.toContain('Os Skills');
  });

  it('pins index.md at the top as "Overview", not filtered out or shown as a literal filename', () => {
    // Regression: buildFilesField used to filter index.md out of the list
    // entirely (f.name !== 'index.md'), making nbtca/documents' hand-curated
    // hub pages (repair/index.md, concepts/index.md -- each a categorized
    // landing page, not just a stub) completely unreachable from the Docs
    // tab. Reuses the same loaded state as the test above (same section,
    // now with an index.md file too), not a fresh load().
    const ctx = fakeCtx();
    const out = stripAnsi(docsView.render(ctx).join('\n'));
    expect(out).toContain('Overview');
    expect(out).not.toContain('index.md');
    expect(out).not.toContain('Index');
    // Overview must be the first option, above the real files.
    const overviewLine = out.split('\n').findIndex(l => l.includes('Overview'));
    const skillsLine = out.split('\n').findIndex(l => l.includes('基础操作系统的使用技术'));
    expect(overviewLine).toBeGreaterThan(-1);
    expect(overviewLine).toBeLessThan(skillsLine);
  });
});

describe('docsView native reader (no shell-out to less/glow)', () => {
  // docsView's module state (loaded/state/readerNavStack) is private and
  // persists across tests in the same file by design (real navigation
  // shouldn't reset on every render) -- these tests need a genuinely fresh
  // instance each time instead, since they depend on knowing the *exact*
  // starting mode/cursor position, not whatever an earlier test left behind.
  let freshDocsView: typeof docsView;

  beforeEach(async () => {
    loadDocForReaderMock.mockClear();
    openDocsInBrowserMock.mockClear();
    clearDocsCacheMock.mockClear();
    vi.resetModules();
    ({ docsView: freshDocsView } = await import('./docs.js'));
  });

  // Sections has one option (tutorial), selected by default -- Enter twice
  // gets from load() straight into the files list, matching real navigation.
  async function openTutorialFiles(ctx: AppContext): Promise<void> {
    await freshDocsView.load(ctx);
    freshDocsView.handleKey('\r', ctx); // sections -> files
  }

  // openInReader() is fire-and-forget from handleKey's perspective (real
  // app code drives it via ctx.rerender(), not by awaiting a promise the
  // key handler returns) -- a real terminal's next paint just happens to
  // land after the microtask queue drains. Tests need to wait for that
  // same drain explicitly before asserting on render() output.
  function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('opens a selected file directly into the reader (not the classic pager)', async () => {
    const ctx = fakeCtx();
    await openTutorialFiles(ctx);
    freshDocsView.handleKey('\x1b[B', ctx); // files: Overview is first, move down to os-skills.md
    freshDocsView.handleKey('\r', ctx);     // select it
    await flush();

    expect(loadDocForReaderMock).toHaveBeenCalledWith('tutorial/manual/os-skills.md');
    expect(ctx.runClassic).not.toHaveBeenCalled();
    const out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).toContain('OS Skills content');
  });

  it('runs the root browser action outside the full-screen app', async () => {
    const ctx = fakeCtx();
    await freshDocsView.load(ctx);
    freshDocsView.handleKey('\x1b[F', ctx);
    freshDocsView.handleKey('\r', ctx);
    await flush();

    expect(ctx.runClassic).toHaveBeenCalledTimes(1);
    expect(openDocsInBrowserMock).toHaveBeenCalledWith();
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
    expect(openDocsInBrowserMock).toHaveBeenCalledWith('tutorial/manual/os-skills.md');
  });

  it('Esc cancels an in-flight reader load and keeps the restored file list', async () => {
    let resolveLoad!: (doc: ReaderDoc) => void;
    loadDocForReaderMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveLoad = resolve;
    }));
    const ctx = fakeCtx();
    await openTutorialFiles(ctx);
    freshDocsView.handleKey('\x1b[B', ctx);
    freshDocsView.handleKey('\r', ctx);

    expect(freshDocsView.handleBack?.(ctx)).toBe(true);
    let out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).toContain('基础操作系统的使用技术');

    resolveLoad(readerDocs['tutorial/manual/os-skills.md']!);
    await flush();
    out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).toContain('基础操作系统的使用技术');
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
    expect(loadDocForReaderMock).toHaveBeenCalledWith('tutorial/manual/other-doc.md');
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

    expect(freshDocsView.handleBack?.(ctx)).toBe(true);
    expect(stripAnsi(freshDocsView.render(ctx).join('\n'))).toContain('基础操作系统的使用技术');
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
      expect(freshDocsView.handleBack?.(ctx)).toBe(true);
      const out = stripAnsi(freshDocsView.render(ctx).join('\n'));
      expect(out).toContain('Guide');
      expect(out).toContain('Overview');
      expect(out).toContain('Back');
      const selected = out.split('\n').find((line) => line.includes('基础操作系统的使用技术'));
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

    expect(freshDocsView.handleBack?.(ctx)).toBe(true);
    await flush();
    let out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).toContain('OS Skills content'); // back to the doc we linked from

    expect(freshDocsView.handleBack?.(ctx)).toBe(true);
    out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).toContain('基础操作系统的使用技术'); // back to the file list itself
  });

  it('Esc while the link picker is open closes the picker but stays on the same doc (does not pop the nav stack)', async () => {
    const ctx = fakeCtx();
    await openTutorialFiles(ctx);
    freshDocsView.handleKey('\x1b[B', ctx);
    freshDocsView.handleKey('\r', ctx); // reading os-skills.md
    await flush();
    freshDocsView.handleKey('f', ctx);  // link picker open

    expect(freshDocsView.handleBack?.(ctx)).toBe(true);
    const out = stripAnsi(freshDocsView.render(ctx).join('\n'));
    expect(out).toContain('OS Skills content'); // still on os-skills.md, picker just closed
  });

  it('footerHint drops move/open while reading (no field), but not while the link picker is open', async () => {
    const ctx = fakeCtx();
    await openTutorialFiles(ctx);
    freshDocsView.handleKey('\x1b[B', ctx);
    freshDocsView.handleKey('\r', ctx); // reading os-skills.md (has a link)
    await flush();

    const readingHint = freshDocsView.footerHint?.(5);
    expect(readingHint).toContain(t().docs.readerLinksHint);
    expect(readingHint).toContain('PgUp/PgDn');
    expect(readingHint).not.toContain(t().menu.hintMove);

    const compactHint = freshDocsView.footerHint?.(5, 40) ?? '';
    expect(visualWidth(compactHint)).toBeLessThanOrEqual(37);
    expect(compactHint).toContain('PgUp/PgDn');
    expect(compactHint).toContain('f');
    expect(compactHint).toContain('b');
    expect(compactHint).toContain('Esc');
    expect(compactHint).toContain('q');
    expect(compactHint).not.toContain('Tab');

    const narrowHint = freshDocsView.footerHint?.(5, 20) ?? '';
    expect(visualWidth(narrowHint)).toBeLessThanOrEqual(17);
    expect(narrowHint).toContain('f');
    expect(narrowHint).toContain('b');
    expect(narrowHint).toContain('Esc');
    expect(narrowHint).toContain('q');

    freshDocsView.handleKey('f', ctx); // link picker open now -- a real ListField
    expect(freshDocsView.footerHint?.(5)).toBeUndefined(); // falls through to chrome's generic move/open hint
  });
});
