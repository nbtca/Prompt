import { glyph, type, space } from '../theme.js';

export interface ScreenOptions {
  title?: string;
  body: string;
  footer?: string;
  width?: number;
}

export function screenWidth(): number {
  return Math.min(process.stdout.columns || 80, 64);
}

export function renderScreen(opts: ScreenOptions): string {
  const width = opts.width ?? screenWidth();
  const lines: string[] = [];

  if (opts.title) {
    lines.push(space.indent + type.heading(opts.title));
    lines.push(space.indent + type.hint(glyph.rule().repeat(width)));
  }

  lines.push(opts.body);

  if (opts.footer) {
    lines.push('');
    lines.push(space.indent + type.hint(opts.footer));
  }

  return lines.join('\n');
}
