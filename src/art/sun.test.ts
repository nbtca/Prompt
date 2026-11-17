import { describe, it, expect } from 'vitest';
import { solarHour, sunHours } from './sun.js';

const near = (actual: number, expected: number) => {
  expect(Math.abs(actual - expected)).toBeLessThan(0.06);
};

describe('sunHours', () => {
  it('matches published Ningbo times within a few minutes', () => {
    const winter = sunHours(new Date('2026-12-21T12:00:00'));
    near(winter.rise, 6 + 44 / 60);
    near(winter.set, 16 + 58 / 60);
    const summer = sunHours(new Date('2026-06-21T12:00:00'));
    near(summer.rise, 4 + 53 / 60);
    near(summer.set, 18 + 57 / 60);
  });
});

describe('solarHour', () => {
  it('puts a winter 17:30 after sunset and a summer 18:30 before it', () => {
    expect(solarHour(new Date('2026-12-21T17:30:00'))).toBeGreaterThan(18);
    expect(solarHour(new Date('2026-06-21T18:30:00'))).toBeLessThan(18);
  });

  it('keeps midnight in the middle of the night', () => {
    const hour = solarHour(new Date('2026-12-21T00:00:00'));
    expect(hour).toBeGreaterThanOrEqual(0);
    expect(hour).toBeLessThan(1);
  });

  it('stays within a day', () => {
    for (let minute = 0; minute < 1440; minute += 7) {
      const hour = solarHour(new Date(2026, 2, 20, 0, minute));
      expect(hour).toBeGreaterThanOrEqual(0);
      expect(hour).toBeLessThan(24);
    }
  });
});
