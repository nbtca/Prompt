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
  it('registers at most one exit listener across repeated calls', () => {
    const before = process.listenerCount('exit');
    ensureCursorRestored();
    const afterFirst = process.listenerCount('exit');
    ensureCursorRestored();
    const afterSecond = process.listenerCount('exit');
    expect(afterFirst - before).toBeLessThanOrEqual(1);
    expect(afterSecond).toBe(afterFirst);
  });
});

describe('alt-screen ansi', () => {
  it('exposes enter/leave alt, home, clearAll', () => {
    expect(ansi.enterAlt).toBe('\x1b[?1049h');
    expect(ansi.leaveAlt).toBe('\x1b[?1049l');
    expect(ansi.home).toBe('\x1b[H');
    expect(ansi.clearAll).toBe('\x1b[2J');
  });
});
