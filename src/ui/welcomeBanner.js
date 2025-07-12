// Welcome banner with enhanced styling and information.

import chalk from 'chalk';
import boxen from 'boxen';
import { printRainbowText, printPulsingText } from '../gradient/printGradientText.js';

/**
 * Print an enhanced welcome banner.
 */
export function printWelcomeBanner() {
  const banner = boxen(
    chalk.bold.cyan('🎓 NBTCA Welcome v2.3.0') + '\n' +
    chalk.gray('浙大宁波理工学院计算机协会') + '\n' +
    chalk.gray('NingboTech Computer Association'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
      backgroundColor: '#1a1a1a'
    }
  );
  
  console.log(banner);
}

/**
 * Print system status and quick info.
 */
export function printQuickInfo() {
  const info = [
    { label: '📅 当前时间', value: new Date().toLocaleString('zh-CN') },
    { label: '🌐 网络状态', value: '🟢 在线' },
    { label: '💻 系统信息', value: `${process.platform} ${process.arch}` },
    { label: '📦 版本信息', value: 'v2.3.0' }
  ];
  
  console.log(chalk.blue.bold('\n📊 系统信息:'));
  info.forEach(item => {
    console.log(`  ${chalk.yellow(item.label)}: ${chalk.white(item.value)}`);
  });
}

/**
 * Print feature highlights.
 */
export function printFeatureHighlights() {
  const features = [
    '🎨 增强的视觉效果',
    '⚡ 快速响应菜单',
    '🌐 一键访问服务',
    '📱 移动端适配',
    '🔧 技术支持服务',
    '📚 学习资源中心'
  ];
  
  console.log(chalk.green.bold('\n✨ 功能特色:'));
  features.forEach((feature, index) => {
    const delay = index * 100;
    setTimeout(() => {
      console.log(`  ${chalk.cyan('•')} ${feature}`);
    }, delay);
  });
}

/**
 * Print a decorative separator.
 * @param {string} text - Text to display in the separator.
 * @param {string} style - Separator style.
 */
export function printSeparator(text = '', style = 'line') {
  const width = process.stdout.columns || 80;
  const textLength = text.length;
  const lineLength = Math.floor((width - textLength - 4) / 2);
  
  let separator;
  switch (style) {
    case 'dashed':
      separator = '─'.repeat(lineLength);
      break;
    case 'dotted':
      separator = '·'.repeat(lineLength);
      break;
    case 'star':
      separator = '★'.repeat(lineLength);
      break;
    default:
      separator = '═'.repeat(lineLength);
  }
  
  if (text) {
    console.log(chalk.gray(`${separator} ${chalk.cyan(text)} ${separator}`));
  } else {
    console.log(chalk.gray(separator.repeat(2)));
  }
}

/**
 * Print a success message with animation.
 * @param {string} message - Success message.
 */
export function printSuccessMessage(message) {
  console.log(chalk.green.bold(`\n✅ ${message}`));
}

/**
 * Print a warning message.
 * @param {string} message - Warning message.
 */
export function printWarningMessage(message) {
  console.log(chalk.yellow.bold(`\n⚠️  ${message}`));
}

/**
 * Print an error message.
 * @param {string} message - Error message.
 */
export function printErrorMessage(message) {
  console.log(chalk.red.bold(`\n❌ ${message}`));
} 