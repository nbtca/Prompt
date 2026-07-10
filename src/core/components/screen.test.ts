import { describe, it, expect, beforeEach } from 'vitest';
import { renderScreen } from './screen.js';
import { stripAnsi } from '../text.js';
import { resetIconCache } from '../icons.js';

describe('renderScreen', () => {
  beforeEach(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });

  function plain(opts: Parameters<typeof renderScreen>[0]): string[] {
    const out = stripAnsi(renderScreen(opts)).split('\n');
    process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache();
    return out;
  }

  it('renders title, a hairline rule under it, body, and footer', () => {
    const lines = plain({ title: 'nbtca › Status', body: '  hello body', footer: 'q back', width: 20 });
    expect(lines[0]).toContain('nbtca › Status');
    expect(lines[1]).toMatch(/^\s+-{3,}$/);          // ascii rule
    expect(lines.some(l => l.includes('hello body'))).toBe(true);
    expect(lines[lines.length - 1]).toContain('q back');
  });

  it('omits header when no title and omits footer when none', () => {
    const lines = plain({ body: '  only body', width: 20 });
    expect(lines.some(l => l.includes('only body'))).toBe(true);
    expect(lines.some(l => /^\s+-{3,}$/.test(l))).toBe(false);
  });

  it('rule width honors the provided width', () => {
    const lines = plain({ title: 't', body: 'b', width: 10 });
    const rule = lines[1]!.trim();
    expect(rule.length).toBe(10);
  });
});
