import { describe, expect, it } from 'vitest';
import { fbm3, noise3, worley3 } from './noise.js';

const points = Array.from(
  { length: 200 },
  (_, index) => [index * 0.37, index * 0.11 - 5, index * 0.53] as const,
);

describe('noise', () => {
  it('stays within 0..1 and repeats for the same input', () => {
    for (const point of points) {
      for (const value of [noise3(point), fbm3(point)]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(noise3(point, 4)).toBe(noise3(point, 4));
    }
  });

  it('changes smoothly between nearby points', () => {
    for (const [x, y, z] of points) {
      expect(Math.abs(noise3([x, y, z]) - noise3([x + 0.01, y, z]))).toBeLessThan(0.05);
    }
  });

  it('measures Worley distance to a feature point within one cell of any location', () => {
    for (const point of points) {
      const distance = worley3(point, 2);
      expect(distance).toBeGreaterThanOrEqual(0);
      expect(distance).toBeLessThan(Math.sqrt(3));
    }
  });
});
