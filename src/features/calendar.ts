/**
 * Calendar module
 * Fetches and renders upcoming events with Unicode box table.
 * Data layer powered by @nbtca/nbtcal.
 */

import { loadCalendar, FeedFetchError, FeedParseError } from '@nbtca/nbtcal';
import type { Calendar, CalendarEvent, HeatmapBucket } from '@nbtca/nbtcal';
import chalk from 'chalk';
import { select, isCancel } from '@clack/prompts';
import { info, createSpinner } from '../core/ui.js';
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

/**
 * Load the calendar, wrapping errors with a localized message.
 */
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

/**
 * Map a nbtcal CalendarEvent to prompt's Event type.
 */
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

/**
 * Fetch upcoming events (next 30 days), including recurring occurrences.
 */
export async function fetchEvents(): Promise<Event[]> {
  return (await loadCalendarOrThrow()).upcoming({ days: 30 }).map(toDisplayEvent);
}

/**
 * Fetch trailing-year heatmap buckets.
 */
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

/**
 * Render events as a Unicode box-drawing table
 */
export function renderEventsTable(events: Event[], options?: { color?: boolean }): string {
  const trans = t();
  const color = options?.color !== false;

  if (events.length === 0) return trans.calendar.noEvents;

  const dateWidth     = 16;
  const titleWidth    = 30;
  const locationWidth = 16;

  const h = pickIcon('─', '-');
  const v = pickIcon('│', '|');
  const topLeft = pickIcon('┌', '+');
  const topMid = pickIcon('┬', '+');
  const topRight = pickIcon('┐', '+');
  const midLeft = pickIcon('├', '+');
  const midMid = pickIcon('┼', '+');
  const midRight = pickIcon('┤', '+');
  const bottomLeft = pickIcon('└', '+');
  const bottomMid = pickIcon('┴', '+');
  const bottomRight = pickIcon('┘', '+');

  const top = `${topLeft}${h.repeat(dateWidth + 2)}${topMid}${h.repeat(titleWidth + 2)}${topMid}${h.repeat(locationWidth + 2)}${topRight}`;
  const divider = `${midLeft}${h.repeat(dateWidth + 2)}${midMid}${h.repeat(titleWidth + 2)}${midMid}${h.repeat(locationWidth + 2)}${midRight}`;
  const bottom = `${bottomLeft}${h.repeat(dateWidth + 2)}${bottomMid}${h.repeat(titleWidth + 2)}${bottomMid}${h.repeat(locationWidth + 2)}${bottomRight}`;
  const headerRow =
    `${v} ${padEndV(trans.calendar.dateTime, dateWidth)} ${v} ${padEndV(trans.calendar.eventName, titleWidth)} ${v} ${padEndV(trans.calendar.location, locationWidth)} ${v}`;

  // Formatters are identity functions when color is off — one loop, no duplication
  const id   = (s: string) => s;
  const dim  = color ? chalk.dim   : id;
  const bold = color ? chalk.bold  : id;
  const fmtDate  = color ? chalk.cyan  : id;
  const fmtTitle = color ? chalk.white : id;
  const fmtLoc   = color ? chalk.gray  : id;

  const lines = [dim(top), bold(headerRow), dim(divider)];

  for (const event of events) {
    const dateTime = `${event.date} ${event.time}`;
    const title    = truncate(event.title, titleWidth);
    const location = truncate(event.location, locationWidth);
    lines.push(
      `${v} ${fmtDate(padEndV(dateTime, dateWidth))} ${v} ${fmtTitle(padEndV(title, titleWidth))} ${v} ${fmtLoc(padEndV(location, locationWidth))} ${v}`
    );
  }

  lines.push(dim(bottom));
  return lines.join('\n');
}

function displayEvents(events: Event[]): void {
  if (events.length === 0) {
    info(t().calendar.noEvents);
    return;
  }

  console.log();
  console.log(renderEventsTable(events, { color: true }));
  console.log(chalk.dim(`  ${pickIcon('📅', '[ical]')} ${t().calendar.subscribeHint}: ${URLS.calendar}`));
  console.log();
}

async function showEventDetail(event: Event): Promise<void> {
  const trans = t();
  console.log();
  console.log(chalk.bold.cyan(`  ${event.title}`));
  console.log(chalk.dim(`  ${event.date} ${event.time}  ${pickIcon('·', '|')}  ${event.location}`));
  if (event.description) {
    console.log();
    const lines = event.description.trim().split('\n');
    for (const line of lines) {
      console.log(chalk.white(`  ${line}`));
    }
  } else {
    console.log(chalk.dim(`  ${trans.calendar.noDescription}`));
  }
  console.log();
}

export async function showCalendar(): Promise<void> {
  const trans = t();
  const s = createSpinner(trans.calendar.loading);
  try {
    const cal = await loadCalendarOrThrow();
    const events = cal.upcoming({ days: 30 }).map(toDisplayEvent);
    s.stop(`${events.length} ${trans.calendar.eventsFound}`);

    // Render heatmap header
    const now = new Date();
    const heatmapBuckets = cal.heatmap({
      start: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
      end: now,
      bucket: 'day',
    });
    console.log();
    console.log(renderHeatmap(heatmapBuckets, now, { color: true }));

    displayEvents(events);

    if (events.length > 0) {
      const options = [
        ...events.map((e, i) => ({
          value: String(i),
          label: `${e.date} ${e.time}  ${e.title}`,
          hint: e.location,
        })),
        { value: '__back__', label: chalk.dim(trans.common.back) },
      ];

      const selected = await select({
        message: trans.calendar.viewDetail,
        options,
      });

      if (!isCancel(selected) && selected !== '__back__') {
        const idx = Number.parseInt(selected, 10);
        const event = events[idx];
        if (event) await showEventDetail(event);
      }
    }
  } catch {
    s.error(trans.calendar.error);
    console.log(chalk.gray('  ' + trans.calendar.errorHint));
    console.log();
  }
}
