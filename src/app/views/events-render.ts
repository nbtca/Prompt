import type { CalendarEvent, HeatmapBucket } from '@nbtca/nbtcal';
import { type, space } from '../../core/theme.js';
import { t } from '../../i18n/index.js';
import { type ListField, renderListFieldWithContext } from '../fields/list-field.js';
import type { TextField } from '../fields/text-field.js';
import { renderCountdownBanner, renderEventBrief, type Event } from '../../features/calendar.js';
import { renderHeatmap } from '../../features/calendar-heatmap.js';
import { wrapAnsiWithIndent } from '../../core/text.js';
import { loadingLines } from '../../core/components/spinner.js';

export type EventsMode = 'loading' | 'hub' | 'heatmap' | 'list' | 'detail' | 'search' | 'error';

export interface EventsViewState {
  mode: EventsMode;
  errorMessage?: string;
  statusMessage?: string;
  nextEvent?: Event;
  heatmapBuckets?: HeatmapBucket[];
  recentEvents?: Event[];
  hubField?: ListField;
  listField?: ListField;
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

function wrappedRenderedLine(line: string, cols: number | undefined): string[] {
  const content = line.startsWith(space.indent) ? line.slice(space.indent.length) : line;
  return wrappedIndentedLines(content, cols, (value) => value);
}

const EXPANDED_HUB_MIN_BODY_ROWS = 29;

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
  const banner = renderCountdownBanner(state.nextEvent, now, cols);
  if (banner) lines.push(...banner.split('\n'), '');
  const buckets = state.heatmapBuckets;
  if (bodyRows >= EXPANDED_HUB_MIN_BODY_ROWS && buckets && buckets.length > 0) {
    lines.push(
      ...renderHeatmap(buckets, now, {
        color: true,
        ...(cols === undefined ? {} : { cols }),
      }).split('\n'),
    );
    lines.push('');
  }
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
        const wrapped = wrappedRenderedLine(renderEventBrief(event, now), cols);
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
  switch (state.mode) {
    case 'loading':
      return loadingLines(trans.calendar.loading, cols);
    case 'hub':
      return renderHubBody(state, now, bodyRows, cols);
    case 'heatmap':
      return state.heatmapBuckets && state.heatmapBuckets.length > 0
        ? renderHeatmap(state.heatmapBuckets, now, {
            color: true,
            ...(cols === undefined ? {} : { cols }),
          }).split('\n')
        : wrappedIndentedLines(trans.calendar.noEvents, cols, type.hint);
    case 'list':
      return state.listField?.render(bodyRows, cols) ?? [];
    case 'detail': {
      const context = [
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
      return state.searchField?.render(cols) ?? [];
    case 'error':
      return wrappedIndentedLines(state.errorMessage ?? trans.calendar.error, cols, type.hint);
    default:
      return [];
  }
}
