import type {
  StudentExam,
  StudentGrade,
  StudentRecords,
  StudentRecordsKind,
} from '@nbtca/nbtcal/academic';
import { campusIsoDate, type AcademicTerm } from '@nbtca/nbtcal/timetable';
import { c, type, glyph, space, bodyEdge } from '../../core/theme.js';
import {
  clipAnsiToVisualWidth,
  padEndV,
  sanitizeTerminalLine,
  truncate,
  visualWidth,
  wrapAnsiToVisualWidth,
} from '../../core/text.js';
import { spinnerFrame } from '../../core/components/spinner.js';
import { pickIcon } from '../../core/icons.js';
import { isoDayDifference } from '../../core/calendar-day.js';
import { displaySemesterLabel } from '../../features/student-timetable.js';
import { fmt, getCurrentLanguage, t } from '../../i18n/index.js';

export interface StudentRecordsDisplay {
  kind: StudentRecordsKind;
  term: AcademicTerm;
  data: StudentRecords | undefined;
  pending: boolean;
  error: string | undefined;
  selected: number;
  query: string;
  attention: boolean;
  searching: boolean;
  sealed?: ReadonlySet<number>;
}

export interface GradeSeal {
  sealed: boolean;
  /** 0 to 1 while a sealed result is being revealed; the frame number keeps the scramble moving. */
  reveal?: { progress: number; frame: number };
}

const SCRAMBLE = '0123456789ABCDF';

function sealMark(): string {
  return pickIcon('▒▒▒', '###');
}

function scramble(text: string, progress: number, frame: number): string {
  if (progress >= 1) return text;
  const chars = Array.from(text);
  const settled = Math.floor(Math.max(0, (progress - 0.4) / 0.6) * chars.length);
  return chars
    .map((ch, i) => (i < settled ? ch : (SCRAMBLE[(frame * 7 + i * 13) % SCRAMBLE.length] ?? ch)))
    .join('');
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function dateText(date: Date, format: 'day' | 'shortDay' | 'clock'): string {
  const language = getCurrentLanguage();
  const key = `${language}:${format}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-GB', {
      timeZone: 'Asia/Shanghai',
      ...(format !== 'clock'
        ? ({
            month: '2-digit',
            day: '2-digit',
            ...(format === 'day' ? { weekday: 'short' } : {}),
          } as const)
        : ({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const)),
    });
    formatters.set(key, formatter);
  }
  if (format === 'clock') return formatter.format(date);
  const parts = formatter.formatToParts(date);
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === name)?.value ?? '';
  if (format === 'shortDay') return `${part('month')}/${part('day')}`;
  return language === 'zh'
    ? `${part('month')}/${part('day')} ${part('weekday')}`
    : `${part('weekday')} ${part('day')}/${part('month')}`;
}

function examStatus(exam: StudentExam, now: Date): string {
  const trans = t().records;
  if (!exam.start || !exam.end) return trans.pendingTag;
  if (exam.end <= now) return trans.ended;
  if (exam.start <= now) return trans.inProgress;
  const days = isoDayDifference(campusIsoDate(now), campusIsoDate(exam.start));
  return days === 0 ? trans.today : days === 1 ? trans.tomorrow : fmt(trans.daysAway, { days });
}

function examTime(exam: StudentExam, compact = false): string {
  return exam.start && exam.end
    ? `${dateText(exam.start, compact ? 'shortDay' : 'day')} ${dateText(exam.start, 'clock')}–${dateText(exam.end, 'clock')}`
    : (exam.timeText ?? t().records.timeUnavailable);
}

export function visibleStudentRecords(
  data: StudentRecords | undefined,
  query: string,
  attention: boolean,
  now: Date,
): number[] {
  if (!data) return [];
  const needle = query.trim().normalize('NFKC').toLowerCase();
  return data.items.flatMap((item, index) => {
    if (
      needle &&
      !`${item.courseName} ${item.courseCode ?? ''}`
        .normalize('NFKC')
        .toLowerCase()
        .includes(needle)
    )
      return [];
    if (
      attention &&
      ('end' in item ? item.end !== null && item.end <= now : item.grade !== null && !item.voided)
    )
      return [];
    return [index];
  });
}

function pair(left: string, right: string, width: number): string {
  const room = width - visualWidth(right) - 2;
  if (room < 4) return truncate(left, width, '…');
  return padEndV(truncate(left, room, '…'), width - visualWidth(right)) + right;
}

function resultText(grade: StudentGrade): string {
  const value = grade.grade ?? t().records.notPublished;
  return grade.voided ? `${value} ${t().records.voidTag}` : value;
}

function gradeRow(
  grade: StudentGrade,
  width: number,
  selected: boolean,
  table: boolean,
  sealed: boolean,
): string[] {
  const marker = selected ? `${glyph.cursor()} ` : '  ';
  const result = sealed ? `${sealMark()} ${t().records.newTag}` : resultText(grade);
  const gradePoint = sealed ? null : grade.gradePoint;
  if (!table) {
    return [
      pair(marker + grade.courseName, result, width),
      `  ${[grade.credits === null ? '' : fmt(t().records.credits, { value: grade.credits }), gradePoint === null ? '' : fmt(t().records.gradePoint, { value: gradePoint })].filter(Boolean).join(' · ')}`,
    ];
  }
  const courseWidth = width - 31;
  const value = padEndV(truncate(result, 10, '…'), 10);
  const credits = String(grade.credits ?? '—');
  const point = sealed ? sealMark().slice(0, 1) : String(grade.gradePoint ?? '—');
  const plain = `${marker}${padEndV(truncate(grade.courseName, courseWidth, '…'), courseWidth)}  ${value}  ${padEndV(credits, 7)}  ${padEndV(point, 6)}`;
  if (selected) return [type.cursor(padEndV(plain, width))];
  const styled = sealed
    ? type.active(value)
    : grade.voided || grade.grade === null
      ? c.warn(value)
      : type.heading(value);
  return [
    `${marker}${padEndV(truncate(grade.courseName, courseWidth, '…'), courseWidth)}  ${styled}  ${type.hint(padEndV(credits, 7))}  ${type.hint(padEndV(point, 6))}`,
  ];
}

function examRow(exam: StudentExam, width: number, selected: boolean, now: Date): string[] {
  const main = pair(
    `${selected ? glyph.cursor() : ' '} ${exam.courseName}`,
    examStatus(exam, now),
    width,
  );
  const location = [
    exam.location,
    width >= 54 && exam.seat ? fmt(t().records.seat, { value: exam.seat }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const meta = `  ${examTime(exam, width < 54)}${location ? ` · ${location}` : ''}`;
  return [
    selected
      ? type.cursor(padEndV(main, width))
      : exam.end && exam.end <= now
        ? type.hint(main)
        : type.heading(main),
    type.hint(truncate(meta, width, '…')),
  ];
}

export function renderStudentRecordDetail(
  data: StudentRecords,
  index: number,
  cols: number,
  now: Date,
  seal: GradeSeal = { sealed: false },
): string[] {
  const item = data.items[index];
  if (!item) return [];
  const trans = t().records;
  const lines: string[] = [];
  const add = (value: string, style = type.body) => {
    lines.push(...wrapAnsiToVisualWidth(style(sanitizeTerminalLine(value)), cols));
  };
  add(item.courseName, type.heading);
  if (item.courseCode) add(item.courseCode, type.hint);
  lines.push('');
  if (data.kind === 'grades') {
    const grade = item as StudentGrade;
    const hidden = seal.sealed || (seal.reveal !== undefined && seal.reveal.progress < 1);
    const value = seal.sealed
      ? sealMark()
      : seal.reveal
        ? scramble(grade.grade ?? trans.notPublished, seal.reveal.progress, seal.reveal.frame)
        : (grade.grade ?? trans.notPublished);
    add(fmt(trans.gradeValue, { value }), grade.voided && !hidden ? c.warn : type.active);
    if (seal.sealed) add(trans.revealHint, type.hint);
    if (grade.voided && !hidden) add(trans.voided, c.warn);
    lines.push('');
    if (grade.credits !== null) add(fmt(trans.credits, { value: grade.credits }));
    if (grade.gradePoint !== null && !hidden)
      add(fmt(trans.gradePoint, { value: grade.gradePoint }));
    if (grade.courseNature) add(`${trans.courseNature}  ${grade.courseNature}`);
    if (grade.examNature) add(`${trans.examNature}  ${grade.examNature}`);
    if (grade.remark) {
      lines.push('');
      add(grade.remark, type.hint);
    }
  } else {
    const exam = item as StudentExam;
    add(examStatus(exam, now), exam.start ? type.active : c.warn);
    add(examTime(exam));
    lines.push('');
    if (exam.location) add(`${trans.location}  ${exam.location}`);
    if (exam.campus) add(`${trans.campus}  ${exam.campus}`);
    if (exam.seat) add(fmt(trans.seat, { value: exam.seat }), type.heading);
    if (exam.examName) add(`${trans.examName}  ${exam.examName}`);
    if (exam.assessment) add(`${trans.assessment}  ${exam.assessment}`);
  }
  return lines;
}

function summary(data: StudentRecords, attention: boolean, fresh: number): string {
  const trans = t().records;
  if (data.kind === 'grades') {
    const published = data.items.filter((grade) => grade.grade !== null).length;
    const news = fresh > 0 ? ` · ${fmt(trans.newSummary, { count: fresh })}` : '';
    return `${fmt(trans.gradeSummary, { published, total: data.items.length })}${news}${attention ? ` · ${trans.needsAttention}` : ''}`;
  }
  const pending = data.items.filter((exam) => !exam.start).length;
  return `${fmt(trans.examSummary, { total: data.items.length, pending })}${attention ? ` · ${trans.upcomingOnly}` : ''}`;
}

export function renderStudentRecordsPanel(
  state: StudentRecordsDisplay,
  bodyRows: number,
  cols: number,
  now: Date,
): { lines: string[]; pageSize: number } {
  const rows = Math.max(0, Math.floor(bodyRows));
  const width = Math.max(1, bodyEdge(cols) - (cols > 6 ? space.indent.length : 0));
  const indent = cols > 6 ? space.indent : '';
  const trans = t().records;
  const lines: string[] = [];
  const tabs = (['exams', 'grades'] as const)
    .map((kind) => (kind === state.kind ? type.active(`[${trans[kind]}]`) : type.hint(trans[kind])))
    .join('  ');
  lines.push(
    visualWidth(tabs) <= width ? tabs : type.heading(truncate(trans[state.kind], width, '…')),
  );
  if (rows >= 6) {
    const term = `${state.term.academicYearLabel} · ${displaySemesterLabel(state.term)}`;
    const updated =
      state.attention && rows < 10
        ? trans.filtered
        : state.data
          ? `${trans.updated} ${dateText(state.data.fetchedAt, 'clock')}`
          : '';
    lines.push(type.hint(pair(term, updated, width)));
  }
  if (rows >= 10 && state.data)
    lines.push(
      type.hint(
        truncate(summary(state.data, state.attention, state.sealed?.size ?? 0), width, '…'),
      ),
    );
  if (state.query || state.searching)
    lines.push(
      type.active(
        truncate(
          `/ ${state.query}${state.searching ? '▏' : ''}${state.searching && !state.query ? ` ${trans.searchHint}` : ''}`,
          width,
          '…',
        ),
      ),
    );
  if (state.data?.kind === 'exams' && rows >= 15 && !state.query) {
    const next = state.data.items.find((exam) => exam.start && exam.end && exam.end > now);
    if (next) {
      lines.push('');
      lines.push(
        type.active(
          truncate(`${trans.nextExam} · ${examStatus(next, now)} · ${next.courseName}`, width, '…'),
        ),
      );
      lines.push(
        type.hint(
          truncate(`${examTime(next)}${next.location ? ` · ${next.location}` : ''}`, width, '…'),
        ),
      );
    }
  }
  if (rows >= 10) lines.push('');
  const indices = visibleStudentRecords(state.data, state.query, state.attention, now);
  const selected = Math.min(Math.max(0, state.selected), Math.max(0, indices.length - 1));
  const split = width >= 94 && rows >= 12 && indices.length > 0;
  const listWidth = split ? Math.floor(width * 0.6) : width;
  const table = state.kind === 'grades' && listWidth >= 54 && rows >= 9 && indices.length > 0;
  if (table) {
    lines.push(
      type.hint(
        `  ${padEndV(trans.course, listWidth - 31)}  ${padEndV(trans.result, 10)}  ${padEndV(trans.creditLabel, 7)}  ${trans.pointLabel}`,
      ),
    );
    lines.push(type.hint(glyph.rule().repeat(width)));
  }
  const available = Math.max(0, rows - lines.length - 1);
  const rowHeight = table || rows < 7 ? 1 : 2;
  const pageSize = Math.max(1, Math.floor(available / rowHeight));
  const start = Math.floor(selected / pageSize) * pageSize;
  const list: string[] = [];
  if (state.pending) list.push(type.hint(`${spinnerFrame()} ${trans.loading}`));
  else if (state.error) list.push(...wrapAnsiToVisualWidth(c.warn(state.error), listWidth));
  else if (indices.length === 0) {
    const filtered = Boolean(state.query || state.attention);
    list.push(
      ...wrapAnsiToVisualWidth(
        filtered ? trans.noMatches : state.kind === 'grades' ? trans.noGrades : trans.noExams,
        listWidth,
      ),
    );
    list.push('');
    list.push(
      ...wrapAnsiToVisualWidth(
        type.hint(filtered ? trans.clearFilters : trans.emptyHint),
        listWidth,
      ),
    );
  } else if (state.data) {
    for (let offset = start; offset < Math.min(indices.length, start + pageSize); offset += 1) {
      const index = indices[offset];
      const item = index === undefined ? undefined : state.data.items[index];
      if (!item) continue;
      const record =
        state.kind === 'grades'
          ? gradeRow(
              item as StudentGrade,
              listWidth,
              offset === selected,
              table,
              state.sealed?.has(index ?? -1) === true,
            )
          : examRow(item as StudentExam, listWidth, offset === selected, now);
      list.push(
        ...record
          .slice(0, rowHeight)
          .map((line) =>
            offset === selected && !table && state.kind === 'grades' ? type.active(line) : line,
          ),
      );
    }
  }
  const detail =
    split && state.data && indices[selected] !== undefined
      ? renderStudentRecordDetail(state.data, indices[selected], width - listWidth - 3, now, {
          sealed: state.sealed?.has(indices[selected]) === true,
        })
      : [];
  for (let row = 0; row < available; row += 1) {
    const left = clipAnsiToVisualWidth(list[row] ?? '', listWidth);
    lines.push(
      split ? `${padEndV(left, listWidth)} ${type.hint(glyph.bar())} ${detail[row] ?? ''}` : left,
    );
  }
  const count = indices.length ? `${selected + 1}/${indices.length}` : '';
  const actions =
    (state.searching
      ? [trans.searchFooter, 'Enter · Esc']
      : state.pending
        ? ['←→ · x']
        : [
            `s ${trans.termAction} · / ${trans.searchAction} · f ${state.attention ? trans.allRecords : trans.filterAction} · r ${trans.refresh} · x ${t().timetable.hubLogout}`,
            's · / · f · r · x',
            's / f r x',
          ]
    ).find((value) => visualWidth(value) + visualWidth(count) + 2 <= width) ?? '';
  lines.push(type.hint(pair(actions, count, width)));
  return {
    lines: lines.slice(0, rows).map((line) => indent + clipAnsiToVisualWidth(line, width)),
    pageSize,
  };
}
