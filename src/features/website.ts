/**
 * 官网访问模块
 * 打开NBTCA官方网站或GitHub
 */

import open from 'open';
import chalk from 'chalk';
import { error, info, success } from '../core/ui.js';
import { t } from '../i18n/index.js';

/**
 * 打开指定URL
 */
export async function openWebsite(url: string): Promise<void> {
  const trans = t();
  try {
    console.log();
    info(trans.website.opening);

    await open(url);

    success(trans.website.opened);
    console.log(chalk.gray(`  ${url}`));
    console.log();
  } catch (err) {
    error(trans.website.error);
    console.log();
    console.log(chalk.yellow('  ' + trans.website.errorHint + ': ') + chalk.cyan(url));
    console.log();
  }
}

/**
 * Open NBTCA homepage
 */
export async function openHomepage(): Promise<void> {
  await openWebsite('https://nbtca.space');
}

/**
 * Open GitHub page
 */
export async function openGithub(): Promise<void> {
  await openWebsite('https://github.com/nbtca');
}
