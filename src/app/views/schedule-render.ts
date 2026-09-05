import {
  createTimetableSchedule,
  type AcademicTerm,
  type Timetable,
  type TimetableMeeting,
  type Weekday,
} from '@nbtca/nbtcal/timetable';
import { c, type, space, glyph } from '../../core/theme.js';
import { pickIcon } from '../../core/icons.js';
import { t, fmt } from '../../i18n/index.js';
import { type ListField, renderListFieldWithContext } from '../fields/list-field.js';
import type { TextField } from '../fields/text-field.js';
import {
  renderNextClassBanner,
  renderWeekGrid,
  renderUnresolvedItems,
  renderTodayTimeline,
  weekdayShortLabel,
  renderTermDensity,
  renderMeetingDetail,
  renderDayTimeline,
  renderDaySwitcher,
} from '../../features/schedule-render.js';
import type { AcademicWindow, OnBreak } from '@nbtca/nbtcal';
import type { GridCursor } from './schedule-grid-cursor.js';
import { sanitizeTerminalLine, visualWidth, wrapAnsiWithIndent } from '../../core/text.js';
import { localDayDifference, parseLocalDate, parseLocalMonday } from '../../core/calendar-day.js';
import { loadingLines } from '../../core/components/spinner.js';

export type ScheduleMode =
  | 'loading'
  | 'public'
  | 'needsLoginId'
  | 'needsLoginPassword'
  | 'authenticating'
  | 'needsWeekOne'
  | 'hub'
  | 'week'
  | 'termDensity'
  | 'termPicker'
  | 'unresolved'
  | 'meetingDetail'
  | 'error';

export interface ScheduleViewState {
  mode: ScheduleMode;
  errorMessage?: string;
  statusMessage?: string;
  idField?: TextField;
  passwordField?: TextField;
  weekOneField?: TextField;
  termField?: ListField;
  key?: string;
  term?: AcademicTerm;
  weekOne?: string;
  timetable?: Timetable;
  publicField?: ListField;
  publicWindow?: AcademicWindow | OnBreak | null;
  gridCursor?: GridCursor;
  detailMeeting?: TimetableMeeting;
  detailFrom?: 'hub' | 'week';
}

function heading(label: string): string {
  return `${space.indent}${type.heading(label)}`;
}

function hint(label: string): string {
  return `${space.indent}${type.hint(label)}`;
}

function wrappedIndentedLines(
  label: string,
  cols: number,
  style: (value: string) => string,
): string[] {
  return wrapAnsiWithIndent(style(label), cols, space.indent);
}

function headingLines(label: string, cols: number): string[] {
  return wrappedIndentedLines(label, cols, type.heading);
}

function hintLines(label: string, cols: number): string[] {
  return wrappedIndentedLines(label, cols, type.hint);
}

export interface HubShortcut {
  key: string;
  label: string;
  showKey?: boolean;
  warn?: boolean;
}

export function hubShortcuts(tt: Timetable): HubShortcut[] {
  const trans = t();
  const shortcuts: HubShortcut[] = [
    { key: 'w', label: trans.timetable.hubFullGrid },
    { key: 't', label: trans.timetable.hubTermDensity },
    { key: 's', label: trans.timetable.hubSwitchTerm },
    { key: 'e', label: trans.timetable.hubExport },
  ];
  if (tt.unresolvedItems.length > 0) {
    shortcuts.push({
      key: 'u',
      label: `${pickIcon('⚠', '!')} ${tt.unresolvedItems.length}`,
      showKey: false,
      warn: true,
    });
  }
  shortcuts.push({ key: 'x', label: trans.timetable.hubLogout });
  return shortcuts;
}

function renderShortcutLines(
  shortcuts: readonly HubShortcut[],
  cols: number,
  compact = false,
): string[] {
  const available = Math.max(1, cols - visualWidth(space.indent));
  const parts = shortcuts.map((shortcut) => {
    const text = compact
      ? shortcut.showKey === false
        ? `[${shortcut.key}] ${shortcut.label}`
        : `[${shortcut.key}]`
      : shortcut.showKey === false
        ? `[${shortcut.label}]`
        : `[${shortcut.key}] ${shortcut.label}`;
    return shortcut.warn ? c.warn(text) : type.hint(text);
  });
  const lines: string[] = [];
  let current = '';
  for (const part of parts) {
    const next = current ? `${current}  ${part}` : part;
    if (current && visualWidth(next) > available) {
      lines.push(`${space.indent}${current}`);
      current = part;
    } else {
      current = next;
    }
  }
  if (current) lines.push(`${space.indent}${current}`);
  return lines;
}

function hubPreGridLines(
  state: ScheduleViewState,
  now: Date,
  cols: number,
): {
  inlineLines: string[];
  fallbackLines: string[];
  week: number;
  tt: Timetable;
} | null {
  const trans = t();
  const tt = state.timetable;
  if (!tt || !state.weekOne) return null;
  const schedule = createTimetableSchedule(tt, { weekOneMonday: state.weekOne });
  const week = schedule.weekAt(now);
  const lines: string[] = [];
  let next = null;
  try {
    next = schedule.next(now);
  } catch {}
  const banner = renderNextClassBanner(next, now, cols);
  lines.push(...(banner ? [banner] : hintLines(trans.timetable.noNextClass, cols)));
  lines.push('');
  const todayWd = schedule.weekdayAt(now);
  if (week < 1) {
    lines.push(heading(trans.timetable.termNotStarted));
    lines.push(
      hint(
        fmt(trans.timetable.termStartsIn, {
          date: state.weekOne,
          days: String(daysBetween(now, new Date(`${state.weekOne}T00:00:00`))),
        }),
      ),
    );
    lines.push('');
    lines.push(heading(trans.timetable.termPreviewWeek));
    return { inlineLines: lines, fallbackLines: [...lines], week: 1, tt };
  }
  const today = schedule.meetingsOnDay(week, todayWd);
  const weekHeading = heading(trans.timetable.hubWeek);
  const inlineLines = [
    ...lines,
    heading(
      fmt(trans.timetable.todayHeading, {
        weekday: weekdayShortLabel(todayWd),
        week: String(week),
      }),
    ),
    ...renderTodayTimeline(today, tt.periods, now, cols).split('\n'),
    weekHeading,
  ];
  return { inlineLines, fallbackLines: [...lines, weekHeading], week, tt };
}

const MIN_GRID_COLS = 100;

function gridFitsInline(
  precedingLineCount: number,
  tt: Timetable,
  week: number,
  now: Date,
  bodyRows: number,
  cols: number,
  cursor: GridCursor | undefined,
  reservedRows: number,
): boolean {
  if (cols < MIN_GRID_COLS) return false;
  const gridLines = renderWeekGrid(tt, week, now, cols, cursor).split('\n');
  return precedingLineCount + gridLines.length <= bodyRows - reservedRows;
}

function renderAdaptiveWeekGrid(
  inlineLines: string[],
  fallbackLines: string[],
  tt: Timetable,
  week: number,
  todayWd: Weekday,
  now: Date,
  bodyRows: number,
  cols: number,
  cursor: GridCursor | undefined,
  reservedRows: number,
): string[] {
  if (gridFitsInline(inlineLines.length, tt, week, now, bodyRows, cols, cursor, reservedRows)) {
    return [...inlineLines, ...renderWeekGrid(tt, week, now, cols, cursor).split('\n')];
  }
  const selectedWd = cursor?.weekday ?? todayWd;
  const dayMeetings = createTimetableSchedule(tt).meetingsOnDay(week, selectedWd);
  return [
    ...fallbackLines,
    renderDaySwitcher(selectedWd, todayWd, cols),
    ...renderDayTimeline(
      dayMeetings,
      tt.periods,
      now,
      selectedWd === todayWd,
      cursor?.period,
      cols,
    ).split('\n'),
  ];
}

function renderHubBody(
  state: ScheduleViewState,
  now: Date,
  bodyRows: number,
  cols: number,
): string[] {
  const tt = state.timetable;
  const pre = hubPreGridLines(state, now, cols);
  const shortcuts = tt ? hubShortcuts(tt) : [];
  const rows = Math.max(0, Math.floor(bodyRows));

  const build = (shortcutLines: string[]): { content: string[]; tail: string[] } => {
    const tail: string[] = [];
    if (pre && (state.statusMessage || shortcutLines.length > 0)) tail.push('');
    if (state.statusMessage) {
      tail.push(...hintLines(state.statusMessage, cols));
      if (shortcutLines.length > 0) tail.push('');
    }
    tail.push(...shortcutLines);
    const content = pre
      ? renderAdaptiveWeekGrid(
          pre.inlineLines,
          pre.fallbackLines,
          pre.tt,
          pre.week,
          createTimetableSchedule(pre.tt).weekdayAt(now),
          now,
          rows,
          cols,
          state.gridCursor,
          tail.length,
        )
      : [];
    return { content, tail };
  };

  const full = build(renderShortcutLines(shortcuts, cols));
  if (full.content.length + full.tail.length <= rows) return [...full.content, ...full.tail];

  const compact = build(renderShortcutLines(shortcuts, cols, true));
  if (compact.tail.length >= rows) return rows > 0 ? compact.tail.slice(-rows) : [];
  return [...compact.content.slice(0, rows - compact.tail.length), ...compact.tail];
}

const TERM_PROGRESS_WIDTH = 20;

function renderTermProgressBar(w: AcademicWindow, cols: number): string[] | null {
  if (!w.nextBreakStart) return null;
  const totalWeeks = Math.max(
    1,
    Math.round(
      localDayDifference(parseLocalMonday(w.weekOneMonday), parseLocalDate(w.nextBreakStart)) / 7,
    ),
  );
  const currentWeek = w.currentWeek;
  const labelText = fmt(t().timetable.weekLabel2, { week: `${currentWeek}/${totalWeeks}` });
  const label = type.hint(labelText);
  const width = Number.isFinite(cols) ? Math.max(1, Math.floor(cols)) : Number.POSITIVE_INFINITY;
  const indent = visualWidth(space.indent) < width ? space.indent : '';
  const contentWidth = Math.max(1, width - visualWidth(indent));
  const inlineBarWidth = Math.min(TERM_PROGRESS_WIDTH, contentWidth - visualWidth(label) - 2);
  const barWidth =
    inlineBarWidth >= 1 ? inlineBarWidth : Math.min(TERM_PROGRESS_WIDTH, contentWidth);
  const filledCols = Math.max(
    0,
    Math.min(barWidth, Math.round((currentWeek / totalWeeks) * barWidth)),
  );
  const filledChar = glyph.barFilled();
  const emptyChar = glyph.barEmpty();
  const bar = type.body(filledChar.repeat(filledCols) + emptyChar.repeat(barWidth - filledCols));
  return inlineBarWidth >= 1
    ? [`${indent}${bar}  ${label}`]
    : [`${indent}${bar}`, ...hintLines(labelText, cols)];
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, localDayDifference(a, b));
}

function renderPublicBody(
  state: ScheduleViewState,
  now: Date,
  bodyRows: number,
  cols: number,
): string[] {
  const trans = t();
  const lines: string[] = [];
  const w = state.publicWindow;

  if (w === undefined) {
    lines.push(...loadingLines(trans.common.loading, cols));
  } else if (w === null) {
    lines.push(...hintLines(trans.timetable.publicUnavailable, cols));
  } else if (w.status === 'onBreak') {
    lines.push(
      ...headingLines(
        fmt(trans.timetable.onBreak, { title: sanitizeTerminalLine(w.breakTitle) }),
        cols,
      ),
    );
  } else {
    const semesterLabel =
      w.semester === '1' ? trans.timetable.semester1 : trans.timetable.semester2;
    lines.push(
      ...headingLines(
        `${fmt(trans.timetable.academicYearSuffix, { year: sanitizeTerminalLine(w.academicYear) })} · ${semesterLabel} · ${fmt(trans.timetable.weekLabel2, { week: String(w.currentWeek) })}`,
        cols,
      ),
    );
    const bar = renderTermProgressBar(w, cols);
    if (bar) lines.push(...bar);
    if (w.nextBreakStart && w.nextBreakTitle) {
      lines.push(
        ...hintLines(
          fmt(trans.timetable.daysUntilBreak, {
            title: sanitizeTerminalLine(w.nextBreakTitle),
            days: String(daysBetween(now, parseLocalDate(w.nextBreakStart))),
          }),
          cols,
        ),
      );
    }
  }
  lines.push('');
  lines.push(...hintLines(trans.timetable.publicLoginHint, cols), '');
  return state.publicField
    ? renderListFieldWithContext(lines, state.publicField, bodyRows, cols)
    : lines;
}

export function renderSchedule(
  state: ScheduleViewState,
  now: Date,
  bodyRows = 100,
  cols = 80,
): string[] {
  const trans = t();
  switch (state.mode) {
    case 'loading':
      return loadingLines(trans.common.loading, cols);
    case 'public':
      return renderPublicBody(state, now, bodyRows, cols);
    case 'needsLoginId':
      return [
        ...(state.errorMessage ? [...hintLines(state.errorMessage, cols), ''] : []),
        ...(state.idField?.render(cols) ?? []),
      ];
    case 'needsLoginPassword':
      return state.passwordField?.render(cols) ?? [];
    case 'authenticating':
      return loadingLines(state.statusMessage ?? trans.common.loading, cols);
    case 'needsWeekOne':
      return [
        ...(state.errorMessage ? [...hintLines(state.errorMessage, cols), ''] : []),
        ...(state.weekOneField?.render(cols) ?? []),
      ];
    case 'hub':
      return renderHubBody(state, now, bodyRows, cols);
    case 'week': {
      if (!state.timetable || !state.weekOne) return [hint(trans.timetable.genericError)];
      const schedule = createTimetableSchedule(state.timetable, {
        weekOneMonday: state.weekOne,
      });
      const week = Math.max(1, schedule.weekAt(now));
      const weekLines = [heading(trans.timetable.hubWeek), ''];
      return renderAdaptiveWeekGrid(
        weekLines,
        weekLines,
        state.timetable,
        week,
        schedule.weekdayAt(now),
        now,
        bodyRows,
        cols,
        state.gridCursor,
        2,
      );
    }
    case 'termDensity':
      if (!state.timetable || !state.weekOne) return [hint(trans.timetable.genericError)];
      return renderTermDensity(
        state.timetable.meetings,
        state.weekOne,
        createTimetableSchedule(state.timetable, { weekOneMonday: state.weekOne }).weekAt(now),
        cols,
      ).split('\n');
    case 'termPicker':
      return state.termField?.render(bodyRows, cols) ?? [];
    case 'unresolved':
      return [
        heading(trans.timetable.unresolvedTitle),
        '',
        ...renderUnresolvedItems(state.timetable?.unresolvedItems ?? [], cols).split('\n'),
      ];
    case 'meetingDetail':
      return state.detailMeeting && state.timetable
        ? renderMeetingDetail(state.detailMeeting, state.timetable.periods, cols).split('\n')
        : [hint(trans.timetable.genericError)];
    case 'error':
      return hintLines(state.errorMessage ?? trans.timetable.genericError, cols);
    default:
      return [];
  }
}
