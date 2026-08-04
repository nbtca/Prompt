import { t } from '../i18n/index.js';
import type { ViewId } from './keys.js';

export interface AppTab {
  id: ViewId;
  title: string;
}

export function getAppTabs(): AppTab[] {
  const trans = t();
  return [
    { id: 'home', title: 'Home' },
    { id: 'schedule', title: trans.timetable.menuEntry },
    { id: 'events', title: trans.menu.events },
    { id: 'docs', title: trans.menu.docs },
    { id: 'settings', title: trans.menu.settings },
  ];
}
