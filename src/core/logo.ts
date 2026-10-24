import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chalk from 'chalk';
import { useUnicodeIcons } from './icons.js';
import { APP_INFO } from '../config/data.js';
import { typeReveal, materializeBraille, sleep } from './motion.js';
import { brandGradient as brand, c, frameLeft, space } from './theme.js';
import { visualWidth, wrapAnsiWithIndent } from './text.js';

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

function paint(text: string, color: boolean): string {
  return color ? brand(text) : text;
}

function logoContent(): { art: string; metadata: string[] } | undefined {
  const cols = Number.isFinite(process.stdout.columns) ? process.stdout.columns : undefined;
  const rows = Number.isFinite(process.stdout.rows) ? process.stdout.rows : undefined;
  const width =
    cols === undefined ? Number.POSITIVE_INFINITY : Math.max(1, cols - startupOffset(cols, 0));
  const color = !process.env['NO_COLOR'];
  const metadata = [
    ...wrapAnsiWithIndent(TAGLINE, width, '').map((line) => paint(line, color)),
    ...wrapAnsiWithIndent(`@nbtca/prompt  v${APP_INFO.version}`, width, '').map((line) =>
      chalk.dim(line),
    ),
  ];
  const files = [
    ...(useUnicodeIcons()
      ? LOGO_TIERS.filter((tier) => (cols ?? 0) >= tier.minCols && (rows ?? 0) >= tier.minRows).map(
          (tier) => tier.file,
        )
      : []),
    'ascii-logo.txt',
    undefined,
  ];
  for (const file of files) {
    const art = file ? readArt(file) : 'NBTCA';
    if (!art) continue;
    const lines = art.split('\n');
    if (
      lines.every((line) => visualWidth(line) <= width) &&
      (rows === undefined || lines.length + metadata.length + 3 <= rows)
    ) {
      return { art, metadata };
    }
  }
  return undefined;
}

export function buildLogoLines(): string[] {
  const content = logoContent();
  if (!content) return [];
  return [
    '',
    ...paint(content.art, !process.env['NO_COLOR']).split('\n'),
    '',
    ...content.metadata,
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
  const content = logoContent();
  if (!content) return;
  const cols = process.stdout.columns;
  const color = !process.env['NO_COLOR'];
  const skip = skipOnKeypress();
  process.stdout.write('\n');
  try {
    await materializeBraille(content.art, (s) => indentBlock(paint(s, color), cols), {
      paintProgress: (s) => indentBlock(color ? c.brand(s) : s, cols),
      signal: skip.signal,
    });
    await typeReveal(['', ...content.metadata.map((line) => indentBlock(line, cols)), ''], {
      signal: skip.signal,
    });
    await sleep(FINAL_FRAME_MS, skip.signal);
  } finally {
    skip.release();
  }
}
