import type { TimetableMeeting, TimetablePeriod, TimetableUnresolvedItem } from '@nbtca/nbtcal/timetable';
import { countdownParts, isCountdownUrgent } from './calendar-query.js';
import type { NextClass } from './schedule-query.js';
import { meetingsInWeek, campusWeekday } from './schedule-query.js';
import { c, type, space, glyph } from '../core/theme.js';
import { pickIcon } from '../core/icons.js';
import { padEndV, truncate, visualWidth, wrapAnsiToVisualWidth } from '../core/text.js';
import { t, fmt, getCurrentLanguage, type Language } from '../i18n/index.js';

function span(m: TimetableMeeting, periods: readonly TimetablePeriod[]): string {
  const s = periods.find((p) => p.period === m.startPeriod)?.start ?? '';
  const e = periods.find((p) => p.period === m.endPeriod)?.end ?? '';
  return e ? `${s}${pickIcon('–', '-')}${e}` : s;
}

export function renderNextClassBanner(
  next: NextClass | null, now: Date, cols = Number.POSITIVE_INFINITY,
): string {
  const trans = t();
  if (!next) return '';
  const p = countdownParts(next.start, now);
  const when = p.past ? trans.timetable.nowLabel
    : p.days > 0 ? `${p.days}d ${p.hours}h`
    : p.hours > 0 ? `${p.hours}h ${p.minutes}m`
    : `${p.minutes}m`;
  const styleWhen = isCountdownUrgent(p) ? c.warn : type.hint;
  const whenStyled = styleWhen(when);
  const dot = pickIcon('·', '-');
  const marker = type.active(glyph.cursor());
  const separator = `  ${dot}  `;
  const detailedPrefix = `${space.indent}${marker} ${type.label(trans.timetable.nextClass)}${separator}`;
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
    return `${prefix}${type.body(truncate(courseName, courseWidth))}${suffix}`;
  }

  const countdownOnly = [
    `${space.indent}${marker} ${whenStyled}`,
    `${marker} ${whenStyled}`,
    whenStyled,
  ].find((candidate) => visualWidth(candidate) <= cols);
  if (countdownOnly) return countdownOnly;

  const whenWidth = Math.max(0, Math.floor(cols));
  if (whenWidth === 0) return '';
  if (whenWidth >= 3) return styleWhen(truncate(when, whenWidth));
  let compactWhen = '';
  for (const char of when) {
    if (visualWidth(compactWhen + char) > whenWidth) break;
    compactWhen += char;
  }
  return styleWhen(compactWhen);
}

export function renderTodayClasses(meetings: readonly TimetableMeeting[], periods: readonly TimetablePeriod[], now: Date): string {
  const trans = t();
  const sorted = [...meetings].sort((a, b) => a.startPeriod - b.startPeriod);
  if (sorted.length === 0) return `${space.indent}${type.hint(trans.timetable.noClassToday)}`;
  const dot = pickIcon('·', '-');
  const marker = pickIcon('▸', '>');
  const lines = sorted.map((m) => {
    const time = span(m, periods);
    const startStr = periods.find((p) => p.period === m.startPeriod)?.start ?? '00:00';
    const endStr = periods.find((p) => p.period === m.endPeriod)?.end ?? '23:59';
    const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const live = nowStr >= startStr && nowStr <= endStr;
    const head = live ? `${type.active(marker)} ` : '  ';
    const loc = m.location ? `  ${dot}  ${type.hint(m.location)}` : '';
    return `${space.indent}${head}${type.hint(time)}  ${live ? type.active(m.courseName) : type.body(m.courseName)}${loc}`;
  });
  return lines.join('\n');
}

export function weekdayShortLabel(wd: number): string {
  const trans = t();
  const labels = [
    trans.timetable.weekdayMon, trans.timetable.weekdayTue, trans.timetable.weekdayWed,
    trans.timetable.weekdayThu, trans.timetable.weekdayFri, trans.timetable.weekdaySat,
    trans.timetable.weekdaySun,
  ];
  return labels[wd - 1] ?? '';
}

function renderTimeline(
  meetings: readonly TimetableMeeting[], periods: readonly TimetablePeriod[], now: Date,
  isToday: boolean, alwaysShowLocation: boolean, cursorPeriod?: number,
  cols = Number.POSITIVE_INFINITY,
): string {
  const trans = t();
  const sorted = [...meetings].sort((a, b) => a.startPeriod - b.startPeriod);
  if (sorted.length === 0) return `${space.indent}${type.hint(trans.timetable.noClassToday)}`;

  const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dot = pickIcon('·', '-');
  const rule = pickIcon('─', '-');
  const midConnector = pickIcon('┼', '+');
  const topConnector = pickIcon('┬', '+');
  const bottomConnector = pickIcon('┴', '+');

  const lines = sorted.map((m, i) => {
    const startStr = periods.find((p) => p.period === m.startPeriod)?.start ?? '00:00';
    const endStr = periods.find((p) => p.period === m.endPeriod)?.end ?? '23:59';
    const isLive = isToday && nowStr >= startStr && nowStr <= endStr;
    const isDone = isToday && nowStr > endStr;
    const isCursor = cursorPeriod !== undefined && m.startPeriod <= cursorPeriod && cursorPeriod <= m.endPeriod;
    const connector = i === 0 ? topConnector : midConnector;
    const marker = isLive ? type.active(pickIcon('▶', '>')) : ' ';
    const timeCol = `${marker}${type.hint(startStr)} ${rule}${connector}${rule}`;
    const styleName = (name: string): string => (
      isLive ? type.active(name) : (isDone ? type.hint(name) : type.body(name))
    );

    let statusText = '';
    let compactStatusText = '';
    if (isDone) {
      statusText = trans.timetable.classDone;
      compactStatusText = statusText;
    } else if (isLive) {
      const end = new Date(now);
      const [eh, em] = endStr.split(':').map((x) => Number.parseInt(x, 10));
      end.setHours(eh || 0, em || 0, 0, 0);
      const remaining = countdownParts(end, now);
      const mins = remaining.days * 1440 + remaining.hours * 60 + remaining.minutes;
      statusText = `${trans.timetable.classLive}  ${dot}  ${fmt(trans.timetable.minutesRemaining, { minutes: String(mins) })}`;
      compactStatusText = `${mins}m`;
    }
    const showLoc = alwaysShowLocation ? Boolean(m.location) : (isLive && Boolean(m.location));
    const locationText = showLoc ? m.location ?? '' : '';
    const renderLine = (
      name: string, status: string, location: string,
      currentTimeCol = timeCol, indent: string = space.indent,
    ): string => {
      const statusCol = status ? `   ${type.hint(status)}` : '';
      const locationCol = location ? `   ${type.hint(location)}` : '';
      const content = `${currentTimeCol} ${styleName(name)}${statusCol}${locationCol}`;
      return `${indent}${isCursor ? type.cursor(content) : content}`;
    };

    const full = renderLine(m.courseName, statusText, locationText);
    if (!Number.isFinite(cols) || visualWidth(full) <= cols) return full;

    const compactWithLocation = renderLine(m.courseName, compactStatusText, locationText);
    if (visualWidth(compactWithLocation) <= cols) return compactWithLocation;

    const compact = renderLine(m.courseName, compactStatusText, '');
    if (visualWidth(compact) <= cols) return compact;

    const adaptiveStatuses = compactStatusText ? [compactStatusText, ''] : [''];
    for (const status of adaptiveStatuses) {
      const courseWidth = Math.floor(cols - visualWidth(renderLine('', status, '')));
      if (courseWidth < 3) continue;
      return renderLine(truncate(m.courseName, courseWidth), status, '');
    }

    const compactTimeCol = `${marker}${type.hint(startStr)}`;
    for (const indent of [space.indent, '']) {
      const courseWidth = Math.floor(cols - visualWidth(renderLine('', '', '', compactTimeCol, indent)));
      if (courseWidth < 3) continue;
      return renderLine(truncate(m.courseName, courseWidth), '', '', compactTimeCol, indent);
    }

    const timeOnly = [
      `${space.indent}${compactTimeCol}`,
      compactTimeCol,
      type.hint(startStr),
    ].find((candidate) => visualWidth(candidate) <= cols);
    if (timeOnly) return timeOnly;
    return type.hint(startStr.slice(0, Math.max(0, Math.floor(cols))));
  });

  const last = sorted[sorted.length - 1]!;
  const lastEnd = periods.find((p) => p.period === last.endPeriod)?.end ?? '23:59';
  const fullEnd = `${space.indent}  ${type.hint(lastEnd)} ${rule}${bottomConnector}${rule} ${type.hint(trans.timetable.timelineEnd)}`;
  if (!Number.isFinite(cols) || visualWidth(fullEnd) <= cols) {
    lines.push(fullEnd);
  } else {
    const compactEnd = [
      `${space.indent}${type.hint(lastEnd)} ${rule}${bottomConnector}${rule}`,
      `${space.indent}${type.hint(lastEnd)}`,
      type.hint(lastEnd),
    ].find((candidate) => visualWidth(candidate) <= cols);
    lines.push(compactEnd ?? type.hint(lastEnd.slice(0, Math.max(0, Math.floor(cols)))));
  }

  return lines.join('\n');
}

export function renderTodayTimeline(
  meetings: readonly TimetableMeeting[], periods: readonly TimetablePeriod[], now: Date,
  cols = Number.POSITIVE_INFINITY,
): string {
  return renderTimeline(meetings, periods, now, true, false, undefined, cols);
}

export function renderDayTimeline(
  meetings: readonly TimetableMeeting[], periods: readonly TimetablePeriod[], now: Date, isToday: boolean,
  cursorPeriod?: number, cols = Number.POSITIVE_INFINITY,
): string {
  return renderTimeline(meetings, periods, now, isToday, true, cursorPeriod, cols);
}

export function renderDaySwitcher(
  selectedWeekday: number, todayWeekday: number, cols = Number.POSITIVE_INFINITY,
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
  const renderRange = (start: number, end: number): string => (
    `${space.indent}${type.hint(leftArrow)}  ${labels.slice(start, end).join('   ')}  ${type.hint(rightArrow)}`
  );
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
  return (h || 0) * 60 + (m || 0);
}

/** Centers raw (unstyled) text within a fixed width -- extra space splits
 * left/right (left gets the smaller half on an odd remainder). Used for
 * every weekday-header label and grid cell: most cells are short glyphs
 * ("." for no class, "|" for a continuation) sitting in a column sized for
 * that column's own longest real content, and left-anchoring them reads as
 * ragged leftover text rather than a clean grid -- centering them (and the
 * header labels above them) reads as an aligned table instead. Applied to
 * the raw content before any chalk styling wraps it, so this works
 * uniformly whether the eventual style adds a background (the cursor
 * token) or only a foreground color -- there's no special case to keep in
 * sync. */
function centerInWidth(text: string, width: number): string {
  const pad = Math.max(0, width - visualWidth(text));
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return ' '.repeat(left) + text + ' '.repeat(right);
}

// A sensible floor for a column that's mostly empty cells and a short
// weekday label -- prevents a completely classless day from collapsing to
// an unreadably thin sliver.
const MIN_COL_WIDTH = 8;

export function renderWeekGrid(
  meetings: readonly TimetableMeeting[], periods: readonly TimetablePeriod[], weekNumber: number, now: Date, cols = 80,
  cursor?: { weekday: number; period: number },
): string {
  const week = meetingsInWeek(meetings, weekNumber);
  const todayWd = campusWeekday(now);
  // Row labels are the period's real clock start-end range ("08:00-08:45"),
  // always exactly 11 display columns — a bare start time answers "when do
  // I need to be there" but leaves "when am I done" (and the class's real
  // duration) to guesswork; the full range answers both. 12, not 11: one
  // column of separating space before the first cell.
  const rowHeadW = 12;
  const todayMark = pickIcon('•', '*');
  const connector = pickIcon('│', '|');
  const emptyGlyph = pickIcon('·', '.');
  const sepGlyph = pickIcon('│', '|');
  const sep = type.hint(` ${sepGlyph} `);
  const sepW = 3; // " │ " / " | " -- always 3 display columns regardless of icon mode

  // Each weekday column is sized to *that day's own* content only, never a
  // different day's longer course name -- a single long Tuesday class no
  // longer forces Monday through Sunday to share its width. Course name and
  // location are on separate lines (see the row loop below), so neither has
  // to compete with the other for room within one column either.
  const idealColWidths = WEEKDAY_KEYS.map((_, i) => {
    const wd = i + 1;
    const dayMeetings = week.filter((m) => m.weekday === wd);
    const nameW = dayMeetings.reduce((max, m) => Math.max(max, visualWidth(m.courseName)), 0);
    const locW = dayMeetings.reduce((max, m) => Math.max(max, m.location ? visualWidth(m.location) : 0), 0);
    const headerW = visualWidth(weekdayShortLabel(wd)) + (wd === todayWd ? visualWidth(todayMark) : 0);
    return Math.max(nameW, locW, headerW, MIN_COL_WIDTH);
  });
  // If every column's own ideal width already fits the terminal, use it
  // outright -- an empty (floor-width) day must never eat into a genuinely
  // busy day's share just because both are capped by the same flat "1/7th
  // of the remaining space" division. Only when the ideal *total* doesn't
  // fit does every column shrink, proportionally to its own ideal width, so
  // the row's total width never exceeds `cols` -- unlike a flat floor that
  // stays fixed regardless of how little room is actually left.
  const fixedOverhead = space.indent.length + rowHeadW + 6 * sepW;
  const availableForCols = Math.max(0, cols - fixedOverhead);
  const totalIdealColW = idealColWidths.reduce((a, b) => a + b, 0);
  const colWidths = totalIdealColW <= availableForCols
    ? idealColWidths
    // Floored at 3, not 1 -- truncate() itself can never shrink text below
    // its own 3-column ellipsis ("..."), so a column narrower than that
    // would make even the shortest weekday header ("Mon") overflow its own
    // column when truncated. 3 is also exactly a bare weekday abbreviation's
    // width, so at this floor a header never actually needs truncating.
    : idealColWidths.map((w) => Math.max(3, Math.floor(w * (availableForCols / totalIdealColW))));
  const totalW = rowHeadW + colWidths.reduce((a, b) => a + b, 0) + 6 * sepW;

  // Consecutive periods of the same meeting collapse into one labeled cell
  // at its starting period — later periods in its span show a plain
  // connector instead of repeating the same course/location text down the
  // whole column. A genuine conflict (two meetings both starting at the
  // same weekday+period) is rare and, like the pre-existing lookup, just
  // shows whichever one is found first.
  const startingAt = (wd: number, period: number) => week.find((m) => m.weekday === wd && m.startPeriod === period);
  const continuingAt = (wd: number, period: number) => week.find((m) => m.weekday === wd && m.startPeriod < period && period <= m.endPeriod);
  const lines: string[] = [];
  const blankHead = padEndV('', rowHeadW);

  const headerCells = WEEKDAY_KEYS.map((_, i) => {
    const wd = i + 1;
    const d = weekdayShortLabel(wd);
    const label = wd === todayWd ? `${d}${todayMark}` : d;
    // Column width always starts out >= the label's own width (headerW is
    // one of the terms idealColWidths maxes over), but proportional
    // shrinking on a too-narrow terminal can push a column's *scaled*
    // width below that -- truncate defensively so the header can never
    // render wider than the column it's supposed to sit in.
    const padded = centerInWidth(truncate(label, colWidths[i]!), colWidths[i]!);
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
      const colW = colWidths[wdIdx]!;
      const isToday = wd === todayWd;
      const isCursor = cursor !== undefined && cursor.weekday === wd && cursor.period === p.period;
      const starting = startingAt(wd, p.period);
      const isContinuation = !starting && continuingAt(wd, p.period);

      const rawName = starting ? starting.courseName : (isContinuation ? connector : emptyGlyph);
      const rawLoc = starting ? (starting.location ?? '') : (isContinuation ? connector : '');
      const paddedName = centerInWidth(truncate(rawName, colW), colW);
      const paddedLoc = centerInWidth(truncate(rawLoc, colW), colW);

      // Cursor styling covers both lines of the cell -- it's one selected
      // unit, not just its name half. Otherwise the course name (primary
      // info) gets full styling on today/cursor; the location (supporting
      // info) always stays dim, even on today's own column.
      if (isCursor) {
        nameCells.push(type.cursor(paddedName));
        locCells.push(type.cursor(paddedLoc));
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

function formatWeekRange(weeks: readonly number[]): string {
  if (weeks.length === 0) return '';
  const sorted = [...weeks].sort((a, b) => a - b);
  const isContiguous = sorted.every((w, i) => i === 0 || w === sorted[i - 1]! + 1);
  if (isContiguous) {
    return sorted.length > 1 ? `${sorted[0]}-${sorted[sorted.length - 1]}` : `${sorted[0]}`;
  }
  // A genuinely non-contiguous week pattern is rare but must not crash or
  // silently drop data -- fall back to listing every week.
  return sorted.join(', ');
}

export function renderMeetingDetail(
  meeting: TimetableMeeting, periods: readonly TimetablePeriod[], cols = Number.POSITIVE_INFINITY,
): string {
  const trans = t();
  const rows: Array<[string, string]> = [
    [trans.timetable.detailTime, `${weekdayShortLabel(meeting.weekday)} ${span(meeting, periods)}`],
  ];
  if (meeting.location) rows.push([trans.timetable.detailLocation, meeting.location]);
  if (meeting.teacherNames.length > 0) {
    rows.push([trans.timetable.detailTeacher, meeting.teacherNames.join(trans.timetable.teacherSeparator)]);
  }
  rows.push([trans.timetable.detailWeeks, formatWeekRange(meeting.weeks)]);

  const width = Number.isFinite(cols) ? Math.max(1, Math.floor(cols)) : Number.POSITIVE_INFINITY;
  const indent = visualWidth(space.indent) < width ? space.indent : '';
  const contentWidth = Math.max(1, width - visualWidth(indent));
  const labelWidth = rows.reduce((w, [label]) => Math.max(w, visualWidth(label)), 0);
  const lines = wrapAnsiToVisualWidth(type.heading(meeting.courseName), contentWidth)
    .map((part) => `${indent}${part}`);
  lines.push('');

  for (const [label, value] of rows) {
    const inlinePrefix = `${indent}${type.label(padEndV(label, labelWidth))}   `;
    const inlineValueWidth = width - visualWidth(inlinePrefix);
    if (!Number.isFinite(width) || inlineValueWidth >= 12) {
      const parts = wrapAnsiToVisualWidth(type.body(value), inlineValueWidth);
      const continuation = ' '.repeat(visualWidth(inlinePrefix));
      lines.push(...parts.map((part, index) => `${index === 0 ? inlinePrefix : continuation}${part}`));
      continue;
    }

    lines.push(...wrapAnsiToVisualWidth(type.label(label), contentWidth).map((part) => `${indent}${part}`));
    const valueIndent = visualWidth(indent) + 2 < width ? `${indent}  ` : indent;
    const valueWidth = Math.max(1, width - visualWidth(valueIndent));
    lines.push(...wrapAnsiToVisualWidth(type.body(value), valueWidth).map((part) => `${valueIndent}${part}`));
  }
  return lines.join('\n');
}

export function renderUnresolvedItems(
  items: readonly TimetableUnresolvedItem[], cols = Number.POSITIVE_INFINITY,
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

    lines.push(...wrapAnsiToVisualWidth(type.body(name), contentWidth).map((part) => `${indent}${part}`));
    if (!detail) continue;
    const detailPrefix = visualWidth(indent) + 2 < width ? `${indent}${type.hint(`${dot} `)}` : indent;
    const detailWidth = Math.max(1, width - visualWidth(detailPrefix));
    const continuation = ' '.repeat(visualWidth(detailPrefix));
    lines.push(...wrapAnsiToVisualWidth(type.hint(detail), detailWidth)
      .map((part, index) => `${index === 0 ? detailPrefix : continuation}${part}`));
  }
  return lines.join('\n');
}

const DENSITY_GLYPHS: Array<[string, string]> = [
  ['·', ' '], ['░', '.'], ['▒', ':'], ['▓', '-'], ['█', '='],
];

function levelGlyph(level: number): string {
  const pair = DENSITY_GLYPHS[Math.max(0, Math.min(4, level))] ?? DENSITY_GLYPHS[0]!;
  return pickIcon(pair[0], pair[1]);
}

/** Level 0 reads as an ordinary "no data" cell (matches renderWeekGrid's own
 * empty-cell treatment above); levels 1-3 use plain brand color; level 4
 * reuses type.active's exact bold+brand composition rather than inventing a
 * new top-tier shade — deliberately NOT the heatmap's green ramp, which
 * specifically means "club activity," not personal class load. */
function applyDensityColor(glyphChar: string, level: number): string {
  if (level <= 0) return type.hint(glyphChar);
  if (level >= 4) return type.active(glyphChar);
  return c.brand(glyphChar);
}

function weekStartDate(weekOneMonday: string, week: number): Date {
  const base = new Date(`${weekOneMonday}T00:00:00`);
  return new Date(base.getTime() + (week - 1) * 7 * 86400000);
}

function densityMonthText(
  weekOneMonday: string, startWeek: number, count: number, lang: Language,
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
    const label = lang === 'zh'
      ? `${month + 1}月`
      : new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
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
  const lines = wrapAnsiToVisualWidth(type.heading(trans.timetable.termDensityTitle), contentWidth)
    .map((part) => `${indent}${part}`);
  lines.push('');

  for (let start = 0; start < numWeeks; start += weeksPerChunk) {
    if (start > 0) lines.push('');
    const count = Math.min(weeksPerChunk, numWeeks - start);
    const chunkMonthText = densityMonthText(
      weekOneMonday, minWeek + start, count, lang, contentWidth,
    );
    lines.push(`${indent}${chunkMonthText}`);
    lines.push(`${indent}${levels.slice(start, start + count)
      .map((level) => applyDensityColor(levelGlyph(level), level)).join(' ')}`);
    if (currentWeekIndex >= start && currentWeekIndex < start + count) {
      const relativeIndex = currentWeekIndex - start;
      lines.push(`${indent}${type.hint(densityMarkerText(
        relativeIndex, contentWidth, markerGlyph, trans.timetable.termDensityThisWeek,
      ))}`);
    }
  }

  lines.push('');
  lines.push(...wrapAnsiToVisualWidth(legendContent, contentWidth).map((part) => `${indent}${part}`));
  return lines.join('\n');
}
