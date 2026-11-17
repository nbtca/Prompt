export type Weather = 'rain' | 'snow' | 'fireworks' | 'lanterns';

// Indexed by the sun's ecliptic longitude in 15° steps, starting at the spring equinox.
const SOLAR_TERMS = [
  'chunfen',
  'qingming',
  'guyu',
  'lixia',
  'xiaoman',
  'mangzhong',
  'xiazhi',
  'xiaoshu',
  'dashu',
  'liqiu',
  'chushu',
  'bailu',
  'qiufen',
  'hanlu',
  'shuangjiang',
  'lidong',
  'xiaoxue',
  'daxue',
  'dongzhi',
  'xiaohan',
  'dahan',
  'lichun',
  'yushui',
  'jingzhe',
] as const;

export type OccasionName =
  | (typeof SOLAR_TERMS)[number]
  | 'newYear'
  | 'newYearsEve'
  | 'springFestival'
  | 'lanternFestival'
  | 'midAutumn';

export interface Occasion {
  name: OccasionName;
  weather?: Weather;
}

const TERM_WEATHER: Partial<Record<OccasionName, Weather>> = {
  yushui: 'rain',
  qingming: 'rain',
  guyu: 'rain',
  xiaoxue: 'snow',
  daxue: 'snow',
  dongzhi: 'snow',
  xiaohan: 'snow',
  dahan: 'snow',
};

const RAD = Math.PI / 180;
const J2000 = Date.UTC(2000, 0, 1, 12);

/** The sun's apparent ecliptic longitude in degrees, from the low-precision formula in the Astronomical Almanac. */
function solarLongitude(at: number): number {
  const n = (at - J2000) / 86_400_000;
  const mean = 280.46 + 0.9856474 * n;
  const anomaly = (357.528 + 0.9856003 * n) * RAD;
  const longitude = mean + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly);
  return ((longitude % 360) + 360) % 360;
}

const CAMPUS_OFFSET_MS = 8 * 3_600_000;

// Terms are published for the campus calendar day, so the day starts at campus midnight in every time zone.
function solarTerm(date: Date): OccasionName | undefined {
  const start = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - CAMPUS_OFFSET_MS;
  const before = Math.floor(solarLongitude(start) / 15);
  const after = Math.floor(solarLongitude(start + 86_400_000) / 15);
  return before === after ? undefined : SOLAR_TERMS[after % 24];
}

const LUNAR = new Intl.DateTimeFormat('en-u-ca-chinese', { month: 'numeric', day: 'numeric' });

// ICU's lunar calendar puts some new years a day late (2027, 2030) when the new moon falls near midnight.
const SPRING_FESTIVAL: Readonly<Record<number, string>> = {
  2021: '02-12',
  2022: '02-01',
  2023: '01-22',
  2024: '02-10',
  2025: '01-29',
  2026: '02-17',
  2027: '02-06',
  2028: '01-26',
  2029: '02-13',
  2030: '02-03',
  2031: '01-23',
};

function lunarDay(date: Date): string {
  const parts = LUNAR.formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('month')}/${value('day')}`;
}

function daysFromSpringFestival(date: Date): number | undefined {
  const known = SPRING_FESTIVAL[date.getFullYear()];
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  if (known) return (day - Date.parse(`${date.getFullYear()}-${known}T00:00:00Z`)) / 86_400_000;
  for (const offset of [-1, 0, 14]) {
    if (lunarDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset)) === '1/1')
      return offset;
  }
  return undefined;
}

function festival(date: Date): Occasion | undefined {
  if (date.getMonth() === 0 && date.getDate() === 1)
    return { name: 'newYear', weather: 'fireworks' };
  const offset = daysFromSpringFestival(date);
  if (offset === -1) return { name: 'newYearsEve', weather: 'fireworks' };
  if (offset === 0) return { name: 'springFestival', weather: 'fireworks' };
  if (offset === 14) return { name: 'lanternFestival', weather: 'lanterns' };
  if (lunarDay(date) === '8/15') return { name: 'midAutumn', weather: 'lanterns' };
  return undefined;
}

/** A festival, or else a solar term, that falls on the local calendar day of `date`. */
export function occasion(date: Date): Occasion | undefined {
  const holiday = festival(date);
  if (holiday) return holiday;
  const term = solarTerm(date);
  if (!term) return undefined;
  const weather = TERM_WEATHER[term];
  return weather ? { name: term, weather } : { name: term };
}
