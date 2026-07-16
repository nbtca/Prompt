import type { HeatmapBucket } from '@nbtca/nbtcal';
import { type, space } from '../../core/theme.js';
import { t } from '../../i18n/index.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { renderCountdownBanner, renderEventBrief, type Event } from '../../features/calendar.js';
import { renderHeatmap } from '../../features/calendar-heatmap.js';

export type EventsMode = 'loading' | 'hub' | 'heatmap' | 'list' | 'detail' | 'search' | 'error';

export interface EventsViewState {
  mode: EventsMode;
  errorMessage?: string;
  statusMessage?: string;
  nextEvent?: Event;
  heatmapBuckets?: HeatmapBucket[];
  /** A handful of upcoming events shown directly under the heatmap so the
   * hub is glanceable without drilling into a submenu — matches the
   * "know what's happening at a glance" bar the nbtca.space/calendar
   * reference sets, adapted to the TUI's own visual language. */
  recentEvents?: Event[];
  hubField?: ListField;
  listField?: ListField;
  detailField?: ListField;
  detailTitle?: string;
  detailMeta?: string;
  detailDescription?: string;
  searchField?: TextField;
}

function heading(label: string): string {
  return `${space.indent}${type.heading(label)}`;
}

function hint(label: string): string {
  return `${space.indent}${type.hint(label)}`;
}

// Lines a fully-expanded hub needs: banner+blank (2) + heatmap+blank (12) +
// recent-activity heading+up to 5 events+blank (7) + hubField
// (title+blank+6 options, 8) = 29. Below this, a terminal can't fit the
// heatmap without pushing the menu into scroll territory — better to keep
// it as the existing drill-down destination than show a truncated grid.
const EXPANDED_HUB_MIN_BODY_ROWS = 29;

function renderHubBody(state: EventsViewState, now: Date, bodyRows: number): string[] {
  const trans = t();
  const lines: string[] = [];
  const banner = renderCountdownBanner(state.nextEvent, now);
  if (banner) { lines.push(banner); lines.push(''); }
  const buckets = state.heatmapBuckets;
  if (bodyRows >= EXPANDED_HUB_MIN_BODY_ROWS && buckets && buckets.length > 0) {
    lines.push(...renderHeatmap(buckets, now, { color: true }).split('\n'));
    lines.push('');
  }
  if (state.recentEvents && state.recentEvents.length > 0) {
    lines.push(heading(trans.calendar.recentActivity));
    // Same reserved-floor idea as hubField's own windowing below, applied
    // one level up: recent-activity events and the hub menu compete for
    // the same remaining budget, and the menu must never be the one that
    // silently loses that fight.
    const menuFloor = 8; // title + blank + a handful of hub options
    const remaining = Math.max(1, bodyRows - lines.length - 1 - menuFloor);
    for (const e of state.recentEvents.slice(0, remaining)) lines.push(renderEventBrief(e, now));
    lines.push('');
  }
  if (state.hubField) {
    // The heatmap + recent-activity briefing above are already tall enough
    // to exceed a short terminal's body budget on their own — window the
    // menu against what this render actually already used, or the bottom
    // rows (search, past events) get silently cut with no scroll
    // indicator. Mirrors the same fix already shipped for Schedule's hub.
    state.hubField.setMaxVisible(Math.max(3, bodyRows - lines.length - 4));
    lines.push(...state.hubField.render());
  }
  return lines;
}

export function renderEvents(state: EventsViewState, now: Date, bodyRows = 100): string[] {
  const trans = t();
  switch (state.mode) {
    case 'loading':
      return [hint(trans.calendar.loading)];
    case 'hub':
      return renderHubBody(state, now, bodyRows);
    case 'heatmap':
      // renderHeatmap() already prints its own title (space.indent +
      // type.heading), so this mode doesn't add a second heading on top —
      // unlike Schedule's 'week'/'unresolved' modes, which wrap a
      // title-less renderer.
      return state.heatmapBuckets && state.heatmapBuckets.length > 0
        ? renderHeatmap(state.heatmapBuckets, now, { color: true }).split('\n')
        : [hint(trans.calendar.noEvents)];
    case 'list':
      return state.listField?.render() ?? [];
    case 'detail':
      return [
        heading(state.detailTitle ?? ''),
        hint(state.detailMeta ?? ''),
        '',
        ...(state.detailDescription ? state.detailDescription.split('\n').map((l) => `${space.indent}${l}`) : [hint(trans.calendar.noDescription)]),
        '',
        ...(state.statusMessage ? [hint(state.statusMessage), ''] : []),
        ...(state.detailField?.render() ?? []),
      ];
    case 'search':
      return state.searchField?.render() ?? [];
    case 'error':
      return [hint(state.errorMessage ?? trans.calendar.error)];
    default:
      return [];
  }
}
