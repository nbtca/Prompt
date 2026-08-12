import type { AppContext, View } from '../view.js';
import { ListField } from '../fields/list-field.js';
import { renderSettings, type SettingsViewState } from './settings-render.js';
import {
  applyColorModePreference,
  loadPreferences,
  resetPreferences,
  setColorMode,
  setIconMode,
  type ColorMode,
  type IconMode,
} from '../../config/preferences.js';
import { resetIconCache, pickIcon } from '../../core/icons.js';
import { APP_INFO, URLS } from '../../config/data.js';
import {
  t,
  getCurrentLanguage,
  saveLanguagePreference,
  clearTranslationCache,
  type Language,
} from '../../i18n/index.js';
import { padEndV } from '../../core/text.js';
import { resetCapabilities } from '../../core/capabilities.js';

let state: SettingsViewState = { mode: 'menu' };

function currentHint(current: boolean, hint: string): { hint?: string } {
  return current ? { hint } : {};
}

function buildMenuField(statusMessage?: string): SettingsViewState {
  const trans = t();
  const prefs = loadPreferences();
  const currentLang = getCurrentLanguage();
  const options = [
    {
      value: 'language',
      label: trans.language.selectLanguage,
      hint: currentLang === 'zh' ? trans.language.zh : trans.language.en,
    },
    { value: 'icon', label: trans.theme.iconMode, hint: prefs.iconMode },
    { value: 'color', label: trans.theme.colorMode, hint: prefs.colorMode },
    { value: 'reset', label: trans.theme.resetLabel },
    { value: 'about', label: trans.about.title },
  ];
  return {
    mode: 'menu',
    ...(statusMessage === undefined ? {} : { statusMessage }),
    menuField: new ListField({ title: trans.theme.chooseAction, options }),
  };
}

function goToMenu(statusMessage?: string): void {
  state = buildMenuField(statusMessage);
}

export const settingsView = {
  id: 'settings',
  title: t().menu.settings,

  load(): Promise<void> {
    goToMenu();
    return Promise.resolve();
  },

  render(ctx: AppContext): string[] {
    return renderSettings(state, ctx.bodyRows, ctx.size.cols);
  },

  capturesInput(): boolean {
    return false;
  },

  capturesPageKeys(): boolean {
    return state.mode !== 'about';
  },

  handleBack(): boolean {
    if (state.mode !== 'menu') {
      goToMenu();
      return true;
    }
    return false;
  },

  handleKey(key: string): void {
    const trans = t();
    switch (state.mode) {
      case 'menu': {
        const result = state.menuField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === 'language') {
          const currentLang = getCurrentLanguage();
          const options = [
            {
              value: 'zh',
              label: trans.language.zh,
              ...currentHint(currentLang === 'zh', trans.common.current),
            },
            {
              value: 'en',
              label: trans.language.en,
              ...currentHint(currentLang === 'en', trans.common.current),
            },
          ];
          state = {
            mode: 'language',
            subField: new ListField({
              title: trans.language.selectLanguage,
              options,
              initialIndex: currentLang === 'en' ? 1 : 0,
            }),
          };
          return;
        }
        if (result.selected === 'icon') {
          const prefs = loadPreferences();
          const options = [
            {
              value: 'auto',
              label: trans.theme.modeAuto,
              ...currentHint(prefs.iconMode === 'auto', trans.common.current),
            },
            {
              value: 'ascii',
              label: trans.theme.modeAscii,
              ...currentHint(prefs.iconMode === 'ascii', trans.common.current),
            },
            {
              value: 'unicode',
              label: trans.theme.modeUnicode,
              ...currentHint(prefs.iconMode === 'unicode', trans.common.current),
            },
          ];
          const idx = Math.max(
            0,
            options.findIndex((o) => o.value === prefs.iconMode),
          );
          state = {
            mode: 'icon',
            subField: new ListField({
              title: trans.theme.chooseIconMode,
              options,
              initialIndex: idx,
            }),
          };
          return;
        }
        if (result.selected === 'color') {
          const prefs = loadPreferences();
          const options = [
            {
              value: 'auto',
              label: trans.theme.modeAuto,
              ...currentHint(prefs.colorMode === 'auto', trans.common.current),
            },
            {
              value: 'on',
              label: trans.theme.modeOn,
              ...currentHint(prefs.colorMode === 'on', trans.common.current),
            },
            {
              value: 'off',
              label: trans.theme.modeOff,
              ...currentHint(prefs.colorMode === 'off', trans.common.current),
            },
          ];
          const idx = Math.max(
            0,
            options.findIndex((o) => o.value === prefs.colorMode),
          );
          state = {
            mode: 'color',
            subField: new ListField({
              title: trans.theme.chooseColorMode,
              options,
              initialIndex: idx,
            }),
          };
          return;
        }
        if (result.selected === 'reset') {
          const saved = resetPreferences();
          resetIconCache();
          applyColorModePreference(false);
          resetCapabilities();
          goToMenu(saved ? trans.theme.reset : trans.theme.resetSessionOnly);
          return;
        }
        if (result.selected === 'about') {
          const pad = 12;
          const row = (label: string, value: string) => `${padEndV(label, pad)}${value}`;
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
              row(
                trans.about.license,
                `MIT  ${pickIcon('·', '-')}  ${trans.about.author}: m1ngsama`,
              ),
            ],
            backField: new ListField({
              title: trans.about.title,
              options: [{ value: '__back__', label: trans.common.back }],
            }),
          };
        }
        return;
      }
      case 'language': {
        const result = state.subField?.handleKey(key);
        if (!result?.selected) return;
        const currentLang = getCurrentLanguage();
        if (result.selected !== currentLang) {
          const saved = saveLanguagePreference(result.selected as Language);
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
        resetCapabilities();
        goToMenu(saved ? trans.theme.updated : trans.theme.updatedSessionOnly);
        return;
      }
      case 'color': {
        const result = state.subField?.handleKey(key);
        if (!result?.selected) return;
        const saved = setColorMode(result.selected as ColorMode);
        applyColorModePreference(false);
        resetCapabilities();
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
} satisfies View;
