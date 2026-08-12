import chalk from 'chalk';
import gradient from 'gradient-string';
import { pickIcon } from './icons.js';

export const brandGradient = gradient([
  { color: '#124689', pos: 0 },
  { color: '#0ea5e9', pos: 0.55 },
  { color: '#06b6d4', pos: 1 },
]);

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

  heading: (s: string) => chalk.bold.white(s),
  muted: (s: string) => chalk.dim(s),
  subtle: (s: string) => chalk.gray(s),

  label: (s: string) => chalk.bold.cyan(s),
  url: (s: string) => chalk.dim.underline(s),
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
  bullet: () => pickIcon('·', '.'),
  dot: () => pickIcon('●', '*'),
  updown: () => pickIcon('↑↓', 'up/down'),
  enter: () => pickIcon('⏎', 'enter'),
  barFilled: () => pickIcon('█', '#'),
  barEmpty: () => pickIcon('░', '-'),
};

export const space = {
  indent: '   ',
} as const;

export const type = {
  heading: (s: string) => chalk.bold.white(s),
  label: (s: string) => chalk.white(s),
  body: (s: string) => s,
  hint: (s: string) => chalk.dim(s),
  active: (s: string) => chalk.bold(c.brand(s)),
  cursor: (s: string) => chalk.bgHex('#0ea5e9').black(s),
};
