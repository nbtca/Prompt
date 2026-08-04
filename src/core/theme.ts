import chalk from 'chalk';
import gradient from 'gradient-string';
import { pickIcon } from './icons.js';

// The one gradient the brand uses anywhere it appears -- the startup logo,
// and (in text form) the persistent header wordmark. Defined once here so
// both stay the same three stops instead of drifting apart.
export const brandGradient = gradient([
  { color: '#124689', pos: 0 },
  { color: '#0ea5e9', pos: 0.55 },
  { color: '#06b6d4', pos: 1 },
]);

/** The brand wordmark treatment: bold text painted in `brandGradient`,
 * falling back to plain text under NO_COLOR (gradient-string doesn't
 * auto-respect it the way chalk's own colors do). Currently used by the
 * header's persistent "nbtca" mark (`app/chrome.ts`) -- named here, not
 * left as a one-off local helper, so any future chrome element that wants
 * "the brand gradient, as a wordmark" has a single place to reuse instead
 * of re-deriving the NO_COLOR/bold/gradient combination again. */
export function brandMark(s: string): string {
  if (process.env['NO_COLOR']) return s;
  return chalk.bold(brandGradient(s));
}

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
  /** The grid cursor's own visual signal: a solid brand-colored background
   * block, deliberately distinct from `active` (bold text on the default
   * background) so "this is today" and "this is where your cursor is" never
   * share one visual language, even when the cursor lands on today's own
   * column. */
  cursor:  (s: string) => chalk.bgHex('#0ea5e9').black(s),
};
