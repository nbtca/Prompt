import { resolveIconMode } from '../config/preferences.js';

function localeSupportsUnicode(): boolean {
  const locale = `${process.env['LC_ALL'] || ''} ${process.env['LANG'] || ''}`.toLowerCase();
  return locale.includes('utf-8') || locale.includes('utf8');
}

let cachedUseUnicode: boolean | null = null;

export function useUnicodeIcons(): boolean {
  if (cachedUseUnicode !== null) return cachedUseUnicode;

  const configured = resolveIconMode();
  if (configured === 'ascii') { cachedUseUnicode = false; return false; }
  if (configured === 'unicode') { cachedUseUnicode = true; return true; }

  const term = (process.env['TERM'] || '').toLowerCase();
  if (!process.stdout.isTTY || term === 'dumb') { cachedUseUnicode = false; return false; }
  cachedUseUnicode = localeSupportsUnicode();
  return cachedUseUnicode;
}

/** Invalidate the cached icon mode (call after theme changes). */
export function resetIconCache(): void {
  cachedUseUnicode = null;
}

export function pickIcon(unicodeIcon: string, asciiIcon: string): string {
  return useUnicodeIcons() ? unicodeIcon : asciiIcon;
}
