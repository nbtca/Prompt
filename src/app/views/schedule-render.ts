import type { AcademicTerm, Timetable } from '@nbtca/nbtcal/timetable';
import { type, space } from '../../core/theme.js';
import { t, fmt } from '../../i18n/index.js';
import { pickIcon } from '../../core/icons.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { currentWeekNumber, campusWeekday, meetingsOnDay, nextMeeting } from '../../features/schedule-query.js';
import {
  renderNextClassBanner, renderWeekGrid, renderUnresolvedItems, renderTodayTimeline, renderWeekStrip,
  weekdayShortLabel,
} from '../../features/schedule-render.js';
import type { AcademicWindow, OnBreak } from '../../features/academic-calendar.js';
import { renderEventBrief, type Event } from '../../features/calendar.js';

export type ScheduleMode =
  | 'loading'
  | 'public'
  | 'needsLoginId'
  | 'needsLoginPassword'
  | 'authenticating'
  | 'needsWeekOne'
  | 'hub'
  | 'week'
  | 'termPicker'
  | 'unresolved'
  | 'error';

export interface ScheduleViewState {
  mode: ScheduleMode;
  errorMessage?: string;
  statusMessage?: string;
  idField?: TextField;
  passwordField?: TextField;
  weekOneField?: TextField;
  hubField?: ListField;
  termField?: ListField;
  key?: string;
  term?: AcademicTerm;
  weekOne?: string;
  timetable?: Timetable;
  publicField?: ListField;
  publicWindow?: AcademicWindow | OnBreak | null;
  publicUpcoming?: Event[];
}

function heading(label: string): string {
  return `${space.indent}${type.heading(label)}`;
}

function hint(label: string): string {
  return `${space.indent}${type.hint(label)}`;
}

function renderHubBody(state: ScheduleViewState, now: Date): string[] {
  const trans = t();
  const lines: string[] = [];
  const tt = state.timetable;
  if (tt && state.weekOne) {
    const week = currentWeekNumber(state.weekOne, now);
    const todayWd = campusWeekday(now);
    const today = meetingsOnDay(tt.meetings, todayWd, week);
    const banner = renderNextClassBanner(nextMeeting(tt.meetings, tt.periods, state.weekOne, now), now);
    lines.push(banner || hint(trans.timetable.noNextClass));
    lines.push('');
    lines.push(heading(fmt(trans.timetable.todayHeading, { weekday: weekdayShortLabel(todayWd), week: String(week) })));
    lines.push('');
    lines.push(...renderTodayTimeline(today, tt.periods, now).split('\n'));
    lines.push('');
    lines.push(heading(trans.timetable.hubWeek));
    lines.push(...renderWeekStrip(tt.meetings, week, todayWd).split('\n'));
    lines.push('');
  }
  if (state.statusMessage) {
    lines.push(hint(state.statusMessage));
    lines.push('');
  }
  if (state.hubField) lines.push(...state.hubField.render());
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
  const filledChar = pickIcon('█', '#');
  const emptyChar = pickIcon('░', '-');
  const bar = filledChar.repeat(filledCols) + emptyChar.repeat(TERM_PROGRESS_WIDTH - filledCols);
  return `${space.indent}${type.body(bar)}  ${type.hint(`${currentWeek}/${totalWeeks}${t().timetable.weekLabel2.replace('{week}', '').trim()}`)}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / 86400000));
}

function renderPublicBody(state: ScheduleViewState, now: Date): string[] {
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
    if (bar) { lines.push(''); lines.push(bar); }
    if (w.nextBreakStart && w.nextBreakTitle) {
      lines.push('');
      lines.push(hint(fmt(trans.timetable.daysUntilBreak, {
        title: w.nextBreakTitle,
        days: String(daysBetween(now, new Date(`${w.nextBreakStart}T00:00:00`))),
      })));
    }
  }
  lines.push('');

  if (state.publicUpcoming && state.publicUpcoming.length > 0) {
    lines.push(heading(trans.calendar.recentActivity));
    for (const e of state.publicUpcoming) lines.push(renderEventBrief(e, now));
    lines.push('');
  }

  lines.push(hint(trans.timetable.publicLoginHint));
  lines.push('');
  if (state.publicField) lines.push(...state.publicField.render());
  return lines;
}

export function renderSchedule(state: ScheduleViewState, now: Date): string[] {
  const trans = t();
  switch (state.mode) {
    case 'loading':
      return [hint(trans.common.loading)];
    case 'public':
      return renderPublicBody(state, now);
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
      return renderHubBody(state, now);
    case 'week':
      return state.timetable && state.weekOne
        ? [
          heading(trans.timetable.hubWeek),
          '',
          ...renderWeekGrid(state.timetable.meetings, state.timetable.periods, currentWeekNumber(state.weekOne, now), now).split('\n'),
        ]
        : [hint(trans.timetable.genericError)];
    case 'termPicker':
      return state.termField?.render() ?? [];
    case 'unresolved':
      return [
        heading(trans.timetable.unresolvedTitle),
        '',
        ...renderUnresolvedItems(state.timetable?.unresolvedItems ?? []).split('\n'),
      ];
    case 'error':
      return [hint(state.errorMessage ?? trans.timetable.genericError)];
    default:
      return [];
  }
}
