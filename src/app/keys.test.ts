import { describe, it, expect } from 'vitest';
import { isPrintableKey, KeyStreamDecoder, routeGlobalKey, type ViewId } from './keys.js';
const ids: ViewId[] = ['home', 'events', 'schedule', 'docs', 'status', 'links', 'settings'];

describe('routeGlobalKey', () => {
  it('q and ctrl-c quit', () => {
    expect(routeGlobalKey('q', ids, 'home')).toEqual({ quit: true, handled: true });
    expect(routeGlobalKey('\x03', ids, 'events')).toEqual({ quit: true, handled: true });
  });
  it('esc quits at home, backs elsewhere', () => {
    expect(routeGlobalKey('\x1b', ids, 'home')).toEqual({ quit: true, handled: true });
    expect(routeGlobalKey('\x1b', ids, 'events')).toEqual({ back: true, handled: true });
  });
  it('digit selects the view by 1-based index', () => {
    expect(routeGlobalKey('2', ids, 'home')).toEqual({ switchTo: 'events', handled: true });
    expect(routeGlobalKey('9', ids, 'home')).toEqual({ handled: false }); // out of range
  });
  it('tab cycles to the next view', () => {
    expect(routeGlobalKey('\t', ids, 'settings')).toEqual({ switchTo: 'home', handled: true });
  });
  it('shift-tab cycles to the previous view', () => {
    expect(routeGlobalKey('\x1b[Z', ids, 'home')).toEqual({
      switchTo: 'settings',
      handled: true,
    });
  });
  it('other keys are not handled (delegated to the view)', () => {
    expect(routeGlobalKey('j', ids, 'events')).toEqual({ handled: false });
  });
  it('PageUp/PageDown scroll the body by one page', () => {
    expect(routeGlobalKey('\x1b[5~', ids, 'events')).toEqual({ scrollBy: -1, handled: true });
    expect(routeGlobalKey('\x1b[6~', ids, 'events')).toEqual({ scrollBy: 1, handled: true });
  });
});

describe('KeyStreamDecoder', () => {
  it('decodes coalesced escape keys without confusing Esc with their prefix', () => {
    const decoder = new KeyStreamDecoder();

    expect(decoder.write('\x1b\x1b[5~\x1b[6~')).toEqual(['\x1b', '\x1b[5~', '\x1b[6~']);
  });

  it('preserves arrows and Shift-Tab across arbitrary chunks', () => {
    const decoder = new KeyStreamDecoder();

    expect(decoder.write('\x1b[')).toEqual([]);
    expect(decoder.write('A\x1b[B\x1b')).toEqual(['\x1b[A', '\x1b[B']);
    expect(decoder.write('[Z')).toEqual(['\x1b[Z']);
  });

  it('decodes coalesced ordinary keys as separate graphemes', () => {
    const decoder = new KeyStreamDecoder();

    expect(decoder.write('123')).toEqual(['1', '2', '3']);
    expect(decoder.hasPending).toBe(false);
  });

  it('round-trips UTF-8 and combining graphemes split between buffers', () => {
    const decoder = new KeyStreamDecoder();
    const chinese = Buffer.from('中');
    const decoded: string[] = [];

    decoded.push(...decoder.write(chinese.subarray(0, 2)));
    decoded.push(...decoder.write(chinese.subarray(2)));
    decoded.push(...decoder.write('e'));
    decoded.push(...decoder.write('\u0301x'));

    expect(decoded.join('')).toBe('中e\u0301x');
    expect(decoder.hasPending).toBe(false);
  });

  it('round-trips pasted emoji clusters split between buffers', () => {
    const decoder = new KeyStreamDecoder();
    const decoded = [...decoder.write('a👨‍'), ...decoder.write('👩‍👧b')];

    expect(decoded.join('')).toBe('a👨‍👩‍👧b');
    expect(decoder.hasPending).toBe(false);
  });

  it('flushes a standalone Esc key', () => {
    const decoder = new KeyStreamDecoder();

    expect(decoder.write('\x1b')).toEqual([]);
    expect(decoder.hasPending).toBe(true);
    expect(decoder.flush()).toEqual(['\x1b']);
    expect(decoder.hasPending).toBe(false);
  });
});

describe('isPrintableKey', () => {
  it('accepts pasted text and rejects control and escape keys', () => {
    expect(isPrintableKey('hello 世界 👨‍👩‍👧')).toBe(true);
    expect(isPrintableKey('\r')).toBe(false);
    expect(isPrintableKey('\x1b[A')).toBe(false);
  });
});
