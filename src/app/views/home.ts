import { c, type, space, glyph } from '../../core/theme.js';
import { t } from '../../i18n/index.js';
import { pickIcon } from '../../core/icons.js';
import { padEndV, visualWidth, wrapAnsiToVisualWidth } from '../../core/text.js';
import { peekNextClassLine, peekTodayLines, peekWeekAheadInfo, peekUnresolvedCount } from '../../features/schedule-view.js';
import { loadCalendarOrThrow, toDisplayEvent, renderEventBrief } from '../../features/calendar.js';
import { weekdayShortLabel } from '../../features/schedule-render.js';
import { campusWeekday } from '../../features/schedule-query.js';
import type { View, AppContext } from '../view.js';
import { passiveFooterHint } from '../chrome.js';

/** Data consumed by the pure `renderHome`; populated best-effort by `homeView.load`. */
export interface HomeData {
  loading?: boolean;
  nextClassLine?: string;
  todayLines?: string[];
  eventLines?: string[];
  /** Set when the events fetch itself failed — distinct from "fetch
   * succeeded, there's just nothing upcoming" (`eventLines: []`), which
   * every other view in the app already distinguishes. */
  eventsError?: boolean;
  weekAhead?: { classDays: boolean[]; eventDays?: boolean[] };
  unresolvedCount?: number;
}

function wrappedIndentedLines(
  label: string,
  cols: number,
  style: (value: string) => string,
): string[] {
  const width = Number.isFinite(cols) ? Math.max(1, Math.floor(cols)) : Number.POSITIVE_INFINITY;
  const styled = style(label);
  const preferredIndent = visualWidth(space.indent) < width ? space.indent : '';
  const indent = preferredIndent
    && visualWidth(styled) > width - visualWidth(preferredIndent)
    && visualWidth(styled) <= width
    ? ''
    : preferredIndent;
  const contentWidth = Math.max(1, width - visualWidth(indent));
  return wrapAnsiToVisualWidth(styled, contentWidth).map((line) => `${indent}${line}`);
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

/** Pure: a block-character bar for how far into the calendar day `now` is. */
function renderDayProgress(now: Date, cols: number): string {
  const minutesElapsed = now.getHours() * 60 + now.getMinutes();
  const fraction = Math.min(1, Math.max(0, minutesElapsed / 1440));
  const pct = Math.round(fraction * 100);
  const percentage = `${pct}%`;
  const width = Number.isFinite(cols) ? Math.max(1, Math.floor(cols)) : Number.POSITIVE_INFINITY;
  const indent = visualWidth(space.indent) + 2 + visualWidth(percentage) + 1 <= width ? space.indent : '';
  const gap = visualWidth(indent) + 2 + visualWidth(percentage) + 1 <= width
    ? '  '
    : visualWidth(indent) + 1 + visualWidth(percentage) + 1 <= width ? ' ' : '';
  const barWidth = Math.max(0, Math.min(
    DAY_PROGRESS_WIDTH,
    width - visualWidth(indent) - visualWidth(gap) - visualWidth(percentage),
  ));
  const filled = Math.round(fraction * barWidth);
  const filledChar = glyph.barFilled();
  const emptyChar = glyph.barEmpty();
  const bar = filledChar.repeat(filled) + emptyChar.repeat(barWidth - filled);
  return `${indent}${type.body(bar)}${gap}${type.hint(percentage)}`;
}

/** Combined class+event density grid for the coming campus week — the one
 * visualization neither Schedule nor Events alone can produce, since it
 * needs both data sources at once. Deliberately coarser (binary, not
 * 5-level) than Schedule's own term-density strip, and deliberately
 * uncolored (see the design spec's "Visual language decision") since it's
 * an overview of two other already-colored things, not a third color
 * language to learn. */
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

  const rowLabelW = Math.max(visualWidth(trans.timetable.weekAheadClasses), visualWidth(trans.menu.events)) + 1;

  const days = [1, 2, 3, 4, 5, 6, 7];
  const dayLabels = days.map((wd) => type.hint(weekdayShortLabel(wd))).join('  ');
  const headerLine = `${space.indent}${padEndV('', rowLabelW)}${dayLabels}`;

  // Class row: weekend is hardcoded to the "N/A" glyph regardless of
  // classDays data (campus never has weekend classes) -- the same
  // weekend treatment used throughout the Schedule tab's own renderers.
  const classCells = days.map((wd) => {
    const isWeekend = wd === 6 || wd === 7;
    const glyphChar = isWeekend ? weekendChar : (classDays[wd - 1] ? hasClassChar : freeChar);
    return type.body(glyphChar);
  }).join('  ');
  const classLine = `${space.indent}${type.hint(padEndV(trans.timetable.weekAheadClasses, rowLabelW))}${classCells}`;

  // Event row: deliberately NOT hardcoding weekend -- a club event can
  // happen on a Saturday, so this row checks real data for all 7 days.
  // undefined eventDays (events still loading, or the fetch failed) means
  // "not yet known" -- rendered as blank, not the "free" glyph, to
  // visually distinguish "no data yet" from "checked, nothing happening".
  const eventCells = days.map((wd) => {
    if (!eventDays) return blankCell;
    return type.body(eventDays[wd - 1] ? hasClassChar : freeChar);
  }).join('  ');
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
    const classCell = wd === 6 || wd === 7
      ? weekendChar
      : classDays[wd - 1] ? hasClassChar : freeChar;
    const eventCell = eventDays
      ? eventDays[wd - 1] ? hasClassChar : freeChar
      : blankCell;
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

/** Pure: renders the schedule-first dashboard from already-fetched data. No I/O. */
export function renderHome(data: HomeData, now: Date, bodyRows = 100, cols = 80): string[] {
  const trans = t();
  const lines: string[] = [];

  // Next class (cache-only, instant).
  const nextClass = data.nextClassLine !== undefined && data.nextClassLine.trim().length > 0
    ? wrappedRenderedLines(data.nextClassLine, cols)
    : wrappedIndentedLines(trans.timetable.noNextClass, cols, type.hint);
  lines.push(...panelHeading(trans.timetable.nextClass, cols));
  lines.push(...nextClass);
  lines.push('');

  // Today's classes (cache-only, instant).
  lines.push(...panelHeading(trans.timetable.hubToday, cols));
  lines.push(renderDayProgress(now, cols));
  if (data.todayLines && data.todayLines.length > 0) {
    for (const line of data.todayLines) lines.push(...wrappedRenderedLines(line, cols));
  } else {
    lines.push(...wrappedIndentedLines(trans.timetable.noClassToday, cols, type.hint));
  }
  lines.push('');

  // Week overview (Part D): only when the student has a set-up, in-term
  // personal timetable -- mirrors peekWeekAheadInfo's own "not set up yet
  // / term hasn't started" -> null contract, hiding the whole panel rather
  // than showing empty/misleading cells.
  if (data.weekAhead) {
    lines.push(...panelHeading(trans.timetable.weekOverviewTitle, cols));
    lines.push(...renderWeekAheadGrid(data.weekAhead.classDays, data.weekAhead.eventDays, cols).split('\n'));
    lines.push('');
  }

  // Unresolved schedule items (Part E): surfaced directly on Home instead
  // of only inside Schedule's own hub menu -- same c.warn + ⚠ treatment
  // buildHubField() (schedule.ts) already uses for this exact condition,
  // matching the "everything that needs your attention, in one place"
  // spirit of a gh-status-like control center.
  if ((data.unresolvedCount ?? 0) > 0) {
    lines.push(...wrappedIndentedLines(
      `${pickIcon('⚠', '!')} ${trans.timetable.hubUnresolved} · ${data.unresolvedCount}`,
      cols,
      c.warn,
    ));
    lines.push('');
  }

  // Upcoming events (network, best-effort). How many fit is whatever room
  // is actually left after next-class/today above — on a tall terminal
  // that's most of `data.eventLines`; on a normal one, still just a few,
  // same as before this was ever adaptive.
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
  } else if (data.eventsError) {
    lines.push(...wrappedIndentedLines(trans.calendar.error, cols, type.hint));
  } else {
    lines.push(...wrappedIndentedLines(trans.calendar.noEvents, cols, type.hint));
  }

  return lines;
}

let data: HomeData = { loading: true };

export const homeView: View = {
  id: 'home',
  title: 'Home',

  footerHint(tabCount: number, cols = Number.POSITIVE_INFINITY): string {
    return passiveFooterHint(tabCount, cols);
  },

  async load(ctx: AppContext): Promise<void> {
    // Schedule panels are cache-only and instant — populate them
    // synchronously first. weekAheadSync is computed once here and reused
    // below (peekWeekAheadInfo is itself cache-only/cheap, but capturing
    // its result avoids a second, redundant cache read for weekStartDate).
    const weekAheadSync = peekWeekAheadInfo();
    try {
      data = {
        loading: true,
        nextClassLine: peekNextClassLine(),
        todayLines: peekTodayLines(),
        unresolvedCount: peekUnresolvedCount(),
        weekAhead: weekAheadSync ? { classDays: weekAheadSync.classDays } : undefined,
      };
    } catch {
      data = { loading: true };
    }
    ctx.rerender();

    // Events is the only networked panel; best-effort. Fetches the calendar
    // exactly once and reuses that same Calendar instance for both the
    // upcoming-events list below and the week-ahead event row (when there's
    // a personal timetable to correlate it against) — not two separate
    // network round-trips for what both come from the same public feed.
    const HOME_EVENT_FETCH_CAP = 15;
    try {
      const cal = await loadCalendarOrThrow();
      const now = new Date();
      const items = cal.upcoming({ days: 30 }).slice(0, HOME_EVENT_FETCH_CAP).map(toDisplayEvent);
      const eventLines = items.map((e) => renderEventBrief(e, now));

      let weekAhead = data.weekAhead;
      if (weekAheadSync) {
        const weekEnd = new Date(weekAheadSync.weekStartDate.getTime() + 7 * 86400000);
        const weekEvents = cal.inRange(weekAheadSync.weekStartDate, weekEnd);
        const daySet = new Set(weekEvents.map((e) => campusWeekday(e.start)));
        weekAhead = { classDays: weekAheadSync.classDays, eventDays: [1, 2, 3, 4, 5, 6, 7].map((wd) => daySet.has(wd)) };
      }
      data = { ...data, eventLines, weekAhead };
    } catch {
      data = { ...data, eventsError: true };
    } finally {
      data = { ...data, loading: false };
      ctx.rerender();
    }
  },

  render(ctx: AppContext): string[] {
    return renderHome(data, new Date(), ctx.bodyRows, ctx.size.cols);
  },
};
