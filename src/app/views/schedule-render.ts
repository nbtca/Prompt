import type { AcademicTerm, Timetable, TimetableMeeting } from '@nbtca/nbtcal/timetable';
import { c, type, space, glyph } from '../../core/theme.js';
import { pickIcon } from '../../core/icons.js';
import { t, fmt } from '../../i18n/index.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { currentWeekNumber, campusWeekday, meetingsOnDay, nextMeeting } from '../../features/schedule-query.js';
import {
  renderNextClassBanner, renderWeekGrid, renderUnresolvedItems, renderTodayTimeline, renderWeekStrip,
  weekdayShortLabel, renderTermDensity, renderMeetingDetail,
} from '../../features/schedule-render.js';
import type { AcademicWindow, OnBreak } from '../../features/academic-calendar.js';
import { renderEventBrief, type Event } from '../../features/calendar.js';
import type { GridCursor } from './schedule-grid-cursor.js';

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
  publicUpcoming?: Event[];
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

export interface HubShortcut {
  key: string;
  label: string;
  /** False only for the unresolved-count badge -- its own "⚠ N" is the
   * visible cue, so it renders as "[label]" instead of "[key] label" even
   * though `key` is still the character that triggers it. */
  showKey?: boolean;
  warn?: boolean;
}

/** The hub's single-line shortcut bar, as data -- both renderShortcutBar
 * (below) and schedule.ts's key-handling switch consume this same array, so
 * the letters shown to the student and the letters that actually do
 * something can never drift apart. */
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

function renderShortcutBar(shortcuts: readonly HubShortcut[]): string {
  const parts = shortcuts.map((sc) => {
    const bracket = sc.showKey === false ? `[${sc.label}]` : `[${sc.key}] ${sc.label}`;
    return sc.warn ? c.warn(bracket) : type.hint(bracket);
  });
  return `${space.indent}${parts.join('  ')}`;
}

/** Renders the full weekday x period grid if it (plus a floor reserved for
 * the shortcut bar) fits within bodyRows, otherwise the fixed-height compact
 * strip. Shared by the "this week" and "term hasn't started yet, preview
 * week 1" branches of renderHubBody -- the same measure-and-fallback
 * decision, just against a different week number. */
function pushAdaptiveWeekGrid(
  lines: string[], tt: Timetable, week: number, todayWd: number, now: Date, bodyRows: number, cols: number,
  cursor: GridCursor | undefined,
): void {
  const gridLines = renderWeekGrid(tt.meetings, tt.periods, week, now, cols, cursor).split('\n');
  // The hub's own menu is now a fixed one-line shortcut bar (blank + the bar
  // itself), not a variable-height ListField -- no more "menu option count"
  // to reserve room for.
  const roomForShortcutBar = 2;
  if (lines.length + gridLines.length <= bodyRows - roomForShortcutBar) {
    lines.push(...gridLines);
  } else {
    lines.push(...renderWeekStrip(tt.meetings, week, todayWd).split('\n'));
  }
}

function renderHubBody(state: ScheduleViewState, now: Date, bodyRows: number, cols: number): string[] {
  const trans = t();
  const lines: string[] = [];
  const tt = state.timetable;
  if (tt && state.weekOne) {
    const week = currentWeekNumber(state.weekOne, now);
    const banner = renderNextClassBanner(nextMeeting(tt.meetings, tt.periods, state.weekOne, now), now);
    lines.push(banner || hint(trans.timetable.noNextClass));
    lines.push('');
    const todayWd = campusWeekday(now);
    if (week < 1) {
      // weekOne can be a *future* date -- auto-inferred while on break, it
      // deliberately points at the upcoming term (see academic-calendar.ts)
      // so it's ready the moment classes start. There is no "today" to show
      // yet, but the timetable's real week-1 data is already fetched -- show
      // it as an explicit preview rather than showing no grid at all
      // regardless of terminal height. The "Week 1 preview" heading keeps it
      // unambiguous that this isn't "happening right now".
      lines.push(heading(trans.timetable.termNotStarted));
      lines.push(hint(fmt(trans.timetable.termStartsIn, {
        date: state.weekOne,
        days: String(daysBetween(now, new Date(`${state.weekOne}T00:00:00`))),
      })));
      lines.push('');
      lines.push(heading(trans.timetable.termPreviewWeek));
      pushAdaptiveWeekGrid(lines, tt, 1, todayWd, now, bodyRows, cols, state.gridCursor);
      lines.push('');
    } else {
      const today = meetingsOnDay(tt.meetings, todayWd, week);
      lines.push(heading(fmt(trans.timetable.todayHeading, { weekday: weekdayShortLabel(todayWd), week: String(week) })));
      lines.push(...renderTodayTimeline(today, tt.periods, now).split('\n'));
      lines.push(heading(trans.timetable.hubWeek));
      pushAdaptiveWeekGrid(lines, tt, week, todayWd, now, bodyRows, cols, state.gridCursor);
      lines.push('');
    }
  }
  if (state.statusMessage) {
    lines.push(hint(state.statusMessage));
    lines.push('');
  }
  if (tt) {
    lines.push(renderShortcutBar(hubShortcuts(tt)));
  }
  return lines;
}

const TERM_PROGRESS_WIDTH = 20;

function renderTermProgressBar(w: AcademicWindow, now: Date): string | null {
  if (!w.nextBreakStart) return null;
  const weekOneMs = new Date(`${w.weekOneMonday}T00:00:00`).getTime();
  const nextBreakMs = new Date(`${w.nextBreakStart}T00:00:00`).getTime();
  const totalWeeks = Math.max(1, Math.round((nextBreakMs - weekOneMs) / (7 * 86400000)));
  const currentWeek = currentWeekNumber(w.weekOneMonday, now);
  const filledCols = Math.max(0, Math.min(
    TERM_PROGRESS_WIDTH, Math.round((currentWeek / totalWeeks) * TERM_PROGRESS_WIDTH),
  ));
  const filledChar = glyph.barFilled();
  const emptyChar = glyph.barEmpty();
  const bar = filledChar.repeat(filledCols) + emptyChar.repeat(TERM_PROGRESS_WIDTH - filledCols);
  return `${space.indent}${type.body(bar)}  ${type.hint(`${currentWeek}/${totalWeeks}${t().timetable.weekLabel2.replace('{week}', '').trim()}`)}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / 86400000));
}

function renderPublicBody(state: ScheduleViewState, now: Date, bodyRows: number): string[] {
  const trans = t();
  const lines: string[] = [];
  const w = state.publicWindow;

  if (w === undefined) {
    lines.push(hint(trans.common.loading));
  } else if (w === null) {
    lines.push(hint(trans.timetable.publicUnavailable));
  } else if (w.status === 'onBreak') {
    lines.push(heading(fmt(trans.timetable.onBreak, { title: w.breakTitle })));
  } else {
    const semesterLabel = w.semester === '1' ? trans.timetable.semester1 : trans.timetable.semester2;
    lines.push(heading(
      `${fmt(trans.timetable.academicYearSuffix, { year: w.academicYear })} · ${semesterLabel} · ${fmt(trans.timetable.weekLabel2, { week: String(w.currentWeek) })}`,
    ));
    const bar = renderTermProgressBar(w, now);
    if (bar) lines.push(bar);
    if (w.nextBreakStart && w.nextBreakTitle) {
      lines.push(hint(fmt(trans.timetable.daysUntilBreak, {
        title: w.nextBreakTitle,
        days: String(daysBetween(now, new Date(`${w.nextBreakStart}T00:00:00`))),
      })));
    }
  }
  lines.push('');

  if (state.publicUpcoming && state.publicUpcoming.length > 0) {
    lines.push(heading(trans.calendar.recentActivity));
    const floorForRest = 5;
    const remaining = Math.max(1, bodyRows - lines.length - 1 - floorForRest);
    for (const e of state.publicUpcoming.slice(0, remaining)) lines.push(renderEventBrief(e, now));
    lines.push('');
  }

  lines.push(hint(trans.timetable.publicLoginHint));
  lines.push('');
  if (state.publicField) lines.push(...state.publicField.render());
  return lines;
}

export function renderSchedule(state: ScheduleViewState, now: Date, bodyRows = 100, cols = 80): string[] {
  const trans = t();
  switch (state.mode) {
    case 'loading':
      return [hint(trans.common.loading)];
    case 'public':
      return renderPublicBody(state, now, bodyRows);
    case 'needsLoginId':
      return [
        ...(state.errorMessage ? [hint(state.errorMessage), ''] : []),
        ...(state.idField?.render() ?? []),
      ];
    case 'needsLoginPassword':
      return state.passwordField?.render() ?? [];
    case 'authenticating':
      return [hint(state.statusMessage ?? trans.common.loading)];
    case 'needsWeekOne':
      return [
        ...(state.errorMessage ? [hint(state.errorMessage), ''] : []),
        ...(state.weekOneField?.render() ?? []),
      ];
    case 'hub':
      return renderHubBody(state, now, bodyRows, cols);
    case 'week':
      return state.timetable && state.weekOne
        ? [
          heading(trans.timetable.hubWeek),
          '',
          ...renderWeekGrid(
            state.timetable.meetings, state.timetable.periods, currentWeekNumber(state.weekOne, now), now, cols, state.gridCursor,
          ).split('\n'),
        ]
        : [hint(trans.timetable.genericError)];
    case 'termDensity':
      return state.timetable && state.weekOne
        ? renderTermDensity(state.timetable.meetings, state.weekOne, currentWeekNumber(state.weekOne, now)).split('\n')
        : [hint(trans.timetable.genericError)];
    case 'termPicker':
      return state.termField?.render() ?? [];
    case 'unresolved':
      return [
        heading(trans.timetable.unresolvedTitle),
        '',
        ...renderUnresolvedItems(state.timetable?.unresolvedItems ?? []).split('\n'),
      ];
    case 'meetingDetail':
      return state.detailMeeting && state.timetable
        ? renderMeetingDetail(state.detailMeeting, state.timetable.periods).split('\n')
        : [hint(trans.timetable.genericError)];
    case 'error':
      return [hint(state.errorMessage ?? trans.timetable.genericError)];
    default:
      return [];
  }
}
