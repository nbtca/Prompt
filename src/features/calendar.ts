import { loadCalendar, FeedFetchError, FeedParseError, eventToICS } from '@nbtca/nbtcal';
import type { Calendar, CalendarEvent, HeatmapBucket } from '@nbtca/nbtcal';
import chalk from 'chalk';
import { createSpinner, success, error } from '../core/ui.js';
import { c, type, space, glyph } from '../core/theme.js';
import { runMenu, menuFooter } from '../core/components/menu.js';
import { runTextInput } from '../core/components/text-input.js';
import { pickIcon } from '../core/icons.js';
import { padEndV, truncate } from '../core/text.js';
import { t } from '../i18n/index.js';
import { enterScreen, breadcrumb } from '../core/transitions.js';
import { URLS } from '../config/data.js';
import { renderHeatmap } from './calendar-heatmap.js';
import { countdownParts, buildExportFilename, weekRange, monthRange, filterEvents } from './calendar-query.js';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface Event {
  date: string;
  time: string;
  title: string;
  location: string;
  description: string;
  startDate: Date;
  recurring: boolean;
  uid: string;
}

export interface EventOutputItem {
  date: string;
  time: string;
  title: string;
  location: string;
  description: string;
  startDateISO: string;
  recurring: boolean;
  uid: string;
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
    recurring: e.recurring,
    uid: e.uid,
  };
}

export async function fetchEvents(): Promise<Event[]> {
  return (await loadCalendarOrThrow()).upcoming({ days: 30 }).map(toDisplayEvent);
}

export async function fetchInRange(start: Date, end: Date): Promise<Event[]> {
  return (await loadCalendarOrThrow()).inRange(start, end).map(toDisplayEvent);
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
    recurring: event.recurring,
    uid: event.uid,
  }));
}

export function renderEventsTable(events: Event[], options?: { color?: boolean }): string {
  const trans = t();
  const useColor = options?.color !== false;

  if (events.length === 0) return `${space.indent}${type.hint(trans.calendar.noEvents)}`;

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
    const marker = event.recurring ? `${pickIcon('↻', '~')} ` : '';
    const titleText = truncate(`${marker}${event.title}`, titleWidth);
    const titleCol = padEndV(applyBold(titleText), titleWidth);
    const locCol   = applyGray(truncate(event.location, locWidth));
    lines.push(`  ${dateCol}  ${titleCol}  ${locCol}`);
  }

  return lines.join('\n');
}

export function renderCountdownBanner(event: Event | undefined, now: Date): string {
  if (!event) return '';
  const trans = t();
  const p = countdownParts(event.startDate, now);
  const inp = trans.calendar.inPrefix;
  const when = p.past
    ? trans.calendar.startingNow
    : p.days > 0
      ? `${inp} ${p.days}d ${p.hours}h`
      : p.hours > 0
        ? `${inp} ${p.hours}h ${p.minutes}m`
        : `${inp} ${p.minutes}m`;
  const dot = pickIcon('·', '-');
  return `${space.indent}${type.heading(glyph.cursor())} ${type.label(trans.calendar.next)}  ${dot}  ${type.body(event.title)}  ${dot}  ${type.hint(when)}`;
}

function renderSubscribeHint(): void {
  const icon = pickIcon('◆', '*');
  console.log(c.muted(`  ${icon} ${t().calendar.subscribeHint}: ${URLS.calendar}`));
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

/** Full interactive calendar hub: countdown + heatmap + a menu of range/search/past views. */
export async function showCalendar(): Promise<void> {
  const trans = t();
  await enterScreen(breadcrumb(trans.menu.events));
  const spinner = createSpinner(trans.calendar.loading);
  let cal: Calendar;
  try {
    cal = await loadCalendarOrThrow();
    spinner.stop();
  } catch {
    spinner.error(trans.calendar.error);
    console.log(c.muted('  ' + trans.calendar.errorHint));
    console.log();
    return;
  }

  const now = new Date();
  const upcoming = cal.upcoming({ days: 30 });
  console.log();
  console.log(renderCountdownBanner(upcoming[0] ? toDisplayEvent(upcoming[0]) : undefined, now));
  console.log();
  console.log(renderHeatmap(cal.heatmap({ start: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000), end: now, bucket: 'day' }), now, { color: true }));
  console.log();

  while (true) {
    const action = await runMenu({
      title: trans.calendar.viewDetail,
      options: [
        { value: 'upcoming', label: trans.menu.events, hint: String(upcoming.length) },
        { value: 'week',     label: trans.calendar.thisWeek },
        { value: 'month',    label: trans.calendar.thisMonth },
        { value: 'search',   label: trans.calendar.search },
        { value: 'past',     label: trans.calendar.pastEvents },
      ],
      footer: menuFooter(),
    });
    if (action === null) return;
    if (action === 'upcoming') await showEventList(upcoming, trans.menu.events);
    else if (action === 'week')  { const r = weekRange(now);  await showEventList(cal.inRange(r.start, r.end), trans.calendar.thisWeek); }
    else if (action === 'month') { const r = monthRange(now); await showEventList(cal.inRange(r.start, r.end), trans.calendar.thisMonth); }
    else if (action === 'search') await showSearch(cal);
    else if (action === 'past')  await showEventList(cal.past({ days: 30 }).reverse(), trans.calendar.pastEvents);
  }
}

async function showEventList(events: CalendarEvent[], title: string): Promise<void> {
  const trans = t();
  if (events.length === 0) {
    console.log(`${space.indent}${type.hint(trans.calendar.noEvents)}`);
    console.log();
    return;
  }
  const display = events.map(toDisplayEvent);
  console.log();
  console.log(renderEventsTable(display, { color: true }));
  console.log();
  const selected = await runMenu({
    title,
    options: events.map((_e, i) => ({
      value: String(i),
      label: `${display[i]!.date}${display[i]!.time ? ' ' + display[i]!.time : ''}  ${display[i]!.title}`,
      hint: display[i]!.location,
    })),
    footer: menuFooter(),
  });
  if (selected === null) return;
  const raw = events[Number.parseInt(selected, 10)];
  if (raw) await showEventDetailRaw(raw);
}

async function showEventDetailRaw(raw: CalendarEvent): Promise<void> {
  const trans = t();
  const e = toDisplayEvent(raw);
  console.log();
  console.log(chalk.bold.cyan(`  ${e.title}`));
  console.log(c.muted(`  ${e.date}${e.time ? ' ' + e.time : ''}  ${pickIcon('·', '|')}  ${e.location}`));
  if (raw.recurring) console.log(c.muted(`  ${pickIcon('↻', '~')} ${trans.calendar.recurringLabel}`));
  if (e.description) { console.log(); for (const line of e.description.trim().split('\n')) console.log(`  ${line}`); }
  else console.log(c.muted(`  ${trans.calendar.noDescription}`));
  console.log();

  const action = await runMenu({
    title: e.title,
    options: [{ value: 'export', label: trans.calendar.exportIcs }],
    footer: menuFooter(),
  });
  if (action === 'export') {
    const res = exportEventIcs(raw);
    if (res.ok) success(`${trans.calendar.exportSuccess}: ${res.path}`);
    else error(`${trans.calendar.exportError}: ${res.error ?? ''}`);
  }
}

async function showSearch(cal: Calendar): Promise<void> {
  const trans = t();
  const query = await runTextInput({ message: trans.calendar.searchPrompt, placeholder: trans.calendar.searchPlaceholder });
  if (query === null || !query.trim()) return;
  const now = new Date();
  const pool = cal.inRange(now, new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000));
  const results = filterEvents(pool, query);
  if (results.length === 0) {
    console.log(`${space.indent}${type.hint(trans.calendar.searchNoResults)}`);
    console.log();
    return;
  }
  await showEventList(results, `${trans.calendar.search}: ${query.trim()}`);
}

export function exportEventIcs(event: CalendarEvent, dir: string = process.cwd()): { ok: boolean; path: string; error?: string } {
  const base = buildExportFilename(event);
  let path = join(dir, base);
  try {
    let n = 1;
    while (existsSync(path)) {
      path = join(dir, base.replace(/\.ics$/, `-${n}.ics`));
      n++;
    }
    writeFileSync(path, eventToICS(event), 'utf-8');
    return { ok: true, path };
  } catch (err) {
    return { ok: false, path, error: err instanceof Error ? err.message : String(err) };
  }
}
