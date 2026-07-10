import { startRawInput } from './input-session.js';
import { ansi } from '../canvas.js';
import { setVimKeysActive } from '../vim-keys.js';
import { glyph, type, space } from '../theme.js';

export type ConfirmEvent = 'yes' | 'no' | 'toggle' | 'submit' | 'cancel' | 'none';

export function parseConfirmData(data: Buffer | string): ConfirmEvent {
  const s = data.toString();
  if (s === 'y' || s === 'Y') return 'yes';
  if (s === 'n' || s === 'N') return 'no';
  if (s === '\t' || s === '\x1b[C' || s === '\x1b[D') return 'toggle';
  if (s === '\r' || s === '\n') return 'submit';
  if (s === '\x03' || s === '\x1b') return 'cancel';
  return 'none';
}

export function renderConfirm(opts: { message: string; value: boolean }): string {
  const cursor = glyph.cursor();
  const gap = ' '.repeat(cursor.length);
  const yes = opts.value ? `${type.heading(cursor)} ${type.heading('Yes')}` : `${gap} ${type.body('Yes')}`;
  const no = opts.value ? `${gap} ${type.body('No')}` : `${type.heading(cursor)} ${type.heading('No')}`;
  return [
    space.indent + type.label(opts.message),
    `${space.indent}${yes}   ${no}`,
  ].join('\n');
}

export interface RunConfirmConfig {
  message: string;
  initial?: boolean;
}

export function runConfirm(config: RunConfirmConfig): Promise<boolean | null> {
  return new Promise((resolve) => {
    let value = config.initial ?? true;
    let painted = 0;

    const frame = () => renderConfirm({ message: config.message, value });

    const paint = () => {
      const f = frame();
      const lineCount = f.split('\n').length;
      if (painted > 0) {
        process.stdout.write(ansi.cursorUp(painted - 1) + ansi.cursorToCol0 + ansi.eraseDown);
      }
      process.stdout.write(f);
      painted = lineCount;
    };

    const finish = (result: boolean | null) => {
      handle?.stop();
      setVimKeysActive(true);
      process.stdout.write('\n');
      resolve(result);
    };

    const onData = (data: Buffer) => {
      const ev = parseConfirmData(data);
      if (ev === 'cancel') { finish(null); return; }
      if (ev === 'submit') { finish(value); return; }
      if (ev === 'yes' && value !== true) { value = true; paint(); return; }
      if (ev === 'no' && value !== false) { value = false; paint(); return; }
      if (ev === 'toggle') { value = !value; paint(); return; }
    };

    setVimKeysActive(false);
    const handle = startRawInput(onData);
    if (!handle) { setVimKeysActive(true); resolve(null); return; }
    paint();
  });
}
