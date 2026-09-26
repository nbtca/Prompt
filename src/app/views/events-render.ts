import type { CalendarEvent, HeatmapBucket } from '@nbtca/nbtcal';
import { type, space } from '../../core/theme.js';
import { t } from '../../i18n/index.js';
import { type ListField, renderListFieldWithContext } from '../fields/list-field.js';
import { offlineNotice } from '../chrome.js';
import type { TextField } from '../fields/text-field.js';
import {
  renderCountdownBanner,
  renderEventBriefLines,
  type Event,
} from '../../features/calendar.js';
import { renderHeatmap } from '../../features/calendar-heatmap.js';
import { wrapAnsiWithIndent } from '../../core/text.js';
import { loadingLines } from '../../core/components/spinner.js';

export type EventsMode = 'loading' | 'hub' | 'heatmap' | 'list' | 'detail' | 'search' | 'error';

export interface EventsViewState {
  mode: EventsMode;
  errorMessage?: string;
  errorField?: ListField;
  statusMessage?: string;
  stale?: boolean;
  nextEvent?: Event;
  heatmapBuckets?: HeatmapBucket[];
  recentEvents?: Event[];
  hubField?: ListField;
  listField?: ListField;
  listTitle?: string;
  listNotice?: string;
  detailField?: ListField;
  detailTitle?: string;
  detailMeta?: string;
  detailDescription?: string;
  detailEvent?: CalendarEvent;
  searchField?: TextField;
}

function wrappedIndentedLines(
  label: string,
  cols: number | undefined,
  style: (value: string) => string,
): string[] {
  return wrapAnsiWithIndent(style(label), cols ?? Number.POSITIVE_INFINITY, space.indent);
}

const EXPANDED_HUB_MIN_BODY_ROWS = 29;

export function hubShowsHeatmap(bodyRows: number, buckets: readonly HeatmapBucket[] = []): boolean {
  return bodyRows >= EXPANDED_HUB_MIN_BODY_ROWS && buckets.length > 0;
}

function heatmapLines(buckets: HeatmapBucket[], now: Date, cols?: number): string[] {
  return renderHeatmap(buckets, now, {
    color: true,
    ...(cols === undefined ? {} : { cols }),
  }).split('\n');
}

function renderHubBody(
  state: EventsViewState,
  now: Date,
  bodyRows: number,
  cols?: number,
): string[] {
  const trans = t();
  const lines: string[] = [];
  const rows = Number.isFinite(bodyRows)
    ? Math.max(0, Math.floor(bodyRows))
    : Number.POSITIVE_INFINITY;
  if (state.stale) lines.push(...offlineNotice(cols ?? Number.POSITIVE_INFINITY));
  const banner = renderCountdownBanner(state.nextEvent, now, cols);
  if (banner) lines.push(...banner.split('\n'), '');
  const buckets = state.heatmapBuckets;
  if (buckets && hubShowsHeatmap(bodyRows, buckets))
    lines.push(...heatmapLines(buckets, now, cols), '');
  if (state.recentEvents && state.recentEvents.length > 0) {
    const activityHeading = wrappedIndentedLines(trans.calendar.recentActivity, cols, type.heading);
    const fieldRows = state.hubField
      ? state.hubField.render(Number.POSITIVE_INFINITY, cols).length
      : 0;
    const collectEventLines = (reservedFieldRows: number): string[] => {
      const budget = Math.max(
        0,
        rows - lines.length - activityHeading.length - 1 - reservedFieldRows,
      );
      const collected: string[] = [];
      for (const event of state.recentEvents ?? []) {
        const wrapped = renderEventBriefLines(event, now, cols);
        if (collected.length + wrapped.length > budget) break;
        collected.push(...wrapped);
      }
      return collected;
    };
    let eventLines = collectEventLines(fieldRows);
    if (eventLines.length === 0 && state.hubField && fieldRows > 3) {
      eventLines = collectEventLines(Math.min(3, rows));
    }
    if (eventLines.length > 0) lines.push(...activityHeading, ...eventLines, '');
  } else if (!state.nextEvent) {
    const notice = [...wrappedIndentedLines(trans.calendar.noEvents, cols, type.hint), ''];
    const fieldRows = state.hubField?.render(Number.POSITIVE_INFINITY, cols).length ?? 0;
    if (lines.length + notice.length + fieldRows <= rows) lines.push(...notice);
  }
  if (state.hubField) {
    return renderListFieldWithContext(lines, state.hubField, bodyRows, cols);
  }
  return lines;
}

export function renderEvents(
  state: EventsViewState,
  now: Date,
  bodyRows = 100,
  cols?: number,
): string[] {
  const trans = t();
  const notice = state.stale ? offlineNotice(cols ?? Number.POSITIVE_INFINITY) : [];
  switch (state.mode) {
    case 'loading':
      return loadingLines(trans.calendar.loading, cols);
    case 'hub':
      return renderHubBody(state, now, bodyRows, cols);
    case 'heatmap':
      return [
        ...notice,
        ...(state.heatmapBuckets && state.heatmapBuckets.length > 0
          ? heatmapLines(state.heatmapBuckets, now, cols)
          : wrappedIndentedLines(trans.calendar.noEvents, cols, type.hint)),
      ];
    case 'list': {
      if (!state.listField) return [];
      const context =
        state.listNotice === undefined
          ? notice
          : [
              ...notice,
              ...wrappedIndentedLines(state.listTitle ?? '', cols, type.heading),
              '',
              ...wrappedIndentedLines(state.listNotice, cols, type.hint),
              '',
            ];
      return renderListFieldWithContext(context, state.listField, bodyRows, cols);
    }
    case 'detail': {
      const context = [
        ...notice,
        ...wrappedIndentedLines(state.detailTitle ?? '', cols, type.heading),
        ...wrappedIndentedLines(state.detailMeta ?? '', cols, type.hint),
        '',
        ...(state.detailDescription
          ? state.detailDescription
              .split('\n')
              .flatMap((line) => wrappedIndentedLines(line, cols, type.body))
          : wrappedIndentedLines(trans.calendar.noDescription, cols, type.hint)),
        '',
        ...(state.statusMessage
          ? [...wrappedIndentedLines(state.statusMessage, cols, type.hint), '']
          : []),
      ];
      return state.detailField
        ? renderListFieldWithContext(context, state.detailField, bodyRows, cols)
        : Number.isFinite(bodyRows)
          ? context.slice(0, Math.max(0, Math.floor(bodyRows)))
          : context;
    }
    case 'search':
      return [...notice, ...(state.searchField?.render(cols) ?? [])];
    case 'error': {
      const context = [
        ...wrappedIndentedLines(state.errorMessage ?? trans.calendar.error, cols, type.body),
        ...wrappedIndentedLines(trans.calendar.errorHint, cols, type.hint),
        '',
      ];
      if (state.errorField) {
        return renderListFieldWithContext(context, state.errorField, bodyRows, cols);
      }
      return Number.isFinite(bodyRows)
        ? context.slice(0, Math.max(0, Math.floor(bodyRows)))
        : context;
    }
    default:
      return [];
  }
}
