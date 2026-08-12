import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { getConfigDir, getWritableConfigDir } from './paths.js';

export type IconMode = 'auto' | 'ascii' | 'unicode';
export type ColorMode = 'auto' | 'on' | 'off';

export interface Preferences {
  iconMode: IconMode;
  colorMode: ColorMode;
}

const DEFAULT_PREFERENCES: Preferences = {
  iconMode: 'auto',
  colorMode: 'auto',
};
const detectedColorLevel = chalk.level;
const inheritedNoColor = process.env['NO_COLOR'];
const inheritedForceColor = process.env['FORCE_COLOR'];

function getPreferencesPath(): string {
  return path.join(getConfigDir(), 'preferences.json');
}

function getWritablePreferencesPath(): string {
  return path.join(getWritableConfigDir(), 'preferences.json');
}

export function loadPreferences(): Preferences {
  try {
    const prefPath = getPreferencesPath();
    const raw = JSON.parse(fs.readFileSync(prefPath, 'utf-8')) as Partial<Preferences>;
    const iconMode: IconMode =
      raw.iconMode === 'ascii' || raw.iconMode === 'unicode' || raw.iconMode === 'auto'
        ? raw.iconMode
        : DEFAULT_PREFERENCES.iconMode;
    const colorMode: ColorMode =
      raw.colorMode === 'on' || raw.colorMode === 'off' || raw.colorMode === 'auto'
        ? raw.colorMode
        : DEFAULT_PREFERENCES.colorMode;
    return { iconMode, colorMode };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

function savePreferences(preferences: Preferences): boolean {
  try {
    fs.writeFileSync(getWritablePreferencesPath(), JSON.stringify(preferences, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function setIconMode(mode: IconMode): boolean {
  const prefs = loadPreferences();
  prefs.iconMode = mode;
  return savePreferences(prefs);
}

export function setColorMode(mode: ColorMode): boolean {
  const prefs = loadPreferences();
  prefs.colorMode = mode;
  return savePreferences(prefs);
}

export function resetPreferences(): boolean {
  return savePreferences({ ...DEFAULT_PREFERENCES });
}

export function resolveIconMode(): IconMode {
  const env = (process.env['NBTCA_ICON_MODE'] ?? '').toLowerCase();
  if (env === 'ascii' || env === 'unicode' || env === 'auto') {
    return env;
  }
  return loadPreferences().iconMode;
}

export function resolveColorMode(): ColorMode {
  const env = (process.env['NBTCA_COLOR_MODE'] ?? '').toLowerCase();
  if (env === 'on' || env === 'off' || env === 'auto') {
    return env;
  }
  return loadPreferences().colorMode;
}

export function applyColorModePreference(forcePlain: boolean): void {
  const mode = forcePlain ? 'off' : resolveColorMode();
  if (mode === 'off') {
    delete process.env['FORCE_COLOR'];
    process.env['NO_COLOR'] = '1';
    chalk.level = 0;
    return;
  }

  if (mode === 'on') {
    delete process.env['NO_COLOR'];
    delete process.env['FORCE_COLOR'];
    chalk.level = 3;
    return;
  }

  if (inheritedNoColor === undefined) delete process.env['NO_COLOR'];
  else process.env['NO_COLOR'] = inheritedNoColor;
  if (inheritedForceColor === undefined) delete process.env['FORCE_COLOR'];
  else process.env['FORCE_COLOR'] = inheritedForceColor;
  chalk.level = detectedColorLevel;
}
