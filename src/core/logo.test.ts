import { describe, it, expect } from 'vitest';
import { buildLogoLines } from './logo.js';
import { stripAnsi } from './text.js';

describe('buildLogoLines', () => {
  it('returns an array of single-line strings', () => {
    const lines = buildLogoLines();
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.every((l) => !l.includes('\n'))).toBe(true);
  });

  it('includes the tagline and a version line', () => {
    const text = buildLogoLines().map(stripAnsi).join('\n');
    expect(text).toContain('intersection of technology and liberal arts');
    expect(text).toMatch(/v\d+\.\d+\.\d+/);
  });
});
