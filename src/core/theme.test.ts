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

  it('updown glyph is ↑↓ in unicode mode', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    expect(glyph.updown()).toBe('↑↓');
  });

  it('updown glyph falls back to up/down in ascii mode', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    resetIconCache();
    expect(glyph.updown()).toBe('up/down');
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
  });

  it('enter glyph is ⏎ in unicode mode', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    expect(glyph.enter()).toBe('⏎');
  });

  it('enter glyph falls back to enter in ascii mode', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    resetIconCache();
    expect(glyph.enter()).toBe('enter');
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
  });

  it('barFilled/barEmpty are the shared block-bar glyphs in unicode mode', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    expect(glyph.barFilled()).toBe('█');
    expect(glyph.barEmpty()).toBe('░');
  });

  it('barFilled/barEmpty fall back to #/- in ascii mode', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    resetIconCache();
    expect(glyph.barFilled()).toBe('#');
    expect(glyph.barEmpty()).toBe('-');
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
