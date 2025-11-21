/**
 * 官网访问模块
 * 打开NBTCA官方网站或GitHub
 */

import open from 'open';
import chalk from 'chalk';
import { error, info, success } from '../core/ui.js';

/**
 * 打开指定URL
 */
export async function openWebsite(url: string, name: string = '网站'): Promise<void> {
  try {
    console.log();
    info(`正在打开${name}...`);

    await open(url);

    success(`已在浏览器中打开${name}`);
    console.log(chalk.gray(`  ${url}`));
    console.log();
  } catch (err) {
    error('无法打开浏览器');
    console.log();
    console.log(chalk.yellow('  请手动访问: ') + chalk.cyan(url));
    console.log();
  }
}

/**
 * 打开NBTCA主页
 */
export async function openHomepage(): Promise<void> {
  await openWebsite('https://nbtca.space', 'NBTCA官网');
}

/**
 * 打开GitHub页面
 */
export async function openGithub(): Promise<void> {
  await openWebsite('https://github.com/nbtca', 'GitHub组织页');
}
