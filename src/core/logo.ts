import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chalk from 'chalk';
import { useUnicodeIcons } from './icons.js';
import { APP_INFO } from '../config/data.js';
import { typeReveal, materializeBraille, sleep } from './motion.js';
import { brandGradient as brand, c, frameLeft, space } from './theme.js';
import { visualWidth } from './text.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TAGLINE = 'To be at the intersection of technology and liberal arts.';
const FINAL_FRAME_MS = 400;

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
  return color ? brand(text) : text;
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

export function startupOffset(cols: number | undefined, width: number): number {
  if (cols === undefined) return 0;
  return Math.max(0, Math.min(frameLeft(cols) + space.indent.length, cols - width));
}

function indentBlock(text: string, cols: number | undefined): string {
  const lines = text.split('\n');
  const pad = ' '.repeat(startupOffset(cols, Math.max(...lines.map(visualWidth))));
  return lines.map((line) => pad + line).join('\n');
}

function skipOnKeypress(): { signal: AbortSignal; release(): void } {
  const controller = new AbortController();
  const stdin = process.stdin;
  if (!stdin.isTTY) return { signal: controller.signal, release: () => undefined };
  const onData = (chunk: Buffer) => {
    // Raw mode swallows SIGINT, so Ctrl+C has to exit by hand.
    if (chunk.includes(0x03)) {
      stdin.setRawMode(false);
      process.exit(130);
    }
    controller.abort();
  };
  stdin.setRawMode(true);
  stdin.on('data', onData);
  stdin.resume();
  return {
    signal: controller.signal,
    release() {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    },
  };
}

export async function runStartup(): Promise<void> {
  if (!process.stdout.isTTY) return;
  const art = loadArt();
  if (!startupFitsTerminal(process.stdout.rows, process.stdout.columns, art)) return;
  const cols = process.stdout.columns;
  const color = !process.env['NO_COLOR'];
  const skip = skipOnKeypress();
  process.stdout.write('\n');
  try {
    await materializeBraille(art, (s) => indentBlock(paint(s, color), cols), {
      paintProgress: (s) => indentBlock(color ? c.brand(s) : s, cols),
      signal: skip.signal,
    });
    await typeReveal(
      [
        '',
        indentBlock(color ? brand(TAGLINE) : TAGLINE, cols),
        indentBlock(chalk.dim(`@nbtca/prompt  v${APP_INFO.version}`), cols),
        '',
      ],
      { signal: skip.signal },
    );
    await sleep(FINAL_FRAME_MS, skip.signal);
  } finally {
    skip.release();
  }
}
