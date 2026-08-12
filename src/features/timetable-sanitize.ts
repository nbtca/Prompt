import type { AcademicTerm, Timetable, TimetableUnresolvedItem } from '@nbtca/nbtcal/timetable';
import { sanitizeTerminalLine } from '../core/text.js';
import { termKey } from './schedule-store.js';

export function sanitizeAcademicTerm(term: AcademicTerm): AcademicTerm {
  termKey(term);
  return {
    ...term,
    academicYearLabel: sanitizeTerminalLine(term.academicYearLabel),
    semesterLabel: sanitizeTerminalLine(term.semesterLabel),
  };
}

function sanitizeUnresolvedItem(item: TimetableUnresolvedItem): TimetableUnresolvedItem {
  return {
    ...item,
    sourceFields: Object.fromEntries(
      Object.entries(item.sourceFields).map(([key, value]) => [key, sanitizeTerminalLine(value)]),
    ),
  };
}

export function sanitizeTimetable(timetable: Timetable): Timetable {
  const untimedCourses = timetable.untimedCourses?.map((course) => ({
    ...course,
    courseName: sanitizeTerminalLine(course.courseName),
    teacherNames: course.teacherNames.map(sanitizeTerminalLine),
    campus: course.campus === null ? null : sanitizeTerminalLine(course.campus),
    location: course.location === null ? null : sanitizeTerminalLine(course.location),
  }));
  return {
    ...timetable,
    meetings: timetable.meetings.map((meeting) => ({
      ...meeting,
      courseName: sanitizeTerminalLine(meeting.courseName),
      teacherNames: meeting.teacherNames.map(sanitizeTerminalLine),
      location: meeting.location === null ? null : sanitizeTerminalLine(meeting.location),
    })),
    ...(untimedCourses === undefined ? {} : { untimedCourses }),
    unresolvedItems: timetable.unresolvedItems.map(sanitizeUnresolvedItem),
    periods: timetable.periods.map((period) => ({
      ...period,
      label: period.label === null ? null : sanitizeTerminalLine(period.label),
    })),
  };
}
