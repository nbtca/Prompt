import { c, space, type } from '../theme.js';
import { padEndV, visualWidth, wrapAnsiWithIndent } from '../text.js';
import { magnifier, moonSky, orbit, signalLost } from '../../art/motifs.js';
import { pictureBeside } from './picture.js';
import { loadingLines } from './spinner.js';

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

const MIN_PICTURE_COLS = 44;

/** A small planet with an orbiting moon beside the label, or the plain spinner line when there is no room. */
export function loadingStateLines(
  label: string,
  cols = Number.POSITIVE_INFINITY,
  rows = Number.POSITIVE_INFINITY,
  at = Date.now(),
): string[] {
  const picture = orbit(at);
  if (cols < MIN_PICTURE_COLS || rows < picture.length) return loadingLines(label, cols, at);
  return beside(picture, label, cols, false) ?? loadingLines(label, cols, at);
}

/**
 * The error headline beside a dropped-signal tower, with the hint below at full width so a URL never wraps.
 * Falls back to the plain lines when there is no room.
 */
export function offlineContext(
  headline: string,
  hint: readonly string[],
  fallback: string[],
  cols = Number.POSITIVE_INFINITY,
  rows = Number.POSITIVE_INFINITY,
): string[] {
  const picture = signalLost();
  if (cols < MIN_PICTURE_COLS || rows < picture.length + hint.length + 1) return fallback;
  const lines = pictureBeside(picture, [headline], cols, 24);
  return lines ? [...lines, ...hint, ''] : fallback;
}
