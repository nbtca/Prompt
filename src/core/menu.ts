/**
 * Minimalist menu system
 * Modern @clack/prompts select() with emoji icons and hint text
 */

import { select, isCancel, outro, note } from '@clack/prompts';
import chalk from 'chalk';
import { showCalendar } from '../features/calendar.js';
import { openRepairService } from '../features/repair.js';
import { showDocsMenu } from '../features/docs.js';
import { openHomepage, openGithub, openRoadmap } from '../features/website.js';
import { printDivider, printNewLine, success } from './ui.js';
import { APP_INFO, URLS } from '../config/data.js';
import { t, getCurrentLanguage, setLanguage, clearTranslationCache, type Language } from '../i18n/index.js';

export type MenuAction = 'events' | 'repair' | 'docs' | 'website' | 'github' | 'roadmap' | 'about' | 'language';

/** Visual column width: CJK characters count as 2. */
function visualWidth(str: string): number {
  let w = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0) ?? 0;
    w += (
      (cp >= 0x1100 && cp <= 0x115F) ||
      (cp >= 0x2E80 && cp <= 0x303F) ||
      (cp >= 0x3040 && cp <= 0x33FF) ||
      (cp >= 0x3400 && cp <= 0x4DBF) ||
      (cp >= 0x4E00 && cp <= 0x9FFF) ||
      (cp >= 0xAC00 && cp <= 0xD7AF) ||
      (cp >= 0xF900 && cp <= 0xFAFF) ||
      (cp >= 0xFE30 && cp <= 0xFE4F) ||
      (cp >= 0xFF00 && cp <= 0xFF60) ||
      (cp >= 0xFFE0 && cp <= 0xFFE6)
    ) ? 2 : 1;
  }
  return w;
}

/** Pad string to visual width. */
function padEndV(str: string, width: number): string {
  const pad = width - visualWidth(str);
  return pad > 0 ? str + ' '.repeat(pad) : str;
}

/**
 * Get main menu options — no emoji in labels to guarantee alignment
 */
function getMainMenuOptions() {
  const trans = t();
  return [
    { value: 'events',   label: trans.menu.events,   hint: trans.menu.eventsDesc },
    { value: 'repair',   label: trans.menu.repair,   hint: trans.menu.repairDesc },
    { value: 'docs',     label: trans.menu.docs,     hint: trans.menu.docsDesc },
    { value: 'website',  label: trans.menu.website,  hint: trans.menu.websiteDesc },
    { value: 'github',   label: trans.menu.github,   hint: trans.menu.githubDesc },
    { value: 'roadmap',  label: trans.menu.roadmap,  hint: trans.menu.roadmapDesc },
    { value: 'about',    label: trans.menu.about,    hint: trans.menu.aboutDesc },
    { value: 'language', label: trans.menu.language, hint: trans.menu.languageDesc },
  ];
}

/**
 * Display main menu — loops until user exits via Ctrl+C
 */
export async function showMainMenu(): Promise<void> {
  while (true) {
    const trans = t();

    const action = await select({
      message: trans.menu.chooseAction,
      options: getMainMenuOptions(),
    });

    if (isCancel(action)) {
      outro(chalk.dim(t().common.goodbye));
      process.exit(0);
    }

    await runMenuAction(action as MenuAction);

    printNewLine();
    printDivider();
    printNewLine();
  }
}

/**
 * Handle user action
 */
export async function runMenuAction(action: MenuAction): Promise<void> {
  switch (action) {
    case 'events':   await showCalendar();       break;
    case 'repair':   await openRepairService();  break;
    case 'docs':     await showDocsMenu();       break;
    case 'website':  await openHomepage();       break;
    case 'github':   await openGithub();         break;
    case 'roadmap':  await openRoadmap();        break;
    case 'about':    showAbout();                break;
    case 'language': await showLanguageMenu();   break;
  }
}

/**
 * Display about information using clack note() box
 */
function showAbout(): void {
  const trans = t();
  const pad = 12;
  const content = [
    `${chalk.dim(padEndV(trans.about.project, pad))}${APP_INFO.name}`,
    `${chalk.dim(padEndV(trans.about.version, pad))}v${APP_INFO.version}`,
    `${chalk.dim(padEndV(trans.about.description, pad))}${APP_INFO.fullDescription}`,
    '',
    `${chalk.dim(padEndV(trans.about.github, pad))}${chalk.cyan(APP_INFO.repository)}`,
    `${chalk.dim(padEndV(trans.about.website, pad))}${chalk.cyan(URLS.homepage)}`,
    `${chalk.dim(padEndV(trans.about.email, pad))}${chalk.cyan(URLS.email)}`,
    '',
    chalk.dim(trans.about.features),
    '  ' + trans.about.feature1,
    '  ' + trans.about.feature2,
    '  ' + trans.about.feature3,
    '  ' + trans.about.feature4,
    '',
    `${chalk.dim(padEndV(trans.about.license, pad))}MIT License`,
    `${chalk.dim(padEndV(trans.about.author, pad))}m1ngsama`,
  ].join('\n');

  note(content, trans.about.title);
}

/**
 * Display language selection menu
 */
async function showLanguageMenu(): Promise<void> {
  const trans = t();
  const currentLang = getCurrentLanguage();

  const language = await select<Language>({
    message: trans.language.selectLanguage,
    options: [
      { value: 'zh' as Language, label: trans.language.zh, hint: currentLang === 'zh' ? '✓ 当前' : undefined },
      { value: 'en' as Language, label: trans.language.en, hint: currentLang === 'en' ? '✓ current' : undefined },
    ],
    initialValue: currentLang,
  });

  if (isCancel(language)) return;

  if (language !== currentLang) {
    setLanguage(language);
    clearTranslationCache();
    success(t().language.changed);
  }
}
