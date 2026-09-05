import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import type englishTranslationSchema from './locales/en.json';
import { getConfigDir, getWritableConfigDir } from '../config/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type Language = 'zh' | 'en';

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
    moreAbove: string;
    moreBelow: string;
  };
  menu: {
    events: string;
    eventsDesc: string;
    docs: string;
    docsDesc: string;
    status: string;
    statusDesc: string;
    timetable: string;
    timetableDesc: string;
    links: string;
    linksDesc: string;
    settings: string;
    settingsDesc: string;
    chooseAction: string;
    hintMove: string;
    hintOpen: string;
    hintQuit: string;
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
    stale: string;
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
    heatmap: {
      title: string;
      legendLess: string;
      legendMore: string;
    };
    pastLoading: string;
    pastEvents: string;
    pastEventsDesc: string;
    noPastEvents: string;
    viewPastDetail: string;
    next: string;
    recentActivity: string;
    startingNow: string;
    thisWeek: string;
    thisMonth: string;
    search: string;
    searchPrompt: string;
    searchPlaceholder: string;
    searchNoResults: string;
    exportIcs: string;
    exportSuccess: string;
    exportError: string;
    recurringLabel: string;
    inPrefix: string;
  };
  docs: {
    loading: string;
    loadingDir: string;
    categoryAbout: string;
    categoryGuide: string;
    categoryRepairLogs: string;
    categoryEvents: string;
    categoryConcepts: string;
    categoryRepair: string;
    categoryArchived: string;
    categoryReadme: string;
    overviewLabel: string;
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
    tocTitle: string;
    tableHint: string;
    mermaidHint: string;
    readerLinksTitle: string;
    readerLinksHint: string;
    readerNoLinks: string;
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
    openManually: string;
  };
  status: {
    checking: string;
    summaryOk: string;
    summaryFail: string;
    summaryIntranet: string;
    service: string;
    health: string;
    code: string;
    latency: string;
    url: string;
    up: string;
    down: string;
    groupNbtca: string;
    groupExternal: string;
    groupIntranet: string;
    serviceHomepage: string;
    serviceDocs: string;
    serviceIcal: string;
    serviceRepair: string;
    serviceGithub: string;
    serviceRoadmap: string;
    serviceCloud: string;
    serviceMirror: string;
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
  timetable: {
    menuTitle: string;
    actionExport: string;
    actionTerms: string;
    actionLogin: string;
    actionLogout: string;
    actionStatus: string;
    termPrompt: string;
    termPromptHint: string;
    unknownCommand: string;
    loggedOut: string;
    savedStatus: string;
    noSavedStatus: string;
    loginSaved: string;
    loginOneShot: string;
    loginWillSave: string;
    sessionRefreshFailed: string;
    candidateTerms: string;
    semesterNumber: string;
    expiredRelogin: string;
    studentId: string;
    studentIdHint: string;
    password: string;
    passwordHint: string;
    weekOne: string;
    weekOneHint: string;
    exported: string;
    warnings: string;
    unresolvedPractice: string;
    calendarName: string;
    invalidOption: string;
    invalidArguments: string;
    noSession: string;
    invalidCredentials: string;
    accountLocked: string;
    accountInactive: string;
    challenge: string;
    sessionExpired: string;
    timeout: string;
    network: string;
    untrustedUrl: string;
    httpError: string;
    loginChanged: string;
    unexpectedResponse: string;
    missingDates: string;
    missingPeriod: string;
    termMismatch: string;
    invalidData: string;
    unknownTerm: string;
    noTerms: string;
    currentTermUnknown: string;
    genericError: string;
    hubToday: string;
    hubWeek: string;
    hubSwitchTerm: string;
    hubExport: string;
    hubLogout: string;
    hubUnresolved: string;
    unresolvedTitle: string;
    unresolvedEmpty: string;
    unresolvedUnknownItem: string;
    nextClass: string;
    noClassToday: string;
    noNextClass: string;
    nowLabel: string;
    weekLabel: string;
    promptWeekOne: string;
    menuEntry: string;
    semester1: string;
    semester2: string;
    weekLabel2: string;
    academicYearSuffix: string;
    onBreak: string;
    publicUnavailable: string;
    daysUntilBreak: string;
    publicLoginAction: string;
    publicLoginHint: string;
    weekOneAutoFailed: string;
    weekdayMon: string;
    weekdayTue: string;
    weekdayWed: string;
    weekdayThu: string;
    weekdayFri: string;
    weekdaySat: string;
    weekdaySun: string;
    todayHeading: string;
    classDone: string;
    classLive: string;
    minutesRemaining: string;
    timelineEnd: string;
    termNotStarted: string;
    termStartsIn: string;
    hubTermDensity: string;
    termDensityTitle: string;
    termDensityThisWeek: string;
    weekOverviewTitle: string;
    weekAheadClasses: string;
    weekAheadBusy: string;
    weekAheadFree: string;
    weekAheadNone: string;
    termPreviewWeek: string;
    hubFullGrid: string;
    detailTime: string;
    detailLocation: string;
    detailTeacher: string;
    detailWeeks: string;
    teacherSeparator: string;
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
    resetLabel: string;
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
    cmdSchedule: string;
    flagVersion: string;
    flagHelp: string;
    flagOpen: string;
    flagJson: string;
    flagToday: string;
    flagWeek: string;
    flagMonth: string;
    flagSearch: string;
    flagNext: string;
    flagWatch: string;
    flagInterval: string;
    flagTimeout: string;
    flagRetries: string;
    flagHeatmap: string;
    flagPlain: string;
    flagNoLogo: string;
    flagOneShot: string;
    flagNoSave: string;
    flagTerm: string;
    flagOutput: string;
    flagWeekOne: string;
    unknownCommand: string;
    unknownCommandHint: string;
    unknownFlag: string;
    unknownFlagHint: string;
    invalidFlag: string;
    invalidFlagHint: string;
    invalidLang: string;
    invalidNext: string;
    eventsHeatmapConflict: string;
    eventsRangeConflict: string;
    unexpectedArguments: string;
    requiresTty: string;
    requiresTtyHint: string;
  };
}

type TranslationSchema = typeof englishTranslationSchema;
type TranslationNode = string | TranslationObject;

interface TranslationObject {
  [key: string]: TranslationNode;
}

const unsafeTranslationKeys = new Set(['__proto__', 'constructor', 'prototype']);

function childPath(parent: string, key: string): string {
  return `${parent}.${key}`;
}

function assertTranslationNode(value: unknown, pathName: string): asserts value is TranslationNode {
  if (typeof value === 'string') return;
  assertTranslationObject(value, pathName);
}

function assertTranslationObject(
  value: unknown,
  pathName: string,
): asserts value is TranslationObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${pathName} must be a plain object`);
  }

  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${pathName} must be a plain object`);
  }

  for (const [key, child] of Object.entries(value)) {
    const currentPath = childPath(pathName, key);
    if (unsafeTranslationKeys.has(key)) {
      throw new TypeError(`${currentPath} uses an unsafe key`);
    }
    assertTranslationNode(child, currentPath);
  }
}

function assertMatchingTranslationShape(
  candidate: TranslationObject,
  reference: TranslationObject,
  pathName: string,
): void {
  for (const key of Object.keys(candidate)) {
    if (!Object.hasOwn(reference, key)) {
      throw new TypeError(`${childPath(pathName, key)} is not in the reference translation`);
    }
  }

  for (const key of Object.keys(reference)) {
    const currentPath = childPath(pathName, key);
    if (!Object.hasOwn(candidate, key)) {
      throw new TypeError(`${currentPath} is missing`);
    }

    const candidateNode = candidate[key];
    const referenceNode = reference[key];
    if (candidateNode === undefined || referenceNode === undefined) {
      throw new TypeError(`${currentPath} is missing`);
    }
    if (typeof candidateNode !== typeof referenceNode) {
      throw new TypeError(`${currentPath} has a mismatched leaf type`);
    }
    if (typeof candidateNode !== 'string' && typeof referenceNode !== 'string') {
      assertMatchingTranslationShape(candidateNode, referenceNode, currentPath);
    }
  }
}

export function validateTranslationShape(candidate: unknown, reference?: unknown): void {
  assertTranslationObject(candidate, 'translations');
  if (reference === undefined) return;

  assertTranslationObject(reference, 'reference');
  assertMatchingTranslationShape(candidate, reference, 'translations');
}

function assertTranslations(
  candidate: unknown,
  reference?: unknown,
): asserts candidate is TranslationSchema {
  validateTranslationShape(candidate, reference);
}

let currentLanguage: Language = 'zh';

function getLanguageConfigPath(): string {
  return path.join(getConfigDir(), 'language.json');
}

function getWritableLanguageConfigPath(): string {
  return path.join(getWritableConfigDir(), 'language.json');
}

export function loadLanguagePreference(): Language {
  try {
    const configPath = getLanguageConfigPath();
    const config: unknown = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (typeof config === 'object' && config !== null && 'language' in config) {
      const language: unknown = config.language;
      if (language === 'zh' || language === 'en') {
        currentLanguage = language;
      }
    }
  } catch {}
  return currentLanguage;
}

export function saveLanguagePreference(language: Language): boolean {
  setLanguage(language);
  try {
    const configPath = getWritableLanguageConfigPath();
    fs.writeFileSync(configPath, JSON.stringify({ language }, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function getCurrentLanguage(): Language {
  return currentLanguage;
}

export function setLanguage(language: Language): void {
  currentLanguage = language;
}

function parseTranslationFile(language: Language): unknown {
  const translationPath = path.join(__dirname, 'locales', `${language}.json`);
  const content = fs.readFileSync(translationPath, 'utf-8');
  return JSON.parse(content) as unknown;
}

function loadTranslations(): Record<Language, Translations> {
  const english = parseTranslationFile('en');
  assertTranslations(english);

  const chinese = parseTranslationFile('zh');
  assertTranslations(chinese, english);

  return { en: english, zh: chinese };
}

const translationsCache = new Map<Language, Translations>();

export function t(): Translations {
  const cached = translationsCache.get(currentLanguage);
  if (cached !== undefined) return cached;

  const translations = loadTranslations();
  translationsCache.set('en', translations.en);
  translationsCache.set('zh', translations.zh);
  return translations[currentLanguage];
}

export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const val = vars[key];
    return val !== undefined ? String(val) : `{${key}}`;
  });
}

export function clearTranslationCache(): void {
  translationsCache.clear();
}

loadLanguagePreference();
