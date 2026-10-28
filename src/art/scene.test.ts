import { describe, it, expect } from 'vitest';
import { moonPhase, mountainScene, scaleBitmap, shelfScene, skyScene } from './scene.js';
import { bitmapSize, type Bitmap } from '../core/pixel-art.js';

const at = (hour: number, day = '2026-10-28'): Date =>
  new Date(`${day}T${String(Math.floor(hour)).padStart(2, '0')}:${hour % 1 ? '30' : '00'}:00`);

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
  expect(bitmap.density).toEqual({ x: 2, y: 4 });
  for (const symbol of new Set(bitmap.rows.join('').replace(/ /g, ''))) {
    expect(bitmap.palette[symbol]).toBeDefined();
  }
}

describe('scenes', () => {
  it.each([
    [60, 28],
    [120, 52],
    [260, 60],
  ])('draw a well-formed sky at %i x %i pixels for every hour', (width, height) => {
    for (const hour of [0, 3, 6.5, 9, 12, 15, 17.5, 19, 21, 23.5]) {
      expectWellFormed(skyScene(width, height, at(hour)), width, height);
    }
  });

  it('fits whole terminal cells', () => {
    expect(bitmapSize(skyScene(120, 56, at(12)))).toEqual({ cols: 60, rows: 14 });
  });

  it('changes with the hour and shows more detail when it is bigger', () => {
    expect(colorsOf(skyScene(120, 56, at(12)))).not.toEqual(colorsOf(skyScene(120, 56, at(0))));
    expect(colorsOf(skyScene(240, 112, at(12))).size).toBeGreaterThan(
      colorsOf(skyScene(60, 28, at(12))).size,
    );
  });

  it('puts stars in the night sky and none at noon', () => {
    const stars = ['#ffffff', '#c7d4ef', '#7f93bf'];
    const count = (hour: number) =>
      stars.filter((color) => colorsOf(skyScene(200, 80, at(hour))).has(color)).length;
    expect(count(0)).toBeGreaterThan(0);
    expect(count(12)).toBe(0);
  });

  it('lights the city windows after dark only', () => {
    expect(colorsOf(skyScene(200, 80, at(22))).has('#ffd27a')).toBe(true);
    expect(colorsOf(skyScene(200, 80, at(12))).has('#ffd27a')).toBe(false);
  });

  it('computes the phase of the moon', () => {
    expect(moonPhase(new Date('2000-01-06T18:14:00Z'))).toBeCloseTo(0, 2);
    expect(moonPhase(new Date('2026-02-17T12:00:00Z'))).toBeLessThan(0.05);
    const full = moonPhase(new Date('2026-03-03T12:00:00Z'));
    expect(full).toBeGreaterThan(0.45);
    expect(full).toBeLessThan(0.55);
  });

  it('draws a different moon on different nights', () => {
    const night = (day: string) => skyScene(160, 72, at(22, day)).rows.join('');
    expect(night('2026-03-03')).not.toBe(night('2026-03-10'));
  });

  it('moves the flag to the right as progress grows', () => {
    const flagColumn = (progress: number) => {
      const bitmap = mountainScene(120, 60, progress, 17, at(12));
      const symbol =
        Object.entries(bitmap.palette).find(([, color]) => color === '#f59e0b')?.[0] ?? '';
      return Math.min(
        ...bitmap.rows.map((row) => row.indexOf(symbol)).filter((index) => index >= 0),
      );
    };
    expect(flagColumn(0.1)).toBeLessThan(flagColumn(0.5));
    expect(flagColumn(0.5)).toBeLessThan(flagColumn(0.9));
    expectWellFormed(mountainScene(120, 60, 1.4, 17, at(12)), 120, 60);
  });

  it('fills a bookcase deterministically, with the cat on the top shelf', () => {
    expectWellFormed(shelfScene(100, 60), 100, 60);
    expect(shelfScene(100, 60)).toEqual(shelfScene(100, 60));
    expect(colorsOf(shelfScene(100, 60)).has('#fbbf24')).toBe(true);
  });

  it('enlarges a bitmap by whole pixels', () => {
    const scaled = scaleBitmap({ palette: { a: '#ffffff' }, rows: ['a ', ' a'] }, 3);
    expect(scaled.rows).toEqual(['aaa   ', 'aaa   ', 'aaa   ', '   aaa', '   aaa', '   aaa']);
  });
});
