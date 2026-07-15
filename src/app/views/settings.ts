import type { AppContext, View } from '../view.js';
import { ListField } from '../fields/list-field.js';
import { renderSettings, type SettingsViewState } from './settings-render.js';
import {
  applyColorModePreference, loadPreferences, resetPreferences, setColorMode, setIconMode,
  type ColorMode, type IconMode,
} from '../../config/preferences.js';
import { resetIconCache, pickIcon } from '../../core/icons.js';
import { APP_INFO, URLS } from '../../config/data.js';
import { t, getCurrentLanguage, setLanguage, clearTranslationCache, type Language } from '../../i18n/index.js';

let state: SettingsViewState = { mode: 'menu' };

function buildMenuField(statusMessage?: string): SettingsViewState {
  const trans = t();
  const prefs = loadPreferences();
  const currentLang = getCurrentLanguage();
  const options = [
    { value: 'language', label: trans.language.selectLanguage, hint: currentLang === 'zh' ? trans.language.zh : trans.language.en },
    { value: 'icon', label: trans.theme.iconMode, hint: prefs.iconMode },
    { value: 'color', label: trans.theme.colorMode, hint: prefs.colorMode },
    { value: 'reset', label: trans.theme.resetLabel },
    { value: 'about', label: trans.about.title },
  ];
  return { mode: 'menu', statusMessage, menuField: new ListField({ title: trans.theme.chooseAction, options }) };
}

function goToMenu(statusMessage?: string): void {
  state = buildMenuField(statusMessage);
}

export const settingsView: View = {
  id: 'settings',
  title: t().menu.settings,

  async load(_ctx: AppContext): Promise<void> {
    goToMenu();
  },

  render(_ctx: AppContext): string[] {
    return renderSettings(state);
  },

  capturesInput(): boolean {
    return false;
  },

  handleBack(): boolean {
    if (state.mode !== 'menu') {
      goToMenu();
      return true;
    }
    return false;
  },

  handleKey(key: string, _ctx: AppContext): void {
    const trans = t();
    switch (state.mode) {
      case 'menu': {
        const result = state.menuField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === 'language') {
          const currentLang = getCurrentLanguage();
          const options = [
            { value: 'zh', label: trans.language.zh, hint: currentLang === 'zh' ? trans.common.current : undefined },
            { value: 'en', label: trans.language.en, hint: currentLang === 'en' ? trans.common.current : undefined },
          ];
          state = { mode: 'language', subField: new ListField({ title: trans.language.selectLanguage, options, initialIndex: currentLang === 'en' ? 1 : 0 }) };
          return;
        }
        if (result.selected === 'icon') {
          const prefs = loadPreferences();
          const options = [
            { value: 'auto', label: trans.theme.modeAuto, hint: prefs.iconMode === 'auto' ? trans.common.current : undefined },
            { value: 'ascii', label: trans.theme.modeAscii, hint: prefs.iconMode === 'ascii' ? trans.common.current : undefined },
            { value: 'unicode', label: trans.theme.modeUnicode, hint: prefs.iconMode === 'unicode' ? trans.common.current : undefined },
          ];
          const idx = Math.max(0, options.findIndex((o) => o.value === prefs.iconMode));
          state = { mode: 'icon', subField: new ListField({ title: trans.theme.chooseIconMode, options, initialIndex: idx }) };
          return;
        }
        if (result.selected === 'color') {
          const prefs = loadPreferences();
          const options = [
            { value: 'auto', label: trans.theme.modeAuto, hint: prefs.colorMode === 'auto' ? trans.common.current : undefined },
            { value: 'on', label: trans.theme.modeOn, hint: prefs.colorMode === 'on' ? trans.common.current : undefined },
            { value: 'off', label: trans.theme.modeOff, hint: prefs.colorMode === 'off' ? trans.common.current : undefined },
          ];
          const idx = Math.max(0, options.findIndex((o) => o.value === prefs.colorMode));
          state = { mode: 'color', subField: new ListField({ title: trans.theme.chooseColorMode, options, initialIndex: idx }) };
          return;
        }
        if (result.selected === 'reset') {
          const saved = resetPreferences();
          resetIconCache();
          applyColorModePreference(false);
          goToMenu(saved ? trans.theme.reset : trans.theme.resetSessionOnly);
          return;
        }
        if (result.selected === 'about') {
          const pad = 12;
          const row = (label: string, value: string) => `${label.padEnd(pad)}${value}`;
          state = {
            mode: 'about',
            aboutLines: [
              row(trans.about.project, APP_INFO.name),
              row(trans.about.version, `v${APP_INFO.version}`),
              row(trans.about.description, trans.about.descriptionText),
              '',
              row(trans.about.github, APP_INFO.repository),
              row(trans.about.website, URLS.homepage),
              row(trans.about.email, URLS.email),
              '',
              row(trans.about.license, `MIT  ${pickIcon('·', '-')}  ${trans.about.author}: m1ngsama`),
            ],
            backField: new ListField({ title: trans.about.title, options: [{ value: '__back__', label: trans.common.back }] }),
          };
        }
        return;
      }
      case 'language': {
        const result = state.subField?.handleKey(key);
        if (!result?.selected) return;
        const currentLang = getCurrentLanguage();
        if (result.selected !== currentLang) {
          const saved = setLanguage(result.selected as Language);
          clearTranslationCache();
          goToMenu(saved ? t().language.changed : t().language.changedSessionOnly);
        } else {
          goToMenu();
        }
        return;
      }
      case 'icon': {
        const result = state.subField?.handleKey(key);
        if (!result?.selected) return;
        const saved = setIconMode(result.selected as IconMode);
        resetIconCache();
        goToMenu(saved ? trans.theme.updated : trans.theme.updatedSessionOnly);
        return;
      }
      case 'color': {
        const result = state.subField?.handleKey(key);
        if (!result?.selected) return;
        const saved = setColorMode(result.selected as ColorMode);
        applyColorModePreference(false);
        goToMenu(saved ? trans.theme.updated : trans.theme.updatedSessionOnly);
        return;
      }
      case 'about': {
        const result = state.backField?.handleKey(key);
        if (result?.selected === '__back__') goToMenu();
        return;
      }
      default:
        return;
    }
  },
};
