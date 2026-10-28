import { space } from '../theme.js';
import { padEndV, visualWidth, wrapAnsiWithIndent } from '../text.js';

const GAP = 2;

/** Lays a picture beside styled text; undefined when there is no room for the text next to it. */
export function pictureBeside(
  picture: readonly string[],
  text: readonly string[],
  cols: number,
  minTextWidth = 20,
): string[] | undefined {
  const pictureWidth = Math.max(0, ...picture.map(visualWidth));
  const textWidth = cols - visualWidth(space.indent) - pictureWidth - GAP;
  if (textWidth < minTextWidth) return undefined;
  const wrapped = text.flatMap((line) => wrapAnsiWithIndent(line, textWidth, ''));
  const rows = Math.max(picture.length, wrapped.length);
  const offset = Math.max(0, Math.floor((picture.length - wrapped.length) / 2));
  return Array.from({ length: rows }, (_, index) => {
    const line = picture[index] ?? '';
    const message = wrapped[index - offset];
    return `${space.indent}${padEndV(line, pictureWidth)}${message === undefined ? '' : ' '.repeat(GAP) + message}`;
  });
}
