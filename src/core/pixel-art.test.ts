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

  it('maps two pixel rows to one terminal row', () => {
    expect(bitmapSize(sample)).toEqual({ cols: 4, rows: 2 });
    expect(renderBitmap(sample, 'tone')).toHaveLength(2);
  });

  it('draws tone mode with ASCII only, denser for brighter pixels', () => {
    const lines = renderBitmap(sample, 'tone').map(stripAnsi);
    expect(lines.join('')).toMatch(/^[\x20-\x7e]*$/);
    expect(lines[0]?.[0]).not.toBe(' ');
    expect(lines[0]?.[2]).toBe(' ');
  });

  it('draws colour mode as ASCII characters on tinted backgrounds', () => {
    chalk.level = 3;
    const [first] = renderBitmap(sample, 'color');
    expect(first).toMatch(/\x1b\[38;2;\d+;\d+;\d+m/);
    expect(first).toMatch(/\x1b\[48;2;\d+;\d+;\d+m/);
    expect(stripAnsi(first ?? '')).toMatch(/^[\x20-\x7e]*$/);
  });

  it('drops the background tint below truecolor', () => {
    chalk.level = 2;
    const [first] = renderBitmap(sample, 'color');
    expect(first).toMatch(/\x1b\[38;5;\d+m/);
    expect(first).not.toContain('\x1b[48;');
  });

  it('draws the fine tier with Unicode block characters', () => {
    chalk.level = 3;
    const lines = renderBitmap(sample, 'fine');
    expect(lines).toHaveLength(2);
    expect(stripAnsi(lines.join(''))).toMatch(/[\u2580-\u259f]/u);
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
