/**
 * Minimalist UI component library
 * Delegates to self-rendered widgets for terminal output
 */

import { success, error, warning, info } from './components/messages.js';
import { startSpinner } from './components/spinner.js';
import chalk from 'chalk';
import { pickIcon } from './icons.js';
import { t } from '../i18n/index.js';

export { success, error, warning, info };

/**
 * Display divider line
 */
export function printDivider(): void {
  const terminalWidth = process.stdout.columns || 80;
  const dividerChar = pickIcon('─', '-');
  console.log(chalk.dim(dividerChar.repeat(Math.min(terminalWidth, 80))));
}

/**
 * Clear screen
 */
export function clearScreen(): void {
  if (process.stdout.isTTY) {
    console.clear();
  }
}

/**
 * Print empty lines
 */
export function printNewLine(count: number = 1): void {
  for (let i = 0; i < count; i++) {
    console.log();
  }
}

/**
 * Create and start a real async spinner.
 * Caller is responsible for calling .stop(msg) or .stop(msg, 1) on error.
 */
export function createSpinner(msg: string) {
  return startSpinner(msg);
}

export function handleGracefulExit(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err ?? '');
  if (message.includes('SIGINT') || message.includes('User force closed')) {
    console.log();
    console.log(chalk.dim(t().common.goodbye));
    process.exit(0);
  }
  if (message) {
    console.error(message);
  } else {
    console.error('Error occurred:', err);
  }
  process.exit(1);
}
