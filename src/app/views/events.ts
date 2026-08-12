import type { Calendar, CalendarEvent } from '@nbtca/nbtcal';
import type { AppContext, View } from '../view.js';
import { captureFooterHint, passiveFooterHint } from '../chrome.js';
import { ListField, computeMaxVisible } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { renderEvents, type EventsViewState } from './events-render.js';
import { setVimKeysActive } from '../../core/vim-keys.js';
import { pickIcon } from '../../core/icons.js';
import { t } from '../../i18n/index.js';
import { loadCalendarOrThrow, toDisplayEvent, exportEventIcs } from '../../features/calendar.js';
import { weekRange, monthRange, filterEvents } from '../../features/calendar-query.js';
import { addLocalDays } from '../../core/calendar-day.js';

let state: EventsViewState = { mode: 'loading' };
let calendar: Calendar | null = null;
let currentList: CalendarEvent[] = [];

function backLabel(): string {
  return t().common.back;
}

function buildHubField(): ListField {
  const trans = t();
  const options = [
    { value: 'upcoming', label: trans.menu.events },
    { value: 'week', label: trans.calendar.thisWeek },
    { value: 'month', label: trans.calendar.thisMonth },
    { value: 'search', label: trans.calendar.search },
    { value: 'past', label: trans.calendar.pastEvents },
    { value: 'heatmap', label: trans.calendar.heatmap.title },
  ];
  return new ListField({ title: trans.menu.events, options });
}

function buildListField(title: string, events: CalendarEvent[], maxVisible: number): ListField {
  const trans = t();
  const display = events.map(toDisplayEvent);
  const options = [
    ...display.map((event, index) => ({
      value: String(index),
      label: `${event.date}${event.time ? ` ${event.time}` : ''}  ${event.title}`,
      hint: event.location,
    })),
    { value: '__back__', label: backLabel() },
  ];
  return new ListField({
    title: title || trans.menu.events,
    options:
      options.length > 1
        ? options
        : [{ value: '__back__', label: `${trans.calendar.noEvents} — ${backLabel()}` }],
    maxVisible,
  });
}

function showList(title: string, events: CalendarEvent[], ctx: AppContext): void {
  currentList = events;
  state = {
    mode: 'list',
    listField: buildListField(title, events, computeMaxVisible(ctx.bodyRows)),
  };
}

const RECENT_ACTIVITY_FETCH_CAP = 15;

function goToHub(): void {
  const upcoming = calendar ? calendar.upcoming({ days: 30 }) : [];
  const nextEvent = upcoming[0];
  state = {
    mode: 'hub',
    hubField: buildHubField(),
    ...(nextEvent === undefined ? {} : { nextEvent: toDisplayEvent(nextEvent) }),
    heatmapBuckets: calendar
      ? calendar.heatmap({
          start: addLocalDays(new Date(), -365),
          end: new Date(),
          bucket: 'day',
        })
      : [],
    recentEvents: upcoming.slice(0, RECENT_ACTIVITY_FETCH_CAP).map(toDisplayEvent),
  };
}

function showDetail(raw: CalendarEvent): void {
  const trans = t();
  const e = toDisplayEvent(raw);
  const dot = pickIcon('·', '-');
  state = {
    mode: 'detail',
    detailTitle: e.title,
    detailMeta: `${e.date}${e.time ? ' ' + e.time : ''}  ${dot}  ${e.location}${raw.recurring ? `  ${dot}  ${trans.calendar.recurringLabel}` : ''}`,
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
    state = { mode: 'loading' };
    ctx.rerender();
    try {
      calendar = await loadCalendarOrThrow();
      goToHub();
    } catch {
      state = { mode: 'error', errorMessage: t().calendar.error };
    }
    ctx.rerender();
  },

  render(ctx: AppContext): string[] {
    state.listField?.setMaxVisible(computeMaxVisible(ctx.bodyRows));
    return renderEvents(state, new Date(), ctx.bodyRows, ctx.size.cols);
  },

  capturesInput(): boolean {
    return state.mode === 'search';
  },

  capturesPageKeys(): boolean {
    return state.mode === 'hub' || state.mode === 'list' || state.mode === 'detail';
  },

  footerHint(tabCount: number, cols = Number.POSITIVE_INFINITY): string | undefined {
    if (state.mode === 'search') return captureFooterHint(cols);
    const passive = state.mode === 'loading' || state.mode === 'error' || state.mode === 'heatmap';
    return passive ? passiveFooterHint(tabCount, cols) : undefined;
  },

  handleBack(): boolean {
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
    if (!calendar) return;
    switch (state.mode) {
      case 'hub': {
        const result = state.hubField?.handleKey(key);
        if (!result?.selected) return;
        const now = new Date();
        if (result.selected === 'upcoming') {
          showList(t().menu.events, calendar.upcoming({ days: 30 }), ctx);
          return;
        }
        if (result.selected === 'week') {
          const r = weekRange(now);
          showList(t().calendar.thisWeek, calendar.inRange(r.start, r.end), ctx);
          return;
        }
        if (result.selected === 'month') {
          const r = monthRange(now);
          showList(t().calendar.thisMonth, calendar.inRange(r.start, r.end), ctx);
          return;
        }
        if (result.selected === 'past') {
          showList(t().calendar.pastEvents, calendar.past({ days: 30 }).reverse(), ctx);
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
          showList('', currentList, ctx);
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
          const pool = calendar.inRange(now, addLocalDays(now, 365));
          const results = filterEvents(pool, query);
          showList(`${t().calendar.search}: ${query}`, results, ctx);
        }
        return;
      }
      case 'loading':
      case 'error':
        return;
    }
  },
} satisfies View;
