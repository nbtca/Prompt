import {
  fetchFeedConditional,
  parseCalendar,
  createCalendar,
  FeedFetchError,
  FeedParseError,
  eventToICS,
} from '@nbtca/nbtcal';
import type { Calendar, CalendarEvent, FeedValidators, HeatmapBucket } from '@nbtca/nbtcal';
import chalk from 'chalk';
import { c, type, space, glyph } from '../core/theme.js';
import { pickIcon } from '../core/icons.js';
import {
  padEndV,
  sanitizeTerminalLine,
  sanitizeTerminalText,
  truncate,
  visualWidth,
  wrapAnsiWithIndent,
  wrapAnsiToVisualWidth,
} from '../core/text.js';
import { t } from '../i18n/index.js';
import { localDayDifference } from '../core/calendar-day.js';
import {
  countdownParts,
  eventEnd,
  isCountdownUrgent,
  buildExportFilename,
  formatDuration,
  pastYearRange,
} from './calendar-query.js';
import { loadFeedCache, saveFeedCache, touchFeedCache } from './calendar-store.js';
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

const MEMO_TTL_MS = 5 * 60 * 1000;

let memo: { calendar: Calendar; validators: FeedValidators; fetchedAt: number } | undefined;
let inFlight: Promise<Calendar> | undefined;

function remember(text: string, validators: FeedValidators, fetchedAt: number): Calendar {
  memo = { calendar: createCalendar(parseCalendar(text)), validators, fetchedAt };
  return memo.calendar;
}

export function peekCalendar(): Calendar | undefined {
  if (memo) return memo.calendar;
  const cache = loadFeedCache();
  if (cache === null) return undefined;
  try {
    return remember(cache.text, cache.validators, 0);
  } catch {
    return undefined;
  }
}

async function refetchCalendar(signal?: AbortSignal): Promise<Calendar> {
  try {
    peekCalendar();
    const result = await fetchFeedConditional(undefined, {
      timeoutMs: 15000,
      ...(signal === undefined ? {} : { signal }),
      validators: memo?.validators ?? {},
    });
    if (result.status === 'modified') {
      const calendar = remember(result.text, result.validators, Date.now());
      saveFeedCache(result);
      return calendar;
    }
    if (!memo) throw new FeedFetchError('Feed request failed: HTTP 304');
    memo = { ...memo, validators: result.validators, fetchedAt: Date.now() };
    touchFeedCache(result.validators);
    return memo.calendar;
  } catch (err) {
    const detail = sanitizeTerminalLine(
      err instanceof FeedFetchError || err instanceof FeedParseError ? err.message : String(err),
    );
    throw new Error(`${t().calendar.error}: ${detail}`);
  }
}

export async function loadCalendarOrThrow(signal?: AbortSignal): Promise<Calendar> {
  if (memo && Date.now() - memo.fetchedAt < MEMO_TTL_MS) return memo.calendar;
  inFlight ??= refetchCalendar(signal).finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

export function toDisplayEvent(e: CalendarEvent): Event {
  const trans = t();
  return {
    date: formatDate(e.start),
    time: e.isAllDay ? '' : formatTime(e.start),
    title: sanitizeTerminalLine(e.title ?? trans.calendar.untitledEvent),
    location: sanitizeTerminalLine(e.location ?? trans.calendar.tbdLocation),
    description: sanitizeTerminalText(e.description ?? ''),
    startDate: e.start,
    recurring: e.recurring,
    uid: e.uid,
  };
}

export function eventTimeRange(e: CalendarEvent): string {
  const dash = pickIcon('–', '-');
  const startDate = formatDate(e.start);
  if (e.isAllDay) {
    const lastDay = new Date(eventEnd(e).getTime() - 1);
    const endDate = formatDate(lastDay);
    return endDate === startDate ? startDate : `${startDate} ${dash} ${endDate}`;
  }
  const start = `${startDate} ${formatTime(e.start)}`;
  if (!e.end || e.end <= e.start) return start;
  const endDate = formatDate(e.end);
  return endDate === startDate
    ? `${start}${dash}${formatTime(e.end)}`
    : `${start} ${dash} ${endDate} ${formatTime(e.end)}`;
}

export async function loadCalendarOrCache(
  signal?: AbortSignal,
): Promise<{ calendar: Calendar; stale: boolean }> {
  try {
    return { calendar: await loadCalendarOrThrow(signal), stale: false };
  } catch (err) {
    const cached = peekCalendar();
    if (!cached) throw err;
    return { calendar: cached, stale: true };
  }
}

export function yearHeatmap(calendar: Calendar, now: Date): HeatmapBucket[] {
  return calendar.heatmap({ ...pastYearRange(now), bucket: 'day' });
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

export function renderEventsTable(
  events: Event[],
  options?: { color?: boolean; width?: number },
): string {
  const trans = t();
  const useColor = options?.color !== false;
  const width =
    options?.width === undefined || !Number.isFinite(options.width)
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.floor(options.width));

  if (events.length === 0) {
    return wrapAnsiWithIndent(type.hint(trans.calendar.noEvents), width, space.indent).join('\n');
  }

  const id = (s: string) => s;
  const applyDim = useColor ? chalk.dim : id;
  const applyCyan = useColor ? chalk.cyan : id;
  const applyBold = useColor ? chalk.bold : id;
  const applyGray = useColor ? chalk.gray : id;

  if (width < 68) {
    const lines: string[] = [];
    for (const event of events) {
      if (lines.length > 0) lines.push('');
      const dateTime = event.time ? `${event.date} ${event.time}` : event.date;
      const marker = event.recurring ? `${pickIcon('↻', '~')} ` : '';
      lines.push(...wrapAnsiWithIndent(applyCyan(dateTime), width, space.indent));
      lines.push(...wrapAnsiWithIndent(applyBold(`${marker}${event.title}`), width, space.indent));
      lines.push(
        ...wrapAnsiWithIndent(
          applyGray(`${pickIcon('⌖', '@')} ${event.location}`),
          width,
          space.indent,
        ),
      );
    }
    return lines.join('\n');
  }

  const dateWidth = 16;
  const titleWidth = 32;
  const locWidth = 14;
  const sep = pickIcon('─', '-');

  const headerDate = padEndV(applyDim(trans.calendar.dateTime), dateWidth);
  const headerTitle = padEndV(applyDim(trans.calendar.eventName), titleWidth);
  const headerLoc = applyDim(trans.calendar.location);
  const divider = applyDim(sep.repeat(dateWidth + 2 + titleWidth + 2 + locWidth));

  const lines: string[] = [`  ${headerDate}  ${headerTitle}  ${headerLoc}`, `  ${divider}`];

  for (const event of events) {
    const dateTime = event.time ? `${event.date} ${event.time}` : event.date;
    const dateCol = padEndV(applyCyan(dateTime), dateWidth);
    const marker = event.recurring ? `${pickIcon('↻', '~')} ` : '';
    const titleText = truncate(`${marker}${event.title}`, titleWidth);
    const titleCol = padEndV(applyBold(titleText), titleWidth);
    const locCol = applyGray(truncate(event.location, locWidth));
    lines.push(`  ${dateCol}  ${titleCol}  ${locCol}`);
  }

  return lines.join('\n');
}

export type EventProximity = 'today' | 'tomorrow' | 'week' | 'later';

export function eventProximity(startDate: Date, now: Date): EventProximity {
  const days = localDayDifference(now, startDate);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 7) return 'week';
  return 'later';
}

const SOURCE_TAG = /^(\[[^\]]{1,16}\])(\s+)(?=\S)/;

function styleTitle(title: string, style: (value: string) => string): string {
  const match = SOURCE_TAG.exec(title);
  if (!match?.[1] || !match[2]) return style(title);
  return `${type.hint(match[1])}${match[2]}${style(title.slice(match[0].length))}`;
}

const TIME_COLUMN = ' 00:00'.length;

export function eventWhen(e: Event): string {
  return e.time ? `${e.date} ${e.time}` : padEndV(e.date, visualWidth(e.date) + TIME_COLUMN);
}

export function recurringMark(e: Event): string {
  return e.recurring ? ` ${pickIcon('↻', '~')}` : '';
}

function hangingLines(marker: string, content: string, cols: number): string[] {
  const width = Number.isFinite(cols) ? Math.max(1, Math.floor(cols)) : Number.POSITIVE_INFINITY;
  const prefixes = [`${space.indent}${marker} `, `${marker} `, marker, ''];
  const prefix = prefixes.find((candidate) => visualWidth(candidate) < width) ?? '';
  const continuation = ' '.repeat(visualWidth(prefix));
  const contentWidth = Math.max(1, width - visualWidth(prefix));
  return wrapAnsiToVisualWidth(content, contentWidth).map(
    (line, index) => `${index === 0 ? prefix : continuation}${line}`,
  );
}

export function renderEventBriefLines(
  e: Event,
  now: Date,
  cols = Number.POSITIVE_INFINITY,
): string[] {
  const dot = pickIcon('·', '-');
  const proximity = eventProximity(e.startDate, now);
  const dateStyle =
    proximity === 'today'
      ? type.active
      : proximity === 'tomorrow'
        ? c.brand
        : proximity === 'week'
          ? type.body
          : type.hint;
  const marker =
    proximity === 'today' ? type.active(pickIcon('●', '*')) : dateStyle(pickIcon('·', '-'));
  const titleStyled = styleTitle(e.title, proximity === 'today' ? type.active : type.body);
  const content = `${dateStyle(eventWhen(e))}  ${type.hint(dot)}  ${titleStyled}${type.hint(recurringMark(e))}`;
  return hangingLines(marker, content, cols);
}

export function renderEventBrief(e: Event, now: Date): string {
  return renderEventBriefLines(e, now)[0] ?? '';
}

export function renderCountdownBanner(
  event: Event | undefined,
  now: Date,
  cols = Number.POSITIVE_INFINITY,
): string {
  if (!event) return '';
  const trans = t();
  const p = countdownParts(event.startDate, now);
  const when = p.past
    ? trans.calendar.startingNow
    : `${trans.calendar.inPrefix} ${formatDuration(p)}`;
  const whenStyled = isCountdownUrgent(p) ? c.warn(when) : type.hint(when);
  const dot = pickIcon('·', '-');
  const content = `${type.label(trans.calendar.next)}  ${dot}  ${type.body(event.title)}  ${dot}  ${whenStyled}`;
  return hangingLines(type.active(glyph.dot()), content, cols).join('\n');
}

export function exportEventIcs(
  event: CalendarEvent,
  dir: string = process.cwd(),
): { ok: boolean; path: string; error?: string } {
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
