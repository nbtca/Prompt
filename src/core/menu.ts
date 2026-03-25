/**
 * Minimalist menu system
 */

import { select, isCancel, outro } from '@clack/prompts';
import chalk from 'chalk';
import { showCalendar } from '../features/calendar.js';
import { showDocsMenu } from '../features/docs.js';
import { showServiceStatus } from '../features/status.js';
import { showLinksMenu } from '../features/links.js';
import { showSettingsMenu } from '../features/settings.js';
import { t } from '../i18n/index.js';

export type MenuAction = 'events' | 'docs' | 'status' | 'links' | 'settings';

function getMainMenuOptions() {
  const trans = t();
  return [
    { value: 'events',   label: trans.menu.events,   hint: trans.menu.eventsDesc },
    { value: 'docs',     label: trans.menu.docs,     hint: trans.menu.docsDesc },
    { value: 'status',   label: trans.menu.status,   hint: trans.menu.statusDesc },
    { value: 'links',    label: trans.menu.links,    hint: trans.menu.linksDesc },
    { value: 'settings', label: trans.menu.settings,  hint: trans.menu.settingsDesc },
  ];
}

export async function showMainMenu(): Promise<void> {
  while (true) {
    const trans = t();

    const action = await select({
      message: trans.menu.chooseAction,
      options: getMainMenuOptions(),
    });

    if (isCancel(action)) {
      outro(chalk.dim(t().common.goodbye));
      process.exit(0);
    }

    await runMenuAction(action as MenuAction);
  }
}

export async function runMenuAction(action: MenuAction): Promise<void> {
  switch (action) {
    case 'events':   await showCalendar();       break;
    case 'docs':     await showDocsMenu();       break;
    case 'status':   await showServiceStatus();  break;
    case 'links':    await showLinksMenu();       break;
    case 'settings': await showSettingsMenu();   break;
  }
}
