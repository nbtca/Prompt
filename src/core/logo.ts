/**
 * Startup logo: a high-precision braille dot-matrix render of the NBTCA emblem
 * (generated from CA-logo.svg), shown with the brand blue->cyan gradient.
 * Falls back to plain ASCII on terminals without Unicode/braille support.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import gradient from 'gradient-string';
import { useUnicodeIcons } from './icons.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TAGLINE = 'To be at the intersection of technology and liberal arts.';

// Brand gradient: emblem blue -> sky -> cyan.
const brand = gradient([
  { color: '#124689', pos: 0 },
  { color: '#0ea5e9', pos: 0.55 },
  { color: '#06b6d4', pos: 1 },
]);

function readArt(file: string): string | null {
  try {
    return readFileSync(join(__dirname, '../logo', file), 'utf-8').replace(/\s+$/, '');
  } catch {
    return null;
  }
}

function paint(text: string, color: boolean): string {
  if (!color) return text;
  // multiline keeps the gradient aligned down the whole block; fall back to a
  // per-line gradient if the installed gradient-string lacks .multiline.
  const fn = brand as unknown as { multiline?: (s: string) => string };
  return typeof fn.multiline === 'function'
    ? fn.multiline(text)
    : text.split('\n').map((line) => brand(line)).join('\n');
}

export function printLogo(): void {
  if (!process.stdout.isTTY) return;

  const color = !process.env['NO_COLOR'];
  const art = useUnicodeIcons() ? readArt('ca-dotmatrix.txt') : readArt('ascii-logo.txt');

  console.log();
  console.log(paint(art ?? 'NBTCA', color));
  console.log();
  console.log(color ? brand(TAGLINE) : TAGLINE);
  console.log();
}
