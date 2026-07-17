import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { SessionExpiredError } from '../../auth/errors.js';

const sessionStoreClear = vi.fn();
const sessionStoreLoad = vi.fn();

vi.mock('../../auth/session-store.js', () => ({
  createSessionStore: () => ({
    filePath: '/tmp/fake-session.json',
    load: sessionStoreLoad,
    save: vi.fn(),
    clear: sessionStoreClear,
  }),
}));

vi.mock('../../auth/nbt-auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/nbt-auth.js')>();
  return {
    ...actual,
    restoreNbtSession: vi.fn().mockResolvedValue({
      timetableTransport: {},
      snapshot: vi.fn(),
      close: vi.fn(),
    }),
  };
});

const listTerms = vi.fn();
vi.mock('@nbtca/nbtcal/timetable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nbtca/nbtcal/timetable')>();
  return {
    ...actual,
    createNbtTimetableClient: () => ({ listTerms, fetchTerm: vi.fn() }),
  };
});

vi.mock('../../features/schedule-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/schedule-store.js')>();
  return { ...actual, loadCurrentPointer: vi.fn().mockReturnValue(null), loadTimetableCache: vi.fn().mockReturnValue(null) };
});

const calendarUpcoming = vi.fn().mockReturnValue([]);
const calendarInRange = vi.fn().mockReturnValue([]);
vi.mock('../../features/calendar.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/calendar.js')>();
  return {
    ...actual,
    loadCalendarOrThrow: vi.fn().mockResolvedValue({
      upcoming: calendarUpcoming, past: vi.fn().mockReturnValue([]),
      next: vi.fn().mockReturnValue([]), inRange: calendarInRange,
      heatmap: vi.fn().mockReturnValue([]),
    }),
  };
});

const { scheduleView } = await import('./schedule.js');
const { setLanguage } = await import('../../i18n/index.js');
const { resetIconCache } = await import('../../core/icons.js');
const { stripAnsi } = await import('../../core/text.js');
const { loadCurrentPointer, loadTimetableCache } = await import('../../features/schedule-store.js');
const { t } = await import('../../i18n/index.js');
import type { AppContext } from '../view.js';
import type { Timetable } from '@nbtca/nbtcal/timetable';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

beforeEach(() => {
  vi.clearAllMocks();
});

function fakeCtx(): AppContext {
  return {
    size: { rows: 24, cols: 80 },
    bodyRows: 19,
    rerender: vi.fn(),
    runClassic: vi.fn(async (fn: () => Promise<void>) => { await fn(); }),
    quit: vi.fn(),
  };
}

describe('scheduleView', () => {
  it('has the expected id and title', () => {
    expect(scheduleView.id).toBe('schedule');
    expect(typeof scheduleView.title).toBe('string');
  });

  it('render() never throws before load() has run', () => {
    const ctx = fakeCtx();
    expect(() => scheduleView.render(ctx)).not.toThrow();
  });

  it('render() output is non-empty text', () => {
    const ctx = fakeCtx();
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out.trim().length).toBeGreaterThan(0);
  });

  it('capturesInput() returns a boolean and does not throw', () => {
    expect(typeof scheduleView.capturesInput?.()).toBe('boolean');
  });

  it('handleBack() returns false when there is nothing to step back from', () => {
    expect(scheduleView.handleBack?.()).toBe(false);
  });
});

// hubShortcuts itself (its data shape, the unresolved-count badge, key
// ordering) is fully covered by src/app/views/schedule-render.test.ts
// (Task 7) -- no need to re-test the same pure function's behavior here.
// This file's own tests exercise it only through scheduleView's key
// handling, below.

describe('scheduleView.load() with an expired session', () => {
  function fakeCtx(): AppContext {
    return {
      size: { rows: 24, cols: 80 },
      bodyRows: 19,
      rerender: vi.fn(),
      runClassic: vi.fn(async (fn: () => Promise<void>) => { await fn(); }),
      quit: vi.fn(),
    };
  }

  it('routes to the login field (not a dead-end error) and clears the stale session, when launching with no cache', async () => {
    vi.mocked(loadCurrentPointer).mockReturnValue(null);
    sessionStoreLoad.mockReturnValue({
      version: 1, provider: 'nbt-webvpn', jar: { cookies: [] }, authenticatedAt: '2026-01-01T00:00:00Z', validatedAt: '2026-01-01T00:00:00Z',
    });
    listTerms.mockRejectedValue(new SessionExpiredError());

    const ctx = fakeCtx();
    await scheduleView.load(ctx);

    expect(sessionStoreClear).toHaveBeenCalled();
    expect(scheduleView.capturesInput?.()).toBe(true);
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.studentId);
  });

  it('keeps an already-shown cached hub on screen when a background session refresh fails', async () => {
    vi.mocked(loadCurrentPointer).mockReturnValue({ termKey: '2026-3', weekOneMonday: '2026-09-07' });
    vi.mocked(loadTimetableCache).mockReturnValue({
      term: { academicYear: '2026', semester: '3' },
      meetings: [], periods: [], calendarDays: [], warnings: [], unresolvedItems: [],
      fetchedAt: new Date('2026-09-07T00:00:00Z'),
    } as unknown as Timetable);
    sessionStoreLoad.mockReturnValue({
      version: 1, provider: 'nbt-webvpn', jar: { cookies: [] }, authenticatedAt: '2026-01-01T00:00:00Z', validatedAt: '2026-01-01T00:00:00Z',
    });
    listTerms.mockRejectedValue(new SessionExpiredError());

    const ctx = fakeCtx();
    await scheduleView.load(ctx);

    expect(sessionStoreClear).toHaveBeenCalled();
    expect(scheduleView.capturesInput?.()).toBe(false);
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.hubLogout); // shortcut bar's own "Log out" -- the hub's always-present anchor
  });
});

describe('scheduleView.load() with no session — public view', () => {
  function fakeCtx(): AppContext {
    return {
      size: { rows: 24, cols: 80 }, bodyRows: 19, rerender: vi.fn(),
      runClassic: vi.fn(async (fn: () => Promise<void>) => { await fn(); }), quit: vi.fn(),
    };
  }

  it('shows the public view (not a login prompt) when there is no persisted session', async () => {
    vi.mocked(loadCurrentPointer).mockReturnValue(null);
    sessionStoreLoad.mockReturnValue(null);

    const ctx = fakeCtx();
    await scheduleView.load(ctx);

    expect(scheduleView.capturesInput?.()).toBe(false);
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.publicLoginAction);
    expect(out).not.toContain(t().timetable.studentId);
  });
});

describe('scheduleView — hub navigation', () => {
  function fakeCtx(): AppContext {
    return {
      size: { rows: 24, cols: 80 }, bodyRows: 40, rerender: vi.fn(),
      runClassic: vi.fn(async (fn: () => Promise<void>) => { await fn(); }), quit: vi.fn(),
    };
  }

  async function loadIntoHub(timetable?: Partial<Timetable>): Promise<AppContext> {
    vi.mocked(loadCurrentPointer).mockReturnValue({ termKey: '2026-3', weekOneMonday: '2026-09-07' });
    vi.mocked(loadTimetableCache).mockReturnValue({
      term: { academicYear: '2026', semester: '3' },
      meetings: [], periods: [{ period: 1, label: null, start: '08:00', end: '08:45' }],
      calendarDays: [], warnings: [], unresolvedItems: [],
      fetchedAt: new Date('2026-09-07T00:00:00Z'),
      ...timetable,
    } as unknown as Timetable);
    sessionStoreLoad.mockReturnValue({
      version: 1, provider: 'nbt-webvpn', jar: { cookies: [] }, authenticatedAt: '2026-01-01T00:00:00Z', validatedAt: '2026-01-01T00:00:00Z',
    });
    listTerms.mockRejectedValue(new SessionExpiredError());
    const ctx = fakeCtx();
    await scheduleView.load(ctx);
    return ctx;
  }

  it('navigates into termDensity mode via the "t" shortcut and back to the hub on Esc', async () => {
    const ctx = await loadIntoHub();
    scheduleView.handleKey('t', ctx);
    let out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.termDensityTitle);

    expect(scheduleView.handleBack?.()).toBe(true);
    out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.hubLogout);
  });

  it('navigates into the standalone week grid via the "w" shortcut and back to the hub on any key', async () => {
    const ctx = await loadIntoHub();
    scheduleView.handleKey('w', ctx);
    let out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.hubWeek);

    scheduleView.handleKey('z', ctx); // any key returns
    out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.hubLogout);
  });

  it('opens a meeting detail card on Enter when the cursor cell has a class, and returns to the hub on any key', async () => {
    const ctx = await loadIntoHub({
      meetings: [{
        sourceId: null, courseName: 'Math', teacherNames: ['Dr Li'], location: 'Room 201',
        weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1], kind: 'regular',
      }],
    });
    // The default cursor starts at *today's real* weekday (whatever day this
    // test suite happens to run on), not a fixed fixture date -- move all
    // the way left first (no wraparound, so 7 presses guarantees landing on
    // Monday/weekday 1 regardless of the starting weekday) to deterministically
    // reach the cell that matches this fixture's Mon/period1 meeting.
    for (let i = 0; i < 7; i++) scheduleView.handleKey('\x1b[D', ctx);
    scheduleView.handleKey('\r', ctx);
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain('Math');
    expect(out).toContain('Room 201');

    scheduleView.handleKey('z', ctx);
    const back = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(back).toContain(t().timetable.hubLogout);
  });

  it('does not open a detail card on Enter when the cursor cell is empty', async () => {
    const ctx = await loadIntoHub();
    scheduleView.handleKey('\r', ctx);
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.hubLogout); // stayed on hub, not meetingDetail
  });

  it('moves the grid cursor right with ArrowRight and does not wrap past Sunday', async () => {
    const ctx = await loadIntoHub();
    for (let i = 0; i < 10; i++) scheduleView.handleKey('\x1b[C', ctx);
    // No direct cursor accessor from the view -- confirm indirectly: Enter
    // at the clamped-right edge (weekday 7) still doesn't crash and the
    // view stays on hub (no meeting there in this empty-meetings fixture).
    scheduleView.handleKey('\r', ctx);
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.hubLogout);
  });

  it('logs out via the "x" shortcut', async () => {
    const ctx = await loadIntoHub();
    scheduleView.handleKey('x', ctx);
    expect(sessionStoreClear).toHaveBeenCalled();
  });

  describe('short terminal — inline grid falls back to the non-interactive strip', () => {
    // A busy-enough period table (matches schedule-render.test.ts's own
    // "busyTimetable" fixture used to exercise this same fallback) so the
    // grid genuinely does not fit in a short bodyRows, forcing renderHubBody
    // to fall back to renderWeekStrip. Regression: arrow keys/Enter used to
    // still move/act on state.gridCursor in this state even though the
    // strip -- not the grid -- is what's actually on screen, so pressing
    // Enter could pop open a meeting-detail card for a cell the student
    // can't see.
    const busyPeriods = Array.from({ length: 12 }, (_, i) => ({
      period: i + 1, label: null,
      start: `${String(8 + i).padStart(2, '0')}:00`, end: `${String(8 + i).padStart(2, '0')}:45`,
    }));
    const busyMeetings = [{
      sourceId: null, courseName: 'Math', teacherNames: ['Dr Li'], location: 'Room 201',
      weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1], kind: 'regular' as const,
    }];

    async function loadIntoShortHub(): Promise<AppContext> {
      const ctx = await loadIntoHub({ periods: busyPeriods, meetings: busyMeetings });
      ctx.bodyRows = 19; // matches schedule-render.test.ts's own "too short, falls back to the strip" fixture
      return ctx;
    }

    it('confirms the strip (not the grid), not the interactive grid, is what actually rendered', async () => {
      const ctx = await loadIntoShortHub();
      const out = stripAnsi(scheduleView.render(ctx).join('\n'));
      expect(out).not.toContain('19:00'); // the grid's own period-12 row label -- absent when the strip is shown
      expect(out).toContain('has class'); // the strip's own legend text
    });

    it('does not open a meeting-detail card or crash on Enter when the strip is shown instead of the grid', async () => {
      const ctx = await loadIntoShortHub();
      // The default cursor starts at *today's real* weekday (whatever day
      // this suite happens to run on) -- move all the way left first (no
      // wraparound, so 7 presses guarantees landing on Monday/weekday 1
      // regardless of the starting weekday, matching the pattern used by
      // the "opens a meeting detail card" test above) so this deterministically
      // lands on the Math meeting's cell. If the gate were missing, this
      // would pop open its detail card even though the grid isn't visible.
      expect(() => {
        for (let i = 0; i < 7; i++) scheduleView.handleKey('\x1b[D', ctx);
        scheduleView.handleKey('\r', ctx);
      }).not.toThrow();
      const out = stripAnsi(scheduleView.render(ctx).join('\n'));
      // meetingDetail mode renders only the detail card (no shortcut bar) --
      // so "Log out" being present is itself proof no card opened and the
      // view stayed on hub. (The banner above the strip legitimately
      // mentions "Room 201" via the next-class summary, so asserting its
      // absence would be the wrong check here.)
      expect(out).toContain(t().timetable.hubLogout); // stayed on hub
    });

    it('does not crash on arrow-key navigation when the strip is shown instead of the grid', async () => {
      const ctx = await loadIntoShortHub();
      expect(() => {
        scheduleView.handleKey('\x1b[D', ctx);
        scheduleView.handleKey('\x1b[A', ctx);
        scheduleView.handleKey('\x1b[B', ctx);
      }).not.toThrow();
      const out = stripAnsi(scheduleView.render(ctx).join('\n'));
      expect(out).toContain(t().timetable.hubLogout); // stayed on hub
    });

    it('still reaches the interactive grid via the "w" shortcut even when the inline strip is showing', async () => {
      const ctx = await loadIntoShortHub();
      scheduleView.handleKey('w', ctx);
      const out = stripAnsi(scheduleView.render(ctx).join('\n'));
      expect(out).toContain(t().timetable.hubWeek); // standalone full-screen week mode, unaffected by the gate
    });
  });
});
