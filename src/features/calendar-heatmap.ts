import type { HeatmapBucket } from '@nbtca/nbtcal';
import { pickIcon } from '../core/icons.js';
import { bodyWidth, c, space, type } from '../core/theme.js';
import { t, getCurrentLanguage } from '../i18n/index.js';
import { visualWidth } from '../core/text.js';

function parseBucketDate(date: string): Date {
  const parts = date.split('-').map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(Date.UTC(y, m - 1, d));
}

function utcDayToMonIndex(utcDay: number): number {
  return (utcDay + 6) % 7;
}

const LEVEL_GLYPHS = [
  ['·', ' '],
  ['░', '.'],
  ['▒', ':'],
  ['▓', '-'],
  ['█', '='],
] as const;
const MAX_WEEK_COLUMNS = 53;
const GRID_PREFIX_WIDTH = 6;

function levelCell(count: number, useColor: boolean): string {
  const level = Math.max(0, Math.min(count, LEVEL_GLYPHS.length - 1));
  const [unicode, ascii] = LEVEL_GLYPHS[level] ?? LEVEL_GLYPHS[0];
  const cell = pickIcon(unicode, ascii);
  if (!useColor) return cell;
  return level === 0 ? type.hint(cell) : c.success(cell);
}

interface MonthAnchor {
  start: number;
  date: Date;
}

function placeMonthLabels(
  anchors: readonly MonthAnchor[],
  width: number,
  format: (date: Date) => string,
  strict: boolean,
): string | undefined {
  let line = '';
  for (const [index, anchor] of anchors.entries()) {
    const label = format(anchor.date);
    const end = anchor.start + visualWidth(label);
    const used = visualWidth(line);
    const gap = index === 0 ? 2 : 1;
    const limit = (anchors[index + 1]?.start ?? width + gap) - gap;
    if (anchor.start >= used + (used > 0 ? 1 : 0) && end <= limit) {
      line += ' '.repeat(anchor.start - used) + label;
    } else if (strict && index > 0) {
      return undefined;
    }
  }
  return line;
}

export function renderHeatmap(
  buckets: HeatmapBucket[],
  today: Date,
  options?: { color?: boolean; cols?: number },
): string {
  const useColor = options?.color === true;
  const trans = t();
  const cols = bodyWidth(options?.cols ?? Number.POSITIVE_INFINITY);
  const cellWidth = cols < GRID_PREFIX_WIDTH + MAX_WEEK_COLUMNS * 2 ? 1 : 2;
  const availableColumns = Math.floor((cols - GRID_PREFIX_WIDTH) / cellWidth);
  const numCols = Math.max(1, Math.min(MAX_WEEK_COLUMNS, availableColumns));

  const countByDate = new Map<string, number>();
  for (const b of buckets) {
    countByDate.set(b.date, b.count);
  }

  const todayProxy = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

  const todayMonIndex = utcDayToMonIndex(todayProxy.getUTCDay());
  const gridEndMs = todayProxy.getTime() + (6 - todayMonIndex) * 86400000; // Sunday of today's week

  const gridStartMs = gridEndMs - (numCols * 7 - 1) * 86400000;
  const gridStart = new Date(gridStartMs);

  type Cell = { date: string; count: number } | null;
  const columns: Cell[][] = [];

  let cursor = new Date(gridStart.getTime());
  for (let col = 0; col < numCols; col++) {
    const column: Cell[] = [];
    for (let row = 0; row < 7; row++) {
      const cursorMonIdx = utcDayToMonIndex(cursor.getUTCDay());
      if (cursorMonIdx === row) {
        const y = cursor.getUTCFullYear();
        const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
        const d = String(cursor.getUTCDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        const count = countByDate.get(dateStr) ?? 0;
        column.push({ date: dateStr, count });
        cursor = new Date(cursor.getTime() + 86400000);
      } else {
        column.push(null);
      }
    }
    columns.push(column);
  }

  const weekdayLabel = space.indent; // matches the grid rows' "Mo " prefix width
  const language = getCurrentLanguage();
  const monthFmt = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
  const cellsWidth = numCols * cellWidth;
  const anchors: MonthAnchor[] = [];
  let prevMonth = -1;
  for (const [col, column] of columns.entries()) {
    const cell = column.find((candidate) => candidate !== null);
    if (!cell) continue;
    const date = parseBucketDate(cell.date);
    if (date.getUTCMonth() === prevMonth) continue;
    prevMonth = date.getUTCMonth();
    anchors.push({ start: col * cellWidth, date });
  }
  const monthNumber = (date: Date) => String(date.getUTCMonth() + 1);
  const monthLine =
    placeMonthLabels(anchors, cellsWidth, (date) => monthFmt.format(date), true) ??
    placeMonthLabels(anchors, cellsWidth, monthNumber, true) ??
    placeMonthLabels(anchors, cellsWidth, monthNumber, false) ??
    '';
  const monthLabelLine = space.indent + weekdayLabel + monthLine;

  const weekdayNames = [
    trans.timetable.weekdayMon.slice(0, 2),
    '  ',
    trans.timetable.weekdayWed.slice(0, 2),
    '  ',
    trans.timetable.weekdayFri.slice(0, 2),
    '  ',
    '  ',
  ];

  const lines: string[] = [];

  lines.push(space.indent + type.heading(trans.calendar.heatmap.title));
  lines.push('');

  lines.push(monthLabelLine);

  for (let row = 0; row < 7; row++) {
    const wdLabel = weekdayNames[row] ?? '  ';
    const cells = columns.map((col) => {
      const cell = col[row];
      if (cell === null || cell === undefined) return ' ';
      return levelCell(cell.count, useColor);
    });
    lines.push(`${space.indent}${wdLabel} ${cells.join(cellWidth === 2 ? ' ' : '')}`);
  }

  const legend = LEVEL_GLYPHS.map((_, level) => levelCell(level, useColor)).join('');

  lines.push('');
  lines.push(
    `${space.indent}${type.hint(trans.calendar.heatmap.legendLess)} ${legend} ${type.hint(trans.calendar.heatmap.legendMore)}`,
  );

  return lines.join('\n');
}
