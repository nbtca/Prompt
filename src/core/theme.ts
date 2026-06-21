import chalk from 'chalk';

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
