import { c, space, type } from '../theme.js';
import { padEndV, visualWidth, wrapAnsiWithIndent } from '../text.js';

const ART = {
  calendar: [' .-.-. ', ' |   | ', " '---' "],
  search: [' .--.  ', '(    ) ', " '--'\\_"],
} as const;

export function emptyStateLines(
  kind: keyof typeof ART,
  label: string,
  cols = Number.POSITIVE_INFINITY,
  rows = Number.POSITIVE_INFINITY,
): string[] {
  const text = wrapAnsiWithIndent(type.hint(label), cols, space.indent);
  const art = ART[kind];
  if (cols < 40 || rows < art.length) return text;

  const artWidth = Math.max(...art.map(visualWidth));
  const message = wrapAnsiWithIndent(
    type.hint(label),
    cols - visualWidth(space.indent) - artWidth - 2,
    '',
  );
  if (message.length > art.length) return text;

  const offset = Math.floor((art.length - message.length) / 2);
  return art.map(
    (line, index) =>
      space.indent +
      c.subtle(padEndV(line, artWidth)) +
      (message[index - offset] ? `  ${message[index - offset]}` : ''),
  );
}
