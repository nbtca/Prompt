const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const MARK_RE = /^\p{Mark}$/u;
const EMOJI_PRESENTATION_RE = /\p{Emoji_Presentation}/u;
const REGIONAL_INDICATOR_RE = /\p{Regional_Indicator}/u;

function graphemes(value: string): string[] {
  return Array.from(GRAPHEME_SEGMENTER.segment(value), ({ segment }) => segment);
}

function isZeroWidth(cp: number): boolean {
  return (
    cp === 0x200d || // zero-width joiner
    cp === 0xfe0e || // variation selector-15 (text presentation)
    cp === 0xfe0f
  ); // variation selector-16 (emoji presentation)
}

function codePointWidth(ch: string): 0 | 1 | 2 {
  const cp = ch.codePointAt(0) ?? 0;
  if (isZeroWidth(cp) || MARK_RE.test(ch) || cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return 0;
  return (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303f) ||
    (cp >= 0x3040 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x2a6df) ||
    (cp >= 0x2a700 && cp <= 0x2ceaf) ||
    (cp >= 0x2ceb0 && cp <= 0x2ebef) ||
    (cp >= 0x30000 && cp <= 0x323af) ||
    (cp >= 0x1f300 && cp <= 0x1faff)
    ? 2
    : 1;
}

function graphemeWidth(grapheme: string): number {
  if (
    grapheme.includes('\ufe0f') ||
    grapheme.includes('\u20e3') ||
    EMOJI_PRESENTATION_RE.test(grapheme) ||
    REGIONAL_INDICATOR_RE.test(grapheme)
  ) {
    return 2;
  }
  let width = 0;
  for (const ch of grapheme) width = Math.max(width, codePointWidth(ch));
  return width;
}

const TERMINAL_ESCAPE_RE =
  /(?:\u001B\]|\u009D)[\s\S]*?(?:\u0007|\u001B\\|\u009C|$)|(?:\u001B[P_X^]|[\u0090\u0098\u009E\u009F])[\s\S]*?(?:\u001B\\|\u009C|$)|(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]|\u001B[ -/]*[@-~]/g;
const SGR_RE = /^(?:\u001B\[|\u009B)[0-9;]*m$/;
const OSC8_RE = /^(?:\u001B\]|\u009D)8;[^;]*;([\s\S]*?)(?:\u0007|\u001B\\|\u009C)$/;
const OSC8_CLOSE = '\u001B]8;;\u0007';

export function stripAnsi(str: string): string {
  return str.replace(TERMINAL_ESCAPE_RE, '');
}

const CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

export function sanitizeTerminalText(str: string): string {
  return str.replace(/\r\n?/g, '\n').replace(TERMINAL_ESCAPE_RE, '').replace(CONTROL_RE, '');
}

export function sanitizeTerminalLine(str: string): string {
  return sanitizeTerminalText(str).replace(/\s+/gu, ' ').trim();
}

export function visualWidth(str: string): number {
  const plain = stripAnsi(str);
  let w = 0;
  for (const grapheme of graphemes(plain)) w += graphemeWidth(grapheme);
  return w;
}

export function padEndV(str: string, width: number): string {
  const pad = width - visualWidth(str);
  return pad > 0 ? str + ' '.repeat(pad) : str;
}

export function truncate(str: string, maxWidth: number): string {
  if (visualWidth(str) <= maxWidth) return str;
  if (maxWidth <= 0) return '';
  const marker = maxWidth >= 3 ? '...' : '.'.repeat(maxWidth);
  const available = maxWidth - visualWidth(marker);
  let w = 0;
  let value = '';
  for (const grapheme of graphemes(str)) {
    const cw = graphemeWidth(grapheme);
    if (w + cw > available) break;
    w += cw;
    value += grapheme;
  }
  return value + marker;
}

export function truncateStart(str: string, maxWidth: number, marker = '...'): string {
  if (visualWidth(str) <= maxWidth) return str;
  if (maxWidth <= 0) return '';
  let fittedMarker = '';
  let markerWidth = 0;
  for (const segment of graphemes(marker)) {
    const segmentWidth = graphemeWidth(segment);
    if (markerWidth + segmentWidth > maxWidth) break;
    fittedMarker += segment;
    markerWidth += segmentWidth;
  }
  const available = Math.max(0, maxWidth - visualWidth(fittedMarker));
  const segments = graphemes(str);
  let value = '';
  let width = 0;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment === undefined) continue;
    const segmentWidth = graphemeWidth(segment);
    if (width + segmentWidth > available) break;
    value = segment + value;
    width += segmentWidth;
  }
  return fittedMarker + value;
}

interface WrapToken {
  raw: string;
  width: number;
  whitespace: boolean;
  sgr: boolean;
  osc8?: string | null;
}

function osc8State(sequence: string): string | null | undefined {
  const match = OSC8_RE.exec(sequence);
  if (!match) return undefined;
  return match[1] ? sequence : null;
}

function tokenizeForWrapping(str: string): WrapToken[] {
  const tokens: WrapToken[] = [];
  const pushText = (value: string): void => {
    for (const grapheme of graphemes(value)) {
      tokens.push({
        raw: grapheme,
        width: graphemeWidth(grapheme),
        whitespace: /\s/u.test(grapheme),
        sgr: false,
      });
    }
  };
  let index = 0;
  for (const match of str.matchAll(TERMINAL_ESCAPE_RE)) {
    const start = match.index;
    pushText(str.slice(index, start));
    const raw = match[0];
    const osc8 = osc8State(raw);
    tokens.push({
      raw,
      width: 0,
      whitespace: false,
      sgr: SGR_RE.test(raw),
      ...(osc8 === undefined ? {} : { osc8 }),
    });
    index = start + match[0].length;
  }
  pushText(str.slice(index));

  return tokens;
}

export function clipAnsiToVisualWidth(str: string, maxWidth: number): string {
  const limit = Math.max(0, Math.floor(maxWidth));
  if (visualWidth(str) <= limit) return str;
  const tokens = tokenizeForWrapping(str);
  const output: string[] = [];
  let width = 0;
  let activeOsc8: string | null = null;
  for (const token of tokens) {
    if (token.sgr || token.width === 0) {
      output.push(token.raw);
      if (token.osc8 !== undefined) activeOsc8 = token.osc8;
      continue;
    }
    if (width + token.width > limit) break;
    output.push(token.raw);
    width += token.width;
  }
  if (activeOsc8) output.push(OSC8_CLOSE);
  return output.join('');
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

function advanceOsc8(
  active: string | null,
  tokens: WrapToken[],
  start: number,
  end: number,
): string | null {
  let next = active;
  for (let index = start; index < end; index += 1) {
    const token = tokens[index];
    if (token?.osc8 !== undefined) next = token.osc8;
  }
  return next;
}

function renderWrappedSegment(
  tokens: WrapToken[],
  start: number,
  end: number,
  activeSgr: string,
  activeOsc8: string | null,
): string {
  const body = tokens
    .slice(start, end)
    .map((token) => token.raw)
    .join('');
  const styled = `${activeOsc8 ?? ''}${activeSgr}${body}`;
  const withReset =
    activeSgr || tokens.slice(start, end).some((token) => token.sgr) ? `${styled}\x1b[0m` : styled;
  const osc8AtEnd = advanceOsc8(activeOsc8, tokens, start, end);
  return osc8AtEnd ? `${withReset}${OSC8_CLOSE}` : withReset;
}

export function wrapAnsiToVisualWidth(str: string, maxWidth: number): string[] {
  const widthLimit = Math.max(1, Math.floor(maxWidth));
  if (!Number.isFinite(maxWidth) || visualWidth(str) <= widthLimit) return [str];

  const tokens = tokenizeForWrapping(str);
  const lines: string[] = [];
  let activeSgr = '';
  let activeOsc8: string | null = null;
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
      lines.push(renderWrappedSegment(tokens, start, tokens.length, activeSgr, activeOsc8));
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

    lines.push(renderWrappedSegment(tokens, start, end, activeSgr, activeOsc8));
    activeSgr = advanceSgr(activeSgr, tokens, start, next);
    activeOsc8 = advanceOsc8(activeOsc8, tokens, start, next);
    start = next;
  }

  return lines.length > 0 ? lines : [''];
}

export function wrapAnsiWithIndent(str: string, maxWidth: number, preferredIndent = ''): string[] {
  const width = Number.isFinite(maxWidth)
    ? Math.max(1, Math.floor(maxWidth))
    : Number.POSITIVE_INFINITY;
  const indentWidth = visualWidth(preferredIndent);
  const contentWidth = visualWidth(str);
  let indent =
    indentWidth >= width || (contentWidth > width - indentWidth && contentWidth <= width)
      ? ''
      : preferredIndent;
  let lines = wrapAnsiToVisualWidth(str, Math.max(1, width - visualWidth(indent)));
  if (indent && lines.some((line) => visualWidth(indent + line) > width)) {
    indent = '';
    lines = wrapAnsiToVisualWidth(str, width);
  }
  return lines.map((line) => `${indent}${line}`);
}
