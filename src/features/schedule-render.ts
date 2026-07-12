import type { TimetableMeeting, TimetablePeriod } from '@nbtca/nbtcal/timetable';
import { countdownParts } from './calendar-query.js';
import type { NextClass } from './schedule-query.js';
import { type, space, glyph } from '../core/theme.js';
import { pickIcon } from '../core/icons.js';
import { t } from '../i18n/index.js';

function span(m: TimetableMeeting, periods: readonly TimetablePeriod[]): string {
  const s = periods.find((p) => p.period === m.startPeriod)?.start ?? '';
  const e = periods.find((p) => p.period === m.endPeriod)?.end ?? '';
  return e ? `${s}–${e}` : s;
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
