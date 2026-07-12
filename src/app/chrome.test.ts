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
    const f = renderFooter('home', 40).map(stripAnsi).join(' ');
    expect(f).toMatch(/q/); expect(f).toMatch(/quit|Quit|退出/i);
    done();
  });
});
