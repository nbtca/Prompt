import { createTimetableSchedule, type Timetable } from '@nbtca/nbtcal/timetable';

const EARLY_START = '08:30';
const MINUTE_MS = 60_000;

export interface TermRecap {
  finished: boolean;
  classes: number;
  hours: number;
  courses: number;
  weeks: number;
  earlyClasses: number;
  busiestDay?: { date: string; classes: number; from: string; to: string };
  topCourse?: { name: string; hours: number };
  favoriteRoom?: { name: string; visits: number };
  progress: number;
  events?: number;
}

function mostCommon<K>(counts: Map<K, number>): [K, number] | undefined {
  let best: [K, number] | undefined;
  for (const entry of counts) if (!best || entry[1] > best[1]) best = entry;
  return best;
}

function add<K>(counts: Map<K, number>, key: K, amount = 1): void {
  counts.set(key, (counts.get(key) ?? 0) + amount);
}

const hoursOf = (minutes: number) => Math.round(minutes / 6) / 10;

/** Counts only classes that have ended by `now`, and only club events between the first and last of them. */
export function termRecap(
  timetable: Timetable,
  weekOneMonday: string,
  now: Date,
  countEvents?: (start: Date, end: Date) => number,
): TermRecap | undefined {
  let occurrences;
  try {
    occurrences = createTimetableSchedule(timetable, { weekOneMonday }).occurrences();
  } catch {
    return undefined;
  }
  const held = occurrences.filter((o) => o.end.getTime() <= now.getTime());
  const first = held[0];
  const last = held.at(-1);
  if (!first || !last) return undefined;

  const minutesByCourse = new Map<string, number>();
  const visitsByRoom = new Map<string, number>();
  const byDate = new Map<string, typeof held>();
  let minutes = 0;
  let earlyClasses = 0;
  for (const o of held) {
    const length = (o.end.getTime() - o.start.getTime()) / MINUTE_MS;
    minutes += length;
    add(minutesByCourse, o.meeting.courseName, length);
    if (o.meeting.location) add(visitsByRoom, o.meeting.location);
    if (o.startTime < EARLY_START) earlyClasses += 1;
    const day = byDate.get(o.date) ?? [];
    day.push(o);
    byDate.set(o.date, day);
  }

  let busiestDay: TermRecap['busiestDay'];
  for (const [date, day] of byDate) {
    if (busiestDay && day.length <= busiestDay.classes) continue;
    const to = day.reduce((latest, o) => (o.endTime > latest ? o.endTime : latest), '');
    busiestDay = { date, classes: day.length, from: day[0]?.startTime ?? '', to };
  }

  const top = mostCommon(minutesByCourse);
  const room = mostCommon(visitsByRoom);
  return {
    finished: held.length === occurrences.length,
    progress: held.length / occurrences.length,
    classes: held.length,
    hours: hoursOf(minutes),
    courses: minutesByCourse.size,
    weeks: new Set(held.map((o) => o.week)).size,
    earlyClasses,
    ...(busiestDay ? { busiestDay } : {}),
    ...(top ? { topCourse: { name: top[0], hours: hoursOf(top[1]) } } : {}),
    ...(room ? { favoriteRoom: { name: room[0], visits: room[1] } } : {}),
    ...(countEvents ? { events: countEvents(first.start, last.end) } : {}),
  };
}
