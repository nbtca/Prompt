import { ansi } from '../core/canvas.js';
import { clipAnsiToVisualWidth, visualWidth } from '../core/text.js';

export function clipToWidth(line: string, cols: number): string {
  if (visualWidth(line) <= cols) return line;
  return clipAnsiToVisualWidth(line, cols) + '\x1b[0m';
}

export function fitLine(line: string, cols: number): string {
  const clipped = visualWidth(line) > cols ? clipToWidth(line, cols) : line;
  const pad = cols - visualWidth(clipped);
  return pad > 0 ? clipped + ' '.repeat(pad) : clipped;
}

export function fitBody(lines: string[], height: number, scroll: number, cols: number): string[] {
  const maxScroll = Math.max(0, lines.length - height);
  const start = Math.max(0, Math.min(scroll, maxScroll));
  const out = lines.slice(start, start + height).map((l) => fitLine(l, cols));
  while (out.length < height) out.push(' '.repeat(cols));
  return out;
}

export function composeFrameLines(
  header: string[],
  body: string[],
  footer: string[],
  rows: number,
  cols: number,
  scroll: number,
): string[] {
  const h = header.map((l) => fitLine(l, cols));
  const f = footer.map((l) => fitLine(l, cols));
  const bodyH = Math.max(0, rows - h.length - f.length);
  const b = fitBody(body, bodyH, scroll, cols);
  return [...h, ...b, ...f].slice(0, rows);
}

export function diffFrame(prev: readonly string[] | undefined, next: readonly string[]): string {
  if (prev?.length !== next.length) return ansi.home + next.join('\n') + ansi.eraseDown;
  let out = '';
  for (let row = 0; row < next.length; row += 1) {
    const line = next[row];
    if (line !== undefined && prev[row] !== line) out += ansi.cursorToRow(row + 1) + line;
  }
  return out;
}

export function computeBodyRows(rows: number, headerLines: number, footerLines: number): number {
  return Math.max(0, rows - headerLines - footerLines);
}
