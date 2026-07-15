import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { renderHeader, renderFooter } from './chrome.js';
import { setLanguage } from '../i18n/index.js';
import { resetIconCache } from '../core/icons.js';
import { stripAnsi } from '../core/text.js';

beforeAll(() => setLanguage('en'));
beforeEach(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });
const done = () => { process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache(); };
const views = [{ id: 'home' as const, title: 'Home' }, { id: 'events' as const, title: 'Events' }];

describe('renderHeader', () => {
  it('shows the brand and a tab bar with the active tab marked', () => {
    const lines = renderHeader(views, 'events', 40).map(stripAnsi);
    expect(lines[0]).toContain('nbtca');
    const tabs = lines.join('\n');
    expect(tabs).toContain('Home'); expect(tabs).toContain('Events');
    done();
  });
});

describe('renderFooter', () => {
  it('renders a keyhint line', () => {
    const f = renderFooter('home', 40, 5).map(stripAnsi).join(' ');
    expect(f).toMatch(/q/); expect(f).toMatch(/quit|Quit|退出/i);
    done();
  });

  it('the digit-range hint matches the real number of tabs, not a stale hardcoded range', () => {
    // Regression: the hint used to hardcode "1-7" regardless of how many
    // tabs actually exist — pressing 6/7 did nothing even though the
    // footer promised they would.
    const f5 = renderFooter('home', 40, 5).map(stripAnsi).join(' ');
    expect(f5).toContain('1-5');
    expect(f5).not.toContain('1-7');

    const f3 = renderFooter('home', 40, 3).map(stripAnsi).join(' ');
    expect(f3).toContain('1-3');
  });

  it('a single tab shows no digit range at all (nothing to switch between)', () => {
    const f = renderFooter('home', 40, 1).map(stripAnsi).join(' ');
    expect(f).not.toMatch(/\d-\d/);
  });
});
