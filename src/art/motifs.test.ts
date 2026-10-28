import chalk from 'chalk';
import { describe, expect, it } from 'vitest';
import { magnifier, moonSky, orbit, signalLost, teaCup } from './motifs.js';
import { stripAnsi, visualWidth } from '../core/text.js';

describe('motifs', () => {
  const level = chalk.level;

  it.each([
    ['moon and stars', moonSky],
    ['magnifier', magnifier],
  ] as const)('draws the %s in six rows of ASCII', (_name, draw) => {
    const lines = draw('tone');
    expect(lines).toHaveLength(6);
    expect(lines.join('')).toMatch(/^[\x20-\x7e]*$/);
    expect(Math.max(...lines.map(visualWidth))).toBeLessThanOrEqual(22);
    expect(lines.join('').replace(/\s/g, '').length).toBeGreaterThan(20);
  });

  it('adds colour on top of the ASCII when the terminal can', () => {
    chalk.level = 3;
    for (const draw of [moonSky, magnifier]) {
      expect(draw('color').join('')).toContain('\x1b[38;2;');
      expect(stripAnsi(draw('color').join(''))).toMatch(/^[\x20-\x7e]*$/);
    }
    chalk.level = level;
  });

  it('keeps the ASCII picture in the fine tier', () => {
    expect(stripAnsi(magnifier('fine').join(''))).toMatch(/^[\x20-\x7e]*$/);
  });

  it('draws the tea cup, the orbit, and the dropped signal in plain ASCII too', () => {
    for (const lines of [teaCup(0, 'tone'), orbit(0, 'tone'), signalLost('tone')]) {
      expect(lines).toHaveLength(6);
      expect(lines.join('')).toMatch(/^[\x20-\x7e]*$/);
    }
  });

  it('moves the moon along its orbit from frame to frame', () => {
    expect(orbit(0, 'tone')).not.toEqual(orbit(800, 'tone'));
  });
});
