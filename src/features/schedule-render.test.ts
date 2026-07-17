import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import chalk from 'chalk';
import type { TimetableMeeting, TimetablePeriod, TimetableUnresolvedItem } from '@nbtca/nbtcal/timetable';
import {
  renderNextClassBanner, renderTodayClasses, renderWeekGrid, renderUnresolvedItems,
  renderTodayTimeline, renderWeekStrip, renderTermDensity, renderMeetingDetail,
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
  it('renders weekday headers and places a course in its cell', () => {
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
    // Regression: row labels used to be an abstract "P1"/"P2" that told you
    // nothing about when to actually be there, or how long the class runs,
    // without checking elsewhere. A start-end range ("08:00-08:45") answers
    // both "when do I need to be there" and "when am I done" at a glance --
    // a bare start time alone still left the end (and the class's real
    // duration) to guesswork.
    it('shows the period\'s real start-end time range as the row label', () => {
      const out = stripAnsi(renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00')));
      const lines = out.split('\n');
      expect(lines.some((l) => l.trim().startsWith('08:00-08:45'))).toBe(true); // period 1
      expect(lines.some((l) => l.trim().startsWith('08:55-09:40'))).toBe(true); // period 2
      expect(out).not.toMatch(/\bP1\b/);
      done();
    });
  });

  describe('column-width adaptivity', () => {
    // Regression: cell width was a hardcoded 10, with zero awareness of the
    // real terminal width — on a wide terminal, real course names (which
    // routinely run well past 10 display columns, especially in Chinese)
    // truncated to "..." even though there was ample unused horizontal
    // space to the right of the grid. This is the same "more room should
    // show more" adaptive-density convention already established for
    // bodyRows, just along the other axis. These tests use location: null
    // to isolate course-name-width behavior specifically -- location's
    // effect on cell width is covered separately below.
    it('grows cell width on a wide terminal to fit a real long course name without truncating', () => {
      // 7 CJK chars = 14 display columns -- representative of real campus
      // course names (matches "工业机器人系统" from real fetched data),
      // not an artificial worst case. At cols=120 there's room for it.
      const longName = '工业机器人系统';
      const out = stripAnsi(renderWeekGrid([mk({ courseName: longName, location: null, weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00'), 120));
      expect(out).toContain(longName);
      done();
    });

    it('does not grow cell width past what real course names actually need, even on a very wide terminal', () => {
      const out = stripAnsi(renderWeekGrid([mk({ courseName: 'Math', location: null, weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00'), 200));
      const headerLine = out.split('\n')[0]!;
      // Short names shouldn't stretch the grid out to fill a 200-column
      // terminal -- growing to "whatever the terminal can hold" instead of
      // "whatever the content needs" would read as sloppy, not adaptive.
      // Matches the exact fixed-width total: indent(3) + rowHeadW(12) + 10*7.
      expect(visualWidth(headerLine)).toBe(3 + 12 + 10 * 7);
      done();
    });

    it('keeps the existing minimum cell width on a normal terminal, unchanged from before this feature', () => {
      const out = stripAnsi(renderWeekGrid([mk({ courseName: 'Physics', location: null, weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00')));
      expect(out).toContain('Physics'); // 7 chars, fits the existing 10-wide cell untouched
      done();
    });

    it('caps growth at what the given terminal width can actually hold, truncating instead of overflowing', () => {
      // An 18-char CJK name (36 display columns) needs more room than a
      // 150-column terminal can give 7 side-by-side cells -- cellW should
      // grow past the old fixed 10, but stop short of what the name would
      // ideally want, and never push the row past the terminal's own width.
      const longName = '习近平新时代中国特色社会主义思想概论';
      const out = stripAnsi(renderWeekGrid([mk({ courseName: longName, location: null, weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00'), 150));
      const headerLine = out.split('\n')[0]!;
      expect(visualWidth(headerLine)).toBeGreaterThan(3 + 12 + 10 * 7); // grew past the old fixed baseline
      expect(visualWidth(headerLine)).toBeLessThanOrEqual(150); // but never past the terminal's own width
      expect(out).not.toContain(longName); // still not wide enough for the full name -- truncates, doesn't overflow
      done();
    });
  });

  describe('location takes priority over course name in each cell', () => {
    // For actually getting to class, the room matters more than the exact
    // title (which is usually recognizable even truncated) -- so a cell
    // shows the location in full whenever there's room, and gives the
    // course name whatever's left, truncating the name first.
    it('shows both the full location and the full course name when there is room for both', () => {
      const out = stripAnsi(renderWeekGrid([mk({ courseName: 'Math', location: 'sl707', weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00'), 120));
      const lines = out.split('\n');
      const p1Row = lines.find((l) => l.trim().startsWith('08:00'))!;
      expect(p1Row).toContain('sl707');
      expect(p1Row).toContain('Math');
      done();
    });

    it('truncates the course name before ever truncating the location', () => {
      // cellW is forced down to exactly 10 (default cols=80); "sl707"(5) +
      // separator(2) leaves only 3 columns for the name -- location must
      // still come through whole.
      const out = stripAnsi(renderWeekGrid([mk({ courseName: 'Advanced Mathematics', location: 'sl707', weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00')));
      const lines = out.split('\n');
      const p1Row = lines.find((l) => l.trim().startsWith('08:00'))!;
      expect(p1Row).toContain('sl707');
      expect(p1Row).not.toContain('Advanced Mathematics');
      done();
    });

    it('falls back to just the course name when a meeting has no location', () => {
      const out = stripAnsi(renderWeekGrid([mk({ courseName: 'Math', location: null, weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00')));
      const lines = out.split('\n');
      const p1Row = lines.find((l) => l.trim().startsWith('08:00'))!;
      expect(p1Row).toContain('Math');
      done();
    });
  });

  describe('consecutive periods of the same meeting collapse into one labeled cell', () => {
    // A meeting spanning periods 1-2 used to repeat its full course
    // name/location text on both rows -- multiplying visual noise for
    // information that's still the exact same class. Now it's labeled
    // once, at its starting period; later periods in its span show a
    // plain continuation marker instead of repeating the text. Genuine
    // conflicts (two meetings both starting at the same weekday+period)
    // are rare and, like the pre-existing lookup, just show whichever one
    // is found first -- not worth over-engineering for.
    it('labels only the starting period of a multi-period meeting, not every period it spans', () => {
      // cols=100 leaves enough room for both "sl707" and the full "Math" --
      // this test is about the starting-vs-continuation row difference,
      // not about truncation, so it deliberately avoids that edge case.
      const out = stripAnsi(renderWeekGrid([mk({ courseName: 'Math', location: 'sl707', weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00'), 100));
      const lines = out.split('\n');
      const p1Row = lines.find((l) => l.trim().startsWith('08:00'))!;
      const p2Row = lines.find((l) => l.trim().startsWith('08:55'))!;
      expect(p1Row).toContain('Math');
      expect(p2Row).not.toContain('Math');
      expect(p2Row).not.toContain('sl707');
      done();
    });

    it('shows a plain connector, not a "no class" dot, on a continuation row', () => {
      const out = stripAnsi(renderWeekGrid([mk({ courseName: 'Math', location: 'sl707', weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00')));
      const lines = out.split('\n');
      const p2Row = lines.find((l) => l.trim().startsWith('08:55'))!;
      // The Mon column on the continuation row must be visually distinct
      // from a genuinely free "no class" cell elsewhere on the same row.
      const p2Cells = p2Row.slice(p2Row.indexOf('08:55') + 5).trim().split(/\s+/);
      expect(p2Cells[0]).not.toBe('.'); // ascii "no class" glyph
      done();
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
    expect(p3Index).toBeGreaterThan(p2Index + 1); // at least one separator line between them
    done();
  });
  it('does not insert a separator between adjacent periods', () => {
    const out = stripAnsi(renderWeekGrid([], periods, 1, new Date('2026-09-07T09:00:00')));
    const lines = out.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(1 + periods.length); // header + one row per period, no extra rows
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

describe('renderWeekStrip', () => {
  it('marks a weekday with a class differently from a free weekday', () => {
    const meetings = [mk({ weekday: 3, weeks: [1] })]; // Wednesday
    const out = stripAnsi(renderWeekStrip(meetings, 1, 3));
    expect(out).toContain('has class');
    expect(out).toContain('free');
  });

  it('marks Saturday/Sunday as weekend regardless of meetings', () => {
    const out = stripAnsi(renderWeekStrip([], 1, 1));
    expect(out).toContain('weekend');
  });

  it('never collapses into a single-line string (module convention: split on \\n)', () => {
    const out = renderWeekStrip([], 1, 1);
    expect(out.split('\n').length).toBeGreaterThan(1);
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

