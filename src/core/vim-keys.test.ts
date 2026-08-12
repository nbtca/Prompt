import { describe, it, expect, afterEach } from 'vitest';
import { KeyStreamDecoder } from '../app/keys.js';
import { enableVimKeys, setVimKeysActive } from './vim-keys.js';

describe('vim-keys global reservations', () => {
  const originalIsTTY = process.stdin.isTTY;
  const originalEmit = process.stdin.emit.bind(process.stdin);

  afterEach(() => {
    setVimKeysActive(true); // restore the real default other tests may rely on
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    process.stdin.emit = originalEmit;
  });

  function captureTranslatedChunks(rawChunks: readonly (Buffer | string)[]): string[] {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    process.stdin.emit = originalEmit; // exactly one enableVimKeys() layer at a time
    enableVimKeys();
    const captured: string[] = [];
    const listener = (chunk: Buffer) => captured.push(chunk.toString());
    process.stdin.on('data', listener);
    for (const chunk of rawChunks) {
      process.stdin.emit('data', typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    process.stdin.removeListener('data', listener);
    return captured;
  }

  function captureTranslatedKeys(raw: string): string[] {
    return captureTranslatedChunks([raw]);
  }

  it('translates navigation keys and preserves q as a normal quit key', () => {
    setVimKeysActive(true);
    expect(captureTranslatedKeys('j')).toEqual(['\x1b[B']); // down
    expect(captureTranslatedKeys('k')).toEqual(['\x1b[A']); // up
    expect(captureTranslatedKeys('l')).toEqual(['\r']); // enter/confirm, NOT literal 'l'
    expect(captureTranslatedKeys('g')).toEqual(['\x1b[H']); // home
    expect(captureTranslatedKeys('G')).toEqual(['\x1b[F']); // end
    expect(captureTranslatedKeys('q')).toEqual(['q']);
  });

  it('translates coalesced Vim keys into separate data events', () => {
    setVimKeysActive(true);
    expect(captureTranslatedKeys('jk')).toEqual(['\x1b[B', '\x1b[A']);
    expect(captureTranslatedKeys('j1k')).toEqual(['\x1b[B', '1', '\x1b[A']);
    expect(captureTranslatedKeys('\x1b[Aj')).toEqual(['\x1b[A', '\x1b[B']);
  });

  it('frames escape sequences split across data chunks', () => {
    expect(captureTranslatedChunks(['\x1bO', 'G'])).toEqual(['\x1bOG']);
    expect(captureTranslatedChunks(['\x1b]0;title-', 'q\x07'])).toEqual(['\x1b]0;title-q\x07']);
  });

  it('frames a UTF-8 code point split across data chunks', () => {
    const value = Buffer.from('中');

    expect(captureTranslatedChunks([value.subarray(0, 2), value.subarray(2)])).toEqual(['中']);
  });

  it('passes an unreserved letter through untouched -- confirms the reservation is a specific allowlist, not "every single letter"', () => {
    setVimKeysActive(true);
    expect(captureTranslatedKeys('f')).toEqual(['f']);
    expect(captureTranslatedKeys('b')).toEqual(['b']);
  });

  it('setVimKeysActive(false) passes every key through untouched, including the reserved ones', () => {
    setVimKeysActive(false);
    expect(captureTranslatedKeys('l')).toEqual(['l']);
    expect(captureTranslatedKeys('j')).toEqual(['j']);
    expect(captureTranslatedKeys('jk')).toEqual(['jk']);
    expect(captureTranslatedKeys('\x1b[200~q中文\x1b[201~')).toEqual(['\x1b[200~q中文\x1b[201~']);
  });

  it('lets synchronous decoded input disable Vim translation for the rest of a chunk', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    process.stdin.emit = originalEmit;
    enableVimKeys();
    setVimKeysActive(true);
    const decoder = new KeyStreamDecoder();
    const captured: string[] = [];
    const listener = (chunk: Buffer) => {
      for (const key of decoder.write(chunk)) {
        captured.push(key);
        if (key === '\r') setVimKeysActive(false);
      }
    };
    process.stdin.on('data', listener);
    process.stdin.emit('data', Buffer.from('lquery'));
    process.stdin.removeListener('data', listener);

    expect(captured).toEqual(['\r', 'q', 'u', 'e', 'r', 'y']);
  });
});
