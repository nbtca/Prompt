import {
  campusIsoDate,
  createTimetableSchedule,
  type TimetableOccurrence,
} from '@nbtca/nbtcal/timetable';
import { truncate } from '../core/text.js';
import { fmt, t } from '../i18n/index.js';
import type { CachedSchedule } from './schedule-view.js';

const MINUTE_MS = 60_000;
const COUNTDOWN_MINUTES = 60;
const COURSE_WIDTH = 16;

export interface PromptClass {
  state: 'live' | 'next';
  course: string;
  location: string | null;
  startTime: string;
  start: Date;
  end: Date;
  minutes: number;
}

function toPromptClass(occurrence: TimetableOccurrence, now: Date): PromptClass {
  const live = occurrence.start.getTime() <= now.getTime();
  const target = live ? occurrence.end : occurrence.start;
  return {
    state: live ? 'live' : 'next',
    course: occurrence.meeting.courseName,
    location: occurrence.meeting.location,
    startTime: occurrence.startTime,
    start: occurrence.start,
    end: occurrence.end,
    minutes: Math.max(1, Math.ceil((target.getTime() - now.getTime()) / MINUTE_MS)),
  };
}

/** The class in progress, or else the next class later today; undefined when the day is done or the cache is unusable. */
export function promptClass(
  cached: CachedSchedule,
  now: Date = new Date(),
): PromptClass | undefined {
  try {
    const schedule = createTimetableSchedule(cached.timetable, {
      weekOneMonday: cached.weekOneMonday,
    });
    const at = now.getTime();
    const current = schedule
      .occurrences()
      .find((o) => o.start.getTime() <= at && at < o.end.getTime());
    if (current) return toPromptClass(current, now);
    const next = schedule.next(now);
    return next?.date === campusIsoDate(now) ? toPromptClass(next, now) : undefined;
  } catch {
    return undefined;
  }
}

export function promptLine(value: PromptClass | undefined, unicode: boolean): string {
  if (!value) return '';
  const trans = t().prompt;
  const marker = value.state === 'live' ? (unicode ? '●' : '*') : unicode ? '○' : '-';
  const sep = unicode ? ' · ' : ' | ';
  const when =
    value.state === 'live'
      ? fmt(trans.endsIn, { minutes: value.minutes })
      : value.minutes <= COUNTDOWN_MINUTES
        ? fmt(trans.startsIn, { minutes: value.minutes })
        : value.startTime;
  const course = truncate(value.course, COURSE_WIDTH, unicode ? '…' : '...');
  return [`${marker} ${course}`, value.location, when].filter(Boolean).join(sep);
}

export function serializePromptClass(value: PromptClass | undefined): unknown {
  if (!value) return null;
  return { ...value, start: value.start.toISOString(), end: value.end.toISOString() };
}
