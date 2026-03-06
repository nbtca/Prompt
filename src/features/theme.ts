import chalk from 'chalk';
import { isCancel, note, select } from '@clack/prompts';
import {
  applyColorModePreference,
  loadPreferences,
  resetPreferences,
  setColorMode,
  setIconMode,
  type ColorMode,
  type IconMode,
} from '../config/preferences.js';
import { pickIcon } from '../core/icons.js';
import { success, warning } from '../core/ui.js';
import { t } from '../i18n/index.js';

export interface ThemeCommandResult {
  ok: boolean;
  message: string;
}

const ICON_MODES: IconMode[] = ['auto', 'ascii', 'unicode'];
const COLOR_MODES: ColorMode[] = ['auto', 'on', 'off'];

export function printThemeSummary(): void {
  const trans = t();
  const prefs = loadPreferences();
  const content = [
    `${chalk.dim(trans.theme.iconMode + ':')} ${prefs.iconMode}`,
    `${chalk.dim(trans.theme.colorMode + ':')} ${prefs.colorMode}`,
    '',
    chalk.dim('NBTCA_ICON_MODE / NBTCA_COLOR_MODE can override saved preferences'),
  ].join('\n');
  note(content, trans.theme.current);
}

function notifyThemeChange(saved: boolean, successMessage: string, warningMessage: string): void {
  if (saved) {
    success(successMessage);
  } else {
    warning(warningMessage);
  }
}

export async function showThemeMenu(): Promise<void> {
  while (true) {
    const trans = t();
    const prefs = loadPreferences();

    const action = await select({
      message: trans.theme.chooseAction,
      options: [
        {
          value: 'summary',
          label: `${pickIcon('ℹ️', '[i]')} ${trans.theme.current}`,
          hint: `${trans.theme.iconMode}: ${prefs.iconMode} | ${trans.theme.colorMode}: ${prefs.colorMode}`,
        },
        {
          value: 'icon',
          label: `${pickIcon('🎨', '[*]')} ${trans.theme.iconMode}`,
          hint: prefs.iconMode,
        },
        {
          value: 'color',
          label: `${pickIcon('🖌️', '[*]')} ${trans.theme.colorMode}`,
          hint: prefs.colorMode,
        },
        {
          value: 'reset',
          label: `${pickIcon('♻️', '[r]')} ${trans.theme.reset}`,
        },
        {
          value: 'back',
          label: `${pickIcon('←', '[^]')} ${trans.theme.backToMenu}`,
        },
      ],
    });

    if (isCancel(action) || action === 'back') return;

    if (action === 'summary') {
      printThemeSummary();
      continue;
    }

    if (action === 'icon') {
      const mode = await select<IconMode>({
        message: trans.theme.chooseIconMode,
        options: [
          { value: 'auto', label: trans.theme.modeAuto, hint: prefs.iconMode === 'auto' ? `${pickIcon('✓', '*')} current` : undefined },
          { value: 'ascii', label: trans.theme.modeAscii, hint: prefs.iconMode === 'ascii' ? `${pickIcon('✓', '*')} current` : undefined },
          { value: 'unicode', label: trans.theme.modeUnicode, hint: prefs.iconMode === 'unicode' ? `${pickIcon('✓', '*')} current` : undefined },
        ],
        initialValue: prefs.iconMode,
      });
      if (isCancel(mode)) continue;
      const saved = setIconMode(mode);
      notifyThemeChange(saved, trans.theme.updated, trans.theme.updatedSessionOnly);
      continue;
    }

    if (action === 'color') {
      const mode = await select<ColorMode>({
        message: trans.theme.chooseColorMode,
        options: [
          { value: 'auto', label: trans.theme.modeAuto, hint: prefs.colorMode === 'auto' ? `${pickIcon('✓', '*')} current` : undefined },
          { value: 'on', label: trans.theme.modeOn, hint: prefs.colorMode === 'on' ? `${pickIcon('✓', '*')} current` : undefined },
          { value: 'off', label: trans.theme.modeOff, hint: prefs.colorMode === 'off' ? `${pickIcon('✓', '*')} current` : undefined },
        ],
        initialValue: prefs.colorMode,
      });
      if (isCancel(mode)) continue;
      const saved = setColorMode(mode);
      applyColorModePreference(false);
      notifyThemeChange(saved, trans.theme.updated, trans.theme.updatedSessionOnly);
      continue;
    }

    if (action === 'reset') {
      const saved = resetPreferences();
      applyColorModePreference(false);
      notifyThemeChange(saved, trans.theme.reset, trans.theme.resetSessionOnly);
    }
  }
}

export function runThemeCommand(args: string[]): ThemeCommandResult {
  const trans = t();
  const [scope, value] = args;

  if (!scope) {
    printThemeSummary();
    return { ok: true, message: '' };
  }

  if (scope === 'reset') {
    const saved = resetPreferences();
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
