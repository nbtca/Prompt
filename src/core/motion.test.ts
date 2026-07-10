import { describe, it, expect } from 'vitest';
import { typeReveal } from './motion.js';

describe('typeReveal', () => {
  it('reduced motion writes all lines in a single call', async () => {
    const out: string[] = [];
    await typeReveal(['a', 'b', 'c'], { reducedMotion: true, write: (s) => out.push(s) });
    expect(out).toEqual(['a\nb\nc\n']);
  });

  it('animated mode writes one line per call', async () => {
    const out: string[] = [];
    await typeReveal(['a', 'b'], { reducedMotion: false, stepMs: 0, write: (s) => out.push(s) });
    expect(out).toEqual(['a\n', 'b\n']);
  });
});
