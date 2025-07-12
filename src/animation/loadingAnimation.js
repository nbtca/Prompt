// Loading animation with various spinner styles.

import chalk from 'chalk';

const spinners = {
  dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  line: ['|', '/', '-', '\\'],
  arrow: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
  triangle: ['◢', '◣', '◤', '◥'],
  square: ['▰', '▱', '▰', '▱'],
  circle: ['◐', '◓', '◑', '◒'],
  nbtca: ['⚡', '🚀', '💻', '🔧', '⚙️', '🎯', '🌟', '💡']
};

/**
 * Show a loading animation with custom text and duration.
 * @param {string} text - Loading text to display.
 * @param {number} duration - Duration in milliseconds.
 * @param {string} spinnerType - Type of spinner animation.
 */
export async function showLoadingAnimation(text, duration = 2000, spinnerType = 'nbtca') {
  const spinner = spinners[spinnerType] || spinners.dots;
  const interval = 100;
  const steps = Math.floor(duration / interval);
  
  for (let i = 0; i < steps; i++) {
    const spinnerChar = spinner[i % spinner.length];
    const progress = Math.floor((i / steps) * 100);
    const progressBar = createProgressBar(progress, 20);
    
    process.stdout.write(`\r${chalk.cyan(spinnerChar)} ${text} ${progressBar} ${progress}%`);
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  process.stdout.write(`\r${chalk.green('✓')} ${text} ${createProgressBar(100, 20)} 100%\n`);
}

/**
 * Create a progress bar string.
 * @param {number} percentage - Progress percentage (0-100).
 * @param {number} width - Width of the progress bar.
 * @returns {string} Progress bar string.
 */
function createProgressBar(percentage, width = 20) {
  const filled = Math.floor((percentage / 100) * width);
  const empty = width - filled;
  
  const filledBar = '█'.repeat(filled);
  const emptyBar = '░'.repeat(empty);
  
  return `[${filledBar}${emptyBar}]`;
}

/**
 * Show a typing animation effect.
 * @param {string} text - Text to type out.
 * @param {number} speed - Typing speed in milliseconds per character.
 */
export async function showTypingAnimation(text, speed = 50) {
  for (let i = 0; i < text.length; i++) {
    process.stdout.write(text[i]);
    await new Promise(resolve => setTimeout(resolve, speed));
  }
  process.stdout.write('\n');
}

/**
 * Show a countdown animation.
 * @param {number} seconds - Number of seconds to count down.
 * @param {string} message - Message to display during countdown.
 */
export async function showCountdown(seconds, message = '倒计时') {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r${chalk.yellow('⏰')} ${message}: ${chalk.bold(i)} 秒`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  process.stdout.write(`\r${chalk.green('🎉')} ${message}: 完成!\n`);
} 