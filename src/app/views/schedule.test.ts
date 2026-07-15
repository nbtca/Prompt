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

const { scheduleView, buildHubField } = await import('./schedule.js');
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
    // Fresh module state (no load() has run): not in a week/unresolved/termPicker
    // sub-mode, so there is nothing for the view to step back to internally —
    // it must defer to the app's default (leave the tab for Home).
    expect(scheduleView.handleBack?.()).toBe(false);
  });
});

describe('buildHubField', () => {
  const baseTimetable: Omit<Timetable, 'unresolvedItems'> = {
    term: { academicYear: '2026', semester: '3' },
    meetings: [],
    periods: [],
    calendarDays: [],
    warnings: [],
    fetchedAt: new Date('2026-09-07T00:00:00Z'),
  };

  it('does not show a "needs attention" row when there are no unresolved items', () => {
    const field = buildHubField({ ...baseTimetable, unresolvedItems: [] });
    const text = field.render().join('\n');
    expect(text).not.toContain('Needs attention');
  });

  it('surfaces a "needs attention" row with a count when there are unresolved items', () => {
    const field = buildHubField({
      ...baseTimetable,
      unresolvedItems: [{ kind: 'practice', itemIndex: 0, sourceFields: { kcmc: 'Fitness test' } }],
    });
    const text = field.render().join('\n');
    expect(text).toContain('Needs attention');
    expect(text).toContain('1');
  });
});

describe('scheduleView.load() with an expired session', () => {
  // Regression tests for a real "the Schedule tab is completely unusable"
  // report: a stale persisted session used to be routed into a bare error
  // screen with no login field and no session cleanup, so every future
  // launch hit the exact same dead end. Fixed by giving afterAuthenticated's
  // catch block the same session-expired handling fetchAndShowHub already had.
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
    expect(out).toContain(t().timetable.menuEntry);
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
    sessionStoreLoad.mockReturnValue(null); // no persisted session at all

    const ctx = fakeCtx();
    await scheduleView.load(ctx);

    expect(scheduleView.capturesInput?.()).toBe(false); // public hub is a ListField, not a text field
    const out = stripAnsi(scheduleView.render(ctx).join('\n'));
    expect(out).toContain(t().timetable.publicLoginAction);
    expect(out).not.toContain(t().timetable.studentId);
  });
});
