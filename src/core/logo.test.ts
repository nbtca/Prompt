import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildLogoLines, startupFitsTerminal } from './logo.js';
import { stripAnsi } from './text.js';
import { resetIconCache } from './icons.js';

describe('buildLogoLines', () => {
  it('returns an array of single-line strings', () => {
    const lines = buildLogoLines();
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.every((l) => !l.includes('\n'))).toBe(true);
  });

  it('includes the tagline and a version line', () => {
    const text = buildLogoLines().map(stripAnsi).join('\n');
    expect(text).toContain('intersection of technology and liberal arts');
    expect(text).toMatch(/v\d+\.\d+\.\d+/);
  });
});

describe('startupFitsTerminal', () => {
  it('skips startup art that would overflow either terminal dimension', () => {
    expect(startupFitsTerminal(5, 20, 'one\ntwo\nthree')).toBe(false);
    expect(startupFitsTerminal(8, 2, 'one\ntwo\nthree')).toBe(false);
    expect(startupFitsTerminal(8, 5, 'one\ntwo\nthree')).toBe(true);
    expect(startupFitsTerminal(undefined, undefined, 'one\ntwo\nthree')).toBe(true);
  });
});

describe('buildLogoLines dot-matrix tier selection', () => {
  const originalCols = process.stdout.columns;
  const originalRows = process.stdout.rows;

  beforeEach(() => {
    // Tier selection only applies to the braille art path; force it on so
    // these tests aren't at the mercy of the test runner's own TTY/locale.
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
  });

  afterEach(() => {
    process.stdout.columns = originalCols;
    process.stdout.rows = originalRows;
    delete process.env['NBTCA_ICON_MODE'];
    resetIconCache();
  });

  // Each tier's art block is a fixed, known line count (12/16/26 -- see
  // src/logo/ca-dotmatrix-*.txt), so counting the art lines between the
  // leading blank and the trailing blank+tagline+version block is enough to
  // tell which tier rendered, without hardcoding file paths in the test.
  function artLineCount(): number {
    const lines = buildLogoLines().map(stripAnsi);
    // lines = ['', ...art, '', tagline, version, ''] -- art sits between
    // index 1 and the blank line preceding the tagline.
    const taglineIdx = lines.findIndex((l) => l.includes('intersection of technology'));
    return taglineIdx - 2; // minus the leading blank and the blank before tagline
  }

  it('picks the small tier on a narrow/short terminal', () => {
    process.stdout.columns = 30;
    process.stdout.rows = 20;
    expect(artLineCount()).toBe(12);
  });

  it('picks the medium tier once width and height clear the mid threshold', () => {
    process.stdout.columns = 50;
    process.stdout.rows = 28;
    expect(artLineCount()).toBe(16);
  });

  it('picks the large tier on a spacious terminal', () => {
    process.stdout.columns = 100;
    process.stdout.rows = 40;
    expect(artLineCount()).toBe(26);
  });

  it('falls back to the small tier if height clears but width does not', () => {
    process.stdout.columns = 40;
    process.stdout.rows = 40;
    expect(artLineCount()).toBe(12);
  });
});
