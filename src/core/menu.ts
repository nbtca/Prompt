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

/**
 * Get main menu options with emoji icons and hint text
 */
function getMainMenuOptions() {
  const trans = t();
  return [
    { value: 'events',   label: '🗓   ' + trans.menu.events,   hint: trans.menu.eventsDesc },
    { value: 'repair',   label: '🔧   ' + trans.menu.repair,   hint: trans.menu.repairDesc },
    { value: 'docs',     label: '📚   ' + trans.menu.docs,     hint: trans.menu.docsDesc },
    { value: 'website',  label: '🌐   ' + trans.menu.website,  hint: trans.menu.websiteDesc },
    { value: 'github',   label: '🐙   ' + trans.menu.github,   hint: trans.menu.githubDesc },
    { value: 'roadmap',  label: '🗺   ' + trans.menu.roadmap,  hint: trans.menu.roadmapDesc },
    { value: 'about',    label: 'ℹ️    ' + trans.menu.about,    hint: trans.menu.aboutDesc },
    { value: 'language', label: '🌍   ' + trans.menu.language, hint: trans.menu.languageDesc },
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
  const content = [
    `${chalk.dim(trans.about.project.padEnd(12))}${APP_INFO.name}`,
    `${chalk.dim(trans.about.version.padEnd(12))}v${APP_INFO.version}`,
    `${chalk.dim(trans.about.description.padEnd(12))}${APP_INFO.fullDescription}`,
    '',
    `${chalk.dim(trans.about.github.padEnd(12))}${chalk.cyan(APP_INFO.repository)}`,
    `${chalk.dim(trans.about.website.padEnd(12))}${chalk.cyan(URLS.homepage)}`,
    `${chalk.dim(trans.about.email.padEnd(12))}${chalk.cyan(URLS.email)}`,
    '',
    chalk.dim(trans.about.features),
    '  ' + trans.about.feature1,
    '  ' + trans.about.feature2,
    '  ' + trans.about.feature3,
    '  ' + trans.about.feature4,
    '',
    `${chalk.dim(trans.about.license.padEnd(12))}MIT License`,
    `${chalk.dim(trans.about.author.padEnd(12))}m1ngsama`,
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
