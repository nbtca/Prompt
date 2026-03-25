/**
 * Links — open NBTCA resources in browser
 */

import open from 'open';
import chalk from 'chalk';
import { select, isCancel } from '@clack/prompts';
import { createSpinner } from '../core/ui.js';
import { URLS } from '../config/data.js';
import { t } from '../i18n/index.js';

async function openUrl(url: string): Promise<void> {
  const trans = t();
  const s = createSpinner(trans.links.opening);
  try {
    await open(url);
    s.stop(trans.links.opened);
  } catch {
    s.error(trans.links.error);
    console.log(chalk.dim(`  ${url}`));
  }
}

export async function showLinksMenu(): Promise<void> {
  const trans = t();

  const selected = await select({
    message: trans.links.choose,
    options: [
      { value: URLS.homepage, label: trans.links.website },
      { value: URLS.github,   label: trans.links.github },
      { value: URLS.roadmap,  label: trans.links.roadmap },
      { value: URLS.repair,   label: trans.links.repair },
      { value: '__back__',    label: chalk.dim(trans.common.back) },
    ],
  });

  if (isCancel(selected) || selected === '__back__') return;
  await openUrl(selected);
}

/** Direct openers for CLI non-interactive mode */
export async function openHomepage(): Promise<void> { await openUrl(URLS.homepage); }
export async function openGithub(): Promise<void> { await openUrl(URLS.github); }
export async function openRoadmap(): Promise<void> { await openUrl(URLS.roadmap); }
export async function openRepairService(): Promise<void> { await openUrl(URLS.repair); }
