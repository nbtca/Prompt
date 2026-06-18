/**
 * Heatmap renderer for calendar activity.
 * GitHub-contributions-style grid: 7 weekday rows (Mon..Sun), week columns.
 */

import chalk from 'chalk';
import type { HeatmapBucket } from '@nbtca/nbtcal';
import { pickIcon } from '../core/icons.js';
import { t, getCurrentLanguage } from '../i18n/index.js';

/** Parse a 'YYYY-MM-DD' date string into a UTC proxy Date (host-timezone-independent). */
function parseBucketDate(date: string): Date {
  const parts = date.split('-').map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(Date.UTC(y, m - 1, d));
}

/** 0=Sun,1=Mon,...,6=Sat -> Mon-indexed 0..6 */
function utcDayToMonIndex(utcDay: number): number {
  return (utcDay + 6) % 7;
}

/** Map a count to a unicode intensity glyph (or ASCII fallback). */
function countToGlyph(count: number): string {
  if (count <= 0) return pickIcon('·', ' ');
  if (count === 1) return pickIcon('░', '.');
  if (count === 2) return pickIcon('▒', ':');

  if (count === 3) return pickIcon('▓', '-');
  return pickIcon('█', '=');
}

/** Apply a green color ramp based on count. Identity when count is 0. */
function applyColor(glyph: string, count: number, useColor: boolean): string {
  if (!useColor || count <= 0) return glyph;
  if (count === 1) return chalk.green(glyph);
  if (count === 2) return chalk.green(glyph);
  if (count === 3) return chalk.greenBright(glyph);
  return chalk.bold.greenBright(glyph);
}

/**
 * Render a GitHub-contributions-style heatmap grid.
 *
 * @param buckets  Dense daily buckets from nbtcal's .heatmap() call.
 * @param today    The "today" date (used to determine the end column).
 * @param options  Optional rendering options.
 */
export function renderHeatmap(
  buckets: HeatmapBucket[],
  today: Date,
  options?: { color?: boolean }
): string {
  const useColor = options?.color === true;
  const trans = t();

  // Build a lookup map: 'YYYY-MM-DD' -> count
  const countByDate = new Map<string, number>();
  for (const b of buckets) {
    countByDate.set(b.date, b.count);
  }

  // Determine the grid window.
  // The grid ends at "today" (aligned to Mon-start week column).
  // The grid starts 365 days before today.
  const todayProxy = new Date(Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  ));

  // Find the Monday that starts the week containing today
  const todayMonIndex = utcDayToMonIndex(todayProxy.getUTCDay());
  const gridEndMs = todayProxy.getTime() + (6 - todayMonIndex) * 86400000; // Sunday of today's week

  // Grid start: 52 full weeks back from the start of today's week, plus today's partial week
  // Total columns = 53 weeks
  const numCols = 53;
  const gridStartMs = gridEndMs - (numCols * 7 - 1) * 86400000;
  const gridStart = new Date(gridStartMs);

  // Build column data: array of 53 columns, each with 7 day slots
  // columns[col][row] = { date: 'YYYY-MM-DD', count } | null (padding)
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

  // Month labels row. Labels are 3-letter English abbreviations (universal and
  // single-width, so alignment holds in any language). Each grid column occupies
  // 2 terminal cells (glyph + joining space); we write each month's label into a
  // character buffer starting at the column where that month begins, letting it
  // overflow rightward into the spacing of the following columns (months are
  // ~4-5 columns apart, so labels never collide).
  const weekdayLabel = '   '; // 3-char prefix, matches the grid rows' "Mo " prefix
  const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
  const cellsWidth = numCols * 2;
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
      const start = col * 2;
      for (let i = 0; i < label.length && start + i < cellsWidth; i++) {
        monthChars[start + i] = label[i] ?? ' ';
      }
    }
  }
  const monthLabelLine = weekdayLabel + monthChars.join('');

  // Weekday labels (Mon/Wed/Fri only, index 0/2/4 in Mon-indexed scheme)
  const lang = getCurrentLanguage();
  const weekdayNames = lang === 'zh'
    ? ['一', '  ', '三', '  ', '五', '  ', '  ']
    : ['Mo', '  ', 'We', '  ', 'Fr', '  ', '  '];

  // Build output lines
  const lines: string[] = [];

  // Title line
  lines.push(trans.calendar.heatmap.title);
  lines.push('');

  // Month labels line
  lines.push(monthLabelLine);

  // Grid rows (7 rows: Mon..Sun)
  for (let row = 0; row < 7; row++) {
    const wdLabel = weekdayNames[row] ?? '  ';
    const cells = columns.map(col => {
      const cell = col[row];
      if (cell === null || cell === undefined) return ' ';
      const glyph = countToGlyph(cell.count);
      return applyColor(glyph, cell.count, useColor);
    });
    lines.push(`${wdLabel} ${cells.join(' ')}`);
  }

  // Legend line
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
    `${trans.calendar.heatmap.legendLess} ${legendColored.join('')} ${trans.calendar.heatmap.legendMore}`
  );

  return lines.join('\n');
}
