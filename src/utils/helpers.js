// Utility helper functions for NBTCA Welcome.

import chalk from 'chalk';
import os from 'os';

/**
 * Format bytes to human readable format.
 * @param {number} bytes - Bytes to format.
 * @returns {string} Formatted string.
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get system uptime in human readable format.
 * @returns {string} Formatted uptime.
 */
export function getUptime() {
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
 * @returns {number} Memory usage percentage.
 */
export function getMemoryUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  return Math.round(((total - free) / total) * 100);
}

/**
 * Get CPU usage information.
 * @returns {Object} CPU usage info.
 */
export function getCPUInfo() {
  const cpus = os.cpus();
  return {
    cores: cpus.length,
    model: cpus[0]?.model || 'Unknown',
    speed: cpus[0]?.speed || 0
  };
}

/**
 * Check if system is under load.
 * @returns {boolean} True if system is under load.
 */
export function isSystemUnderLoad() {
  const memoryUsage = getMemoryUsage();
  const cpuInfo = getCPUInfo();
  
  return memoryUsage > 80 || cpuInfo.cores < 2;
}

/**
 * Generate a random string.
 * @param {number} length - Length of the string.
 * @returns {string} Random string.
 */
export function generateRandomString(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Validate email address.
 * @param {string} email - Email to validate.
 * @returns {boolean} True if valid email.
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate URL.
 * @param {string} url - URL to validate.
 * @returns {boolean} True if valid URL.
 */
export function isValidURL(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format date to Chinese locale.
 * @param {Date} date - Date to format.
 * @returns {string} Formatted date.
 */
export function formatDate(date = new Date()) {
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
 * @param {number} current - Current value.
 * @param {number} total - Total value.
 * @param {number} width - Width of the bar.
 * @returns {string} Progress bar string.
 */
export function createProgressBar(current, total, width = 20) {
  const percentage = Math.min(current / total, 1);
  const filled = Math.floor(percentage * width);
  const empty = width - filled;
  
  const filledBar = '█'.repeat(filled);
  const emptyBar = '░'.repeat(empty);
  
  return `[${filledBar}${emptyBar}] ${Math.round(percentage * 100)}%`;
}

/**
 * Create a table row.
 * @param {Array} columns - Column values.
 * @param {Array} widths - Column widths.
 * @returns {string} Formatted table row.
 */
export function createTableRow(columns, widths) {
  return columns.map((col, i) => {
    const width = widths[i] || 20;
    return col.toString().padEnd(width);
  }).join(' | ');
}

/**
 * Create a table header.
 * @param {Array} headers - Header values.
 * @param {Array} widths - Column widths.
 * @returns {string} Formatted table header.
 */
export function createTableHeader(headers, widths) {
  const header = createTableRow(headers, widths);
  const separator = headers.map((_, i) => '-'.repeat(widths[i] || 20)).join('-+-');
  return header + '\n' + separator;
}

/**
 * Check if terminal supports colors.
 * @returns {boolean} True if colors are supported.
 */
export function supportsColors() {
  return process.stdout.isTTY && process.env.FORCE_COLOR !== '0';
}

/**
 * Get terminal size.
 * @returns {Object} Terminal dimensions.
 */
export function getTerminalSize() {
  return {
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24
  };
}

/**
 * Center text in terminal.
 * @param {string} text - Text to center.
 * @param {number} width - Terminal width.
 * @returns {string} Centered text.
 */
export function centerText(text, width = getTerminalSize().width) {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(padding) + text;
}

/**
 * Truncate text to fit terminal width.
 * @param {string} text - Text to truncate.
 * @param {number} maxWidth - Maximum width.
 * @returns {string} Truncated text.
 */
export function truncateText(text, maxWidth = getTerminalSize().width - 4) {
  if (text.length <= maxWidth) return text;
  return text.substring(0, maxWidth - 3) + '...';
}

/**
 * Create a loading spinner.
 * @param {Array} frames - Spinner frames.
 * @param {number} index - Current frame index.
 * @returns {string} Current spinner frame.
 */
export function getSpinnerFrame(frames, index) {
  return frames[index % frames.length];
}

/**
 * Debounce function execution.
 * @param {Function} func - Function to debounce.
 * @param {number} wait - Wait time in milliseconds.
 * @returns {Function} Debounced function.
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
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
 * @param {Function} func - Function to throttle.
 * @param {number} limit - Time limit in milliseconds.
 * @returns {Function} Throttled function.
 */
export function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
} 