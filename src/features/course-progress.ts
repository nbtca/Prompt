import {
  createTimetableSchedule,
  type Timetable,
  type TimetableMeeting,
  type TimetableOccurrence,
} from '@nbtca/nbtcal/timetable';

export interface CourseProgress {
  now: Date;
  held: number;
  total: number;
  live?: TimetableOccurrence;
  next?: TimetableOccurrence;
  /** The course's other weekly slots, such as a second weekday or a make-up week. */
  others: TimetableMeeting[];
  termWeeks: number;
  currentWeek: number;
}

const sameSlot = (a: TimetableMeeting, b: TimetableMeeting): boolean =>
  a.courseName === b.courseName &&
  a.weekday === b.weekday &&
  a.startPeriod === b.startPeriod &&
  a.endPeriod === b.endPeriod;

/** Where a course stands this term, counted over every slot it has; undefined when the timetable cannot be scheduled. */
export function courseProgress(
  timetable: Timetable,
  weekOneMonday: string,
  meeting: TimetableMeeting,
  now: Date,
): CourseProgress | undefined {
  try {
    const schedule = createTimetableSchedule(timetable, { weekOneMonday });
    const at = now.getTime();
    const sessions = schedule
      .occurrences()
      .filter((o) => o.meeting.courseName === meeting.courseName);
    const live = sessions.find((o) => o.start.getTime() <= at && at < o.end.getTime());
    const next = sessions.find((o) => o.start.getTime() > at);
    return {
      now,
      held: sessions.filter((o) => o.end.getTime() <= at).length,
      total: sessions.length,
      ...(live ? { live } : {}),
      ...(next ? { next } : {}),
      others: timetable.meetings.filter(
        (m) => m.courseName === meeting.courseName && !sameSlot(m, meeting),
      ),
      termWeeks: Math.max(0, ...timetable.meetings.flatMap((m) => m.weeks)),
      currentWeek: schedule.weekAt(now),
    };
  } catch {
    return undefined;
  }
}
