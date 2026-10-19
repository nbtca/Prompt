import { afterEach, describe, expect, it } from 'vitest';
import type { StudentRecords } from '@nbtca/nbtcal/academic';
import {
  renderStudentRecordsPanel,
  renderStudentRecordDetail,
  visibleStudentRecords,
  type StudentRecordsDisplay,
} from './student-records-render.js';
import { stripAnsi, visualWidth } from '../../core/text.js';
import { setLanguage, t } from '../../i18n/index.js';

const now = new Date('2026-10-19T16:30:00Z');
const term = {
  academicYear: '2026',
  semester: '3',
  academicYearLabel: '2026-2027',
  semesterLabel: '1',
  current: true,
} as const;
const grades: StudentRecords = {
  kind: 'grades',
  term,
  fetchedAt: now,
  items: Array.from({ length: 18 }, (_, i) => ({
    courseName: `课程 Course ${i}`,
    courseCode: `CS${i}`,
    grade: i === 0 ? '0' : i === 1 ? null : '优秀',
    credits: 2.5,
    gradePoint: i === 0 ? 0 : null,
    courseNature: 'Required',
    examNature: null,
    remark: null,
    voided: i === 2,
  })),
};
const exams: StudentRecords = {
  kind: 'exams',
  term,
  fetchedAt: now,
  items: Array.from({ length: 3 }, (_, i) => ({
    courseName: ['Past course', 'Next course', 'Pending course'][i] ?? '',
    courseCode: `EX${i}`,
    examName: null,
    assessment: null,
    campus: 'Campus',
    location: 'Room 201',
    seat: '08',
    timeText: i === 2 ? '未放开不可查' : null,
    start: i === 2 ? null : new Date(`2026-10-${19 + i}T17:00:00+08:00`),
    end: i === 2 ? null : new Date(`2026-10-${19 + i}T19:00:00+08:00`),
  })),
};
function state(data: StudentRecords): StudentRecordsDisplay {
  return {
    kind: data.kind,
    term,
    data,
    pending: false,
    error: undefined,
    selected: 0,
    query: '',
    attention: false,
    searching: false,
  };
}
function text(lines: string[]): string {
  return lines.map(stripAnsi).join('\n');
}
afterEach(() => {
  setLanguage('en');
});

describe('student records viewport', () => {
  it.each(['en', 'zh'] as const)(
    'fits %s lists, searches, errors and loading in resized terminals',
    (language) => {
      setLanguage(language);
      for (const data of [grades, exams]) {
        for (const [cols, bodyRows] of [
          [120, 25],
          [80, 19],
          [60, 15],
          [40, 7],
          [20, 9],
          [4, 2],
          [1, 0],
        ]) {
          if (cols === undefined || bodyRows === undefined) continue;
          for (const changes of [
            {},
            { searching: true, query: '课程' },
            { pending: true, data: undefined },
            { error: 'Failed to query this term. Please retry.', data: undefined },
          ]) {
            const rendered = renderStudentRecordsPanel(
              { ...state(data), ...changes },
              bodyRows,
              cols,
              now,
            );
            expect(rendered.lines.length).toBeLessThanOrEqual(bodyRows);
            expect(rendered.lines.every((line) => visualWidth(line) <= cols)).toBe(true);
            if (bodyRows >= 7)
              expect(stripAnsi(rendered.lines.at(-1) ?? '')).toContain(
                'searching' in changes ? 'Enter' : 'x',
              );
          }
        }
      }
    },
  );

  it('shows a dense grade table and pages to the selected course', () => {
    const first = renderStudentRecordsPanel(state(grades), 19, 80, now);
    expect(first.pageSize).toBeGreaterThanOrEqual(10);
    expect(text(first.lines)).toContain('Credits');
    expect(text(first.lines)).toContain('Course 0');
    expect(text(first.lines)).toContain('1/18');
    const last = renderStudentRecordsPanel({ ...state(grades), selected: 17 }, 19, 80, now);
    expect(text(last.lines)).toContain('Course 17');
    expect(text(last.lines)).not.toContain('Course 0');
    expect(text(last.lines.at(-1) ? [last.lines.at(-1) ?? ''] : [])).toContain('18/18');
  });

  it('shows full details beside the list only when there is room', () => {
    expect(text(renderStudentRecordsPanel(state(grades), 25, 120, now).lines)).toContain('CS0');
    expect(text(renderStudentRecordsPanel(state(grades), 19, 80, now).lines)).not.toContain('CS0');
    const detail = renderStudentRecordDetail(grades, 0, 20, now);
    expect(text(detail)).toContain('Grade: 0');
    expect(text(detail)).toContain('Grade points: 0');
    expect(detail.every((line) => visualWidth(line) <= 20)).toBe(true);
  });

  it('highlights the next exam using campus dates and keeps unpublished times intact', () => {
    const output = text(renderStudentRecordsPanel(state(exams), 19, 80, now).lines);
    expect(output).toContain('Next exam · Today · Next course');
    expect(output).toContain('17:00–19:00');
    expect(output).toContain('未放开不可查');
    expect(output).toContain('Ended');
    expect(output).toContain('Seat: 08');
  });

  it('keeps the exam time and room visible in a narrow terminal', () => {
    setLanguage('zh');
    const output = text(renderStudentRecordsPanel(state(exams), 7, 40, now).lines);
    expect(output).toContain('10/20 17:00–19:00 · Room 201');
  });

  it('searches names and codes and filters without treating zero or labels as missing grades', () => {
    expect(visibleStudentRecords(grades, '', true, now)).toEqual([1, 2]);
    expect(visibleStudentRecords(grades, 'ＣＳ０', false, now)).toEqual([0]);
    expect(visibleStudentRecords(grades, '课程 course 17', false, now)).toEqual([17]);
    expect(visibleStudentRecords(exams, '', true, now)).toEqual([1, 2]);
    expect(visibleStudentRecords(exams, 'pending', true, now)).toEqual([2]);
    const empty = text(
      renderStudentRecordsPanel({ ...state(grades), query: 'missing' }, 19, 80, now).lines,
    );
    expect(empty).toContain(t().records.clearFilters);
  });
});
