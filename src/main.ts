/**
 * NBTCA Welcome Tool
 * Minimalist startup flow
 */

import chalk from 'chalk';
import { printLogo } from './core/logo.js';
import { printHeader, clearScreen } from './core/ui.js';
import { showMainMenu } from './core/menu.js';
import { APP_INFO } from './config/data.js';
import { enableVimKeys } from './core/vim-keys.js';

/**
 * Main program entry point
 */
export async function main(): Promise<void> {
  try {
    // Enable Vim key bindings
    enableVimKeys();

    // Clear screen
    clearScreen();

    // Display logo (smart fallback)
    await printLogo();

    // Display version info
    printHeader(`v${APP_INFO.version}`);

    // Show main menu (loop)
    await showMainMenu();

  } catch (err: any) {
    // Handle Ctrl+C exit
    if (err.message?.includes('SIGINT') || err.message?.includes('User force closed')) {
      console.log();
      console.log(chalk.dim('Goodbye!'));
      process.exit(0);
    } else {
      console.error('Error occurred:', err);
      process.exit(1);
    }
  }
}
