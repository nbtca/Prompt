import { describe, it, expect } from 'vitest';
import { starMapScene } from './star-map.js';

const now = new Date('2026-11-17T12:00:00');
const day = 86_400_000;

describe('starMapScene', () => {
  it('draws one colored star per event from the past year', () => {
    const bitmap = starMapScene(
      160,
      48,
      [
        { at: now.getTime() - 30 * day, kind: 'repair', seed: 11 },
        { at: now.getTime() - 20 * day, kind: 'repair', seed: 12 },
        { at: now.getTime() - 400 * day, kind: 'workshop', seed: 13 },
      ],
      now,
    );
    const colors = new Set(Object.values(bitmap.palette));
    expect(colors.has('#fbbf24')).toBe(true);
    expect(colors.has('#5eead4')).toBe(false);
  });

  it('fills the requested size even without events', () => {
    const bitmap = starMapScene(160, 48, [], now);
    expect(bitmap.rows).toHaveLength(48);
    expect(bitmap.rows.every((row) => row.length === 160)).toBe(true);
  });
});
