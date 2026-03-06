/**
 * Internationalization (i18n) System
 * Multi-language support for the application
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type Language = 'zh' | 'en';

/**
 * Translation structure
 */
export interface Translations {
  common: {
    back: string;
    exit: string;
    cancel: string;
    confirm: string;
    loading: string;
    error: string;
    success: string;
    goodbye: string;
  };
  menu: {
    title: string;
    events: string;
    eventsDesc: string;
    repair: string;
    repairDesc: string;
    docs: string;
    docsDesc: string;
    website: string;
    websiteDesc: string;
    github: string;
    githubDesc: string;
    roadmap: string;
    roadmapDesc: string;
    links: string;
    linksDesc: string;
    chooseLink: string;
    about: string;
    aboutDesc: string;
    status: string;
    statusDesc: string;
    language: string;
    languageDesc: string;
    theme: string;
    themeDesc: string;
    navigationHint: string;
    quickCommandHint: string;
    chooseAction: string;
  };
  about: {
    title: string;
    project: string;
    version: string;
    description: string;
    github: string;
    website: string;
    email: string;
    license: string;
    author: string;
  };
  calendar: {
    title: string;
    subtitle: string;
    loading: string;
    noEvents: string;
    error: string;
    errorHint: string;
    eventsFound: string;
    dateTime: string;
    eventName: string;
    location: string;
  };
  docs: {
    title: string;
    subtitle: string;
    loading: string;
    loadingDir: string;
    categoryTutorial: string;
    categoryRepairLogs: string;
    categoryEvents: string;
    categoryProcess: string;
    categoryRepair: string;
    categoryArchived: string;
    categoryReadme: string;
    chooseCategory: string;
    refreshCache: string;
    cacheCleared: string;
    usingCachedData: string;
    currentDir: string;
    chooseDoc: string;
    emptyDir: string;
    upToParent: string;
    returnToMenu: string;
    backToList: string;
    reread: string;
    openBrowser: string;
    loadError: string;
    errorHint: string;
    openBrowserPrompt: string;
    docCompleted: string;
    chooseAction: string;
    opening: string;
    browserOpened: string;
    browserError: string;
    browserErrorHint: string;
    retry: string;
    pagerNotAvailable: string;
    endOfDocument: string;
    terminalProfile: string;
    terminalSupport: string;
    terminalBasic: string;
    terminalEnhanced: string;
    terminalAdvanced: string;
    navigationHint: string;
    githubRateLimited: string;
    githubForbidden: string;
    githubTokenHint: string;
    fetchDirFailed: string;
    fetchFileFailed: string;
  };
  repair: {
    title: string;
    subtitle: string;
    opening: string;
    opened: string;
    error: string;
    errorHint: string;
  };
  website: {
    opening: string;
    opened: string;
    error: string;
    errorHint: string;
  };
  status: {
    checking: string;
    summaryOk: string;
    summaryFail: string;
    service: string;
    health: string;
    code: string;
    latency: string;
    url: string;
    up: string;
    down: string;
    watchStarted: string;
    watchUpdated: string;
    watchHint: string;
    invalidInterval: string;
    invalidTimeout: string;
    invalidRetries: string;
    watchRequiresTty: string;
    watchJsonConflict: string;
    intervalNeedsWatch: string;
  };
  theme: {
    current: string;
    chooseAction: string;
    chooseIconMode: string;
    chooseColorMode: string;
    modeAuto: string;
    modeAscii: string;
    modeUnicode: string;
    modeOn: string;
    modeOff: string;
    backToMenu: string;
    iconMode: string;
    colorMode: string;
    updated: string;
    updatedSessionOnly: string;
    reset: string;
    resetSessionOnly: string;
    usage: string;
    invalidValue: string;
  };
  language: {
    title: string;
    currentLanguage: string;
    selectLanguage: string;
    zh: string;
    en: string;
    changed: string;
    changedSessionOnly: string;
  };
}

/**
 * Language configuration
 */
let currentLanguage: Language = 'zh'; // Default to Chinese

/**
 * Get configuration directory path
 */
function getConfigDir(): string {
  const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || '';
  return path.join(homeDir, '.nbtca');
}

/**
 * Get language configuration file path
 */
function getLanguageConfigPath(): string {
  return path.join(getConfigDir(), 'language.json');
}

/**
 * Load language preference from config file
 */
export function loadLanguagePreference(): Language {
  try {
    const configPath = getLanguageConfigPath();
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.language === 'zh' || config.language === 'en') {
        currentLanguage = config.language;
      }
    }
  } catch (err) {
    // If loading fails, use default (Chinese)
  }
  return currentLanguage;
}

/**
 * Save language preference to config file
 */
export function saveLanguagePreference(language: Language): boolean {
  try {
    const configDir = getConfigDir();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const configPath = getLanguageConfigPath();
    fs.writeFileSync(configPath, JSON.stringify({ language }, null, 2));
    currentLanguage = language;
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Get current language
 */
export function getCurrentLanguage(): Language {
  return currentLanguage;
}

/**
 * Set current language
 */
export function setLanguage(language: Language): boolean {
  currentLanguage = language;
  return saveLanguagePreference(language);
}

/**
 * Load translation file
 */
function loadTranslations(language: Language): Translations {
  try {
    const translationPath = path.join(__dirname, 'locales', `${language}.json`);
    const content = fs.readFileSync(translationPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    // Fallback to Chinese if loading fails
    const fallbackPath = path.join(__dirname, 'locales', 'zh.json');
    const content = fs.readFileSync(fallbackPath, 'utf-8');
    return JSON.parse(content);
  }
}

/**
 * Translation cache
 */
let translationsCache: Map<Language, Translations> = new Map();

/**
 * Get translations for current language
 */
export function t(): Translations {
  if (!translationsCache.has(currentLanguage)) {
    translationsCache.set(currentLanguage, loadTranslations(currentLanguage));
  }
  return translationsCache.get(currentLanguage)!;
}

/**
 * Clear translation cache (useful when switching languages)
 */
export function clearTranslationCache(): void {
  translationsCache.clear();
}

// Initialize language preference on module load
loadLanguagePreference();
