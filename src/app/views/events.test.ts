import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import type * as CalendarModule from '../../features/calendar.js';

const calendarInRange = vi.fn().mockReturnValue([]);
const calendarHeatmap = vi.fn().mockReturnValue([]);
const exportEventIcsMock = vi.fn().mockReturnValue({ ok: true, path: '/tmp/event.ics' });
const loadCalendarOrCacheMock = vi.fn().mockResolvedValue({
  calendar: {
    upcoming: vi.fn().mockReturnValue([]),
    past: vi.fn().mockReturnValue([]),
    next: vi.fn().mockReturnValue([]),
    inRange: calendarInRange,
    heatmap: calendarHeatmap,
  },
  stale: false,
});
vi.mock('../../features/calendar.js', async (importOriginal) => {
  const actual = await importOriginal<typeof CalendarModule>();
  return {
    ...actual,
    exportEventIcs: exportEventIcsMock,
    loadCalendarOrCache: loadCalendarOrCacheMock,
  };
});

const { eventsView } = await import('./events.js');
const { setLanguage, t } = await import('../../i18n/index.js');
const { resetIconCache } = await import('../../core/icons.js');
const { stripAnsi } = await import('../../core/text.js');
import type { AppContext } from '../view.js';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

beforeEach(() => {
  calendarInRange.mockReturnValue([]);
  calendarHeatmap.mockReturnValue([{ date: '2026-07-14', count: 1 }]);
  exportEventIcsMock.mockClear();
  loadCalendarOrCacheMock.mockClear();
});

function fakeCtx() {
  return {
    size: { rows: 24, cols: 80 },
    bodyRows: 19,
    rerender: vi.fn(),
    resetScroll: vi.fn(),
    runClassic: vi.fn(async (fn: () => Promise<void>) => {
      await fn();
    }),
    quit: vi.fn(),
  } satisfies AppContext;
}

describe('eventsView', () => {
  it('has the expected id and title', () => {
    expect(eventsView.id).toBe('events');
    expect(typeof eventsView.title).toBe('string');
  });

  it('render() never throws before load() has run', () => {
    const ctx = fakeCtx();
    expect(() => eventsView.render(ctx)).not.toThrow();
  });

  it('render() output is non-empty text', () => {
    const ctx = fakeCtx();
    const out = stripAnsi(eventsView.render(ctx).join('\n'));
    expect(out.trim().length).toBeGreaterThan(0);
  });

  it('capturesInput() returns a boolean and does not throw', () => {
    expect(typeof eventsView.capturesInput()).toBe('boolean');
  });

  it('handleBack() returns false when there is nothing to step back from', () => {
    expect(eventsView.handleBack()).toBe(false);
  });

  it('does not offer move or open actions while loading', () => {
    const hint = stripAnsi(eventsView.footerHint(5, 80) ?? '');
    expect(hint).toContain('1-5');
    expect(hint).not.toContain(t().menu.hintMove);
    expect(hint).not.toContain(t().menu.hintOpen);
  });

  it('says the calendar looks offline and retries from the error screen', async () => {
    loadCalendarOrCacheMock.mockRejectedValueOnce(new Error('Broke'));
    const ctx = fakeCtx();
    await eventsView.load(ctx);
    const out = stripAnsi(eventsView.render(ctx).join('\n'));
    expect(out).toContain(t().calendar.offlineError);
    expect(out).toContain(t().calendar.errorHint);
    expect(out).toContain(t().calendar.retry);
    expect(eventsView.capturesPageKeys()).toBe(true);

    eventsView.handleKey('\r', ctx);
    await Promise.resolve();
    expect(loadCalendarOrCacheMock).toHaveBeenCalledTimes(2);
  });
});

describe('eventsView detail screen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-15T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the event title exactly once, not once as the heading and again as the field title', async () => {
    calendarInRange.mockReturnValue([
      {
        uid: '1',
        title: 'Hackathon kickoff',
        start: new Date('2026-07-18T18:00:00'),
        end: null,
        isAllDay: false,
        location: 'Lab 3',
        description: '',
        recurring: false,
      },
    ]);
    const ctx = fakeCtx();
    await eventsView.load(ctx);

    eventsView.handleKey('\r', ctx); // hub -> "Upcoming" (first option) -> list
    eventsView.handleKey('\r', ctx); // list -> select the one event -> detail

    const out = stripAnsi(eventsView.render(ctx).join('\n'));
    const occurrences = out.split('Hackathon kickoff').length - 1;
    expect(occurrences).toBe(1);
  });

  it('exports the selected event when multiple events have the same title', async () => {
    const first = {
      uid: 'first',
      title: 'Weekly meetup',
      start: new Date('2026-07-18T18:00:00Z'),
      end: null,
      isAllDay: false,
      location: 'Lab 1',
      description: '',
      recurring: false,
    };
    const second = {
      uid: 'second',
      title: 'Weekly meetup',
      start: new Date('2026-07-25T18:00:00Z'),
      end: null,
      isAllDay: false,
      location: 'Lab 2',
      description: '',
      recurring: false,
    };
    calendarInRange.mockReturnValue([first, second]);
    const ctx = fakeCtx();
    await eventsView.load(ctx);

    eventsView.handleKey('\r', ctx);
    eventsView.handleKey('\x1b[B', ctx);
    eventsView.handleKey('\r', ctx);
    eventsView.handleKey('\r', ctx);

    expect(exportEventIcsMock).toHaveBeenCalledOnce();
    expect(exportEventIcsMock).toHaveBeenCalledWith(second);
  });
});

describe('eventsView heatmap navigation', () => {
  it('selecting the heatmap hub option shows the grid, and any key (or Esc) returns to the hub', async () => {
    const ctx = fakeCtx();
    await eventsView.load(ctx);

    for (let i = 0; i < 5; i++) eventsView.handleKey('\x1b[B', ctx);
    eventsView.handleKey('\r', ctx);

    let out = stripAnsi(eventsView.render(ctx).join('\n'));
    expect(out).toContain(t().calendar.heatmap.title);
    expect(out).toContain(t().calendar.heatmap.legendLess);

    expect(out).not.toContain(t().calendar.search);

    eventsView.handleKey('x', ctx);
    out = stripAnsi(eventsView.render(ctx).join('\n'));
    expect(out).toContain(t().calendar.search);
    expect(out).not.toContain(t().calendar.heatmap.legendLess);
  });

  it('handleBack() (Esc) also returns from heatmap mode to the hub', async () => {
    const ctx = fakeCtx();
    await eventsView.load(ctx);
    for (let i = 0; i < 5; i++) eventsView.handleKey('\x1b[B', ctx);
    eventsView.handleKey('\r', ctx);

    expect(eventsView.handleBack()).toBe(true);
    const out = stripAnsi(eventsView.render(ctx).join('\n'));
    expect(out).toContain(t().calendar.search);
  });

  it('footerHint drops move/open in heatmap mode (any key returns to the hub, there is no field)', async () => {
    const ctx = fakeCtx();
    await eventsView.load(ctx);
    for (let i = 0; i < 5; i++) eventsView.handleKey('\x1b[B', ctx);
    eventsView.handleKey('\r', ctx);

    const hint = eventsView.footerHint(5, 80);
    expect(hint).toBeDefined();
    expect(hint).not.toContain(t().menu.hintMove);
    expect(hint).not.toContain(t().menu.hintOpen);
    expect(hint).toContain('1-5');
    expect(hint).toContain(t().menu.hintQuit);
  });
});

describe('eventsView navigation', () => {
  const DOWN = '\x1b[B';
  const now = new Date('2026-07-15T12:00:00');

  function event(uid: string, start: string, end: string | null = null) {
    return {
      uid,
      title: uid,
      start: new Date(start),
      end: end === null ? null : new Date(end),
      isAllDay: false,
      location: `${uid} room`,
      description: '',
      recurring: false,
    };
  }

  function press(ctx: AppContext, ...keys: string[]): void {
    for (const key of keys) eventsView.handleKey(key, ctx);
  }

  function screen(ctx: AppContext): string[] {
    return eventsView.render(ctx).map(stripAnsi);
  }

  function selectedLine(ctx: AppContext): string {
    return screen(ctx).find((line) => line.includes('→')) ?? '';
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows an empty list message on its own line above the back row', async () => {
    const ctx = fakeCtx();
    await eventsView.load(ctx);
    press(ctx, '\r');

    const lines = screen(ctx);
    expect(lines.join('\n')).toContain(t().calendar.next30Days);
    const notice = lines.find((line) => line.includes(t().calendar.noEvents));
    expect(notice).toBeDefined();
    expect(notice).not.toContain(t().common.back);
    expect(selectedLine(ctx)).toContain(t().common.back);
  });

  it('says a search found nothing for the query', async () => {
    const ctx = fakeCtx();
    await eventsView.load(ctx);
    press(ctx, DOWN, DOWN, DOWN, '\r', 'z', 'z', 'z', '\r');

    const out = screen(ctx).join('\n');
    expect(out).toContain('No events match “zzz”');
    expect(out).not.toContain(t().calendar.noEvents);
  });

  it('marks and dims the events that already ended in this week', async () => {
    calendarInRange.mockReturnValue([
      event('Monday talk', '2026-07-13T10:00:00', '2026-07-13T11:00:00'),
      event('Friday lab', '2026-07-17T10:00:00'),
    ]);
    const ctx = fakeCtx();
    await eventsView.load(ctx);
    press(ctx, DOWN, '\r');

    const lines = screen(ctx);
    expect(lines.find((line) => line.includes('Monday talk'))).toContain(t().calendar.endedLabel);
    expect(lines.find((line) => line.includes('Friday lab'))).not.toContain(
      t().calendar.endedLabel,
    );
  });

  it('shows the start and end time on the detail screen', async () => {
    calendarInRange.mockReturnValue([event('Talk', '2026-07-16T19:00:00', '2026-07-16T21:00:00')]);
    const ctx = fakeCtx();
    await eventsView.load(ctx);
    press(ctx, '\r', '\r');

    expect(screen(ctx).join('\n')).toContain('07-16 19:00–21:00');
  });

  it('keeps the offline notice on every screen while showing a stored calendar', async () => {
    calendarInRange.mockReturnValue([event('Talk', '2026-07-16T19:00:00')]);
    loadCalendarOrCacheMock.mockResolvedValueOnce({
      calendar: { inRange: calendarInRange, heatmap: calendarHeatmap },
      stale: true,
    });
    const ctx = fakeCtx();
    await eventsView.load(ctx);
    press(ctx, '\r');
    expect(screen(ctx).join('\n')).toContain(t().common.offline);
    press(ctx, '\r');
    expect(screen(ctx).join('\n')).toContain(t().common.offline);
  });

  it('offers the activity item only when the hub has no room for the heatmap', async () => {
    const ctx = fakeCtx();
    await eventsView.load(ctx);
    expect(screen(ctx).join('\n')).toContain(t().calendar.heatmap.title);

    const tall = { ...ctx, size: { rows: 45, cols: 160 }, bodyRows: 40 };
    const lines = screen(tall);
    expect(lines.filter((line) => line.includes(t().calendar.heatmap.title))).toHaveLength(1);
    expect(lines.some((line) => line.includes(t().calendar.heatmap.legendLess))).toBe(true);
  });

  it('returns from a detail to the same list title and cursor', async () => {
    calendarInRange.mockReturnValue([
      event('First', '2026-07-16T10:00:00'),
      event('Second', '2026-07-17T10:00:00'),
      event('Third', '2026-07-18T10:00:00'),
    ]);
    const ctx = fakeCtx();
    await eventsView.load(ctx);
    press(ctx, DOWN, '\r', DOWN, '\r', DOWN, '\r');

    expect(screen(ctx).join('\n')).toContain(t().calendar.thisWeek);
    expect(selectedLine(ctx)).toContain('Second');

    press(ctx, '\r');
    expect(eventsView.handleBack()).toBe(true);
    expect(screen(ctx).join('\n')).toContain(t().calendar.thisWeek);
    expect(selectedLine(ctx)).toContain('Second');
  });

  it('keeps the selected hub item after Esc from a list', async () => {
    const ctx = fakeCtx();
    await eventsView.load(ctx);
    press(ctx, DOWN, DOWN, '\r');
    expect(eventsView.handleBack()).toBe(true);
    expect(selectedLine(ctx)).toContain(t().calendar.thisMonth);
  });

  it('lists the past year of finished events, most recent first', async () => {
    calendarInRange.mockReturnValue([
      event('Autumn', '2025-10-01T10:00:00', '2025-10-01T12:00:00'),
      event('Spring', '2026-04-01T10:00:00', '2026-04-01T12:00:00'),
      event('Running', '2026-07-15T11:00:00', '2026-07-15T13:00:00'),
    ]);
    const ctx = fakeCtx();
    await eventsView.load(ctx);
    calendarInRange.mockClear();
    press(ctx, DOWN, DOWN, DOWN, DOWN, '\r');

    const [start, end] = calendarInRange.mock.calls[0] as [Date, Date];
    expect(Math.round((end.getTime() - start.getTime()) / 86_400_000)).toBe(365);
    const out = screen(ctx).join('\n');
    expect(out).not.toContain('Running');
    expect(out.indexOf('Spring')).toBeLessThan(out.indexOf('Autumn'));
  });

  it('searches past and upcoming events, upcoming first and past marked as ended', async () => {
    calendarInRange.mockReturnValue([
      event('Meetup old', '2025-10-01T10:00:00', '2025-10-01T12:00:00'),
      event('Meetup next', '2026-12-01T10:00:00', '2026-12-01T12:00:00'),
    ]);
    const ctx = fakeCtx();
    await eventsView.load(ctx);
    calendarInRange.mockClear();
    press(ctx, DOWN, DOWN, DOWN, '\r', 'm', 'e', 'e', 't', 'u', 'p', '\r');

    const [start, end] = calendarInRange.mock.calls[0] as [Date, Date];
    expect(start.getTime()).toBeLessThan(now.getTime() - 360 * 86_400_000);
    expect(end.getTime()).toBeGreaterThan(now.getTime() + 360 * 86_400_000);
    const lines = screen(ctx);
    const next = lines.findIndex((line) => line.includes('Meetup next'));
    const old = lines.findIndex((line) => line.includes('Meetup old'));
    expect(next).toBeGreaterThan(-1);
    expect(old).toBeGreaterThan(next);
    expect(lines[old]).toContain(t().calendar.endedLabel);
    expect(lines[next]).not.toContain(t().calendar.endedLabel);
    expect(lines).toContain('   Results for “meetup” · 2');
  });

  it('marks recurring events in lists and lines up all-day titles with timed ones', async () => {
    calendarInRange.mockReturnValue([
      { ...event('Open day', '2026-07-16T00:00:00'), isAllDay: true },
      { ...event('Weekly sync', '2026-07-16T20:00:00'), recurring: true },
    ]);
    const ctx = fakeCtx();
    await eventsView.load(ctx);
    press(ctx, '\r');

    const lines = screen(ctx);
    const allDay = lines.find((line) => line.includes('Open day')) ?? '';
    const timed = lines.find((line) => line.includes('Weekly sync')) ?? '';
    expect(timed).toContain('Weekly sync ↻');
    expect(allDay.indexOf('Open day')).toBe(timed.indexOf('Weekly sync'));
  });

  it('caps the coming-up block on the hub to five events', async () => {
    calendarInRange.mockReturnValue(
      Array.from({ length: 8 }, (_, i) => event(`Event ${i}`, `2026-07-2${i}T10:00:00`)),
    );
    const ctx = { ...fakeCtx(), size: { rows: 40, cols: 100 }, bodyRows: 35 };
    await eventsView.load(ctx);

    const out = screen(ctx).join('\n');
    expect(out).toContain('Event 4');
    expect(out).not.toContain('Event 5');
  });
});
