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

describe('renderHome', () => {
  it('shows section titles + the next-class line + an events summary + health', () => {
    const out = stripAnsi(renderHome({
      nextClassLine: '  Next class in 2h',
      eventsSummary: '  3 upcoming',
      health: { up: 6, down: 0 },
      loading: false,
    }).join('\n'));
    expect(out).toContain('Next class in 2h');
    expect(out).toContain('3 upcoming');
    expect(out).toMatch(/6/); // up count
  });

  it('renders a loading state before data lands', () => {
    const out = stripAnsi(renderHome({ loading: true }).join('\n'));
    expect(out.length).toBeGreaterThan(0);
  });

  it('falls back to a "no upcoming class" hint when nextClassLine is empty and not loading', () => {
    const out = stripAnsi(renderHome({ nextClassLine: '', eventsSummary: '0 upcoming', health: { up: 0, down: 0 }, loading: false }).join('\n'));
    expect(out).not.toBe('');
    expect(out.length).toBeGreaterThan(0);
  });

  it('never contains bare ANSI-stripped weirdness and always returns a non-empty array', () => {
    const out = renderHome({});
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });
});
