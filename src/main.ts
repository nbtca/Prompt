/**
 * NBTCA Welcome Tool
 * 极简启动流程
 */

import chalk from 'chalk';
import { printLogo } from './core/logo.js';
import { printHeader, clearScreen } from './core/ui.js';
import { showMainMenu } from './core/menu.js';
import { APP_INFO } from './config/data.js';
import { enableVimKeys } from './core/vim-keys.js';

/**
 * 主程序入口
 */
export async function main(): Promise<void> {
  try {
    // 0. 启用 Vim 键位支持
    enableVimKeys();

    // 1. 清屏
    clearScreen();

    // 2. 显示Logo（智能降级）
    await printLogo();

    // 3. 显示版本信息
    printHeader(`v${APP_INFO.version}`);

    // 4. 显示主菜单（循环）
    await showMainMenu();

  } catch (err: any) {
    // 处理Ctrl+C退出
    if (err.message?.includes('SIGINT') || err.message?.includes('User force closed')) {
      console.log();
      console.log(chalk.dim('再见！'));
      process.exit(0);
    } else {
      console.error('发生错误:', err);
      process.exit(1);
    }
  }
}
