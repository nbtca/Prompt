import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { captureFooterHint, renderHeader, renderFooter, passiveFooterHint } from './chrome.js';
import { setLanguage } from '../i18n/index.js';
import { resetIconCache } from '../core/icons.js';
import { stripAnsi, visualWidth } from '../core/text.js';

beforeAll(() => setLanguage('en'));
beforeEach(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });
const done = () => { process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache(); };
const views = [{ id: 'home' as const, title: 'Home' }, { id: 'events' as const, title: 'Events' }];
const fiveViews = [
  { id: 'home' as const, title: 'Home' },
  { id: 'schedule' as const, title: 'Schedule' },
  { id: 'events' as const, title: 'Events' },
  { id: 'docs' as const, title: 'Docs' },
  { id: 'settings' as const, title: 'Settings' },
];

describe('renderHeader', () => {
  it('shows the brand and a tab bar with the active tab marked', () => {
    const lines = renderHeader(views, 'events', 40).map(stripAnsi);
    expect(lines[0]).toContain('nbtca');
    const tabs = lines.join('\n');
    expect(tabs).toContain('Home'); expect(tabs).toContain('Events');
    done();
  });

  it('keeps every tab reachable and the active title visible at 40 columns', () => {
    const tabs = stripAnsi(renderHeader(fiveViews, 'settings', 40)[1]!);
    expect(visualWidth(tabs)).toBeLessThanOrEqual(40);
    expect(tabs).toContain('[5 Settings]');
    for (const digit of ['1', '2', '3', '4', '5']) expect(tabs).toContain(digit);
  });

  it('marks the active tab by number when the terminal is too narrow for its title', () => {
    const tabs = stripAnsi(renderHeader(fiveViews, 'schedule', 20)[1]!);
    expect(visualWidth(tabs)).toBeLessThanOrEqual(20);
    expect(tabs).toContain('[2]');
    for (const digit of ['1', '2', '3', '4', '5']) expect(tabs).toContain(digit);
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

  it('keeps the complete interactive hint within 40 columns', () => {
    const hint = stripAnsi(renderFooter('settings', 40, 5)[1]!);
    expect(visualWidth(hint)).toBeLessThanOrEqual(40);
    expect(hint).toContain('1-5/Tab');
    expect(hint).toContain('move');
    expect(hint).toContain('open');
    expect(hint).toContain('quit');
  });

  it('prioritizes view-local controls over tab switching at 20 columns', () => {
    const hint = stripAnsi(renderFooter('settings', 20, 5)[1]!);
    expect(visualWidth(hint)).toBeLessThanOrEqual(20);
    expect(hint).toContain('move');
    expect(hint).toContain('open');
    expect(hint).toContain('Esc');
    expect(hint).toContain('q');
    expect(hint).not.toContain('Tab');
  });

  it('keeps tab switching only when every local control also fits', () => {
    const hint = stripAnsi(renderFooter('settings', 28, 5)[1]!);
    expect(visualWidth(hint)).toBeLessThanOrEqual(28);
    expect(hint).toContain('1-5/Tab');
    expect(hint).toContain('move');
    expect(hint).toContain('open');
    expect(hint).toContain('Esc');
    expect(hint).toContain('q');
  });
});

describe('passiveFooterHint', () => {
  it('includes an accurate digit-range tab-switch prefix, not a stale hardcoded one', () => {
    const hint = stripAnsi(passiveFooterHint(5));
    expect(hint).toContain('1-5');
    expect(hint).not.toContain('1-7');
  });

  it('omits the digit prefix entirely with only one tab, matching renderFooter\'s own rule', () => {
    const hint = stripAnsi(passiveFooterHint(1));
    expect(hint).not.toMatch(/\d-\d/);
  });

  it('fits navigation and exit keys within 20 columns', () => {
    const hint = stripAnsi(renderFooter('home', 20, 5, passiveFooterHint(5, 20))[1]!);
    expect(visualWidth(hint)).toBeLessThanOrEqual(20);
    expect(hint).toContain('Esc');
    expect(hint).toContain('q');
  });
});

describe('captureFooterHint', () => {
  it('fits the available input controls within 20 columns', () => {
    const hint = stripAnsi(renderFooter('schedule', 20, 5, captureFooterHint(20))[1]!);
    expect(visualWidth(hint)).toBeLessThanOrEqual(20);
    expect(hint).toContain('Ctrl+C');
    expect(hint).toContain('Esc');
    expect(hint).toContain('Enter');
  });
});
