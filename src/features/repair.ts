/**
 * 维修服务模块
 * 打开维修服务网页
 */

import open from 'open';
import chalk from 'chalk';
import { error, info, success } from '../core/ui.js';

/**
 * 维修服务URL
 */
const REPAIR_URL = 'https://nbtca.space/repair';

/**
 * 打开维修服务页面
 */
export async function openRepairService(): Promise<void> {
  try {
    console.log();
    info('正在打开维修服务页面...');
    console.log();

    await open(REPAIR_URL);

    success('已在浏览器中打开维修服务页面');
    console.log();
    console.log(chalk.gray('  服务内容:'));
    console.log(chalk.gray('  • 电脑硬件维修'));
    console.log(chalk.gray('  • 软件安装与配置'));
    console.log(chalk.gray('  • 系统优化与故障排查'));
    console.log(chalk.gray('  • 数据恢复与备份'));
    console.log();
  } catch (err) {
    error('无法打开浏览器');
    console.log();
    console.log(chalk.yellow('  请手动访问: ') + chalk.cyan(REPAIR_URL));
    console.log();
  }
}
