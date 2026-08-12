import chalk from 'chalk';
import type { HeatmapBucket } from '@nbtca/nbtcal';
import { pickIcon } from '../core/icons.js';
import { space, type } from '../core/theme.js';
import { t, getCurrentLanguage } from '../i18n/index.js';

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

function countToGlyph(count: number): string {
  if (count <= 0) return pickIcon('·', ' ');
  if (count === 1) return pickIcon('░', '.');
  if (count === 2) return pickIcon('▒', ':');

  if (count === 3) return pickIcon('▓', '-');
  return pickIcon('█', '=');
}

const HEATMAP_RAMP = ['#1b4332', '#2d6a4f', '#40916c', '#52b788'] as const;
const MAX_WEEK_COLUMNS = 53;
const GRID_PREFIX_WIDTH = 6;

function applyColor(glyph: string, count: number, useColor: boolean): string {
  if (!useColor || count <= 0) return glyph;
  const level = Math.min(count, HEATMAP_RAMP.length) - 1;
  return chalk.hex(HEATMAP_RAMP[level] as string)(glyph);
}

export function renderHeatmap(
  buckets: HeatmapBucket[],
  today: Date,
  options?: { color?: boolean; cols?: number },
): string {
  const useColor = options?.color === true;
  const trans = t();
  const cellWidth =
    options?.cols !== undefined && options.cols < GRID_PREFIX_WIDTH + MAX_WEEK_COLUMNS * 2 ? 1 : 2;
  const availableColumns =
    options?.cols === undefined
      ? MAX_WEEK_COLUMNS
      : Math.floor((options.cols - GRID_PREFIX_WIDTH) / cellWidth);
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
  const monthChars = new Array<string>(cellsWidth).fill(' ');
  let prevMonth = -1;
  for (let col = 0; col < numCols; col++) {
    let labelDate: Date | null = null;
    for (let row = 0; row < 7; row++) {
      const cell = columns[col]?.[row];
      if (cell !== null && cell !== undefined) {
        labelDate = parseBucketDate(cell.date);
        break;
      }
    }
    if (labelDate === null) continue;
    const month = labelDate.getUTCMonth();
    if (month !== prevMonth) {
      prevMonth = month;
      const label = monthFmt.format(labelDate); // e.g. "Jun"
      const start = col * cellWidth;
      for (let i = 0; i < label.length && start + i < cellsWidth; i++) {
        monthChars[start + i] = label[i] ?? ' ';
      }
    }
  }
  const monthLabelLine = space.indent + weekdayLabel + monthChars.join('');

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
      const glyph = countToGlyph(cell.count);
      return applyColor(glyph, cell.count, useColor);
    });
    lines.push(`${space.indent}${wdLabel} ${cells.join(cellWidth === 2 ? ' ' : '')}`);
  }

  const legendGlyphs = [
    pickIcon('·', ' '),
    pickIcon('░', '.'),
    pickIcon('▒', ':'),
    pickIcon('▓', '-'),
    pickIcon('█', '='),
  ];
  const legendColored = useColor
    ? [
        legendGlyphs[0] ?? '·',
        applyColor(legendGlyphs[1] ?? '░', 1, true),
        applyColor(legendGlyphs[2] ?? '▒', 2, true),
        applyColor(legendGlyphs[3] ?? '▓', 3, true),
        applyColor(legendGlyphs[4] ?? '█', 4, true),
      ]
    : legendGlyphs;

  lines.push('');
  lines.push(
    `${space.indent}${type.hint(trans.calendar.heatmap.legendLess)} ${legendColored.join('')} ${type.hint(trans.calendar.heatmap.legendMore)}`,
  );

  return lines.join('\n');
}
