import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildLogoLines } from './logo.js';
import { stripAnsi, visualWidth } from './text.js';
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

describe('buildLogoLines dot-matrix tier selection', () => {
  const originalCols = process.stdout.columns;
  const originalRows = process.stdout.rows;

  beforeEach(() => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
  });

  afterEach(() => {
    process.stdout.columns = originalCols;
    process.stdout.rows = originalRows;
    delete process.env['NBTCA_ICON_MODE'];
    resetIconCache();
  });

  function artLineCount(): number {
    const lines = buildLogoLines().map(stripAnsi);
    return lines.indexOf('', 1) - 1;
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

describe('buildLogoLines display capabilities', () => {
  const originalCols = process.stdout.columns;
  const originalRows = process.stdout.rows;
  const originalIconMode = process.env['NBTCA_ICON_MODE'];

  afterEach(() => {
    process.stdout.columns = originalCols;
    process.stdout.rows = originalRows;
    if (originalIconMode === undefined) delete process.env['NBTCA_ICON_MODE'];
    else process.env['NBTCA_ICON_MODE'] = originalIconMode;
    resetIconCache();
  });

  it.each([
    [80, 24],
    [40, 12],
    [20, 12],
  ])('fits the complete ASCII startup in %i columns and %i rows', (cols, rows) => {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    process.stdout.columns = cols;
    process.stdout.rows = rows;
    resetIconCache();

    const lines = buildLogoLines().map(stripAnsi);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(rows);
    expect(lines.every((line) => /^[\x20-\x7e]*$/.test(line))).toBe(true);
    expect(lines.every((line) => visualWidth(line) <= cols)).toBe(true);
    expect(lines.join('').replace(/\s/g, '')).toContain('intersectionoftechnologyandliberalarts');
    expect(lines.join('')).toContain('@nbtca/prompt');
  });

  it.each([
    [80, 31, 26],
    [80, 24, 19],
    [80, 17, 12],
    [80, 14, 9],
  ])('draws the ASCII emblem at %i x %i with %i rows', (cols, rows, artRows) => {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    process.stdout.columns = cols;
    process.stdout.rows = rows;
    resetIconCache();

    const lines = buildLogoLines().map(stripAnsi);
    expect(lines.indexOf('', 1) - 1).toBe(artRows);
    expect(lines.every((line) => /^[\x20-\x7e]*$/.test(line))).toBe(true);
    expect(lines.length).toBeLessThanOrEqual(rows);
  });

  it('writes NBTCA when no emblem fits', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    process.stdout.columns = 80;
    process.stdout.rows = 10;
    resetIconCache();
    expect(stripAnsi(buildLogoLines()[1] ?? '')).toBe('NBTCA');
  });

  it('writes NBTCA when the ASCII artwork is too wide', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    process.stdout.columns = 20;
    process.stdout.rows = 12;
    resetIconCache();
    expect(stripAnsi(buildLogoLines()[1] ?? '')).toBe('NBTCA');
  });

  it('uses compact artwork when a Unicode terminal is too short for the badge', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    process.stdout.columns = 80;
    process.stdout.rows = 12;
    resetIconCache();
    const lines = buildLogoLines().map(stripAnsi);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(12);
    expect(lines.join('')).not.toMatch(/[\u2800-\u28ff]/u);
  });

  it('skips startup when even the wordmark and metadata cannot fit', () => {
    process.stdout.columns = 8;
    process.stdout.rows = 3;
    expect(buildLogoLines()).toEqual([]);
  });
});
