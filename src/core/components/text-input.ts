import { glyph, type, space } from '../theme.js';

export type InputEvent =
  | { type: 'char'; ch: string }
  | { type: 'backspace' }
  | { type: 'enter' }
  | { type: 'cancel' }
  | { type: 'none' };

export function parseInputData(data: Buffer | string): InputEvent {
  const s = data.toString();
  if (s === '\r' || s === '\n') return { type: 'enter' };
  if (s === '\x03' || s === '\x1b') return { type: 'cancel' };
  if (s === '\x7f' || s === '\b') return { type: 'backspace' };
  // Single printable character (not a control byte, not a multi-byte escape seq)
  if ([...s].length === 1 && s >= ' ') return { type: 'char', ch: s };
  return { type: 'none' };
}

export function applyInputEvent(value: string, ev: InputEvent): string {
  if (ev.type === 'char') return value + ev.ch;
  if (ev.type === 'backspace') return [...value].slice(0, -1).join('');
  return value;
}

export function renderInput(opts: { message: string; value: string; placeholder?: string }): string {
  const shown = opts.value.length > 0
    ? type.body(opts.value)
    : type.hint(opts.placeholder ?? '');
  return [
    space.indent + type.label(opts.message),
    `${space.indent}${type.heading(glyph.cursor())} ${shown}`,
  ].join('\n');
}
