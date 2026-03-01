/**
 * ICS calendar module
 * Fetches and renders upcoming events with Unicode box table.
 */

import axios from 'axios';
import ICAL from 'ical.js';
import chalk from 'chalk';
import { info, printDivider, createSpinner } from '../core/ui.js';
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

/** Visual column width: CJK characters count as 2, everything else as 1. */
function visualWidth(str: string): number {
  let w = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0) ?? 0;
    w += (
      (cp >= 0x1100 && cp <= 0x115F) ||  // Hangul Jamo
      (cp >= 0x2E80 && cp <= 0x303F) ||  // CJK Radicals / Kangxi
      (cp >= 0x3040 && cp <= 0x33FF) ||  // Japanese kana + CJK symbols
      (cp >= 0x3400 && cp <= 0x4DBF) ||  // CJK Extension A
      (cp >= 0x4E00 && cp <= 0x9FFF) ||  // CJK Unified Ideographs
      (cp >= 0xAC00 && cp <= 0xD7AF) ||  // Hangul Syllables
      (cp >= 0xF900 && cp <= 0xFAFF) ||  // CJK Compatibility Ideographs
      (cp >= 0xFE30 && cp <= 0xFE4F) ||  // CJK Compatibility Forms
      (cp >= 0xFF00 && cp <= 0xFF60) ||  // Fullwidth Forms
      (cp >= 0xFFE0 && cp <= 0xFFE6)     // Fullwidth Signs
    ) ? 2 : 1;
  }
  return w;
}

/** Pad string to visual width (CJK-aware). */
function padEndV(str: string, width: number): string {
  const pad = width - visualWidth(str);
  return pad > 0 ? str + ' '.repeat(pad) : str;
}

/** Truncate string to visual width limit (CJK-aware). */
function truncate(str: string, maxWidth: number): string {
  if (visualWidth(str) <= maxWidth) return str;
  let w = 0;
  let i = 0;
  for (const ch of str) {
    const cw = (visualWidth(ch) === 2) ? 2 : 1;
    if (w + cw > maxWidth - 3) break;
    w += cw;
    i += ch.length;
  }
  return str.slice(0, i) + '...';
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

/**
 * Render events as a Unicode box-drawing table
 */
export function renderEventsTable(events: Event[], options?: { color?: boolean }): string {
  const trans = t();
  const color = options?.color !== false;

  if (events.length === 0) {
    return trans.calendar.noEvents;
  }

  const dateWidth = 13;
  const titleWidth = 30;
  const locationWidth = 16;

  const top     = `┌${'─'.repeat(dateWidth + 2)}┬${'─'.repeat(titleWidth + 2)}┬${'─'.repeat(locationWidth + 2)}┐`;
  const divider = `├${'─'.repeat(dateWidth + 2)}┼${'─'.repeat(titleWidth + 2)}┼${'─'.repeat(locationWidth + 2)}┤`;
  const bottom  = `└${'─'.repeat(dateWidth + 2)}┴${'─'.repeat(titleWidth + 2)}┴${'─'.repeat(locationWidth + 2)}┘`;

  const headerRow =
    `│ ${padEndV(trans.calendar.dateTime, dateWidth)} │ ${padEndV(trans.calendar.eventName, titleWidth)} │ ${padEndV(trans.calendar.location, locationWidth)} │`;

  const lines: string[] = [];

  if (color) {
    lines.push(chalk.dim(top));
    lines.push(chalk.bold(headerRow));
    lines.push(chalk.dim(divider));

    for (const event of events) {
      const dateTime = `${event.date} ${event.time}`;
      const title    = truncate(event.title, titleWidth);
      const location = truncate(event.location, locationWidth);
      lines.push(
        `│ ${chalk.cyan(padEndV(dateTime, dateWidth))} │ ${chalk.white(padEndV(title, titleWidth))} │ ${chalk.gray(padEndV(location, locationWidth))} │`
      );
    }

    lines.push(chalk.dim(bottom));
  } else {
    lines.push(top);
    lines.push(headerRow);
    lines.push(divider);

    for (const event of events) {
      const dateTime = `${event.date} ${event.time}`;
      lines.push(
        `│ ${padEndV(dateTime, dateWidth)} │ ${padEndV(truncate(event.title, titleWidth), titleWidth)} │ ${padEndV(truncate(event.location, locationWidth), locationWidth)} │`
      );
    }

    lines.push(bottom);
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
  const s = createSpinner(trans.calendar.loading);
  try {
    const events = await fetchEvents();
    s.stop(`${events.length} ${trans.calendar.eventsFound}`);
    displayEvents(events);
  } catch {
    s.error(trans.calendar.error);
    console.log(chalk.gray('  ' + trans.calendar.errorHint));
    console.log();
  }
}
