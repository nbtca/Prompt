const CAMPUS = { latitude: 29.9, longitude: 121.6, utcOffset: 8 } as const;
const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;

/** Sunrise and sunset on the campus clock, in hours, for the calendar day of `date`. */
export function sunHours(date: Date): { rise: number; set: number } {
  const day =
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(date.getFullYear(), 0, 0)) /
    DAY_MS;
  const declination = -23.44 * RAD * Math.cos(((2 * Math.PI) / 365) * (day + 10));
  const b = ((2 * Math.PI) / 364) * (day - 81);
  const equationOfTime = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const noon = 12 + CAMPUS.utcOffset - CAMPUS.longitude / 15 - equationOfTime / 60;
  const lat = CAMPUS.latitude * RAD;
  const cosHalfDay =
    (Math.sin(-0.833 * RAD) - Math.sin(lat) * Math.sin(declination)) /
    (Math.cos(lat) * Math.cos(declination));
  const halfDay = Math.acos(Math.min(1, Math.max(-1, cosHalfDay))) / RAD / 15;
  return { rise: noon - halfDay, set: noon + halfDay };
}

/** Stretches the clock so campus sunrise lands on 06:00 and sunset on 18:00, the hours the sky palette assumes. */
export function solarHour(now: Date): number {
  const hour = now.getHours() + now.getMinutes() / 60;
  const { rise, set } = sunHours(now);
  if (hour >= rise && hour < set) return 6 + (12 * (hour - rise)) / (set - rise);
  const night = 24 - (set - rise);
  return (18 + (12 * ((hour - set + 24) % 24)) / night) % 24;
}
