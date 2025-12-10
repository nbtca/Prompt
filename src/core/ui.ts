/**
 * Minimalist UI component library
 * Provides basic terminal UI components
 */

import chalk from 'chalk';

/**
 * Display header title
 */
export function printHeader(title: string): void {
  console.log(chalk.dim(title));
  console.log();
}

/**
 * Display divider line
 */
export function printDivider(): void {
  const terminalWidth = process.stdout.columns || 80;
  console.log(chalk.dim('─'.repeat(Math.min(terminalWidth, 80))));
}

/**
 * Display loading spinner
 */
export async function showSpinner(text: string, duration: number): Promise<void> {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const startTime = Date.now();

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      process.stdout.write(`\r${chalk.cyan(frames[i])} ${text}`);
      i = (i + 1) % frames.length;

      if (Date.now() - startTime >= duration) {
        clearInterval(interval);
        process.stdout.write('\r' + ' '.repeat(text.length + 5) + '\r');
        resolve();
      }
    }, 80);
  });
}

/**
 * Display success message
 */
export function success(msg: string): void {
  console.log(chalk.green('[✓]') + ' ' + msg);
}

/**
 * Display error message
 */
export function error(msg: string): void {
  console.log(chalk.red('[✗]') + ' ' + msg);
}

/**
 * Display info message
 */
export function info(msg: string): void {
  console.log(chalk.blue('[ℹ]') + ' ' + msg);
}

/**
 * Display warning message
 */
export function warning(msg: string): void {
  console.log(chalk.yellow('[⚠]') + ' ' + msg);
}

/**
 * Clear screen
 */
export function clearScreen(): void {
  console.clear();
}

/**
 * Print empty lines
 */
export function printNewLine(count: number = 1): void {
  for (let i = 0; i < count; i++) {
    console.log();
  }
}

