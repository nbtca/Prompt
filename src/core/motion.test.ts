import { describe, it, expect } from 'vitest';
import { typeReveal, materializeBraille } from './motion.js';
import { stripAnsi } from './text.js';

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

describe('materializeBraille', () => {
  const art = '⠋⠉\n⢀⣀';

  it('reduced motion writes the finished art in a single call', async () => {
    const out: string[] = [];
    await materializeBraille(art, (s) => s, { reducedMotion: true, write: (s) => out.push(s) });
    expect(out).toEqual([art + '\n']);
  });

  it('with no braille content, falls back to a single write regardless of motion', async () => {
    const out: string[] = [];
    await materializeBraille('plain text', (s) => s, { reducedMotion: false, write: (s) => out.push(s) });
    expect(out).toEqual(['plain text\n']);
  });

  it('animated mode writes multiple frames and the last frame matches the source art', async () => {
    const out: string[] = [];
    await materializeBraille(art, (s) => s, {
      reducedMotion: false,
      frames: 4,
      frameMs: 0,
      random: () => 0.5,
      write: (s) => out.push(s),
    });
    expect(out.length).toBeGreaterThan(1);
    const lastFrame = out[out.length - 1];
    expect(lastFrame).toBe(art + '\n');
  });

  it('dot count is non-decreasing across frames and never exceeds the source', async () => {
    const out: string[] = [];
    await materializeBraille(art, (s) => s, {
      reducedMotion: false,
      frames: 5,
      frameMs: 0,
      random: () => 0.5,
      write: (s) => out.push(s),
    });
    const dotsIn = (frame: string) => stripAnsi(frame).split('').filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code > 0x2800 && code <= 0x28ff;
    }).length;
    // Frame writes always end in '\n'; the cursor-reposition writes between
    // them don't, so filtering on that isolates the actual frames.
    const counts = out.filter((s) => s.endsWith('\n')).map(dotsIn);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1] ?? 0);
    }
    expect(counts[counts.length - 1]).toBe(dotsIn(art + '\n'));
  });
});
