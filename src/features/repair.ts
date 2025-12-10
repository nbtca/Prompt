/**
 * 维修服务模块
 * 打开维修服务网页
 */

import open from 'open';
import chalk from 'chalk';
import { error, info, success } from '../core/ui.js';
import { t } from '../i18n/index.js';

/**
 * 维修服务URL
 */
const REPAIR_URL = 'https://nbtca.space/repair';

/**
 * 打开维修服务页面
 */
export async function openRepairService(): Promise<void> {
  const trans = t();
  try {
    console.log();
    info(trans.repair.opening);
    console.log();

    await open(REPAIR_URL);

    success(trans.repair.opened);
    console.log();
  } catch (err) {
    error(trans.repair.error);
    console.log();
    console.log(chalk.yellow('  ' + trans.repair.errorHint));
    console.log();
  }
}
