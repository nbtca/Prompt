import { c, space } from '../theme.js';
import { pickIcon } from '../icons.js';

export type MessageKind = 'success' | 'error' | 'warn' | 'info';

const MARKERS: Record<MessageKind, { icon: () => string; color: (s: string) => string }> = {
  success: { icon: () => pickIcon('✓', '+'), color: c.success },
  error:   { icon: () => pickIcon('✕', 'x'), color: c.error },
  warn:    { icon: () => pickIcon('⚠', '!'), color: c.warn },
  info:    { icon: () => pickIcon('›', '>'), color: c.accent },
};

export function renderMessage(kind: MessageKind, msg: string): string {
  const m = MARKERS[kind];
  return `${space.indent}${m.color(m.icon())} ${msg}`;
}

export function success(msg: string): void { console.log(renderMessage('success', msg)); }
export function error(msg: string): void { console.log(renderMessage('error', msg)); }
export function warning(msg: string): void { console.log(renderMessage('warn', msg)); }
export function info(msg: string): void { console.log(renderMessage('info', msg)); }
