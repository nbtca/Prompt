/** Width of a single Unicode character: 2 for CJK/fullwidth, 1 otherwise. */
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
    (cp >= 0x30000 && cp <= 0x323AF)
  ) ? 2 : 1;
}

/** Strip ANSI escape sequences from a string. */
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
export function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, '');
}

/** Total visual width of a string (CJK characters count as 2, ANSI codes ignored). */
export function visualWidth(str: string): number {
  const plain = stripAnsi(str);
  let w = 0;
  for (const ch of plain) w += charWidth(ch);
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
    const cw = charWidth(ch);
    if (w + cw > maxWidth - 3) break;
    w += cw;
    i += ch.length;
  }
  return str.slice(0, i) + '...';
}
