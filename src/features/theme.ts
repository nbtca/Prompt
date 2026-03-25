/**
 * Theme CLI command handler (non-interactive)
 */

import {
  applyColorModePreference,
  loadPreferences,
  resetPreferences,
  setColorMode,
  setIconMode,
  type ColorMode,
  type IconMode,
} from '../config/preferences.js';
import { resetIconCache } from '../core/icons.js';
import { t } from '../i18n/index.js';

export interface ThemeCommandResult {
  ok: boolean;
  message: string;
}

const ICON_MODES: IconMode[] = ['auto', 'ascii', 'unicode'];
const COLOR_MODES: ColorMode[] = ['auto', 'on', 'off'];

function formatThemeSummary(): string {
  const trans = t();
  const prefs = loadPreferences();
  return `${trans.theme.iconMode}: ${prefs.iconMode}, ${trans.theme.colorMode}: ${prefs.colorMode}`;
}

export function runThemeCommand(args: string[]): ThemeCommandResult {
  const trans = t();
  const [scope, value] = args;

  if (!scope) {
    return { ok: true, message: formatThemeSummary() };
  }

  if (scope === 'reset') {
    const saved = resetPreferences();
    resetIconCache();
    applyColorModePreference(false);
    const message = saved ? trans.theme.reset : trans.theme.resetSessionOnly;
    return { ok: true, message };
  }

  if (scope === 'icon') {
    const mode = (value || '').toLowerCase() as IconMode;
    if (!ICON_MODES.includes(mode)) {
      return { ok: false, message: `${trans.theme.invalidValue} auto, ascii, unicode` };
    }
    const saved = setIconMode(mode);
    resetIconCache();
    return { ok: true, message: saved ? trans.theme.updated : trans.theme.updatedSessionOnly };
  }

  if (scope === 'color') {
    const mode = (value || '').toLowerCase() as ColorMode;
    if (!COLOR_MODES.includes(mode)) {
      return { ok: false, message: `${trans.theme.invalidValue} auto, on, off` };
    }
    const saved = setColorMode(mode);
    applyColorModePreference(false);
    return { ok: true, message: saved ? trans.theme.updated : trans.theme.updatedSessionOnly };
  }

  return { ok: false, message: trans.theme.usage };
}
