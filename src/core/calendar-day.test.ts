import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { parseLocalDate, parseLocalMonday } from './calendar-day.js';

describe('local calendar days', () => {
  it('rejects normalized and non-Monday week-one dates', () => {
    expect(() => parseLocalDate('2026-02-31')).toThrow(RangeError);
    expect(() => parseLocalDate('2026-2-02')).toThrow(RangeError);
    expect(() => parseLocalMonday('2026-09-08')).toThrow(RangeError);
    expect(parseLocalMonday('2026-09-07').getDay()).toBe(1);
  });

  it('crosses both New York DST boundaries without changing the local date or hour', () => {
    const moduleUrl = new URL('./calendar-day.ts', import.meta.url).href;
    const script = `
      import { addLocalDays, localDayDifference, parseLocalDate } from ${JSON.stringify(moduleUrl)};
      const spring = addLocalDays(parseLocalDate('2026-03-02'), 7);
      const fall = addLocalDays(parseLocalDate('2026-10-26'), 7);
      process.stdout.write(JSON.stringify({
        spring: [spring.getFullYear(), spring.getMonth() + 1, spring.getDate(), spring.getHours()],
        fall: [fall.getFullYear(), fall.getMonth() + 1, fall.getDate(), fall.getHours()],
        springDays: localDayDifference(parseLocalDate('2026-03-02'), spring),
        fallDays: localDayDifference(parseLocalDate('2026-10-26'), fall),
      }));
    `;
    const output = execFileSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '--eval', script],
      { encoding: 'utf8', env: { ...process.env, TZ: 'America/New_York' } },
    );

    expect(JSON.parse(output)).toEqual({
      spring: [2026, 3, 9, 0],
      fall: [2026, 11, 2, 0],
      springDays: 7,
      fallDays: 7,
    });
  });
});
