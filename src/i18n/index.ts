/**
 * Internationalization (i18n) System
 * Multi-language support for the application
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getConfigDir, getWritableConfigDir } from '../config/paths.js';

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
    current: string;
  };
  menu: {
    events: string;
    eventsDesc: string;
    docs: string;
    docsDesc: string;
    status: string;
    statusDesc: string;
    links: string;
    linksDesc: string;
    settings: string;
    settingsDesc: string;
    chooseAction: string;
  };
  about: {
    title: string;
    project: string;
    version: string;
    description: string;
    descriptionText: string;
    github: string;
    website: string;
    email: string;
    license: string;
    author: string;
  };
  calendar: {
    loading: string;
    noEvents: string;
    error: string;
    errorHint: string;
    eventsFound: string;
    dateTime: string;
    eventName: string;
    location: string;
    untitledEvent: string;
    tbdLocation: string;
    subscribeHint: string;
    viewDetail: string;
    noDescription: string;
  };
  docs: {
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
    endOfDocument: string;
    githubRateLimited: string;
    githubForbidden: string;
    githubTokenHint: string;
    fetchDirFailed: string;
    fetchFileFailed: string;
    searchPrompt: string;
    searchPlaceholder: string;
    searching: string;
    searchResults: string;
    searchNoResults: string;
    loadingFile: string;
  };
  links: {
    choose: string;
    website: string;
    github: string;
    roadmap: string;
    repair: string;
    opening: string;
    opened: string;
    error: string;
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
    serviceWebsite: string;
    serviceDocs: string;
    serviceCalendar: string;
    serviceGithub: string;
    serviceRoadmap: string;
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
    selectLanguage: string;
    zh: string;
    en: string;
    changed: string;
    changedSessionOnly: string;
  };
  update: {
    available: string;
    upToDate: string;
    checkFailed: string;
    command: string;
  };
  cli: {
    usage: string;
    interactive: string;
    runCommand: string;
    commands: string;
    flags: string;
    cmdWebsite: string;
    cmdGithub: string;
    cmdRoadmap: string;
    cmdRepair: string;
    cmdTheme: string;
    cmdLang: string;
    cmdUpdate: string;
    flagVersion: string;
    flagHelp: string;
    flagOpen: string;
    flagJson: string;
    flagToday: string;
    flagNext: string;
    flagWatch: string;
    flagInterval: string;
    flagTimeout: string;
    flagRetries: string;
    flagPlain: string;
    flagNoLogo: string;
    unknownCommand: string;
    unknownCommandHint: string;
    unknownFlag: string;
    unknownFlagHint: string;
    invalidFlag: string;
    invalidFlagHint: string;
    invalidLang: string;
    invalidNext: string;
    requiresTty: string;
    requiresTtyHint: string;
  };
}

/**
 * Language configuration
 */
let currentLanguage: Language = 'zh'; // Default to Chinese

/**
 * Get language configuration file path (read, with legacy fallback)
 */
function getLanguageConfigPath(): string {
  return path.join(getConfigDir(), 'language.json');
}

/**
 * Get writable language configuration file path (XDG, creates dir)
 */
function getWritableLanguageConfigPath(): string {
  return path.join(getWritableConfigDir(), 'language.json');
}

/**
 * Load language preference from config file
 */
export function loadLanguagePreference(): Language {
  try {
    const configPath = getLanguageConfigPath();
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.language === 'zh' || config.language === 'en') {
      currentLanguage = config.language;
    }
  } catch {
    // If loading fails (file missing or invalid), use default (Chinese)
  }
  return currentLanguage;
}

/**
 * Save language preference to config file
 */
export function saveLanguagePreference(language: Language): boolean {
  try {
    const configPath = getWritableLanguageConfigPath();
    fs.writeFileSync(configPath, JSON.stringify({ language }, null, 2));
    currentLanguage = language;
    return true;
  } catch {
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

export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const val = vars[key];
    return val !== undefined ? String(val) : `{${key}}`;
  });
}

/**
 * Clear translation cache (useful when switching languages)
 */
export function clearTranslationCache(): void {
  translationsCache.clear();
}

// Initialize language preference on module load
loadLanguagePreference();
