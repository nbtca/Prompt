// Loading animation with various spinner styles.

import chalk from 'chalk';
import type { SpinnerType } from '../types.js';

type SpinnerChars = string[];

const spinners: Record<SpinnerType, SpinnerChars> = {
  dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  line: ['|', '/', '-', '\\'],
  arrow: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
  nbtca: ['⚡', '🚀', '💻', '🔧', '⚙️', '🎯', '🌟', '💡']
};

/**
 * Show a loading animation with custom text and duration.
 * @param text - Loading text to display.
 * @param duration - Duration in milliseconds.
 * @param spinnerType - Type of spinner animation.
 */
export async function showLoadingAnimation(text: string, duration: number = 2000, spinnerType: SpinnerType = 'nbtca'): Promise<void> {
  const spinner: SpinnerChars = spinners[spinnerType] || spinners.dots;
  const interval: number = 100;
  const steps: number = Math.floor(duration / interval);

  for (let i = 0; i < steps; i++) {
    const spinnerChar: string = spinner[i % spinner.length]!;
    const progress: number = Math.floor((i / steps) * 100);
    const progressBar: string = createProgressBar(progress, 20);

    process.stdout.write(`\r${chalk.cyan(spinnerChar)} ${text} ${progressBar} ${progress}%`);
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  process.stdout.write(`\r${chalk.green('✓')} ${text} ${createProgressBar(100, 20)} 100%\n`);
}

/**
 * Create a progress bar string.
 * @param percentage - Progress percentage (0-100).
 * @param width - Width of the progress bar.
 * @returns Progress bar string.
 */
function createProgressBar(percentage: number, width: number = 20): string {
  const filled: number = Math.floor((percentage / 100) * width);
  const empty: number = width - filled;

  const filledBar: string = '█'.repeat(filled);
  const emptyBar: string = '░'.repeat(empty);

  return `[${filledBar}${emptyBar}]`;
}

/**
 * Show a typing animation effect.
 * @param text - Text to type out.
 * @param speed - Typing speed in milliseconds per character.
 */
export async function showTypingAnimation(text: string, speed: number = 50): Promise<void> {
  for (let i = 0; i < text.length; i++) {
    process.stdout.write(text[i]!);
    await new Promise(resolve => setTimeout(resolve, speed));
  }
  process.stdout.write('\n');
}

/**
 * Show a countdown animation.
 * @param seconds - Number of seconds to count down.
 * @param message - Message to display during countdown.
 */
export async function showCountdown(seconds: number, message: string = '倒计时'): Promise<void> {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r${chalk.yellow('⏰')} ${message}: ${chalk.bold(i)} 秒`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  process.stdout.write(`\r${chalk.green('🎉')} ${message}: 完成!\n`);
}
