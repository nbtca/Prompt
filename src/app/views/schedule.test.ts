import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { SessionExpiredError } from '../../auth/errors.js';
import type * as NbtcalModule from '@nbtca/nbtcal';
import type * as TimetableModule from '@nbtca/nbtcal/timetable';
import type * as NbtAuthModule from '../../auth/nbt-auth.js';
import type * as ScheduleStoreModule from '../../features/schedule-store.js';
import type * as CalendarModule from '../../features/calendar.js';

const sessionStoreClear = vi.fn();
const sessionStoreLoad = vi.fn();
const setVimKeysActiveMock = vi.hoisted(() => vi.fn());
const currentAcademicWindowMock = vi.hoisted(() => vi.fn().mockReturnValue(null));
const inferWeekOneMondayMock = vi.hoisted(() => vi.fn().mockReturnValue(null));
const isAcademicBreakEventMock = vi.hoisted(() => vi.fn().mockReturnValue(false));

vi.mock('@nbtca/nbtcal', async (importOriginal) => {
  const actual = await importOriginal<typeof NbtcalModule>();
  return {
    ...actual,
    currentAcademicWindow: currentAcademicWindowMock,
    inferWeekOneMonday: inferWeekOneMondayMock,
    isAcademicBreakEvent: isAcademicBreakEventMock,
  };
});

vi.mock('../../core/vim-keys.js', () => ({
  setVimKeysActive: setVimKeysActiveMock,
}));

vi.mock('../../auth/session-store.js', () => ({
  createSessionStore: () => ({
    filePath: '/tmp/fake-session.json',
    load: sessionStoreLoad,
    save: vi.fn(),
    clear: sessionStoreClear,
  }),
}));

vi.mock('../../auth/nbt-auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof NbtAuthModule>();
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
  const actual = await importOriginal<typeof TimetableModule>();
  return {
    ...actual,
    createNbtTimetableClient: () => ({ listTerms, fetchTerm: vi.fn() }),
  };
});

vi.mock('../../features/schedule-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ScheduleStoreModule>();
  return {
    ...actual,
    loadCurrentPointer: vi.fn().mockReturnValue(null),
    loadTimetableCache: vi.fn().mockReturnValue(null),
  };
});

const calendarUpcoming = vi.fn().mockReturnValue([]);
const calendarInRange = vi.fn().mockReturnValue([]);
vi.mock('../../features/calendar.js', async (importOriginal) => {
  const actual = await importOriginal<typeof CalendarModule>();
  return {
    ...actual,
    loadCalendarOrThrow: vi.fn().mockResolvedValue({
      upcoming: calendarUpcoming,
      past: vi.fn().mockReturnValue([]),
      next: vi.fn().mockReturnValue([]),
      inRange: calendarInRange,
      heatmap: vi.fn().mockReturnValue([]),
    }),
  };
});

const { scheduleView } = await import('./schedule.js');
const { setLanguage } = await import('../../i18n/index.js');
const { resetIconCache } = await import('../../core/icons.js');
const { stripAnsi, visualWidth } = await import('../../core/text.js');
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
    resetScroll: vi.fn(),
    runClassic: vi.fn(async (fn: () => Promise<void>) => {
      await fn();
    }),
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
    expect(typeof scheduleView.capturesInput()).toBe('boolean');
  });

  it('handleBack() returns false when there is nothing to step back from', () => {
    expect(scheduleView.handleBack(fakeCtx())).toBe(false);
  });

  it('does not offer move or open actions while loading', () => {
    const hint = stripAnsi(scheduleView.footerHint(5, 80) ?? '');
    expect(hint).toContain('1-5');
    expect(hint).not.toContain(t().menu.hintMove);
    expect(hint).not.toContain(t().menu.hintOpen);
  });
});

describe('scheduleView.load() with an expired session', () => {
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

  it('routes to the login field (not a dead-end error) and clears the stale session, when launching with no cache', async () => {
    vi.mocked(loadCurrentPointer).mockReturnValue(null);
    sessionStoreLoad.mockReturnValue({
      version: 1,
      provider: 'nbt-webvpn',
      jar: { cookies: [] },
      authenticatedAt: '2026-01-01T00:00:00Z',
      validatedAt: '2026-01-01T00:00:00Z',
    });
    listTerms.mockRejectedValue(new SessionExpiredError());

    const ctx = fakeCtx();
    await scheduleView.load(ctx);

    expect(sessionStoreClear).toHaveBeenCalled();
    expect(scheduleView.capturesInput()).toBe(true);
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.studentId);
  });

  it('keeps an already-shown cached hub on screen when a background session refresh fails', async () => {
    vi.mocked(loadCurrentPointer).mockReturnValue({
      termKey: '2026-3',
      weekOneMonday: '2026-09-07',
    });
    vi.mocked(loadTimetableCache).mockReturnValue({
      term: { academicYear: '2026', semester: '3' },
      meetings: [],
      periods: [],
      calendarDays: [],
      warnings: [],
      unresolvedItems: [],
      fetchedAt: new Date('2026-09-07T00:00:00Z'),
    });
    sessionStoreLoad.mockReturnValue({
      version: 1,
      provider: 'nbt-webvpn',
      jar: { cookies: [] },
      authenticatedAt: '2026-01-01T00:00:00Z',
      validatedAt: '2026-01-01T00:00:00Z',
    });
    listTerms.mockRejectedValue(new SessionExpiredError());

    const ctx = fakeCtx();
    await scheduleView.load(ctx);

    expect(sessionStoreClear).toHaveBeenCalled();
    expect(scheduleView.capturesInput()).toBe(false);
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.hubLogout); // shortcut bar's own "Log out" -- the hub's always-present anchor
  });

  it('does not offer move or open actions on an error screen', async () => {
    vi.mocked(loadCurrentPointer).mockReturnValue(null);
    sessionStoreLoad.mockReturnValue({
      version: 1,
      provider: 'nbt-webvpn',
      jar: { cookies: [] },
      authenticatedAt: '2026-01-01T00:00:00Z',
      validatedAt: '2026-01-01T00:00:00Z',
    });
    listTerms.mockRejectedValue(new Error('Broke'));

    await scheduleView.load(fakeCtx());

    const hint = stripAnsi(scheduleView.footerHint(5, 80) ?? '');
    expect(hint).toContain('1-5');
    expect(hint).not.toContain(t().menu.hintMove);
    expect(hint).not.toContain(t().menu.hintOpen);
  });
});

describe('scheduleView.load() with no session — public view', () => {
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

  it('shows the public view (not a login prompt) when there is no persisted session', async () => {
    vi.mocked(loadCurrentPointer).mockReturnValue(null);
    sessionStoreLoad.mockReturnValue(null);

    const ctx = fakeCtx();
    await scheduleView.load(ctx);

    expect(scheduleView.capturesInput()).toBe(false);
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.publicLoginAction);
    expect(out).not.toContain(t().timetable.studentId);
  });

  it('derives the public academic window through nbtcal', async () => {
    vi.mocked(loadCurrentPointer).mockReturnValue(null);
    sessionStoreLoad.mockReturnValue(null);
    calendarInRange.mockReturnValue([]);

    await scheduleView.load(fakeCtx());

    expect(currentAcademicWindowMock).toHaveBeenCalledWith([], expect.any(Date));
  });

  it('restores Vim keys when Esc leaves the student ID field', async () => {
    vi.mocked(loadCurrentPointer).mockReturnValue(null);
    sessionStoreLoad.mockReturnValue(null);
    const ctx = fakeCtx();
    await scheduleView.load(ctx);

    scheduleView.handleKey('\r', ctx);
    expect(scheduleView.capturesInput()).toBe(true);
    expect(setVimKeysActiveMock).toHaveBeenLastCalledWith(false);
    expect(visualWidth(scheduleView.footerHint(5, 20) ?? '')).toBeLessThanOrEqual(17);

    expect(scheduleView.handleBack(ctx)).toBe(true);
    expect(scheduleView.capturesInput()).toBe(false);
    expect(setVimKeysActiveMock).toHaveBeenLastCalledWith(true);
  });

  it('steps from password to student ID before leaving login', async () => {
    vi.mocked(loadCurrentPointer).mockReturnValue(null);
    sessionStoreLoad.mockReturnValue(null);
    const ctx = fakeCtx();
    await scheduleView.load(ctx);

    scheduleView.handleKey('\r', ctx);
    scheduleView.handleKey('20260001', ctx);
    scheduleView.handleKey('\r', ctx);

    expect(scheduleView.handleBack(ctx)).toBe(true);
    expect(scheduleView.capturesInput()).toBe(true);
    expect(stripAnsi(scheduleView.render(ctx).join('\n'))).toContain(t().timetable.studentId);

    expect(scheduleView.handleBack(ctx)).toBe(true);
    expect(scheduleView.capturesInput()).toBe(false);
    expect(setVimKeysActiveMock).toHaveBeenLastCalledWith(true);
  });
});

describe('scheduleView — hub navigation', () => {
  function fakeCtx(): AppContext {
    return {
      size: { rows: 24, cols: 80 },
      bodyRows: 40,
      rerender: vi.fn(),
      resetScroll: vi.fn(),
      runClassic: vi.fn(async (fn: () => Promise<void>) => {
        await fn();
      }),
      quit: vi.fn(),
    };
  }

  async function loadIntoHub(timetable?: Partial<Timetable>): Promise<AppContext> {
    vi.mocked(loadCurrentPointer).mockReturnValue({
      termKey: '2026-3',
      weekOneMonday: '2026-09-07',
    });
    vi.mocked(loadTimetableCache).mockReturnValue({
      term: { academicYear: '2026', semester: '3' },
      meetings: [],
      periods: [{ period: 1, label: null, start: '08:00', end: '08:45' }],
      calendarDays: [],
      warnings: [],
      unresolvedItems: [],
      fetchedAt: new Date('2026-09-07T00:00:00Z'),
      ...timetable,
    });
    sessionStoreLoad.mockReturnValue({
      version: 1,
      provider: 'nbt-webvpn',
      jar: { cookies: [] },
      authenticatedAt: '2026-01-01T00:00:00Z',
      validatedAt: '2026-01-01T00:00:00Z',
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

    expect(scheduleView.handleBack(ctx)).toBe(true);
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
      meetings: [
        {
          sourceId: null,
          courseName: 'Math',
          teacherNames: ['Dr Li'],
          location: 'Room 201',
          weekday: 1,
          startPeriod: 1,
          endPeriod: 1,
          weeks: [1],
          kind: 'regular',
        },
      ],
    });
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
    scheduleView.handleKey('\r', ctx);
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.hubLogout);
  });

  it('logs out via the "x" shortcut', async () => {
    const ctx = await loadIntoHub();
    scheduleView.handleKey('x', ctx);
    expect(sessionStoreClear).toHaveBeenCalled();
  });

  describe('footerHint — drill-down screens do not promise "move · open"', () => {
    it('termDensity mode drops move/open but keeps the tab-switch and quit hints', async () => {
      const ctx = await loadIntoHub();
      scheduleView.handleKey('t', ctx);
      const hint = scheduleView.footerHint(5, 80);
      expect(hint).toBeDefined();
      expect(hint).not.toContain(t().menu.hintMove);
      expect(hint).not.toContain(t().menu.hintOpen);
      expect(hint).toContain('1-5');
      expect(hint).toContain(t().menu.hintQuit);
    });

    it('unresolved mode drops move/open but keeps the tab-switch and quit hints', async () => {
      const ctx = await loadIntoHub({
        unresolvedItems: [
          { kind: 'practice', itemIndex: 0, sourceFields: { kcmc: 'Fitness test' } },
        ],
      });
      scheduleView.handleKey('u', ctx);
      const hint = scheduleView.footerHint(5, 80);
      expect(hint).not.toContain(t().menu.hintMove);
      expect(hint).not.toContain(t().menu.hintOpen);
      expect(hint).toContain(t().menu.hintQuit);
    });

    it('meetingDetail mode drops move/open but keeps the tab-switch and quit hints', async () => {
      const ctx = await loadIntoHub({
        meetings: [
          {
            sourceId: null,
            courseName: 'Math',
            teacherNames: ['Dr Li'],
            location: 'Room 201',
            weekday: 1,
            startPeriod: 1,
            endPeriod: 1,
            weeks: [1],
            kind: 'regular',
          },
        ],
      });
      for (let i = 0; i < 7; i++) scheduleView.handleKey('\x1b[D', ctx);
      scheduleView.handleKey('\r', ctx);
      const hint = scheduleView.footerHint(5, 80);
      expect(hint).not.toContain(t().menu.hintMove);
      expect(hint).not.toContain(t().menu.hintOpen);
    });

    it('the standalone week grid is NOT treated as a drill-down -- its arrow/Enter keys genuinely move/open', async () => {
      const ctx = await loadIntoHub();
      scheduleView.handleKey('w', ctx);
      const hint = scheduleView.footerHint(5, 80);
      expect(hint).toBeUndefined(); // falls through to chrome's generic hint
    });
  });

  describe('short/narrow terminal — inline grid falls back to the single-day view', () => {
    const busyPeriods = Array.from({ length: 12 }, (_, i) => ({
      period: i + 1,
      label: null,
      start: `${String(8 + i).padStart(2, '0')}:00`,
      end: `${String(8 + i).padStart(2, '0')}:45`,
    }));
    const busyMeetings = [
      {
        sourceId: null,
        courseName: 'Math',
        teacherNames: ['Dr Li'],
        location: 'Room 201',
        weekday: 1,
        startPeriod: 1,
        endPeriod: 1,
        weeks: [1],
        kind: 'regular',
      },
    ] satisfies Timetable['meetings'];

    async function loadIntoShortHub(): Promise<AppContext> {
      const ctx = await loadIntoHub({ periods: busyPeriods, meetings: busyMeetings });
      ctx.bodyRows = 19;
      return ctx;
    }

    it('confirms the single-day view (not the grid) is what actually rendered', async () => {
      const ctx = await loadIntoShortHub();
      const out = stripAnsi(scheduleView.render(ctx).join('\n'));
      expect(out).not.toContain('19:00'); // the grid's own period-12 row label -- absent when the day view is shown
      expect(out).toContain('Room 201'); // the single-day view's own location column
    });

    it('opens a meeting-detail card on Enter in the single-day view, same as in the grid', async () => {
      const ctx = await loadIntoShortHub();
      for (let i = 0; i < 7; i++) scheduleView.handleKey('\x1b[D', ctx);
      scheduleView.handleKey('\r', ctx);
      const out = stripAnsi(scheduleView.render(ctx).join('\n'));
      expect(out).toContain('Math');
      expect(out).toContain('Room 201');
    });

    it('does not crash on arrow-key navigation in the single-day view', async () => {
      const ctx = await loadIntoShortHub();
      expect(() => {
        scheduleView.handleKey('\x1b[D', ctx);
        scheduleView.handleKey('\x1b[A', ctx);
        scheduleView.handleKey('\x1b[B', ctx);
      }).not.toThrow();
      const out = stripAnsi(scheduleView.render(ctx).join('\n'));
      expect(out).toContain(t().timetable.hubLogout); // stayed on hub
    });

    it('still reaches the standalone full-grid mode via the "w" shortcut even when the inline single-day view is showing', async () => {
      const ctx = await loadIntoShortHub();
      scheduleView.handleKey('w', ctx);
      const out = stripAnsi(scheduleView.render(ctx).join('\n'));
      expect(out).toContain(t().timetable.hubWeek); // standalone full-screen week mode
    });
  });
});
