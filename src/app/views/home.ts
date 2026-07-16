import { c, type, space, glyph } from '../../core/theme.js';
import { t } from '../../i18n/index.js';
import { pickIcon } from '../../core/icons.js';
import { padEndV, visualWidth } from '../../core/text.js';
import { peekNextClassLine, peekTodayLines } from '../../features/schedule-view.js';
import { fetchEvents, renderEventBrief } from '../../features/calendar.js';
import { weekdayShortLabel } from '../../features/schedule-render.js';
import type { View, AppContext } from '../view.js';

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

function panelHeading(label: string): string {
  return `${space.indent}${type.heading(label)}`;
}

function loadingLine(): string {
  return `${space.indent}${type.hint(t().common.loading)}`;
}

const DAY_PROGRESS_WIDTH = 20;

/** Pure: a block-character bar for how far into the calendar day `now` is. */
function renderDayProgress(now: Date): string {
  const minutesElapsed = now.getHours() * 60 + now.getMinutes();
  const fraction = Math.min(1, Math.max(0, minutesElapsed / 1440));
  const filled = Math.round(fraction * DAY_PROGRESS_WIDTH);
  const filledChar = glyph.barFilled();
  const emptyChar = glyph.barEmpty();
  const bar = filledChar.repeat(filled) + emptyChar.repeat(DAY_PROGRESS_WIDTH - filled);
  const pct = Math.round(fraction * 100);
  return `${space.indent}${type.body(bar)}  ${type.hint(`${pct}%`)}`;
}

/** Combined class+event density grid for the coming campus week — the one
 * visualization neither Schedule nor Events alone can produce, since it
 * needs both data sources at once. Deliberately coarser (binary, not
 * 5-level) than Schedule's own term-density strip, and deliberately
 * uncolored (see the design spec's "Visual language decision") since it's
 * an overview of two other already-colored things, not a third color
 * language to learn. */
function renderWeekAheadGrid(classDays: readonly boolean[], eventDays: readonly boolean[] | undefined): string {
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
  // classDays data (campus never has weekend classes) -- matches
  // renderWeekStrip's own established weekend treatment exactly.
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

  return [headerLine, classLine, eventLine, legend].join('\n');
}

/** Pure: renders the schedule-first dashboard from already-fetched data. No I/O. */
export function renderHome(data: HomeData, now: Date, bodyRows = 100): string[] {
  const trans = t();
  const lines: string[] = [];

  // Next class (cache-only, instant).
  const nextClass = data.nextClassLine !== undefined && data.nextClassLine.trim().length > 0
    ? data.nextClassLine
    : `${space.indent}${type.hint(trans.timetable.noNextClass)}`;
  lines.push(panelHeading(trans.timetable.nextClass));
  lines.push(nextClass);
  lines.push('');

  // Today's classes (cache-only, instant).
  lines.push(panelHeading(trans.timetable.hubToday));
  lines.push(renderDayProgress(now));
  if (data.todayLines && data.todayLines.length > 0) {
    for (const l of data.todayLines) lines.push(l);
  } else {
    lines.push(`${space.indent}${type.hint(trans.timetable.noClassToday)}`);
  }
  lines.push('');

  // Week overview (Part D): only when the student has a set-up, in-term
  // personal timetable -- mirrors peekWeekAheadInfo's own "not set up yet
  // / term hasn't started" -> null contract, hiding the whole panel rather
  // than showing empty/misleading cells.
  if (data.weekAhead) {
    lines.push(panelHeading(trans.timetable.weekOverviewTitle));
    lines.push(...renderWeekAheadGrid(data.weekAhead.classDays, data.weekAhead.eventDays).split('\n'));
    lines.push('');
  }

  // Unresolved schedule items (Part E): surfaced directly on Home instead
  // of only inside Schedule's own hub menu -- same c.warn + ⚠ treatment
  // buildHubField() (schedule.ts) already uses for this exact condition,
  // matching the "everything that needs your attention, in one place"
  // spirit of a gh-status-like control center.
  if ((data.unresolvedCount ?? 0) > 0) {
    lines.push(`${space.indent}${c.warn(`${pickIcon('⚠', '!')} ${trans.timetable.hubUnresolved} · ${data.unresolvedCount}`)}`);
    lines.push('');
  }

  // Upcoming events (network, best-effort). How many fit is whatever room
  // is actually left after next-class/today above — on a tall terminal
  // that's most of `data.eventLines`; on a normal one, still just a few,
  // same as before this was ever adaptive.
  lines.push(panelHeading(trans.menu.events));
  if (data.eventLines && data.eventLines.length > 0) {
    const remaining = Math.max(1, bodyRows - lines.length);
    for (const l of data.eventLines.slice(0, remaining)) lines.push(l);
  } else if (data.loading) {
    lines.push(loadingLine());
  } else if (data.eventsError) {
    lines.push(`${space.indent}${type.hint(trans.calendar.error)}`);
  } else {
    lines.push(`${space.indent}${type.hint(trans.calendar.noEvents)}`);
  }

  return lines;
}

let data: HomeData = { loading: true };

export const homeView: View = {
  id: 'home',
  title: 'Home',

  async load(ctx: AppContext): Promise<void> {
    // Schedule panels are cache-only and instant — populate them synchronously first.
    try {
      data = { loading: true, nextClassLine: peekNextClassLine(), todayLines: peekTodayLines() };
    } catch {
      data = { loading: true };
    }
    ctx.rerender();

    // Events is the only networked panel; best-effort. Fetches more than a
    // small terminal could ever show — renderHome trims to what actually
    // fits at render time based on real bodyRows. 15 is a glance-panel
    // ceiling, not a "full list" (Events' own tab is where you browse
    // everything); it just needs to be at least as many as the tallest
    // reasonable terminal could fit.
    const HOME_EVENT_FETCH_CAP = 15;
    try {
      const items = await fetchEvents();
      const now = new Date();
      const eventLines = items.slice(0, HOME_EVENT_FETCH_CAP).map((e) => renderEventBrief(e, now));
      data = { ...data, eventLines };
    } catch {
      data = { ...data, eventsError: true };
    } finally {
      data = { ...data, loading: false };
      ctx.rerender();
    }
  },

  render(ctx: AppContext): string[] {
    return renderHome(data, new Date(), ctx.bodyRows);
  },
};
