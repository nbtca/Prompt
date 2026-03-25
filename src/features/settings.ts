/**
 * Unified settings — language, theme, about
 */

import { select, isCancel, note } from '@clack/prompts';
import chalk from 'chalk';
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
import { resetIconCache } from '../core/icons.js';
import { padEndV } from '../core/text.js';
import { success, warning } from '../core/ui.js';
import { APP_INFO, URLS } from '../config/data.js';
import { t, getCurrentLanguage, setLanguage, clearTranslationCache, type Language } from '../i18n/index.js';

function notifyResult(saved: boolean, successMsg: string, warningMsg: string): void {
  if (saved) {
    success(successMsg);
  } else {
    warning(warningMsg);
  }
}

function showAbout(): void {
  const trans = t();
  const pad = 12;
  const row  = (label: string, value: string) => `${chalk.dim(padEndV(label, pad))}${value}`;
  const link = (label: string, url: string)   => row(label, chalk.cyan(url));

  const content = [
    row(trans.about.project,     APP_INFO.name),
    row(trans.about.version,     `v${APP_INFO.version}`),
    row(trans.about.description, APP_INFO.fullDescription),
    '',
    link(trans.about.github,     APP_INFO.repository),
    link(trans.about.website,    URLS.homepage),
    link(trans.about.email,      URLS.email),
    '',
    row(trans.about.license,     `MIT  ${pickIcon('·', '|')}  ${trans.about.author}: m1ngsama`),
  ].join('\n');

  note(content, trans.about.title);
}

export async function showSettingsMenu(): Promise<void> {
  while (true) {
    const trans = t();
    const prefs = loadPreferences();
    const currentLang = getCurrentLanguage();

    const action = await select({
      message: trans.theme.chooseAction,
      options: [
        { value: 'language', label: trans.language.selectLanguage.replace(':', ''), hint: currentLang === 'zh' ? trans.language.zh : trans.language.en },
        { value: 'icon',     label: trans.theme.iconMode,  hint: prefs.iconMode },
        { value: 'color',    label: trans.theme.colorMode, hint: prefs.colorMode },
        { value: 'reset',    label: trans.theme.reset },
        { value: 'about',    label: trans.about.title },
        { value: 'back',     label: chalk.dim(trans.common.back) },
      ],
    });

    if (isCancel(action) || action === 'back') return;

    if (action === 'about') {
      showAbout();
      continue;
    }

    if (action === 'language') {
      const language = await select<Language>({
        message: trans.language.selectLanguage,
        options: [
          { value: 'zh' as Language, label: trans.language.zh, hint: currentLang === 'zh' ? trans.common.current : undefined },
          { value: 'en' as Language, label: trans.language.en, hint: currentLang === 'en' ? trans.common.current : undefined },
        ],
        initialValue: currentLang,
      });
      if (isCancel(language)) continue;
      if (language !== currentLang) {
        const saved = setLanguage(language);
        clearTranslationCache();
        notifyResult(saved, t().language.changed, t().language.changedSessionOnly);
      }
      continue;
    }

    if (action === 'icon') {
      const mode = await select<IconMode>({
        message: trans.theme.chooseIconMode,
        options: [
          { value: 'auto',    label: trans.theme.modeAuto,    hint: prefs.iconMode === 'auto' ? trans.common.current : undefined },
          { value: 'ascii',   label: trans.theme.modeAscii,   hint: prefs.iconMode === 'ascii' ? trans.common.current : undefined },
          { value: 'unicode', label: trans.theme.modeUnicode, hint: prefs.iconMode === 'unicode' ? trans.common.current : undefined },
        ],
        initialValue: prefs.iconMode,
      });
      if (isCancel(mode)) continue;
      const saved = setIconMode(mode);
      resetIconCache();
      notifyResult(saved, trans.theme.updated, trans.theme.updatedSessionOnly);
      continue;
    }

    if (action === 'color') {
      const mode = await select<ColorMode>({
        message: trans.theme.chooseColorMode,
        options: [
          { value: 'auto', label: trans.theme.modeAuto, hint: prefs.colorMode === 'auto' ? trans.common.current : undefined },
          { value: 'on',   label: trans.theme.modeOn,   hint: prefs.colorMode === 'on' ? trans.common.current : undefined },
          { value: 'off',  label: trans.theme.modeOff,  hint: prefs.colorMode === 'off' ? trans.common.current : undefined },
        ],
        initialValue: prefs.colorMode,
      });
      if (isCancel(mode)) continue;
      const saved = setColorMode(mode);
      applyColorModePreference(false);
      notifyResult(saved, trans.theme.updated, trans.theme.updatedSessionOnly);
      continue;
    }

    if (action === 'reset') {
      const saved = resetPreferences();
      resetIconCache();
      applyColorModePreference(false);
      notifyResult(saved, trans.theme.reset, trans.theme.resetSessionOnly);
    }
  }
}
