import type { AcademicTerm, Timetable } from '@nbtca/nbtcal/timetable';
import { type, space, glyph } from '../../core/theme.js';
import { t, fmt } from '../../i18n/index.js';
import { ListField, computeMaxVisible } from '../fields/list-field.js';
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

function renderHubBody(state: ScheduleViewState, now: Date, bodyRows: number): string[] {
  const trans = t();
  const lines: string[] = [];
  const tt = state.timetable;
  if (tt && state.weekOne) {
    const week = currentWeekNumber(state.weekOne, now);
    const banner = renderNextClassBanner(nextMeeting(tt.meetings, tt.periods, state.weekOne, now), now);
    lines.push(banner || hint(trans.timetable.noNextClass));
    lines.push('');
    if (week < 1) {
      // weekOne can be a *future* date — auto-inferred while on break, it
      // deliberately points at the upcoming term (see academic-calendar.ts)
      // so it's ready the moment classes start. Until then there is no
      // "today"/"this week" to show; rendering the timeline/strip anyway
      // produced a nonsensical negative week number and an empty-but-
      // present class grid, which read as "there are classes right now."
      lines.push(heading(trans.timetable.termNotStarted));
      lines.push(hint(fmt(trans.timetable.termStartsIn, {
        date: state.weekOne,
        days: String(daysBetween(now, new Date(`${state.weekOne}T00:00:00`))),
      })));
      lines.push('');
    } else {
      const todayWd = campusWeekday(now);
      const today = meetingsOnDay(tt.meetings, todayWd, week);
      // Deliberately no blank line between each heading and its own content
      // below (today-heading -> timeline, week-heading -> strip) — tighter
      // grouping saves real rows against bodyRows on short terminals, where
      // this section's height is otherwise dynamic (0..N+1 timeline rows).
      lines.push(heading(fmt(trans.timetable.todayHeading, { weekday: weekdayShortLabel(todayWd), week: String(week) })));
      lines.push(...renderTodayTimeline(today, tt.periods, now).split('\n'));
      lines.push(heading(trans.timetable.hubWeek));

      // The full weekday x period grid's height depends on how many
      // periods the school's own period table defines (a real campus can
      // define up to 12) — unlike the heatmap's fixed 11 lines, this can't
      // be a single hardcoded threshold. Measure it for real: render it,
      // and use it only if it (plus a floor reserved for the menu) still
      // fits, otherwise fall back to the fixed-height compact strip.
      const gridLines = renderWeekGrid(tt.meetings, tt.periods, week, now).split('\n');
      // Derived from the field's *real* option count rather than a guessed
      // constant shared with Events' differently-sized hub menu: title +
      // blank + options + blank + footer (this hub field, unlike Events',
      // does render one — see buildHubField in schedule.ts).
      const roomForMenu = 4 + (state.hubField?.optionCount ?? 0);
      if (lines.length + gridLines.length <= bodyRows - roomForMenu) {
        lines.push(...gridLines);
      } else {
        lines.push(...renderWeekStrip(tt.meetings, week, todayWd).split('\n'));
      }
      lines.push('');
    }
  }
  if (state.statusMessage) {
    lines.push(hint(state.statusMessage));
    lines.push('');
  }
  if (state.hubField) {
    // The timeline/week-strip above are dynamic height (0..N+1 rows
    // depending on today's class count) and precede the menu in the same
    // body — computeMaxVisible's flat "bodyRows - 4" assumption only holds
    // for a field that owns nearly the whole body. Reserve what this
    // render actually already used before windowing the menu itself, or a
    // tall today (or a short terminal) silently truncates the bottom rows
    // (the unresolved-items warning, log out) with no scroll indicator.
    state.hubField.setMaxVisible(computeMaxVisible(bodyRows - lines.length));
    lines.push(...state.hubField.render());
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
    // Heading + bar + countdown are one cohesive info cluster — no blank
    // lines within it — followed by a single trailing blank, matching the
    // app's dominant "content, then blank" rhythm (Home/Events push a
    // block's content, then '', never the reverse).
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
    // Same reserved-floor idea used for Events' recent-activity briefing:
    // the login hint + the (small, fixed) public menu below must never be
    // the ones that silently lose the remaining-space budget.
    const floorForRest = 5; // loginHint + blank + field title + blank + 1 option
    const remaining = Math.max(1, bodyRows - lines.length - 1 - floorForRest);
    for (const e of state.publicUpcoming.slice(0, remaining)) lines.push(renderEventBrief(e, now));
    lines.push('');
  }

  lines.push(hint(trans.timetable.publicLoginHint));
  lines.push('');
  if (state.publicField) lines.push(...state.publicField.render());
  return lines;
}

export function renderSchedule(state: ScheduleViewState, now: Date, bodyRows = 100): string[] {
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
      return renderHubBody(state, now, bodyRows);
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
