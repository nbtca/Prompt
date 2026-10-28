import { describe, it, expect } from 'vitest';
import { mountainScene, scaleBitmap, shelfScene, skyScene } from './scene.js';
import type { Bitmap } from '../core/pixel-art.js';

function colorsOf(bitmap: Bitmap): Set<string> {
  return new Set(
    [...new Set(bitmap.rows.join(''))]
      .filter((symbol) => symbol !== ' ')
      .map((symbol) => bitmap.palette[symbol] ?? ''),
  );
}

function expectWellFormed(bitmap: Bitmap, width: number, height: number): void {
  expect(bitmap.rows).toHaveLength(height);
  expect(bitmap.rows.every((row) => row.length === width)).toBe(true);
  for (const symbol of new Set(bitmap.rows.join('').replace(/ /g, ''))) {
    expect(bitmap.palette[symbol]).toBeDefined();
  }
}

describe('scenes', () => {
  it.each([
    [30, 14],
    [60, 24],
    [104, 60],
  ])('draw a well-formed sky at %i x %i pixels for every hour', (width, height) => {
    for (const hour of [0, 3, 6.5, 9, 12, 15, 17.5, 19, 21, 23.5]) {
      expectWellFormed(skyScene(width, height, hour), width, height);
    }
  });

  it('changes with the hour and shows more detail when it is bigger', () => {
    const noon = colorsOf(skyScene(60, 24, 12));
    const midnight = colorsOf(skyScene(60, 24, 0));
    expect(noon).not.toEqual(midnight);
    expect(skyScene(100, 56, 12).rows.join('')).not.toBe(skyScene(100, 56, 13).rows.join(''));
    expect(colorsOf(skyScene(100, 56, 12)).size).toBeGreaterThan(
      colorsOf(skyScene(30, 14, 12)).size,
    );
  });

  it('puts stars in the night sky and none at noon', () => {
    expect(colorsOf(skyScene(60, 24, 0)).has('#f8fafc')).toBe(true);
    expect(colorsOf(skyScene(60, 24, 12)).has('#f8fafc')).toBe(false);
  });

  it('moves the flag to the right as progress grows', () => {
    const flagColumn = (progress: number) => {
      const bitmap = mountainScene(60, 30, progress, 12);
      const symbol =
        Object.entries(bitmap.palette).find(([, color]) => color === '#f59e0b')?.[0] ?? '';
      return Math.min(
        ...bitmap.rows.map((row) => row.indexOf(symbol)).filter((index) => index >= 0),
      );
    };
    expect(flagColumn(0.1)).toBeLessThan(flagColumn(0.5));
    expect(flagColumn(0.5)).toBeLessThan(flagColumn(0.9));
    expectWellFormed(mountainScene(60, 30, 1.4, 12), 60, 30);
  });

  it('fills a bookcase deterministically', () => {
    expectWellFormed(shelfScene(50, 30), 50, 30);
    expect(shelfScene(50, 30)).toEqual(shelfScene(50, 30));
    expect(colorsOf(shelfScene(60, 36)).size).toBeGreaterThan(8);
  });

  it('enlarges a bitmap by whole pixels', () => {
    const scaled = scaleBitmap({ palette: { a: '#ffffff' }, rows: ['a ', ' a'] }, 3);
    expect(scaled.rows).toEqual(['aaa   ', 'aaa   ', 'aaa   ', '   aaa', '   aaa', '   aaa']);
  });
});
