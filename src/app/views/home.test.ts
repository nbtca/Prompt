import { describe, it, expect, beforeAll } from 'vitest';
import { renderHome } from './home.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi } from '../../core/text.js';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

const noon = new Date('2026-07-15T12:00:00');

describe('renderHome (schedule-first dashboard)', () => {
  it('shows next class, today classes, and upcoming events', () => {
    const out = stripAnsi(renderHome({
      nextClassLine: '  Next class in 2h',
      todayLines: ['  08:00 Math', '  10:00 Physics'],
      eventLines: ['  03-25 Hackathon', '  03-28 Study group'],
      loading: false,
    }, noon).join('\n'));
    expect(out).toContain('Next class in 2h');
    expect(out).toContain('08:00 Math');
    expect(out).toContain('Hackathon');
  });

  it('falls back to "no class today" and "no upcoming class" when schedule is empty', () => {
    const out = stripAnsi(renderHome({ nextClassLine: '', todayLines: [], eventLines: [], loading: false }, noon).join('\n'));
    expect(out).toContain('No classes today');
    expect(out).toContain('No upcoming classes');
  });

  it('shows a loading state for events before they land', () => {
    const out = stripAnsi(renderHome({ loading: true }, noon).join('\n'));
    expect(out).toContain('Loading');
  });

  it('always returns a non-empty array', () => {
    const out = renderHome({}, noon);
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });

  it('shows real "no upcoming events" copy when the fetch succeeded but returned nothing, not a bare glyph', () => {
    // Regression: this used to render a lone "-" with no words at all —
    // every other empty state in the app (and every other panel on this
    // same screen) uses actual translated copy.
    const out = stripAnsi(renderHome({ eventLines: [], loading: false }, noon).join('\n'));
    expect(out).toContain('No upcoming events');
  });

  it('shows an error state when the events fetch failed, distinct from "no events"', () => {
    // Regression: Events/Docs/Schedule all show a real error line on fetch
    // failure; Home silently fell back to the same empty-state placeholder
    // used for "genuinely nothing happening," so a network failure and a
    // quiet week looked identical.
    const out = stripAnsi(renderHome({ eventsError: true, loading: false }, noon).join('\n'));
    expect(out).toContain('Failed to load event calendar');
    expect(out).not.toContain('No upcoming events');
  });
});

describe('renderHome day-progress bar', () => {
  it('shows a half-filled bar and 50% at noon', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    resetIconCache();
    const out = stripAnsi(renderHome({}, noon).join('\n'));
    expect(out).toContain('##########----------'); // 20-wide bar, half filled
    expect(out).toContain('50%');
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
  });

  it('is empty at midnight and full just before it', () => {
    const out = stripAnsi(renderHome({}, new Date('2026-07-15T00:00:00')).join('\n'));
    expect(out).toContain('0%');
    const lateOut = stripAnsi(renderHome({}, new Date('2026-07-15T23:59:00')).join('\n'));
    expect(lateOut).toContain('100%');
  });
});
