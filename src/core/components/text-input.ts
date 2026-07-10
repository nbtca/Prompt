import { glyph, type, space } from '../theme.js';
import { startRawInput } from './input-session.js';
import { ansi } from '../canvas.js';
import { setVimKeysActive } from '../vim-keys.js';

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

export interface RunTextInputConfig {
  message: string;
  placeholder?: string;
}

export function runTextInput(config: RunTextInputConfig): Promise<string | null> {
  return new Promise((resolve) => {
    let value = '';
    let painted = 0;

    const frame = () => renderInput({ message: config.message, value, placeholder: config.placeholder });

    const paint = () => {
      const f = frame();
      const lineCount = f.split('\n').length;
      if (painted > 0) {
        process.stdout.write(ansi.cursorUp(painted - 1) + ansi.cursorToCol0 + ansi.eraseDown);
      }
      process.stdout.write(f);
      painted = lineCount;
    };

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
