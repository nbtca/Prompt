import chalk from 'chalk';
import { GLYPHS, GLYPH_COLS, GLYPH_ROWS } from '../art/glyphs.js';
import { getCapabilities } from './capabilities.js';
import { loadPreferences } from '../config/preferences.js';
import { renderFine } from './pixel-art-fine.js';

export interface Bitmap {
  /** Maps a row character to a #rrggbb colour; a space is transparent. */
  palette: Readonly<Record<string, string>>;
  rows: readonly string[];
  /** Pixels per terminal cell, horizontally and vertically. Defaults to 1 × 2. */
  density?: { x: number; y: number };
  /** Interpolate between pixels, for scenes; icons keep their hard pixel-art edges. */
  smooth?: boolean;
}

/** fine: Unicode blocks (opt-in); color: coloured ASCII; tone: plain ASCII. */
export type PictureMode = 'fine' | 'color' | 'tone';

const DEFAULT_DENSITY = { x: 1, y: 2 } as const;
const SAMPLES = GLYPH_COLS * GLYPH_ROWS;
// Terminals are mostly dark; transparent pixels count as this colour when a cell is only partly covered.
const BACKDROP = [20, 22, 28] as const;
// Weight of matching a cell's average brightness against matching its shape.
const TONE_WEIGHT = 8;
// The densest glyph covers about this much of its cell, so full brightness maps to it.
const MAX_INK = 0.32;
// Share of a cell's average colour kept as its background tint.
const TINT = 0.3;

interface Glyph {
  char: string;
  cover: Float32Array;
  ink: number;
}

// Punctuation and shapes only: letters and digits read as noise inside a picture.
const ART_CHARS = ' .,:;-_~=+*^"|/\\()[]{}<>?#%&@$';

// Glyphs that differ mainly in density: flat areas switch between these without looking noisy.
const RAMP_CHARS = ' .:-=+*#%@';
// Brightness variance below which a cell counts as flat.
const FLAT_VARIANCE = 0.0004;

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

const RAMP_TABLE: readonly Glyph[] = GLYPH_TABLE.filter((glyph) => RAMP_CHARS.includes(glyph.char));

export function bitmapSize(bitmap: Bitmap): { cols: number; rows: number } {
  const { x, y } = bitmap.density ?? DEFAULT_DENSITY;
  return {
    cols: Math.ceil(Math.max(0, ...bitmap.rows.map((row) => row.length)) / x),
    rows: Math.ceil(bitmap.rows.length / y),
  };
}

/** The finest picture the terminal can show and the user allows, falling back to plain ASCII. */
export function pictureMode(): PictureMode {
  const caps = getCapabilities();
  if (!caps.color || chalk.level === 0) return 'tone';
  if (caps.unicode && chalk.level >= 3 && loadPreferences().pictureDetail === 'fine') return 'fine';
  return 'color';
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

interface Pick {
  glyph: Glyph;
  /** Brightness the glyph failed to deliver, as a share of the cell: what error diffusion passes on. */
  error: number;
}

/**
 * The glyph whose ink best matches the brightness of each part of the cell. `carry` is error diffused in from
 * neighbouring cells; it shifts the target brightness, not the shape.
 */
function pickGlyph(cell: Cell, gamma: number, carry: number): Pick | undefined {
  const bright = new Float32Array(SAMPLES);
  let total = 0;
  for (let index = 0; index < SAMPLES; index++) {
    const value =
      MAX_INK * Math.pow(luma(cell.r[index] ?? 0, cell.g[index] ?? 0, cell.b[index] ?? 0), gamma);
    bright[index] = value;
    total += value;
  }
  if (total / SAMPLES < 0.004) return undefined;
  const mean = Math.max(0, total / SAMPLES + carry);
  const shift = mean - total / SAMPLES;
  let variance = 0;
  for (let index = 0; index < SAMPLES; index++)
    variance += ((bright[index] ?? 0) - total / SAMPLES) ** 2 / SAMPLES;
  const candidates = variance < FLAT_VARIANCE ? RAMP_TABLE : GLYPH_TABLE;
  let best: Glyph | undefined;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const glyph of candidates) {
    const glyphMean = glyph.ink / SAMPLES;
    let cost = TONE_WEIGHT * SAMPLES * (mean - glyphMean) ** 2;
    for (let index = 0; index < SAMPLES; index++)
      cost += ((bright[index] ?? 0) + shift - mean - ((glyph.cover[index] ?? 0) - glyphMean)) ** 2;
    if (cost < bestCost) {
      bestCost = cost;
      best = glyph;
    }
  }
  return best && { glyph: best, error: mean - best.ink / SAMPLES };
}

interface Drawn {
  text: string;
  error: number;
}

/** Plain characters only. */
function toneCell(cell: Cell, gamma: number, carry: number): Drawn {
  const pick = pickGlyph(cell, gamma, carry);
  return { text: pick?.glyph.char ?? ' ', error: pick?.error ?? 0 };
}

/**
 * Characters follow the brightness and shape of the picture; the colour lives in the characters themselves, on
 * the terminal's own dark background with only a faint tint.
 */
function colorCell(cell: Cell, gamma: number, carry: number): Drawn {
  const pick = pickGlyph(cell, gamma, carry);
  if (!pick || pick.glyph.char === ' ') return { text: ' ', error: pick?.error ?? 0 };
  const { glyph, error } = pick;
  const mean: Rgb = [0, 0, 0];
  const ink: Rgb = [0, 0, 0];
  for (let index = 0; index < SAMPLES; index++) {
    const weight = glyph.cover[index] ?? 0;
    const pixel: Rgb = [cell.r[index] ?? 0, cell.g[index] ?? 0, cell.b[index] ?? 0];
    for (let channel = 0; channel < 3; channel++) {
      mean[channel] = (mean[channel] ?? 0) + (pixel[channel] ?? 0) / SAMPLES;
      ink[channel] = (ink[channel] ?? 0) + (weight * (pixel[channel] ?? 0)) / glyph.ink;
    }
  }
  const peak = Math.max(1, ...ink);
  const level = 0.4 + 0.6 * Math.pow(luma(...ink), 0.6);
  const fg = ink.map((value) => clamp((value / peak) * 255 * level));
  const text = chalk.rgb(fg[0] ?? 0, fg[1] ?? 0, fg[2] ?? 0);
  if (chalk.level < 3) return { text: text(glyph.char), error };
  const bg = mean.map((value) => clamp(value * TINT));
  return { text: text.bgRgb(bg[0] ?? 0, bg[1] ?? 0, bg[2] ?? 0)(glyph.char), error };
}

// Floyd–Steinberg weights for the cell to the right, and below-behind, below, below-ahead. Passing on only
// part of the error, as Atkinson dithering does, keeps flat areas calm.
const DIFFUSION = 0.8;
const DIFFUSE = [7 / 16, 3 / 16, 5 / 16, 1 / 16].map((weight) => weight * DIFFUSION) as [
  number,
  number,
  number,
  number,
];
const MAX_CARRY = 0.12;

/**
 * Draws a bitmap as ASCII art, one character per terminal cell. With colour the characters carry the picture's
 * hue on a tinted background; without it they carry only brightness, like a classic density ramp.
 * Brightness error is diffused to neighbouring cells in serpentine order, as libcaca and AAlib do, so gradients
 * mix the two nearest densities instead of stepping.
 */
export function renderBitmap(
  bitmap: Bitmap,
  mode: PictureMode = pictureMode(),
  /** Below 1 lifts dark pixels so small icons stay visible; above 1 leaves broad backgrounds empty. */
  gamma = 0.7,
): string[] {
  const { cols, rows } = bitmapSize(bitmap);
  if (mode === 'fine') return renderFine(bitmap, cols, rows);
  let carry = new Float32Array(cols + 2);
  let ahead = new Float32Array(cols + 2);
  return Array.from({ length: rows }, (_, row) => {
    const forward = row % 2 === 0;
    const direction = forward ? 1 : -1;
    const cells = Array.from({ length: cols }, () => ' ');
    for (let step = 0; step < cols; step++) {
      const col = forward ? step : cols - 1 - step;
      const cell = sampleCell(bitmap, col, row);
      if (cell.filled === 0) continue;
      const carried = Math.max(-MAX_CARRY, Math.min(MAX_CARRY, carry[col + 1] ?? 0));
      const drawn =
        mode === 'color' ? colorCell(cell, gamma, carried) : toneCell(cell, gamma, carried);
      cells[col] = drawn.text;
      const error = drawn.error;
      carry[col + 1 + direction] = (carry[col + 1 + direction] ?? 0) + error * DIFFUSE[0];
      ahead[col + 1 - direction] = (ahead[col + 1 - direction] ?? 0) + error * DIFFUSE[1];
      ahead[col + 1] = (ahead[col + 1] ?? 0) + error * DIFFUSE[2];
      ahead[col + 1 + direction] = (ahead[col + 1 + direction] ?? 0) + error * DIFFUSE[3];
    }
    [carry, ahead] = [ahead, new Float32Array(cols + 2)];
    const line = cells.join('');
    return mode === 'tone' ? line.replace(/\s+$/, '') : line;
  });
}
