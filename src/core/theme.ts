import chalk from 'chalk';
import { pickIcon } from './icons.js';

export const c = {
  brand:   (s: string) => chalk.hex('#0ea5e9')(s),
  accent:  (s: string) => chalk.cyan(s),

  success: (s: string) => chalk.green(s),
  error:   (s: string) => chalk.red(s),
  warn:    (s: string) => chalk.yellow(s),

  heading: (s: string) => chalk.bold.white(s),
  muted:   (s: string) => chalk.dim(s),
  subtle:  (s: string) => chalk.gray(s),

  label:   (s: string) => chalk.bold.cyan(s),
  url:     (s: string) => chalk.dim.underline(s),
  version: (s: string) => chalk.dim(s),

  latency: (ms: number): string => {
    const s = `${ms}ms`;
    if (ms < 200)  return chalk.green(s);
    if (ms < 1000) return chalk.yellow(s);
    return chalk.red(s);
  },
};

export const glyph = {
  cursor: () => pickIcon('→', '>'),
  rule:   () => pickIcon('─', '-'),
  bullet: () => pickIcon('·', '.'),
  dot:    () => pickIcon('●', '*'),
  updown: () => pickIcon('↑↓', 'up/down'),
  enter:  () => pickIcon('⏎', 'enter'),
  // Two-level "how full" bar cell (Home's day-progress, Schedule's
  // term-progress) — a single source of truth so every such bar in the
  // app reads as the same visual language. Not the same vocabulary as
  // calendar-heatmap's 5-level intensity scale, which is a deliberately
  // finer-grained density visualization, not a binary fill/empty bar.
  barFilled: () => pickIcon('█', '#'),
  barEmpty:  () => pickIcon('░', '-'),
};

export const space = {
  indent: '   ',
} as const;

export const type = {
  heading: (s: string) => chalk.bold.white(s),
  label:   (s: string) => chalk.white(s),
  body:    (s: string) => s,
  hint:    (s: string) => chalk.dim(s),
  /** The one thing on this screen your eye should land on: the app's own
   * name, the tab you're on, the row a menu's cursor sits on, the class
   * that's happening right now. `heading` marks a section as structure;
   * `active` marks a single point as attention — never both on the same
   * element, and never more than one or two `active` uses per screen, or
   * the signal stops meaning anything. Brand color (#0ea5e9) precisely
   * because there is exactly one brand-worthy thing to say on each of
   * these screens, and this is where it belongs. */
  active:  (s: string) => chalk.bold(c.brand(s)),
};
