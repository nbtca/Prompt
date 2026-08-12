import { success, error, warning, info } from './components/messages.js';
import { startSpinner } from './components/spinner.js';
import chalk from 'chalk';
import { t } from '../i18n/index.js';
import { sanitizeTerminalLine } from './text.js';

export { success, error, warning, info };

export function clearScreen(): void {
  if (process.stdout.isTTY) {
    console.clear();
  }
}

export function createSpinner(msg: string) {
  return startSpinner(msg);
}

function errorMessage(errorValue: unknown): string {
  if (errorValue instanceof Error) return errorValue.message;
  if (typeof errorValue === 'string') return errorValue;
  if (
    typeof errorValue === 'number' ||
    typeof errorValue === 'boolean' ||
    typeof errorValue === 'bigint'
  ) {
    return String(errorValue);
  }
  return '';
}

export function handleGracefulExit(err: unknown): never {
  const message = sanitizeTerminalLine(errorMessage(err));
  if (message.includes('SIGINT') || message.includes('User force closed')) {
    console.log();
    console.log(chalk.dim(t().common.goodbye));
    process.exit(0);
  }
  if (message) {
    console.error(message);
  } else {
    console.error('An unexpected error occurred.');
  }
  process.exit(1);
}
