import { describe, it, expect, beforeEach } from 'vitest';
import { glyph, space, type } from './theme.js';
import { resetIconCache } from './icons.js';
import { stripAnsi } from './text.js';

describe('design tokens', () => {
  beforeEach(() => { resetIconCache(); });

  it('cursor glyph is → in unicode mode', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    expect(glyph.cursor()).toBe('→');
  });

  it('cursor glyph falls back to > in ascii mode', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    resetIconCache();
    expect(glyph.cursor()).toBe('>');
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
  });

  it('indent is three spaces', () => {
    expect(space.indent).toBe('   ');
  });

  it('type.hint returns its text (possibly styled)', () => {
    expect(stripAnsi(type.hint('go'))).toBe('go');
  });
});
