/**
 * Startup logo: a high-precision braille dot-matrix render of the NBTCA emblem
 * (generated from CA-logo.svg), shown with the brand blue->cyan gradient.
 * Falls back to plain ASCII on terminals without Unicode/braille support.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chalk from 'chalk';
import { useUnicodeIcons } from './icons.js';
import { APP_INFO } from '../config/data.js';
import { typeReveal, materializeBraille } from './motion.js';
import { brandGradient as brand } from './theme.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TAGLINE = 'To be at the intersection of technology and liberal arts.';

function readArt(file: string): string | null {
  try {
    return readFileSync(join(__dirname, '../logo', file), 'utf-8').replace(/\s+$/, '');
  } catch {
    return null;
  }
}

// Three braille dot-matrix tiers of the same emblem (all rendered from the
// same text-ring-stripped SVG, so none of them reintroduce the illegible-blob
// problem -- see ca-dotmatrix.txt's own history). Picking a tier is not just
// "shrink to fit": a narrow terminal gets a purpose-built lower-detail render
// rather than a squashed version of the big one, mirroring how the schedule
// grid swaps in a whole different layout below its own width floor instead
// of cramming columns.
const TIERS = [
  { file: 'ca-dotmatrix-large.txt', minCols: 60, minRows: 34 },
  { file: 'ca-dotmatrix.txt', minCols: 44, minRows: 24 },
  { file: 'ca-dotmatrix-small.txt', minCols: 0, minRows: 0 },
] as const;

function dotmatrixFile(): string {
  const cols = process.stdout.columns ?? 0;
  const rows = process.stdout.rows ?? 0;
  const tier = TIERS.find((t) => cols >= t.minCols && rows >= t.minRows);
  return tier?.file ?? 'ca-dotmatrix-small.txt';
}

function paint(text: string, color: boolean): string {
  if (!color) return text;
  // multiline keeps the gradient aligned down the whole block; fall back to a
  // per-line gradient if the installed gradient-string lacks .multiline.
  const fn = brand as unknown as { multiline?: (s: string) => string };
  return typeof fn.multiline === 'function'
    ? fn.multiline(text)
    : text.split('\n').map((line) => brand(line)).join('\n');
}

function loadArt(): string {
  const art = useUnicodeIcons() ? readArt(dotmatrixFile()) : readArt('ascii-logo.txt');
  return art ?? 'NBTCA';
}

export function buildLogoLines(): string[] {
  const color = !process.env['NO_COLOR'];
  const paintedArt = paint(loadArt(), color).split('\n');

  return [
    '',
    ...paintedArt,
    '',
    color ? brand(TAGLINE) : TAGLINE,
    chalk.dim(`@nbtca/prompt  v${APP_INFO.version}`),
    '',
  ];
}

export async function runStartup(): Promise<void> {
  if (!process.stdout.isTTY) return;
  const color = !process.env['NO_COLOR'];
  process.stdout.write('\n');
  await materializeBraille(loadArt(), (s) => paint(s, color));
  await typeReveal(['', color ? brand(TAGLINE) : TAGLINE, chalk.dim(`@nbtca/prompt  v${APP_INFO.version}`), '']);
}
