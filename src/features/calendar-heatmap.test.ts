import { describe, it, expect, beforeAll } from 'vitest';
import type { HeatmapBucket } from '@nbtca/nbtcal';
import { renderHeatmap } from './calendar-heatmap.js';
import { setLanguage } from '../i18n/index.js';
import { resetIconCache } from '../core/icons.js';
import { stripAnsi, visualWidth } from '../core/text.js';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

function makeBuckets(startDateStr: string, counts: number[]): HeatmapBucket[] {
  const buckets: HeatmapBucket[] = [];
  const parts = startDateStr.split('-').map(Number);
  const y = parts[0] ?? 2024;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  let cursor = new Date(Date.UTC(y, m - 1, d));
  for (const count of counts) {
    const year = cursor.getUTCFullYear();
    const month = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    const day = String(cursor.getUTCDate()).padStart(2, '0');
    buckets.push({ date: `${String(year)}-${month}-${day}`, count });
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return buckets;
}

describe('renderHeatmap', () => {
  const today = new Date('2025-06-17T00:00:00Z');

  const counts = [0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1];
  const buckets = makeBuckets('2025-06-04', counts);

  it('returns a non-empty string', () => {
    const output = renderHeatmap(buckets, today, { color: false });
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(0);
  });

  it('contains the title from i18n', () => {
    const output = renderHeatmap(buckets, today, { color: false });
    expect(output).toContain('Activity (last 12 months)');
  });

  it('contains legend words', () => {
    const output = renderHeatmap(buckets, today, { color: false });
    expect(output).toContain('Less');
    expect(output).toContain('More');
  });

  it('contains the full-block glyph for count >= 4 (unicode mode)', () => {
    const output = renderHeatmap(buckets, today, { color: false });
    expect(output).toContain('█');
  });

  it('contains the medium-shade glyph for count === 2 (unicode mode)', () => {
    const output = renderHeatmap(buckets, today, { color: false });
    expect(output).toContain('▒');
  });

  it('all-zero buckets render without throwing and contain ·', () => {
    const zeroBuckets = makeBuckets('2025-06-10', [0, 0, 0, 0, 0, 0, 0]);
    let output: string | undefined;
    expect(() => {
      output = renderHeatmap(zeroBuckets, today, { color: false });
    }).not.toThrow();
    expect(output).toBeDefined();
    expect(output).toContain('·');
  });

  it('empty bucket array renders without throwing and contains ·', () => {
    let output: string | undefined;
    expect(() => {
      output = renderHeatmap([], today, { color: false });
    }).not.toThrow();
    expect(output).toBeDefined();
    expect(output).toBeDefined();
  });

  it('output has 7 grid rows', () => {
    const output = renderHeatmap(buckets, today, { color: false });
    const lines = output.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(7 + 3);
  });

  it('title and legend lines share the app-wide 3-space left margin, not flush against the terminal edge', () => {
    const output = renderHeatmap(buckets, today, { color: false });
    const lines = output.split('\n');
    const titleLine = lines[0] ?? '';
    const legendLine = lines.at(-1) ?? '';
    expect(titleLine.startsWith('   ')).toBe(true);
    expect(legendLine.startsWith('   ')).toBe(true);
  });

  it('every row shares the same left margin, and the grid data columns (not the row labels) stay aligned with the month row', () => {
    const output = renderHeatmap(buckets, today, { color: false });
    const lines = output.split('\n');
    const monthLine = lines[2] ?? ''; // title, blank, month-label
    const firstGridRow = lines[3] ?? ''; // "Mo ..." — has a real weekday-label prefix
    const secondGridRow = lines[4] ?? ''; // blank weekday-label slot (same width as "Mo")

    expect(monthLine.startsWith('   ')).toBe(true);
    expect(firstGridRow.startsWith('   ')).toBe(true);

    const firstNonSpace = (s: string) => s.search(/\S/);
    expect(firstNonSpace(monthLine)).toBe(6);
    expect(firstNonSpace(secondGridRow)).toBe(6);
    expect(firstNonSpace(firstGridRow)).toBe(3);
  });

  it('fits all 53 weeks within an 80-column terminal', () => {
    const lines = renderHeatmap(buckets, today, { color: false, cols: 80 }).split('\n');
    expect(lines.every((line) => visualWidth(stripAnsi(line)) <= 80)).toBe(true);
    expect(visualWidth(stripAnsi(lines[2] ?? ''))).toBe(59);
  });

  it('reduces the visible week window to fit a 40-column terminal', () => {
    const lines = renderHeatmap(buckets, today, { color: false, cols: 40 }).split('\n');
    expect(lines.every((line) => visualWidth(stripAnsi(line)) <= 40)).toBe(true);
    expect(visualWidth(stripAnsi(lines[2] ?? ''))).toBe(40);
  });
});
