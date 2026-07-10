import { describe, it, expect } from 'vitest';
import { ansi, ensureCursorRestored } from './canvas.js';

describe('ansi builders', () => {
  it('hide/show cursor sequences', () => {
    expect(ansi.hideCursor).toBe('\x1b[?25l');
    expect(ansi.showCursor).toBe('\x1b[?25h');
  });
  it('cursorUp emits N-up sequence for positive N', () => {
    expect(ansi.cursorUp(3)).toBe('\x1b[3A');
  });
  it('cursorUp emits empty string for zero or negative N', () => {
    expect(ansi.cursorUp(0)).toBe('');
    expect(ansi.cursorUp(-2)).toBe('');
  });
  it('eraseDown and cursorToCol0 constants', () => {
    expect(ansi.eraseDown).toBe('\x1b[0J');
    expect(ansi.cursorToCol0).toBe('\r');
  });
});

describe('ensureCursorRestored', () => {
  it('is idempotent (safe to call twice)', () => {
    expect(() => { ensureCursorRestored(); ensureCursorRestored(); }).not.toThrow();
  });
});
