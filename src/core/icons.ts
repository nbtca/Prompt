import { resolveIconMode } from '../config/preferences.js';

function localeSupportsUnicode(): boolean {
  const locale = `${process.env['LC_ALL'] || ''} ${process.env['LANG'] || ''}`.toLowerCase();
  return locale.includes('utf-8') || locale.includes('utf8');
}

export function useUnicodeIcons(): boolean {
  const configured = resolveIconMode();
  if (configured === 'ascii') return false;
  if (configured === 'unicode') return true;

  const term = (process.env['TERM'] || '').toLowerCase();
  if (!process.stdout.isTTY || term === 'dumb') return false;
  return localeSupportsUnicode();
}

export function pickIcon(unicodeIcon: string, asciiIcon: string): string {
  return useUnicodeIcons() ? unicodeIcon : asciiIcon;
}
