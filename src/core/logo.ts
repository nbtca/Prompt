import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chalk from 'chalk';
import { useUnicodeIcons } from './icons.js';
import { APP_INFO } from '../config/data.js';
import { typeReveal, materializeBraille } from './motion.js';
import { brandGradient as brand, c } from './theme.js';
import { visualWidth } from './text.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TAGLINE = 'To be at the intersection of technology and liberal arts.';

function readArt(file: string): string | null {
  try {
    return readFileSync(join(__dirname, '../logo', file), 'utf-8').replace(/\s+$/, '');
  } catch {
    return null;
  }
}

const LOGO_TIERS = [
  { file: 'ca-dotmatrix-large.txt', minCols: 60, minRows: 34 },
  { file: 'ca-dotmatrix.txt', minCols: 44, minRows: 24 },
  { file: 'ca-dotmatrix-small.txt', minCols: 0, minRows: 0 },
] as const;

function dotmatrixFile(): string {
  const cols = process.stdout.columns;
  const rows = process.stdout.rows;
  const tier = LOGO_TIERS.find((t) => cols >= t.minCols && rows >= t.minRows);
  return tier?.file ?? 'ca-dotmatrix-small.txt';
}

function paint(text: string, color: boolean): string {
  if (!color) return text;
  const fn = brand as unknown as { multiline?: (s: string) => string };
  return typeof fn.multiline === 'function'
    ? fn.multiline(text)
    : text
        .split('\n')
        .map((line) => brand(line))
        .join('\n');
}

function loadArt(): string {
  const art = useUnicodeIcons() ? readArt(dotmatrixFile()) : readArt('ascii-logo.txt');
  return art ?? 'NBTCA';
}

export function startupFitsTerminal(
  rows: number | undefined,
  cols: number | undefined,
  art: string,
): boolean {
  const lines = art.split('\n');
  const fitsRows = rows === undefined || rows >= lines.length + 5;
  const fitsCols = cols === undefined || lines.every((line) => visualWidth(line) <= cols);
  return fitsRows && fitsCols;
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
  const art = loadArt();
  if (!startupFitsTerminal(process.stdout.rows, process.stdout.columns, art)) return;
  const color = !process.env['NO_COLOR'];
  process.stdout.write('\n');
  await materializeBraille(art, (s) => paint(s, color), {
    paintProgress: (s) => (color ? c.brand(s) : s),
  });
  await typeReveal([
    '',
    color ? brand(TAGLINE) : TAGLINE,
    chalk.dim(`@nbtca/prompt  v${APP_INFO.version}`),
    '',
  ]);
}
