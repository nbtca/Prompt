import { describe, it, expect } from 'vitest';
import { visualWidth, padEndV, truncate, stripAnsi } from './text.js';

describe('visualWidth', () => {
  it('counts plain ASCII as 1 column each', () => {
    expect(visualWidth('hello')).toBe(5);
  });

  it('counts CJK characters as 2 columns each', () => {
    expect(visualWidth('张明俊')).toBe(6);
  });

  it('counts a common emoji as 2 columns, not 1', () => {
    // Real terminals render 🎉 (U+1F389) as a double-width glyph. Undercounting
    // this by even one column is exactly what caused a real bug: padEndV added
    // one extra trailing space, pushing a line one column past the terminal
    // width and triggering an unwanted auto-wrap that scrolled the header out
    // of view once real event data (with emoji titles) replaced a plain
    // "Loading..." placeholder.
    expect(visualWidth('🎉')).toBe(2);
  });

  it('matches real terminal rendering for an emoji + CJK event title', () => {
    // Confirmed against real @nbtca calendar data: "🎉张明俊的生日" renders as
    // 14 columns in a real terminal (emoji=2 + 6 CJK chars * 2 = 14).
    expect(visualWidth('🎉张明俊的生日')).toBe(14);
  });

  it('a variation selector (U+FE0F) never adds its own width', () => {
    // Whether the base character before it renders narrow or as a wide
    // emoji glyph is context/font-dependent (out of scope here) — but the
    // selector itself must never count as an extra visible column.
    const withSelector = '\u{2764}\u{FE0F}'; // heart + VS-16
    const withoutSelector = '\u{2764}';
    expect(visualWidth(withSelector)).toBe(visualWidth(withoutSelector));
  });

  it('a zero-width joiner never adds its own width', () => {
    // Terminals vary on whether a ZWJ sequence (e.g. family emoji) ligates
    // into one glyph or renders each emoji separately — most monospace
    // terminal fonts do the latter, so assuming non-ligated (safer: it
    // undercounts a rare ligating terminal by a little rather than
    // overcounting — undercounting is exactly the bug this file exists to
    // catch) is the correct default. Either way, the joiner byte itself
    // must never count as its own visible column.
    const withJoiner = '\u{1F468}' + '\u{200D}' + '\u{1F469}' + '\u{200D}' + '\u{1F467}'; // man+ZWJ+woman+ZWJ+girl
    const eachEmojiWidth = visualWidth('\u{1F468}');
    expect(visualWidth(withJoiner)).toBe(eachEmojiWidth * 3);
  });

  it('ignores ANSI escape codes', () => {
    expect(visualWidth('\x1b[1m\x1b[31mhi\x1b[0m')).toBe(2);
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
});
