import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import chalk from 'chalk';
import type {
  Timetable,
  TimetableMeeting,
  TimetablePeriod,
  TimetableUnresolvedItem,
} from '@nbtca/nbtcal/timetable';
import {
  renderNextClassBanner,
  renderWeekGrid as renderTimetableWeekGrid,
  renderUnresolvedItems,
  renderTodayTimeline,
  renderTermDensity,
  renderMeetingDetail,
  renderDayTimeline,
  renderDaySwitcher,
  renderWeekAgenda,
  formatClassCountdown,
  weekdayShortLabel,
} from './schedule-render.js';
import { setLanguage } from '../i18n/index.js';
import { resetIconCache } from '../core/icons.js';
import { campusDateTime } from '@nbtca/nbtcal/timetable';
import { stripAnsi, visualWidth } from '../core/text.js';
import { bodyEdge, space } from '../core/theme.js';

beforeAll(() => {
  setLanguage('en');
});
beforeEach(() => {
  process.env['NBTCA_ICON_MODE'] = 'ascii';
  resetIconCache();
});
const done = () => {
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
};

const periods: TimetablePeriod[] = [
  { period: 1, label: null, start: '08:00', end: '08:45' },
  { period: 2, label: null, start: '08:55', end: '09:40' },
];
const MIN_COL_WIDTH_FOR_TESTS = 8;
function mk(o: Partial<TimetableMeeting>): TimetableMeeting {
  return {
    sourceId: null,
    courseName: 'Math',
    teacherNames: ['Dr Li'],
    location: 'Room 201',
    weekday: 1,
    startPeriod: 1,
    endPeriod: 2,
    weeks: [1],
    kind: 'regular',
    ...o,
  };
}

function renderWeekGrid(
  meetings: readonly TimetableMeeting[],
  timetablePeriods: readonly TimetablePeriod[],
  week: number,
  now: Date,
  cols?: number,
  cursor?: { weekday: number; period: number },
): string {
  const timetable: Timetable = {
    term: { academicYear: '2026', semester: '3' },
    meetings,
    unresolvedItems: [],
    periods: timetablePeriods,
    calendarDays: [],
    warnings: [],
    fetchedAt: new Date('2026-08-01T00:00:00Z'),
  };
  return renderTimetableWeekGrid(timetable, week, now, cols, cursor);
}

function lineAt(lines: readonly string[], index: number): string {
  const line = lines[index];
  if (line === undefined) throw new Error(`Expected line ${String(index)}`);
  return line;
}

function findLine(lines: readonly string[], predicate: (line: string) => boolean): string {
  const line = lines.find(predicate);
  if (line === undefined) throw new Error('Expected a matching line');
  return line;
}

describe('renderNextClassBanner', () => {
  it('drops its own label when a heading already names it', () => {
    const out = stripAnsi(
      renderNextClassBanner(
        { meeting: mk({}), start: campusDateTime('2026-09-07', '08:00') },
        campusDateTime('2026-09-07', '06:30'),
        Number.POSITIVE_INFINITY,
        false,
      ),
    );
    expect(out).not.toContain('Next');
    expect(out).toContain('Math');
  });

  it('shows the course + countdown', () => {
    const out = stripAnsi(
      renderNextClassBanner(
        { meeting: mk({}), start: campusDateTime('2026-09-07', '08:00') },
        campusDateTime('2026-09-07', '06:30'),
      ),
    );
    expect(out).toContain('Next');
    expect(out).toContain('Math');
    expect(out).toMatch(/1h/);
    done();
  });
  it('marks the banner with a dot rather than the selection cursor', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    const out = stripAnsi(
      renderNextClassBanner(
        { meeting: mk({}), start: campusDateTime('2026-09-07', '08:00') },
        campusDateTime('2026-09-07', '06:30'),
      ),
    );
    expect(out.startsWith(`${space.indent}● `)).toBe(true);
    expect(out).not.toContain('→');
    done();
  });

  it('empty when no next class', () => {
    expect(renderNextClassBanner(null, new Date())).toBe('');
    done();
  });

  it('keeps the course and countdown ahead of the location at forty columns', () => {
    const out = stripAnsi(
      renderNextClassBanner(
        {
          meeting: mk({
            courseName: 'Advanced Distributed Systems Architecture',
            location: 'Building 12 Room 304',
          }),
          start: campusDateTime('2026-09-07', '08:00'),
        },
        campusDateTime('2026-09-07', '06:30'),
        40,
      ),
    );

    expect(visualWidth(out)).toBeLessThanOrEqual(37);
    expect(out).toContain('Advanc');
    expect(out).toContain('1h 30m');
    expect(out).not.toContain('Building 12 Room 304');
    done();
  });

  it('uses a compact course and countdown banner at twenty columns', () => {
    const out = stripAnsi(
      renderNextClassBanner(
        {
          meeting: mk({}),
          start: campusDateTime('2026-09-07', '08:00'),
        },
        campusDateTime('2026-09-07', '06:30'),
        20,
      ),
    );

    expect(visualWidth(out)).toBeLessThanOrEqual(20);
    expect(out).toContain('Math');
    expect(out).toContain('1h 30m');
    expect(out).not.toContain('Room 201');
    expect(out).not.toContain('Next');
    done();
  });
});

describe('renderWeekGrid', () => {
  it("renders weekday headers and places a course's name in its cell", () => {
    const out = stripAnsi(
      renderWeekGrid(
        [
          mk({
            courseName: 'Math',
            location: null,
            weekday: 1,
            startPeriod: 1,
            endPeriod: 1,
            weeks: [1],
          }),
        ],
        periods,
        1,
        campusDateTime('2026-09-07', '09:00'),
      ),
    );
    expect(out).toMatch(/Mon/); // weekday header
    expect(out).toContain('Math'); // placed in Mon / period 1
    done();
  });

  it('marks the header of the current weekday and no other', () => {
    const out = stripAnsi(renderWeekGrid([], periods, 1, campusDateTime('2026-09-07', '09:00')));
    const headerLine = lineAt(out.split('\n'), 0);
    expect(headerLine).toMatch(/Mon\*/);
    expect(headerLine).not.toMatch(/Tue\*/);
    done();
  });

  describe('row headers show the real clock time range, not an abstract period number', () => {
    it("shows the period's real start-end time range as the row label", () => {
      const out = stripAnsi(renderWeekGrid([], periods, 1, campusDateTime('2026-09-07', '09:00')));
      const lines = out.split('\n');
      expect(lines.some((l) => l.trim().startsWith('08:00-08:45'))).toBe(true); // period 1
      expect(lines.some((l) => l.trim().startsWith('08:55-09:40'))).toBe(true); // period 2
      expect(out).not.toMatch(/\bP1\b/);
      done();
    });
  });

  describe('course name and location are on separate lines within a cell', () => {
    it('places the course name on one line and the location on the very next line', () => {
      const out = stripAnsi(
        renderWeekGrid(
          [
            mk({
              courseName: 'Math',
              location: 'sl707',
              weekday: 1,
              startPeriod: 1,
              endPeriod: 1,
              weeks: [1],
            }),
          ],
          periods,
          1,
          campusDateTime('2026-09-07', '09:00'),
          120,
        ),
      );
      const lines = out.split('\n');
      const nameLineIdx = lines.findIndex((l) => l.includes('Math'));
      const locLineIdx = lines.findIndex((l) => l.includes('sl707'));
      expect(nameLineIdx).toBeGreaterThan(-1);
      expect(locLineIdx).toBe(nameLineIdx + 1);
      done();
    });

    it('shows the full location even when the course name alone would need far more room than the terminal has', () => {
      const out = stripAnsi(
        renderWeekGrid(
          [
            mk({
              courseName: 'Advanced Mathematics And Engineering Foundations',
              location: 'sl707',
              weekday: 1,
              startPeriod: 1,
              endPeriod: 1,
              weeks: [1],
            }),
          ],
          periods,
          1,
          campusDateTime('2026-09-07', '09:00'),
          60,
        ),
      );
      expect(out).toContain('sl707');
      done();
    });

    it('falls back to just the course name (no second line of content) when a meeting has no location', () => {
      const out = stripAnsi(
        renderWeekGrid(
          [
            mk({
              courseName: 'Math',
              location: null,
              weekday: 1,
              startPeriod: 1,
              endPeriod: 1,
              weeks: [1],
            }),
          ],
          periods,
          1,
          campusDateTime('2026-09-07', '09:00'),
        ),
      );
      expect(out).toContain('Math');
      done();
    });
  });

  describe('per-column width adaptivity', () => {
    it("grows a column to fit that day's own long course name", () => {
      const longName = '工业机器人系统'; // 7 CJK chars = 14 display columns
      const out = stripAnsi(
        renderWeekGrid(
          [
            mk({
              courseName: longName,
              location: null,
              weekday: 1,
              startPeriod: 1,
              endPeriod: 1,
              weeks: [1],
            }),
          ],
          periods,
          1,
          campusDateTime('2026-09-07', '09:00'),
          120,
        ),
      );
      expect(out).toContain(longName);
      done();
    });

    it("does not let one day's long course name affect another day's column width", () => {
      const longName = '习近平新时代中国特色社会主义';
      const meetings = [
        mk({
          courseName: 'PE',
          location: null,
          weekday: 1,
          startPeriod: 1,
          endPeriod: 1,
          weeks: [1],
        }),
        mk({
          courseName: longName,
          location: null,
          weekday: 2,
          startPeriod: 1,
          endPeriod: 1,
          weeks: [1],
        }),
      ];
      const out = stripAnsi(
        renderWeekGrid(meetings, periods, 1, campusDateTime('2026-09-07', '09:00'), 120),
      );
      expect(out).toContain(longName);
      const header = lineAt(out.split('\n'), 0);
      const [monday = '', tuesday = ''] = header.slice(space.indent.length + 14).split(' | ');
      expect(visualWidth(monday)).toBeLessThan(visualWidth(longName) / 2);
      expect(visualWidth(tuesday)).toBe(visualWidth(longName));
      done();
    });

    it('spreads spare width evenly across the days and stays inside the frame', () => {
      const out = stripAnsi(
        renderWeekGrid(
          [mk({ courseName: 'Programming Lab', location: null, weekday: 5, endPeriod: 1 })],
          periods,
          1,
          campusDateTime('2026-09-07', '09:00'),
          115,
        ),
      );
      const row = findLine(out.split('\n'), (line) => line.trim().startsWith('08:00'));
      const cells = row.slice(space.indent.length + 14).split(' | ');
      const widths = cells.map((cell) => visualWidth(cell));

      expect(visualWidth(row)).toBeGreaterThanOrEqual(115 - space.indent.length - 1);
      expect(visualWidth(row)).toBeLessThanOrEqual(115 - space.indent.length);
      const others = widths.filter((_, index) => index !== 4);
      expect(Math.max(...others) - Math.min(...others)).toBeLessThanOrEqual(1);
      done();
    });

    it('keeps a three-column gutter between the time column and the first day', () => {
      const out = stripAnsi(
        renderWeekGrid(
          [mk({ courseName: 'Advanced Maths', location: null, endPeriod: 1 })],
          periods,
          1,
          campusDateTime('2026-09-07', '09:00'),
          100,
        ),
      );
      const row = findLine(out.split('\n'), (line) => line.trim().startsWith('08:00'));
      expect(row).toMatch(/08:00-08:45 {3,}Advanced/);
      done();
    });

    it("caps column growth at the terminal's available width, truncating instead of overflowing", () => {
      const longName = '习近平新时代中国特色社会主义思想概论'; // 18 CJK chars = 36 display columns
      const out = stripAnsi(
        renderWeekGrid(
          [
            mk({
              courseName: longName,
              location: null,
              weekday: 1,
              startPeriod: 1,
              endPeriod: 1,
              weeks: [1],
            }),
          ],
          periods,
          1,
          campusDateTime('2026-09-07', '09:00'),
          80,
        ),
      );
      const headerLine = lineAt(out.split('\n'), 0);
      expect(visualWidth(headerLine)).toBeLessThanOrEqual(80);
      expect(out).not.toContain(longName); // not wide enough for the full name -- truncates, doesn't overflow
      done();
    });

    it('never lets the row grow wildly past the terminal width even at an extremely narrow size', () => {
      const longName = '习近平新时代中国特色社会主义思想概论';
      const out = stripAnsi(
        renderWeekGrid(
          [
            mk({
              courseName: longName,
              location: null,
              weekday: 1,
              startPeriod: 1,
              endPeriod: 1,
              weeks: [1],
            }),
          ],
          periods,
          1,
          campusDateTime('2026-09-07', '09:00'),
          60,
        ),
      );
      const headerLine = lineAt(out.split('\n'), 0);
      expect(visualWidth(headerLine)).toBeLessThan(70); // bounded, not unbounded
      expect(out).not.toContain(longName);
      done();
    });
  });

  it('keeps every day within one column of the others when the widest day nearly fits seven times', () => {
    const meetings = [
      mk({ courseName: '程序设计实践', location: null, weekday: 5, endPeriod: 1 }),
      mk({ courseName: 'PE', location: null, weekday: 1, endPeriod: 1 }),
    ];
    const header = lineAt(
      stripAnsi(
        renderWeekGrid(meetings, periods, 1, campusDateTime('2026-09-07', '09:00'), 120),
      ).split('\n'),
      0,
    );
    const separators = [...header.matchAll(/\|/g)].map((match) => match.index);
    const gaps = separators.slice(1).map((index, i) => index - (separators[i] ?? 0));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
    done();
  });

  it('keeps equal-width days inside the rule, which is inset by the indent on the right', () => {
    const meetings = [mk({ courseName: '程序设计实践', location: null, weekday: 5, endPeriod: 1 })];
    const lines = stripAnsi(
      renderWeekGrid(meetings, periods, 1, campusDateTime('2026-09-07', '09:00'), 117),
    ).split('\n');
    for (const line of lines) expect(visualWidth(line)).toBeLessThanOrEqual(114);
    done();
  });

  describe('a vertical separator marks the boundary between adjacent weekday columns', () => {
    it('shows a separator between every pair of adjacent columns, on every row', () => {
      const out = stripAnsi(renderWeekGrid([], periods, 1, campusDateTime('2026-09-07', '09:00')));
      const lines = out.split('\n').filter((l) => l.trim().length > 0);
      for (const line of lines) {
        expect((line.match(/\|/g) ?? []).length).toBe(6); // 6 separators between 7 columns
      }
      done();
    });
  });

  describe('cell content is centered within each column, not left-anchored', () => {
    it('centers a short empty-cell glyph within a wide column', () => {
      const out = stripAnsi(
        renderWeekGrid([], periods, 1, campusDateTime('2026-09-07', '09:00'), 200),
      );
      const lines = out.split('\n');
      const row = findLine(lines, (line) => line.trim().startsWith('08:00'));
      const mondayCell = row.slice(space.indent.length + 12, row.indexOf('|'));
      expect(mondayCell).toMatch(/^\s+/);
      done();
    });

    it('centers the weekday header label within its column', () => {
      const out = stripAnsi(
        renderWeekGrid([], periods, 1, campusDateTime('2026-09-07', '09:00'), 200),
      );
      const headerLine = lineAt(out.split('\n'), 0);
      const monIdx = headerLine.indexOf('Mon');
      expect(monIdx).toBeGreaterThan(space.indent.length + 12);
      done();
    });
  });

  describe('consecutive periods of the same meeting collapse into one labeled cell', () => {
    it('labels only the starting period of a multi-period meeting, not every period it spans', () => {
      const out = stripAnsi(
        renderWeekGrid(
          [
            mk({
              courseName: 'Math',
              location: 'sl707',
              weekday: 1,
              startPeriod: 1,
              endPeriod: 2,
              weeks: [1],
            }),
          ],
          periods,
          1,
          campusDateTime('2026-09-07', '09:00'),
          100,
        ),
      );
      const lines = out.split('\n');
      const p2NameLine = findLine(lines, (line) => line.trim().startsWith('08:55'));
      const p2LocLine = lineAt(lines, lines.indexOf(p2NameLine) + 1);
      expect(p2NameLine).not.toContain('Math');
      expect(p2LocLine).not.toContain('sl707');
      done();
    });

    it('shows a plain connector, not a "no class" dot, on both lines of a continuation period', () => {
      const out = stripAnsi(
        renderWeekGrid(
          [
            mk({
              courseName: 'Math',
              location: 'sl707',
              weekday: 1,
              startPeriod: 1,
              endPeriod: 2,
              weeks: [1],
            }),
          ],
          periods,
          1,
          campusDateTime('2026-09-07', '09:00'),
          100,
        ),
      );
      const lines = out.split('\n');
      const p2NameLine = findLine(lines, (line) => line.trim().startsWith('08:55'));
      const p2LocLine = lineAt(lines, lines.indexOf(p2NameLine) + 1);
      const colStart = space.indent.length + 12;
      const mondayNameCell = p2NameLine.slice(colStart, colStart + MIN_COL_WIDTH_FOR_TESTS).trim();
      const mondayLocCell = p2LocLine.slice(colStart, colStart + MIN_COL_WIDTH_FOR_TESTS).trim();
      expect(mondayNameCell).toBe('|'); // ascii connector glyph, not '.'
      expect(mondayLocCell).toBe('|');
      done();
    });
  });

  describe('cursor visual treatment', () => {
    it('brackets the cursor cell instead of painting a background', () => {
      const level = chalk.level;
      chalk.level = 3;
      try {
        const meeting = mk({
          courseName: 'Math',
          location: 'sl707',
          weekday: 1,
          startPeriod: 1,
          endPeriod: 1,
          weeks: [1],
        });
        const out = renderWeekGrid(
          [meeting],
          periods,
          1,
          campusDateTime('2026-09-07', '09:00'),
          80,
          { weekday: 1, period: 1 },
        );
        expect(out).not.toContain('\x1b[48;2;14;165;233m');
        const lines = stripAnsi(out).split('\n');
        expect(lines.some((line) => line.includes('[Math]'))).toBe(true);
        expect(lines.some((line) => line.includes('sl707'))).toBe(true);
      } finally {
        chalk.level = level;
      }
      done();
    });

    it('does not style a non-cursor cell with the cursor token', () => {
      const level = chalk.level;
      chalk.level = 3;
      try {
        const meeting = mk({
          courseName: 'Math',
          location: null,
          weekday: 2,
          startPeriod: 1,
          endPeriod: 1,
          weeks: [1],
        });
        const out = renderWeekGrid(
          [meeting],
          periods,
          1,
          campusDateTime('2026-09-07', '09:00'),
          80,
          {
            weekday: 1,
            period: 1,
          },
        );
        const mathIndex = out.indexOf('Math');
        const nearMath = out.slice(Math.max(0, mathIndex - 15), mathIndex);
        expect(nearMath).not.toContain('\x1b[48;2;14;165;233m');
      } finally {
        chalk.level = level;
      }
      done();
    });

    it('does not crash when the cursor points at an empty cell', () => {
      expect(() =>
        renderWeekGrid([], periods, 1, campusDateTime('2026-09-07', '09:00'), 80, {
          weekday: 1,
          period: 1,
        }),
      ).not.toThrow();
      done();
    });

    it('marks an empty cursor cell with a bracketed dot instead of a solid block', () => {
      const level = chalk.level;
      chalk.level = 3;
      try {
        const out = renderWeekGrid([], periods, 1, campusDateTime('2026-09-07', '09:00'), 100, {
          weekday: 2,
          period: 1,
        });
        expect(out).not.toContain('\x1b[48;2;14;165;233m');
        const firstRow = findLine(stripAnsi(out).split('\n'), (line) => line.includes('08:00'));
        expect(firstRow).toContain('[.]');
      } finally {
        chalk.level = level;
      }
      done();
    });

    it.each([1, 4, 7] as const)(
      'keeps a column-filling name whole under the cursor on weekday %i',
      (weekday) => {
        const meetings = ([1, 2, 3, 4, 5, 6, 7] as const).map((wd) =>
          mk({ courseName: 'Calculus', location: null, weekday: wd, weeks: [1] }),
        );
        const at = { weekday, period: 1 };
        const now = campusDateTime('2026-09-07', '09:00');
        const plain = stripAnsi(renderWeekGrid(meetings, periods, 1, now, 100)).split('\n');
        const cursor = stripAnsi(renderWeekGrid(meetings, periods, 1, now, 100, at)).split('\n');
        const row = (lines: string[]) => findLine(lines, (line) => line.includes('08:00'));
        expect(row(plain)).not.toContain('…');
        expect(row(cursor)).toContain('[Calculus]');
        expect(visualWidth(row(cursor))).toBeLessThanOrEqual(bodyEdge(100));
        const bars = (line: string) => [...line.matchAll(/\|/g)].map((match) => match.index);
        expect(bars(row(cursor))).toEqual(bars(row(plain)));
        done();
      },
    );

    it("keeps the bracket cursor on today's own column", () => {
      const out = stripAnsi(
        renderWeekGrid([], periods, 1, campusDateTime('2026-09-07', '09:00'), 100, {
          weekday: 1,
          period: 1,
        }),
      );
      expect(out).toContain('[.]');
      done();
    });
  });
});

const periodsWithGap: TimetablePeriod[] = [
  ...periods,
  { period: 3, label: null, start: '13:30', end: '14:15' }, // 09:40 -> 13:30 is a 3h50m gap
];

describe('renderWeekGrid gap marker', () => {
  it('inserts a separator line when the gap to the next period exceeds 30 minutes', () => {
    const out = stripAnsi(
      renderWeekGrid([], periodsWithGap, 1, campusDateTime('2026-09-07', '09:00')),
    );
    const lines = out.split('\n');
    const p2Index = lines.findIndex((l) => l.includes('08:55'));
    const p3Index = lines.findIndex((l) => l.includes('13:30'));
    expect(p2Index).toBeGreaterThan(-1);
    expect(p3Index).toBe(p2Index + 3);
    done();
  });
  it('does not insert a separator between adjacent periods', () => {
    const out = stripAnsi(renderWeekGrid([], periods, 1, campusDateTime('2026-09-07', '09:00')));
    const lines = out.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(1 + periods.length * 2);
    done();
  });
});

describe('renderMeetingDetail', () => {
  it('shows the full, untruncated course name as the title', () => {
    const long = '习近平新时代中国特色社会主义思想概论';
    const out = stripAnsi(
      renderMeetingDetail(
        mk({ courseName: long, weekday: 1, startPeriod: 1, endPeriod: 2 }),
        periods,
      ),
    );
    expect(out).toContain(long);
  });

  it('shows weekday + real clock time range', () => {
    const out = stripAnsi(
      renderMeetingDetail(mk({ weekday: 3, startPeriod: 1, endPeriod: 2 }), periods),
    );
    expect(out).toContain('Wed');
    expect(out).toContain('08:00-09:40');
  });

  it('names the weekday the way the grid header and today heading do in Chinese', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    setLanguage('zh');
    try {
      const out = stripAnsi(renderMeetingDetail(mk({ weekday: 1, endPeriod: 2 }), periods));
      expect(out).toMatch(/时间\s+周一 08:00–09:40/);
      const grid = stripAnsi(
        renderWeekGrid([], periods, 1, campusDateTime('2026-09-07', '09:00'), 120),
      );
      expect(grid).toContain('08:00–08:45');
    } finally {
      setLanguage('en');
      done();
    }
  });

  it('shows the location when present', () => {
    const out = stripAnsi(renderMeetingDetail(mk({ location: 'sl707' }), periods));
    expect(out).toContain('sl707');
  });

  it('omits the location row entirely when there is none, rather than showing an empty value', () => {
    const out = stripAnsi(renderMeetingDetail(mk({ location: null }), periods));
    expect(out).not.toContain('Location');
  });

  it('joins multiple teachers with the locale separator', () => {
    const out = stripAnsi(renderMeetingDetail(mk({ teacherNames: ['Dr Li', 'Dr Wu'] }), periods));
    expect(out).toContain('Dr Li, Dr Wu');
  });

  it('omits the teacher row entirely when there are none', () => {
    const out = stripAnsi(renderMeetingDetail(mk({ teacherNames: [] }), periods));
    expect(out).not.toContain('Teacher');
  });

  it('formats a contiguous week span as a range', () => {
    const out = stripAnsi(
      renderMeetingDetail(
        mk({ weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] }),
        periods,
      ),
    );
    expect(out).toContain('1-16');
  });

  it('falls back to a comma list for a non-contiguous week span', () => {
    const out = stripAnsi(renderMeetingDetail(mk({ weeks: [1, 3, 5] }), periods));
    expect(out).toContain('1, 3, 5');
  });

  it('never collapses into one array entry when split on newlines', () => {
    const out = renderMeetingDetail(mk({}), periods);
    expect(out.split('\n').length).toBeGreaterThan(1);
    for (const line of out.split('\n')) expect(line).not.toContain('\n');
  });

  it('wraps every detail value without losing content at twenty columns', () => {
    const lines = renderMeetingDetail(
      mk({
        courseName: 'Advanced Distributed Systems Architecture',
        location: 'International Innovation Center Room 304',
        teacherNames: ['Alexandria Montgomery', 'Bartholomew Richardson'],
        weeks: [1, 3, 5, 7, 9, 11, 13, 15],
      }),
      periods,
      20,
    ).split('\n');
    const text = lines.map(stripAnsi).join(' ').replace(/\s+/g, ' ').trim();
    const locationLabel = lines.map(stripAnsi).findIndex((line) => line.trim() === 'Location');

    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(text).toContain('Advanced Distributed Systems Architecture');
    expect(text).toContain('International Innovation Center Room 304');
    expect(text).toContain('Alexandria Montgomery, Bartholomew Richardson');
    expect(text).toContain('1, 3, 5, 7, 9, 11, 13, 15');
    expect(locationLabel).toBeGreaterThanOrEqual(0);
    expect(stripAnsi(lines[locationLabel + 1] ?? '').trim()).toBe('International');
  });
});

const dayPeriods: TimetablePeriod[] = [
  { period: 1, label: null, start: '08:00', end: '09:40' },
  { period: 2, label: null, start: '09:50', end: '11:30' },
  { period: 3, label: null, start: '13:30', end: '15:20' },
];

describe('renderTodayTimeline', () => {
  it('lines up the status column when course names differ in width', () => {
    const meetings = [
      mk({ courseName: '形势与政策', startPeriod: 1, endPeriod: 1 }),
      mk({ courseName: '社团活动', startPeriod: 2, endPeriod: 2 }),
    ];
    const lines = stripAnsi(
      renderTodayTimeline(meetings, dayPeriods, campusDateTime('2026-09-07', '12:00')),
    ).split('\n');
    const column = (line: string): number => visualWidth(line.slice(0, line.indexOf('Done')));

    expect(column(lineAt(lines, 0))).toBe(column(lineAt(lines, 1)));
    done();
  });

  it('shows the empty-state line when there are no classes today', () => {
    expect(stripAnsi(renderTodayTimeline([], dayPeriods, new Date()))).toContain(
      'No classes today',
    );
    done();
  });

  it('marks finished classes as done and lists their start time', () => {
    const meetings = [mk({ courseName: 'Math', startPeriod: 1, endPeriod: 1 })];
    const out = stripAnsi(
      renderTodayTimeline(meetings, dayPeriods, campusDateTime('2026-09-07', '12:00')),
    );
    expect(out).toContain('08:00');
    expect(out).toContain('Math');
    expect(out).toContain('Done');
    done();
  });

  it('marks the in-progress class with a remaining-minutes countdown and its location', () => {
    const meetings = [
      mk({ courseName: 'Data Structures', location: 'Bldg 1-302', startPeriod: 3, endPeriod: 3 }),
    ];
    const out = stripAnsi(
      renderTodayTimeline(meetings, dayPeriods, campusDateTime('2026-09-07', '14:55')),
    );
    expect(out).toContain('Data Structures');
    expect(out).toContain('In progress');
    expect(out).toContain('25 min left');
    expect(out).toContain('Bldg 1-302');
    done();
  });

  it('drops the location first and keeps a live class inside the frame at sixty columns', () => {
    const meetings = [
      mk({
        courseName: 'Physics',
        location: 'Engineering Building 1-302',
        startPeriod: 3,
        endPeriod: 3,
      }),
    ];
    const lines = renderTodayTimeline(
      meetings,
      dayPeriods,
      campusDateTime('2026-09-07', '14:55'),
      60,
    ).split('\n');
    const classLine = stripAnsi(lines[0] ?? '');

    expect(lines.every((line) => visualWidth(line) <= 60 - space.indent.length)).toBe(true);
    expect(classLine).toContain('In progress');
    expect(classLine).toContain('25 min left');
    expect(classLine).not.toContain('Engineering');
    done();
  });

  it('truncates the course with an ellipsis at forty columns', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    const meetings = [
      mk({
        courseName: 'Introduction to Data Structures',
        location: 'Bldg 1-302',
        startPeriod: 3,
        endPeriod: 3,
      }),
    ];
    const lines = renderTodayTimeline(
      meetings,
      dayPeriods,
      campusDateTime('2026-09-07', '14:55'),
      40,
    ).split('\n');
    const classLine = stripAnsi(lines[0] ?? '');

    expect(lines.every((line) => visualWidth(line) <= 40 - space.indent.length)).toBe(true);
    expect(classLine).toContain('Intro');
    expect(classLine).toContain('…');
    expect(classLine).toContain('25 min left');
    expect(classLine).not.toContain('In progress');
    expect(classLine).not.toContain('Bldg 1-302');
    done();
  });

  it('leaves an upcoming class unmarked (no Done/In progress status)', () => {
    const meetings = [mk({ courseName: 'Physics', startPeriod: 2, endPeriod: 2 })];
    const out = stripAnsi(
      renderTodayTimeline(meetings, dayPeriods, campusDateTime('2026-09-07', '07:00')),
    );
    expect(out).toContain('Physics');
    expect(out).not.toContain('Done');
    expect(out).not.toContain('In progress');
    done();
  });

  it('lines the closing connector up with the class connectors', () => {
    const meetings = [mk({ startPeriod: 1, endPeriod: 1 }), mk({ startPeriod: 2, endPeriod: 2 })];
    const lines = stripAnsi(
      renderTodayTimeline(meetings, dayPeriods, campusDateTime('2026-09-07', '07:00')),
    ).split('\n');
    const connector = (line = '') => line.search(/[┬┼┴+]/);
    expect(connector(lines.at(-1))).toBe(connector(lines[0]));
    expect(connector(lines[0])).toBeGreaterThan(0);
    done();
  });

  it('closes the timeline with the last class end time', () => {
    const meetings = [mk({ startPeriod: 1, endPeriod: 1 })];
    const out = stripAnsi(
      renderTodayTimeline(meetings, dayPeriods, campusDateTime('2026-09-07', '07:00')),
    );
    expect(out).toContain('09:40'); // period 1's end time closes the timeline
  });

  it('never returns a value containing a literal newline per rendered row (single joined string by design)', () => {
    const meetings = [
      mk({ startPeriod: 1, endPeriod: 1 }),
      mk({ courseName: 'Physics', startPeriod: 2, endPeriod: 2 }),
    ];
    const out = renderTodayTimeline(meetings, dayPeriods, campusDateTime('2026-09-07', '07:00'));
    expect(out.split('\n').length).toBeGreaterThan(1);
  });
});

describe('renderDayTimeline', () => {
  it('lines up the location column across finished and upcoming classes', () => {
    const meetings = [
      mk({ courseName: 'Policy', location: 'Hall', startPeriod: 1, endPeriod: 1 }),
      mk({ courseName: 'Club activity', location: 'Maker space', startPeriod: 3, endPeriod: 3 }),
    ];
    const lines = stripAnsi(
      renderDayTimeline(meetings, dayPeriods, campusDateTime('2026-09-07', '10:00'), {
        weekday: 1,
        isToday: true,
      }),
    ).split('\n');

    expect(lineAt(lines, 0).indexOf('Hall')).toBe(lineAt(lines, 1).indexOf('Maker space'));
    done();
  });

  it('shows the empty-state line when the viewed day has no classes', () => {
    expect(
      stripAnsi(renderDayTimeline([], dayPeriods, new Date(), { weekday: 1, isToday: true })),
    ).toContain('No classes today');
    done();
  });

  it('names the viewed weekday when it is not today', () => {
    expect(
      stripAnsi(renderDayTimeline([], dayPeriods, new Date(), { weekday: 7, isToday: false })),
    ).toContain('No classes on Sunday');
    setLanguage('zh');
    try {
      expect(
        stripAnsi(renderDayTimeline([], dayPeriods, new Date(), { weekday: 7, isToday: false })),
      ).toContain('星期日没有课');
    } finally {
      setLanguage('en');
    }
    done();
  });

  it("always shows a class's location, not just the live one -- unlike renderTodayTimeline", () => {
    const meetings = [
      mk({ courseName: 'Physics', location: 'Bldg 1-302', startPeriod: 2, endPeriod: 2 }),
    ];
    const out = stripAnsi(
      renderDayTimeline(meetings, dayPeriods, campusDateTime('2026-09-07', '07:00'), {
        weekday: 1,
        isToday: true,
      }),
    );
    expect(out).toContain('Bldg 1-302');
    done();
  });

  it('keeps time and course visible at twenty columns', () => {
    const meetings = [
      mk({ courseName: 'Math', location: 'Bldg 1-302', startPeriod: 1, endPeriod: 1 }),
    ];
    const lines = renderDayTimeline(
      meetings,
      dayPeriods,
      campusDateTime('2026-09-07', '07:00'),
      { weekday: 1, isToday: false },
      undefined,
      20,
    ).split('\n');
    const classLine = stripAnsi(lines[0] ?? '');

    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(classLine).toContain('08:00');
    expect(classLine).toContain('Math');
    expect(classLine).not.toContain('Bldg 1-302');
    done();
  });

  it('marks live/done status when isToday is true, same as renderTodayTimeline', () => {
    const meetings = [mk({ courseName: 'Math', startPeriod: 1, endPeriod: 1 })];
    const out = stripAnsi(
      renderDayTimeline(meetings, dayPeriods, campusDateTime('2026-09-07', '12:00'), {
        weekday: 1,
        isToday: true,
      }),
    );
    expect(out).toContain('Done');
    done();
  });

  it('never marks live/done status when isToday is false, even if the clock time would otherwise match a class', () => {
    const meetings = [mk({ courseName: 'Math', startPeriod: 1, endPeriod: 1 })];
    const out = stripAnsi(
      renderDayTimeline(meetings, dayPeriods, campusDateTime('2026-09-07', '08:30'), {
        weekday: 1,
        isToday: false,
      }),
    );
    expect(out).not.toContain('Done');
    expect(out).not.toContain('In progress');
    done();
  });

  it("highlights the meeting whose span covers the given cursor period, whether it is the meeting's starting period or a later one", () => {
    const level = chalk.level;
    chalk.level = 3;
    try {
      const meetings = [mk({ courseName: 'Math', startPeriod: 1, endPeriod: 2 })];
      const startCursor = renderDayTimeline(
        meetings,
        dayPeriods,
        campusDateTime('2026-09-07', '07:00'),
        { weekday: 1, isToday: false },
        1,
      );
      expect(startCursor).toContain('\x1b[48;2;14;165;233m');
      const noCursor = renderDayTimeline(
        meetings,
        dayPeriods,
        campusDateTime('2026-09-07', '07:00'),
        { weekday: 1, isToday: false },
      );
      expect(noCursor).not.toContain('\x1b[48;2;14;165;233m');
    } finally {
      chalk.level = level;
    }
    done();
  });

  it('never collapses into one array entry when split on newlines', () => {
    const meetings = [mk({ startPeriod: 1, endPeriod: 1 })];
    const out = renderDayTimeline(meetings, dayPeriods, campusDateTime('2026-09-07', '07:00'), {
      weekday: 1,
      isToday: true,
    });
    expect(out.split('\n').length).toBeGreaterThan(1);
  });
});

describe('renderDaySwitcher', () => {
  it('brackets the selected weekday and shows all seven days', () => {
    const out = stripAnsi(renderDaySwitcher(2, 1));
    for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
      expect(out).toContain(label);
    expect(out).toContain('[Tue]');
    done();
  });

  it('marks today with the same dot glyph used in the week grid, independent of which day is selected', () => {
    const out = stripAnsi(renderDaySwitcher(3, 1)); // selected=Wed, today=Mon
    expect(out).toContain('Mon*'); // ascii today-marker (see theme.ts's pickIcon('•', '*'))
    done();
  });

  it('never collapses into more than one logical line (single-line by design)', () => {
    const out = renderDaySwitcher(1, 1);
    expect(out.split('\n').length).toBe(1);
  });

  it('keeps every selected weekday visible within twenty columns', () => {
    for (let weekday = 1; weekday <= 7; weekday += 1) {
      const out = stripAnsi(renderDaySwitcher(weekday, 1, 20));
      expect(visualWidth(out)).toBeLessThanOrEqual(20);
      expect(out).toContain(`[${weekdayShortLabel(weekday)}${weekday === 1 ? '*' : ''}]`);
    }
  });

  it('shows a balanced weekday window around a late-week selection', () => {
    const out = stripAnsi(renderDaySwitcher(5, 1, 40));

    expect(visualWidth(out)).toBeLessThanOrEqual(37);
    expect(out).toContain('[Fri]');
    expect(out).toContain('Thu');
    expect(out).toContain('Sat');
    expect(out).not.toContain('Mon');
  });
});

describe('renderUnresolvedItems', () => {
  const items: TimetableUnresolvedItem[] = [
    {
      kind: 'practice',
      itemIndex: 0,
      sourceFields: { kcmc: 'Fitness test', sjkcgs: 'Fitness test / week 16' },
    },
  ];

  it('lists each item by its course name and detail', () => {
    const out = stripAnsi(renderUnresolvedItems(items));
    expect(out).toContain('Fitness test');
    done();
  });

  it('shows a non-empty empty-state for no items', () => {
    const out = stripAnsi(renderUnresolvedItems([]));
    expect(out.trim().length).toBeGreaterThan(0);
    done();
  });

  it('wraps long names and details without losing content at twenty columns', () => {
    const longItems: TimetableUnresolvedItem[] = [
      {
        kind: 'practice',
        itemIndex: 0,
        sourceFields: {
          kcmc: 'Advanced Physical Education Practice',
          sjkcgs: 'Campus fitness assessment during teaching week sixteen',
        },
      },
    ];
    const lines = renderUnresolvedItems(longItems, 20).split('\n');
    const text = lines.map(stripAnsi).join(' ').replace(/\s+/g, ' ').trim();

    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(text).toContain('Advanced Physical Education Practice');
    expect(text).toContain('Campus fitness assessment during teaching week sixteen');
    done();
  });

  it('wraps the empty state at twenty columns', () => {
    const lines = renderUnresolvedItems([], 20).split('\n');
    const text = lines.map(stripAnsi).join(' ').replace(/\s+/g, ' ').trim();

    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(text).toBe('Nothing needs attention');
    done();
  });
});

describe('renderTermDensity', () => {
  const chartRows = (out: string): string[] =>
    out.split('\n').filter((line) => /^\s*\d*\s[|+]\s/.test(line));

  it('scales each week against the busiest one', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    try {
      const meetings: TimetableMeeting[] = [
        mk({ weeks: [1], startPeriod: 1, endPeriod: 1 }),
        mk({ weeks: [2], startPeriod: 1, endPeriod: 4 }),
      ];
      const lines = stripAnsi(renderTermDensity(meetings, '2026-09-07', 1)).split('\n');
      const top = lines.find((line) => line.includes('┤')) ?? '';
      const bottom = lines[lines.findIndex((line) => line.includes('└')) - 1] ?? '';

      expect(top).toMatch(/^\s*4 ┤\s+██$/);
      expect(bottom).toMatch(/[▁▂▃▄▅▆▇█]{2} ██$/);
    } finally {
      done();
    }
  });

  it('summarises the load, free weeks, and this week in words', () => {
    const meetings: TimetableMeeting[] = [
      mk({ weeks: [1, 2, 4], startPeriod: 1, endPeriod: 2 }),
      mk({ weeks: [4], startPeriod: 3, endPeriod: 3 }),
    ];
    const out = stripAnsi(renderTermDensity(meetings, '2026-09-07', 2));

    expect(out).toContain('4 weeks');
    expect(out).toContain('1 without classes');
    expect(out).toContain('2-3 periods a week');
    expect(out).toContain('2 this week');
  });

  it('breaks the summary between phrases rather than inside one', () => {
    const lines = stripAnsi(renderTermDensity([mk({ weeks: [1, 2] })], '2026-09-07', 1, 30)).split(
      '\n',
    );
    expect(lines).toContain('   2 weeks');
    expect(lines).toContain('   2 periods a week');
    expect(lines).toContain('   2 this week');
  });

  it('labels every week and marks the current one', () => {
    const meetings: TimetableMeeting[] = [mk({ weeks: [1, 2, 3, 4, 5] })];
    const lines = stripAnsi(renderTermDensity(meetings, '2026-09-07', 3)).split('\n');
    const numbers = lines.find((line) => /^\s+1\s+2\s+3\s+4\s+5$/.test(line)) ?? '';
    const marker = lines.find((line) => line.includes('This week')) ?? '';

    expect(numbers).not.toBe('');
    expect(marker.indexOf('^')).toBe(numbers.indexOf('3') - 1);
  });

  it('shows a plain notice when there are no meetings at all', () => {
    const out = stripAnsi(renderTermDensity([], '2026-09-07', 5));
    expect(out).toContain('No classes scheduled this term');
    expect(chartRows(out)).toHaveLength(0);
  });

  it('never collapses into one array entry when split on newlines', () => {
    const out = renderTermDensity([mk({ weeks: [1] })], '2026-09-07', 1);
    const lines = out.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line).not.toContain('\n');
  });

  it('places a CJK month label over the week that starts the month', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    setLanguage('zh');
    try {
      const out = stripAnsi(renderTermDensity([mk({ weeks: [1, 14] })], '2026-09-07', 1));
      const lines = out.split('\n');
      const monthLine = lines.find((line) => line.includes('9月')) ?? '';
      const numbers = lines.find((line) => /^\s+1\s+2\s/.test(line)) ?? '';
      const octoberWeek = 5;

      const idx = monthLine.indexOf('10月');
      expect(visualWidth(monthLine.slice(0, idx))).toBe(numbers.indexOf(` ${octoberWeek} `));
    } finally {
      setLanguage('en');
      done();
    }
  });

  it.each(['en', 'zh'] as const)(
    'shows every week across narrow chunks and keeps a late current week visible (%s)',
    (language) => {
      setLanguage(language);
      try {
        const weeks = Array.from({ length: 18 }, (_, index) => index + 1);
        const lines = stripAnsi(renderTermDensity([mk({ weeks })], '2026-09-07', 18, 20)).split(
          '\n',
        );
        const bars = lines.filter((line) => /[|+] (?:## ?)+$/.test(line));
        const barCount = bars
          .filter((line) => line.includes('+ '))
          .join('')
          .match(/##/g);

        expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
        expect(barCount).toHaveLength(18);
        expect(lines.some((line) => line.includes('^'))).toBe(true);
      } finally {
        setLanguage('en');
        done();
      }
    },
  );
});

describe('formatClassCountdown', () => {
  const parts = (days: number, hours: number, minutes: number) => ({
    past: false,
    days,
    hours,
    minutes,
  });

  it('reads naturally in English', () => {
    expect(formatClassCountdown(parts(1, 12, 5))).toBe('in 1d 12h');
    expect(formatClassCountdown(parts(0, 17, 46))).toBe('in 17h 46m');
    expect(formatClassCountdown(parts(0, 0, 9))).toBe('in 9m');
  });

  it('reads naturally in Chinese', () => {
    setLanguage('zh');
    try {
      expect(formatClassCountdown(parts(1, 12, 5))).toBe('1 天 12 小时后');
      expect(formatClassCountdown(parts(0, 0, 9))).toBe('9 分钟后');
    } finally {
      setLanguage('en');
    }
  });
});

describe('renderWeekAgenda', () => {
  const agendaTimetable: Timetable = {
    term: { academicYear: '2026', semester: '3' },
    meetings: [
      mk({ courseName: 'Math', location: 'Room 201', weekday: 1, startPeriod: 1, endPeriod: 1 }),
      mk({ courseName: 'Physics', location: 'Lab 3', weekday: 1, startPeriod: 2, endPeriod: 2 }),
      mk({ courseName: 'History', location: null, weekday: 4, startPeriod: 1, endPeriod: 1 }),
    ],
    unresolvedItems: [],
    periods,
    calendarDays: [],
    warnings: [],
    fetchedAt: new Date('2026-08-01T00:00:00Z'),
  };
  const monday = campusDateTime('2026-09-07', '07:00');

  it('lists every weekday with its classes and locations', () => {
    const lines = renderWeekAgenda(agendaTimetable, 1, monday, 80).map(stripAnsi);
    expect(lines).toHaveLength(8);
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(lines.join('\n')).toContain(day);
    }
    expect(findLine(lines, (line) => line.includes('Math'))).toContain('Room 201');
    expect(findLine(lines, (line) => line.includes('Physics'))).toContain('08:55');
  });

  it('points at the class under the cursor', () => {
    const lines = renderWeekAgenda(agendaTimetable, 1, monday, 80, {
      weekday: 1,
      period: 2,
    }).map(stripAnsi);
    expect(
      findLine(lines, (line) => line.includes('Physics'))
        .trim()
        .startsWith('>'),
    ).toBe(true);
    expect(
      findLine(lines, (line) => line.includes('Math'))
        .trim()
        .startsWith('>'),
    ).toBe(false);
  });

  it('drops locations before course names at narrow widths', () => {
    const lines = renderWeekAgenda(agendaTimetable, 1, monday, 24).map(stripAnsi);
    expect(lines.every((line) => visualWidth(line) <= 24 - space.indent.length)).toBe(true);
    expect(lines.join('\n')).toContain('Math');
    expect(lines.join('\n')).not.toContain('Room 201');
  });

  it('fits a whole day on one line in the dense layout', () => {
    const lines = renderWeekAgenda(agendaTimetable, 1, monday, 40, undefined, true).map(stripAnsi);
    expect(lines).toHaveLength(7);
    expect(lineAt(lines, 0)).toContain('Math');
    expect(lineAt(lines, 0)).toContain('Physics');
  });
});
