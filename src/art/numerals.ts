const FONT: Readonly<Record<string, readonly string[]>> = {
  '0': ['###', '# #', '# #', '# #', '###'],
  '1': [' # ', '## ', ' # ', ' # ', '###'],
  '2': ['###', '  #', '###', '#  ', '###'],
  '3': ['###', '  #', ' ##', '  #', '###'],
  '4': ['# #', '# #', '###', '  #', '  #'],
  '5': ['###', '#  ', '###', '  #', '###'],
  '6': ['###', '#  ', '###', '# #', '###'],
  '7': ['###', '  #', ' # ', ' # ', ' # '],
  '8': ['###', '# #', '###', '# #', '###'],
  '9': ['###', '# #', '###', '  #', '###'],
  '.': ['   ', '   ', '   ', '   ', ' # '],
  ':': ['   ', ' # ', '   ', ' # ', '   '],
};

const HALVES = { unicode: [' ', '▀', '▄', '█'], ascii: [' ', '"', '_', '#'] } as const;

/** Draws digits three rows tall by pairing the five pixel rows into half-block cells. */
export function numeralLines(text: string, unicode: boolean): string[] {
  const glyphs = Array.from(text, (ch) => FONT[ch]).filter((rows) => rows !== undefined);
  const halves = unicode ? HALVES.unicode : HALVES.ascii;
  const lines: string[] = [];
  for (let row = 0; row < 5; row += 2) {
    const cells = glyphs.map((rows) => {
      let cell = '';
      for (let x = 0; x < 3; x++) {
        const top = rows[row]?.charAt(x) === '#' ? 1 : 0;
        const bottom = rows[row + 1]?.charAt(x) === '#' ? 2 : 0;
        cell += halves[top + bottom] ?? ' ';
      }
      return cell;
    });
    lines.push(cells.join(' '));
  }
  return lines;
}
