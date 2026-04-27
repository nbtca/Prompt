/**
 * ICS calendar module
 * Fetches and renders upcoming events with Unicode box table.
 */

import ICAL from 'ical.js';
import chalk from 'chalk';
import { select, isCancel } from '@clack/prompts';
import { info, createSpinner } from '../core/ui.js';
import { pickIcon } from '../core/icons.js';
import { padEndV, truncate } from '../core/text.js';
import { t } from '../i18n/index.js';
import { APP_INFO, URLS } from '../config/data.js';

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

export async function fetchEvents(): Promise<Event[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch('https://ical.nbtca.space', {
      signal: controller.signal,
      headers: { 'User-Agent': `NBTCA-CLI/${APP_INFO.version}` },
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.text();

    const jcalData = ICAL.parse(data);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    const events: Event[] = [];
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent);
      const startDate = event.startDate.toJSDate();

      if (startDate >= now && startDate <= thirtyDaysLater) {
        const trans = t();
        const untitledEvent = trans.calendar.untitledEvent;
        const tbdLocation = trans.calendar.tbdLocation;

        events.push({
          date: formatDate(startDate),
          time: formatTime(startDate),
          title: event.summary || untitledEvent,
          location: event.location || tbdLocation,
          description: event.description || '',
          startDate
        });
      }
    }

    events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    return events;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${t().calendar.error}: ${detail}`);
  }
}

export function serializeEvents(events: Event[]): EventOutputItem[] {
  return events.map((event) => ({
    date: event.date,
    time: event.time,
    title: event.title,
    location: event.location,
    description: event.description,
    startDateISO: event.startDate.toISOString()
  }));
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
    const events = await fetchEvents();
    s.stop(`${events.length} ${trans.calendar.eventsFound}`);
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
