import type { HeatmapBucket } from '@nbtca/nbtcal';
import { type, space } from '../../core/theme.js';
import { t } from '../../i18n/index.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { renderCountdownBanner, renderEventBrief, type Event } from '../../features/calendar.js';
import { renderHeatmap } from '../../features/calendar-heatmap.js';

export type EventsMode = 'loading' | 'hub' | 'list' | 'detail' | 'search' | 'error';

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

function renderHubBody(state: EventsViewState, now: Date): string[] {
  const trans = t();
  const lines: string[] = [];
  const banner = renderCountdownBanner(state.nextEvent, now);
  if (banner) { lines.push(banner); lines.push(''); }
  if (state.heatmapBuckets && state.heatmapBuckets.length > 0) {
    lines.push(...renderHeatmap(state.heatmapBuckets, now, { color: true }).split('\n'));
    lines.push('');
  }
  if (state.recentEvents && state.recentEvents.length > 0) {
    lines.push(heading(trans.calendar.recentActivity));
    for (const e of state.recentEvents) lines.push(renderEventBrief(e, now));
    lines.push('');
  }
  if (state.hubField) lines.push(...state.hubField.render());
  return lines;
}

export function renderEvents(state: EventsViewState, now: Date): string[] {
  const trans = t();
  switch (state.mode) {
    case 'loading':
      return [hint(trans.calendar.loading)];
    case 'hub':
      return renderHubBody(state, now);
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
