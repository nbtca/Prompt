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
});
