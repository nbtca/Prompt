import fs from 'fs';
import path from 'path';

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

function getConfigDir(): string {
  const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || '';
  return path.join(homeDir, '.nbtca');
}

function getPreferencesPath(): string {
  return path.join(getConfigDir(), 'preferences.json');
}

function ensureConfigDir(): void {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

export function loadPreferences(): Preferences {
  try {
    const prefPath = getPreferencesPath();
    if (!fs.existsSync(prefPath)) {
      return { ...DEFAULT_PREFERENCES };
    }
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
    ensureConfigDir();
    fs.writeFileSync(getPreferencesPath(), JSON.stringify(preferences, null, 2));
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
  const env = (process.env['NBTCA_ICON_MODE'] || '').toLowerCase();
  if (env === 'ascii' || env === 'unicode' || env === 'auto') {
    return env;
  }
  return loadPreferences().iconMode;
}

export function resolveColorMode(): ColorMode {
  const env = (process.env['NBTCA_COLOR_MODE'] || '').toLowerCase();
  if (env === 'on' || env === 'off' || env === 'auto') {
    return env;
  }
  return loadPreferences().colorMode;
}

export function applyColorModePreference(forcePlain: boolean): void {
  if (forcePlain) {
    process.env['NO_COLOR'] = '1';
    return;
  }

  const mode = resolveColorMode();
  if (mode === 'off') {
    process.env['NO_COLOR'] = '1';
    return;
  }
  if (mode === 'on') {
    delete process.env['NO_COLOR'];
  }
}
