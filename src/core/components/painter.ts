import { ansi } from '../canvas.js';

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
    const lineCount = f.split('\n').length;
    if (painted > 0) {
      write(ansi.cursorUp(painted - 1) + ansi.cursorToCol0 + ansi.eraseDown);
    }
    write(f);
    painted = lineCount;
  };
}
