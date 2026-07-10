import { describe, it, expect, afterEach } from 'vitest';
import { deriveReducedMotion, getCapabilities, resetCapabilities } from './capabilities.js';

describe('deriveReducedMotion', () => {
  const base = { isTTY: true, color: true, unicode: true, env: {} as NodeJS.ProcessEnv };

  it('is false in a full-capability TTY with a clean env', () => {
    expect(deriveReducedMotion(base)).toBe(false);
  });
  it('is true when not a TTY', () => {
    expect(deriveReducedMotion({ ...base, isTTY: false })).toBe(true);
  });
  it('is true when color is off', () => {
    expect(deriveReducedMotion({ ...base, color: false })).toBe(true);
  });
  it('is true when unicode is off', () => {
    expect(deriveReducedMotion({ ...base, unicode: false })).toBe(true);
  });
  it('is true under CI', () => {
    expect(deriveReducedMotion({ ...base, env: { CI: '1' } })).toBe(true);
  });
  it('is true under NBTCA_NO_MOTION', () => {
    expect(deriveReducedMotion({ ...base, env: { NBTCA_NO_MOTION: '1' } })).toBe(true);
  });
  it('is true under TERM=dumb', () => {
    expect(deriveReducedMotion({ ...base, env: { TERM: 'dumb' } })).toBe(true);
  });
});

describe('getCapabilities', () => {
  afterEach(() => resetCapabilities());
  it('returns reducedMotion=true under vitest (non-TTY)', () => {
    expect(getCapabilities().reducedMotion).toBe(true);
    expect(getCapabilities().isTTY).toBe(false);
  });
});
