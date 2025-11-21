/**
 * 极简UI组件库
 * 提供基础的终端UI组件
 */

import chalk from 'chalk';

/**
 * 菜单项接口
 */
export interface MenuItem {
  name: string;
  value: string;
  description?: string;
}

/**
 * 计算字符串的实际显示宽度（考虑中文字符）
 */
function getDisplayWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    // 中文字符、全角符号等占2个宽度
    width += char.charCodeAt(0) > 127 ? 2 : 1;
  }
  return width;
}

/**
 * 显示顶部边框标题
 */
export function printHeader(title: string): void {
  const terminalWidth = process.stdout.columns || 80;
  const titleWidth = getDisplayWidth(title);

  // 计算分隔线长度
  const sideWidth = Math.max(2, Math.floor((terminalWidth - titleWidth - 4) / 2));
  const leftLine = '─'.repeat(sideWidth);
  const rightLine = '─'.repeat(sideWidth);

  // 显示标题行
  console.log(chalk.cyan(`${leftLine} ${title} ${rightLine}`));
  console.log();
}

/**
 * 显示分隔线
 */
export function printDivider(): void {
  const terminalWidth = process.stdout.columns || 80;
  console.log(chalk.gray('─'.repeat(terminalWidth)));
}

/**
 * 显示加载spinner
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
 * 显示成功消息
 */
export function success(msg: string): void {
  console.log(chalk.green('✓') + ' ' + msg);
}

/**
 * 显示错误消息
 */
export function error(msg: string): void {
  console.log(chalk.red('✗') + ' ' + msg);
}

/**
 * 显示信息消息
 */
export function info(msg: string): void {
  console.log(chalk.blue('ℹ') + ' ' + msg);
}

/**
 * 显示警告消息
 */
export function warning(msg: string): void {
  console.log(chalk.yellow('⚠') + ' ' + msg);
}

/**
 * 清屏
 */
export function clearScreen(): void {
  console.clear();
}

/**
 * 打印空行
 */
export function printNewLine(count: number = 1): void {
  for (let i = 0; i < count; i++) {
    console.log();
  }
}

