import { glyph, type, space } from '../theme.js';
import { startRawInput } from './input-session.js';
import { setVimKeysActive } from '../vim-keys.js';
import { createPainter } from './painter.js';

export type InputEvent =
  | { type: 'char'; ch: string }
  | { type: 'backspace' }
  | { type: 'enter' }
  | { type: 'cancel' }
  | { type: 'none' };

export function parseInputData(data: Buffer | string): InputEvent {
  const s = data.toString();
  if (s === '\r' || s === '\n') return { type: 'enter' };
  if (s === '\x03') return { type: 'cancel' };          // ctrl-c
  if (s === '\x1b') return { type: 'cancel' };           // bare esc
  if (s === '\x7f' || s === '\b') return { type: 'backspace' };
  if (s.startsWith('\x1b')) return { type: 'none' };     // escape sequence (arrows, etc.)
  // printable run: drop control chars, keep the rest (supports paste / batched keys)
  const text = [...s].filter((ch) => ch >= ' ' && ch !== '\x7f').join('');
  return text.length > 0 ? { type: 'char', ch: text } : { type: 'none' };
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

export interface RunTextInputConfig {
  message: string;
  placeholder?: string;
}

export function runTextInput(config: RunTextInputConfig): Promise<string | null> {
  return new Promise((resolve) => {
    let value = '';

    const frame = () => renderInput({ message: config.message, value, placeholder: config.placeholder });

    const paint = createPainter(frame);

    const onData = (data: Buffer) => {
      const ev = parseInputData(data);
      if (ev.type === 'cancel') { finish(null); return; }
      if (ev.type === 'enter') { finish(value); return; }
      const next = applyInputEvent(value, ev);
      if (next !== value) { value = next; paint(); }
    };

    const finish = (result: string | null) => {
      handle?.stop();
      setVimKeysActive(true);
      process.stdout.write('\n');
      resolve(result);
    };

    setVimKeysActive(false);
    const handle = startRawInput(onData);
    if (!handle) { setVimKeysActive(true); resolve(null); return; }
    paint();
  });
}
