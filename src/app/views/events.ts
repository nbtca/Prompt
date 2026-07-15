import type { Calendar, CalendarEvent } from '@nbtca/nbtcal';
import type { AppContext, View } from '../view.js';
import { captureFooterHint } from '../chrome.js';
import { ListField, computeMaxVisible } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { renderEvents, type EventsViewState } from './events-render.js';
import { setVimKeysActive } from '../../core/vim-keys.js';
import { pickIcon } from '../../core/icons.js';
import { t } from '../../i18n/index.js';
import { loadCalendarOrThrow, toDisplayEvent, exportEventIcs } from '../../features/calendar.js';
import { weekRange, monthRange, filterEvents } from '../../features/calendar-query.js';

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
  ];
  return new ListField({ title: trans.menu.events, options });
}

function buildListField(title: string, events: CalendarEvent[], maxVisible: number): ListField {
  const trans = t();
  const display = events.map(toDisplayEvent);
  const options = [
    ...events.map((_e, i) => ({
      value: String(i),
      label: `${display[i]!.date}${display[i]!.time ? ' ' + display[i]!.time : ''}  ${display[i]!.title}`,
      hint: display[i]!.location,
    })),
    { value: '__back__', label: backLabel() },
  ];
  return new ListField({
    title: title || trans.menu.events,
    options: options.length > 1 ? options : [{ value: '__back__', label: `${trans.calendar.noEvents} — ${backLabel()}` }],
    maxVisible,
  });
}

function showList(title: string, events: CalendarEvent[], ctx: AppContext): void {
  currentList = events;
  state = { mode: 'list', listField: buildListField(title, events, computeMaxVisible(ctx.bodyRows)) };
}

const RECENT_ACTIVITY_COUNT = 5;

function goToHub(): void {
  const upcoming = calendar ? calendar.upcoming({ days: 30 }) : [];
  state = {
    mode: 'hub',
    hubField: buildHubField(),
    nextEvent: upcoming[0] ? toDisplayEvent(upcoming[0]) : undefined,
    heatmapBuckets: calendar
      ? calendar.heatmap({ start: new Date(Date.now() - 365 * 86400000), end: new Date(), bucket: 'day' })
      : [],
    recentEvents: upcoming.slice(0, RECENT_ACTIVITY_COUNT).map(toDisplayEvent),
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
    detailField: new ListField({
      title: e.title,
      options: [
        { value: 'export', label: trans.calendar.exportIcs },
        { value: '__back__', label: backLabel() },
      ],
    }),
  };
}

export const eventsView: View = {
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
    // Sync the list's scroll window to the *current* terminal size on every
    // frame (not just construction time) — this is what keeps a long list
    // correctly windowed across a live resize.
    state.listField?.setMaxVisible(computeMaxVisible(ctx.bodyRows));
    return renderEvents(state, new Date(), ctx.bodyRows);
  },

  capturesInput(): boolean {
    return state.mode === 'search';
  },

  footerHint(): string | undefined {
    return state.mode === 'search' ? captureFooterHint() : undefined;
  },

  handleBack(): boolean {
    if (state.mode === 'list' || state.mode === 'detail' || state.mode === 'search') {
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
        if (result.selected === 'upcoming') { showList(t().menu.events, calendar.upcoming({ days: 30 }), ctx); return; }
        if (result.selected === 'week') { const r = weekRange(now); showList(t().calendar.thisWeek, calendar.inRange(r.start, r.end), ctx); return; }
        if (result.selected === 'month') { const r = monthRange(now); showList(t().calendar.thisMonth, calendar.inRange(r.start, r.end), ctx); return; }
        if (result.selected === 'past') { showList(t().calendar.pastEvents, calendar.past({ days: 30 }).reverse(), ctx); return; }
        if (result.selected === 'search') {
          setVimKeysActive(false);
          state = { mode: 'search', searchField: new TextField({ message: t().calendar.searchPrompt, placeholder: t().calendar.searchPlaceholder, allowEmpty: true }) };
        }
        return;
      }
      case 'list': {
        const result = state.listField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__back__') { goToHub(); return; }
        const raw = currentList[Number.parseInt(result.selected, 10)];
        if (raw) showDetail(raw);
        return;
      }
      case 'detail': {
        const result = state.detailField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__back__') { showList('', currentList, ctx); return; }
        if (result.selected === 'export' && state.detailTitle) {
          const raw = currentList.find((e) => toDisplayEvent(e).title === state.detailTitle);
          if (raw) {
            const res = exportEventIcs(raw);
            state = { ...state, statusMessage: res.ok ? `${t().calendar.exportSuccess}: ${res.path}` : `${t().calendar.exportError}: ${res.error ?? ''}` };
          }
        }
        return;
      }
      case 'search': {
        const result = state.searchField?.handleKey(key);
        if (result?.cancelled) { setVimKeysActive(true); goToHub(); return; }
        if (result?.submitted !== undefined) {
          setVimKeysActive(true);
          const query = result.submitted.trim();
          if (!query || !calendar) { goToHub(); return; }
          const now = new Date();
          const pool = calendar.inRange(now, new Date(now.getTime() + 365 * 86400000));
          const results = filterEvents(pool, query);
          showList(`${t().calendar.search}: ${query}`, results, ctx);
        }
        return;
      }
      default:
        return;
    }
  },
};
