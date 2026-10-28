import { describe, expect, it } from 'vitest';
import chalk from 'chalk';
import { gasGiantLines, moonLines, planetSize } from './planet.js';
import { stripAnsi } from '../core/text.js';

const fullMoon = new Date(Date.UTC(2000, 0, 21, 4, 40));
const newMoon = new Date(Date.UTC(2000, 0, 6, 18, 14));

describe('planets', () => {
  const level = chalk.level;
  const lit = (lines: string[] | undefined) =>
    (lines ?? []).map((line) => line.replace(/[ .]/g, '').length);

  it('draws a round body with a 2:1 cell aspect and nothing but ASCII', () => {
    chalk.level = 0;
    const lines = gasGiantLines(30, 'tone') ?? [];
    expect(lines).toHaveLength(15);
    expect(lines.join('')).toMatch(/^[\x20-\x7e]*$/);
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(30);
    chalk.level = level;
  });

  it('is brightest where the light falls', () => {
    chalk.level = 0;
    const lines = gasGiantLines(40, 'tone') ?? [];
    const half = Math.floor(lines.length / 2);
    const weight = (rows: string[]) => rows.join('').replace(/[ .:-]/g, '').length;
    expect(weight(lines.slice(0, half))).toBeGreaterThan(weight(lines.slice(half)) * 0.9);
    chalk.level = level;
  });

  it('follows the moon phase', () => {
    chalk.level = 0;
    expect(lit(moonLines(30, fullMoon, 'tone')).reduce((a, b) => a + b, 0)).toBeGreaterThan(
      lit(moonLines(30, newMoon, 'tone')).reduce((a, b) => a + b, 0) * 3,
    );
    chalk.level = level;
  });

  it('colours the characters when the terminal has colour', () => {
    chalk.level = 3;
    expect((moonLines(30, fullMoon, 'color') ?? []).join('')).toContain('\x1b[38;2;');
    expect(stripAnsi((gasGiantLines(30, 'color') ?? []).join(''))).toMatch(/[@#%&]/);
    chalk.level = level;
  });

  it('draws the fine tier as smoothly shaded half blocks', () => {
    chalk.level = 3;
    const lines = moonLines(30, fullMoon, 'fine') ?? [];
    expect(lines).toHaveLength(15);
    expect(stripAnsi(lines.join(''))).toMatch(/^[\u2580\u2584 ]*$/u);
    expect(lines.join('')).toContain('\x1b[48;2;');
    chalk.level = level;
  });

  it('declines when there is no room', () => {
    expect(gasGiantLines(6)).toBeUndefined();
    expect(moonLines(6, fullMoon)).toBeUndefined();
    expect(planetSize(100, 5)).toBe(10);
  });
});
