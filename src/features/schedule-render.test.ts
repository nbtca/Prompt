import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { TimetableMeeting, TimetablePeriod, TimetableUnresolvedItem } from '@nbtca/nbtcal/timetable';
import {
  renderNextClassBanner, renderTodayClasses, renderWeekGrid, renderUnresolvedItems,
  renderTodayTimeline, renderWeekStrip, renderTermDensity,
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
    const out = stripAnsi(renderWeekGrid([mk({ courseName: 'Math', weekday: 1, startPeriod: 1, weeks: [1] })], periods, 1, new Date('2026-09-07T09:00:00')));
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

  it('leaves a real gap after a two-digit Chinese period label ("第10"), not glued to the next column', () => {
    // Regression: rowHeadW=4 exactly fits "第10" (CJK 第=2 cols + "10"=2
    // cols) with zero room for padEndV to add a separating space, unlike
    // single-digit periods ("第1" = 3 cols, leaving 1). Only shows up with
    // real >9-period data, which nothing exercised until the adaptive
    // hub started rendering the full grid inline with a real 12-period
    // campus period table.
    setLanguage('zh');
    resetIconCache();
    try {
      const twelvePeriods: TimetablePeriod[] = Array.from({ length: 12 }, (_, i) => ({
        period: i + 1, label: null, start: `${String(8 + i).padStart(2, '0')}:00`, end: `${String(8 + i).padStart(2, '0')}:45`,
      }));
      const out = renderWeekGrid([], twelvePeriods, 1, new Date('2026-09-07T09:00:00'));
      const lines = stripAnsi(out).split('\n');
      const row10 = lines.find((l) => l.startsWith('   第10'));
      expect(row10).toBeDefined();
      expect(row10).not.toMatch(/第10[^\s]/); // must not run straight into the next cell
    } finally {
      setLanguage('en');
      resetIconCache();
      done();
    }
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
    const p2Index = lines.findIndex((l) => l.includes('P2'));
    const p3Index = lines.findIndex((l) => l.includes('P3'));
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
