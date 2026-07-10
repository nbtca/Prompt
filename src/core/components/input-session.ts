import { ansi, ensureCursorRestored } from '../canvas.js';

export interface RawInputHandle {
  stop(): void;
}

export function startRawInput(onData: (data: Buffer) => void): RawInputHandle | null {
  const stdin = process.stdin;
  if (!stdin.isTTY || !process.stdout.isTTY) return null;

  let stopped = false;
  ensureCursorRestored();
  stdin.setRawMode(true);
  stdin.resume();
  process.stdout.write(ansi.hideCursor);
  stdin.on('data', onData);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      stdin.removeListener('data', onData);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write(ansi.showCursor);
    },
  };
}
