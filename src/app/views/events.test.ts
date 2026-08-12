import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type * as CalendarModule from '../../features/calendar.js';

const calendarUpcoming = vi.fn().mockReturnValue([]);
const calendarHeatmap = vi.fn().mockReturnValue([]);
const exportEventIcsMock = vi.fn().mockReturnValue({ ok: true, path: '/tmp/event.ics' });
const loadCalendarOrThrowMock = vi.fn().mockResolvedValue({
  upcoming: calendarUpcoming,
  past: vi.fn().mockReturnValue([]),
  next: vi.fn().mockReturnValue([]),
  inRange: vi.fn().mockReturnValue([]),
  heatmap: calendarHeatmap,
});
vi.mock('../../features/calendar.js', async (importOriginal) => {
  const actual = await importOriginal<typeof CalendarModule>();
  return {
    ...actual,
    exportEventIcs: exportEventIcsMock,
    loadCalendarOrThrow: loadCalendarOrThrowMock,
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
  calendarUpcoming.mockReturnValue([]);
  calendarHeatmap.mockReturnValue([{ date: '2026-07-14', count: 1 }]);
  exportEventIcsMock.mockClear();
  loadCalendarOrThrowMock.mockClear();
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

  it('does not offer move or open actions on an error screen', async () => {
    loadCalendarOrThrowMock.mockRejectedValueOnce(new Error('Broke'));
    await eventsView.load(fakeCtx());
    const hint = stripAnsi(eventsView.footerHint(5, 80) ?? '');
    expect(hint).toContain('1-5');
    expect(hint).not.toContain(t().menu.hintMove);
    expect(hint).not.toContain(t().menu.hintOpen);
  });
});

describe('eventsView detail screen', () => {
  it('shows the event title exactly once, not once as the heading and again as the field title', async () => {
    calendarUpcoming.mockReturnValue([
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
    calendarUpcoming.mockReturnValue([first, second]);
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
