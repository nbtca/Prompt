import { getCapabilities } from './capabilities.js';
import { ansi } from './canvas.js';

const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RevealOptions {
  reducedMotion?: boolean;
  stepMs?: number;
  write?: (s: string) => void;
}

export async function typeReveal(lines: string[], opts: RevealOptions = {}): Promise<void> {
  const write =
    opts.write ??
    ((s: string) => {
      process.stdout.write(s);
    });
  const reduced = opts.reducedMotion ?? getCapabilities().reducedMotion;

  if (reduced) {
    write(lines.join('\n') + '\n');
    return;
  }

  const stepMs = opts.stepMs ?? 45;
  for (const line of lines) {
    write(line + '\n');
    await sleep(stepMs);
  }
}

const BRAILLE_BASE = 0x2800;

function brailleMask(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  return code >= BRAILLE_BASE && code <= BRAILLE_BASE + 0xff ? code - BRAILLE_BASE : -1;
}

export interface MaterializeOptions {
  /** Painter for the in-between frames; the gradient is wasted on a scatter of dots. */
  paintProgress?: (s: string) => string;
  reducedMotion?: boolean;
  frames?: number;
  frameMs?: number;
  write?: (s: string) => void;
  random?: () => number;
}

export async function materializeBraille(
  art: string,
  paint: (s: string) => string,
  opts: MaterializeOptions = {},
): Promise<void> {
  const write =
    opts.write ??
    ((s: string) => {
      process.stdout.write(s);
    });
  const reduced = opts.reducedMotion ?? getCapabilities().reducedMotion;
  const lines = art.split('\n');
  const charGrid = lines.map((line) =>
    Array.from(GRAPHEME_SEGMENTER.segment(line), ({ segment }) => segment),
  );
  const maskGrid = charGrid.map((row) => row.map(brailleMask));

  if (reduced || !maskGrid.some((row) => row.some((m) => m > 0))) {
    write(paint(art) + '\n');
    return;
  }

  const dots: [row: number, col: number, bit: number][] = [];
  maskGrid.forEach((row, r) => {
    row.forEach((mask, c) => {
      if (mask <= 0) return;
      for (let bit = 0; bit < 8; bit++) if (mask & (1 << bit)) dots.push([r, c, bit]);
    });
  });

  const rand = opts.random ?? Math.random;
  for (let i = dots.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const a = dots[i],
      b = dots[j];
    if (a && b) {
      dots[i] = b;
      dots[j] = a;
    }
  }

  const acc = maskGrid.map((row) => row.map(() => 0));
  const renderFrame = (): string =>
    charGrid
      .map((row, r) =>
        row
          .map((original, c) => {
            const mask = maskGrid[r]?.[c] ?? -1;
            if (mask <= 0) return original;
            return String.fromCodePoint(BRAILLE_BASE + (acc[r]?.[c] ?? 0));
          })
          .join(''),
      )
      .join('\n');

  const frameCount = Math.max(1, opts.frames ?? 12);
  const frameMs = opts.frameMs ?? 35;
  let shown = 0;
  for (let f = 1; f <= frameCount; f++) {
    const target = Math.round((dots.length * f) / frameCount);
    while (shown < target) {
      const d = dots[shown];
      if (d) {
        const [r, c, bit] = d;
        const row = acc[r];
        if (row) row[c] = (row[c] ?? 0) | (1 << bit);
      }
      shown++;
    }
    const painter = f === frameCount ? paint : (opts.paintProgress ?? paint);
    write(painter(renderFrame()) + '\n');
    if (f < frameCount) {
      await sleep(frameMs);
      write(ansi.cursorUp(lines.length) + ansi.cursorToCol0 + ansi.eraseDown);
    }
  }
}
