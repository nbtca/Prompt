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
import { checkForUpdate } from './features/update.js';

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
      printLogo();
    }

    // Non-blocking update check (fire and forget, print before menu if resolved in time)
    const updatePromise = checkForUpdate();

    // Open session frame
    intro(chalk.cyan('NBTCA Prompt') + chalk.dim(` v${APP_INFO.version}`));

    // Show update notification if ready
    const updateMsg = await Promise.race([
      updatePromise,
      new Promise<null>(r => setTimeout(r, 500, null)),
    ]);
    if (updateMsg) console.log(chalk.yellow(updateMsg));

    // Show main menu (loop)
    await showMainMenu();

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err ?? '');
    if (message.includes('SIGINT') || message.includes('User force closed')) {
      console.log();
      console.log(chalk.dim(t().common.goodbye));
      process.exit(0);
    } else {
      console.error('Error occurred:', message || err);
      process.exit(1);
    }
  }
}
