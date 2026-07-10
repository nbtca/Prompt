import { describe, it, expect } from 'vitest';
import { createPainter, frameRows } from './painter.js';
import { ansi } from '../canvas.js';

describe('createPainter', () => {
  it('first call writes only the frame (no erase prefix)', () => {
    const writes: string[] = [];
    const paint = createPainter(() => 'line1\nline2\nline3', (s) => writes.push(s));
    paint();
    expect(writes).toEqual(['line1\nline2\nline3']);
  });

  it('second call writes the erase-and-cursor-up prefix, then the new frame', () => {
    const writes: string[] = [];
    let frame = 'line1\nline2\nline3';
    const paint = createPainter(() => frame, (s) => writes.push(s));
    paint();
    writes.length = 0;
    frame = 'a\nb\nc';
    paint();
    expect(writes).toEqual([
      ansi.cursorUp(2) + ansi.cursorToCol0 + ansi.eraseDown,
      'a\nb\nc',
    ]);
  });

  it('tracks line count changes across repaints', () => {
    const writes: string[] = [];
    let frame = 'one';
    const paint = createPainter(() => frame, (s) => writes.push(s));
    paint();
    writes.length = 0;
    frame = 'x\ny';
    paint();
    // previous frame was 1 line, so cursorUp(0) -> ''
    expect(writes[0]).toBe(ansi.cursorUp(0) + ansi.cursorToCol0 + ansi.eraseDown);
    expect(writes[1]).toBe('x\ny');

    writes.length = 0;
    frame = 'final';
    paint();
    // previous frame was 2 lines, so cursorUp(1)
    expect(writes[0]).toBe(ansi.cursorUp(1) + ansi.cursorToCol0 + ansi.eraseDown);
  });
});

describe('frameRows', () => {
  it('counts one row per short line', () => {
    expect(frameRows('abc', 80)).toBe(1);
    expect(frameRows('a\nb\nc', 80)).toBe(3);
  });
  it('counts wrapped rows for over-wide lines', () => {
    expect(frameRows('x'.repeat(90), 80)).toBe(2);
    expect(frameRows('x'.repeat(161), 80)).toBe(3);
  });
  it('treats an empty line as one row', () => {
    expect(frameRows('', 80)).toBe(1);
    expect(frameRows('a\n\nb', 80)).toBe(3);
  });
});
