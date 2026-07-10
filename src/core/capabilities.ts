import { useUnicodeIcons } from './icons.js';
import { resolveColorMode } from '../config/preferences.js';

export interface Capabilities {
  isTTY: boolean;
  unicode: boolean;
  color: boolean;
  reducedMotion: boolean;
}

export function deriveReducedMotion(o: {
  isTTY: boolean;
  color: boolean;
  unicode: boolean;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const env = o.env ?? process.env;
  if (!o.isTTY) return true;
  if (env['NBTCA_NO_MOTION']) return true;
  if (env['CI']) return true;
  if ((env['TERM'] || '').toLowerCase() === 'dumb') return true;
  if (!o.color) return true;
  if (!o.unicode) return true;
  return false;
}

function detectColor(): boolean {
  if (process.env['NO_COLOR']) return false;
  const mode = resolveColorMode();
  if (mode === 'off') return false;
  if (mode === 'on') return true;
  return !!process.stdout.isTTY;
}

let cached: Capabilities | null = null;

export function getCapabilities(): Capabilities {
  if (cached) return cached;
  const isTTY = !!process.stdout.isTTY && !!process.stdin.isTTY;
  const unicode = useUnicodeIcons();
  const color = detectColor();
  const reducedMotion = deriveReducedMotion({ isTTY, color, unicode });
  cached = { isTTY, unicode, color, reducedMotion };
  return cached;
}

export function resetCapabilities(): void {
  cached = null;
}
