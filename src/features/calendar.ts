/**
 * ICS calendar module
 * Fetches and renders upcoming events.
 */

import axios from 'axios';
import ICAL from 'ical.js';
import chalk from 'chalk';
import { error, info, printDivider } from '../core/ui.js';
import { t } from '../i18n/index.js';

export interface Event {
  date: string;
  time: string;
  title: string;
  location: string;
  startDate: Date;
}

export interface EventOutputItem {
  date: string;
  time: string;
  title: string;
  location: string;
  startDateISO: string;
}

export async function fetchEvents(): Promise<Event[]> {
  try {
    const response = await axios.get('https://ical.nbtca.space', {
      timeout: 5000,
      headers: {
        'User-Agent': 'NBTCA-CLI/2.3.1'
      }
    });

    const jcalData = ICAL.parse(response.data);
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
        const untitledEvent = trans.calendar.eventName === 'Event Name' ? 'Untitled Event' : '未命名活动';
        const tbdLocation = trans.calendar.location === 'Location' ? 'TBD' : '待定';

        events.push({
          date: formatDate(startDate),
          time: formatTime(startDate),
          title: event.summary || untitledEvent,
          location: event.location || tbdLocation,
          startDate
        });
      }
    }

    events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    return events;
  } catch {
    throw new Error(t().calendar.error);
  }
}

export function serializeEvents(events: Event[]): EventOutputItem[] {
  return events.map((event) => ({
    date: event.date,
    time: event.time,
    title: event.title,
    location: event.location,
    startDateISO: event.startDate.toISOString()
  }));
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day}`;
}

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function renderEventsTable(events: Event[], options?: { color?: boolean }): string {
  const trans = t();
  const color = options?.color !== false;

  if (events.length === 0) {
    return trans.calendar.noEvents;
  }

  const dateWidth = 14;
  const titleWidth = 32;
  const locationWidth = 20;

  const lines: string[] = [];
  lines.push(`${trans.calendar.title} ${trans.calendar.subtitle}`);
  lines.push(
    `${trans.calendar.dateTime.padEnd(dateWidth)}${trans.calendar.eventName.padEnd(titleWidth)}${trans.calendar.location}`
  );
  lines.push('-'.repeat(Math.min((process.stdout.columns || 80), 80)));

  for (const event of events) {
    const dateTime = `${event.date} ${event.time}`.padEnd(dateWidth);
    const title = truncate(event.title, titleWidth - 1).padEnd(titleWidth);
    const location = truncate(event.location, locationWidth);

    if (color) {
      lines.push(chalk.cyan(dateTime) + chalk.white(title) + chalk.gray(location));
    } else {
      lines.push(dateTime + title + location);
    }
  }

  if (color) {
    lines[0] = chalk.cyan.bold(lines[0]!);
    lines[1] = chalk.bold(lines[1]!);
  }

  return lines.join('\n');
}

export function displayEvents(events: Event[]): void {
  if (events.length === 0) {
    info(t().calendar.noEvents);
    return;
  }

  console.log();
  console.log(renderEventsTable(events, { color: true }));
  printDivider();
  console.log();
}

export async function showCalendar(): Promise<void> {
  const trans = t();
  try {
    info(trans.calendar.loading);
    const events = await fetchEvents();
    console.log('\r' + ' '.repeat(60) + '\r');
    displayEvents(events);
  } catch {
    error(trans.calendar.error);
    console.log(chalk.gray('  ' + trans.calendar.errorHint));
    console.log();
  }
}
