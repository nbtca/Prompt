import { describe, it, expect } from 'vitest';
import { fitLine, fitBody, composeFrameLines, computeBodyRows, diffFrame } from './frame.js';
import { visualWidth } from '../core/text.js';

describe('fitLine', () => {
  it('pads a short line to exactly cols', () => {
    expect(fitLine('hi', 5)).toBe('hi   ');
    expect(visualWidth(fitLine('hi', 5))).toBe(5);
  });
  it('clips an over-wide line to cols visual width', () => {
    expect(visualWidth(fitLine('abcdefgh', 4))).toBeLessThanOrEqual(4);
  });
  it('does not split joined emoji while clipping', () => {
    expect(
      fitLine('a👨‍👩‍👧b', 2)
        .replace(/\x1b\[[0-9;]*m/g, '')
        .trim(),
    ).toBe('a');
  });
});

describe('fitBody', () => {
  it('slices to height and pads short content', () => {
    const b = fitBody(['a', 'b'], 4, 0, 3);
    expect(b).toHaveLength(4);
    expect(b[0]).toBe('a  ');
    expect(b[3]).toBe('   ');
  });
  it('scrolls and clamps past the end', () => {
    const b = fitBody(['a', 'b', 'c', 'd'], 2, 10, 1);
    expect(b.map((s) => s.trim())).toEqual(['c', 'd']); // clamped to last window
  });
});

describe('composeFrameLines', () => {
  it('produces exactly rows lines, each cols wide', () => {
    const f = composeFrameLines(['H'], ['x', 'y'], ['F'], 5, 3, 0);
    expect(f).toHaveLength(5);
    for (const line of f) expect(visualWidth(line)).toBe(3);
    expect(f[0]?.trim()).toBe('H');
    expect(f[4]?.trim()).toBe('F');
  });
});

describe('diffFrame', () => {
  it('repaints in full when there is no previous frame', () => {
    expect(diffFrame(undefined, ['a', 'b'])).toBe('\x1b[Ha\nb\x1b[0J');
  });
  it('repaints in full when the row count changes', () => {
    expect(diffFrame(['a'], ['a', 'b'])).toBe('\x1b[Ha\nb\x1b[0J');
  });
  it('writes nothing when the frame is unchanged', () => {
    expect(diffFrame(['a', 'b'], ['a', 'b'])).toBe('');
  });
  it('addresses only the rows that changed, 1-indexed', () => {
    expect(diffFrame(['a', 'b', 'c'], ['a', 'B', 'c'])).toBe('\x1b[2;1HB');
  });
  it('emits one cursor address per changed row', () => {
    expect(diffFrame(['a', 'b', 'c'], ['A', 'b', 'C'])).toBe('\x1b[1;1HA\x1b[3;1HC');
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
