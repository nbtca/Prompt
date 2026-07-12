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

describe('renderHome (schedule-first dashboard)', () => {
  it('shows next class, today classes, and upcoming events', () => {
    const out = stripAnsi(renderHome({
      nextClassLine: '  Next class in 2h',
      todayLines: ['  08:00 Math', '  10:00 Physics'],
      eventLines: ['  03-25 Hackathon', '  03-28 Study group'],
      loading: false,
    }).join('\n'));
    expect(out).toContain('Next class in 2h');
    expect(out).toContain('08:00 Math');
    expect(out).toContain('Hackathon');
  });

  it('falls back to "no class today" and "no upcoming class" when schedule is empty', () => {
    const out = stripAnsi(renderHome({ nextClassLine: '', todayLines: [], eventLines: [], loading: false }).join('\n'));
    expect(out).toContain('No classes today');
    expect(out).toContain('No upcoming classes');
  });

  it('shows a loading state for events before they land', () => {
    const out = stripAnsi(renderHome({ loading: true }).join('\n'));
    expect(out).toContain('Loading');
  });

  it('always returns a non-empty array', () => {
    const out = renderHome({});
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });
});
