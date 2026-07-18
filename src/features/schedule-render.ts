import type { TimetableMeeting, TimetablePeriod, TimetableUnresolvedItem } from '@nbtca/nbtcal/timetable';
import { countdownParts, isCountdownUrgent } from './calendar-query.js';
import type { NextClass } from './schedule-query.js';
import { meetingsInWeek, campusWeekday } from './schedule-query.js';
import { c, type, space, glyph } from '../core/theme.js';
import { pickIcon } from '../core/icons.js';
import { padEndV, truncate, visualWidth } from '../core/text.js';
import { t, fmt, getCurrentLanguage } from '../i18n/index.js';

function span(m: TimetableMeeting, periods: readonly TimetablePeriod[]): string {
  const s = periods.find((p) => p.period === m.startPeriod)?.start ?? '';
  const e = periods.find((p) => p.period === m.endPeriod)?.end ?? '';
  return e ? `${s}${pickIcon('–', '-')}${e}` : s;
}

export function renderNextClassBanner(next: NextClass | null, now: Date): string {
  const trans = t();
  if (!next) return '';
  const p = countdownParts(next.start, now);
  const when = p.past ? trans.timetable.nowLabel
    : p.days > 0 ? `${p.days}d ${p.hours}h`
    : p.hours > 0 ? `${p.hours}h ${p.minutes}m`
    : `${p.minutes}m`;
  const whenStyled = isCountdownUrgent(p) ? c.warn(when) : type.hint(when);
  const dot = pickIcon('·', '-');
  const loc = next.meeting.location ? `  ${dot}  ${next.meeting.location}` : '';
  return `${space.indent}${type.active(glyph.cursor())} ${type.label(trans.timetable.nextClass)}  ${dot}  ${type.body(next.meeting.courseName)}${loc}  ${dot}  ${whenStyled}`;
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

/** Shared body for renderTodayTimeline and renderDayTimeline (below) --
 * the two differ only in whether live/done status applies at all (it's
 * meaningless for a day that isn't actually today) and whether location
 * always shows or only for the live class. `cursorPeriod`, when given,
 * highlights whichever meeting's span covers it, matching the interactive
 * grid's own cursor -- Enter in the single-day view opens that meeting's
 * detail card, the same as Enter on the grid's cursor cell. */
function renderTimeline(
  meetings: readonly TimetableMeeting[], periods: readonly TimetablePeriod[], now: Date,
  isToday: boolean, alwaysShowLocation: boolean, cursorPeriod?: number,
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
    const nameStyled = isLive ? type.active(m.courseName) : (isDone ? type.hint(m.courseName) : type.body(m.courseName));

    let statusText = '';
    if (isDone) {
      statusText = trans.timetable.classDone;
    } else if (isLive) {
      const end = new Date(now);
      const [eh, em] = endStr.split(':').map((x) => Number.parseInt(x, 10));
      end.setHours(eh || 0, em || 0, 0, 0);
      const remaining = countdownParts(end, now);
      const mins = remaining.days * 1440 + remaining.hours * 60 + remaining.minutes;
      statusText = `${trans.timetable.classLive}  ${dot}  ${fmt(trans.timetable.minutesRemaining, { minutes: String(mins) })}`;
    }
    const statusCol = statusText ? `   ${type.hint(statusText)}` : '';
    const showLoc = alwaysShowLocation ? Boolean(m.location) : (isLive && Boolean(m.location));
    const loc = showLoc ? `   ${type.hint(m.location!)}` : '';
    const content = `${timeCol} ${nameStyled}${statusCol}${loc}`;
    // Wrapping the already-styled content in the cursor token composes
    // fine -- background codes don't cancel a nested foreground code, so
    // the individual pieces' own colors stay visible against the solid
    // cursor background.
    return `${space.indent}${isCursor ? type.cursor(content) : content}`;
  });

  const last = sorted[sorted.length - 1]!;
  const lastEnd = periods.find((p) => p.period === last.endPeriod)?.end ?? '23:59';
  lines.push(`${space.indent}  ${type.hint(lastEnd)} ${rule}${bottomConnector}${rule} ${type.hint(trans.timetable.timelineEnd)}`);

  return lines.join('\n');
}

/** A vertical timeline of today's classes: finished classes are dimmed and
 * marked done, the in-progress one (if any) is highlighted with a
 * remaining-minutes countdown and its location, and the timeline closes
 * with the last class's end time — a hand-drawn alternative to a flat list
 * that puts "what's happening right now" front and center. */
export function renderTodayTimeline(meetings: readonly TimetableMeeting[], periods: readonly TimetablePeriod[], now: Date): string {
  return renderTimeline(meetings, periods, now, true, false);
}

/** The small-terminal counterpart to the interactive week grid: one day's
 * classes, browsable day-by-day (see renderDaySwitcher below), reusing
 * renderTodayTimeline's own visual language. Unlike renderTodayTimeline,
 * every class's location is shown (not just the live one) -- there's no
 * "what's happening right now" to prioritize when the viewed day isn't
 * necessarily today, and the location matters just as much when simply
 * browsing ahead. Live/done marking only applies when `isToday` is true --
 * comparing a *different* day's classes against the current clock time
 * would be comparing across days, not "is this happening right now." */
export function renderDayTimeline(
  meetings: readonly TimetableMeeting[], periods: readonly TimetablePeriod[], now: Date, isToday: boolean,
  cursorPeriod?: number,
): string {
  return renderTimeline(meetings, periods, now, isToday, true, cursorPeriod);
}

/** A single-line day switcher: all 7 weekday abbreviations, the selected
 * one bracketed and styled, today's marked with the same dot used
 * elsewhere in the grid. Sits above renderDayTimeline as the "which day am
 * I looking at" header for the small-terminal single-day view. */
export function renderDaySwitcher(selectedWeekday: number, todayWeekday: number): string {
  const leftArrow = pickIcon('←', '<');
  const rightArrow = pickIcon('→', '>');
  const todayMark = pickIcon('•', '*');
  const labels = WEEKDAY_KEYS.map((_, i) => {
    const wd = i + 1;
    const label = `${weekdayShortLabel(wd)}${wd === todayWeekday ? todayMark : ''}`;
    if (wd === selectedWeekday) return type.cursor(`[${label}]`);
    return type.hint(label);
  }).join('   ');
  return `${space.indent}${type.hint(leftArrow)}  ${labels}  ${type.hint(rightArrow)}`;
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

/** The full, untruncated detail behind one grid cell -- reached by drilling
 * into a meeting from the interactive grid (Enter on a cursor cell). Unlike
 * the grid's own cells, nothing here is truncated: this is the "show it all
 * on demand" counterpart to the grid's "cram what fits, drill down for the
 * rest" cell format. */
export function renderMeetingDetail(meeting: TimetableMeeting, periods: readonly TimetablePeriod[]): string {
  const trans = t();
  const rows: Array<[string, string]> = [
    [trans.timetable.detailTime, `${weekdayShortLabel(meeting.weekday)} ${span(meeting, periods)}`],
  ];
  if (meeting.location) rows.push([trans.timetable.detailLocation, meeting.location]);
  if (meeting.teacherNames.length > 0) {
    rows.push([trans.timetable.detailTeacher, meeting.teacherNames.join(trans.timetable.teacherSeparator)]);
  }
  rows.push([trans.timetable.detailWeeks, formatWeekRange(meeting.weeks)]);

  const labelWidth = rows.reduce((w, [label]) => Math.max(w, visualWidth(label)), 0);
  const lines = [
    `${space.indent}${type.heading(meeting.courseName)}`,
    '',
    ...rows.map(([label, value]) => `${space.indent}${type.label(padEndV(label, labelWidth))}   ${type.body(value)}`),
  ];
  return lines.join('\n');
}

export function renderUnresolvedItems(items: readonly TimetableUnresolvedItem[]): string {
  const trans = t();
  if (items.length === 0) return `${space.indent}${type.hint(trans.timetable.unresolvedEmpty)}`;
  const dot = pickIcon('·', '-');
  const lines = items.map((item) => {
    const name = item.sourceFields.kcmc ?? trans.timetable.unresolvedUnknownItem;
    const detail = item.sourceFields.sjkcgs ?? item.sourceFields.qsjsz ?? '';
    return `${space.indent}${type.body(name)}${detail ? `  ${dot}  ${type.hint(detail)}` : ''}`;
  });
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

/** A term-length, one-glyph-per-week density strip: coarser than the daily
 * Events heatmap (a term-scale view, not a day-scale one), bucketed relative
 * to this term's own busiest week rather than fixed absolute thresholds — a
 * fixed "9-16 slots = medium" guess would misclassify a light-course-load
 * student's whole term as uniformly light, or a heavy one as uniformly busy. */
export function renderTermDensity(
  meetings: readonly TimetableMeeting[],
  weekOneMonday: string,
  currentWeek: number,
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

  // Month-label row: each week occupies exactly 2 *terminal columns* (1
  // glyph + 1 joining space), so a month's label targets column i*2. Unlike
  // calendar-heatmap.ts's month row (which sidesteps this by using fixed
  // single-width English abbreviations everywhere), this row uses real
  // Chinese labels ("10月") in zh locale, and 月 is a CJK character that
  // renders 2 columns wide — so "array index" and "terminal column" are not
  // the same thing here. We build the line by tracking the running visual
  // column and padding/appending strings, rather than writing into a
  // fixed-size array where each slot is implicitly assumed 1 column wide.
  let monthLabelText = '';
  let visualCol = 0;
  let prevMonth = -1;
  for (let i = 0; i < numWeeks; i++) {
    const date = weekStartDate(weekOneMonday, minWeek + i);
    const month = date.getMonth();
    if (month !== prevMonth) {
      prevMonth = month;
      const label = lang === 'zh'
        ? `${month + 1}月`
        : new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
      const targetCol = i * 2;
      if (targetCol > visualCol) {
        monthLabelText += ' '.repeat(targetCol - visualCol);
        visualCol = targetCol;
      }
      monthLabelText += label;
      visualCol += visualWidth(label);
    }
  }
  const monthLabelLine = `${space.indent}${monthLabelText}`;

  const glyphLine = `${space.indent}${levels.map((lvl) => applyDensityColor(levelGlyph(lvl), lvl)).join(' ')}`;

  // Current-week marker is a separate row below the strip, not a recolored
  // glyph cell — a single recolored cell would read as "something is wrong
  // with this week" rather than "you are here."
  const currentWeekIndex = Math.max(0, currentWeek - minWeek);
  const markerGlyph = pickIcon('↑', '^');
  const markerLine = `${space.indent}${type.hint(
    `${' '.repeat(currentWeekIndex * 2)}${markerGlyph} ${trans.timetable.termDensityThisWeek}`,
  )}`;

  const legendGlyphs = [0, 1, 2, 3, 4].map((lvl) => applyDensityColor(levelGlyph(lvl), lvl));
  const legendLine = `${space.indent}${type.hint(trans.calendar.heatmap.legendLess)} ${legendGlyphs.join('')} ${type.hint(trans.calendar.heatmap.legendMore)}`;

  return [
    `${space.indent}${type.heading(trans.timetable.termDensityTitle)}`,
    '',
    monthLabelLine,
    glyphLine,
    markerLine,
    '',
    legendLine,
  ].join('\n');
}

