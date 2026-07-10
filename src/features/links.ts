/**
 * Links — open NBTCA resources in browser
 */

import open from 'open';
import chalk from 'chalk';
import { runMenu, menuFooter } from '../core/components/menu.js';
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

  const selected = await runMenu({
    title: trans.links.choose,
    options: [
      { value: URLS.homepage, label: trans.links.website },
      { value: URLS.github,   label: trans.links.github },
      { value: URLS.roadmap,  label: trans.links.roadmap },
      { value: URLS.repair,   label: trans.links.repair },
    ],
    footer: menuFooter(),
  });

  if (selected === null) return;
  await openUrl(selected);
}
