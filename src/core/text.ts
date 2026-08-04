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

interface WrapToken {
  raw: string;
  width: number;
  whitespace: boolean;
  sgr: boolean;
}

function tokenizeForWrapping(str: string): WrapToken[] {
  const tokens: WrapToken[] = [];
  let index = 0;

  while (index < str.length) {
    const ansi = /^\x1b\[[0-9;]*m/.exec(str.slice(index));
    if (ansi) {
      tokens.push({ raw: ansi[0], width: 0, whitespace: false, sgr: true });
      index += ansi[0].length;
      continue;
    }

    const cp = str.codePointAt(index) ?? 0;
    const raw = String.fromCodePoint(cp);
    tokens.push({
      raw,
      width: isZeroWidth(cp) ? 0 : charWidth(raw),
      whitespace: /\s/u.test(raw),
      sgr: false,
    });
    index += raw.length;
  }

  return tokens;
}

function advanceSgr(active: string, tokens: WrapToken[], start: number, end: number): string {
  let next = active;
  for (let index = start; index < end; index += 1) {
    const token = tokens[index];
    if (!token?.sgr) continue;
    const params = token.raw.slice(2, -1).split(';');
    if (params.includes('0') || params[0] === '') {
      next = params.length === 1 ? '' : token.raw;
    } else {
      next += token.raw;
    }
  }
  return next;
}

function renderWrappedSegment(tokens: WrapToken[], start: number, end: number, prefix: string): string {
  const body = tokens.slice(start, end).map((token) => token.raw).join('');
  const styled = prefix + body;
  return prefix || tokens.slice(start, end).some((token) => token.sgr)
    ? `${styled}\x1b[0m`
    : styled;
}

export function wrapAnsiToVisualWidth(str: string, maxWidth: number): string[] {
  const widthLimit = Math.max(1, Math.floor(maxWidth));
  if (!Number.isFinite(maxWidth) || visualWidth(str) <= widthLimit) return [str];

  const tokens = tokenizeForWrapping(str);
  const lines: string[] = [];
  let activeSgr = '';
  let start = 0;

  while (start < tokens.length) {
    let width = 0;
    let hasVisible = false;
    let lastWhitespace = -1;
    let index = start;

    while (index < tokens.length) {
      const token = tokens[index];
      if (!token) break;
      if (token.sgr || token.width === 0) {
        index += 1;
        continue;
      }
      if (width + token.width > widthLimit && hasVisible) break;
      width += token.width;
      hasVisible = true;
      if (token.whitespace) lastWhitespace = index;
      index += 1;
    }

    if (index >= tokens.length) {
      lines.push(renderWrappedSegment(tokens, start, tokens.length, activeSgr));
      break;
    }

    const overflow = tokens[index];
    let end = index;
    let next = index;
    if (overflow?.whitespace) {
      next = index + 1;
    } else if (lastWhitespace >= start) {
      end = lastWhitespace;
      next = lastWhitespace + 1;
    }

    if (end === start) {
      end = Math.max(index, start + 1);
      next = end;
    }

    lines.push(renderWrappedSegment(tokens, start, end, activeSgr));
    activeSgr = advanceSgr(activeSgr, tokens, start, next);
    start = next;
  }

  return lines.length > 0 ? lines : [''];
}
