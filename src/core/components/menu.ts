import { glyph, type, space } from '../theme.js';
import { visualWidth, padEndV, wrapAnsiToVisualWidth } from '../text.js';
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
  const contentWidth = Math.max(1, width - visualWidth(indent));
  return wrapAnsiToVisualWidth(style(label), contentWidth).map((line) => `${indent}${line}`);
}

export function renderMenuOption(
  option: MenuOption,
  selected: boolean,
  labelWidth = visualWidth(option.label),
  cols = Number.POSITIVE_INFINITY,
): string[] {
  const width = normalizedWidth(cols);
  const cursor = glyph.cursor();
  const gap = ' '.repeat(visualWidth(cursor));
  const marker = selected ? type.active(cursor) : gap;
  const prefixes = [`${space.indent}${marker} `, `${marker} `, marker, ''];
  const prefix = prefixes.find((candidate) => visualWidth(candidate) < width) ?? '';
  const continuation = ' '.repeat(visualWidth(prefix));
  const contentWidth = Math.max(1, width - visualWidth(prefix));
  const hintWidth = option.hint ? 2 + visualWidth(option.hint) : 0;
  const paddedWidth =
    labelWidth + hintWidth <= contentWidth ? labelWidth : visualWidth(option.label);
  const padded = padEndV(option.label, paddedWidth);
  const label = selected ? type.active(padded) : type.body(padded);
  const hint = option.hint ? `  ${type.hint(option.hint)}` : '';
  return wrapAnsiToVisualWidth(`${label}${hint}`, contentWidth).map(
    (line, index) => `${index === 0 ? prefix : continuation}${line}`,
  );
}

export function renderMenu(state: MenuState, cols = Number.POSITIVE_INFINITY): string {
  const labelWidth = state.options.reduce(
    (width, option) => Math.max(width, visualWidth(option.label)),
    0,
  );

  const lines = state.title ? [...renderIndentedText(state.title, cols, type.heading), ''] : [];

  state.options.forEach((option, index) => {
    lines.push(...renderMenuOption(option, index === state.selectedIndex, labelWidth, cols));
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
