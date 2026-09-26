import chalk from 'chalk';
import type { MarkedToken, Token, Tokens } from 'marked';
import { c, glyph, type } from '../core/theme.js';
import { pickIcon } from '../core/icons.js';
import {
  padEndV,
  sanitizeTerminalText,
  stripAnsi,
  visualWidth,
  wrapAnsiToVisualWidth,
} from '../core/text.js';

export function isInternalHref(href: string): boolean {
  return /^\.{0,2}\/./.test(href);
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d{1,7})|#x([\da-f]{1,6})|([a-z]+));/gi,
    (match: string, dec?: string, hex?: string, name?: string) => {
      if (name) return ENTITIES[name.toLowerCase()] ?? match;
      const codePoint = dec ? Number(dec) : parseInt(hex ?? '', 16);
      return codePoint <= 0x10ffff ? sanitizeTerminalText(String.fromCodePoint(codePoint)) : match;
    },
  );
}

const CJK =
  '[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}\\u3000-\\u303f\\uff00-\\uffef]';
const CJK_SOFT_BREAK = new RegExp(`(?<=${CJK})[ \\t]*\\n[ \\t]*(?=${CJK})`, 'gu');

function joinSoftBreaks(text: string): string {
  return text.replace(CJK_SOFT_BREAK, '').replace(/[ \t]*\n[ \t]*/g, ' ');
}

function renderInline(tokens: readonly Token[] | undefined): string {
  return (tokens ?? []).map((token) => renderInlineToken(token as MarkedToken)).join('');
}

function renderLink(token: Tokens.Link): string {
  return chalk.underline(c.accent(renderInline(token.tokens)));
}

function renderInlineToken(token: MarkedToken): string {
  switch (token.type) {
    case 'text':
      return token.tokens ? renderInline(token.tokens) : joinSoftBreaks(decodeEntities(token.text));
    case 'escape':
      return token.text;
    case 'strong':
      return chalk.bold(renderInline(token.tokens));
    case 'em':
      return chalk.italic(renderInline(token.tokens));
    case 'del':
      return chalk.strikethrough(c.muted(renderInline(token.tokens)));
    case 'codespan':
      return c.code(token.text);
    case 'br':
      return '\n';
    case 'link':
      return renderLink(token);
    case 'image':
      return `${pickIcon('🖼️', '[image]')} ${token.text || 'image'}`;
    case 'html':
    case 'blockquote':
    case 'code':
    case 'def':
    case 'heading':
    case 'hr':
    case 'list':
    case 'list_item':
    case 'paragraph':
    case 'space':
    case 'table':
      return '';
  }
}

function wrap(text: string, width: number): string[] {
  return text.split('\n').flatMap((line) => wrapAnsiToVisualWidth(line, width));
}

function hang(lines: readonly string[], first: string, rest: string): string[] {
  return lines.map((line, index) => {
    if (index === 0) return first + line;
    return line ? rest + line : '';
  });
}

function styleHeading(text: string, depth: number): string {
  if (depth === 1) return chalk.bold(c.brand(text));
  if (depth === 2) return type.heading(text);
  if (depth === 3) return c.label(text);
  return chalk.bold(text);
}

function renderHeading(token: Tokens.Heading, width: number): string[] {
  const lines = wrap(styleHeading(renderInline(token.tokens), token.depth), width);
  if (token.depth !== 2) return lines;
  const underline = Math.min(width, Math.max(...lines.map(visualWidth)));
  return [...lines, c.muted(glyph.rule().repeat(underline))];
}

function renderCode(token: Tokens.Code, width: number): string[] {
  const gutter = c.muted(glyph.bar());
  const body = token.text
    .replace(/\t/g, '    ')
    .split('\n')
    .flatMap((line) => wrapAnsiToVisualWidth(line, Math.max(1, width - 2)))
    .map((line) => (line ? `${gutter} ${c.code(line)}` : gutter));
  const lang = token.lang?.split(/\s/, 1)[0];
  return lang ? [c.muted(lang), ...body] : body;
}

function renderBlockquote(token: Tokens.Blockquote, width: number, depth: number): string[] {
  const bar = c.accent(glyph.bar());
  return renderBlocks(token.tokens, Math.max(1, width - 2), depth, false).map((line) =>
    line ? `${bar} ${line}` : bar,
  );
}

const BULLETS = ['•', '◦', '▪'] as const;

function renderList(token: Tokens.List, width: number, depth: number): string[] {
  const start = token.start === '' ? 1 : token.start;
  const bullet = pickIcon(BULLETS[depth % BULLETS.length] ?? '•', '-');
  const numbers = token.items.map((_, index) => `${start + index}.`);
  const numberWidth = Math.max(...numbers.map((label) => label.length));
  const lines: string[] = [];
  token.items.forEach((item, index) => {
    const marker = token.ordered ? (numbers[index] ?? '').padStart(numberWidth) : bullet;
    const box = item.task
      ? item.checked
        ? c.success(pickIcon('☑', '[x]'))
        : c.muted(pickIcon('☐', '[ ]'))
      : '';
    const first = `${c.accent(marker)} ${box ? `${box} ` : ''}`;
    const indent = ' '.repeat(visualWidth(first));
    const body = renderBlocks(
      item.tokens,
      Math.max(1, width - indent.length),
      depth + 1,
      !token.loose,
    );
    if (token.loose && index > 0) lines.push('');
    lines.push(...hang(body.length > 0 ? body : [''], first, indent));
  });
  return lines;
}

const MIN_COLUMN = 6;

function alignCell(text: string, width: number, align: Tokens.TableCell['align']): string {
  const pad = Math.max(0, width - visualWidth(text));
  if (align === 'right') return ' '.repeat(pad) + text;
  if (align === 'center') {
    const left = Math.floor(pad / 2);
    return ' '.repeat(left) + text + ' '.repeat(pad - left);
  }
  return text + ' '.repeat(pad);
}

function cellWidth(text: string): number {
  return Math.max(0, ...text.split('\n').map(visualWidth));
}

function renderRecords(
  header: readonly string[],
  rows: readonly string[][],
  width: number,
): string[] {
  const labelWidth = Math.min(
    Math.max(...header.map(visualWidth)),
    Math.max(1, Math.floor(width / 3)),
  );
  const valueWidth = Math.max(1, width - labelWidth - 2);
  const lines: string[] = [];
  rows.forEach((row, rowIndex) => {
    if (rowIndex > 0) lines.push(c.muted(glyph.rule().repeat(width)));
    header.forEach((label, column) => {
      const value = row[column] ?? '';
      if (!stripAnsi(value).trim()) return;
      const labels = wrapAnsiToVisualWidth(label, labelWidth);
      const values = wrap(value, valueWidth);
      for (let line = 0; line < Math.max(labels.length, values.length); line += 1) {
        const text = values[line] ?? '';
        lines.push(`${c.muted(padEndV(labels[line] ?? '', labelWidth))}${text ? `  ${text}` : ''}`);
      }
    });
  });
  return lines;
}

function renderTable(token: Tokens.Table, width: number): string[] {
  const header = token.header.map((cell) => renderInline(cell.tokens));
  const rows = token.rows.map((row) => row.map((cell) => renderInline(cell.tokens)));
  const natural = header.map((label, column) =>
    Math.max(cellWidth(label), ...rows.map((row) => cellWidth(row[column] ?? ''))),
  );
  const available = width - (3 * header.length + 1);
  const floor = natural.map((columnWidth) => Math.min(columnWidth, MIN_COLUMN));
  if (available < floor.reduce((sum, value) => sum + value, 0)) {
    return renderRecords(header, rows, width);
  }

  const widths = [...natural];
  const total = widths.reduce((sum, value) => sum + value, 0);
  for (let excess = total - available; excess > 0; excess -= 1) {
    const slack = widths.map((value, column) => value - (floor[column] ?? 0));
    const widest = slack.indexOf(Math.max(...slack));
    widths[widest] = (widths[widest] ?? 0) - 1;
  }

  const corners = pickIcon('┌┬┐├┼┤└┴┘', '+++++++++');
  const border = (row: 0 | 1 | 2) =>
    c.muted(
      corners.charAt(row * 3) +
        widths.map((w) => glyph.rule().repeat(w + 2)).join(corners.charAt(row * 3 + 1)) +
        corners.charAt(row * 3 + 2),
    );
  const bar = c.muted(glyph.bar());
  const renderRow = (cells: readonly string[]): string[] => {
    const wrapped = widths.map((w, column) => wrap(cells[column] ?? '', Math.max(1, w)));
    const height = Math.max(...wrapped.map((lines) => lines.length));
    return Array.from({ length: height }, (_, line) => {
      const parts = wrapped.map((lines, column) =>
        alignCell(lines[line] ?? '', widths[column] ?? 0, token.align[column] ?? null),
      );
      return `${bar} ${parts.join(` ${bar} `)} ${bar}`;
    });
  };

  const body = rows.map(renderRow);
  const separated = body.some((lines) => lines.length > 1);
  return [
    border(0),
    ...renderRow(header.map((label) => chalk.bold(label))),
    border(1),
    ...body.flatMap((lines, index) => (separated && index > 0 ? [border(1), ...lines] : lines)),
    border(2),
  ];
}

function renderBlock(token: MarkedToken, width: number, depth: number): string[] {
  switch (token.type) {
    case 'heading':
      return renderHeading(token, width);
    case 'paragraph':
      return wrap(renderInline(token.tokens), width);
    case 'text':
      return wrap(renderInlineToken(token), width);
    case 'code':
      return renderCode(token, width);
    case 'blockquote':
      return renderBlockquote(token, width, depth);
    case 'list':
      return renderList(token, width, depth);
    case 'table':
      return renderTable(token, width);
    case 'hr':
      return [c.muted(glyph.rule().repeat(width))];
    case 'html': {
      const text = decodeEntities(token.text.replace(/<[^>]*>/g, '')).trim();
      return text ? wrap(text, width) : [];
    }
    case 'space':
    case 'def':
    case 'list_item':
      return [];
    case 'br':
    case 'codespan':
    case 'del':
    case 'em':
    case 'escape':
    case 'image':
    case 'link':
    case 'strong':
      return wrap(renderInlineToken(token), width);
  }
}

function renderBlocks(
  tokens: readonly Token[],
  width: number,
  depth: number,
  tight: boolean,
): string[] {
  const lines: string[] = [];
  for (const token of tokens) {
    const block = renderBlock(token as MarkedToken, width, depth);
    if (block.length === 0) continue;
    if (lines.length > 0 && !tight) lines.push('');
    lines.push(...block);
  }
  return lines;
}

export function renderMarkdown(tokens: readonly Token[], width: number): string[] {
  return renderBlocks(tokens, Math.max(1, Math.floor(width)), 0, false);
}
