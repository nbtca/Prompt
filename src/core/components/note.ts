import { glyph, type, space } from '../theme.js';
import { visualWidth } from '../text.js';

export function renderNote(message: string, title?: string): string {
  const bodyLines = message.split('\n');
  const lines: string[] = [];

  if (title) {
    const width = Math.max(
      visualWidth(title),
      ...bodyLines.map((l) => visualWidth(l)),
    );
    lines.push(space.indent + type.heading(title));
    lines.push(space.indent + type.hint(glyph.rule().repeat(width)));
  }

  for (const line of bodyLines) {
    lines.push(space.indent + line);
  }

  return lines.join('\n');
}

export function note(message: string, title?: string): void {
  console.log(renderNote(message, title));
}
