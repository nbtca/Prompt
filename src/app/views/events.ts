import type { Calendar, CalendarEvent } from '@nbtca/nbtcal';
import type { AppContext, View } from '../view.js';
import { captureFooterHint, passiveFooterHint } from '../chrome.js';
import { ListField, computeMaxVisible } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { hubShowsHeatmap, renderEvents, type EventsViewState } from './events-render.js';
import { setVimKeysActive } from '../../core/vim-keys.js';
import { glyph } from '../../core/theme.js';
import { padEndV, visualWidth } from '../../core/text.js';
import type { MenuOption } from '../../core/components/menu.js';
import { fmt, t } from '../../i18n/index.js';
import {
  eventTimeRange,
  eventWhen,
  exportEventIcs,
  loadCalendarOrCache,
  recurringMark,
  toDisplayEvent,
  yearHeatmap,
} from '../../features/calendar.js';
import {
  currentEvents,
  hasEnded,
  monthRange,
  pastEvents,
  searchEvents,
  weekRange,
} from '../../features/calendar-query.js';

let state: EventsViewState = { mode: 'loading' };
let calendar: Calendar | null = null;
let stale = false;
let currentList: CalendarEvent[] = [];
let listState: EventsViewState | undefined;
let hubField: ListField | undefined;
let hubValues: string[] = [];

function backLabel(): string {
  return t().common.back;
}

function buildHubField(selected: string | undefined, withHeatmap: boolean): ListField {
  const trans = t();
  const options = [
    { value: 'upcoming', label: trans.calendar.next30Days },
    { value: 'week', label: trans.calendar.thisWeek },
    { value: 'month', label: trans.calendar.thisMonth },
    { value: 'search', label: trans.calendar.search },
    { value: 'past', label: trans.calendar.pastEvents },
    ...(withHeatmap ? [{ value: 'heatmap', label: trans.calendar.heatmap.title }] : []),
  ];
  hubValues = options.map((option) => option.value);
  const initialIndex = Math.max(0, selected === undefined ? 0 : hubValues.indexOf(selected));
  return new ListField({ title: trans.calendar.browse, options, initialIndex });
}

function selectedHubValue(): string | undefined {
  return hubField ? hubValues[hubField.selectedIndex] : undefined;
}

function syncHubField(bodyRows: number): void {
  if (state.mode !== 'hub') return;
  const withHeatmap = !hubShowsHeatmap(bodyRows, state.heatmapBuckets);
  if (hubValues.includes('heatmap') === withHeatmap) return;
  hubField = buildHubField(selectedHubValue(), withHeatmap);
  state = { ...state, hubField };
}

function showList(
  ctx: AppContext,
  title: string,
  events: CalendarEvent[],
  emptyMessage: string,
  isEnded: (event: CalendarEvent) => boolean = () => false,
): void {
  const trans = t();
  const dot = glyph.sep();
  const display = events.map(toDisplayEvent);
  const whenWidth = Math.max(0, ...display.map((event) => visualWidth(eventWhen(event))));
  const options: MenuOption[] = [
    ...display.map((event, index) => {
      const raw = events[index];
      const ended = raw !== undefined && isEnded(raw);
      return {
        value: String(index),
        label: `${padEndV(eventWhen(event), whenWidth)}  ${event.title}${recurringMark(event)}`,
        hint: ended ? `${trans.calendar.endedLabel} ${dot} ${event.location}` : event.location,
        hintColumn: true,
        dim: ended,
      };
    }),
    { value: '__back__', label: backLabel() },
  ];
  currentList = events;
  const maxVisible = computeMaxVisible(ctx.bodyRows);
  state =
    events.length > 0
      ? { mode: 'list', listField: new ListField({ title, options, maxVisible }) }
      : {
          mode: 'list',
          listTitle: title,
          listNotice: emptyMessage,
          listField: new ListField({ options, maxVisible }),
        };
}

const RECENT_EVENTS_CAP = 5;

function goToHub(): void {
  const now = new Date();
  const upcoming = calendar ? currentEvents(calendar, now) : [];
  const nextEvent = upcoming.find((event) => event.start >= now);
  const withHeatmap = hubValues.length === 0 || hubValues.includes('heatmap');
  hubField = buildHubField(selectedHubValue(), withHeatmap);
  state = {
    mode: 'hub',
    hubField,
    ...(nextEvent === undefined ? {} : { nextEvent: toDisplayEvent(nextEvent) }),
    heatmapBuckets: calendar ? yearHeatmap(calendar, now) : [],
    recentEvents: upcoming.slice(0, RECENT_EVENTS_CAP).map(toDisplayEvent),
  };
}

function showDetail(raw: CalendarEvent): void {
  const trans = t();
  listState = state;
  const e = toDisplayEvent(raw);
  const dot = glyph.sep();
  state = {
    mode: 'detail',
    detailTitle: e.title,
    detailMeta: `${eventTimeRange(raw)}  ${dot}  ${e.location}${raw.recurring ? `  ${dot}  ${trans.calendar.recurringLabel}` : ''}`,
    detailDescription: e.description,
    detailEvent: raw,
    detailField: new ListField({
      title: '',
      options: [
        { value: 'export', label: trans.calendar.exportIcs },
        { value: '__back__', label: backLabel() },
      ],
    }),
  };
}

export const eventsView = {
  id: 'events',
  title: t().menu.events,

  async load(ctx: AppContext): Promise<void> {
    if (ctx.signal?.aborted) return;
    state = { mode: 'loading' };
    hubField = undefined;
    hubValues = [];
    ctx.rerender();
    try {
      const loaded = await loadCalendarOrCache(ctx.signal);
      if (ctx.signal?.aborted) return;
      calendar = loaded.calendar;
      stale = loaded.stale;
      goToHub();
    } catch {
      if (ctx.signal?.aborted) return;
      state = {
        mode: 'error',
        errorMessage: t().calendar.offlineError,
        errorField: new ListField({
          options: [{ value: 'retry', label: t().calendar.retry }],
        }),
      };
    }
    if (!ctx.signal?.aborted) ctx.rerender();
  },

  render(ctx: AppContext): string[] {
    state.listField?.setMaxVisible(computeMaxVisible(ctx.bodyRows));
    syncHubField(ctx.bodyRows);
    return renderEvents(
      stale ? { ...state, stale } : state,
      new Date(),
      ctx.bodyRows,
      ctx.size.cols,
    );
  },

  isBusy(): boolean {
    return state.mode === 'loading';
  },

  capturesInput(): boolean {
    return state.mode === 'search';
  },

  capturesPageKeys(): boolean {
    return (
      state.mode === 'hub' ||
      state.mode === 'list' ||
      state.mode === 'detail' ||
      state.mode === 'error'
    );
  },

  footerHint(tabCount: number, cols = Number.POSITIVE_INFINITY): string | undefined {
    if (state.mode === 'search') return captureFooterHint(cols);
    const passive = state.mode === 'loading' || state.mode === 'heatmap';
    return passive ? passiveFooterHint(tabCount, cols) : undefined;
  },

  handleBack(): boolean {
    if (state.mode === 'detail' && listState) {
      state = listState;
      return true;
    }
    if (
      state.mode === 'list' ||
      state.mode === 'detail' ||
      state.mode === 'search' ||
      state.mode === 'heatmap'
    ) {
      if (state.mode === 'search') setVimKeysActive(true);
      goToHub();
      return true;
    }
    return false;
  },

  handleKey(key: string, ctx: AppContext): void {
    if (state.mode === 'error') {
      if (state.errorField?.handleKey(key).selected === 'retry') void eventsView.load(ctx);
      return;
    }
    if (!calendar) return;
    switch (state.mode) {
      case 'hub': {
        const result = state.hubField?.handleKey(key);
        if (!result?.selected) return;
        const now = new Date();
        const trans = t();
        if (result.selected === 'upcoming') {
          showList(
            ctx,
            trans.calendar.next30Days,
            currentEvents(calendar, now),
            trans.calendar.noEvents,
          );
          return;
        }
        if (result.selected === 'week' || result.selected === 'month') {
          const r = result.selected === 'week' ? weekRange(now) : monthRange(now);
          const title =
            result.selected === 'week' ? trans.calendar.thisWeek : trans.calendar.thisMonth;
          showList(
            ctx,
            title,
            calendar.inRange(r.start, r.end),
            trans.calendar.noEventsInRange,
            (event) => hasEnded(event, now),
          );
          return;
        }
        if (result.selected === 'past') {
          showList(
            ctx,
            trans.calendar.pastEvents,
            pastEvents(calendar, now),
            trans.calendar.noPastEvents,
          );
          return;
        }
        if (result.selected === 'heatmap') {
          state = { ...state, mode: 'heatmap' };
          return;
        }
        if (result.selected === 'search') {
          setVimKeysActive(false);
          state = {
            mode: 'search',
            searchField: new TextField({
              message: t().calendar.searchPrompt,
              placeholder: t().calendar.searchPlaceholder,
              allowEmpty: true,
            }),
          };
        }
        return;
      }
      case 'heatmap': {
        goToHub();
        return;
      }
      case 'list': {
        const result = state.listField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__back__') {
          goToHub();
          return;
        }
        const raw = currentList[Number.parseInt(result.selected, 10)];
        if (raw) showDetail(raw);
        return;
      }
      case 'detail': {
        const result = state.detailField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__back__') {
          eventsView.handleBack();
          return;
        }
        if (result.selected === 'export' && state.detailEvent) {
          const res = exportEventIcs(state.detailEvent);
          state = {
            ...state,
            statusMessage: res.ok
              ? `${t().calendar.exportSuccess}: ${res.path}`
              : `${t().calendar.exportError}: ${res.error ?? ''}`,
          };
        }
        return;
      }
      case 'search': {
        const result = state.searchField?.handleKey(key);
        if (result?.cancelled) {
          setVimKeysActive(true);
          goToHub();
          return;
        }
        if (result?.submitted !== undefined) {
          setVimKeysActive(true);
          const query = result.submitted.trim();
          if (!query) {
            goToHub();
            return;
          }
          const now = new Date();
          const { upcoming, past } = searchEvents(calendar, query, now);
          const trans = t();
          showList(
            ctx,
            fmt(trans.calendar.searchResultsTitle, {
              query,
              count: upcoming.length + past.length,
              sep: glyph.sep(),
            }),
            [...upcoming, ...past],
            fmt(trans.calendar.searchNoResultsFor, { query }),
            (event) => hasEnded(event, now),
          );
        }
        return;
      }
      case 'loading':
        return;
    }
  },
} satisfies View;
