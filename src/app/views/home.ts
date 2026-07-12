import { type, space } from '../../core/theme.js';
import { pickIcon } from '../../core/icons.js';
import { t } from '../../i18n/index.js';
import { peekNextClassLine, peekTodayLines } from '../../features/schedule-view.js';
import { fetchEvents } from '../../features/calendar.js';
import type { View, AppContext } from '../view.js';

/** Data consumed by the pure `renderHome`; populated best-effort by `homeView.load`. */
export interface HomeData {
  loading?: boolean;
  nextClassLine?: string;
  todayLines?: string[];
  eventLines?: string[];
}

function panelHeading(label: string): string {
  return `${space.indent}${type.heading(label)}`;
}

function loadingLine(): string {
  return `${space.indent}${type.hint(t().common.loading)}`;
}

/** Pure: renders the schedule-first dashboard from already-fetched data. No I/O. */
export function renderHome(data: HomeData): string[] {
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
  } else {
    lines.push(data.loading ? loadingLine() : `${space.indent}${type.hint(pickIcon('—', '-'))}`);
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
      const dot = pickIcon('·', '-');
      const eventLines = items.slice(0, 4).map(
        (e) => `${space.indent}${type.hint(`${e.date}${e.time ? ' ' + e.time : ''}`)}  ${dot}  ${type.body(e.title)}`,
      );
      data = { ...data, eventLines };
    } catch {
      // best-effort: leave eventLines unset, panel shows a placeholder
    } finally {
      data = { ...data, loading: false };
      ctx.rerender();
    }
  },

  render(_ctx: AppContext): string[] {
    return renderHome(data);
  },
};
