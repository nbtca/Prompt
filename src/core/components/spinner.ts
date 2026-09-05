import { getCapabilities } from '../capabilities.js';
import { ansi, ensureCursorRestored } from '../canvas.js';
import { renderMessage } from './messages.js';
import { pickIcon } from '../icons.js';
import { c, space, type } from '../theme.js';
import { visualWidth, wrapAnsiWithIndent } from '../text.js';

export interface Spinner {
  message(msg: string): void;
  stop(msg?: string): void;
  error(msg?: string): void;
}

export interface SpinnerOptions {
  reducedMotion?: boolean;
  write?: (s: string) => void;
}

const FRAMES_UNICODE = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const FRAMES_ASCII = ['|', '/', '-', '\\'];
export const SPINNER_FRAME_MS = 80;

export function renderSpinnerFrame(frame: string, msg: string): string {
  return `${space.indent}${c.accent(frame)} ${msg}`;
}

export function spinnerFrame(at: number = Date.now()): string {
  const frames = pickIcon('u', 'a') === 'u' ? FRAMES_UNICODE : FRAMES_ASCII;
  const index = getCapabilities().reducedMotion
    ? 0
    : Math.floor(at / SPINNER_FRAME_MS) % frames.length;
  return frames[index] ?? '|';
}

export function loadingLines(
  label: string,
  cols: number = Number.POSITIVE_INFINITY,
  at: number = Date.now(),
): string[] {
  const message = type.hint(label);
  const spun = `${space.indent}${c.accent(spinnerFrame(at))} ${message}`;
  if (visualWidth(spun) <= cols) return [spun];
  return wrapAnsiWithIndent(message, cols, space.indent);
}

export function startSpinner(msg = '', opts: SpinnerOptions = {}): Spinner {
  const write =
    opts.write ??
    ((s: string) => {
      process.stdout.write(s);
    });
  const reduced = opts.reducedMotion ?? getCapabilities().reducedMotion;
  const frames = pickIcon('u', 'a') === 'u' ? FRAMES_UNICODE : FRAMES_ASCII;

  let current = msg;
  let timer: ReturnType<typeof setInterval> | null = null;
  let i = 0;

  const clearLine = () => {
    write(ansi.cursorToCol0 + ansi.eraseDown);
  };

  const paint = () => {
    clearLine();
    write(renderSpinnerFrame(frames.at(i % frames.length) ?? '|', current));
    i++;
  };

  if (!reduced) {
    ensureCursorRestored();
    write(ansi.hideCursor);
    paint();
    timer = setInterval(paint, 80);
  }

  const finish = (line: string | null) => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (!reduced) {
      clearLine();
      write(ansi.showCursor);
    }
    if (line) write(line + '\n');
  };

  return {
    message: (m: string) => {
      current = m;
    },
    stop: (m?: string) => {
      finish(m ? renderMessage('success', m) : null);
    },
    error: (m?: string) => {
      finish(m ? renderMessage('error', m) : null);
    },
  };
}
