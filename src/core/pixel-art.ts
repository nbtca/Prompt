import chalk from 'chalk';
import { getCapabilities } from './capabilities.js';
import { useUnicodeIcons } from './icons.js';

export interface Bitmap {
  /** Maps a row character to a #rrggbb colour; a space is transparent. */
  palette: Readonly<Record<string, string>>;
  rows: readonly string[];
}

export type PictureMode = 'color' | 'tone';

// Light-on-dark density order, measured from JetBrains Mono ink coverage.
const TONE_RAMP = ' .:-=+*#%@';

export function bitmapSize(bitmap: Bitmap): { cols: number; rows: number } {
  return {
    cols: Math.max(0, ...bitmap.rows.map((row) => row.length)),
    rows: Math.ceil(bitmap.rows.length / 2),
  };
}

export function pictureMode(): PictureMode {
  return getCapabilities().color && chalk.level > 0 && useUnicodeIcons() ? 'color' : 'tone';
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function pixel(bitmap: Bitmap, x: number, y: number): string | undefined {
  const symbol = bitmap.rows[y]?.[x];
  return symbol === undefined || symbol === ' ' ? undefined : bitmap.palette[symbol];
}

function halfBlockCell(top: string | undefined, bottom: string | undefined): string {
  if (top === undefined && bottom === undefined) return ' ';
  if (top === bottom && top !== undefined) return chalk.hex(top)('█');
  if (bottom === undefined) return chalk.hex(top ?? '#000000')('▀');
  if (top === undefined) return chalk.hex(bottom)('▄');
  return chalk.hex(top).bgHex(bottom)('▀');
}

function toneCell(
  top: string | undefined,
  bottom: string | undefined,
  color: boolean,
  gamma: number,
): string {
  const colors = [top, bottom].filter((value): value is string => value !== undefined);
  if (colors.length === 0) return ' ';
  const average = Math.pow(colors.reduce((sum, value) => sum + luminance(value), 0) / 2, gamma);
  const char =
    TONE_RAMP[Math.min(TONE_RAMP.length - 1, Math.round(average * (TONE_RAMP.length - 1)))] ?? ' ';
  if (!color || char === ' ') return char;
  const brightest = colors.reduce((best, value) =>
    luminance(value) > luminance(best) ? value : best,
  );
  return chalk.hex(brightest)(char);
}

/** Two pixel rows share one terminal row, matching the 1:2 shape of a cell. */
export function renderBitmap(
  bitmap: Bitmap,
  mode: PictureMode = pictureMode(),
  /** Below 1 lifts dark pixels so small icons stay visible; above 1 leaves broad backgrounds empty. */
  gamma = 0.7,
): string[] {
  const { cols, rows } = bitmapSize(bitmap);
  const color = getCapabilities().color && chalk.level > 0;
  return Array.from({ length: rows }, (_, row) => {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const top = pixel(bitmap, x, row * 2);
      const bottom = pixel(bitmap, x, row * 2 + 1);
      line += mode === 'color' ? halfBlockCell(top, bottom) : toneCell(top, bottom, color, gamma);
    }
    return mode === 'tone' ? line.replace(/\s+$/, '') : line;
  });
}
