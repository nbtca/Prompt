import { glyph, type, space } from '../theme.js';
import { visualWidth, padEndV } from '../text.js';

export type MenuKey = 'up' | 'down' | 'home' | 'end' | 'enter' | 'cancel' | 'none';

export function parseKey(data: Buffer | string): MenuKey {
  const s = data.toString();
  switch (s) {
    case '\x1b[A': return 'up';
    case '\x1b[B': return 'down';
    case '\x1b[H': return 'home';
    case '\x1b[F': return 'end';
    case '\r':
    case '\n': return 'enter';
    case '\x03':
    case '\x1b': return 'cancel';
    default: return 'none';
  }
}

export function nextIndex(current: number, key: MenuKey, len: number): number {
  if (len <= 0) return 0;
  switch (key) {
    case 'up': return (current - 1 + len) % len;
    case 'down': return (current + 1) % len;
    case 'home': return 0;
    case 'end': return len - 1;
    default: return current;
  }
}

export interface MenuOption {
  value: string;
  label: string;
  hint?: string;
}

export interface MenuState {
  title: string;
  options: MenuOption[];
  selectedIndex: number;
  footer?: string;
}

export function renderMenu(state: MenuState): string {
  const cursor = glyph.cursor();
  const gap = ' '.repeat(visualWidth(cursor));
  const labelWidth = state.options.reduce((w, o) => Math.max(w, visualWidth(o.label)), 0);

  const lines: string[] = [];
  lines.push(space.indent + type.heading(state.title));
  lines.push('');

  state.options.forEach((opt, i) => {
    const selected = i === state.selectedIndex;
    const marker = selected ? type.heading(cursor) : gap;
    const padded = padEndV(opt.label, labelWidth);
    const label = selected ? type.heading(padded) : type.body(padded);
    const hint = opt.hint ? '  ' + type.hint(opt.hint) : '';
    lines.push(`${space.indent}${marker} ${label}${hint}`);
  });

  if (state.footer) {
    lines.push('');
    lines.push(space.indent + type.hint(state.footer));
  }

  return lines.join('\n');
}
