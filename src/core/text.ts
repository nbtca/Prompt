/** Codepoints that occupy zero terminal columns: combining modifiers that
 * merge into the glyph immediately before them, rather than rendering as
 * their own character (zero-width joiner, variation selectors). Emoji
 * sequences like a ZWJ family emoji or "❤️" (heart + VS-16) render as one
 * glyph — counting the modifier itself would overcount by a full column. */
function isZeroWidth(cp: number): boolean {
  return cp === 0x200D // zero-width joiner
    || cp === 0xFE0E    // variation selector-15 (text presentation)
    || cp === 0xFE0F;   // variation selector-16 (emoji presentation)
}

/** Width of a single Unicode character: 2 for CJK/fullwidth/emoji, 1 otherwise. */
function charWidth(ch: string): 1 | 2 {
  const cp = ch.codePointAt(0) ?? 0;
  return (
    (cp >= 0x1100 && cp <= 0x115F) ||
    (cp >= 0x2E80 && cp <= 0x303F) ||
    (cp >= 0x3040 && cp <= 0x33FF) ||
    (cp >= 0x3400 && cp <= 0x4DBF) ||
    (cp >= 0x4E00 && cp <= 0x9FFF) ||
    (cp >= 0xAC00 && cp <= 0xD7AF) ||
    (cp >= 0xF900 && cp <= 0xFAFF) ||
    (cp >= 0xFE30 && cp <= 0xFE4F) ||
    (cp >= 0xFF00 && cp <= 0xFF60) ||
    (cp >= 0xFFE0 && cp <= 0xFFE6) ||
    (cp >= 0x20000 && cp <= 0x2A6DF) ||
    (cp >= 0x2A700 && cp <= 0x2CEAF) ||
    (cp >= 0x2CEB0 && cp <= 0x2EBEF) ||
    (cp >= 0x30000 && cp <= 0x323AF) ||
    // Emoji block (Misc Symbols & Pictographs, Emoticons, Transport, Chess
    // Symbols, Supplemental Symbols & Pictographs, Extended-A). Real
    // terminals render these as double-width glyphs; undercounting even one
    // emoji is enough to push a line one column past the terminal width and
    // trigger an unwanted auto-wrap — this is a real bug that was found: an
    // emoji-titled event line loading in scrolled the app's header out of
    // view because of exactly this miscount.
    (cp >= 0x1F300 && cp <= 0x1FAFF)
  ) ? 2 : 1;
}

/** Strip ANSI escape sequences from a string. */
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
export function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, '');
}

/** Total visual width of a string (CJK/emoji count as 2, zero-width
 * modifiers count as 0, ANSI codes ignored). */
export function visualWidth(str: string): number {
  const plain = stripAnsi(str);
  let w = 0;
  for (const ch of plain) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isZeroWidth(cp)) continue;
    w += charWidth(ch);
  }
  return w;
}

/** Pad string to target visual width with trailing spaces. */
export function padEndV(str: string, width: number): string {
  const pad = width - visualWidth(str);
  return pad > 0 ? str + ' '.repeat(pad) : str;
}

/** Truncate to visual width limit, appending '...' if cut. */
export function truncate(str: string, maxWidth: number): string {
  if (visualWidth(str) <= maxWidth) return str;
  let w = 0;
  let i = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0) ?? 0;
    const cw = isZeroWidth(cp) ? 0 : charWidth(ch);
    if (w + cw > maxWidth - 3) break;
    w += cw;
    i += ch.length;
  }
  return str.slice(0, i) + '...';
}
