import { loadCalendar, FeedFetchError, FeedParseError } from '@nbtca/nbtcal';
import type { Calendar, CalendarEvent, HeatmapBucket } from '@nbtca/nbtcal';
import chalk from 'chalk';
import { createSpinner } from '../core/ui.js';
import { c } from '../core/theme.js';
import { runMenu, menuFooter } from '../core/components/menu.js';
import { pickIcon } from '../core/icons.js';
import { padEndV, truncate } from '../core/text.js';
import { t } from '../i18n/index.js';
import { URLS } from '../config/data.js';
import { renderHeatmap } from './calendar-heatmap.js';

export interface Event {
  date: string;
  time: string;
  title: string;
  location: string;
  description: string;
  startDate: Date;
}

export interface EventOutputItem {
  date: string;
  time: string;
  title: string;
  location: string;
  description: string;
  startDateISO: string;
}

function formatDate(date: Date): string {
  const now = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  if (date.getFullYear() !== now.getFullYear()) {
    return `${date.getFullYear()}-${month}-${day}`;
  }
  return `${month}-${day}`;
}

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

async function loadCalendarOrThrow(): Promise<Calendar> {
  try {
    return await loadCalendar({ timeoutMs: 15000 });
  } catch (err) {
    const detail =
      err instanceof FeedFetchError || err instanceof FeedParseError
        ? (err as Error).message
        : String(err);
    throw new Error(`${t().calendar.error}: ${detail}`);
  }
}

export function toDisplayEvent(e: CalendarEvent): Event {
  const trans = t();
  return {
    date: formatDate(e.start),
    time: e.isAllDay ? '' : formatTime(e.start),
    title: e.title ?? trans.calendar.untitledEvent,
    location: e.location ?? trans.calendar.tbdLocation,
    description: e.description ?? '',
    startDate: e.start,
  };
}

export async function fetchEvents(): Promise<Event[]> {
  return (await loadCalendarOrThrow()).upcoming({ days: 30 }).map(toDisplayEvent);
}

export async function fetchHeatmapBuckets(): Promise<HeatmapBucket[]> {
  const now = new Date();
  const start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  return (await loadCalendarOrThrow()).heatmap({ start, end: now, bucket: 'day' });
}

export function serializeEvents(events: Event[]): EventOutputItem[] {
  return events.map((event) => ({
    date: event.date,
    time: event.time,
    title: event.title,
    location: event.location,
    description: event.description,
    startDateISO: event.startDate.toISOString(),
  }));
}

export function renderEventsTable(events: Event[], options?: { color?: boolean }): string {
  const trans = t();
  const useColor = options?.color !== false;

  if (events.length === 0) return `  ${trans.calendar.noEvents}`;

  const id       = (s: string) => s;
  const applyDim  = useColor ? chalk.dim   : id;
  const applyCyan = useColor ? chalk.cyan  : id;
  const applyBold = useColor ? chalk.bold  : id;
  const applyGray = useColor ? chalk.gray  : id;

  // dateWidth must fit YYYY-MM-DD HH:MM (16 chars) for cross-year events
  const dateWidth  = 16;
  const titleWidth = 32;
  const locWidth   = 14;
  const sep        = pickIcon('─', '-');

  const headerDate  = padEndV(applyDim(trans.calendar.dateTime),  dateWidth);
  const headerTitle = padEndV(applyDim(trans.calendar.eventName), titleWidth);
  const headerLoc   = applyDim(trans.calendar.location);
  // divider covers exactly: dateWidth + 2-char sep + titleWidth + 2-char sep + locWidth
  const divider     = applyDim(sep.repeat(dateWidth + 2 + titleWidth + 2 + locWidth));

  const lines: string[] = [
    `  ${headerDate}  ${headerTitle}  ${headerLoc}`,
    `  ${divider}`,
  ];

  for (const event of events) {
    const dateTime = event.time ? `${event.date} ${event.time}` : event.date;
    const dateCol  = padEndV(applyCyan(dateTime),                          dateWidth);
    const titleCol = padEndV(applyBold(truncate(event.title, titleWidth)), titleWidth);
    const locCol   = applyGray(truncate(event.location, locWidth));
    lines.push(`  ${dateCol}  ${titleCol}  ${locCol}`);
  }

  return lines.join('\n');
}

function renderSubscribeHint(): void {
  const icon = pickIcon('◆', '*');
  console.log(c.muted(`  ${icon} ${t().calendar.subscribeHint}: ${URLS.calendar}`));
}

async function showEventDetail(event: Event): Promise<void> {
  const trans = t();
  console.log();
  console.log(chalk.bold.cyan(`  ${event.title}`));
  console.log(c.muted(`  ${event.date}${event.time ? ' ' + event.time : ''}  ${pickIcon('·', '|')}  ${event.location}`));
  if (event.description) {
    console.log();
    for (const line of event.description.trim().split('\n')) {
      console.log(`  ${line}`);
    }
  } else {
    console.log(c.muted(`  ${trans.calendar.noDescription}`));
  }
  console.log();
}

/** Startup preview: auto-loads and displays upcoming events, then returns. */
export async function showEventsPreview(): Promise<void> {
  const trans = t();
  const s = createSpinner(trans.calendar.loading);
  try {
    const cal = await loadCalendarOrThrow();
    const events = cal.upcoming({ days: 30 }).map(toDisplayEvent);

    if (events.length === 0) {
      s.stop(trans.calendar.noEvents);
      console.log();
      return;
    }

    s.stop(`${events.length} ${trans.calendar.eventsFound}`);
    console.log();
    console.log(renderEventsTable(events.slice(0, 5), { color: !!process.stdout.isTTY }));
    console.log();
    renderSubscribeHint();
    console.log();
  } catch {
    s.error(trans.calendar.error);
    console.log();
  }
}

/** Past events: shows historical events from the last 30 days with detail selection. */
async function showPastEvents(): Promise<void> {
  const trans = t();
  const s = createSpinner(trans.calendar.pastLoading);
  try {
    const cal = await loadCalendarOrThrow();
    const events = cal.past({ days: 30 }).reverse().map(toDisplayEvent);

    if (events.length === 0) {
      s.stop(trans.calendar.noPastEvents);
      console.log();
      return;
    }

    s.stop(`${events.length} ${trans.calendar.eventsFound}`);
    console.log();
    console.log(renderEventsTable(events, { color: true }));
    console.log();

    const options = [
      ...events.map((e, i) => ({
        value: String(i),
        label: `${e.date}${e.time ? ' ' + e.time : ''}  ${e.title}`,
        hint: e.location,
      })),
      { value: '__back__', label: c.muted(trans.common.back) },
    ];

    const footer = menuFooter();
    const selected = await runMenu({ title: trans.calendar.viewPastDetail, options, footer });
    if (selected !== null && selected !== '__back__') {
      const event = events[Number.parseInt(selected, 10)];
      if (event) await showEventDetail(event);
    }
  } catch {
    s.error(trans.calendar.error);
    console.log(c.muted('  ' + trans.calendar.errorHint));
    console.log();
  }
}

/** Full interactive calendar: heatmap + event list + detail selection. */
export async function showCalendar(): Promise<void> {
  const trans = t();
  const s = createSpinner(trans.calendar.loading);
  try {
    const cal = await loadCalendarOrThrow();
    const events = cal.upcoming({ days: 30 }).map(toDisplayEvent);

    const now = new Date();
    const heatmapBuckets = cal.heatmap({
      start: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
      end: now,
      bucket: 'day',
    });

    if (events.length === 0) {
      s.stop(trans.calendar.noEvents);
      console.log();
      console.log(renderHeatmap(heatmapBuckets, now, { color: true }));
      console.log();
      return;
    }

    s.stop(`${events.length} ${trans.calendar.eventsFound}`);
    console.log();
    console.log(renderHeatmap(heatmapBuckets, now, { color: true }));
    console.log();
    console.log(renderEventsTable(events, { color: true }));
    console.log();
    renderSubscribeHint();
    console.log();

    const options = [
      ...events.map((e, i) => ({
        value: String(i),
        label: `${e.date}${e.time ? ' ' + e.time : ''}  ${e.title}`,
        hint: e.location,
      })),
      { value: '__past__', label: chalk.dim(trans.calendar.pastEvents) },
      { value: '__back__', label: c.muted(trans.common.back) },
    ];

    const footer = menuFooter();
    const selected = await runMenu({ title: trans.calendar.viewDetail, options, footer });
    if (selected === null || selected === '__back__') return;
    if (selected === '__past__') { await showPastEvents(); return; }
    const event = events[Number.parseInt(selected, 10)];
    if (event) await showEventDetail(event);
  } catch {
    s.error(trans.calendar.error);
    console.log(c.muted('  ' + trans.calendar.errorHint));
    console.log();
  }
}
