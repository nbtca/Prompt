import { describe, it, expect, beforeEach } from 'vitest';
import { renderNote } from './note.js';
import { stripAnsi } from '../text.js';
import { resetIconCache } from '../icons.js';

describe('renderNote', () => {
  beforeEach(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });
  function plain(msg: string, title?: string): string[] {
    const out = stripAnsi(renderNote(msg, title)).split('\n');
    process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache();
    return out;
  }

  it('renders title, a rule, and each body line indented', () => {
    const lines = plain('line one\nline two', 'About');
    expect(lines[0]).toContain('About');
    expect(lines.some(l => /^\s+-{3,}$/.test(l))).toBe(true);
    expect(lines.some(l => l.includes('line one'))).toBe(true);
    expect(lines.some(l => l.includes('line two'))).toBe(true);
  });

  it('works without a title (no rule)', () => {
    const lines = plain('just body');
    expect(lines.some(l => l.includes('just body'))).toBe(true);
    expect(lines.some(l => /^\s+-{3,}$/.test(l))).toBe(false);
  });
});
