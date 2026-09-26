import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { setLanguage, t } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { campusDateTime } from '@nbtca/nbtcal/timetable';
import { stripAnsi, visualWidth } from '../../core/text.js';
import type { AppContext } from '../view.js';
import { offlineNotice } from '../chrome.js';
import type * as CalendarModule from '../../features/calendar.js';
import type { CachedSchedule } from '../../features/schedule-view.js';

const calendarInRange = vi.fn().mockReturnValue([]);
const loadCalendarOrThrowMock = vi.fn().mockResolvedValue({
  inRange: calendarInRange,
  past: vi.fn().mockReturnValue([]),
  next: vi.fn().mockReturnValue([]),
  heatmap: vi.fn().mockReturnValue([]),
});
vi.mock('../../features/calendar.js', async (importOriginal) => {
  const actual = await importOriginal<typeof CalendarModule>();
  return { ...actual, loadCalendarOrThrow: loadCalendarOrThrowMock };
});

const { renderHome, homeView } = await import('./home.js');

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

const noon = campusDateTime('2026-07-15', '12:00');
const FIXTURE_TERM_KEY = '2020-1';
const FIXTURE_WEEK_ONE = '2020-01-06';

function scheduleWith(
  meetings: { courseName: string; startPeriod: number; location?: string }[] = [],
  unresolvedCount = 0,
): CachedSchedule {
  return {
    weekOneMonday: '2026-07-13',
    timetable: {
      term: { academicYear: '2026', semester: '3' },
      meetings: meetings.map((m) => ({
        sourceId: null,
        courseName: m.courseName,
        teacherNames: [],
        location: m.location ?? null,
        weekday: 3,
        startPeriod: m.startPeriod,
        endPeriod: m.startPeriod,
        weeks: [1],
        kind: 'regular',
      })),
      unresolvedItems: Array.from({ length: unresolvedCount }, (_, itemIndex) => ({
        kind: 'practice',
        itemIndex,
        sourceFields: { kcmc: 'Fitness test' },
      })),
      periods: [
        { period: 1, label: null, start: '08:00', end: '09:40' },
        { period: 2, label: null, start: '14:00', end: '15:40' },
      ],
      calendarDays: [],
      warnings: [],
      fetchedAt: new Date('2026-07-01T00:00:00Z'),
    },
  };
}

function defined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected fixture value');
  return value;
}

describe('homeView footer', () => {
  it('offers tab switching and quitting without move or open actions', () => {
    const hint = stripAnsi(homeView.footerHint(5, 80));
    expect(hint).toContain('1-5');
    expect(hint).toContain(t().menu.hintQuit);
    expect(hint).not.toContain(t().menu.hintMove);
    expect(hint).not.toContain(t().menu.hintOpen);
  });

  it('does not offer Esc to go back from the root tab', () => {
    expect(stripAnsi(homeView.footerHint(5, 80))).not.toContain('Esc');
  });
});

describe('renderHome (schedule-first dashboard)', () => {
  it('shows next class, today classes, and upcoming events', () => {
    const out = stripAnsi(
      renderHome(
        {
          schedule: scheduleWith([
            { courseName: 'Math', startPeriod: 1 },
            { courseName: 'Physics', startPeriod: 2 },
          ]),
          eventLines: ['  03-25 Hackathon', '  03-28 Study group'],
          loading: false,
        },
        noon,
      ).join('\n'),
    );
    expect(out).toContain('Physics');
    expect(out).toContain('in 2h 0m');
    expect(out).toContain('Math');
    expect(out).toContain('Hackathon');
  });

  it('falls back to "no class today" and "no upcoming class" when schedule is empty', () => {
    const out = stripAnsi(
      renderHome({ schedule: scheduleWith(), eventLines: [], loading: false }, noon).join('\n'),
    );
    expect(out).toContain('No classes today');
    expect(out).toContain('No upcoming classes');
  });

  it('asks to log in instead of showing empty class panels when there is no timetable', () => {
    const trans = t();
    const lines = renderHome(
      { schedule: null, eventLines: ['  03-25 Hackathon'], loading: false },
      noon,
    ).map(stripAnsi);
    const out = lines.join('\n');
    expect(out).toContain(trans.timetable.publicLoginAction);
    expect(out).not.toContain(trans.timetable.noClassToday);
    expect(out).not.toContain(trans.timetable.noNextClass);
    expect(out).not.toContain('%');
    expect(out).toContain('Hackathon');
  });

  it('keeps the next-class countdown on one line at forty columns', () => {
    const lines = renderHome(
      {
        schedule: scheduleWith([
          { courseName: 'Advanced Engineering Mathematics', startPeriod: 2, location: 'Bldg 3' },
        ]),
        loading: false,
      },
      noon,
      100,
      40,
    ).map(stripAnsi);
    const banner = defined(lines.find((line) => line.includes('in 2h 0m')));
    expect(banner).toContain('Advanced');
    expect(visualWidth(banner)).toBeLessThanOrEqual(40);
  });

  it('shows a loading state for events before they land', () => {
    const out = stripAnsi(renderHome({ loading: true }, noon).join('\n'));
    expect(out).toContain('Loading');
  });

  it('always returns a non-empty array', () => {
    const out = renderHome({ schedule: scheduleWith() }, noon);
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });

  it('shows real "no upcoming events" copy when the fetch succeeded but returned nothing, not a bare glyph', () => {
    const out = stripAnsi(renderHome({ eventLines: [], loading: false }, noon).join('\n'));
    expect(out).toContain('No upcoming events');
  });

  it('shows an error state when the events fetch failed, distinct from "no events"', () => {
    const out = stripAnsi(renderHome({ eventsLoadFailed: true, loading: false }, noon).join('\n'));
    expect(out).toContain('Failed to load event calendar');
    expect(out).not.toContain('No upcoming events');
  });

  it('puts the shared offline notice above every panel when showing stored events', () => {
    const lines = renderHome(
      { eventLines: ['   09-26  Meetup'], eventsLoadFailed: true },
      noon,
      40,
      80,
    );
    expect(lines.slice(0, 2)).toEqual(offlineNotice(80));
    expect(lines.map(stripAnsi)).toContain('   Events');
  });

  it.each(['en', 'zh'] as const)(
    'fits every generated home label within twenty columns in %s',
    (language) => {
      setLanguage(language);
      try {
        const trans = t();
        const lines = renderHome(
          { loading: false, schedule: scheduleWith([], 123) },
          noon,
          100,
          20,
        );
        const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

        expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
        for (const label of [
          trans.timetable.nextClass,
          trans.timetable.noNextClass,
          trans.timetable.hubToday,
          trans.timetable.noClassToday,
          trans.timetable.hubUnresolved,
          trans.menu.events,
          trans.calendar.noEvents,
        ]) {
          expect(text).toContain(label.replace(/\s/g, ''));
        }
      } finally {
        setLanguage('en');
      }
    },
  );
});

describe('renderHome adaptive event count', () => {
  const manyEventLines = Array.from(
    { length: 12 },
    (_, i) => `  07-${String(17 + i)}  Event ${String(i)}`,
  );

  it('shows only as many events as fit on a normal-size terminal', () => {
    const out = stripAnsi(
      renderHome(
        {
          schedule: scheduleWith(),
          eventLines: manyEventLines,
          loading: false,
        },
        noon,
        12,
      ).join('\n'),
    );
    const visibleCount = manyEventLines.filter((l) => out.includes(l.trim())).length;
    expect(visibleCount).toBeLessThan(manyEventLines.length);
    expect(visibleCount).toBeGreaterThan(0);
  });

  it('shows more events on a tall terminal, up to everything available', () => {
    const out = stripAnsi(
      renderHome(
        {
          schedule: scheduleWith(),
          eventLines: manyEventLines,
          loading: false,
        },
        noon,
        50,
      ).join('\n'),
    );
    for (const l of manyEventLines) expect(out).toContain(l.trim());
  });

  it.each([
    [
      'Advanced distributed systems',
      '08-03 Campus organizations coordination and planning workshop',
    ],
    ['高级分布式系统与工程实践课程', '08-03 校园组织协调与长期规划工作坊'],
  ])('fits schedule and event data within twenty columns', (courseName, eventLine) => {
    const lines = renderHome(
      {
        schedule: scheduleWith([
          { courseName, startPeriod: 1 },
          { courseName, startPeriod: 2 },
        ]),
        eventLines: [`   ${eventLine}`],
        loading: false,
      },
      noon,
      100,
      20,
    );
    const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(text).toContain(courseName.replace(/\s/g, '').slice(0, 2));
    expect(text).toContain(eventLine.replace(/\s/g, ''));
  });

  it('budgets wrapped events by rendered rows without splitting an event', () => {
    const eventLines = [
      '   08-03 Community planning workshop',
      '   08-04 Student organizations coordination meeting',
      '   08-05 Engineering projects presentation evening',
    ];
    const lines = renderHome(
      {
        schedule: scheduleWith(),
        eventLines,
        loading: false,
      },
      noon,
      12,
      20,
    );
    const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

    expect(lines.length).toBeLessThanOrEqual(12);
    expect(text).toContain(defined(eventLines[0]).replace(/\s/g, ''));
    expect(text).not.toContain(defined(eventLines[1]).replace(/\s/g, ''));
  });

  it('keeps one complete event scrollable when earlier panels fill the viewport', () => {
    const eventLine = '   08-03 Community planning workshop';
    const lines = renderHome(
      {
        weekAhead: {
          classDays: [true, false, true, false, false, false, false],
          eventDays: [false, true, false, false, true, false, false],
        },
        eventLines: [eventLine],
        loading: false,
      },
      noon,
      12,
      20,
    );
    const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

    expect(lines.length).toBeGreaterThan(12);
    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(text).toContain(eventLine.replace(/\s/g, ''));
  });
});

describe('renderHome day-progress bar', () => {
  it('shows a half-filled bar and 50% at noon', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    resetIconCache();
    const out = stripAnsi(renderHome({ schedule: scheduleWith() }, noon).join('\n'));
    expect(out).toContain('##########----------'); // 20-wide bar, half filled
    expect(out).toContain('50%');
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
  });

  it('is empty at midnight and full just before it', () => {
    const out = stripAnsi(
      renderHome({ schedule: scheduleWith() }, campusDateTime('2026-07-15', '00:00')).join('\n'),
    );
    expect(out).toContain('0%');
    const lateOut = stripAnsi(
      renderHome({ schedule: scheduleWith() }, campusDateTime('2026-07-15', '23:59')).join('\n'),
    );
    expect(lateOut).toContain('100%');
  });

  it('shrinks with a twenty-column terminal and grows back with available width', () => {
    const narrow = defined(
      renderHome({ schedule: scheduleWith() }, noon, 100, 20).find((line) =>
        stripAnsi(line).includes('50%'),
      ),
    );
    const wide = defined(
      renderHome({ schedule: scheduleWith() }, noon, 100, 40).find((line) =>
        stripAnsi(line).includes('50%'),
      ),
    );

    expect(visualWidth(narrow)).toBeLessThanOrEqual(20);
    expect(visualWidth(wide)).toBeGreaterThan(visualWidth(narrow));
    expect(stripAnsi(narrow)).toContain('50%');
    expect(stripAnsi(wide)).toContain('50%');
  });
});

describe('renderHome — week overview panel', () => {
  it('does not show the week overview panel at all when weekAhead is absent', () => {
    const out = stripAnsi(renderHome({ loading: false }, noon).join('\n'));
    expect(out).not.toContain('Week overview');
  });

  it('shows the panel with class/event row labels and a legend when weekAhead data is present', () => {
    const lines = renderHome(
      {
        loading: false,
        weekAhead: {
          classDays: [true, false, true, false, false, false, false],
          eventDays: [false, true, false, false, true, false, false],
        },
      },
      noon,
    ).map((l) => stripAnsi(l));
    const titleIdx = lines.findIndex((l) => l.includes('Week overview'));
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(lines[titleIdx + 2]).toContain('Classes');
    expect(lines[titleIdx + 3]).toContain('Events');
    expect(lines[titleIdx + 4]).toContain('Busy');
    expect(lines[titleIdx + 4]).toContain('Light');
    expect(lines[titleIdx + 4]).toContain('None');
  });

  it('shows weekend classes as busy and an empty weekend as none', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    try {
      const lines = renderHome(
        {
          loading: false,
          weekAhead: { classDays: [false, false, false, false, false, true, false] },
        },
        noon,
      ).map((l) => stripAnsi(l));
      const titleIdx = lines.findIndex((l) => l.includes('Week overview'));
      const classCells = defined(lines[titleIdx + 2])
        .trim()
        .split(/\s+/)
        .slice(1);
      expect(classCells[5]).toBe('▓▓');
      expect(classCells[6]).toBe('··');
    } finally {
      process.env['NBTCA_ICON_MODE'] = 'unicode';
      resetIconCache();
    }
  });

  it('does NOT hardcode weekend cells on the event row -- a real weekend event shows as busy', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    try {
      const lines = renderHome(
        {
          loading: false,
          weekAhead: {
            classDays: [false, false, false, false, false, false, false],
            eventDays: [false, false, false, false, false, true, false],
          },
        },
        noon,
      ).map((l) => stripAnsi(l));
      const titleIdx = lines.findIndex((l) => l.includes('Week overview'));
      const eventCells = defined(lines[titleIdx + 3])
        .trim()
        .split(/\s+/)
        .slice(1);
      const saturday = eventCells[5];
      const sunday = eventCells[6];
      expect(saturday).toBe('▓▓');
      expect(sunday).toBe('░░');
    } finally {
      process.env['NBTCA_ICON_MODE'] = 'unicode';
      resetIconCache();
    }
  });

  it('renders the event row with no glyphs at all when eventDays is not yet known', () => {
    const lines = renderHome(
      {
        loading: false,
        weekAhead: { classDays: [true, false, false, false, false, false, false] },
      },
      noon,
    ).map((l) => stripAnsi(l));
    const titleIdx = lines.findIndex((l) => l.includes('Week overview'));
    const eventLine = defined(lines[titleIdx + 3]);
    expect(eventLine).not.toMatch(/[▓░]/);
  });

  it('never collapses the grid into one array entry', () => {
    const lines = renderHome(
      {
        loading: false,
        weekAhead: {
          classDays: [true, false, false, false, false, false, false],
          eventDays: [false, true, false, false, false, false, false],
        },
      },
      noon,
    );
    for (const l of lines) expect(l).not.toContain('\n');
  });

  it.each(['en', 'zh'] as const)(
    'uses a complete vertical week grid at twenty columns in %s',
    (language) => {
      setLanguage(language);
      try {
        const trans = t();
        const lines = renderHome(
          {
            loading: false,
            weekAhead: {
              classDays: [true, false, true, false, false, false, false],
              eventDays: [false, true, false, false, true, true, false],
            },
          },
          noon,
          100,
          20,
        );
        const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

        expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
        for (const label of [
          trans.timetable.weekOverviewTitle,
          trans.timetable.weekAheadClasses,
          trans.menu.events,
          trans.timetable.weekAheadBusy,
          trans.timetable.weekAheadFree,
          trans.timetable.weekAheadNone,
        ]) {
          expect(text).toContain(label.replace(/\s/g, ''));
        }
      } finally {
        setLanguage('en');
      }
    },
  );
});

describe('renderHome — unresolved items warning', () => {
  it('does not show a warning line when unresolvedCount is 0 or absent', () => {
    const out = stripAnsi(renderHome({ loading: false }, noon).join('\n'));
    expect(out).not.toContain('Needs attention');
  });

  it('shows a warning line with the real count when unresolvedCount > 0', () => {
    const out = stripAnsi(
      renderHome({ loading: false, schedule: scheduleWith([], 3) }, noon).join('\n'),
    );
    expect(out).toContain('Needs attention');
    expect(out).toContain('3');
  });

  it('places the warning after Today/Week overview and before Events', () => {
    const lines = renderHome(
      {
        loading: false,
        schedule: scheduleWith([], 1),
        weekAhead: { classDays: [false, false, false, false, false, false, false] },
      },
      noon,
    ).map((l) => stripAnsi(l));
    const todayIdx = lines.findIndex((l) => l.includes('Today'));
    const weekIdx = lines.findIndex((l) => l.includes('Week overview'));
    const warnIdx = lines.findIndex((l) => l.includes('Needs attention'));
    expect(warnIdx).toBeGreaterThan(todayIdx);
    expect(warnIdx).toBeGreaterThan(weekIdx);
  });
});

describe('homeView.load()', () => {
  let dir: string;
  let prevStateHome: string | undefined;

  beforeEach(() => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    vi.clearAllMocks();
    calendarInRange.mockReturnValue([]);
    loadCalendarOrThrowMock.mockResolvedValue({
      inRange: calendarInRange,
      past: vi.fn().mockReturnValue([]),
      next: vi.fn().mockReturnValue([]),
      heatmap: vi.fn().mockReturnValue([]),
    });
    dir = mkdtempSync(join(tmpdir(), 'home-load-'));
    prevStateHome = process.env['XDG_STATE_HOME'];
    process.env['XDG_STATE_HOME'] = dir;
  });

  afterEach(() => {
    if (prevStateHome === undefined) delete process.env['XDG_STATE_HOME'];
    else process.env['XDG_STATE_HOME'] = prevStateHome;
    rmSync(dir, { recursive: true, force: true });
  });

  function fakeCtx(): AppContext {
    return {
      size: { rows: 24, cols: 80 },
      bodyRows: 19,
      rerender: vi.fn(),
      resetScroll: vi.fn(),
      runClassic: vi.fn(async (fn: () => Promise<void>) => {
        await fn();
      }),
      quit: vi.fn(),
    };
  }

  function writeSetUpFixture(dir: string): void {
    mkdirSync(join(dir, 'nbtca'), { recursive: true });
    writeFileSync(
      join(dir, 'nbtca', 'current-term.json'),
      JSON.stringify({ termKey: FIXTURE_TERM_KEY, weekOneMonday: FIXTURE_WEEK_ONE }),
    );
    writeFileSync(
      join(dir, 'nbtca', `timetable-${FIXTURE_TERM_KEY}.json`),
      JSON.stringify({
        term: { academicYear: '2020', semester: '1' },
        meetings: [],
        unresolvedItems: [],
        periods: [],
        calendarDays: [],
        warnings: [],
        fetchedAt: `${FIXTURE_WEEK_ONE}T00:00:00Z`,
      }),
    );
  }

  it('fetches the calendar exactly once and reuses it for both upcoming events and the week-ahead event row', async () => {
    writeSetUpFixture(dir);
    const ctx = fakeCtx();
    await homeView.load(ctx);
    expect(loadCalendarOrThrowMock).toHaveBeenCalledTimes(1);
    expect(calendarInRange).toHaveBeenCalledTimes(2);
  });

  it('does not query the week-ahead range when there is no set-up personal timetable', async () => {
    const ctx = fakeCtx();
    await homeView.load(ctx);
    expect(loadCalendarOrThrowMock).toHaveBeenCalledTimes(1);
    expect(calendarInRange).toHaveBeenCalledTimes(1);
  });

  it('populates unresolvedCount and weekAhead.classDays synchronously, before the network call resolves', async () => {
    mkdirSync(join(dir, 'nbtca'), { recursive: true });
    writeFileSync(
      join(dir, 'nbtca', 'current-term.json'),
      JSON.stringify({ termKey: FIXTURE_TERM_KEY, weekOneMonday: FIXTURE_WEEK_ONE }),
    );
    writeFileSync(
      join(dir, 'nbtca', `timetable-${FIXTURE_TERM_KEY}.json`),
      JSON.stringify({
        term: { academicYear: '2020', semester: '1' },
        meetings: [
          {
            sourceId: null,
            courseName: 'Math',
            teacherNames: [],
            location: null,
            weekday: 1,
            startPeriod: 1,
            endPeriod: 1,
            weeks: [1],
            kind: 'regular',
          },
        ],
        unresolvedItems: [
          { kind: 'practice', itemIndex: 0, sourceFields: { kcmc: 'Fitness test' } },
        ],
        periods: [{ period: 1, label: null, start: '08:00', end: '08:45' }],
        calendarDays: [],
        warnings: [],
        fetchedAt: `${FIXTURE_WEEK_ONE}T00:00:00Z`,
      }),
    );
    let capturedSync = false;
    const ctx: AppContext = {
      size: { rows: 24, cols: 80 },
      bodyRows: 19,
      rerender: vi.fn(() => {
        if (!capturedSync) {
          capturedSync = true;
          const out = stripAnsi(homeView.render(ctx).join('\n'));
          expect(out).toContain('Needs attention');
          expect(out).toContain('Week overview');
        }
      }),
      resetScroll: vi.fn(),
      runClassic: vi.fn(async (fn: () => Promise<void>) => {
        await fn();
      }),
      quit: vi.fn(),
    };
    await homeView.load(ctx);
    expect(capturedSync).toBe(true);
  });

  it('places week events on their own campus or all-day date east of campus time', async () => {
    const previousTimeZone = process.env.TZ;
    process.env.TZ = 'Pacific/Auckland';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(campusDateTime('2020-01-08', '12:00'));
    try {
      writeSetUpFixture(dir);
      calendarInRange.mockReturnValue([
        { start: new Date(2020, 0, 6), isAllDay: true, title: 'All-day Monday' },
        { start: campusDateTime('2020-01-12', '23:00'), title: 'Late Sunday' },
        { start: campusDateTime('2020-01-05', '23:00'), title: 'Previous Sunday' },
      ]);
      const ctx = fakeCtx();
      await homeView.load(ctx);
      const lines = stripAnsi(homeView.render(ctx).join('\n')).split('\n');
      const titleIdx = lines.findIndex((l) => l.includes('Week overview'));
      const cells = defined(lines[titleIdx + 3]).match(/▓▓|░░/g);
      expect(cells).toEqual(['▓▓', '░░', '░░', '░░', '░░', '░░', '▓▓']);
    } finally {
      vi.useRealTimers();
      if (previousTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimeZone;
    }
  });

  it('fills in weekAhead.eventDays from the real week-of-events after the network call resolves', async () => {
    writeSetUpFixture(dir);
    calendarInRange.mockReturnValue([
      { start: campusDateTime(FIXTURE_WEEK_ONE, '18:00'), title: 'Club meetup' },
    ]);
    const ctx = fakeCtx();
    await homeView.load(ctx);
    const out = stripAnsi(homeView.render(ctx).join('\n'));
    const lines = out.split('\n');
    const titleIdx = lines.findIndex((l) => l.includes('Week overview'));
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    const eventLine = defined(lines[titleIdx + 3]);
    expect(eventLine).toMatch(/[▓░]/);
  });
});
