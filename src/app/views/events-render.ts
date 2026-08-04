import type { CalendarEvent, HeatmapBucket } from '@nbtca/nbtcal';
import { type, space } from '../../core/theme.js';
import { t } from '../../i18n/index.js';
import { ListField, renderListFieldWithContext } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { renderCountdownBanner, renderEventBrief, type Event } from '../../features/calendar.js';
import { renderHeatmap } from '../../features/calendar-heatmap.js';
import { visualWidth, wrapAnsiToVisualWidth } from '../../core/text.js';

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
  detailEvent?: CalendarEvent;
  searchField?: TextField;
}

function wrappedIndentedLines(
  label: string,
  cols: number | undefined,
  style: (value: string) => string,
): string[] {
  const width = Number.isFinite(cols) ? Math.max(1, Math.floor(cols ?? 1)) : Number.POSITIVE_INFINITY;
  const styled = style(label);
  const styledWidth = visualWidth(styled);
  const preferredIndent = visualWidth(space.indent) < width ? space.indent : '';
  const indent = preferredIndent
    && styledWidth > width - visualWidth(preferredIndent)
    && styledWidth <= width
    ? ''
    : preferredIndent;
  const contentWidth = Math.max(1, width - visualWidth(indent));
  return wrapAnsiToVisualWidth(styled, contentWidth).map((line) => `${indent}${line}`);
}

function wrappedRenderedLine(line: string, cols: number | undefined): string[] {
  const content = line.startsWith(space.indent) ? line.slice(space.indent.length) : line;
  return wrappedIndentedLines(content, cols, (value) => value);
}

// Lines a fully-expanded hub needs: banner+blank (2) + heatmap+blank (12) +
// recent-activity heading+up to 5 events+blank (7) + hubField
// (title+blank+6 options, 8) = 29. Below this, a terminal can't fit the
// heatmap without pushing the menu into scroll territory — better to keep
// it as the existing drill-down destination than show a truncated grid.
const EXPANDED_HUB_MIN_BODY_ROWS = 29;

function renderHubBody(state: EventsViewState, now: Date, bodyRows: number, cols?: number): string[] {
  const trans = t();
  const lines: string[] = [];
  const rows = Number.isFinite(bodyRows)
    ? Math.max(0, Math.floor(bodyRows))
    : Number.POSITIVE_INFINITY;
  const banner = renderCountdownBanner(state.nextEvent, now, cols);
  if (banner) lines.push(...banner.split('\n'), '');
  const buckets = state.heatmapBuckets;
  if (bodyRows >= EXPANDED_HUB_MIN_BODY_ROWS && buckets && buckets.length > 0) {
    lines.push(...renderHeatmap(buckets, now, { color: true, cols }).split('\n'));
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

export function renderEvents(state: EventsViewState, now: Date, bodyRows = 100, cols?: number): string[] {
  const trans = t();
  switch (state.mode) {
    case 'loading':
      return wrappedIndentedLines(trans.calendar.loading, cols, type.hint);
    case 'hub':
      return renderHubBody(state, now, bodyRows, cols);
    case 'heatmap':
      // renderHeatmap() already prints its own title (space.indent +
      // type.heading), so this mode doesn't add a second heading on top —
      // unlike Schedule's 'week'/'unresolved' modes, which wrap a
      // title-less renderer.
      return state.heatmapBuckets && state.heatmapBuckets.length > 0
        ? renderHeatmap(state.heatmapBuckets, now, { color: true, cols }).split('\n')
        : wrappedIndentedLines(trans.calendar.noEvents, cols, type.hint);
    case 'list':
      return state.listField?.render(bodyRows, cols) ?? [];
    case 'detail': {
      const context = [
        ...wrappedIndentedLines(state.detailTitle ?? '', cols, type.heading),
        ...wrappedIndentedLines(state.detailMeta ?? '', cols, type.hint),
        '',
        ...(state.detailDescription
          ? state.detailDescription.split('\n').flatMap((line) => wrappedIndentedLines(line, cols, type.body))
          : wrappedIndentedLines(trans.calendar.noDescription, cols, type.hint)),
        '',
        ...(state.statusMessage ? [...wrappedIndentedLines(state.statusMessage, cols, type.hint), ''] : []),
      ];
      return state.detailField
        ? renderListFieldWithContext(context, state.detailField, bodyRows, cols)
        : Number.isFinite(bodyRows) ? context.slice(0, Math.max(0, Math.floor(bodyRows))) : context;
    }
    case 'search':
      return state.searchField?.render(cols) ?? [];
    case 'error':
      return wrappedIndentedLines(state.errorMessage ?? trans.calendar.error, cols, type.hint);
    default:
      return [];
  }
}
