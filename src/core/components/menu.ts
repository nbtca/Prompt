import { glyph, type, space, bodyEdge } from '../theme.js';
import { visualWidth, padEndV, wrapAnsiToVisualWidth, clipAnsiToVisualWidth } from '../text.js';
import { pickIcon } from '../icons.js';
import { createPainter } from './painter.js';
import { startRawInput } from './input-session.js';
import { t } from '../../i18n/index.js';

export type MenuKey =
  'up' | 'down' | 'pageUp' | 'pageDown' | 'home' | 'end' | 'enter' | 'cancel' | 'none';

export function parseKey(data: Buffer | string): MenuKey {
  const s = data.toString();
  switch (s) {
    case '\x1b[A':
    case 'k':
      return 'up';
    case '\x1b[B':
    case 'j':
      return 'down';
    case '\x1b[5~':
      return 'pageUp';
    case '\x1b[6~':
      return 'pageDown';
    case '\x1b[H':
    case '\x1b[1~':
    case '\x1bOH':
    case 'g':
      return 'home';
    case '\x1b[F':
    case '\x1b[4~':
    case '\x1bOF':
    case 'G':
      return 'end';
    case '\r':
    case '\n':
    case 'l':
      return 'enter';
    case '\x03':
    case '\x1b':
    case 'q':
      return 'cancel';
    default:
      return 'none';
  }
}

export function nextIndex(current: number, key: MenuKey, len: number, pageSize = 5): number {
  if (len <= 0) return 0;
  switch (key) {
    case 'up':
      return (current - 1 + len) % len;
    case 'down':
      return (current + 1) % len;
    case 'pageUp':
      return Math.max(0, current - Math.max(1, pageSize));
    case 'pageDown':
      return Math.min(len - 1, current + Math.max(1, pageSize));
    case 'home':
      return 0;
    case 'end':
      return len - 1;
    case 'enter':
    case 'cancel':
    case 'none':
      return current;
  }
}

export interface MenuOption {
  value: string;
  label: string;
  hint?: string;
  dim?: boolean;
  hintColumn?: boolean;
}

export interface MenuColumns {
  label: number;
  hint: number;
}

export function menuColumns(options: readonly MenuOption[]): MenuColumns {
  return options.reduce<MenuColumns>(
    (widths, option) => ({
      label: Math.max(widths.label, visualWidth(option.label)),
      hint: Math.max(widths.hint, option.hint ? visualWidth(option.hint) : 0),
    }),
    { label: 0, hint: 0 },
  );
}

export interface MenuState {
  title?: string;
  options: MenuOption[];
  selectedIndex: number;
  footer?: string;
}

function normalizedWidth(cols: number): number {
  return Number.isFinite(cols) ? Math.max(1, Math.floor(cols)) : Number.POSITIVE_INFINITY;
}

function renderIndentedText(
  label: string,
  cols: number,
  style: (value: string) => string,
): string[] {
  const width = normalizedWidth(cols);
  const indent = visualWidth(space.indent) < width ? space.indent : '';
  const contentWidth = Math.max(1, bodyEdge(width) - visualWidth(indent));
  return wrapAnsiToVisualWidth(style(label), contentWidth).map((line) => `${indent}${line}`);
}

const MIN_LABEL_COLUMN = 24;
const MIN_HINT_COLUMN = 16;

function clipWithEllipsis(value: string, width: number): string {
  if (visualWidth(value) <= width) return value;
  const ellipsis = pickIcon('…', '~');
  return clipAnsiToVisualWidth(value, width - visualWidth(ellipsis)) + ellipsis;
}

function fitColumns(columns: MenuColumns, contentWidth: number): MenuColumns | undefined {
  if (columns.label + 2 + columns.hint <= contentWidth) return columns;
  const hint = Math.min(
    columns.hint,
    Math.max(contentWidth - 2 - columns.label, Math.ceil(contentWidth / 3)),
  );
  const label = Math.min(columns.label, contentWidth - 2 - hint);
  const readable =
    label >= Math.min(MIN_LABEL_COLUMN, columns.label) &&
    hint >= Math.min(MIN_HINT_COLUMN, columns.hint);
  return readable ? { label, hint } : undefined;
}

function optionCells(
  option: MenuOption,
  columns: MenuColumns,
  contentWidth: number,
): { label: string; hint: string } {
  const hint = option.hint ?? '';
  if (option.hintColumn) {
    const fitted = fitColumns(columns, contentWidth);
    return fitted
      ? {
          label: padEndV(clipWithEllipsis(option.label, fitted.label), fitted.label),
          hint: clipWithEllipsis(hint, fitted.hint),
        }
      : { label: option.label, hint: '' };
  }
  const hintWidth = hint ? 2 + visualWidth(hint) : 0;
  const labelWidth =
    columns.label + hintWidth <= contentWidth ? columns.label : visualWidth(option.label);
  return { label: padEndV(option.label, labelWidth), hint };
}

export function renderMenuOption(
  option: MenuOption,
  selected: boolean,
  columns: MenuColumns = menuColumns([option]),
  cols = Number.POSITIVE_INFINITY,
): string[] {
  const width = normalizedWidth(cols);
  const cursor = glyph.cursor();
  const gap = ' '.repeat(visualWidth(cursor));
  const marker = selected ? type.active(cursor) : gap;
  const prefixes = [`${space.indent}${marker} `, `${marker} `, marker, ''];
  const prefix = prefixes.find((candidate) => visualWidth(candidate) < width) ?? '';
  const continuation = ' '.repeat(visualWidth(prefix));
  const contentWidth = Math.max(1, bodyEdge(width) - visualWidth(prefix));
  const cells = optionCells(option, columns, contentWidth);
  const style = selected ? type.active : option.dim ? type.hint : type.body;
  const hint = cells.hint ? `  ${type.hint(cells.hint)}` : '';
  const label = style(cells.label);
  return wrapAnsiToVisualWidth(`${label}${hint}`, contentWidth).map(
    (line, index) => `${index === 0 ? prefix : continuation}${line}`,
  );
}

export function renderMenu(state: MenuState, cols = Number.POSITIVE_INFINITY): string {
  const columns = menuColumns(state.options);
  const lines = state.title ? [...renderIndentedText(state.title, cols, type.heading), ''] : [];

  state.options.forEach((option, index) => {
    lines.push(...renderMenuOption(option, index === state.selectedIndex, columns, cols));
  });

  if (state.footer) {
    lines.push('');
    lines.push(...renderIndentedText(state.footer, cols, type.hint));
  }

  return lines.join('\n');
}

/** Standard navigation keyhint footer shared by every menu surface. */
export function menuFooter(): string {
  const m = t().menu;
  return `${glyph.updown()} ${m.hintMove}   ${glyph.enter()} ${m.hintOpen}   q ${m.hintQuit}`;
}

export interface RunMenuConfig {
  title: string;
  options: MenuOption[];
  footer?: string;
  initialIndex?: number;
}

export function runMenu(config: RunMenuConfig): Promise<string | null> {
  return new Promise((resolve) => {
    let index = config.initialIndex ?? 0;
    let finished = false;

    const paint = createPainter(() =>
      renderMenu({
        title: config.title,
        options: config.options,
        selectedIndex: index,
        ...(config.footer === undefined ? {} : { footer: config.footer }),
      }),
    );

    const finish = (result: string | null) => {
      if (finished) return;
      finished = true;
      handle?.stop();
      process.stdout.write('\n');
      resolve(result);
    };

    const onData = (data: Buffer) => {
      const key = parseKey(data);
      if (key === 'cancel') {
        finish(null);
        return;
      }
      if (key === 'enter') {
        finish(config.options[index]?.value ?? null);
        return;
      }
      const next = nextIndex(index, key, config.options.length);
      if (next !== index) {
        index = next;
        paint();
      }
    };

    const handle = startRawInput(onData);
    if (!handle) {
      finished = true;
      resolve(null);
      return;
    }
    paint();
  });
}
