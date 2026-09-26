import type {
  Timetable,
  TimetableMeeting,
  TimetableOccurrence,
  TimetablePeriod,
  TimetableUnresolvedItem,
  Weekday,
} from '@nbtca/nbtcal/timetable';
import { campusDateTime, campusIsoDate, createTimetableSchedule } from '@nbtca/nbtcal/timetable';
import { countdownParts, isCountdownUrgent, type Countdown } from './calendar-query.js';
import { c, type, space, glyph, MAX_FRAME_COLS } from '../core/theme.js';
import { pickIcon } from '../core/icons.js';
import { padEndV, truncate, visualWidth, wrapAnsiToVisualWidth } from '../core/text.js';
import { addLocalDays, parseLocalMonday } from '../core/calendar-day.js';
import { t, fmt, getCurrentLanguage, type Language } from '../i18n/index.js';

const ellipsis = (): string => pickIcon('…', '...');

function clip(text: string, width: number): string {
  return truncate(text, width, ellipsis());
}

export function formatClassCountdown(p: Countdown): string {
  const trans = t().timetable;
  if (p.past) return trans.nowLabel;
  const values = { days: String(p.days), hours: String(p.hours), minutes: String(p.minutes) };
  if (p.days > 0) return fmt(trans.countdownDays, values);
  if (p.hours > 0) return fmt(trans.countdownHours, values);
  return fmt(trans.countdownMinutes, values);
}

function formatMinutesLeft(end: Date, now: Date): string {
  const p = countdownParts(end, now);
  const minutes = p.days * 1440 + p.hours * 60 + p.minutes;
  return fmt(t().timetable.minutesRemaining, { minutes: String(minutes) });
}

function span(m: TimetableMeeting, periods: readonly TimetablePeriod[]): string {
  const s = periods.find((p) => p.period === m.startPeriod)?.start ?? '';
  const e = periods.find((p) => p.period === m.endPeriod)?.end ?? '';
  return e ? `${s}${pickIcon('–', '-')}${e}` : s;
}

export function renderNextClassBanner(
  next: Pick<TimetableOccurrence, 'meeting' | 'start'> | null,
  now: Date,
  cols = Number.POSITIVE_INFINITY,
  labelled = true,
): string {
  const trans = t();
  if (!next) return '';
  const p = countdownParts(next.start, now);
  const when = formatClassCountdown(p);
  const styleWhen = isCountdownUrgent(p) ? c.warn : type.hint;
  const whenStyled = styleWhen(when);
  const dot = pickIcon('·', '-');
  const marker = type.active(glyph.cursor());
  const separator = `  ${dot}  `;
  const detailedPrefix = labelled
    ? `${space.indent}${marker} ${type.label(trans.timetable.nextClass)}${separator}`
    : `${space.indent}${marker} `;
  const suffix = `${separator}${whenStyled}`;
  const courseName = next.meeting.courseName;
  const location = next.meeting.location ? `${separator}${next.meeting.location}` : '';
  const full = `${detailedPrefix}${type.body(courseName)}${location}${suffix}`;
  if (!Number.isFinite(cols) || visualWidth(full) <= cols) return full;

  const withoutLocation = `${detailedPrefix}${type.body(courseName)}${suffix}`;
  if (visualWidth(withoutLocation) <= cols) return withoutLocation;

  const prefixes = [detailedPrefix, `${space.indent}${marker} `, `${marker} `];
  for (const prefix of prefixes) {
    const courseWidth = Math.floor(cols - visualWidth(prefix) - visualWidth(suffix));
    if (courseWidth < 3) continue;
    return `${prefix}${type.body(clip(courseName, courseWidth))}${suffix}`;
  }

  const countdownOnly = [
    `${space.indent}${marker} ${whenStyled}`,
    `${marker} ${whenStyled}`,
    whenStyled,
  ].find((candidate) => visualWidth(candidate) <= cols);
  if (countdownOnly) return countdownOnly;

  const whenWidth = Math.max(0, Math.floor(cols));
  if (whenWidth === 0) return '';
  if (whenWidth >= 3) return styleWhen(clip(when, whenWidth));
  let compactWhen = '';
  for (const char of when) {
    if (visualWidth(compactWhen + char) > whenWidth) break;
    compactWhen += char;
  }
  return styleWhen(compactWhen);
}

export function weekdayShortLabel(wd: number): string {
  const trans = t();
  const labels = [
    trans.timetable.weekdayMon,
    trans.timetable.weekdayTue,
    trans.timetable.weekdayWed,
    trans.timetable.weekdayThu,
    trans.timetable.weekdayFri,
    trans.timetable.weekdaySat,
    trans.timetable.weekdaySun,
  ];
  return labels[wd - 1] ?? '';
}

function weekdayLongLabel(wd: number): string {
  return new Intl.DateTimeFormat(getCurrentLanguage() === 'zh' ? 'zh-CN' : 'en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(Date.UTC(2024, 0, wd));
}

export function lineBudget(cols: number): number {
  return Number.isFinite(cols)
    ? Math.max(1, Math.min(Math.floor(cols), MAX_FRAME_COLS) - visualWidth(space.indent))
    : Number.POSITIVE_INFINITY;
}

interface TimelineDay {
  weekday: number;
  isToday: boolean;
}

function renderTimeline(
  meetings: readonly TimetableMeeting[],
  periods: readonly TimetablePeriod[],
  now: Date,
  day: TimelineDay,
  alwaysShowLocation: boolean,
  cursorPeriod?: number,
  cols = Number.POSITIVE_INFINITY,
): string {
  const trans = t();
  const width = lineBudget(cols);
  const fits = (line: string): boolean => visualWidth(line) <= width;
  const sorted = [...meetings].sort((a, b) => a.startPeriod - b.startPeriod);
  if (sorted.length === 0) {
    const empty = day.isToday
      ? trans.timetable.noClassToday
      : fmt(trans.timetable.noClassOnDay, { weekday: weekdayLongLabel(day.weekday) });
    return `${space.indent}${type.hint(empty)}`;
  }

  const today = campusIsoDate(now);
  const minute = Math.floor(now.getTime() / 60_000) * 60_000;
  const dot = pickIcon('·', '-');
  const rule = pickIcon('─', '-');
  const midConnector = pickIcon('┼', '+');
  const topConnector = pickIcon('┬', '+');
  const bottomConnector = pickIcon('┴', '+');

  const lines = sorted.map((m, i) => {
    const startStr = periods.find((p) => p.period === m.startPeriod)?.start ?? '00:00';
    const endStr = periods.find((p) => p.period === m.endPeriod)?.end ?? '23:59';
    const end = campusDateTime(today, endStr);
    const isLive =
      day.isToday && campusDateTime(today, startStr).getTime() <= minute && minute <= end.getTime();
    const isDone = day.isToday && minute > end.getTime();
    const isCursor =
      cursorPeriod !== undefined && m.startPeriod <= cursorPeriod && cursorPeriod <= m.endPeriod;
    const connector = i === 0 ? topConnector : midConnector;
    const marker = isLive ? type.active(pickIcon('▶', '>')) : ' ';
    const timeCol = `${marker}${type.hint(startStr)} ${rule}${connector}${rule}`;
    const styleName = (name: string): string =>
      isLive ? type.active(name) : isDone ? type.hint(name) : type.body(name);

    const minutesLeft = isLive ? formatMinutesLeft(end, now) : '';
    const statusText = isDone
      ? trans.timetable.classDone
      : isLive
        ? `${trans.timetable.classLive}  ${dot}  ${minutesLeft}`
        : '';
    const compactStatusText = isDone ? trans.timetable.classDone : minutesLeft;
    const showLoc = alwaysShowLocation ? Boolean(m.location) : isLive && Boolean(m.location);
    const locationText = showLoc ? (m.location ?? '') : '';
    const renderLine = (
      name: string,
      status: string,
      location: string,
      currentTimeCol = timeCol,
      indent: string = space.indent,
    ): string => {
      const statusCol = status ? `   ${type.hint(status)}` : '';
      const locationCol = location ? `   ${type.hint(location)}` : '';
      const content = `${currentTimeCol} ${styleName(name)}${statusCol}${locationCol}`;
      return `${indent}${isCursor ? type.cursor(content) : content}`;
    };

    const whole = [
      renderLine(m.courseName, statusText, locationText),
      renderLine(m.courseName, statusText, ''),
      renderLine(m.courseName, compactStatusText, ''),
    ].find(fits);
    if (whole) return whole;

    for (const status of compactStatusText ? [compactStatusText, ''] : ['']) {
      const courseWidth = Math.floor(width - visualWidth(renderLine('', status, '')));
      if (courseWidth <= visualWidth(ellipsis())) continue;
      return renderLine(clip(m.courseName, courseWidth), status, '');
    }

    const compactTimeCol = `${marker}${type.hint(startStr)}`;
    for (const indent of [space.indent, '']) {
      const courseWidth = Math.floor(
        width - visualWidth(renderLine('', '', '', compactTimeCol, indent)),
      );
      if (courseWidth <= visualWidth(ellipsis())) continue;
      return renderLine(clip(m.courseName, courseWidth), '', '', compactTimeCol, indent);
    }

    const timeOnly = [`${space.indent}${compactTimeCol}`, compactTimeCol, type.hint(startStr)].find(
      fits,
    );
    if (timeOnly) return timeOnly;
    return type.hint(startStr.slice(0, Math.max(0, Math.floor(width))));
  });

  const last = sorted.at(-1);
  if (!last) return lines.join('\n');
  const lastEnd = periods.find((p) => p.period === last.endPeriod)?.end ?? '23:59';
  const endLine = [
    `${space.indent} ${type.hint(lastEnd)} ${rule}${bottomConnector}${rule} ${type.hint(trans.timetable.timelineEnd)}`,
    `${space.indent}${type.hint(lastEnd)} ${rule}${bottomConnector}${rule}`,
    `${space.indent}${type.hint(lastEnd)}`,
    type.hint(lastEnd),
  ].find(fits);
  lines.push(endLine ?? type.hint(lastEnd.slice(0, Math.max(0, Math.floor(width)))));

  return lines.join('\n');
}

export function renderTodayTimeline(
  meetings: readonly TimetableMeeting[],
  periods: readonly TimetablePeriod[],
  now: Date,
  cols = Number.POSITIVE_INFINITY,
): string {
  return renderTimeline(
    meetings,
    periods,
    now,
    { weekday: 0, isToday: true },
    false,
    undefined,
    cols,
  );
}

export function renderDayTimeline(
  meetings: readonly TimetableMeeting[],
  periods: readonly TimetablePeriod[],
  now: Date,
  day: TimelineDay,
  cursorPeriod?: number,
  cols = Number.POSITIVE_INFINITY,
): string {
  return renderTimeline(meetings, periods, now, day, true, cursorPeriod, cols);
}

export function renderDaySwitcher(
  selectedWeekday: number,
  todayWeekday: number,
  cols = Number.POSITIVE_INFINITY,
): string {
  const leftArrow = pickIcon('←', '<');
  const rightArrow = pickIcon('→', '>');
  const todayMark = pickIcon('•', '*');
  const selectedIndex = Math.max(0, Math.min(WEEKDAY_KEYS.length - 1, selectedWeekday - 1));
  const labels = WEEKDAY_KEYS.map((_, i) => {
    const wd = i + 1;
    const label = `${weekdayShortLabel(wd)}${wd === todayWeekday ? todayMark : ''}`;
    if (wd === selectedWeekday) return type.cursor(`[${label}]`);
    return type.hint(label);
  });
  const renderRange = (start: number, end: number): string =>
    `${space.indent}${type.hint(leftArrow)}  ${labels.slice(start, end).join('   ')}  ${type.hint(rightArrow)}`;
  const full = renderRange(0, labels.length);
  if (!Number.isFinite(cols) || visualWidth(full) <= cols) return full;

  let best: { start: number; end: number; count: number; imbalance: number } | undefined;
  for (let start = 0; start <= selectedIndex; start += 1) {
    for (let end = selectedIndex + 1; end <= labels.length; end += 1) {
      if (visualWidth(renderRange(start, end)) > cols) continue;
      const count = end - start;
      const imbalance = Math.abs(selectedIndex - start - (end - selectedIndex - 1));
      if (!best || count > best.count || (count === best.count && imbalance < best.imbalance)) {
        best = { start, end, count, imbalance };
      }
    }
  }
  if (best) return renderRange(best.start, best.end);

  const selected = labels[selectedIndex] ?? '';
  const selectedOnly = `${space.indent}${selected}`;
  return visualWidth(selectedOnly) <= cols ? selectedOnly : selected;
}

const WEEKDAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const GAP_THRESHOLD_MINUTES = 30;

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => Number.parseInt(x, 10));
  const hours = h !== undefined && Number.isFinite(h) ? h : 0;
  const minutes = m !== undefined && Number.isFinite(m) ? m : 0;
  return hours * 60 + minutes;
}

function centerInWidth(text: string, width: number): string {
  const pad = Math.max(0, width - visualWidth(text));
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return ' '.repeat(left) + text + ' '.repeat(right);
}

const MIN_COL_WIDTH = 8;

export function renderWeekGrid(
  timetable: Timetable,
  weekNumber: number,
  now: Date,
  cols = 80,
  cursor?: { weekday: number; period: number },
): string {
  const schedule = createTimetableSchedule(timetable);
  const week = schedule.meetingsInWeek(weekNumber);
  const todayWd = schedule.weekdayAt(now);
  const periods = timetable.periods;
  const rowHeadW = 12;
  const todayMark = pickIcon('•', '*');
  const connector = pickIcon('│', '|');
  const emptyGlyph = pickIcon('·', '.');
  const sepGlyph = pickIcon('│', '|');
  const sep = type.hint(` ${sepGlyph} `);
  const sepW = 3; // " │ " / " | " -- always 3 display columns regardless of icon mode

  const idealColWidths = WEEKDAY_KEYS.map((_, i) => {
    const wd = i + 1;
    const dayMeetings = week.filter((m) => m.weekday === wd);
    const nameW = dayMeetings.reduce((max, m) => Math.max(max, visualWidth(m.courseName)), 0);
    const locW = dayMeetings.reduce(
      (max, m) => Math.max(max, m.location ? visualWidth(m.location) : 0),
      0,
    );
    const headerW =
      visualWidth(weekdayShortLabel(wd)) + (wd === todayWd ? visualWidth(todayMark) : 0);
    return Math.max(nameW, locW, headerW, MIN_COL_WIDTH);
  });
  const fixedOverhead = space.indent.length + rowHeadW + 6 * sepW;
  const availableForCols = Math.max(0, cols - fixedOverhead);
  const evenColW = Math.max(...idealColWidths);
  const totalIdealColW = idealColWidths.reduce((a, b) => a + b, 0);
  const colWidths =
    evenColW * 7 <= availableForCols - space.indent.length
      ? idealColWidths.map(() => evenColW)
      : totalIdealColW <= availableForCols
        ? idealColWidths
        : idealColWidths.map((w) =>
            Math.max(3, Math.floor(w * (availableForCols / totalIdealColW))),
          );
  const totalW = rowHeadW + colWidths.reduce((a, b) => a + b, 0) + 6 * sepW;

  const startingAt = (wd: number, period: number) =>
    week.find((m) => m.weekday === wd && m.startPeriod === period);
  const continuingAt = (wd: number, period: number) =>
    week.find((m) => m.weekday === wd && m.startPeriod < period && period <= m.endPeriod);
  const lines: string[] = [];
  const blankHead = padEndV('', rowHeadW);

  const headerCells = WEEKDAY_KEYS.map((_, i) => {
    const wd = i + 1;
    const d = weekdayShortLabel(wd);
    const label = wd === todayWd ? `${d}${todayMark}` : d;
    const colWidth = colWidths[i] ?? 3;
    const padded = centerInWidth(clip(label, colWidth), colWidth);
    return wd === todayWd ? type.active(padded) : type.hint(padded);
  }).join(sep);
  lines.push(space.indent + blankHead + headerCells);

  const sorted = [...periods].sort((a, b) => a.period - b.period);
  sorted.forEach((p, i) => {
    const rowHead = type.hint(padEndV(`${p.start}-${p.end}`, rowHeadW));
    const nameCells: string[] = [];
    const locCells: string[] = [];
    for (let wdIdx = 0; wdIdx < 7; wdIdx++) {
      const wd = wdIdx + 1;
      const colW = colWidths[wdIdx] ?? 3;
      const isToday = wd === todayWd;
      const isCursor = cursor?.weekday === wd && cursor.period === p.period;
      const starting = startingAt(wd, p.period);
      const isContinuation = !starting && continuingAt(wd, p.period);

      const rawName = starting ? starting.courseName : isContinuation ? connector : emptyGlyph;
      const rawLoc = starting ? (starting.location ?? '') : isContinuation ? connector : '';
      const paddedName = centerInWidth(clip(rawName, colW), colW);
      const paddedLoc = centerInWidth(clip(rawLoc, colW), colW);

      if (isCursor) {
        nameCells.push(type.active(centerInWidth(`[${clip(rawName, colW - 2)}]`, colW)));
        locCells.push(starting ? type.body(paddedLoc) : type.hint(paddedLoc));
      } else if (starting) {
        nameCells.push(isToday ? type.active(paddedName) : type.body(paddedName));
        locCells.push(type.hint(paddedLoc));
      } else {
        nameCells.push(type.hint(paddedName));
        locCells.push(type.hint(paddedLoc));
      }
    }
    lines.push(space.indent + rowHead + nameCells.join(sep));
    lines.push(space.indent + blankHead + locCells.join(sep));

    const next = sorted[i + 1];
    if (next && minutesOf(next.start) - minutesOf(p.end) > GAP_THRESHOLD_MINUTES) {
      lines.push(space.indent + type.hint(pickIcon('╌', '-').repeat(totalW)));
    }
  });
  return lines.join('\n');
}

export function renderWeekAgenda(
  timetable: Timetable,
  weekNumber: number,
  now: Date,
  cols = Number.POSITIVE_INFINITY,
  cursor?: { weekday: number; period: number },
  oneLinePerDay = false,
): string[] {
  const schedule = createTimetableSchedule(timetable);
  const todayWd = schedule.weekdayAt(now);
  const width = lineBudget(cols);
  const todayMark = pickIcon('•', '*');
  const dot = pickIcon('·', '-');
  const pointer = glyph.cursor();
  const labels = WEEKDAY_KEYS.map(
    (_, i) => `${weekdayShortLabel(i + 1)}${i + 1 === todayWd ? todayMark : ''}`,
  );
  const labelW = Math.max(...labels.map(visualWidth));
  const nameColW = Math.max(
    0,
    ...schedule.meetingsInWeek(weekNumber).map((m) => visualWidth(m.courseName)),
  );
  const lines: string[] = [];

  WEEKDAY_KEYS.forEach((_, i) => {
    const wd = i + 1;
    const meetings = [...schedule.meetingsOnDay(weekNumber, wd as Weekday)].sort(
      (a, b) => a.startPeriod - b.startPeriod,
    );
    const isSelected = (m: TimetableMeeting): boolean =>
      cursor?.weekday === wd && m.startPeriod <= cursor.period && cursor.period <= m.endPeriod;
    const selectedIndex = Math.max(0, meetings.findIndex(isSelected));
    const label = padEndV(labels[i] ?? '', labelW);
    const head = (row: number): string => {
      const mark =
        cursor?.weekday === wd && row === selectedIndex
          ? type.active(pointer)
          : ' '.repeat(visualWidth(pointer));
      const day =
        row > 0 ? ' '.repeat(labelW) : wd === todayWd ? type.active(label) : type.hint(label);
      return `${space.indent}${mark} ${day}  `;
    };
    const room = Math.max(1, width - visualWidth(head(0)));
    const nameStyle = (m: TimetableMeeting): ((value: string) => string) =>
      isSelected(m) ? type.active : type.body;

    if (meetings.length === 0) {
      lines.push(`${head(0)}${type.hint(dot)}`);
      return;
    }

    if (oneLinePerDay) {
      let used = 0;
      let text = '';
      for (const [index, m] of meetings.entries()) {
        const sep = index === 0 ? '' : `  ${dot}  `;
        const left = room - used - visualWidth(sep);
        if (left < 2) {
          if (used + visualWidth(ellipsis()) + 1 <= room) text += ` ${type.hint(ellipsis())}`;
          break;
        }
        const name = clip(m.courseName, left);
        text += `${type.hint(sep)}${nameStyle(m)(name)}`;
        used += visualWidth(sep) + visualWidth(name);
      }
      lines.push(`${head(0)}${text}`);
      return;
    }

    meetings.forEach((m, row) => {
      const start = timetable.periods.find((p) => p.period === m.startPeriod)?.start ?? '';
      const time = `${start} `;
      const nameRoom = room - visualWidth(time);
      const location = m.location ?? '';
      const nameW = [nameColW, visualWidth(m.courseName)].find(
        (w) => w + 3 + visualWidth(location) <= nameRoom,
      );
      const body =
        location && nameW !== undefined
          ? `${nameStyle(m)(padEndV(m.courseName, nameW))}   ${type.hint(location)}`
          : nameStyle(m)(clip(m.courseName, Math.max(1, nameRoom)));
      lines.push(`${head(row)}${type.hint(time)}${body}`);
    });
  });
  return lines;
}

function formatWeekRange(weeks: readonly number[]): string {
  if (weeks.length === 0) return '';
  const sorted = [...weeks].sort((a, b) => a - b);
  const isContiguous = sorted.every((week, index) => {
    const previous = sorted[index - 1];
    return index === 0 || (previous !== undefined && week === previous + 1);
  });
  if (isContiguous) {
    const first = sorted[0];
    const last = sorted.at(-1);
    return sorted.length > 1 ? `${first}-${last}` : `${first}`;
  }
  return sorted.join(', ');
}

export function renderMeetingDetail(
  meeting: TimetableMeeting,
  periods: readonly TimetablePeriod[],
  cols = Number.POSITIVE_INFINITY,
): string {
  const trans = t();
  const rows: [string, string][] = [
    [trans.timetable.detailTime, `${weekdayShortLabel(meeting.weekday)} ${span(meeting, periods)}`],
  ];
  if (meeting.location) rows.push([trans.timetable.detailLocation, meeting.location]);
  if (meeting.teacherNames.length > 0) {
    rows.push([
      trans.timetable.detailTeacher,
      meeting.teacherNames.join(trans.timetable.teacherSeparator),
    ]);
  }
  rows.push([trans.timetable.detailWeeks, formatWeekRange(meeting.weeks)]);

  const width = Number.isFinite(cols) ? Math.max(1, Math.floor(cols)) : Number.POSITIVE_INFINITY;
  const indent = visualWidth(space.indent) < width ? space.indent : '';
  const contentWidth = Math.max(1, width - visualWidth(indent));
  const labelWidth = rows.reduce((w, [label]) => Math.max(w, visualWidth(label)), 0);
  const lines = wrapAnsiToVisualWidth(type.heading(meeting.courseName), contentWidth).map(
    (part) => `${indent}${part}`,
  );
  lines.push('');

  for (const [label, value] of rows) {
    const inlinePrefix = `${indent}${type.label(padEndV(label, labelWidth))}   `;
    const inlineValueWidth = width - visualWidth(inlinePrefix);
    if (!Number.isFinite(width) || inlineValueWidth >= 12) {
      const parts = wrapAnsiToVisualWidth(type.body(value), inlineValueWidth);
      const continuation = ' '.repeat(visualWidth(inlinePrefix));
      lines.push(
        ...parts.map((part, index) => `${index === 0 ? inlinePrefix : continuation}${part}`),
      );
      continue;
    }

    lines.push(
      ...wrapAnsiToVisualWidth(type.label(label), contentWidth).map((part) => `${indent}${part}`),
    );
    const valueIndent = visualWidth(indent) + 2 < width ? `${indent}  ` : indent;
    const valueWidth = Math.max(1, width - visualWidth(valueIndent));
    lines.push(
      ...wrapAnsiToVisualWidth(type.body(value), valueWidth).map((part) => `${valueIndent}${part}`),
    );
  }
  return lines.join('\n');
}

export function renderUnresolvedItems(
  items: readonly TimetableUnresolvedItem[],
  cols = Number.POSITIVE_INFINITY,
): string {
  const trans = t();
  const width = Number.isFinite(cols) ? Math.max(1, Math.floor(cols)) : Number.POSITIVE_INFINITY;
  const indent = visualWidth(space.indent) < width ? space.indent : '';
  const contentWidth = Math.max(1, width - visualWidth(indent));
  if (items.length === 0) {
    return wrapAnsiToVisualWidth(type.hint(trans.timetable.unresolvedEmpty), contentWidth)
      .map((part) => `${indent}${part}`)
      .join('\n');
  }
  const dot = pickIcon('·', '-');
  const lines: string[] = [];
  for (const item of items) {
    const name = item.sourceFields.kcmc ?? trans.timetable.unresolvedUnknownItem;
    const detail = item.sourceFields.sjkcgs ?? item.sourceFields.qsjsz ?? '';
    const full = `${indent}${type.body(name)}${detail ? `  ${dot}  ${type.hint(detail)}` : ''}`;
    if (!Number.isFinite(width) || visualWidth(full) <= width) {
      lines.push(full);
      continue;
    }

    lines.push(
      ...wrapAnsiToVisualWidth(type.body(name), contentWidth).map((part) => `${indent}${part}`),
    );
    if (!detail) continue;
    const detailPrefix =
      visualWidth(indent) + 2 < width ? `${indent}${type.hint(`${dot} `)}` : indent;
    const detailWidth = Math.max(1, width - visualWidth(detailPrefix));
    const continuation = ' '.repeat(visualWidth(detailPrefix));
    lines.push(
      ...wrapAnsiToVisualWidth(type.hint(detail), detailWidth).map(
        (part, index) => `${index === 0 ? detailPrefix : continuation}${part}`,
      ),
    );
  }
  return lines.join('\n');
}

const DENSITY_GLYPHS: [string, string][] = [
  ['·', ' '],
  ['░', '.'],
  ['▒', ':'],
  ['▓', '-'],
  ['█', '='],
];

function levelGlyph(level: number): string {
  const pair = DENSITY_GLYPHS[Math.max(0, Math.min(4, level))] ?? ['·', ' '];
  return pickIcon(pair[0], pair[1]);
}

function applyDensityColor(glyphChar: string, level: number): string {
  if (level <= 0) return type.hint(glyphChar);
  if (level >= 4) return type.active(glyphChar);
  return c.brand(glyphChar);
}

function weekStartDate(weekOneMonday: string, week: number): Date {
  return addLocalDays(parseLocalMonday(weekOneMonday), (week - 1) * 7);
}

function densityMonthText(
  weekOneMonday: string,
  startWeek: number,
  count: number,
  lang: Language,
  maxWidth = Number.POSITIVE_INFINITY,
): string {
  let text = '';
  let visualCol = 0;
  let previousMonth = -1;
  for (let index = 0; index < count; index += 1) {
    const date = weekStartDate(weekOneMonday, startWeek + index);
    const month = date.getMonth();
    if (month === previousMonth) continue;
    previousMonth = month;
    const label = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
    }).format(date);
    const targetCol = index * 2;
    if (targetCol + visualWidth(label) > maxWidth) continue;
    if (targetCol > visualCol) text += ' '.repeat(targetCol - visualCol);
    text += label;
    visualCol = targetCol + visualWidth(label);
  }
  return text;
}

function densityMarkerText(index: number, width: number, marker: string, label: string): string {
  const markerCol = index * 2;
  const after = `${' '.repeat(markerCol)}${marker} ${label}`;
  if (visualWidth(after) <= width) return after;
  const beforeStart = markerCol - visualWidth(label) - 1;
  if (beforeStart >= 0) return `${' '.repeat(beforeStart)}${label} ${marker}`;
  return `${' '.repeat(markerCol)}${marker}`;
}

export function renderTermDensity(
  meetings: readonly TimetableMeeting[],
  weekOneMonday: string,
  currentWeek: number,
  cols = Number.POSITIVE_INFINITY,
): string {
  const trans = t();
  const lang = getCurrentLanguage();

  let minWeek = currentWeek;
  let maxWeek = currentWeek;
  for (const m of meetings) {
    for (const w of m.weeks) {
      if (w < minWeek) minWeek = w;
      if (w > maxWeek) maxWeek = w;
    }
  }
  const numWeeks = maxWeek - minWeek + 1;

  const weekSlots: number[] = [];
  for (let w = minWeek; w <= maxWeek; w++) {
    let slots = 0;
    for (const m of meetings) {
      if (m.weeks.includes(w)) slots += m.endPeriod - m.startPeriod + 1;
    }
    weekSlots.push(slots);
  }
  const max = Math.max(0, ...weekSlots);

  const levels = weekSlots.map((v) => {
    if (v === 0 || max === 0) return 0;
    if (v <= max * 0.25) return 1;
    if (v <= max * 0.5) return 2;
    if (v <= max * 0.75) return 3;
    return 4;
  });

  const monthLabelText = densityMonthText(weekOneMonday, minWeek, numWeeks, lang);
  const monthLabelLine = `${space.indent}${monthLabelText}`;

  const glyphLine = `${space.indent}${levels.map((lvl) => applyDensityColor(levelGlyph(lvl), lvl)).join(' ')}`;

  const currentWeekIndex = Math.max(0, currentWeek - minWeek);
  const markerGlyph = pickIcon('↑', '^');
  const markerLine = `${space.indent}${type.hint(
    `${' '.repeat(currentWeekIndex * 2)}${markerGlyph} ${trans.timetable.termDensityThisWeek}`,
  )}`;

  const legendGlyphs = [0, 1, 2, 3, 4].map((lvl) => applyDensityColor(levelGlyph(lvl), lvl));
  const legendContent = `${type.hint(trans.calendar.heatmap.legendLess)} ${legendGlyphs.join('')} ${type.hint(trans.calendar.heatmap.legendMore)}`;
  const legendLine = `${space.indent}${legendContent}`;

  const fullLines = [
    `${space.indent}${type.heading(trans.timetable.termDensityTitle)}`,
    '',
    monthLabelLine,
    glyphLine,
    markerLine,
    '',
    legendLine,
  ];
  const width = Number.isFinite(cols) ? Math.max(1, Math.floor(cols)) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(width) || fullLines.every((line) => visualWidth(line) <= width)) {
    return fullLines.join('\n');
  }

  const indent = visualWidth(space.indent) < width ? space.indent : '';
  const contentWidth = Math.max(1, width - visualWidth(indent));
  const weeksPerChunk = Math.max(1, Math.floor((contentWidth + 1) / 2));
  const lines = wrapAnsiToVisualWidth(
    type.heading(trans.timetable.termDensityTitle),
    contentWidth,
  ).map((part) => `${indent}${part}`);
  lines.push('');

  for (let start = 0; start < numWeeks; start += weeksPerChunk) {
    if (start > 0) lines.push('');
    const count = Math.min(weeksPerChunk, numWeeks - start);
    const chunkMonthText = densityMonthText(
      weekOneMonday,
      minWeek + start,
      count,
      lang,
      contentWidth,
    );
    lines.push(`${indent}${chunkMonthText}`);
    lines.push(
      `${indent}${levels
        .slice(start, start + count)
        .map((level) => applyDensityColor(levelGlyph(level), level))
        .join(' ')}`,
    );
    if (currentWeekIndex >= start && currentWeekIndex < start + count) {
      const relativeIndex = currentWeekIndex - start;
      lines.push(
        `${indent}${type.hint(
          densityMarkerText(
            relativeIndex,
            contentWidth,
            markerGlyph,
            trans.timetable.termDensityThisWeek,
          ),
        )}`,
      );
    }
  }

  lines.push('');
  lines.push(
    ...wrapAnsiToVisualWidth(legendContent, contentWidth).map((part) => `${indent}${part}`),
  );
  return lines.join('\n');
}
