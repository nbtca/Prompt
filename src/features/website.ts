/**
 * 官网访问模块
 * 打开NBTCA官方网站或GitHub
 */

import open from 'open';
import chalk from 'chalk';
import { createSpinner } from '../core/ui.js';
import { t } from '../i18n/index.js';

export const WEBSITE_URLS = {
  homepage: 'https://nbtca.space',
  github: 'https://github.com/nbtca',
  roadmap: 'https://github.com/orgs/nbtca/projects/5',
  docs: 'https://docs.nbtca.space'
} as const;

/**
 * 打开指定URL
 */
export async function openWebsite(url: string): Promise<void> {
  const trans = t();
  const s = createSpinner(trans.website.opening);
  try {
    await open(url);
    s.stop(trans.website.opened);
    console.log(chalk.gray(`  ${url}`));
    console.log();
  } catch {
    s.error(trans.website.error);
    console.log(chalk.yellow('  ' + trans.website.errorHint + ': ') + chalk.cyan(url));
    console.log();
  }
}

/**
 * Open NBTCA homepage
 */
export async function openHomepage(): Promise<void> {
  await openWebsite(WEBSITE_URLS.homepage);
}

/**
 * Open GitHub page
 */
export async function openGithub(): Promise<void> {
  await openWebsite(WEBSITE_URLS.github);
}

/**
 * Open NBTCA Roadmap project
 */
export async function openRoadmap(): Promise<void> {
  await openWebsite(WEBSITE_URLS.roadmap);
}
