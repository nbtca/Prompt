import { describe, it, expect } from 'vitest';
import { occasion } from './almanac.js';

const on = (iso: string) => occasion(new Date(`${iso}T12:00:00`));

describe('occasion', () => {
  it('finds every solar term of 2026 on its published date', () => {
    const found: string[] = [];
    for (let day = new Date(2026, 0, 1); day.getFullYear() === 2026;) {
      const name = occasion(day)?.name;
      if (name && !/Festival|newYear|midAutumn/.test(name)) {
        found.push(`${day.getMonth() + 1}-${day.getDate()}`);
      }
      day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    }
    expect(found).toEqual([
      '1-5',
      '1-20',
      '2-4',
      '2-18',
      '3-5',
      '3-20',
      '4-5',
      '4-20',
      '5-5',
      '5-21',
      '6-5',
      '6-21',
      '7-7',
      '7-23',
      '8-7',
      '8-23',
      '9-7',
      '9-23',
      '10-8',
      '10-23',
      '11-7',
      '11-22',
      '12-7',
      '12-22',
    ]);
  });

  it('brings rain and snow on the matching terms', () => {
    expect(on('2026-04-05')).toEqual({ name: 'qingming', weather: 'rain' });
    expect(on('2026-11-22')).toEqual({ name: 'xiaoxue', weather: 'snow' });
    expect(on('2026-11-07')).toEqual({ name: 'lidong' });
    expect(on('2026-11-08')).toBeUndefined();
  });

  it('falls back to the lunar calendar after the published table', () => {
    expect(on('2032-02-11')).toEqual({ name: 'springFestival', weather: 'fireworks' });
  });

  it('follows the lunar calendar for festivals', () => {
    expect(on('2026-01-01')).toEqual({ name: 'newYear', weather: 'fireworks' });
    expect(on('2026-02-16')).toEqual({ name: 'newYearsEve', weather: 'fireworks' });
    expect(on('2026-02-17')).toEqual({ name: 'springFestival', weather: 'fireworks' });
    expect(on('2026-03-03')).toEqual({ name: 'lanternFestival', weather: 'lanterns' });
    expect(on('2026-09-25')).toEqual({ name: 'midAutumn', weather: 'lanterns' });
    expect(on('2027-02-05')).toEqual({ name: 'newYearsEve', weather: 'fireworks' });
    expect(on('2027-02-06')).toEqual({ name: 'springFestival', weather: 'fireworks' });
    expect(on('2030-02-03')).toEqual({ name: 'springFestival', weather: 'fireworks' });
    expect(on('2030-02-17')).toEqual({ name: 'lanternFestival', weather: 'lanterns' });
  });
});
