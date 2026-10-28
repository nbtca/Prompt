import { c, space, type } from '../theme.js';
import { padEndV, visualWidth, wrapAnsiWithIndent } from '../text.js';
import { magnifier, moonSky } from '../../art/motifs.js';

const ART = {
  calendar: [' .-.-. ', ' |   | ', " '---' "],
  search: [' .--.  ', '(    ) ', " '--'\\_"],
} as const;

const PICTURE = { calendar: moonSky, search: magnifier } as const;

export function emptyStateLines(
  kind: keyof typeof ART,
  label: string,
  cols = Number.POSITIVE_INFINITY,
  rows = Number.POSITIVE_INFINITY,
): string[] {
  const text = wrapAnsiWithIndent(type.hint(label), cols, space.indent);
  const picture = PICTURE[kind]();
  const lines =
    cols >= 44 && rows >= picture.length ? beside(picture, label, cols, false) : undefined;
  if (lines) return lines;
  const art = ART[kind];
  if (cols < 40 || rows < art.length) return text;
  return beside([...art], label, cols, true) ?? text;
}

function beside(art: string[], label: string, cols: number, subtle: boolean): string[] | undefined {
  const artWidth = Math.max(...art.map(visualWidth));
  const message = wrapAnsiWithIndent(
    type.hint(label),
    cols - visualWidth(space.indent) - artWidth - 2,
    '',
  );
  if (message.length > art.length) return undefined;

  const offset = Math.floor((art.length - message.length) / 2);
  return art.map(
    (line, index) =>
      space.indent +
      (subtle ? c.subtle(padEndV(line, artWidth)) : padEndV(line, artWidth)) +
      (message[index - offset] ? `  ${message[index - offset]}` : ''),
  );
}
