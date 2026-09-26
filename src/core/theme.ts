import chalk from 'chalk';
import { pickIcon } from './icons.js';

const BRAND_STOPS = [
  { at: 0, rgb: [0x12, 0x46, 0x89] },
  { at: 0.55, rgb: [0x0e, 0xa5, 0xe9] },
  { at: 1, rgb: [0x06, 0xb6, 0xd4] },
] as const;

function brandColorAt(position: number): [number, number, number] {
  const upper = BRAND_STOPS.findIndex((stop) => stop.at >= position);
  const to = BRAND_STOPS[Math.max(upper, 1)] ?? BRAND_STOPS[2];
  const from = BRAND_STOPS[Math.max(upper, 1) - 1] ?? BRAND_STOPS[0];
  const ratio = (position - from.at) / (to.at - from.at);
  const mix = (index: 0 | 1 | 2) =>
    Math.round(from.rgb[index] + (to.rgb[index] - from.rgb[index]) * ratio);
  return [mix(0), mix(1), mix(2)];
}

export function brandGradient(text: string): string {
  const lines = text.split('\n').map((line) => Array.from(line));
  const span = Math.max(1, ...lines.map((line) => line.length - 1));
  return lines
    .map((line) =>
      line
        .map((char, column) =>
          char.trim() ? chalk.rgb(...brandColorAt(Math.min(1, column / span)))(char) : char,
        )
        .join(''),
    )
    .join('\n');
}

export function brandMark(s: string): string {
  if (process.env['NO_COLOR']) return s;
  return chalk.bold(brandGradient(s));
}

export const c = {
  brand: (s: string) => chalk.hex('#0ea5e9')(s),
  accent: (s: string) => chalk.cyan(s),

  success: (s: string) => chalk.green(s),
  error: (s: string) => chalk.red(s),
  warn: (s: string) => chalk.yellow(s),

  heading: (s: string) => chalk.bold(s),
  muted: (s: string) => chalk.dim(s),
  subtle: (s: string) => chalk.gray(s),

  label: (s: string) => chalk.bold.cyan(s),
  url: (s: string) => chalk.dim.underline(s),
  code: (s: string) => chalk.yellow(s),
  version: (s: string) => chalk.dim(s),

  latency: (ms: number): string => {
    const s = `${ms}ms`;
    if (ms < 200) return chalk.green(s);
    if (ms < 1000) return chalk.yellow(s);
    return chalk.red(s);
  },
};

export const glyph = {
  cursor: () => pickIcon('→', '>'),
  rule: () => pickIcon('─', '-'),
  bar: () => pickIcon('│', '|'),
  bullet: () => pickIcon('·', '.'),
  dot: () => pickIcon('●', '*'),
  updown: () => pickIcon('↑↓', 'up/down'),
  enter: () => pickIcon('⏎', 'enter'),
  barFilled: () => pickIcon('█', '#'),
  barEmpty: () => pickIcon('░', '-'),
};

export const MAX_FRAME_COLS = 120;

export const space = {
  indent: '   ',
} as const;

export const type = {
  heading: (s: string) => chalk.bold(s),
  label: (s: string) => s,
  body: (s: string) => s,
  hint: (s: string) => chalk.dim(s),
  active: (s: string) => chalk.bold(c.brand(s)),
  cursor: (s: string) => chalk.bgHex('#0ea5e9').black(s),
};
