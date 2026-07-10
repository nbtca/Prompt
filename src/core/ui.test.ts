import { describe, it, expect } from 'vitest';
import * as ui from './ui.js';

describe('ui module (post-@clack)', () => {
  it('re-exports the message printers and a spinner factory', () => {
    expect(typeof ui.success).toBe('function');
    expect(typeof ui.error).toBe('function');
    expect(typeof ui.warning).toBe('function');
    expect(typeof ui.info).toBe('function');
    expect(typeof ui.createSpinner).toBe('function');
  });
  it('createSpinner returns an object with stop and error methods', () => {
    const s = ui.createSpinner('x'); // reduced-motion under vitest: no animation
    expect(typeof s.stop).toBe('function');
    expect(typeof s.error).toBe('function');
    s.stop();
  });
});
