import type { AcademicTerm } from '@nbtca/nbtcal/timetable';
import { sanitizeTerminalLine, wrapAnsiWithIndent } from '../core/text.js';
import { fmt, t } from '../i18n/index.js';
import { displaySemesterLabel } from './student-timetable.js';
import type { StudentRecords } from './student-records-client.js';

export function renderStudentRecords(
  data: StudentRecords,
  term: AcademicTerm,
  cols = Number.POSITIVE_INFINITY,
): string[] {
  const trans = t().records;
  const lines: string[] = [];
  const add = (value: string) => {
    lines.push(...wrapAnsiWithIndent(sanitizeTerminalLine(value), cols, '  '));
  };
  add(`${trans[data.kind]} · ${term.academicYearLabel} · ${displaySemesterLabel(term)}`);
  lines.push('');
  if (data.items.length === 0) {
    add(data.kind === 'exams' ? trans.noExams : trans.noGrades);
    return lines;
  }
  if (data.kind === 'exams') {
    for (const exam of data.items) {
      add(exam.courseName + (exam.courseCode ? ` (${exam.courseCode})` : ''));
      add(exam.timeText ?? trans.timeUnavailable);
      if (exam.examName) add(exam.examName);
      if (exam.location || exam.campus)
        add([exam.campus, exam.location].filter(Boolean).join(' · '));
      if (exam.seat) add(fmt(trans.seat, { value: exam.seat }));
      if (exam.assessment) add(exam.assessment);
      lines.push('');
    }
  } else {
    for (const grade of data.items) {
      add(grade.courseName + (grade.courseCode ? ` (${grade.courseCode})` : ''));
      add(fmt(trans.gradeValue, { value: grade.grade ?? trans.notPublished }));
      if (grade.credits !== null) add(fmt(trans.credits, { value: grade.credits }));
      if (grade.gradePoint !== null) add(fmt(trans.gradePoint, { value: grade.gradePoint }));
      if (grade.examNature || grade.courseNature)
        add([grade.examNature, grade.courseNature].filter(Boolean).join(' · '));
      if (grade.voided === true) add(trans.voided);
      if (grade.remark) add(grade.remark);
      lines.push('');
    }
  }
  add(trans.memoryOnly);
  return lines;
}
