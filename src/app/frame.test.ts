import { describe, it, expect } from 'vitest';
import { fitLine, fitBody, composeFrame, computeBodyRows } from './frame.js';
import { visualWidth } from '../core/text.js';

describe('fitLine', () => {
  it('pads a short line to exactly cols', () => {
    expect(fitLine('hi', 5)).toBe('hi   ');
    expect(visualWidth(fitLine('hi', 5))).toBe(5);
  });
  it('clips an over-wide line to cols visual width', () => {
    expect(visualWidth(fitLine('abcdefgh', 4))).toBeLessThanOrEqual(4);
  });
});

describe('fitBody', () => {
  it('slices to height and pads short content', () => {
    const b = fitBody(['a', 'b'], 4, 0, 3);
    expect(b).toHaveLength(4);
    expect(b[0]).toBe('a  '); expect(b[3]).toBe('   ');
  });
  it('scrolls and clamps past the end', () => {
    const b = fitBody(['a', 'b', 'c', 'd'], 2, 10, 1);
    expect(b.map(s => s.trim())).toEqual(['c', 'd']); // clamped to last window
  });
});

describe('composeFrame', () => {
  it('produces exactly rows lines, each cols wide', () => {
    const f = composeFrame(['H'], ['x', 'y'], ['F'], 5, 3, 0).split('\n');
    expect(f).toHaveLength(5);
    for (const line of f) expect(visualWidth(line)).toBe(3);
    expect(f[0]!.trim()).toBe('H'); expect(f[4]!.trim()).toBe('F');
  });
});

describe('computeBodyRows', () => {
  it('subtracts header and footer line counts from total rows', () => {
    expect(computeBodyRows(24, 3, 2)).toBe(19);
  });
  it('floors at 0 when header+footer exceed total rows', () => {
    expect(computeBodyRows(4, 3, 2)).toBe(0);
  });
});
