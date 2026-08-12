import { clearScreen } from './ui.js';
import { typeReveal } from './motion.js';
import { glyph, type, space } from './theme.js';
import { pickIcon } from './icons.js';

export function breadcrumb(label: string): string {
  return `nbtca ${pickIcon('›', '>')} ${label}`;
}

export function buildScreenHeaderLines(crumb: string): string[] {
  const width = Math.min(process.stdout.columns || 80, 64);
  return [
    space.indent + type.heading(crumb),
    space.indent + type.hint(glyph.rule().repeat(width)),
    '',
  ];
}

export async function enterScreen(crumb: string): Promise<void> {
  clearScreen();
  await typeReveal(buildScreenHeaderLines(crumb));
}
