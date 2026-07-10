import { ansi } from '../canvas.js';
import { visualWidth } from '../text.js';

/** Visual row count for a frame, accounting for terminal soft-wrap. */
export function frameRows(frame: string, cols: number): number {
  return frame.split('\n').reduce((n, line) => {
    const w = visualWidth(line);
    return n + Math.max(1, Math.ceil(w / cols));
  }, 0);
}

/**
 * Returns a paint() closure that redraws a fixed-line-count frame in place,
 * erasing the previous frame first. `write` is injectable for tests.
 */
export function createPainter(
  frame: () => string,
  write: (s: string) => void = (s) => { process.stdout.write(s); },
): () => void {
  let painted = 0;
  return () => {
    const f = frame();
    const cols = process.stdout.columns || 80;
    const rows = frameRows(f, cols);
    if (painted > 0) {
      write(ansi.cursorUp(painted - 1) + ansi.cursorToCol0 + ansi.eraseDown);
    }
    write(f);
    painted = rows;
  };
}
