/**
 * Minimalist menu system
 */

import { runMenu, type MenuOption } from './components/menu.js';
import { type, space } from './theme.js';
import { showCalendar } from '../features/calendar.js';
import { showDocsMenu } from '../features/docs.js';
import { showServiceStatus } from '../features/status.js';
import { showLinksMenu } from '../features/links.js';
import { showSettingsMenu } from '../features/settings.js';
import { t } from '../i18n/index.js';

export type MenuAction = 'events' | 'docs' | 'status' | 'links' | 'settings';

function getMainMenuOptions(): MenuOption[] {
  const trans = t();
  return [
    { value: 'events',   label: trans.menu.events,   hint: trans.menu.eventsDesc   || undefined },
    { value: 'docs',     label: trans.menu.docs,     hint: trans.menu.docsDesc     || undefined },
    { value: 'status',   label: trans.menu.status,   hint: trans.menu.statusDesc   || undefined },
    { value: 'links',    label: trans.menu.links,    hint: trans.menu.linksDesc    || undefined },
    { value: 'settings', label: trans.menu.settings, hint: trans.menu.settingsDesc || undefined },
  ];
}

export async function showMainMenu(): Promise<void> {
  while (true) {
    const trans = t();
    const footer = `${trans.menu.hintMove}   ${trans.menu.hintOpen}   ${trans.menu.hintQuit}`;
    const action = await runMenu({
      title: trans.menu.chooseAction,
      options: getMainMenuOptions(),
      footer,
    });

    if (action === null) {
      console.log(space.indent + type.hint(t().common.goodbye));
      process.exit(0);
    }

    await runMenuAction(action as MenuAction);
  }
}

export async function runMenuAction(action: MenuAction): Promise<void> {
  switch (action) {
    case 'events':   await showCalendar();        break;
    case 'docs':     await showDocsMenu();       break;
    case 'status':   await showServiceStatus();  break;
    case 'links':    await showLinksMenu();       break;
    case 'settings': await showSettingsMenu();   break;
  }
}
