/**
 * Unified settings — language, theme, about
 */

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
import { runMenu } from '../core/components/menu.js';
import { note } from '../core/components/note.js';
import { glyph } from '../core/theme.js';

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
    row(trans.about.description, trans.about.descriptionText),
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
    const footer = `${glyph.updown()} ${trans.menu.hintMove}   ${glyph.enter()} ${trans.menu.hintOpen}   q ${trans.menu.hintQuit}`;

    const action = await runMenu({
      title: trans.theme.chooseAction,
      options: [
        { value: 'language', label: trans.language.selectLanguage, hint: currentLang === 'zh' ? trans.language.zh : trans.language.en },
        { value: 'icon',     label: trans.theme.iconMode,  hint: prefs.iconMode },
        { value: 'color',    label: trans.theme.colorMode, hint: prefs.colorMode },
        { value: 'reset',    label: trans.theme.resetLabel },
        { value: 'about',    label: trans.about.title },
      ],
      footer,
    });

    if (action === null) return;

    if (action === 'about') {
      showAbout();
      continue;
    }

    if (action === 'language') {
      const langOptions = [
        { value: 'zh', label: trans.language.zh, hint: currentLang === 'zh' ? trans.common.current : undefined },
        { value: 'en', label: trans.language.en, hint: currentLang === 'en' ? trans.common.current : undefined },
      ];
      const language = await runMenu({
        title: trans.language.selectLanguage,
        options: langOptions,
        footer,
        initialIndex: Math.max(0, langOptions.findIndex(o => o.value === currentLang)),
      });
      if (language === null) continue;
      if (language !== currentLang) {
        const saved = setLanguage(language as Language);
        clearTranslationCache();
        notifyResult(saved, t().language.changed, t().language.changedSessionOnly);
      }
      continue;
    }

    if (action === 'icon') {
      const iconOptions = [
        { value: 'auto',    label: trans.theme.modeAuto,    hint: prefs.iconMode === 'auto' ? trans.common.current : undefined },
        { value: 'ascii',   label: trans.theme.modeAscii,   hint: prefs.iconMode === 'ascii' ? trans.common.current : undefined },
        { value: 'unicode', label: trans.theme.modeUnicode, hint: prefs.iconMode === 'unicode' ? trans.common.current : undefined },
      ];
      const mode = await runMenu({
        title: trans.theme.chooseIconMode,
        options: iconOptions,
        footer,
        initialIndex: Math.max(0, iconOptions.findIndex(o => o.value === prefs.iconMode)),
      });
      if (mode === null) continue;
      const saved = setIconMode(mode as IconMode);
      resetIconCache();
      notifyResult(saved, trans.theme.updated, trans.theme.updatedSessionOnly);
      continue;
    }

    if (action === 'color') {
      const colorOptions = [
        { value: 'auto', label: trans.theme.modeAuto, hint: prefs.colorMode === 'auto' ? trans.common.current : undefined },
        { value: 'on',   label: trans.theme.modeOn,   hint: prefs.colorMode === 'on' ? trans.common.current : undefined },
        { value: 'off',  label: trans.theme.modeOff,  hint: prefs.colorMode === 'off' ? trans.common.current : undefined },
      ];
      const mode = await runMenu({
        title: trans.theme.chooseColorMode,
        options: colorOptions,
        footer,
        initialIndex: Math.max(0, colorOptions.findIndex(o => o.value === prefs.colorMode)),
      });
      if (mode === null) continue;
      const saved = setColorMode(mode as ColorMode);
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
