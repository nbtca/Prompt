import { describe, it, expect, afterEach } from 'vitest';
import { enableVimKeys, setVimKeysActive } from './vim-keys.js';

/**
 * Documents the exact single-byte keys core/vim-keys.ts reserves globally,
 * ranger-style, while vim keys are active (the default). This exists
 * because of a real bug: the native Docs reader picked 'l' as a shortcut
 * for "open the internal-link picker" without checking here first -- 'l'
 * is already a global alias for Enter/confirm, so the literal 'l' byte
 * never reached the view's own handleKey at all, and the feature silently
 * did nothing. Any future single-letter view shortcut should be checked
 * against this list before being chosen.
 */
describe('vim-keys global reservations', () => {
  const originalIsTTY = process.stdin.isTTY;
  const originalEmit = process.stdin.emit.bind(process.stdin);

  afterEach(() => {
    setVimKeysActive(true); // restore the real default other tests may rely on
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    process.stdin.emit = originalEmit;
  });

  function captureTranslatedKey(rawByte: string): string | null {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    process.stdin.emit = originalEmit; // exactly one enableVimKeys() layer at a time
    enableVimKeys();
    let captured: string | null = null;
    process.stdin.once('data', (chunk: Buffer) => { captured = chunk.toString(); });
    process.stdin.emit('data', Buffer.from(rawByte));
    return captured;
  }

  it('reserves j/k/l/g/G/q while vim keys are active -- a view must not bind these to anything else', () => {
    setVimKeysActive(true);
    expect(captureTranslatedKey('j')).toBe('\x1b[B'); // down
    expect(captureTranslatedKey('k')).toBe('\x1b[A'); // up
    expect(captureTranslatedKey('l')).toBe('\r');      // enter/confirm, NOT literal 'l'
    expect(captureTranslatedKey('g')).toBe('\x1b[H'); // home
    expect(captureTranslatedKey('G')).toBe('\x1b[F'); // end
    expect(captureTranslatedKey('q')).toBe('\x03');   // quit (Ctrl-C)
  });

  it('passes an unreserved letter through untouched -- confirms the reservation is a specific allowlist, not "every single letter"', () => {
    setVimKeysActive(true);
    expect(captureTranslatedKey('f')).toBe('f');
    expect(captureTranslatedKey('b')).toBe('b');
  });

  it('setVimKeysActive(false) passes every key through untouched, including the reserved ones', () => {
    setVimKeysActive(false);
    expect(captureTranslatedKey('l')).toBe('l');
    expect(captureTranslatedKey('j')).toBe('j');
  });
});
