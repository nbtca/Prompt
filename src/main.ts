/**
 * NBTCA Welcome Tool
 * Minimalist startup flow
 */

import chalk from 'chalk';
import { intro } from '@clack/prompts';
import { printLogo } from './core/logo.js';
import { clearScreen } from './core/ui.js';
import { showMainMenu } from './core/menu.js';
import { APP_INFO } from './config/data.js';
import { enableVimKeys } from './core/vim-keys.js';
import { t } from './i18n/index.js';

export interface MainOptions {
  skipLogo?: boolean;
}

/**
 * Main program entry point
 */
export async function main(options: MainOptions = {}): Promise<void> {
  try {
    // Enable Vim key bindings
    enableVimKeys();

    // Clear screen
    if (process.stdout.isTTY) {
      clearScreen();
    }

    // Display logo (smart fallback)
    if (!options.skipLogo) {
      await printLogo();
    }

    // Open session frame
    intro(chalk.cyan('NBTCA Prompt') + chalk.dim(` v${APP_INFO.version}`));

    // Show main menu (loop)
    await showMainMenu();

  } catch (err: any) {
    // Handle Ctrl+C exit
    if (err.message?.includes('SIGINT') || err.message?.includes('User force closed')) {
      console.log();
      console.log(chalk.dim(t().common.goodbye));
      process.exit(0);
    } else {
      console.error('Error occurred:', err);
      process.exit(1);
    }
  }
}
