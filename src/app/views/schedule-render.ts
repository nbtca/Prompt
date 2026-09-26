import {
  campusIsoDate,
  createTimetableSchedule,
  type AcademicTerm,
  type Timetable,
  type TimetableMeeting,
  type Weekday,
} from '@nbtca/nbtcal/timetable';
import { c, type, space, glyph, MAX_FRAME_COLS } from '../../core/theme.js';
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
  renderWeekAgenda,
  weekGridFullWidth,
  lineBudget,
} from '../../features/schedule-render.js';
import type { AcademicWindow, OnBreak } from '@nbtca/nbtcal';
import type { GridCursor } from './schedule-grid-cursor.js';
import {
  sanitizeTerminalLine,
  truncate,
  truncateStart,
  visualWidth,
  wrapAnsiWithIndent,
} from '../../core/text.js';
import { isoDayDifference } from '../../core/calendar-day.js';
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
  exportedPath?: string;
  idField?: TextField;
  passwordField?: TextField;
  weekOneField?: TextField;
  termField?: ListField;
  termPickerNote?: string;
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
  const available = Math.max(1, lineBudget(cols) - visualWidth(space.indent));
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
          days: String(daysUntil(now, state.weekOne)),
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
    '',
    weekHeading,
  ];
  return { inlineLines, fallbackLines: [...lines, weekHeading], week, tt };
}

function fittingWeekGrid(
  tt: Timetable,
  week: number,
  now: Date,
  rows: number,
  cols: number,
  cursor: GridCursor | undefined,
): string[] | null {
  if (cols < Math.min(MAX_FRAME_COLS, weekGridFullWidth(tt, week, now))) return null;
  const grid = renderWeekGrid(tt, week, now, cols, cursor).split('\n');
  return grid.length <= rows ? grid : null;
}

function renderDayFallback(
  tt: Timetable,
  week: number,
  todayWd: Weekday,
  now: Date,
  cols: number,
  cursor: GridCursor | undefined,
): string[] {
  const selectedWd = cursor?.weekday ?? todayWd;
  return [
    renderDaySwitcher(selectedWd, todayWd, cols),
    ...renderDayTimeline(
      createTimetableSchedule(tt).meetingsOnDay(week, selectedWd),
      tt.periods,
      now,
      { weekday: selectedWd, isToday: selectedWd === todayWd },
      cursor?.period,
      cols,
    ).split('\n'),
  ];
}

interface HubWeek {
  lines: string[];
  grid: boolean;
}

function renderHubWeek(
  inlineLines: string[],
  fallbackLines: string[],
  tt: Timetable,
  week: number,
  todayWd: Weekday,
  now: Date,
  rows: number,
  cols: number,
  cursor: GridCursor | undefined,
): HubWeek {
  const layouts: [string[] | null, boolean][] = [
    [fittingWeekGrid(tt, week, now, rows, cols, cursor), true],
    [renderWeekAgenda(tt, week, now, cols, cursor), false],
  ];
  for (const [layout, grid] of layouts) {
    if (!layout) continue;
    for (const head of [inlineLines, inlineLines.filter((line) => line !== ''), fallbackLines]) {
      if (head.length + layout.length <= rows) return { lines: [...head, ...layout], grid };
    }
  }
  return {
    lines: [...fallbackLines, ...renderDayFallback(tt, week, todayWd, now, cols, cursor)],
    grid: false,
  };
}

function renderWeekBody(
  tt: Timetable,
  week: number,
  todayWd: Weekday,
  now: Date,
  bodyRows: number,
  cols: number,
  cursor: GridCursor | undefined,
): string[] {
  const rows = Math.max(0, Math.floor(bodyRows));
  const title = heading(t().timetable.hubWeek);
  const layouts = [
    fittingWeekGrid(tt, week, now, rows - 2, cols, cursor),
    renderWeekAgenda(tt, week, now, cols, cursor),
    renderWeekAgenda(tt, week, now, cols, cursor, true),
  ];
  for (const layout of layouts) {
    if (!layout) continue;
    if (layout.length + 2 <= rows) return [title, '', ...layout];
    if (layout.length + 1 <= rows) return [title, ...layout];
  }
  const dense = layouts.at(-1);
  if (dense && dense.length <= rows) return dense;
  return [
    ...hintLines(t().timetable.weekTooSmall, cols),
    ...renderDayFallback(tt, week, todayWd, now, cols, cursor),
  ];
}

const MIN_HUB_CONTENT_ROWS = 4;
const MIN_PATH_COLS = 12;

function middleClip(text: string, width: number): string {
  if (visualWidth(text) <= width) return text;
  const mark = pickIcon('…', '...');
  const room = width - visualWidth(mark);
  const tail = Math.ceil((room * 2) / 3);
  return `${truncate(text, room - tail, '')}${mark}${truncateStart(text, tail, '')}`;
}

function hubStatusLines(state: ScheduleViewState, cols: number): string[] {
  if (state.exportedPath !== undefined) {
    const template = t().timetable.exportSaved;
    const path = sanitizeTerminalLine(state.exportedPath);
    const room = lineBudget(cols) - visualWidth(space.indent + fmt(template, { path: '' }));
    return room < MIN_PATH_COLS
      ? hintLines(fmt(template, { path }), cols)
      : [hint(fmt(template, { path: middleClip(path, room) }))];
  }
  return state.statusMessage ? hintLines(state.statusMessage, cols) : [];
}

function layoutHub(
  state: ScheduleViewState,
  now: Date,
  bodyRows: number,
  cols: number,
  shortcuts: readonly HubShortcut[],
): HubWeek {
  const pre = hubPreGridLines(state, now, cols);
  const status = hubStatusLines(state, cols);
  const rows = Math.max(0, Math.floor(bodyRows));

  const build = (shortcutLines: string[], gap = true): HubWeek & { tail: string[] } => {
    const tail: string[] = [];
    if (gap && pre && (status.length > 0 || shortcutLines.length > 0)) tail.push('');
    if (status.length > 0) {
      tail.push(...status);
      if (shortcutLines.length > 0) tail.push('');
    }
    tail.push(...shortcutLines);
    const week = pre
      ? renderHubWeek(
          pre.inlineLines,
          pre.fallbackLines,
          pre.tt,
          pre.week,
          createTimetableSchedule(pre.tt).weekdayAt(now),
          now,
          rows - tail.length,
          cols,
          state.gridCursor,
        )
      : { lines: [], grid: false };
    return { ...week, tail };
  };

  const labelled = renderShortcutLines(shortcuts, cols);
  const full = build(labelled);
  if (full.lines.length + full.tail.length <= rows) {
    return { lines: [...full.lines, ...full.tail], grid: full.grid };
  }
  const tight = build(labelled, false);
  if (rows - tight.tail.length >= MIN_HUB_CONTENT_ROWS) {
    const content = tight.lines.filter((line) => line !== '');
    return {
      lines: [...content.slice(0, rows - tight.tail.length), ...tight.tail],
      grid: tight.grid,
    };
  }

  const compact = build(renderShortcutLines(shortcuts, cols, true));
  if (compact.tail.length >= rows) {
    return { lines: rows > 0 ? compact.tail.slice(-rows) : [], grid: false };
  }
  return {
    lines: [...compact.lines.slice(0, rows - compact.tail.length), ...compact.tail],
    grid: compact.grid,
  };
}

function renderHubBody(
  state: ScheduleViewState,
  now: Date,
  bodyRows: number,
  cols: number,
): string[] {
  const shortcuts = state.timetable ? hubShortcuts(state.timetable) : [];
  const withGrid = layoutHub(
    state,
    now,
    bodyRows,
    cols,
    shortcuts.filter((shortcut) => shortcut.key !== 'w'),
  );
  return withGrid.grid ? withGrid.lines : layoutHub(state, now, bodyRows, cols, shortcuts).lines;
}

const TERM_PROGRESS_WIDTH = 20;

function renderTermProgressBar(w: AcademicWindow, cols: number): string[] | null {
  if (!w.nextBreakStart) return null;
  const totalWeeks = Math.max(
    1,
    Math.round(isoDayDifference(w.weekOneMonday, w.nextBreakStart) / 7),
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

function daysUntil(now: Date, date: string): number {
  return Math.max(0, isoDayDifference(campusIsoDate(now), date));
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
            days: String(daysUntil(now, w.nextBreakStart)),
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
      return renderWeekBody(
        state.timetable,
        Math.max(1, schedule.weekAt(now)),
        schedule.weekdayAt(now),
        now,
        bodyRows,
        cols,
        state.gridCursor,
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
    case 'termPicker': {
      if (!state.termField) return [];
      const note = state.termPickerNote
        ? [
            ...headingLines(trans.timetable.hubSwitchTerm, cols),
            '',
            ...hintLines(state.termPickerNote, cols),
            '',
          ]
        : [];
      return renderListFieldWithContext(note, state.termField, bodyRows, cols);
    }
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
