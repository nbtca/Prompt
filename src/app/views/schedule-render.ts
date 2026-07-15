import type { AcademicTerm, Timetable } from '@nbtca/nbtcal/timetable';
import { type, space } from '../../core/theme.js';
import { t } from '../../i18n/index.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { currentWeekNumber, campusWeekday, meetingsOnDay, nextMeeting } from '../../features/schedule-query.js';
import { renderNextClassBanner, renderTodayClasses, renderWeekGrid, renderUnresolvedItems } from '../../features/schedule-render.js';

export type ScheduleMode =
  | 'loading'
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
    const today = meetingsOnDay(tt.meetings, campusWeekday(now), week);
    const banner = renderNextClassBanner(nextMeeting(tt.meetings, tt.periods, state.weekOne, now), now);
    lines.push(banner || hint(trans.timetable.noNextClass));
    lines.push('');
    lines.push(heading(trans.timetable.hubToday));
    lines.push(...renderTodayClasses(today, tt.periods, now).split('\n'));
    lines.push('');
  }
  if (state.statusMessage) {
    lines.push(hint(state.statusMessage));
    lines.push('');
  }
  if (state.hubField) lines.push(...state.hubField.render());
  return lines;
}

export function renderSchedule(state: ScheduleViewState, now: Date): string[] {
  const trans = t();
  switch (state.mode) {
    case 'loading':
      return [hint(trans.common.loading)];
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
