import { describe, it, expect, afterEach } from 'vitest';
import chalk from 'chalk';
import { bitmapSize, renderBitmap, type Bitmap } from './pixel-art.js';
import { stripAnsi, visualWidth } from './text.js';
import * as art from '../art/bitmaps.js';

const sample: Bitmap = {
  palette: { a: '#ffffff', b: '#000000', c: '#0ea5e9' },
  rows: ['ab c', 'ba c', '    ', 'aa  '],
};

describe('renderBitmap', () => {
  const level = chalk.level;
  afterEach(() => {
    chalk.level = level;
  });

  it('packs two pixel rows into one terminal row', () => {
    expect(bitmapSize(sample)).toEqual({ cols: 4, rows: 2 });
    expect(renderBitmap(sample, 'tone')).toHaveLength(2);
  });

  it('draws tone mode with ASCII only, denser for brighter pixels', () => {
    const lines = renderBitmap(sample, 'tone').map(stripAnsi);
    expect(lines.join('')).toMatch(/^[\x20-\x7e]*$/);
    expect(lines[0]?.[0]).not.toBe(' ');
    expect(lines[0]?.[2]).toBe(' ');
  });

  it('uses half blocks with foreground and background colours in colour mode', () => {
    chalk.level = 3;
    const [first] = renderBitmap(sample, 'color');
    expect(first).toContain('\x1b[38;2;255;255;255m');
    expect(first).toContain('\x1b[48;2;0;0;0m');
    expect(stripAnsi(first ?? '')).toContain('▀');
  });

  it('emits no escape sequences when colour is off', () => {
    chalk.level = 0;
    for (const mode of ['tone', 'color'] as const) {
      expect(renderBitmap(sample, mode).join('')).not.toContain('\x1b');
    }
  });

  it('keeps every shipped picture rectangular and inside its palette', () => {
    for (const [name, bitmap] of Object.entries(art)) {
      const widths = new Set(bitmap.rows.map((row) => row.length));
      expect(widths.size, name).toBe(1);
      const used = new Set(bitmap.rows.join('').replace(/ /g, ''));
      for (const symbol of used) expect(bitmap.palette[symbol], `${name}:${symbol}`).toBeDefined();
      const lines = renderBitmap(bitmap, 'color');
      expect(lines.every((line) => visualWidth(line) === bitmapSize(bitmap).cols)).toBe(true);
    }
  });
});
