import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const calendarUpcoming = vi.fn().mockReturnValue([]);
const calendarHeatmap = vi.fn().mockReturnValue([]);
vi.mock('../../features/calendar.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/calendar.js')>();
  return {
    ...actual,
    loadCalendarOrThrow: vi.fn().mockResolvedValue({
      upcoming: calendarUpcoming, past: vi.fn().mockReturnValue([]),
      next: vi.fn().mockReturnValue([]), inRange: vi.fn().mockReturnValue([]),
      heatmap: calendarHeatmap,
    }),
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
    expect(typeof eventsView.capturesInput?.()).toBe('boolean');
  });

  it('handleBack() returns false when there is nothing to step back from', () => {
    // Fresh module state (no load() has run): not in a list/detail/search
    // sub-mode, so there is nothing for the view to step back to internally.
    expect(eventsView.handleBack?.()).toBe(false);
  });
});

describe('eventsView heatmap navigation', () => {
  it('selecting the heatmap hub option shows the grid, and any key (or Esc) returns to the hub', async () => {
    const ctx = fakeCtx();
    await eventsView.load(ctx);

    // Move the hub selection down to the heatmap entry (last of 6 options)
    // and select it.
    for (let i = 0; i < 5; i++) eventsView.handleKey('\x1b[B', ctx);
    eventsView.handleKey('\r', ctx);

    let out = stripAnsi(eventsView.render(ctx).join('\n'));
    expect(out).toContain(t().calendar.heatmap.title);
    expect(out).toContain(t().calendar.heatmap.legendLess);

    // The hub menu itself must not still be showing underneath.
    expect(out).not.toContain(t().calendar.search);

    // Any key returns to the hub (matches Schedule's read-only detail views).
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

    expect(eventsView.handleBack?.(ctx)).toBe(true);
    const out = stripAnsi(eventsView.render(ctx).join('\n'));
    expect(out).toContain(t().calendar.search);
  });
});
