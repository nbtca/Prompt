/**
 * Utility helper functions for NBTCA Welcome.
 */

import os from 'os';

/**
 * CPU information structure.
 */
export interface CPUInfo {
  cores: number;
  model: string;
  speed: number;
}

/**
 * Terminal size structure.
 */
export interface TerminalSize {
  width: number;
  height: number;
}

/**
 * Format bytes to human readable format.
 * @param bytes - Bytes to format.
 * @returns Formatted string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get system uptime in human readable format.
 * @returns Formatted uptime.
 */
export function getUptime(): string {
  const uptime = os.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);

  if (days > 0) {
    return `${days}天 ${hours}小时 ${minutes}分钟`;
  } else if (hours > 0) {
    return `${hours}小时 ${minutes}分钟`;
  } else {
    return `${minutes}分钟`;
  }
}

/**
 * Get memory usage percentage.
 * @returns Memory usage percentage.
 */
export function getMemoryUsage(): number {
  const total = os.totalmem();
  const free = os.freemem();
  return Math.round(((total - free) / total) * 100);
}

/**
 * Get CPU usage information.
 * @returns CPU usage info.
 */
export function getCPUInfo(): CPUInfo {
  const cpus = os.cpus();
  return {
    cores: cpus.length,
    model: cpus[0]?.model || 'Unknown',
    speed: cpus[0]?.speed || 0
  };
}

/**
 * Check if system is under load.
 * @returns True if system is under load.
 */
export function isSystemUnderLoad(): boolean {
  const memoryUsage = getMemoryUsage();
  const cpuInfo = getCPUInfo();

  return memoryUsage > 80 || cpuInfo.cores < 2;
}

/**
 * Generate a random string.
 * @param length - Length of the string.
 * @returns Random string.
 */
export function generateRandomString(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Validate email address.
 * @param email - Email to validate.
 * @returns True if valid email.
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate URL.
 * @param url - URL to validate.
 * @returns True if valid URL.
 */
export function isValidURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format date to Chinese locale.
 * @param date - Date to format.
 * @returns Formatted date.
 */
export function formatDate(date: Date = new Date()): string {
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Create a progress bar.
 * @param current - Current value.
 * @param total - Total value.
 * @param width - Width of the bar.
 * @returns Progress bar string.
 */
export function createProgressBar(current: number, total: number, width: number = 20): string {
  const percentage = Math.min(current / total, 1);
  const filled = Math.floor(percentage * width);
  const empty = width - filled;

  const filledBar = '█'.repeat(filled);
  const emptyBar = '░'.repeat(empty);

  return `[${filledBar}${emptyBar}] ${Math.round(percentage * 100)}%`;
}

/**
 * Create a table row.
 * @param columns - Column values.
 * @param widths - Column widths.
 * @returns Formatted table row.
 */
export function createTableRow(columns: Array<string | number>, widths: number[]): string {
  return columns.map((col, i) => {
    const width = widths[i] || 20;
    return col.toString().padEnd(width);
  }).join(' | ');
}

/**
 * Create a table header.
 * @param headers - Header values.
 * @param widths - Column widths.
 * @returns Formatted table header.
 */
export function createTableHeader(headers: string[], widths: number[]): string {
  const header = createTableRow(headers, widths);
  const separator = headers.map((_, i) => '-'.repeat(widths[i] || 20)).join('-+-');
  return header + '\n' + separator;
}

/**
 * Check if terminal supports colors.
 * @returns True if colors are supported.
 */
export function supportsColors(): boolean {
  return process.stdout.isTTY && process.env['FORCE_COLOR'] !== '0';
}

/**
 * Get terminal size.
 * @returns Terminal dimensions.
 */
export function getTerminalSize(): TerminalSize {
  return {
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24
  };
}

/**
 * Center text in terminal.
 * @param text - Text to center.
 * @param width - Terminal width.
 * @returns Centered text.
 */
export function centerText(text: string, width: number = getTerminalSize().width): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(padding) + text;
}

/**
 * Truncate text to fit terminal width.
 * @param text - Text to truncate.
 * @param maxWidth - Maximum width.
 * @returns Truncated text.
 */
export function truncateText(text: string, maxWidth: number = getTerminalSize().width - 4): string {
  if (text.length <= maxWidth) return text;
  return text.substring(0, maxWidth - 3) + '...';
}

/**
 * Create a loading spinner.
 * @param frames - Spinner frames.
 * @param index - Current frame index.
 * @returns Current spinner frame.
 */
export function getSpinnerFrame(frames: string[], index: number): string {
  return frames[index % frames.length] || '';
}

/**
 * Debounce function execution.
 * @param func - Function to debounce.
 * @param wait - Wait time in milliseconds.
 * @returns Debounced function.
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | undefined;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function execution.
 * @param func - Function to throttle.
 * @param limit - Time limit in milliseconds.
 * @returns Throttled function.
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return function(this: any, ...args: Parameters<T>) {
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}
