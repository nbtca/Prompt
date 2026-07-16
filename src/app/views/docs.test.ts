import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../../features/docs.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/docs.js')>();
  return {
    ...actual,
    fetchSections: vi.fn().mockResolvedValue([
      {
        key: 'tutorial', label: 'Tutorials', count: 1,
        files: [{ name: 'os-skills.md', path: 'tutorial/manual/os-skills.md', type: 'file' }],
      },
    ]),
  };
});

const { docsView } = await import('./docs.js');
const { setLanguage } = await import('../../i18n/index.js');
const { resetIconCache } = await import('../../core/icons.js');
const { stripAnsi } = await import('../../core/text.js');
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
    rerender: vi.fn(),
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
});
