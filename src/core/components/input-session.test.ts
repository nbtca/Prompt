import { describe, it, expect } from 'vitest';
import { startRawInput } from './input-session.js';

describe('startRawInput', () => {
  it('returns null when stdin is not a TTY (vitest)', () => {
    const handle = startRawInput(() => {});
    expect(handle).toBeNull();
  });
});
