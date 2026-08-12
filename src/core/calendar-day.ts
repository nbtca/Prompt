const DAY_MS = 86_400_000;
const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseLocalDate(value: string): Date {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) throw new RangeError(`Invalid local date: ${value}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new RangeError(`Invalid local date: ${value}`);
  }
  return date;
}

export function parseLocalMonday(value: string): Date {
  const date = parseLocalDate(value);
  if (date.getDay() !== 1) throw new RangeError(`Local date is not a Monday: ${value}`);
  return date;
}

export function addLocalDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

function localDayIndex(date: Date): number {
  const index = new Date(0);
  index.setUTCHours(0, 0, 0, 0);
  index.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  return index.getTime() / DAY_MS;
}

export function localDayDifference(start: Date, end: Date): number {
  return localDayIndex(end) - localDayIndex(start);
}
