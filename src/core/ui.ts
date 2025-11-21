/**
 * 极简UI组件库
 * 提供基础的终端UI组件
 */

import chalk from 'chalk';
import boxen from 'boxen';

/**
 * 菜单项接口
 */
export interface MenuItem {
  name: string;
  value: string;
  description?: string;
}

/**
 * 显示顶部边框标题
 */
export function printHeader(title: string): void {
  const terminalWidth = process.stdout.columns || 80;
  const boxWidth = Math.min(60, terminalWidth - 4);

  const box = boxen(chalk.cyan.bold(title), {
    padding: { left: 2, right: 2, top: 0, bottom: 0 },
    borderStyle: 'round',
    borderColor: 'cyan',
    width: boxWidth,
    textAlignment: 'center'
  });

  // 居中显示
  const lines = box.split('\n');
  lines.forEach(line => {
    const padding = Math.max(0, Math.floor((terminalWidth - line.length) / 2));
    console.log(' '.repeat(padding) + line);
  });
}

/**
 * 显示分隔线
 */
export function printDivider(): void {
  const terminalWidth = process.stdout.columns || 80;
  const dividerWidth = Math.min(60, terminalWidth - 4);
  const padding = Math.max(0, Math.floor((terminalWidth - dividerWidth) / 2));

  console.log(' '.repeat(padding) + chalk.gray('─'.repeat(dividerWidth)));
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
