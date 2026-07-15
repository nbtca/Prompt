import { type, space, glyph } from '../../core/theme.js';
import { t } from '../../i18n/index.js';
import { peekNextClassLine, peekTodayLines } from '../../features/schedule-view.js';
import { fetchEvents, renderEventBrief } from '../../features/calendar.js';
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

/** Pure: renders the schedule-first dashboard from already-fetched data. No I/O. */
export function renderHome(data: HomeData, now: Date): string[] {
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

  // Upcoming events (network, best-effort).
  lines.push(panelHeading(trans.menu.events));
  if (data.eventLines && data.eventLines.length > 0) {
    for (const l of data.eventLines) lines.push(l);
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

    // Events is the only networked panel; best-effort.
    try {
      const items = await fetchEvents();
      const now = new Date();
      const eventLines = items.slice(0, 4).map((e) => renderEventBrief(e, now));
      data = { ...data, eventLines };
    } catch {
      data = { ...data, eventsError: true };
    } finally {
      data = { ...data, loading: false };
      ctx.rerender();
    }
  },

  render(_ctx: AppContext): string[] {
    return renderHome(data, new Date());
  },
};
