import { describe, it, expect } from 'vitest';
import {
  clipAnsiToVisualWidth,
  padEndV,
  sanitizeTerminalLine,
  sanitizeTerminalText,
  stripAnsi,
  truncate,
  truncateStart,
  visualWidth,
  wrapAnsiToVisualWidth,
} from './text.js';

describe('visualWidth', () => {
  it('counts plain ASCII as 1 column each', () => {
    expect(visualWidth('hello')).toBe(5);
  });

  it('counts CJK characters as 2 columns each', () => {
    expect(visualWidth('张明俊')).toBe(6);
  });

  it('counts a common emoji as 2 columns, not 1', () => {
    expect(visualWidth('🎉')).toBe(2);
  });

  it('matches real terminal rendering for an emoji + CJK event title', () => {
    expect(visualWidth('🎉张明俊的生日')).toBe(14);
  });

  it('honors emoji presentation selectors', () => {
    const withSelector = '\u{2764}\u{FE0F}';
    const withoutSelector = '\u{2764}';
    expect(visualWidth(withSelector)).toBe(2);
    expect(visualWidth(withoutSelector)).toBe(1);
  });

  it('counts a joined emoji family as one terminal glyph', () => {
    expect(visualWidth('👨‍👩‍👧')).toBe(2);
  });

  it('does not allocate a column to combining marks', () => {
    expect(visualWidth('e\u0301')).toBe(1);
  });

  it('ignores ANSI escape codes', () => {
    expect(visualWidth('\x1b[1m\x1b[31mhi\x1b[0m')).toBe(2);
  });

  it('treats OSC 8 hyperlinks as zero-width terminal controls', () => {
    const linked = '\x1b]8;;https://example.com\x07link\x1b]8;;\x07';
    expect(stripAnsi(linked)).toBe('link');
    expect(visualWidth(linked)).toBe(4);
  });
});

describe('padEndV', () => {
  it('pads based on real visual width, including emoji', () => {
    const padded = padEndV('🎉hi', 10);
    expect(visualWidth(padded)).toBe(10);
  });
});

describe('truncate', () => {
  it('accounts for emoji width when truncating', () => {
    const result = truncate('🎉张明俊的生日', 8);
    expect(visualWidth(stripAnsi(result))).toBeLessThanOrEqual(8);
  });

  it('never splits a joined emoji', () => {
    expect(truncate('a👨‍👩‍👧bc', 4)).toBe('a...');
  });
});

describe('truncateStart', () => {
  it('keeps the editable end of a narrow value visible', () => {
    expect(truncateStart('student@example.com', 10, '<')).toBe('<ample.com');
  });
});

describe('clipAnsiToVisualWidth', () => {
  it('clips styled text without splitting grapheme clusters', () => {
    const source = '\x1b[36ma👨‍👩‍👧b\x1b[0m';
    const clipped = clipAnsiToVisualWidth(source, 2);
    expect(stripAnsi(clipped)).toBe('a');
    expect(visualWidth(clipped)).toBe(1);
  });

  it('clips OSC 8 links without splitting or leaking the control sequence', () => {
    const source = '\x1b]8;;https://example.com\x07link\x1b]8;;\x07';
    const clipped = clipAnsiToVisualWidth(source, 2);
    expect(stripAnsi(clipped)).toBe('li');
    expect(clipped).toMatch(/^\x1b\]8;;https:\/\/example\.com\x07/);
    expect(clipped).toMatch(/\x1b\]8;;\x07$/);
  });
});

describe('wrapAnsiToVisualWidth', () => {
  it('preserves styled Chinese text across wrapped lines', () => {
    const source = '中文正文不会被截断';
    const lines = wrapAnsiToVisualWidth(`\x1b[36m${source}\x1b[39m`, 6);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => visualWidth(line) <= 6)).toBe(true);
    expect(stripAnsi(lines.join(''))).toBe(source);
    expect(lines.every((line) => line.includes('\x1b['))).toBe(true);
  });

  it('breaks English text at whitespace when possible', () => {
    expect(wrapAnsiToVisualWidth('alpha beta gamma', 10)).toEqual(['alpha beta', 'gamma']);
  });

  it('keeps combining and joined graphemes intact', () => {
    expect(wrapAnsiToVisualWidth('e\u0301👨‍👩‍👧x', 2)).toEqual(['e\u0301', '👨‍👩‍👧', 'x']);
  });

  it('wraps OSC 8 links as complete, independently closed terminal lines', () => {
    const source = '\x1b]8;;https://example.com\x07link\x1b]8;;\x07';
    const lines = wrapAnsiToVisualWidth(source, 2);
    expect(lines.map(stripAnsi)).toEqual(['li', 'nk']);
    expect(lines.every((line) => line.endsWith('\x1b]8;;\x07'))).toBe(true);
  });
});

describe('sanitizeTerminalText', () => {
  it('removes terminal escape and control sequences from untrusted text', () => {
    const source = 'safe\u001B]52;c;YWJj\u0007\u001B[31mred\u001B[0m\u0000\u0008\rnext';
    expect(sanitizeTerminalText(source)).toBe('safered\nnext');
  });

  it('preserves printable Unicode, newlines, and tabs', () => {
    expect(sanitizeTerminalText('课程\n\tRoom 1')).toBe('课程\n\tRoom 1');
  });

  it('collapses untrusted single-line fields', () => {
    expect(sanitizeTerminalLine(' title\n\tlocation \u001B[31m')).toBe('title location');
  });
});
