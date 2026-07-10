import { describe, it, expect, beforeEach } from 'vitest';
import { parseInputData, applyInputEvent, renderInput, runTextInput } from './text-input.js';
import { stripAnsi } from '../text.js';
import { resetIconCache } from '../icons.js';

describe('parseInputData', () => {
  it('classifies control keys', () => {
    expect(parseInputData('\r').type).toBe('enter');
    expect(parseInputData('\n').type).toBe('enter');
    expect(parseInputData('\x03').type).toBe('cancel');
    expect(parseInputData('\x1b').type).toBe('cancel');
    expect(parseInputData('\x7f').type).toBe('backspace');
    expect(parseInputData('\b').type).toBe('backspace');
  });
  it('classifies a printable character', () => {
    expect(parseInputData('a')).toEqual({ type: 'char', ch: 'a' });
    expect(parseInputData('中')).toEqual({ type: 'char', ch: '中' });
  });
  it('ignores other control/escape sequences as none', () => {
    expect(parseInputData('\x1b[A').type).toBe('none');
  });
});

describe('applyInputEvent', () => {
  it('appends chars and removes on backspace', () => {
    let v = '';
    v = applyInputEvent(v, { type: 'char', ch: 'h' });
    v = applyInputEvent(v, { type: 'char', ch: 'i' });
    expect(v).toBe('hi');
    v = applyInputEvent(v, { type: 'backspace' });
    expect(v).toBe('h');
  });
  it('backspace on empty stays empty; non-edit events are no-ops', () => {
    expect(applyInputEvent('', { type: 'backspace' })).toBe('');
    expect(applyInputEvent('x', { type: 'enter' })).toBe('x');
  });
});

describe('renderInput', () => {
  beforeEach(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });
  function plain(o: Parameters<typeof renderInput>[0]): string {
    const out = stripAnsi(renderInput(o));
    process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache();
    return out;
  }
  it('shows the message and the current value', () => {
    expect(plain({ message: 'Search', value: 'abc' })).toContain('Search');
    expect(plain({ message: 'Search', value: 'abc' })).toContain('abc');
  });
  it('shows the placeholder when value is empty', () => {
    expect(plain({ message: 'Search', value: '', placeholder: 'type here' })).toContain('type here');
  });
});

describe('runTextInput', () => {
  it('resolves null when not attached to a TTY (vitest)', async () => {
    const result = await runTextInput({ message: 'Search', placeholder: 'x' });
    expect(result).toBeNull();
  });
});
