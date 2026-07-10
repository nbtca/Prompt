import { describe, it, expect, beforeEach } from 'vitest';
import { parseConfirmData, renderConfirm, runConfirm } from './confirm.js';
import { stripAnsi } from '../text.js';
import { resetIconCache } from '../icons.js';

describe('parseConfirmData', () => {
  it('maps y/n, toggles, submit, and cancel', () => {
    expect(parseConfirmData('y')).toBe('yes');
    expect(parseConfirmData('Y')).toBe('yes');
    expect(parseConfirmData('n')).toBe('no');
    expect(parseConfirmData('N')).toBe('no');
    expect(parseConfirmData('\t')).toBe('toggle');
    expect(parseConfirmData('\x1b[C')).toBe('toggle');
    expect(parseConfirmData('\x1b[D')).toBe('toggle');
    expect(parseConfirmData('\r')).toBe('submit');
    expect(parseConfirmData('\x03')).toBe('cancel');
    expect(parseConfirmData('\x1b')).toBe('cancel');
    expect(parseConfirmData('q')).toBe('none');
  });
});

describe('renderConfirm', () => {
  beforeEach(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });
  function plain(o: Parameters<typeof renderConfirm>[0]): string {
    const out = stripAnsi(renderConfirm(o));
    process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache();
    return out;
  }
  it('shows message and both options', () => {
    const out = plain({ message: 'Open browser?', value: true });
    expect(out).toContain('Open browser?');
    expect(out).toContain('Yes');
    expect(out).toContain('No');
  });
});

describe('runConfirm', () => {
  it('resolves null when not attached to a TTY (vitest)', async () => {
    expect(await runConfirm({ message: 'ok?' })).toBeNull();
  });
});
