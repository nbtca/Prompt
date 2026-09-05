import { describe, it, expect, beforeAll } from 'vitest';
import { renderHelp, globalShortcuts } from './help.js';
import { setLanguage } from '../i18n/index.js';
import { stripAnsi, visualWidth } from '../core/text.js';

beforeAll(() => {
  setLanguage('en');
});

describe('renderHelp', () => {
  it('lists the global keys and the ones the view adds', () => {
    const out = stripAnsi(renderHelp('Docs', [{ key: 'f', label: 'Links' }], 5, 80).join('\n'));
    expect(out).toContain('Tab');
    expect(out).toContain('1-5');
    expect(out).toContain('Docs');
    expect(out).toContain('Links');
  });

  it('omits the view group when the view adds nothing', () => {
    const out = stripAnsi(renderHelp('Schedule', [], 5, 80).join('\n'));
    expect(out).not.toContain('Schedule');
    expect(out).toContain('Tab');
  });

  it('drops the digit row when there is only one tab', () => {
    expect(globalShortcuts(1).some((shortcut) => shortcut.key.startsWith('1-'))).toBe(false);
    expect(globalShortcuts(5).some((shortcut) => shortcut.key === '1-5')).toBe(true);
  });

  it('stays inside a narrow terminal', () => {
    for (const cols of [20, 34, 80]) {
      for (const line of renderHelp('Docs', [{ key: 'b', label: 'Open in browser' }], 5, cols)) {
        expect(visualWidth(line)).toBeLessThanOrEqual(cols);
      }
    }
  });
});
