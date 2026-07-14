import { describe, it, expect, beforeAll, vi } from 'vitest';
import { eventsView } from './events.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi } from '../../core/text.js';
import type { AppContext } from '../view.js';

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
