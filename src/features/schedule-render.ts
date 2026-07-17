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

/** A vertical timeline of today's classes: finished classes are dimmed and
 * marked done, the in-progress one (if any) is highlighted with a
 * remaining-minutes countdown and its location, and the timeline closes
 * with the last class's end time — a hand-drawn alternative to a flat list
 * that puts "what's happening right now" front and center. */
export function renderTodayTimeline(meetings: readonly TimetableMeeting[], periods: readonly TimetablePeriod[], now: Date): string {
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
    const isLive = nowStr >= startStr && nowStr <= endStr;
    const isDone = nowStr > endStr;
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
    const loc = isLive && m.location ? `   ${type.hint(m.location)}` : '';
    return `${space.indent}${timeCol} ${nameStyled}${statusCol}${loc}`;
  });

  const last = sorted[sorted.length - 1]!;
  const lastEnd = periods.find((p) => p.period === last.endPeriod)?.end ?? '23:59';
  lines.push(`${space.indent}  ${type.hint(lastEnd)} ${rule}${bottomConnector}${rule} ${type.hint(trans.timetable.timelineEnd)}`);

  return lines.join('\n');
}

/** A compact one-glyph-per-day summary of the current week: which days have
 * class, which are free, which are the weekend — the hub's at-a-glance view
 * before drilling into the full weekday×period grid. */
export function renderWeekStrip(meetings: readonly TimetableMeeting[], weekNumber: number, todayWeekday: number): string {
  const trans = t();
  const week = meetingsInWeek(meetings, weekNumber);
  const hasClassChar = pickIcon('▓▓', '##');
  const freeChar = pickIcon('░░', '..');
  const weekendChar = pickIcon('··', '..');

  const days = [1, 2, 3, 4, 5, 6, 7];
  const dayLabels = days.map((wd) => {
    const label = weekdayShortLabel(wd);
    return wd === todayWeekday ? type.active(label) : type.hint(label);
  }).join('  ');

  const cells = days.map((wd) => {
    const isWeekend = wd === 6 || wd === 7;
    const hasClass = week.some((m) => m.weekday === wd);
    const glyph = isWeekend ? weekendChar : (hasClass ? hasClassChar : freeChar);
    return wd === todayWeekday ? type.active(glyph) : type.hint(glyph);
  }).join('  ');

  const legend = type.hint(
    `${hasClassChar} = ${trans.timetable.weekStripHasClass}  ${freeChar} = ${trans.timetable.weekStripFree}  ${weekendChar} = ${trans.timetable.weekStripWeekend}`,
  );

  return [
    `${space.indent}${dayLabels}`,
    `${space.indent}${cells}     ${legend}`,
  ].join('\n');
}

const WEEKDAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const GAP_THRESHOLD_MINUTES = 30;

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => Number.parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

/** A cell's content when a meeting starts there: the location in full
 * whenever there's room (knowing *where* to go matters more than the exact
 * class title, which is usually recognizable even truncated), with the
 * course name truncated to whatever's left — and truncated to nothing
 * before the location itself ever gives up any width. */
function gridCellContent(m: TimetableMeeting, cellW: number): string {
  if (!m.location) return truncate(m.courseName, cellW);
  const sep = '  ';
  const locW = visualWidth(m.location);
  if (locW + sep.length >= cellW) return truncate(m.location, cellW);
  const nameW = cellW - locW - sep.length;
  return `${m.location}${sep}${truncate(m.courseName, nameW)}`;
}

export function renderWeekGrid(
  meetings: readonly TimetableMeeting[], periods: readonly TimetablePeriod[], weekNumber: number, now: Date, cols = 80,
): string {
  const week = meetingsInWeek(meetings, weekNumber);
  const todayWd = campusWeekday(now);
  // Row labels are the period's real clock start time ("08:00"), always
  // exactly 5 display columns — knowing when to actually be there is more
  // useful than an abstract period index. 6, not 5: "08:00" alone already
  // fills 5 columns with zero room for padEndV's own separating space
  // before the first cell (the same class of bug the old CJK period label
  // had, just for a uniformly-5-wide label instead of a variable one).
  const rowHeadW = 6;
  // Real cell content is "{location}  {courseName}" when a location is
  // known, course-name-only otherwise (see gridCellContent). Measure the
  // widest real content this week actually needs, capped by what the given
  // terminal can hold.
  const idealCellW = week.reduce((max, m) => {
    const w = m.location ? visualWidth(m.location) + 2 + visualWidth(m.courseName) : visualWidth(m.courseName);
    return Math.max(max, w);
  }, 0) || 10;
  // The floor is content-aware, not a flat 10: once a location is
  // prepended, a flat 10 is often *entirely* consumed by "location + the
  // 2-column separator", squeezing the course name down to zero real
  // characters (truncate() needs at least 5 columns to show even one real
  // CJK character before the "..." marker) -- exactly the kind of
  // "recognizable even truncated" name visibility the location-priority
  // format is supposed to preserve, not eliminate. Name-only cells (no
  // location) keep the original flat-10 floor, unchanged from before.
  const NAME_SLIVER = 5;
  const minCellW = week.reduce((max, m) => {
    const w = m.location ? visualWidth(m.location) + 2 + NAME_SLIVER : 10;
    return Math.max(max, w);
  }, 10);
  const availableCellW = Math.floor((cols - space.indent.length - rowHeadW) / 7);
  const cellW = Math.max(minCellW, Math.min(idealCellW, availableCellW));
  const totalW = rowHeadW + cellW * 7;
  // Consecutive periods of the same meeting collapse into one labeled cell
  // at its starting period — later periods in its span show a plain
  // connector instead of repeating the same course/location text down the
  // whole column. A genuine conflict (two meetings both starting at the
  // same weekday+period) is rare and, like the pre-existing lookup, just
  // shows whichever one is found first.
  const startingAt = (wd: number, period: number) => week.find((m) => m.weekday === wd && m.startPeriod === period);
  const continuingAt = (wd: number, period: number) => week.find((m) => m.weekday === wd && m.startPeriod < period && period <= m.endPeriod);
  const lines: string[] = [];
  const todayMark = pickIcon('•', '*');
  const connector = pickIcon('│', '|');
  const headerCells = WEEKDAY_KEYS.map((d, i) => {
    const wd = i + 1;
    const label = wd === todayWd ? `${d}${todayMark}` : d;
    return padEndV(wd === todayWd ? type.active(label) : type.hint(label), cellW);
  }).join('');
  lines.push(space.indent + padEndV('', rowHeadW) + headerCells);
  const sorted = [...periods].sort((a, b) => a.period - b.period);
  sorted.forEach((p, i) => {
    const rowHead = type.hint(padEndV(p.start, rowHeadW));
    const cells = [1, 2, 3, 4, 5, 6, 7].map((wd) => {
      const isToday = wd === todayWd;
      const starting = startingAt(wd, p.period);
      let text: string;
      if (starting) {
        const content = gridCellContent(starting, cellW);
        text = isToday ? type.active(content) : type.body(content);
      } else if (continuingAt(wd, p.period)) {
        text = type.hint(connector);
      } else {
        text = type.hint(pickIcon('·', '.'));
      }
      return padEndV(text, cellW);
    }).join('');
    lines.push(space.indent + rowHead + cells);

    const next = sorted[i + 1];
    if (next && minutesOf(next.start) - minutesOf(p.end) > GAP_THRESHOLD_MINUTES) {
      lines.push(space.indent + type.hint(pickIcon('╌', '-').repeat(totalW)));
    }
  });
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

function periodRangeLabel(start: number, end: number): string {
  const trans = t();
  const range = start === end ? `${start}` : `${start}-${end}`;
  return `${trans.timetable.periodShort}${range}${trans.timetable.periodSuffix}`;
}

/** Groups the current week's meetings by location — a re-sort of already-
 * familiar list rendering (heading()/hint()/bullet conventions used
 * everywhere else in this file), not a new density visualization. */
export function renderMeetingsByLocation(meetings: readonly TimetableMeeting[], weekNumber: number): string {
  const trans = t();
  const week = meetingsInWeek(meetings, weekNumber).filter((m) => m.location !== null);
  if (week.length === 0) return `${space.indent}${type.hint(trans.timetable.byLocationEmpty)}`;

  const byLocation = new Map<string, TimetableMeeting[]>();
  for (const m of week) {
    const loc = m.location as string;
    const list = byLocation.get(loc) ?? [];
    list.push(m);
    byLocation.set(loc, list);
  }
  // Plain string sort (not a locale-aware collation) so ordering is
  // deterministic across environments and installs, independent of the
  // host's configured locale.
  const locations = [...byLocation.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const dot = pickIcon('·', '-');
  const lines: string[] = [];
  locations.forEach((loc, i) => {
    if (i > 0) lines.push('');
    lines.push(`${space.indent}${type.heading(loc)}`);
    const sorted = [...(byLocation.get(loc) ?? [])].sort(
      (a, b) => a.weekday - b.weekday || a.startPeriod - b.startPeriod,
    );
    for (const m of sorted) {
      const weekdayLabel = `${trans.timetable.weekdayPrefix}${weekdayShortLabel(m.weekday)}`;
      const periodLabel = periodRangeLabel(m.startPeriod, m.endPeriod);
      lines.push(`${space.indent}${dot} ${type.body(weekdayLabel)} ${type.hint(periodLabel)}  ${type.body(m.courseName)}`);
    }
  });
  return lines.join('\n');
}
