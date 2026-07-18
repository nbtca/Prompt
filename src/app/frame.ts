import { visualWidth } from '../core/text.js';

export function clipToWidth(line: string, cols: number): string {
  if (visualWidth(line) <= cols) return line;
  let out = '';
  let w = 0;
  let i = 0;
  while (i < line.length) {
    const esc = line.slice(i).match(/^\x1b\[[0-9;]*m/);
    if (esc) { out += esc[0]; i += esc[0].length; continue; }
    const cp = line.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const cw = visualWidth(ch);
    if (w + cw > cols) break;
    out += ch; w += cw; i += ch.length;
  }
  return out + '\x1b[0m';
}

export function fitLine(line: string, cols: number): string {
  const clipped = visualWidth(line) > cols ? clipToWidth(line, cols) : line;
  const pad = cols - visualWidth(clipped);
  return pad > 0 ? clipped + ' '.repeat(pad) : clipped;
}

/** Left-pads every line by the same amount so the body renders as one
 * horizontally-centered block, rather than pinned to the left edge with
 * unused space on the right. Content that already fills (or nearly fills)
 * `cols` gets ~0 padding and stays put -- this only visibly centers content
 * that's genuinely narrower than the terminal. */
export function centerLines(lines: string[], cols: number): string[] {
  if (lines.length === 0) return lines;
  const maxWidth = Math.max(0, ...lines.map((l) => visualWidth(l)));
  const pad = Math.max(0, Math.floor((cols - maxWidth) / 2));
  if (pad === 0) return lines;
  const prefix = ' '.repeat(pad);
  return lines.map((l) => prefix + l);
}

export function fitBody(lines: string[], height: number, scroll: number, cols: number): string[] {
  const maxScroll = Math.max(0, lines.length - height);
  const start = Math.max(0, Math.min(scroll, maxScroll));
  const out = lines.slice(start, start + height).map((l) => fitLine(l, cols));
  while (out.length < height) out.push(' '.repeat(cols));
  return out;
}

export function composeFrame(
  header: string[], body: string[], footer: string[], rows: number, cols: number, scroll: number,
): string {
  const h = header.map((l) => fitLine(l, cols));
  const f = footer.map((l) => fitLine(l, cols));
  const bodyH = Math.max(0, rows - h.length - f.length);
  const b = fitBody(centerLines(body, cols), bodyH, scroll, cols);
  return [...h, ...b, ...f].slice(0, rows).join('\n');
}

export function computeBodyRows(rows: number, headerLines: number, footerLines: number): number {
  return Math.max(0, rows - headerLines - footerLines);
}
