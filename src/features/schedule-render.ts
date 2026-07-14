import type { TimetableMeeting, TimetablePeriod, TimetableUnresolvedItem } from '@nbtca/nbtcal/timetable';
import { countdownParts } from './calendar-query.js';
import type { NextClass } from './schedule-query.js';
import { meetingsInWeek } from './schedule-query.js';
import { type, space, glyph } from '../core/theme.js';
import { pickIcon } from '../core/icons.js';
import { padEndV, truncate } from '../core/text.js';
import { t } from '../i18n/index.js';

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
  const dot = pickIcon('·', '-');
  const loc = next.meeting.location ? `  ${dot}  ${next.meeting.location}` : '';
  return `${space.indent}${type.heading(glyph.cursor())} ${type.label(trans.timetable.nextClass)}  ${dot}  ${type.body(next.meeting.courseName)}${loc}  ${dot}  ${type.hint(when)}`;
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
    const head = live ? `${type.heading(marker)} ` : '  ';
    const loc = m.location ? `  ${dot}  ${type.hint(m.location)}` : '';
    return `${space.indent}${head}${type.hint(time)}  ${live ? type.heading(m.courseName) : type.body(m.courseName)}${loc}`;
  });
  return lines.join('\n');
}

const WEEKDAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const GAP_THRESHOLD_MINUTES = 30;

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => Number.parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

export function renderWeekGrid(meetings: readonly TimetableMeeting[], periods: readonly TimetablePeriod[], weekNumber: number, _now: Date): string {
  const week = meetingsInWeek(meetings, weekNumber);
  const cellW = 10;
  const rowHeadW = 4;
  const totalW = rowHeadW + cellW * 7;
  // cell lookup: weekday(1..7) × period → course
  const at = (wd: number, period: number): string => {
    const m = week.find((x) => x.weekday === wd && period >= x.startPeriod && period <= x.endPeriod);
    return m ? truncate(m.courseName, cellW) : '';
  };
  const lines: string[] = [];
  const header = padEndV('', rowHeadW) + WEEKDAY_KEYS.map((d) => padEndV(type.hint(d), cellW)).join('');
  lines.push(space.indent + header);
  const sorted = [...periods].sort((a, b) => a.period - b.period);
  sorted.forEach((p, i) => {
    const rowHead = type.hint(padEndV(`${t().timetable.periodShort}${p.period}`, rowHeadW));
    const cells = [1, 2, 3, 4, 5, 6, 7].map((wd) => {
      const v = at(wd, p.period);
      return padEndV(v ? type.body(v) : type.hint(pickIcon('·', '.')), cellW);
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
