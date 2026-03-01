/** Width of a single Unicode character: 2 for CJK/fullwidth, 1 otherwise. */
function charWidth(ch: string): 1 | 2 {
  const cp = ch.codePointAt(0) ?? 0;
  return (
    (cp >= 0x1100 && cp <= 0x115F) ||  // Hangul Jamo
    (cp >= 0x2E80 && cp <= 0x303F) ||  // CJK Radicals / Kangxi
    (cp >= 0x3040 && cp <= 0x33FF) ||  // Japanese kana + CJK symbols
    (cp >= 0x3400 && cp <= 0x4DBF) ||  // CJK Extension A
    (cp >= 0x4E00 && cp <= 0x9FFF) ||  // CJK Unified Ideographs
    (cp >= 0xAC00 && cp <= 0xD7AF) ||  // Hangul Syllables
    (cp >= 0xF900 && cp <= 0xFAFF) ||  // CJK Compatibility Ideographs
    (cp >= 0xFE30 && cp <= 0xFE4F) ||  // CJK Compatibility Forms
    (cp >= 0xFF00 && cp <= 0xFF60) ||  // Fullwidth Forms
    (cp >= 0xFFE0 && cp <= 0xFFE6)     // Fullwidth Signs
  ) ? 2 : 1;
}

/** Total visual width of a string (CJK characters count as 2). */
export function visualWidth(str: string): number {
  let w = 0;
  for (const ch of str) w += charWidth(ch);
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
