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
import { padEndV } from './text.js';
import { APP_INFO, URLS } from '../config/data.js';
import { t, getCurrentLanguage, setLanguage, clearTranslationCache, type Language } from '../i18n/index.js';

export type MenuAction = 'events' | 'repair' | 'docs' | 'links' | 'website' | 'github' | 'roadmap' | 'about' | 'language';

/**
 * Get main menu options — 6 items
 */
function getMainMenuOptions() {
  const trans = t();
  return [
    { value: 'events',   label: trans.menu.events,   hint: trans.menu.eventsDesc },
    { value: 'repair',   label: trans.menu.repair,   hint: trans.menu.repairDesc },
    { value: 'docs',     label: trans.menu.docs,     hint: trans.menu.docsDesc },
    { value: 'links',    label: trans.menu.links,    hint: trans.menu.linksDesc },
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
    case 'links':    await showLinksMenu();      break;
    case 'website':  await openHomepage();       break;
    case 'github':   await openGithub();         break;
    case 'roadmap':  await openRoadmap();        break;
    case 'about':    showAbout();                break;
    case 'language': await showLanguageMenu();   break;
  }
}

/**
 * Links submenu — website, GitHub, roadmap
 */
async function showLinksMenu(): Promise<void> {
  const trans = t();

  const link = await select({
    message: trans.menu.chooseLink,
    options: [
      { value: 'website', label: trans.menu.website, hint: 'nbtca.space' },
      { value: 'github',  label: 'GitHub',           hint: 'github.com/nbtca' },
      { value: 'roadmap', label: trans.menu.roadmap, hint: trans.menu.roadmapDesc },
    ],
  });

  if (isCancel(link)) return;

  switch (link) {
    case 'website': await openHomepage(); break;
    case 'github':  await openGithub();  break;
    case 'roadmap': await openRoadmap(); break;
  }
}

/**
 * Display about information using clack note() box
 */
function showAbout(): void {
  const trans = t();
  const pad  = 12;
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
    row(trans.about.license,     'MIT  ·  Author: m1ngsama'),
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
