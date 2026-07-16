import type { TimetableMeeting, TimetablePeriod, TimetableUnresolvedItem } from '@nbtca/nbtcal/timetable';
import { countdownParts, isCountdownUrgent } from './calendar-query.js';
import type { NextClass } from './schedule-query.js';
import { meetingsInWeek, campusWeekday } from './schedule-query.js';
import { c, type, space, glyph } from '../core/theme.js';
import { pickIcon } from '../core/icons.js';
import { padEndV, truncate } from '../core/text.js';
import { t, fmt } from '../i18n/index.js';

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

export function renderWeekGrid(meetings: readonly TimetableMeeting[], periods: readonly TimetablePeriod[], weekNumber: number, now: Date): string {
  const week = meetingsInWeek(meetings, weekNumber);
  const todayWd = campusWeekday(now);
  const cellW = 10;
  const rowHeadW = 4;
  const totalW = rowHeadW + cellW * 7;
  // cell lookup: weekday(1..7) × period → course
  const at = (wd: number, period: number): string => {
    const m = week.find((x) => x.weekday === wd && period >= x.startPeriod && period <= x.endPeriod);
    return m ? truncate(m.courseName, cellW) : '';
  };
  const lines: string[] = [];
  const todayMark = pickIcon('•', '*');
  const headerCells = WEEKDAY_KEYS.map((d, i) => {
    const wd = i + 1;
    const label = wd === todayWd ? `${d}${todayMark}` : d;
    return padEndV(wd === todayWd ? type.active(label) : type.hint(label), cellW);
  }).join('');
  lines.push(space.indent + padEndV('', rowHeadW) + headerCells);
  const sorted = [...periods].sort((a, b) => a.period - b.period);
  sorted.forEach((p, i) => {
    const rowHead = type.hint(padEndV(`${t().timetable.periodShort}${p.period}`, rowHeadW));
    const cells = [1, 2, 3, 4, 5, 6, 7].map((wd) => {
      const v = at(wd, p.period);
      const isToday = wd === todayWd;
      const text = v ? (isToday ? type.active(v) : type.body(v)) : type.hint(pickIcon('·', '.'));
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
