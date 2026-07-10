import { describe, it, expect, beforeEach } from 'vitest';
import { renderMessage } from './messages.js';
import { stripAnsi } from '../text.js';
import { resetIconCache } from '../icons.js';

describe('renderMessage', () => {
  function plain(kind: Parameters<typeof renderMessage>[0], msg: string): string {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    resetIconCache();
    const out = stripAnsi(renderMessage(kind, msg));
    process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache();
    return out;
  }

  it('prefixes an ascii marker and includes the message', () => {
    expect(plain('success', 'done')).toBe('   + done');
    expect(plain('error', 'boom')).toBe('   x boom');
    expect(plain('warn', 'careful')).toBe('   ! careful');
    expect(plain('info', 'note')).toBe('   > note');
  });
});
