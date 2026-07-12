import { type, space } from '../../core/theme.js';
import { pickIcon } from '../../core/icons.js';
import { t } from '../../i18n/index.js';
import { peekNextClassLine } from '../../features/schedule-view.js';
import { fetchEvents } from '../../features/calendar.js';
import { checkServices, countServiceHealth } from '../../features/status.js';
import type { View, AppContext } from '../view.js';

/** Data consumed by the pure `renderHome`; populated best-effort by `homeView.load`. */
export interface HomeData {
  loading?: boolean;
  nextClassLine?: string;
  eventsSummary?: string;
  health?: { up: number; down: number };
}

function panelHeading(label: string): string {
  return `${space.indent}${type.heading(label)}`;
}

function loadingLine(): string {
  return `${space.indent}${type.hint(t().common.loading)}`;
}

function placeholderLine(): string {
  return `${space.indent}${type.hint(pickIcon('—', '-'))}`;
}

/**
 * Each panel shows its own value once that field has landed, regardless of the
 * other two fetches; falling back to a dim "loading…" while `data.loading` is
 * still true, or a dim placeholder once loading has finished with no value.
 */
function fieldLine(loading: boolean | undefined, value: string | undefined, fallback: string): string {
  if (typeof value === 'string') return value;
  return loading ? loadingLine() : fallback;
}

/** Pure: renders the Home dashboard's labelled panels from already-fetched data. No I/O. */
export function renderHome(data: HomeData): string[] {
  const trans = t();
  const lines: string[] = [];

  const nextClassFallback = `${space.indent}${type.hint(trans.timetable.noNextClass)}`;
  const nextClassLine = data.nextClassLine !== undefined && data.nextClassLine.trim().length === 0
    ? nextClassFallback
    : fieldLine(data.loading, data.nextClassLine, nextClassFallback);

  lines.push(panelHeading(trans.timetable.nextClass));
  lines.push(nextClassLine);
  lines.push('');

  lines.push(panelHeading(trans.menu.events));
  lines.push(fieldLine(
    data.loading,
    data.eventsSummary !== undefined ? `${space.indent}${type.body(data.eventsSummary)}` : undefined,
    placeholderLine(),
  ));
  lines.push('');

  lines.push(panelHeading(trans.menu.status));
  lines.push(fieldLine(
    data.loading,
    data.health ? `${space.indent}${type.body(`${data.health.up} ${trans.status.up}, ${data.health.down} ${trans.status.down}`)}` : undefined,
    placeholderLine(),
  ));

  return lines;
}

let data: HomeData = { loading: true };

export const homeView: View = {
  id: 'home',
  title: 'Home',

  async load(ctx: AppContext): Promise<void> {
    data = { loading: true };

    const nextClass = (async () => {
      try {
        data = { ...data, nextClassLine: peekNextClassLine() };
      } catch {
        // best-effort: leave nextClassLine unset, panel falls back to a placeholder
      } finally {
        ctx.rerender();
      }
    })();

    const events = (async () => {
      try {
        const items = await fetchEvents();
        data = { ...data, eventsSummary: `${items.length} ${t().menu.events.toLowerCase()}` };
      } catch {
        // best-effort: leave eventsSummary unset, panel falls back to a placeholder
      } finally {
        ctx.rerender();
      }
    })();

    const health = (async () => {
      try {
        const items = await checkServices();
        data = { ...data, health: countServiceHealth(items) };
      } catch {
        // best-effort: leave health unset, panel falls back to a placeholder
      } finally {
        ctx.rerender();
      }
    })();

    await Promise.all([nextClass, events, health]);
    data = { ...data, loading: false };
    ctx.rerender();
  },

  render(_ctx: AppContext): string[] {
    return renderHome(data);
  },
};
