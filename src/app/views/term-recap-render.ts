import { numeralLines } from '../../art/numerals.js';
import { useUnicodeIcons } from '../../core/icons.js';
import { visualWidth, wrapAnsiWithIndent } from '../../core/text.js';
import { bodyEdge, glyph, space, type } from '../../core/theme.js';
import { fmt, getCurrentLanguage, t } from '../../i18n/index.js';
import type { TermRecap } from '../../features/term-recap.js';

export const COUNT_UP_MS = 700;
const FILM_HOURS = 2;

export interface RecapCard {
  lead: string;
  value?: number;
  unit?: string;
  detail?: string;
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(
    getCurrentLanguage() === 'zh' ? 'zh-CN' : 'en-US',
    { month: 'long', day: 'numeric', timeZone: 'UTC' },
  );
}

export function recapCards(recap: TermRecap): RecapCard[] {
  const trans = t().recap;
  const cards: RecapCard[] = [
    {
      lead: recap.finished ? trans.classesLead : trans.classesLeadSoFar,
      value: recap.classes,
      unit: trans.classesUnit,
      detail: fmt(trans.classesDetail, {
        hours: recap.hours,
        courses: recap.courses,
        weeks: recap.weeks,
      }),
    },
    {
      lead: trans.earlyLead,
      value: recap.earlyClasses,
      unit: trans.earlyUnit,
      detail: recap.earlyClasses > 0 ? trans.earlyDetail : trans.earlyNone,
    },
  ];
  if (recap.busiestDay) {
    cards.push({
      lead: fmt(trans.busiestLead, { date: dayLabel(recap.busiestDay.date) }),
      value: recap.busiestDay.classes,
      unit: trans.classesUnit,
      detail: fmt(trans.busiestDetail, recap.busiestDay),
    });
  }
  if (recap.topCourse) {
    const films = Math.floor(recap.topCourse.hours / FILM_HOURS);
    cards.push({
      lead: fmt(trans.topLead, { course: recap.topCourse.name }),
      value: Math.round(recap.topCourse.hours),
      unit: trans.hoursUnit,
      ...(films > 0 ? { detail: fmt(trans.topDetail, { films }) } : {}),
    });
  }
  if (recap.favoriteRoom) {
    cards.push({
      lead: fmt(trans.roomLead, { room: recap.favoriteRoom.name }),
      value: recap.favoriteRoom.visits,
      unit: trans.roomUnit,
      detail: trans.roomDetail,
    });
  }
  if (recap.events) {
    cards.push({
      lead: trans.eventsLead,
      value: recap.events,
      unit: trans.eventsUnit,
      detail: trans.eventsDetail,
    });
  }
  cards.push({ lead: recap.finished ? trans.outro : trans.outroSoFar });
  return cards;
}

const easeOut = (x: number) => 1 - (1 - x) ** 3;

function numberLines(value: number, unit: string, cols: number): string[] {
  const big = numeralLines(String(value), useUnicodeIcons());
  const tail = `  ${type.body(unit)}`;
  const fits = visualWidth(space.indent) + (big[0] ? visualWidth(big[0]) : 0) + visualWidth(tail);
  if (fits > bodyEdge(cols)) return [`${space.indent}${type.active(String(value))}${tail}`];
  return big.map((line, row) => `${space.indent}${type.active(line)}${row === 1 ? tail : ''}`);
}

export function renderRecapCard(
  cards: readonly RecapCard[],
  index: number,
  heading: string,
  elapsedMs: number,
  cols: number,
): string[] {
  const card = cards[index];
  if (!card) return [];
  const wrap = (text: string, style: (s: string) => string) =>
    wrapAnsiWithIndent(style(text), cols, space.indent);
  const lines = [...wrap(heading, type.heading), '', ...wrap(card.lead, type.body), ''];
  if (card.value !== undefined) {
    const shown = Math.round(card.value * easeOut(Math.min(1, elapsedMs / COUNT_UP_MS)));
    lines.push(...numberLines(shown, card.unit ?? '', cols), '');
  }
  if (card.detail) lines.push(...wrap(card.detail, type.hint), '');
  const empty = useUnicodeIcons() ? '○' : '.';
  const dots = cards.map((_, i) => (i === index ? glyph.dot() : empty)).join(' ');
  lines.push(`${space.indent}${type.hint(dots)}`);
  return lines;
}
