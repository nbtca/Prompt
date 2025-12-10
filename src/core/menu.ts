/**
 * Minimalist menu system
 * Six core feature menus
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { showCalendar } from '../features/calendar.js';
import { openRepairService } from '../features/repair.js';
import { showDocsMenu } from '../features/docs.js';
import { openHomepage, openGithub } from '../features/website.js';
import { printDivider, printNewLine } from './ui.js';
import { APP_INFO, URLS } from '../config/data.js';
import { t, getCurrentLanguage, setLanguage, clearTranslationCache, type Language } from '../i18n/index.js';

/**
 * Get main menu options
 */
function getMainMenuOptions() {
  const trans = t();
  return [
    {
      name: '[*] ' + trans.menu.events.padEnd(16) + ' ' + chalk.gray(trans.menu.eventsDesc),
      value: 'events',
      short: trans.menu.events
    },
    {
      name: '[*] ' + trans.menu.repair.padEnd(16) + ' ' + chalk.gray(trans.menu.repairDesc),
      value: 'repair',
      short: trans.menu.repair
    },
    {
      name: '[*] ' + trans.menu.docs.padEnd(16) + ' ' + chalk.gray(trans.menu.docsDesc),
      value: 'docs',
      short: trans.menu.docs
    },
    {
      name: '[*] ' + trans.menu.website.padEnd(16) + ' ' + chalk.gray(trans.menu.websiteDesc),
      value: 'website',
      short: trans.menu.website
    },
    {
      name: '[*] ' + trans.menu.github.padEnd(16) + ' ' + chalk.gray(trans.menu.githubDesc),
      value: 'github',
      short: trans.menu.github
    },
    {
      name: '[?] ' + trans.menu.about.padEnd(16) + ' ' + chalk.gray(trans.menu.aboutDesc),
      value: 'about',
      short: trans.menu.about
    },
    {
      name: '[⚙] ' + trans.menu.language.padEnd(16) + ' ' + chalk.gray(trans.menu.languageDesc),
      value: 'language',
      short: trans.menu.language
    },
    new inquirer.Separator(' '),
    {
      name: chalk.dim('[x] ' + trans.common.exit),
      value: 'exit',
      short: trans.common.exit
    }
  ];
}

/**
 * Display main menu
 */
export async function showMainMenu(): Promise<void> {
  while (true) {
    try {
      const trans = t();

      // Show keybinding hints
      console.log(chalk.dim('  ' + trans.menu.navigationHint));
      console.log();

      const { action } = await inquirer.prompt<{ action: string }>([
        {
          type: 'list',
          name: 'action',
          message: trans.menu.chooseAction,
          choices: getMainMenuOptions(),
          pageSize: 15,
          loop: false
        } as any
      ]);

      // Handle user selection
      if (action === 'exit') {
        console.log();
        console.log(chalk.dim(trans.common.goodbye));
        process.exit(0);
      }

      await handleAction(action);

      // Show divider after operation
      printNewLine();
      printDivider();
      printNewLine();
    } catch (err: any) {
      // Handle Ctrl+C exit
      if (err.message?.includes('User force closed')) {
        console.log();
        console.log(chalk.dim(t().common.goodbye));
        process.exit(0);
      }
      throw err;
    }
  }
}

/**
 * Handle user action
 */
async function handleAction(action: string): Promise<void> {
  switch (action) {
    case 'events':
      await showCalendar();
      break;

    case 'repair':
      await openRepairService();
      break;

    case 'docs':
      await showDocsMenu();
      break;

    case 'website':
      await openHomepage();
      break;

    case 'github':
      await openGithub();
      break;

    case 'about':
      showAbout();
      break;

    case 'language':
      await showLanguageMenu();
      break;

    default:
      console.log(chalk.gray('Unknown action'));
  }
}

/**
 * Display about information
 */
function showAbout(): void {
  const trans = t();
  console.log();
  console.log(chalk.bold('>> ' + trans.about.title));
  console.log();
  console.log(chalk.dim(trans.about.project.padEnd(12)) + APP_INFO.name);
  console.log(chalk.dim(trans.about.version.padEnd(12)) + `v${APP_INFO.version}`);
  console.log(chalk.dim(trans.about.description.padEnd(12)) + APP_INFO.fullDescription);
  console.log();
  console.log(chalk.dim(trans.about.github.padEnd(12)) + chalk.cyan(APP_INFO.repository));
  console.log(chalk.dim(trans.about.website.padEnd(12)) + chalk.cyan(URLS.homepage));
  console.log(chalk.dim(trans.about.email.padEnd(12)) + chalk.cyan(URLS.email));
  console.log();
  console.log(chalk.dim(trans.about.features));
  console.log('  ' + trans.about.feature1);
  console.log('  ' + trans.about.feature2);
  console.log('  ' + trans.about.feature3);
  console.log('  ' + trans.about.feature4);
  console.log();
  console.log(chalk.dim(trans.about.license.padEnd(12)) + 'MIT License');
  console.log(chalk.dim(trans.about.author.padEnd(12)) + 'm1ngsama');
  console.log();
}

/**
 * Display language selection menu
 */
async function showLanguageMenu(): Promise<void> {
  const trans = t();
  const currentLang = getCurrentLanguage();

  console.log();
  console.log(chalk.bold('>> ' + trans.language.title));
  console.log();
  console.log(chalk.dim(trans.language.currentLanguage + ': ') + chalk.cyan(trans.language[currentLang]));
  console.log();

  const { language } = await inquirer.prompt<{ language: Language }>([
    {
      type: 'list',
      name: 'language',
      message: trans.language.selectLanguage,
      choices: [
        { name: trans.language.zh, value: 'zh' as Language },
        { name: trans.language.en, value: 'en' as Language }
      ],
      default: currentLang
    }
  ]);

  if (language !== currentLang) {
    setLanguage(language);
    clearTranslationCache();
    console.log();
    console.log(chalk.green('✓ ' + t().language.changed));
    console.log();
  }
}

