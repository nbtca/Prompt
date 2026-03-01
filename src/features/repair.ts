/**
 * 维修服务模块
 * 打开维修服务网页
 */

import open from 'open';
import chalk from 'chalk';
import { createSpinner } from '../core/ui.js';
import { t } from '../i18n/index.js';

/**
 * 维修服务URL
 */
export const REPAIR_URL = 'https://nbtca.space/repair';

/**
 * 打开维修服务页面
 */
export async function openRepairService(): Promise<void> {
  const trans = t();
  const s = createSpinner(trans.repair.opening);
  try {
    await open(REPAIR_URL);
    s.stop(trans.repair.opened);
    console.log();
  } catch {
    s.error(trans.repair.error);
    console.log(chalk.yellow('  ' + trans.repair.errorHint));
    console.log();
  }
}
