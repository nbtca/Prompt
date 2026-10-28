import chalk from 'chalk';
import { GLYPHS, GLYPH_COLS, GLYPH_ROWS } from '../art/glyphs.js';
import { getCapabilities } from './capabilities.js';

export interface Bitmap {
  /** Maps a row character to a #rrggbb colour; a space is transparent. */
  palette: Readonly<Record<string, string>>;
  rows: readonly string[];
  /** Pixels per terminal cell, horizontally and vertically. Defaults to 1 × 2. */
  density?: { x: number; y: number };
  /** Interpolate between pixels, for scenes; icons keep their hard pixel-art edges. */
  smooth?: boolean;
}

export type PictureMode = 'color' | 'tone';

const DEFAULT_DENSITY = { x: 1, y: 2 } as const;
const SAMPLES = GLYPH_COLS * GLYPH_ROWS;
// Terminals are mostly dark; transparent pixels count as this colour when a cell is only partly covered.
const BACKDROP = [20, 22, 28] as const;
// How strongly the character density follows the brightness of a smooth area.
const TONE_WEIGHT = 0.02;
// Smallest difference between a cell's text and background colours, so the character stays visible.
const MIN_CONTRAST = 30;

interface Glyph {
  char: string;
  cover: Float32Array;
  ink: number;
}

// Punctuation and shapes only: letters and digits read as noise inside a picture.
const ART_CHARS = ' .,\'`:;-_~=+*^"|/\\()[]{}<>!?#%&@$oxOX';

const GLYPH_TABLE: readonly Glyph[] = GLYPHS.map((hex, index) => {
  const cover = Float32Array.from(
    { length: SAMPLES },
    (_, sample) => Number.parseInt(hex.slice(sample * 2, sample * 2 + 2), 16) / 255,
  );
  return {
    char: String.fromCharCode(0x20 + index),
    cover,
    ink: cover.reduce((sum, value) => sum + value, 0),
  };
}).filter((glyph) => ART_CHARS.includes(glyph.char));

export function bitmapSize(bitmap: Bitmap): { cols: number; rows: number } {
  const { x, y } = bitmap.density ?? DEFAULT_DENSITY;
  return {
    cols: Math.ceil(Math.max(0, ...bitmap.rows.map((row) => row.length)) / x),
    rows: Math.ceil(bitmap.rows.length / y),
  };
}

/** Colour when the terminal shows it; otherwise the same picture in plain characters. */
export function pictureMode(): PictureMode {
  return getCapabilities().color && chalk.level > 0 ? 'color' : 'tone';
}

type Rgb = [number, number, number];

interface Cell {
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  filled: number;
}

const parsed = new Map<string, Rgb>();

function rgbOf(hex: string): Rgb {
  let value = parsed.get(hex);
  if (!value) {
    value = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as Rgb;
    parsed.set(hex, value);
  }
  return value;
}

function colorAt(bitmap: Bitmap, x: number, y: number): Rgb | undefined {
  const symbol = bitmap.rows[y]?.[x];
  const color = symbol === undefined || symbol === ' ' ? undefined : bitmap.palette[symbol];
  return color === undefined ? undefined : rgbOf(color);
}

/** The colour at a fractional position, blended from the four nearest pixels. */
function smoothAt(bitmap: Bitmap, fx: number, fy: number): Rgb | undefined {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const corners = [
    [colorAt(bitmap, x0, y0), (1 - tx) * (1 - ty)],
    [colorAt(bitmap, x0 + 1, y0), tx * (1 - ty)],
    [colorAt(bitmap, x0, y0 + 1), (1 - tx) * ty],
    [colorAt(bitmap, x0 + 1, y0 + 1), tx * ty],
  ] as const;
  if (corners.some(([color, weight]) => color === undefined && weight > 0.05)) {
    return colorAt(bitmap, Math.round(fx), Math.round(fy));
  }
  const out: Rgb = [0, 0, 0];
  let total = 0;
  for (const [color, weight] of corners) {
    if (color === undefined) continue;
    out[0] += color[0] * weight;
    out[1] += color[1] * weight;
    out[2] += color[2] * weight;
    total += weight;
  }
  return total === 0 ? undefined : [out[0] / total, out[1] / total, out[2] / total];
}

/** The pixels of one cell, sampled onto the 4 × 8 grid the glyph table uses. */
function sampleCell(bitmap: Bitmap, col: number, row: number): Cell {
  const { x: dx, y: dy } = bitmap.density ?? DEFAULT_DENSITY;
  const cell: Cell = {
    r: new Float32Array(SAMPLES),
    g: new Float32Array(SAMPLES),
    b: new Float32Array(SAMPLES),
    filled: 0,
  };
  for (let j = 0; j < GLYPH_ROWS; j++) {
    for (let i = 0; i < GLYPH_COLS; i++) {
      const color = bitmap.smooth
        ? smoothAt(
            bitmap,
            col * dx + ((i + 0.5) * dx) / GLYPH_COLS - 0.5,
            row * dy + ((j + 0.5) * dy) / GLYPH_ROWS - 0.5,
          )
        : colorAt(
            bitmap,
            col * dx + Math.min(dx - 1, Math.floor((i * dx) / GLYPH_COLS)),
            row * dy + Math.min(dy - 1, Math.floor((j * dy) / GLYPH_ROWS)),
          );
      const index = j * GLYPH_COLS + i;
      const [r, g, b] = color ?? BACKDROP;
      cell.r[index] = r;
      cell.g[index] = g;
      cell.b[index] = b;
      if (color !== undefined) cell.filled++;
    }
  }
  return cell;
}

const luma = (r: number, g: number, b: number): number =>
  (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const clamp = (value: number): number => Math.round(Math.min(255, Math.max(0, value)));

/**
 * Picks the character, text colour, and background colour that best reproduce the cell: edges pick characters
 * that follow them, smooth areas pick a density that follows their brightness, and the colours carry the hue.
 */
function colorCell(cell: Cell): string {
  const { r, g, b } = cell;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let squares = 0;
  for (let index = 0; index < SAMPLES; index++) {
    const pr = r[index] ?? 0;
    const pg = g[index] ?? 0;
    const pb = b[index] ?? 0;
    sr += pr;
    sg += pg;
    sb += pb;
    squares += pr * pr + pg * pg + pb * pb;
  }
  const meanSquare = (sr * sr + sg * sg + sb * sb) / SAMPLES;
  const target = 0.015 + 0.2 * luma(sr / SAMPLES, sg / SAMPLES, sb / SAMPLES);

  let best: Glyph | undefined;
  let bestCost = Number.POSITIVE_INFINITY;
  let bestInk: Rgb = [0, 0, 0];
  for (const glyph of GLYPH_TABLE) {
    const { cover, ink } = glyph;
    let dr = 0;
    let dg = 0;
    let db = 0;
    for (let index = 0; index < SAMPLES; index++) {
      const weight = cover[index] ?? 0;
      dr += weight * (r[index] ?? 0);
      dg += weight * (g[index] ?? 0);
      db += weight * (b[index] ?? 0);
    }
    const rest = SAMPLES - ink;
    let cost = squares - meanSquare;
    if (ink > 1e-6 && rest > 1e-6) {
      cost -=
        (dr * dr + dg * dg + db * db) / ink +
        ((sr - dr) ** 2 + (sg - dg) ** 2 + (sb - db) ** 2) / rest -
        meanSquare;
    }
    cost += TONE_WEIGHT * SAMPLES * 3 * (255 * (ink / SAMPLES - target)) ** 2;
    if (cost < bestCost) {
      bestCost = cost;
      best = glyph;
      bestInk = [dr, dg, db];
    }
  }
  if (!best) return ' ';

  const coverage = best.ink / SAMPLES;
  const rest = SAMPLES - best.ink;
  const sums: Rgb = [sr, sg, sb];
  const text = bestInk.map((value, channel) =>
    best.ink > 1e-6 ? value / best.ink : (sums[channel] ?? 0) / SAMPLES,
  );
  const back = sums.map((value, channel) =>
    rest > 1e-6 ? (value - (bestInk[channel] ?? 0)) / rest : value / SAMPLES,
  );
  const gap =
    luma(text[0] ?? 0, text[1] ?? 0, text[2] ?? 0) - luma(back[0] ?? 0, back[1] ?? 0, back[2] ?? 0);
  const lift = Math.max(0, MIN_CONTRAST - Math.abs(gap) * 255) * (gap >= 0 ? 1 : -1);
  const fg = text.map((value) => clamp(value + lift * (1 - coverage)));
  const bg = back.map((value) => clamp(value - lift * coverage));
  const style = chalk
    .rgb(fg[0] ?? 0, fg[1] ?? 0, fg[2] ?? 0)
    .bgRgb(bg[0] ?? 0, bg[1] ?? 0, bg[2] ?? 0);
  return style(best.char);
}

/** Plain characters only: the glyph whose ink best matches the brightness of each part of the cell. */
function toneCell(cell: Cell, gamma: number): string {
  const bright = new Float32Array(SAMPLES);
  let total = 0;
  for (let index = 0; index < SAMPLES; index++) {
    const value = Math.pow(luma(cell.r[index] ?? 0, cell.g[index] ?? 0, cell.b[index] ?? 0), gamma);
    bright[index] = value;
    total += value;
  }
  if (total / SAMPLES < 0.02) return ' ';
  let best = ' ';
  let bestCost = Number.POSITIVE_INFINITY;
  for (const glyph of GLYPH_TABLE) {
    let cost = 0;
    for (let index = 0; index < SAMPLES; index++)
      cost += ((bright[index] ?? 0) - (glyph.cover[index] ?? 0)) ** 2;
    if (cost < bestCost) {
      bestCost = cost;
      best = glyph.char;
    }
  }
  return best;
}

/**
 * Draws a bitmap as ASCII art, one character per terminal cell. With colour the characters carry the picture's
 * hue on a tinted background; without it they carry only brightness, like a classic density ramp.
 */
export function renderBitmap(
  bitmap: Bitmap,
  mode: PictureMode = pictureMode(),
  /** Below 1 lifts dark pixels so small icons stay visible; above 1 leaves broad backgrounds empty. */
  gamma = 0.7,
): string[] {
  const { cols, rows } = bitmapSize(bitmap);
  return Array.from({ length: rows }, (_, row) => {
    let line = '';
    for (let col = 0; col < cols; col++) {
      const cell = sampleCell(bitmap, col, row);
      if (cell.filled === 0) line += ' ';
      else line += mode === 'color' ? colorCell(cell) : toneCell(cell, gamma);
    }
    return mode === 'tone' ? line.replace(/\s+$/, '') : line;
  });
}
