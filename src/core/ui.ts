/**
 * Minimalist UI component library
 * Delegates to @clack/prompts for modern terminal output
 */

import { log, spinner as clackSpinner } from '@clack/prompts';
import chalk from 'chalk';
import { pickIcon } from './icons.js';

/**
 * Display success message
 */
export function success(msg: string): void {
  log.success(msg);
}

/**
 * Display error message
 */
export function error(msg: string): void {
  log.error(msg);
}

/**
 * Display info message
 */
export function info(msg: string): void {
  log.info(msg);
}

/**
 * Display warning message
 */
export function warning(msg: string): void {
  log.warn(msg);
}

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
  const s = clackSpinner();
  s.start(msg);
  return s;
}
