import { clearScreen } from './ui.js';
import { typeReveal } from './motion.js';
import { glyph, type, space } from './theme.js';
import { screenWidth } from './components/screen.js';
import { pickIcon } from './icons.js';

export function breadcrumb(label: string): string {
  return `nbtca ${pickIcon('›', '>')} ${label}`;
}

export function buildScreenHeaderLines(crumb: string): string[] {
  return [
    space.indent + type.heading(crumb),
    space.indent + type.hint(glyph.rule().repeat(screenWidth())),
    '',
  ];
}

export async function enterScreen(crumb: string): Promise<void> {
  clearScreen();
  await typeReveal(buildScreenHeaderLines(crumb));
}
