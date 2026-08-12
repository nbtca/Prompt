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
  renderTodayClasses,
  renderWeekGrid as renderTimetableWeekGrid,
  renderUnresolvedItems,
  renderTodayTimeline,
  renderTermDensity,
  renderMeetingDetail,
  renderDayTimeline,
  renderDaySwitcher,
  weekdayShortLabel,
} from './schedule-render.js';
import { setLanguage } from '../i18n/index.js';
import { resetIconCache } from '../core/icons.js';
import { stripAnsi, visualWidth } from '../core/text.js';
import { space } from '../core/theme.js';

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
  it('shows the course + countdown', () => {
    const out = stripAnsi(
      renderNextClassBanner(
        { meeting: mk({}), start: new Date('2026-09-07T08:00:00') },
        new Date('2026-09-07T06:30:00'),
      ),
    );
    expect(out).toContain('Next');
    expect(out).toContain('Math');
    expect(out).toMatch(/1h/);
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
          start: new Date('2026-09-07T08:00:00'),
        },
        new Date('2026-09-07T06:30:00'),
        40,
      ),
    );

    expect(visualWidth(out)).toBeLessThanOrEqual(40);
    expect(out).toContain('Advanced');
    expect(out).toContain('1h 30m');
    expect(out).not.toContain('Building 12 Room 304');
    done();
  });

  it('uses a compact course and countdown banner at twenty columns', () => {
    const out = stripAnsi(
      renderNextClassBanner(
        {
          meeting: mk({}),
          start: new Date('2026-09-07T08:00:00'),
        },
        new Date('2026-09-07T06:30:00'),
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

describe('renderTodayClasses', () => {
  it('lists a class with its time and location', () => {
    const out = stripAnsi(renderTodayClasses([mk({})], periods, new Date('2026-09-07T07:00:00')));
    expect(out).toContain('08:00');
    expect(out).toContain('Math');
    expect(out).toContain('Room 201');
    done();
  });
  it('shows an empty-state line when there are none', () => {
    expect(stripAnsi(renderTodayClasses([], periods, new Date()))).toContain('No classes today');
    done();
  });
  it('marks the in-progress class', () => {
    const out = stripAnsi(
      renderTodayClasses(
        [mk({ startPeriod: 1, endPeriod: 1 })],
        periods,
        new Date('2026-09-07T08:10:00'),
      ),
    );
    expect(out).toContain('> '); // ascii in-progress marker
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
        new Date('2026-09-07T09:00:00'),
      ),
    );
    expect(out).toMatch(/Mon/); // weekday header
    expect(out).toContain('Math'); // placed in Mon / period 1
    done();
  });

  it('marks the header of the current weekday and no other', () => {
    const out = stripAnsi(renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00')));
    const headerLine = lineAt(out.split('\n'), 0);
    expect(headerLine).toMatch(/Mon\*/);
    expect(headerLine).not.toMatch(/Tue\*/);
    done();
  });

  describe('row headers show the real clock time range, not an abstract period number', () => {
    it("shows the period's real start-end time range as the row label", () => {
      const out = stripAnsi(renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00')));
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
          new Date('2026-09-07T09:00:00'),
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
          new Date('2026-09-07T09:00:00'),
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
          new Date('2026-09-07T09:00:00'),
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
          new Date('2026-09-07T09:00:00'),
          120,
        ),
      );
      expect(out).toContain(longName);
      done();
    });

    it("does not let one day's long course name affect another day's column width", () => {
      const longName = '习近平新时代中国特色社会主义思想概论'; // 18 CJK chars = 36 display columns
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
        renderWeekGrid(meetings, periods, 1, new Date('2026-09-07T09:00:00'), 250),
      );
      expect(out).toContain(longName); // Tuesday's column grew enough to fit it in full
      const headerLine = lineAt(out.split('\n'), 0);
      const globalWidthDesignTotal = space.indent.length + 12 + 36 * 7 + 6 * 3;
      expect(visualWidth(headerLine)).toBeLessThan(globalWidthDesignTotal - 36 * 3);
      done();
    });

    it('keeps a short floor width for a column with no real content', () => {
      const out = stripAnsi(renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00'), 300));
      const headerLine = lineAt(out.split('\n'), 0);
      expect(visualWidth(headerLine)).toBe(3 + 12 + 7 * 8 + 6 * 3);
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
          new Date('2026-09-07T09:00:00'),
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
          new Date('2026-09-07T09:00:00'),
          60,
        ),
      );
      const headerLine = lineAt(out.split('\n'), 0);
      expect(visualWidth(headerLine)).toBeLessThan(70); // bounded, not unbounded
      expect(out).not.toContain(longName);
      done();
    });
  });

  describe('a vertical separator marks the boundary between adjacent weekday columns', () => {
    it('shows a separator between every pair of adjacent columns, on every row', () => {
      const out = stripAnsi(renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00')));
      const lines = out.split('\n').filter((l) => l.trim().length > 0);
      for (const line of lines) {
        expect((line.match(/\|/g) ?? []).length).toBe(6); // 6 separators between 7 columns
      }
      done();
    });
  });

  describe('cell content is centered within each column, not left-anchored', () => {
    it('centers a short empty-cell glyph within a wide column', () => {
      const out = stripAnsi(renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00'), 200));
      const lines = out.split('\n');
      const row = findLine(lines, (line) => line.trim().startsWith('08:00'));
      const mondayCell = row.slice(space.indent.length + 12, row.indexOf('|'));
      expect(mondayCell).toMatch(/^\s+/);
      done();
    });

    it('centers the weekday header label within its column', () => {
      const out = stripAnsi(renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00'), 200));
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
          new Date('2026-09-07T09:00:00'),
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
          new Date('2026-09-07T09:00:00'),
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
    it('applies a distinct cursor style to the cursor cell, different from the same render with no cursor', () => {
      const level = chalk.level;
      chalk.level = 3;
      try {
        const meeting = mk({
          courseName: 'Math',
          location: null,
          weekday: 1,
          startPeriod: 1,
          endPeriod: 1,
          weeks: [1],
        });
        const withCursor = renderWeekGrid(
          [meeting],
          periods,
          1,
          new Date('2026-09-07T09:00:00'),
          80,
          { weekday: 1, period: 1 },
        );
        const withoutCursor = renderWeekGrid(
          [meeting],
          periods,
          1,
          new Date('2026-09-07T09:00:00'),
          80,
        );
        expect(withCursor).not.toBe(withoutCursor);
        expect(withCursor).toContain('\x1b[48;2;14;165;233m'); // type.cursor's solid background escape
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
        const out = renderWeekGrid([meeting], periods, 1, new Date('2026-09-07T09:00:00'), 80, {
          weekday: 1,
          period: 1,
        });
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
        renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00'), 80, {
          weekday: 1,
          period: 1,
        }),
      ).not.toThrow();
      done();
    });

    it('pads the cursor cell to the full column width *before* applying the background style, so the highlight covers the whole cell, not just the real text', () => {
      const level = chalk.level;
      chalk.level = 3;
      try {
        const out = renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00'), 100, {
          weekday: 1,
          period: 1,
        });
        const BG_OPEN = '\x1b[48;2;14;165;233m';
        const bgStart = out.indexOf(BG_OPEN);
        expect(bgStart).toBeGreaterThan(-1);
        const bgClose = out.indexOf('\x1b[49m', bgStart);
        expect(bgClose).toBeGreaterThan(bgStart);
        const spanned = stripAnsi(out.slice(bgStart + BG_OPEN.length, bgClose));
        expect(spanned.length).toBe(MIN_COL_WIDTH_FOR_TESTS);
      } finally {
        chalk.level = level;
      }
      done();
    });

    it('covers both the name line and the location line of the cursor cell, not just one', () => {
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
        const out = renderWeekGrid([meeting], periods, 1, new Date('2026-09-07T09:00:00'), 80, {
          weekday: 1,
          period: 1,
        });
        const lines = out.split('\n');
        const nameLine = findLine(lines, (line) => line.includes('Math'));
        const locLine = lineAt(lines, lines.indexOf(nameLine) + 1);
        expect(nameLine).toContain('\x1b[48;2;14;165;233m');
        expect(locLine).toContain('\x1b[48;2;14;165;233m');
      } finally {
        chalk.level = level;
      }
      done();
    });

    it("shows the cursor token even when the cursor lands on today's own column", () => {
      const level = chalk.level;
      chalk.level = 3;
      try {
        const out = renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00'), 80, {
          weekday: 1,
          period: 1,
        });
        expect(out).toContain('\x1b[48;2;14;165;233m');
      } finally {
        chalk.level = level;
      }
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
    const out = stripAnsi(renderWeekGrid([], periodsWithGap, 1, new Date('2026-09-07T09:00:00')));
    const lines = out.split('\n');
    const p2Index = lines.findIndex((l) => l.includes('08:55'));
    const p3Index = lines.findIndex((l) => l.includes('13:30'));
    expect(p2Index).toBeGreaterThan(-1);
    expect(p3Index).toBe(p2Index + 3);
    done();
  });
  it('does not insert a separator between adjacent periods', () => {
    const out = stripAnsi(renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00')));
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
  it('shows the empty-state line when there are no classes today', () => {
    expect(stripAnsi(renderTodayTimeline([], dayPeriods, new Date()))).toContain(
      'No classes today',
    );
    done();
  });

  it('marks finished classes as done and lists their start time', () => {
    const meetings = [mk({ courseName: 'Math', startPeriod: 1, endPeriod: 1 })];
    const out = stripAnsi(
      renderTodayTimeline(meetings, dayPeriods, new Date('2026-09-07T12:00:00')),
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
      renderTodayTimeline(meetings, dayPeriods, new Date('2026-09-07T14:55:00')),
    );
    expect(out).toContain('Data Structures');
    expect(out).toContain('In progress');
    expect(out).toContain('25m left');
    expect(out).toContain('Bldg 1-302');
    done();
  });

  it('compacts a live class before truncating its course at forty columns', () => {
    const meetings = [
      mk({
        courseName: 'Data Structures',
        location: 'Bldg 1-302',
        startPeriod: 3,
        endPeriod: 3,
      }),
    ];
    const lines = renderTodayTimeline(
      meetings,
      dayPeriods,
      new Date('2026-09-07T14:55:00'),
      40,
    ).split('\n');
    const classLine = stripAnsi(lines[0] ?? '');

    expect(lines.every((line) => visualWidth(line) <= 40)).toBe(true);
    expect(classLine).toContain('Data Structures');
    expect(classLine).toContain('25m');
    expect(classLine).not.toContain('In progress');
    expect(classLine).not.toContain('Bldg 1-302');
    done();
  });

  it('leaves an upcoming class unmarked (no Done/In progress status)', () => {
    const meetings = [mk({ courseName: 'Physics', startPeriod: 2, endPeriod: 2 })];
    const out = stripAnsi(
      renderTodayTimeline(meetings, dayPeriods, new Date('2026-09-07T07:00:00')),
    );
    expect(out).toContain('Physics');
    expect(out).not.toContain('Done');
    expect(out).not.toContain('In progress');
    done();
  });

  it('closes the timeline with the last class end time', () => {
    const meetings = [mk({ startPeriod: 1, endPeriod: 1 })];
    const out = stripAnsi(
      renderTodayTimeline(meetings, dayPeriods, new Date('2026-09-07T07:00:00')),
    );
    expect(out).toContain('09:40'); // period 1's end time closes the timeline
  });

  it('never returns a value containing a literal newline per rendered row (single joined string by design)', () => {
    const meetings = [
      mk({ startPeriod: 1, endPeriod: 1 }),
      mk({ courseName: 'Physics', startPeriod: 2, endPeriod: 2 }),
    ];
    const out = renderTodayTimeline(meetings, dayPeriods, new Date('2026-09-07T07:00:00'));
    expect(out.split('\n').length).toBeGreaterThan(1);
  });
});

describe('renderDayTimeline', () => {
  it('shows the empty-state line when the viewed day has no classes', () => {
    expect(stripAnsi(renderDayTimeline([], dayPeriods, new Date(), true))).toContain(
      'No classes today',
    );
    done();
  });

  it("always shows a class's location, not just the live one -- unlike renderTodayTimeline", () => {
    const meetings = [
      mk({ courseName: 'Physics', location: 'Bldg 1-302', startPeriod: 2, endPeriod: 2 }),
    ];
    const out = stripAnsi(
      renderDayTimeline(meetings, dayPeriods, new Date('2026-09-07T07:00:00'), true),
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
      new Date('2026-09-07T07:00:00'),
      false,
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
      renderDayTimeline(meetings, dayPeriods, new Date('2026-09-07T12:00:00'), true),
    );
    expect(out).toContain('Done');
    done();
  });

  it('never marks live/done status when isToday is false, even if the clock time would otherwise match a class', () => {
    const meetings = [mk({ courseName: 'Math', startPeriod: 1, endPeriod: 1 })];
    const out = stripAnsi(
      renderDayTimeline(meetings, dayPeriods, new Date('2026-09-07T08:30:00'), false),
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
        new Date('2026-09-07T07:00:00'),
        false,
        1,
      );
      expect(startCursor).toContain('\x1b[48;2;14;165;233m');
      const noCursor = renderDayTimeline(
        meetings,
        dayPeriods,
        new Date('2026-09-07T07:00:00'),
        false,
      );
      expect(noCursor).not.toContain('\x1b[48;2;14;165;233m');
    } finally {
      chalk.level = level;
    }
    done();
  });

  it('never collapses into one array entry when split on newlines', () => {
    const meetings = [mk({ startPeriod: 1, endPeriod: 1 })];
    const out = renderDayTimeline(meetings, dayPeriods, new Date('2026-09-07T07:00:00'), true);
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

    expect(visualWidth(out)).toBeLessThanOrEqual(40);
    expect(out).toContain('[Fri]');
    expect(out).toContain('Sun');
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
  it('buckets each week into the correct relative density level', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    try {
      const meetings: TimetableMeeting[] = [
        mk({ weeks: [2], startPeriod: 1, endPeriod: 1 }), // 1 slot
        mk({ weeks: [3], startPeriod: 1, endPeriod: 2 }), // 2 slots
        mk({ weeks: [4], startPeriod: 1, endPeriod: 3 }), // 3 slots
        mk({ weeks: [5], startPeriod: 1, endPeriod: 4 }), // 4 slots (max)
      ];
      const out = stripAnsi(renderTermDensity(meetings, '2026-09-07', 1));
      const lines = out.split('\n');
      const glyphLine = lines[3] ?? '';
      expect(glyphLine.trim()).toBe('· ░ ▒ ▓ █');
    } finally {
      process.env['NBTCA_ICON_MODE'] = 'ascii';
      resetIconCache();
    }
  });

  it('places the current-week marker at the correct column', () => {
    const meetings: TimetableMeeting[] = [mk({ weeks: [1] }), mk({ weeks: [5] })];
    const out = stripAnsi(renderTermDensity(meetings, '2026-09-07', 3));
    const lines = out.split('\n');
    const markerLine = lines[4] ?? '';
    expect(markerLine.indexOf('^')).toBe(7);
    expect(markerLine).toContain('This week');
  });

  it('renders a single all-dot week when there are no meetings at all', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    try {
      const out = stripAnsi(renderTermDensity([], '2026-09-07', 5));
      const lines = out.split('\n');
      expect(lines[3]?.trim()).toBe('·');
    } finally {
      process.env['NBTCA_ICON_MODE'] = 'ascii';
      resetIconCache();
    }
  });

  it('never collapses into one array entry when split on newlines', () => {
    const out = renderTermDensity([mk({ weeks: [1] })], '2026-09-07', 1);
    const lines = out.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line).not.toContain('\n');
  });

  it('places a CJK month label at its real terminal column even after an earlier CJK label of different width', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    setLanguage('zh');
    resetIconCache();
    try {
      const meetings: TimetableMeeting[] = [mk({ weeks: [1, 14] })];
      const out = stripAnsi(renderTermDensity(meetings, '2026-09-07', 1));
      const monthLine = out.split('\n')[2] ?? '';

      const base = new Date('2026-09-07T00:00:00');
      let secondLabelWeekIndex = -1;
      let secondLabelText = '';
      let prevMonth = new Date('2026-09-07T00:00:00').getMonth();
      for (let i = 1; i < 14; i++) {
        const d = new Date(base.getTime() + i * 7 * 86400000);
        if (d.getMonth() !== prevMonth) {
          secondLabelWeekIndex = i;
          secondLabelText = `${String(d.getMonth() + 1)}月`;
          break;
        }
        prevMonth = d.getMonth();
      }
      expect(secondLabelWeekIndex).toBeGreaterThan(0); // sanity: the fixture actually crosses a month boundary

      const idx = monthLine.indexOf(secondLabelText);
      expect(idx).toBeGreaterThan(0);
      const prefix = monthLine.slice(0, idx);
      const targetCol = space.indent.length + secondLabelWeekIndex * 2;
      expect(visualWidth(prefix)).toBe(targetCol);
    } finally {
      process.env['NBTCA_ICON_MODE'] = 'ascii';
      setLanguage('en');
      resetIconCache();
    }
  });

  it('shows every week across narrow chunks and keeps a late current week visible', () => {
    const weeks = Array.from({ length: 18 }, (_, index) => index + 1);
    const lines = stripAnsi(renderTermDensity([mk({ weeks })], '2026-09-07', 18, 20)).split('\n');
    const densityLines = lines.filter((line) => /^\s*(?:=\s*)+$/.test(line));

    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(densityLines).toHaveLength(2);
    expect(densityLines.join('').match(/=/g)).toHaveLength(18);
    expect(lines.some((line) => line.includes('This week ^'))).toBe(true);
    done();
  });

  it('keeps the Chinese narrow density view within twenty columns', () => {
    setLanguage('zh');
    try {
      const weeks = Array.from({ length: 18 }, (_, index) => index + 1);
      const lines = stripAnsi(renderTermDensity([mk({ weeks })], '2026-09-07', 18, 20)).split('\n');
      const densityLines = lines.filter((line) => /^\s*(?:=\s*)+$/.test(line));

      expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
      expect(densityLines.join('').match(/=/g)).toHaveLength(18);
      expect(lines.some((line) => line.includes('本周 ^'))).toBe(true);
    } finally {
      setLanguage('en');
      resetIconCache();
    }
    done();
  });
});
