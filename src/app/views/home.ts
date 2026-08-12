import { c, type, space, glyph } from '../../core/theme.js';
import { t } from '../../i18n/index.js';
import { pickIcon } from '../../core/icons.js';
import { padEndV, visualWidth, wrapAnsiWithIndent } from '../../core/text.js';
import {
  peekNextClassLine,
  peekTodayLines,
  peekWeekAheadInfo,
  peekUnresolvedCount,
} from '../../features/schedule-view.js';
import { loadCalendarOrThrow, toDisplayEvent, renderEventBrief } from '../../features/calendar.js';
import { weekdayShortLabel } from '../../features/schedule-render.js';
import { addLocalDays } from '../../core/calendar-day.js';
import type { View, AppContext } from '../view.js';
import { passiveFooterHint } from '../chrome.js';
import { campusWeekday } from '@nbtca/nbtcal/timetable';
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export interface HomeData {
  loading?: boolean;
  nextClassLine?: string;
  todayLines?: string[];
  eventLines?: string[];
  eventsLoadFailed?: boolean;
  weekAhead?: { classDays: boolean[]; eventDays?: boolean[] };
  unresolvedCount?: number;
}

function wrappedIndentedLines(
  label: string,
  cols: number,
  style: (value: string) => string,
): string[] {
  return wrapAnsiWithIndent(style(label), cols, space.indent);
}

function panelHeading(label: string, cols: number): string[] {
  return wrappedIndentedLines(label, cols, type.heading);
}

function loadingLines(cols: number): string[] {
  return wrappedIndentedLines(t().common.loading, cols, type.hint);
}

function wrappedRenderedLines(line: string, cols: number): string[] {
  const content = line.startsWith(space.indent) ? line.slice(space.indent.length) : line;
  return wrappedIndentedLines(content, cols, (value) => value);
}

const DAY_PROGRESS_WIDTH = 20;

function renderDayProgress(now: Date, cols: number): string {
  const minutesElapsed = now.getHours() * 60 + now.getMinutes();
  const fraction = Math.min(1, Math.max(0, minutesElapsed / 1440));
  const pct = Math.round(fraction * 100);
  const percentage = `${pct}%`;
  const width = Number.isFinite(cols) ? Math.max(1, Math.floor(cols)) : Number.POSITIVE_INFINITY;
  const indent =
    visualWidth(space.indent) + 2 + visualWidth(percentage) + 1 <= width ? space.indent : '';
  const gap =
    visualWidth(indent) + 2 + visualWidth(percentage) + 1 <= width
      ? '  '
      : visualWidth(indent) + 1 + visualWidth(percentage) + 1 <= width
        ? ' '
        : '';
  const barWidth = Math.max(
    0,
    Math.min(
      DAY_PROGRESS_WIDTH,
      width - visualWidth(indent) - visualWidth(gap) - visualWidth(percentage),
    ),
  );
  const filled = Math.round(fraction * barWidth);
  const filledChar = glyph.barFilled();
  const emptyChar = glyph.barEmpty();
  const bar = filledChar.repeat(filled) + emptyChar.repeat(barWidth - filled);
  return `${indent}${type.body(bar)}${gap}${type.hint(percentage)}`;
}

function renderWeekAheadGrid(
  classDays: readonly boolean[],
  eventDays: readonly boolean[] | undefined,
  cols: number,
): string {
  const trans = t();
  const hasClassChar = pickIcon('▓▓', '##');
  const freeChar = pickIcon('░░', '..');
  const weekendChar = pickIcon('··', '..');
  const blankCell = '  ';

  const rowLabelW =
    Math.max(visualWidth(trans.timetable.weekAheadClasses), visualWidth(trans.menu.events)) + 1;

  const days = [1, 2, 3, 4, 5, 6, 7];
  const dayLabels = days.map((wd) => type.hint(weekdayShortLabel(wd))).join('  ');
  const headerLine = `${space.indent}${padEndV('', rowLabelW)}${dayLabels}`;

  const classCells = days
    .map((wd) => {
      const isWeekend = wd === 6 || wd === 7;
      const glyphChar = isWeekend ? weekendChar : classDays[wd - 1] ? hasClassChar : freeChar;
      return type.body(glyphChar);
    })
    .join('  ');
  const classLine = `${space.indent}${type.hint(padEndV(trans.timetable.weekAheadClasses, rowLabelW))}${classCells}`;

  const eventCells = days
    .map((wd) => {
      if (!eventDays) return blankCell;
      return type.body(eventDays[wd - 1] ? hasClassChar : freeChar);
    })
    .join('  ');
  const eventLine = `${space.indent}${type.hint(padEndV(trans.menu.events, rowLabelW))}${eventCells}`;

  const legend = `${space.indent}${type.hint(`${hasClassChar} ${trans.timetable.weekAheadBusy}  ${freeChar} ${trans.timetable.weekAheadFree}  ${weekendChar} ${trans.timetable.weekAheadNone}`)}`;

  const wideLines = [headerLine, classLine, eventLine, legend];
  const width = Number.isFinite(cols) ? Math.max(1, Math.floor(cols)) : Number.POSITIVE_INFINITY;
  if (wideLines.every((line) => visualWidth(line) <= width)) return wideLines.join('\n');

  const compactHeading = wrappedIndentedLines(
    `${trans.timetable.weekAheadClasses} / ${trans.menu.events}`,
    cols,
    type.hint,
  );
  const compactDays = days.flatMap((wd) => {
    const classCell =
      wd === 6 || wd === 7 ? weekendChar : classDays[wd - 1] ? hasClassChar : freeChar;
    const eventCell = eventDays ? (eventDays[wd - 1] ? hasClassChar : freeChar) : blankCell;
    const row = `${type.hint(weekdayShortLabel(wd))}  ${type.body(classCell)}  ${type.body(eventCell)}`;
    return wrappedIndentedLines(row, cols, (value) => value);
  });
  const compactLegend = wrappedIndentedLines(
    `${hasClassChar} ${trans.timetable.weekAheadBusy}  ${freeChar} ${trans.timetable.weekAheadFree}  ${weekendChar} ${trans.timetable.weekAheadNone}`,
    cols,
    type.hint,
  );
  return [...compactHeading, ...compactDays, ...compactLegend].join('\n');
}

export function renderHome(data: HomeData, now: Date, bodyRows = 100, cols = 80): string[] {
  const trans = t();
  const lines: string[] = [];

  const nextClass =
    data.nextClassLine !== undefined && data.nextClassLine.trim().length > 0
      ? wrappedRenderedLines(data.nextClassLine, cols)
      : wrappedIndentedLines(trans.timetable.noNextClass, cols, type.hint);
  lines.push(...panelHeading(trans.timetable.nextClass, cols));
  lines.push(...nextClass);
  lines.push('');

  lines.push(...panelHeading(trans.timetable.hubToday, cols));
  lines.push(renderDayProgress(now, cols));
  if (data.todayLines && data.todayLines.length > 0) {
    for (const line of data.todayLines) lines.push(...wrappedRenderedLines(line, cols));
  } else {
    lines.push(...wrappedIndentedLines(trans.timetable.noClassToday, cols, type.hint));
  }
  lines.push('');

  if (data.weekAhead) {
    lines.push(...panelHeading(trans.timetable.weekOverviewTitle, cols));
    lines.push(
      ...renderWeekAheadGrid(data.weekAhead.classDays, data.weekAhead.eventDays, cols).split('\n'),
    );
    lines.push('');
  }

  if ((data.unresolvedCount ?? 0) > 0) {
    lines.push(
      ...wrappedIndentedLines(
        `${pickIcon('⚠', '!')} ${trans.timetable.hubUnresolved} · ${data.unresolvedCount}`,
        cols,
        c.warn,
      ),
    );
    lines.push('');
  }

  lines.push(...panelHeading(trans.menu.events, cols));
  if (data.eventLines && data.eventLines.length > 0) {
    const remaining = Number.isFinite(bodyRows)
      ? Math.max(0, Math.floor(bodyRows) - lines.length)
      : Number.POSITIVE_INFINITY;
    let usedRows = 0;
    for (const line of data.eventLines) {
      const wrapped = wrappedRenderedLines(line, cols);
      if (usedRows + wrapped.length > remaining) {
        if (usedRows === 0 && remaining === 0) lines.push(...wrapped);
        break;
      }
      lines.push(...wrapped);
      usedRows += wrapped.length;
    }
  } else if (data.loading) {
    lines.push(...loadingLines(cols));
  } else if (data.eventsLoadFailed) {
    lines.push(...wrappedIndentedLines(trans.calendar.error, cols, type.hint));
  } else {
    lines.push(...wrappedIndentedLines(trans.calendar.noEvents, cols, type.hint));
  }

  return lines;
}

let data: HomeData = { loading: true };

export const homeView = {
  id: 'home',
  title: 'Home',

  footerHint(tabCount: number, cols = Number.POSITIVE_INFINITY): string {
    return passiveFooterHint(tabCount, cols);
  },

  async load(ctx: AppContext): Promise<void> {
    const weekAheadInfo = peekWeekAheadInfo();
    try {
      data = {
        loading: true,
        nextClassLine: peekNextClassLine(),
        todayLines: peekTodayLines(),
        unresolvedCount: peekUnresolvedCount(),
        ...(weekAheadInfo ? { weekAhead: { classDays: weekAheadInfo.classDays } } : {}),
      };
    } catch {
      data = { loading: true };
    }
    ctx.rerender();

    const HOME_EVENT_FETCH_CAP = 15;
    try {
      const cal = await loadCalendarOrThrow();
      const now = new Date();
      const items = cal.upcoming({ days: 30 }).slice(0, HOME_EVENT_FETCH_CAP).map(toDisplayEvent);
      const eventLines = items.map((e) => renderEventBrief(e, now));

      let weekAhead = data.weekAhead;
      if (weekAheadInfo) {
        const weekEnd = addLocalDays(weekAheadInfo.weekStartDate, 7);
        const weekEvents = cal.inRange(weekAheadInfo.weekStartDate, weekEnd);
        const daySet = new Set(weekEvents.map((event) => campusWeekday(event.start)));
        weekAhead = {
          classDays: weekAheadInfo.classDays,
          eventDays: WEEKDAYS.map((weekday) => daySet.has(weekday)),
        };
      }
      data = weekAhead ? { ...data, eventLines, weekAhead } : { ...data, eventLines };
    } catch {
      data = { ...data, eventsLoadFailed: true };
    } finally {
      data = { ...data, loading: false };
      ctx.rerender();
    }
  },

  render(ctx: AppContext): string[] {
    return renderHome(data, new Date(), ctx.bodyRows, ctx.size.cols);
  },
} satisfies View;
