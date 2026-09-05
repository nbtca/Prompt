import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  captureFooterHint,
  renderHeader,
  renderContextPath,
  renderFooter,
  passiveFooterHint,
  resolveChromeLayout,
} from './chrome.js';
import { setLanguage } from '../i18n/index.js';
import { resetIconCache } from '../core/icons.js';
import { stripAnsi, visualWidth } from '../core/text.js';

beforeAll(() => {
  setLanguage('en');
});
beforeEach(() => {
  process.env['NBTCA_ICON_MODE'] = 'ascii';
  resetIconCache();
});
const done = () => {
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
};
const views = [
  { id: 'home' as const, title: 'Home' },
  { id: 'events' as const, title: 'Events' },
];
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
    expect(tabs).toContain('Home');
    expect(tabs).toContain('Events');
    done();
  });

  it('keeps every tab reachable and the active title visible at 40 columns', () => {
    const tabs = stripAnsi(renderHeader(fiveViews, 'settings', 40)[1] ?? '');
    expect(visualWidth(tabs)).toBeLessThanOrEqual(40);
    expect(tabs).toContain('[5 Settings]');
    for (const digit of ['1', '2', '3', '4', '5']) expect(tabs).toContain(digit);
  });

  it('marks the active tab by number when the terminal is too narrow for its title', () => {
    const tabs = stripAnsi(renderHeader(fiveViews, 'schedule', 20)[1] ?? '');
    expect(visualWidth(tabs)).toBeLessThanOrEqual(20);
    expect(tabs).toContain('[2]');
    for (const digit of ['1', '2', '3', '4', '5']) expect(tabs).toContain(digit);
  });

  it('keeps the active tab visible when even the numeric tab bar cannot fit', () => {
    const tabs = stripAnsi(renderHeader(fiveViews, 'settings', 6, 1)[0] ?? '');
    expect(visualWidth(tabs)).toBeLessThanOrEqual(6);
    expect(tabs).toContain('5');
  });

  it('can collapse to only the tab row', () => {
    const lines = renderHeader(fiveViews, 'events', 40, 1).map(stripAnsi);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Events');
    expect(lines[0]).not.toContain('nbtca');
  });

  it('keeps compact chrome meaningful at one column', () => {
    expect(stripAnsi(renderHeader(fiveViews, 'settings', 1, 1)[0] ?? '')).toBe('5');
    expect(stripAnsi(renderFooter('settings', 1, 5, undefined, 1)[0] ?? '')).toBe('q');
  });
});

describe('frame width', () => {
  it('stops the rules growing once the terminal is wider than the app', () => {
    const at = (cols: number) =>
      visualWidth(stripAnsi(renderHeader(views, 'docs', cols, 3)[2] ?? ''));
    expect(at(60)).toBe(57);
    expect(at(100)).toBe(97);
    expect(at(180)).toBe(at(100));
  });

  it('keeps the scroll position on the same edge as the rule', () => {
    for (const cols of [60, 100, 180]) {
      const rule = stripAnsi(renderHeader(views, 'docs', cols, 3)[2] ?? '');
      const footer = stripAnsi(renderFooter('docs', cols, 2, 'PgUp/PgDn', 1, '40%')[0] ?? '');
      expect(footer.trimEnd().length).toBe(visualWidth(rule));
    }
  });
});

describe('renderContextPath', () => {
  it('joins the segments and keeps them inside the width', () => {
    const line = renderContextPath(['Docs', 'Guides', 'Second classroom'], 60);
    expect(stripAnsi(line)).toBe('   Docs > Guides > Second classroom');
    expect(visualWidth(line)).toBeLessThanOrEqual(60);
  });

  it('drops leading segments before truncating the tail', () => {
    const line = stripAnsi(renderContextPath(['Docs', 'Guides', 'Second classroom'], 30));
    expect(line).toContain('Second classroom');
    expect(line).not.toContain('Docs');
    expect(line.trimStart().startsWith('...')).toBe(true);
  });

  it('keeps the indent when even the tail has to be clipped', () => {
    const line = renderContextPath(['Docs', 'A very long trailing segment'], 14);
    expect(line.startsWith('   ')).toBe(true);
    expect(visualWidth(line)).toBeLessThanOrEqual(14);
  });

  it('replaces the wordmark in the header rather than adding a row', () => {
    const plain = renderHeader(views, 'docs', 60, 3);
    const withPath = renderHeader(views, 'docs', 60, 3, ['Docs', 'Guides']);
    expect(withPath).toHaveLength(plain.length);
    expect(stripAnsi(plain[0] ?? '')).toContain('nbtca');
    expect(stripAnsi(withPath[0] ?? '')).toContain('Guides');
    expect(stripAnsi(withPath[1] ?? '')).toBe(stripAnsi(plain[1] ?? ''));
  });
});

describe('renderFooter', () => {
  it('right-aligns a scroll position against the same margin as the rule', () => {
    const line = renderFooter('docs', 80, 5, 'PgUp/PgDn', 1, '40%')[0] ?? '';
    const plain = stripAnsi(line);
    expect(plain).toContain('PgUp/PgDn');
    expect(plain.endsWith('40%   ')).toBe(true);
    expect(visualWidth(line)).toBe(80);
  });

  it('drops the position rather than crowding the hint', () => {
    const narrow = renderFooter('docs', 18, 5, 'PgUp/PgDn', 1, '40%')[0] ?? '';
    expect(stripAnsi(narrow)).not.toContain('40%');
  });

  it('renders a keyhint line', () => {
    const f = renderFooter('home', 40, 5).map(stripAnsi).join(' ');
    expect(f).toMatch(/q/);
    expect(f).toMatch(/quit|Quit|退出/i);
    done();
  });

  it('the digit-range hint matches the real number of tabs, not a stale hardcoded range', () => {
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
    const hint = stripAnsi(renderFooter('settings', 40, 5)[1] ?? '');
    expect(visualWidth(hint)).toBeLessThanOrEqual(40);
    expect(hint).toContain('1-5/Tab');
    expect(hint).toContain('move');
    expect(hint).toContain('open');
    expect(hint).toContain('quit');
  });

  it('prioritizes view-local controls over tab switching at 20 columns', () => {
    const hint = stripAnsi(renderFooter('settings', 20, 5)[1] ?? '');
    expect(visualWidth(hint)).toBeLessThanOrEqual(20);
    expect(hint).toContain('move');
    expect(hint).toContain('open');
    expect(hint).toContain('Esc');
    expect(hint).toContain('q');
    expect(hint).not.toContain('Tab');
  });

  it('keeps tab switching only when every local control also fits', () => {
    const hint = stripAnsi(renderFooter('settings', 28, 5)[1] ?? '');
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

  it("omits the digit prefix entirely with only one tab, matching renderFooter's own rule", () => {
    const hint = stripAnsi(passiveFooterHint(1));
    expect(hint).not.toMatch(/\d-\d/);
  });

  it('fits navigation and exit keys within 20 columns', () => {
    const hint = stripAnsi(renderFooter('home', 20, 5, passiveFooterHint(5, 20))[1] ?? '');
    expect(visualWidth(hint)).toBeLessThanOrEqual(20);
    expect(hint).toContain('Esc');
    expect(hint).toContain('q');
  });
});

describe('captureFooterHint', () => {
  it('fits the available input controls within 20 columns', () => {
    const hint = stripAnsi(renderFooter('schedule', 20, 5, captureFooterHint(20))[1] ?? '');
    expect(visualWidth(hint)).toBeLessThanOrEqual(20);
    expect(hint).toContain('Ctrl+C');
    expect(hint).toContain('Esc');
    expect(hint).toContain('Enter');
  });
});

describe('resolveChromeLayout', () => {
  it('progressively yields rows to content without starving the body', () => {
    for (let rows = 1; rows <= 20; rows += 1) {
      const layout = resolveChromeLayout(rows);
      expect(rows - layout.headerLines - layout.footerLines).toBeGreaterThanOrEqual(1);
    }
    expect(resolveChromeLayout(24)).toEqual({ headerLines: 3, footerLines: 2 });
    expect(resolveChromeLayout(5)).toEqual({ headerLines: 1, footerLines: 1 });
    expect(resolveChromeLayout(1)).toEqual({ headerLines: 0, footerLines: 0 });
  });
});
