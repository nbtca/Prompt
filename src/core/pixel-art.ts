import chalk from 'chalk';
import { getCapabilities } from './capabilities.js';
import { useUnicodeIcons } from './icons.js';

export interface Bitmap {
  /** Maps a row character to a #rrggbb colour; a space is transparent. */
  palette: Readonly<Record<string, string>>;
  rows: readonly string[];
  /** Pixels per terminal cell, horizontally and vertically. Defaults to 1 × 2, the shape of a half block. */
  density?: { x: number; y: number };
}

export type PictureMode = 'color' | 'tone';

// Light-on-dark density order, measured from JetBrains Mono ink coverage.
const TONE_RAMP = ' .:-=+*#%@';
const HALF_BLOCK_DENSITY = { x: 1, y: 2 } as const;
const BRAILLE_ROWS = 4;
const BRAILLE_BASE = 0x2800;
// Dot order of a Braille cell as [column, row]: bits 0 to 7.
const BRAILLE_DOTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 1],
  [0, 2],
  [1, 0],
  [1, 1],
  [1, 2],
  [0, 3],
  [1, 3],
];

type Rgb = [number, number, number];
type Pixels = (Rgb | undefined)[][];

export function bitmapSize(bitmap: Bitmap): { cols: number; rows: number } {
  const { x, y } = bitmap.density ?? HALF_BLOCK_DENSITY;
  return {
    cols: Math.ceil(Math.max(0, ...bitmap.rows.map((row) => row.length)) / x),
    rows: Math.ceil(bitmap.rows.length / y),
  };
}

export function pictureMode(): PictureMode {
  return getCapabilities().color && chalk.level > 0 && useUnicodeIcons() ? 'color' : 'tone';
}

function rgb(hex: string): Rgb {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as Rgb;
}

function hex(value: Rgb): string {
  return `#${value.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

function luminance(color: Rgb): number {
  return (0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]) / 255;
}

function average(colors: readonly Rgb[]): Rgb {
  const sum = colors.reduce<Rgb>(
    (total, color) => [total[0] + color[0], total[1] + color[1], total[2] + color[2]],
    [0, 0, 0],
  );
  return [sum[0] / colors.length, sum[1] / colors.length, sum[2] / colors.length];
}

function distance(a: Rgb, b: Rgb): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function solid(pixels: readonly (Rgb | undefined)[]): Rgb[] {
  return pixels.filter((pixel): pixel is Rgb => pixel !== undefined);
}

function pixelAt(bitmap: Bitmap, x: number, y: number): Rgb | undefined {
  const symbol = bitmap.rows[y]?.[x];
  const color = symbol === undefined || symbol === ' ' ? undefined : bitmap.palette[symbol];
  return color === undefined ? undefined : rgb(color);
}

function cellPixels(bitmap: Bitmap, col: number, row: number): Pixels {
  const { x, y } = bitmap.density ?? HALF_BLOCK_DENSITY;
  return Array.from({ length: y }, (_, dy) =>
    Array.from({ length: x }, (_, dx) => pixelAt(bitmap, col * x + dx, row * y + dy)),
  );
}

function blend(pixels: readonly (Rgb | undefined)[]): Rgb | undefined {
  const present = solid(pixels);
  return present.length > 0 && present.length * 2 >= pixels.length ? average(present) : undefined;
}

function halfBlockCell(pixels: Pixels): string {
  const middle = Math.ceil(pixels.length / 2);
  const top = blend(pixels.slice(0, middle).flat());
  const bottom = blend(pixels.slice(middle).flat());
  if (top === undefined && bottom === undefined) return ' ';
  if (bottom === undefined) return chalk.hex(hex(top ?? [0, 0, 0]))('▀');
  if (top === undefined) return chalk.hex(hex(bottom))('▄');
  return chalk.hex(hex(top)).bgHex(hex(bottom))('▀');
}

const QUADRANTS = [
  ' ',
  '▘',
  '▝',
  '▀',
  '▖',
  '▌',
  '▞',
  '▛',
  '▗',
  '▚',
  '▐',
  '▜',
  '▄',
  '▙',
  '▟',
  '█',
] as const;
// Cells whose two colours differ by less than this are drawn as one smooth colour.
const FLAT_CONTRAST = 0.07;
// A solid quadrant glyph is kept over Braille dots while its error stays within this factor of theirs.
const QUADRANT_TOLERANCE = 1.8;

function splitTwoColors(pixels: readonly Rgb[]): { light: Rgb; dark: Rgb; lit: boolean[] } {
  let dark = pixels.reduce((best, pixel) => (luminance(pixel) < luminance(best) ? pixel : best));
  let light = pixels.reduce((best, pixel) => (luminance(pixel) > luminance(best) ? pixel : best));
  let lit = pixels.map(() => false);
  for (let round = 0; round < 3; round++) {
    lit = pixels.map((pixel) => distance(pixel, light) < distance(pixel, dark));
    const lights = pixels.filter((_, index) => lit[index] === true);
    const darks = pixels.filter((_, index) => lit[index] === false);
    if (lights.length > 0) light = average(lights);
    if (darks.length > 0) dark = average(darks);
  }
  return { light, dark, lit };
}

/**
 * One cell of a fine bitmap. Flat areas become a single smooth colour, edges that follow the 2 × 2 grid
 * become solid quadrant blocks, and everything else, such as thin lines and slopes, uses Braille dots.
 */
function fineCell(pixels: Pixels): string {
  const grid = BRAILLE_DOTS.map(([column, row]) => {
    const source =
      pixels[Math.min(pixels.length - 1, Math.floor((row * pixels.length) / BRAILLE_ROWS))];
    return source?.[Math.min(source.length - 1, Math.floor((column * source.length) / 2))];
  });
  const present = solid(grid);
  if (present.length === 0) return ' ';
  const hasGap = present.length < grid.length;
  const { light, dark } = splitTwoColors(present);
  const lit = grid.map(
    (pixel) => pixel !== undefined && distance(pixel, light) < distance(pixel, dark),
  );
  if (!hasGap && Math.abs(luminance(light) - luminance(dark)) < FLAT_CONTRAST) {
    return chalk.hex(hex(average(present)))('█');
  }

  if (!hasGap) {
    const quadrantOf = (index: number) => {
      const [column, row] = BRAILLE_DOTS[index] ?? [0, 0];
      return (row >= 2 ? 2 : 0) + column;
    };
    const mask = grid.reduce((bits, pixel, index) => {
      if (pixel === undefined) return bits;
      const nearLight = distance(pixel, light) < distance(pixel, dark);
      return nearLight ? bits | (1 << quadrantOf(index)) : bits;
    }, 0);
    const quadrantLit = (index: number) => ((mask >> quadrantOf(index)) & 1) === 1;
    const error = (isLit: (index: number) => boolean) =>
      grid.reduce(
        (sum, pixel, index) =>
          pixel === undefined ? sum : sum + distance(pixel, isLit(index) ? light : dark),
        0,
      );
    if (error(quadrantLit) <= error((index) => lit[index] === true) * QUADRANT_TOLERANCE + 1) {
      const glyph = QUADRANTS[mask] ?? '█';
      if (mask === 0) return chalk.hex(hex(dark))('█');
      if (mask === 15) return chalk.hex(hex(light))('█');
      return chalk.hex(hex(light)).bgHex(hex(dark))(glyph);
    }
  }

  const mask = lit.reduce((bits, on, index) => (on ? bits | (1 << index) : bits), 0);
  const glyph = String.fromCodePoint(BRAILLE_BASE + mask);
  const hasDark = grid.some((pixel, index) => pixel !== undefined && !lit[index]);
  if (!lit.some(Boolean)) return hasGap ? ' ' : chalk.hex(hex(dark))('█');
  if (!hasDark || hasGap) return chalk.hex(hex(light))(glyph);
  return chalk.hex(hex(light)).bgHex(hex(dark))(glyph);
}

function toneCell(pixels: Pixels, color: boolean, gamma: number): string {
  const all = pixels.flat();
  const present = solid(all);
  if (present.length === 0) return ' ';
  const level = Math.pow(
    present.reduce((sum, pixel) => sum + luminance(pixel), 0) / all.length,
    gamma,
  );
  const char =
    TONE_RAMP[Math.min(TONE_RAMP.length - 1, Math.round(level * (TONE_RAMP.length - 1)))] ?? ' ';
  if (!color || char === ' ') return char;
  const brightest = present.reduce((best, pixel) =>
    luminance(pixel) > luminance(best) ? pixel : best,
  );
  return chalk.hex(hex(brightest))(char);
}

/**
 * Draws a bitmap with one terminal cell per block of pixels: Braille dots for fine 2 × 4 bitmaps,
 * half blocks for chunky 1 × 2 ones, or ASCII density when colour or Unicode is unavailable.
 */
export function renderBitmap(
  bitmap: Bitmap,
  mode: PictureMode = pictureMode(),
  /** Below 1 lifts dark pixels so small icons stay visible; above 1 leaves broad backgrounds empty. */
  gamma = 0.7,
): string[] {
  const { cols, rows } = bitmapSize(bitmap);
  const color = getCapabilities().color && chalk.level > 0;
  const fine = (bitmap.density?.y ?? 2) >= BRAILLE_ROWS;
  return Array.from({ length: rows }, (_, row) => {
    let line = '';
    for (let col = 0; col < cols; col++) {
      const pixels = cellPixels(bitmap, col, row);
      if (mode === 'tone') line += toneCell(pixels, color, gamma);
      else line += fine ? fineCell(pixels) : halfBlockCell(pixels);
    }
    return mode === 'tone' ? line.replace(/\s+$/, '') : line;
  });
}
