import chalk from 'chalk';
import { afterEach, describe, expect, it } from 'vitest';
import { applyColorModePreference } from './preferences.js';

const originalColorMode = process.env['NBTCA_COLOR_MODE'];
const originalNoColor = process.env['NO_COLOR'];
const originalLevel = chalk.level;

afterEach(() => {
  if (originalColorMode === undefined) delete process.env['NBTCA_COLOR_MODE'];
  else process.env['NBTCA_COLOR_MODE'] = originalColorMode;
  if (originalNoColor === undefined) delete process.env['NO_COLOR'];
  else process.env['NO_COLOR'] = originalNoColor;
  chalk.level = originalLevel;
});

describe('applyColorModePreference', () => {
  it('updates the active Chalk instance', () => {
    applyColorModePreference(true);
    expect(chalk.red('plain')).toBe('plain');

    process.env['NBTCA_COLOR_MODE'] = 'on';
    applyColorModePreference(false);
    expect(chalk.red('color')).toContain('\u001B[');
  });

  it('clears a previous off mode when auto is restored', () => {
    process.env['NBTCA_COLOR_MODE'] = 'off';
    applyColorModePreference(false);
    expect(process.env['NO_COLOR']).toBe('1');

    process.env['NBTCA_COLOR_MODE'] = 'auto';
    applyColorModePreference(false);
    expect(process.env['NO_COLOR']).toBe(originalNoColor);
  });
});
