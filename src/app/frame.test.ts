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

  it('centers narrow body content horizontally, leaving header/footer untouched', () => {
    // Body is 4 cols wide ('abcd'), frame is 20 cols -- centered pad is
    // floor((20-4)/2) = 8 leading spaces before the content starts.
    const f = composeFrame(['H'], ['abcd'], ['F'], 3, 20, 0).split('\n');
    expect(f[1]!.indexOf('abcd')).toBe(8);
    // Header/footer are never centered -- they're meant to already span
    // the full width (tab bar, rule line, hint bar).
    expect(f[0]!.indexOf('H')).toBe(0);
    expect(f[2]!.indexOf('F')).toBe(0);
  });

  it('does not shift body content that already fills (or nearly fills) the terminal width', () => {
    const wide = 'x'.repeat(18); // 18 of 20 cols -- pad would floor to 1
    const f = composeFrame([], [wide], [], 1, 20, 0).split('\n');
    expect(f[0]!.indexOf('x')).toBeLessThanOrEqual(1);
  });

  it('centers the body as one block -- every line gets the same left-pad, not centered individually', () => {
    const f = composeFrame([], ['a', 'bb', 'ccc'], [], 3, 10, 0).split('\n');
    // maxWidth=3 ('ccc') -> pad = floor((10-3)/2) = 3 for every line, even
    // the shorter ones -- a ragged-left block, not three separately
    // centered lines.
    expect(f[0]!.indexOf('a')).toBe(3);
    expect(f[1]!.indexOf('bb')).toBe(3);
    expect(f[2]!.indexOf('ccc')).toBe(3);
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
