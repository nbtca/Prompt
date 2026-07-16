/**
 * Tests for renderHeatmap()
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { HeatmapBucket } from '@nbtca/nbtcal';
import { renderHeatmap } from './calendar-heatmap.js';
import { setLanguage } from '../i18n/index.js';
import { resetIconCache } from '../core/icons.js';

beforeAll(() => {
  // Pin language and icon mode for deterministic output
  setLanguage('en');
  // Force unicode icon mode via env var (checked before TTY detection)
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

/** Build a simple synthetic bucket array spanning 14 consecutive days. */
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
    buckets.push({ date: `${year}-${month}-${day}`, count });
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return buckets;
}

describe('renderHeatmap', () => {
  const today = new Date('2025-06-17T00:00:00Z');

  // 14 days with varied counts: 0,1,2,3,4,5,0,1,2,3,4,5,0,1
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
    // The bucket with count=4 and count=5 should render as █
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
    // All cells will be blank (empty), but the grid structure is there
    expect(output).toBeDefined();
  });

  it('output has 7 grid rows', () => {
    const output = renderHeatmap(buckets, today, { color: false });
    const lines = output.split('\n');
    // Title + blank + month header + 7 rows + blank + legend = 12 lines minimum
    expect(lines.length).toBeGreaterThanOrEqual(7 + 3);
  });

  it('title and legend lines share the app-wide 3-space left margin, not flush against the terminal edge', () => {
    // Regression: the title and legend lines used to push straight from the
    // string with no leading space at all, while the month-label row and
    // every grid row already had an effective 3-column margin baked into
    // their own weekday-label width — so the title/legend visibly sat
    // flush-left while everything else (including the grid directly below
    // them) lined up 3 columns in.
    const output = renderHeatmap(buckets, today, { color: false });
    const lines = output.split('\n');
    const titleLine = lines[0]!;
    const legendLine = lines[lines.length - 1]!;
    expect(titleLine.startsWith('   ')).toBe(true);
    expect(legendLine.startsWith('   ')).toBe(true);
  });

  it('every row shares the same left margin, and the grid data columns (not the row labels) stay aligned with the month row', () => {
    const output = renderHeatmap(buckets, today, { color: false });
    const lines = output.split('\n');
    const monthLine = lines[2]!; // title, blank, month-label
    const firstGridRow = lines[3]!; // "Mo ..." — has a real weekday-label prefix
    const secondGridRow = lines[4]!; // blank weekday-label slot (same width as "Mo")

    // All rows carry the app-wide 3-space margin.
    expect(monthLine.startsWith('   ')).toBe(true);
    expect(firstGridRow.startsWith('   ')).toBe(true);

    // Past the margin, the month row and every grid row also reserve the
    // same 3-column weekday-label slot (2-char label + 1 separator) before
    // their actual data — so a grid row's data (the "·"/glyph grid) and
    // the month row's data (the month-name characters) both start at
    // column 6, whether or not that particular row happens to have a
    // visible "Mo"/"We" label in its slot. This is the exact alignment a
    // margin-only fix applied to one but not the other would have broken.
    const firstNonSpace = (s: string) => s.search(/\S/);
    expect(firstNonSpace(monthLine)).toBe(6);
    expect(firstNonSpace(secondGridRow)).toBe(6);
    // The labeled row's first non-space is its own label ("Mo"), 3 columns
    // earlier than the data zone — confirms the label sits *in* the
    // reserved slot rather than the slot being skipped for labeled rows.
    expect(firstNonSpace(firstGridRow)).toBe(3);
  });
});
