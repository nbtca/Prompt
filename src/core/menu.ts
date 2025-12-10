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

/**
 * Main menu options
 */
const MAIN_MENU = [
  {
    name: '[*] Recent Events    ' + chalk.gray('View upcoming events in next 30 days'),
    value: 'events',
    short: 'Recent Events'
  },
  {
    name: '[*] Repair Service   ' + chalk.gray('Computer repair and software installation'),
    value: 'repair',
    short: 'Repair Service'
  },
  {
    name: '[*] Knowledge Base   ' + chalk.gray('Technical docs and tutorials'),
    value: 'docs',
    short: 'Knowledge Base'
  },
  {
    name: '[*] Official Website ' + chalk.gray('Visit NBTCA homepage'),
    value: 'website',
    short: 'Official Website'
  },
  {
    name: '[*] GitHub           ' + chalk.gray('Open source projects and code'),
    value: 'github',
    short: 'GitHub'
  },
  {
    name: '[?] About            ' + chalk.gray('Project info and help'),
    value: 'about',
    short: 'About'
  },
  new inquirer.Separator(' '),
  {
    name: chalk.dim('[x] Exit'),
    value: 'exit',
    short: 'Exit'
  }
];

/**
 * Display main menu
 */
export async function showMainMenu(): Promise<void> {
  while (true) {
    try {
      // Show keybinding hints
      console.log(chalk.dim('  Navigation: j/k or ↑/↓ | Jump: g/G | Quit: q or Ctrl+C'));
      console.log();

      const { action } = await inquirer.prompt<{ action: string }>([
        {
          type: 'list',
          name: 'action',
          message: 'Choose an action',
          choices: MAIN_MENU,
          pageSize: 15,
          loop: false
        } as any
      ]);

      // Handle user selection
      if (action === 'exit') {
        console.log();
        console.log(chalk.dim('Goodbye!'));
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
        console.log(chalk.dim('Goodbye!'));
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

    default:
      console.log(chalk.gray('Unknown action'));
  }
}

/**
 * Display about information
 */
function showAbout(): void {
  console.log();
  console.log(chalk.bold('>> About NBTCA'));
  console.log();
  console.log(chalk.dim('Project     ') + APP_INFO.name);
  console.log(chalk.dim('Version     ') + `v${APP_INFO.version}`);
  console.log(chalk.dim('Description ') + APP_INFO.fullDescription);
  console.log();
  console.log(chalk.dim('GitHub      ') + chalk.cyan(APP_INFO.repository));
  console.log(chalk.dim('Website     ') + chalk.cyan(URLS.homepage));
  console.log(chalk.dim('Email       ') + chalk.cyan(URLS.email));
  console.log();
  console.log(chalk.dim('Features:'));
  console.log('  - View recent association events');
  console.log('  - Online repair service');
  console.log('  - Technical knowledge base access');
  console.log('  - Quick access to website and GitHub');
  console.log();
  console.log(chalk.dim('License     ') + 'MIT License');
  console.log(chalk.dim('Author      ') + 'm1ngsama');
  console.log();
}
