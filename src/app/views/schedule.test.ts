import { describe, it, expect, beforeAll, vi } from 'vitest';
import { scheduleView, buildHubField } from './schedule.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi } from '../../core/text.js';
import type { AppContext } from '../view.js';
import type { Timetable } from '@nbtca/nbtcal/timetable';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
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
