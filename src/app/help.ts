import { type, space, glyph } from '../core/theme.js';
import { pickIcon } from '../core/icons.js';
import { t } from '../i18n/index.js';
import { padEndV, visualWidth, wrapAnsiWithIndent } from '../core/text.js';

export interface Shortcut {
  key: string;
  label: string;
}

function row(shortcut: Shortcut, keyWidth: number, cols: number): string[] {
  const key = padEndV(type.label(shortcut.key), keyWidth);
  const line = `${space.indent}${space.indent}${key}  ${type.hint(shortcut.label)}`;
  if (visualWidth(line) <= cols) return [line];
  return wrapAnsiWithIndent(
    `${type.label(shortcut.key)} ${type.hint(shortcut.label)}`,
    cols,
    space.indent + space.indent,
  );
}

function group(title: string, shortcuts: readonly Shortcut[], cols: number): string[] {
  if (shortcuts.length === 0) return [];
  const keyWidth = shortcuts.reduce((width, item) => Math.max(width, visualWidth(item.key)), 0);
  return [
    ...wrapAnsiWithIndent(type.heading(title), cols, space.indent),
    ...shortcuts.flatMap((shortcut) => row(shortcut, keyWidth, cols)),
    '',
  ];
}

export function globalShortcuts(tabCount: number): Shortcut[] {
  const trans = t();
  const updown = glyph.updown();
  return [
    ...(tabCount > 1 ? [{ key: `1-${String(tabCount)}`, label: trans.help.tabs }] : []),
    { key: 'Tab', label: trans.help.nextTab },
    { key: `${updown} / j k`, label: trans.help.scroll },
    { key: `PgUp/PgDn / ${pickIcon('␣', 'Space')}`, label: trans.help.page },
    { key: 'Home/End / g G', label: trans.help.ends },
    { key: pickIcon('⏎', 'Enter'), label: trans.help.open },
    { key: 'Esc', label: trans.help.back },
    { key: 'q', label: trans.help.quit },
  ];
}

export function renderHelp(
  viewTitle: string,
  viewShortcuts: readonly Shortcut[],
  tabCount: number,
  cols: number,
): string[] {
  const trans = t();
  return [
    ...wrapAnsiWithIndent(type.heading(trans.help.title), cols, space.indent),
    '',
    ...group(trans.help.sectionGlobal, globalShortcuts(tabCount), cols),
    ...group(viewTitle, viewShortcuts, cols),
  ];
}
