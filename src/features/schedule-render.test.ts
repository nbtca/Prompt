import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import chalk from 'chalk';
import type { TimetableMeeting, TimetablePeriod, TimetableUnresolvedItem } from '@nbtca/nbtcal/timetable';
import {
  renderNextClassBanner, renderTodayClasses, renderWeekGrid, renderUnresolvedItems,
  renderTodayTimeline, renderTermDensity, renderMeetingDetail,
  renderDayTimeline, renderDaySwitcher,
} from './schedule-render.js';
import { setLanguage } from '../i18n/index.js';
import { resetIconCache } from '../core/icons.js';
import { stripAnsi, visualWidth } from '../core/text.js';
import { space } from '../core/theme.js';

beforeAll(() => setLanguage('en'));
beforeEach(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });
const done = () => { process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache(); };

const periods: TimetablePeriod[] = [
  { period: 1, label: null, start: '08:00', end: '08:45' },
  { period: 2, label: null, start: '08:55', end: '09:40' },
];
// Mirrors renderWeekGrid's own MIN_COL_WIDTH -- not exported, so tests that
// need the exact floor value duplicate it here (matches this file's
// existing convention of hardcoding known-derived constants inline).
const MIN_COL_WIDTH_FOR_TESTS = 8;
function mk(o: Partial<TimetableMeeting>): TimetableMeeting {
  return { sourceId: null, courseName: 'Math', teacherNames: ['Dr Li'], location: 'Room 201', weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1], kind: 'regular', ...o };
}

describe('renderNextClassBanner', () => {
  it('shows the course + countdown', () => {
    const out = stripAnsi(renderNextClassBanner({ meeting: mk({}), start: new Date('2026-09-07T08:00:00') }, new Date('2026-09-07T06:30:00')));
    expect(out).toContain('Next'); expect(out).toContain('Math'); expect(out).toMatch(/1h/); done();
  });
  it('empty when no next class', () => { expect(renderNextClassBanner(null, new Date())).toBe(''); done(); });
});

describe('renderTodayClasses', () => {
  it('lists a class with its time and location', () => {
    const out = stripAnsi(renderTodayClasses([mk({})], periods, new Date('2026-09-07T07:00:00')));
    expect(out).toContain('08:00'); expect(out).toContain('Math'); expect(out).toContain('Room 201'); done();
  });
  it('shows an empty-state line when there are none', () => {
    expect(stripAnsi(renderTodayClasses([], periods, new Date()))).toContain('No classes today'); done();
  });
  it('marks the in-progress class', () => {
    // period 1 is 08:00–08:45; now = 08:10 is inside it
    const out = stripAnsi(renderTodayClasses([mk({ startPeriod: 1, endPeriod: 1 })], periods, new Date('2026-09-07T08:10:00')));
    expect(out).toContain('> ');   // ascii in-progress marker
    done();
  });
});

describe('renderWeekGrid', () => {
  it('renders weekday headers and places a course\'s name in its cell', () => {
    const out = stripAnsi(renderWeekGrid([mk({ courseName: 'Math', location: null, weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00')));
    expect(out).toMatch(/Mon/);         // weekday header
    expect(out).toContain('Math');      // placed in Mon / period 1
    done();
  });

  it('marks the header of the current weekday and no other', () => {
    // 2026-09-07 is a Monday.
    const out = stripAnsi(renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00')));
    const headerLine = out.split('\n')[0]!;
    expect(headerLine).toMatch(/Mon\*/);
    expect(headerLine).not.toMatch(/Tue\*/);
    done();
  });

  describe('row headers show the real clock time range, not an abstract period number', () => {
    it('shows the period\'s real start-end time range as the row label', () => {
      const out = stripAnsi(renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00')));
      const lines = out.split('\n');
      expect(lines.some((l) => l.trim().startsWith('08:00-08:45'))).toBe(true); // period 1
      expect(lines.some((l) => l.trim().startsWith('08:55-09:40'))).toBe(true); // period 2
      expect(out).not.toMatch(/\bP1\b/);
      done();
    });
  });

  describe('course name and location are on separate lines within a cell', () => {
    // Regression: location and course name used to share one line, forced
    // to compete for the same width via a priority-truncation rule. Now
    // each gets its own dedicated line within the cell, so neither ever has
    // to give up room to the other -- the whole priority-truncation problem
    // this used to need special-casing for no longer exists.
    it('places the course name on one line and the location on the very next line', () => {
      const out = stripAnsi(renderWeekGrid([mk({ courseName: 'Math', location: 'sl707', weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00'), 120));
      const lines = out.split('\n');
      const nameLineIdx = lines.findIndex((l) => l.includes('Math'));
      const locLineIdx = lines.findIndex((l) => l.includes('sl707'));
      expect(nameLineIdx).toBeGreaterThan(-1);
      expect(locLineIdx).toBe(nameLineIdx + 1);
      done();
    });

    it('shows the full location even when the course name alone would need far more room than the terminal has', () => {
      // At a narrow cols, the column's width collapses toward the floor --
      // but the location has its own dedicated line, so it isn't crowded
      // out by the long name the way a shared-line design would crowd it.
      const out = stripAnsi(renderWeekGrid([mk({ courseName: 'Advanced Mathematics And Engineering Foundations', location: 'sl707', weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00'), 60));
      expect(out).toContain('sl707');
      done();
    });

    it('falls back to just the course name (no second line of content) when a meeting has no location', () => {
      const out = stripAnsi(renderWeekGrid([mk({ courseName: 'Math', location: null, weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00')));
      expect(out).toContain('Math');
      done();
    });
  });

  describe('per-column width adaptivity', () => {
    // Regression: cell width used to be computed once, globally, from the
    // single widest cell across the *entire week* -- a long Tuesday course
    // name forced every other day's column to match its width, wasting
    // space on short days and offering no more room to Tuesday than a
    // flat-10 design would once other days needed their own share.
    it('grows a column to fit that day\'s own long course name', () => {
      const longName = '工业机器人系统'; // 7 CJK chars = 14 display columns
      const out = stripAnsi(renderWeekGrid([mk({ courseName: longName, location: null, weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00'), 120));
      expect(out).toContain(longName);
      done();
    });

    it('does not let one day\'s long course name affect another day\'s column width', () => {
      const longName = '习近平新时代中国特色社会主义思想概论'; // 18 CJK chars = 36 display columns
      const meetings = [
        mk({ courseName: 'PE', location: null, weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1] }),
        mk({ courseName: longName, location: null, weekday: 2, startPeriod: 1, endPeriod: 1, weeks: [1] }),
      ];
      const out = stripAnsi(renderWeekGrid(meetings, periods, 1, new Date('2026-09-07T09:00:00'), 250));
      expect(out).toContain(longName); // Tuesday's column grew enough to fit it in full
      const headerLine = out.split('\n')[0]!;
      // A global-width design would make every one of the 7 columns match
      // Tuesday's own ~36-wide need; per-column sizing keeps Monday and the
      // other short/empty days near the floor instead, so the real total
      // must be well under what 7 columns at Tuesday's own width would need.
      const globalWidthDesignTotal = space.indent.length + 12 + 36 * 7 + 6 * 3;
      expect(visualWidth(headerLine)).toBeLessThan(globalWidthDesignTotal - 36 * 3);
      done();
    });

    it('keeps a short floor width for a column with no real content', () => {
      const out = stripAnsi(renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00'), 300));
      const headerLine = out.split('\n')[0]!;
      // Every column sits at MIN_COL_WIDTH(8) regardless of how wide the
      // terminal is -- indent(3) + rowHeadW(12) + 7*8 + 6*sepW(3 each).
      expect(visualWidth(headerLine)).toBe(3 + 12 + 7 * 8 + 6 * 3);
      done();
    });

    it('caps column growth at the terminal\'s available width, truncating instead of overflowing', () => {
      // cols=80: tight enough that the 36-column name can't fit, but not so
      // tight that empty columns get scaled below their own 3-column
      // header-truncation floor (see MIN_COL_WIDTH's neighbor comment in
      // the source) -- that specific extreme-narrow edge case is covered
      // separately below, with a looser bound.
      const longName = '习近平新时代中国特色社会主义思想概论'; // 18 CJK chars = 36 display columns
      const out = stripAnsi(renderWeekGrid([mk({ courseName: longName, location: null, weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00'), 80));
      const headerLine = out.split('\n')[0]!;
      expect(visualWidth(headerLine)).toBeLessThanOrEqual(80);
      expect(out).not.toContain(longName); // not wide enough for the full name -- truncates, doesn't overflow
      done();
    });

    it('never lets the row grow wildly past the terminal width even at an extremely narrow size', () => {
      // At cols=60, the empty columns' floor (3, so weekday headers never
      // need to truncate) can push the *total* row width a few columns
      // past cols -- a soft, bounded overflow from truncate()'s own
      // 3-column ellipsis floor, not unbounded growth. This scenario
      // shouldn't be reached in the real app once the caller falls back to
      // a single-day view below some minimum width, but the raw function
      // still shouldn't blow up arbitrarily if called anyway.
      const longName = '习近平新时代中国特色社会主义思想概论';
      const out = stripAnsi(renderWeekGrid([mk({ courseName: longName, location: null, weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00'), 60));
      const headerLine = out.split('\n')[0]!;
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
      const row = lines.find((l) => l.trim().startsWith('08:00'))!;
      const mondayCell = row.slice(space.indent.length + 12, row.indexOf('|'));
      expect(mondayCell.match(/^\s*/)![0].length).toBeGreaterThan(0);
      done();
    });

    it('centers the weekday header label within its column', () => {
      const out = stripAnsi(renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00'), 200));
      const headerLine = out.split('\n')[0]!;
      const monIdx = headerLine.indexOf('Mon');
      expect(monIdx).toBeGreaterThan(space.indent.length + 12);
      done();
    });
  });

  describe('consecutive periods of the same meeting collapse into one labeled cell', () => {
    // A meeting spanning periods 1-2 used to repeat its full course
    // name/location text on both period-rows -- multiplying visual noise
    // for information that's still the exact same class. Now it's labeled
    // once, at its starting period; later periods in its span show a plain
    // continuation marker (on both the name and location line) instead of
    // repeating the text. Genuine conflicts (two meetings both starting at
    // the same weekday+period) are rare and, like the pre-existing lookup,
    // just show whichever one is found first -- not worth over-engineering
    // for.
    it('labels only the starting period of a multi-period meeting, not every period it spans', () => {
      const out = stripAnsi(renderWeekGrid([mk({ courseName: 'Math', location: 'sl707', weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00'), 100));
      const lines = out.split('\n');
      const p2NameLine = lines.find((l) => l.trim().startsWith('08:55'))!;
      const p2LocLine = lines[lines.indexOf(p2NameLine) + 1]!;
      expect(p2NameLine).not.toContain('Math');
      expect(p2LocLine).not.toContain('sl707');
      done();
    });

    it('shows a plain connector, not a "no class" dot, on both lines of a continuation period', () => {
      // cols=100 keeps every column at its unscaled floor width (8) --
      // deterministic, so Monday's column is known to span exactly
      // [indent+rowHeadW, indent+rowHeadW+8). Slicing to that exact,
      // pre-computed offset (rather than searching for the next "|") avoids
      // false-matching the connector glyph itself, which *is* "|" -- the
      // same character as the real column separator.
      const out = stripAnsi(renderWeekGrid([mk({ courseName: 'Math', location: 'sl707', weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00'), 100));
      const lines = out.split('\n');
      const p2NameLine = lines.find((l) => l.trim().startsWith('08:55'))!;
      const p2LocLine = lines[lines.indexOf(p2NameLine) + 1]!;
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
        const meeting = mk({ courseName: 'Math', location: null, weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1] });
        const withCursor = renderWeekGrid([meeting], periods, 1, new Date('2026-09-07T09:00:00'), 80, { weekday: 1, period: 1 });
        const withoutCursor = renderWeekGrid([meeting], periods, 1, new Date('2026-09-07T09:00:00'), 80);
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
        // cursor sits at Mon/period1, an empty cell -- Math is on Tue/period1.
        const meeting = mk({ courseName: 'Math', location: null, weekday: 2, startPeriod: 1, endPeriod: 1, weeks: [1] });
        const out = renderWeekGrid([meeting], periods, 1, new Date('2026-09-07T09:00:00'), 80, { weekday: 1, period: 1 });
        const mathIndex = out.indexOf('Math');
        const nearMath = out.slice(Math.max(0, mathIndex - 15), mathIndex);
        expect(nearMath).not.toContain('\x1b[48;2;14;165;233m');
      } finally {
        chalk.level = level;
      }
      done();
    });

    it('does not crash when the cursor points at an empty cell', () => {
      expect(() => renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00'), 80, { weekday: 1, period: 1 })).not.toThrow();
      done();
    });

    it('pads the cursor cell to the full column width *before* applying the background style, so the highlight covers the whole cell, not just the real text', () => {
      const level = chalk.level;
      chalk.level = 3;
      try {
        // cols=100 (not the default 80) keeps every column at its unscaled
        // floor width (8) -- at 80 columns, 7 columns can't all fit their
        // floor width plus separators without proportional shrinking, which
        // would make the expected width below non-deterministic.
        const out = renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00'), 100, { weekday: 1, period: 1 });
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
        const meeting = mk({ courseName: 'Math', location: 'sl707', weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1] });
        const out = renderWeekGrid([meeting], periods, 1, new Date('2026-09-07T09:00:00'), 80, { weekday: 1, period: 1 });
        const lines = out.split('\n');
        const nameLine = lines.find((l) => l.includes('Math'))!;
        const locLine = lines[lines.indexOf(nameLine) + 1]!;
        expect(nameLine).toContain('\x1b[48;2;14;165;233m');
        expect(locLine).toContain('\x1b[48;2;14;165;233m');
      } finally {
        chalk.level = level;
      }
      done();
    });

    it('shows the cursor token even when the cursor lands on today\'s own column', () => {
      const level = chalk.level;
      chalk.level = 3;
      try {
        // now = 2026-09-07 is a Monday (weekday 1) -- cursor also at weekday
        // 1, the exact "cursor on today's column" collision case.
        const out = renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00'), 80, { weekday: 1, period: 1 });
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
    // p2's own name line, then its location line, then exactly one gap
    // marker line, then p3's name line.
    expect(p3Index).toBe(p2Index + 3);
    done();
  });
  it('does not insert a separator between adjacent periods', () => {
    const out = stripAnsi(renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00')));
    const lines = out.split('\n').filter((l) => l.trim().length > 0);
    // header + 2 lines (name + location) per period, no extra rows.
    expect(lines.length).toBe(1 + periods.length * 2);
    done();
  });
});

describe('renderMeetingDetail', () => {
  it('shows the full, untruncated course name as the title', () => {
    const long = '习近平新时代中国特色社会主义思想概论';
    const out = stripAnsi(renderMeetingDetail(mk({ courseName: long, weekday: 1, startPeriod: 1, endPeriod: 2 }), periods));
    expect(out).toContain(long);
  });

  it('shows weekday + real clock time range', () => {
    const out = stripAnsi(renderMeetingDetail(mk({ weekday: 3, startPeriod: 1, endPeriod: 2 }), periods));
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
    const out = stripAnsi(renderMeetingDetail(mk({ weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] }), periods));
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
});

const dayPeriods: TimetablePeriod[] = [
  { period: 1, label: null, start: '08:00', end: '09:40' },
  { period: 2, label: null, start: '09:50', end: '11:30' },
  { period: 3, label: null, start: '13:30', end: '15:20' },
];

describe('renderTodayTimeline', () => {
  it('shows the empty-state line when there are no classes today', () => {
    expect(stripAnsi(renderTodayTimeline([], dayPeriods, new Date()))).toContain('No classes today');
    done();
  });

  it('marks finished classes as done and lists their start time', () => {
    const meetings = [mk({ courseName: 'Math', startPeriod: 1, endPeriod: 1 })];
    const out = stripAnsi(renderTodayTimeline(meetings, dayPeriods, new Date('2026-09-07T12:00:00')));
    expect(out).toContain('08:00');
    expect(out).toContain('Math');
    expect(out).toContain('Done');
    done();
  });

  it('marks the in-progress class with a remaining-minutes countdown and its location', () => {
    // period 3 is 13:30-15:20; now = 14:55 -> 25 minutes left
    const meetings = [mk({ courseName: 'Data Structures', location: 'Bldg 1-302', startPeriod: 3, endPeriod: 3 })];
    const out = stripAnsi(renderTodayTimeline(meetings, dayPeriods, new Date('2026-09-07T14:55:00')));
    expect(out).toContain('Data Structures');
    expect(out).toContain('In progress');
    expect(out).toContain('25m left');
    expect(out).toContain('Bldg 1-302');
    done();
  });

  it('leaves an upcoming class unmarked (no Done/In progress status)', () => {
    const meetings = [mk({ courseName: 'Physics', startPeriod: 2, endPeriod: 2 })];
    const out = stripAnsi(renderTodayTimeline(meetings, dayPeriods, new Date('2026-09-07T07:00:00')));
    expect(out).toContain('Physics');
    expect(out).not.toContain('Done');
    expect(out).not.toContain('In progress');
    done();
  });

  it('closes the timeline with the last class end time', () => {
    const meetings = [mk({ startPeriod: 1, endPeriod: 1 })];
    const out = stripAnsi(renderTodayTimeline(meetings, dayPeriods, new Date('2026-09-07T07:00:00')));
    expect(out).toContain('09:40'); // period 1's end time closes the timeline
  });

  it('never returns a value containing a literal newline per rendered row (single joined string by design)', () => {
    // renderTodayTimeline follows this module's convention of returning one
    // '\n'-joined string; callers must split it, never push it whole.
    const meetings = [mk({ startPeriod: 1, endPeriod: 1 }), mk({ courseName: 'Physics', startPeriod: 2, endPeriod: 2 })];
    const out = renderTodayTimeline(meetings, dayPeriods, new Date('2026-09-07T07:00:00'));
    expect(out.split('\n').length).toBeGreaterThan(1);
  });
});

describe('renderDayTimeline', () => {
  it('shows the empty-state line when the viewed day has no classes', () => {
    expect(stripAnsi(renderDayTimeline([], dayPeriods, new Date(), true))).toContain('No classes today');
    done();
  });

  it('always shows a class\'s location, not just the live one -- unlike renderTodayTimeline', () => {
    // period 2 is 09:50-11:30; now = 07:00, well before it starts (upcoming,
    // not live) -- renderTodayTimeline would omit the location here.
    const meetings = [mk({ courseName: 'Physics', location: 'Bldg 1-302', startPeriod: 2, endPeriod: 2 })];
    const out = stripAnsi(renderDayTimeline(meetings, dayPeriods, new Date('2026-09-07T07:00:00'), true));
    expect(out).toContain('Bldg 1-302');
    done();
  });

  it('marks live/done status when isToday is true, same as renderTodayTimeline', () => {
    const meetings = [mk({ courseName: 'Math', startPeriod: 1, endPeriod: 1 })];
    const out = stripAnsi(renderDayTimeline(meetings, dayPeriods, new Date('2026-09-07T12:00:00'), true));
    expect(out).toContain('Done');
    done();
  });

  it('never marks live/done status when isToday is false, even if the clock time would otherwise match a class', () => {
    // period 1 is 08:00-09:40; now's clock time (08:30) falls inside that
    // range, but the viewed day isn't today -- comparing across different
    // days would be meaningless, so no live/done marking should appear.
    const meetings = [mk({ courseName: 'Math', startPeriod: 1, endPeriod: 1 })];
    const out = stripAnsi(renderDayTimeline(meetings, dayPeriods, new Date('2026-09-07T08:30:00'), false));
    expect(out).not.toContain('Done');
    expect(out).not.toContain('In progress');
    done();
  });

  it('highlights the meeting whose span covers the given cursor period, whether it is the meeting\'s starting period or a later one', () => {
    const level = chalk.level;
    chalk.level = 3;
    try {
      const meetings = [mk({ courseName: 'Math', startPeriod: 1, endPeriod: 2 })];
      const startCursor = renderDayTimeline(meetings, dayPeriods, new Date('2026-09-07T07:00:00'), false, 1);
      expect(startCursor).toContain('\x1b[48;2;14;165;233m');
      const noCursor = renderDayTimeline(meetings, dayPeriods, new Date('2026-09-07T07:00:00'), false);
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
    for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) expect(out).toContain(label);
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
});


describe('renderUnresolvedItems', () => {
  const items: TimetableUnresolvedItem[] = [
    { kind: 'practice', itemIndex: 0, sourceFields: { kcmc: 'Fitness test', sjkcgs: 'Fitness test / week 16' } },
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
      // week 1 has no meeting at all -> 0 slots -> level 0
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
    // weeks present: 1 and 5 -> range is [1,5], 5 weeks, 2 display columns each.
    // currentWeek=3 -> index 2 -> column 2*2=4, plus the 3-char space.indent -> 7.
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
      // A wide enough week range from a real Monday to cross two month
      // boundaries in zh locale, producing two distinct CJK month labels
      // with different widths (e.g. a single-digit-month label vs a
      // double-digit one) separated by several weeks of real gap.
      const meetings: TimetableMeeting[] = [mk({ weeks: [1, 14] })];
      const out = stripAnsi(renderTermDensity(meetings, '2026-09-07', 1));
      const monthLine = out.split('\n')[2] ?? '';

      // Find the second month label programmatically (don't hardcode which
      // month string it is — derive it from the same date math the
      // implementation uses, so this test can't silently drift from reality).
      const base = new Date('2026-09-07T00:00:00');
      let secondLabelWeekIndex = -1;
      let secondLabelText = '';
      let prevMonth = new Date('2026-09-07T00:00:00').getMonth();
      for (let i = 1; i < 14; i++) {
        const d = new Date(base.getTime() + i * 7 * 86400000);
        if (d.getMonth() !== prevMonth) {
          secondLabelWeekIndex = i;
          secondLabelText = `${d.getMonth() + 1}月`;
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
});

