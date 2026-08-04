import { describe, it, expect, beforeAll, vi } from 'vitest';
import { settingsView } from './settings.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi, visualWidth } from '../../core/text.js';
import type { AppContext } from '../view.js';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

function fakeCtx(): AppContext {
  return {
    size: { rows: 24, cols: 80 },
    bodyRows: 19,
    rerender: vi.fn(), resetScroll: vi.fn(),
    runClassic: vi.fn(async (fn: () => Promise<void>) => { await fn(); }),
    quit: vi.fn(),
  };
}

describe('settingsView', () => {
  it('has the expected id and title', () => {
    expect(settingsView.id).toBe('settings');
    expect(typeof settingsView.title).toBe('string');
  });

  it('render() never throws before load() has run', () => {
    const ctx = fakeCtx();
    expect(() => settingsView.render(ctx)).not.toThrow();
  });

  it('load() then render() shows the settings menu', async () => {
    const ctx = fakeCtx();
    await settingsView.load?.(ctx);
    const out = stripAnsi(settingsView.render(ctx).join('\n'));
    expect(out.trim().length).toBeGreaterThan(0);
  });

  it('capturesInput is false or absent (no text fields in this view)', () => {
    expect(settingsView.capturesInput?.() ?? false).toBe(false);
  });

  it('handleBack() is false at the top-level menu, true after entering a sub-list, and returns you to the menu', async () => {
    const ctx = fakeCtx();
    await settingsView.load?.(ctx);
    expect(settingsView.handleBack?.()).toBe(false);

    settingsView.handleKey?.('\r', ctx); // Enter on the first menu item (Language)
    const subListOut = stripAnsi(settingsView.render(ctx).join('\n'));
    expect(subListOut).toContain('English');

    expect(settingsView.handleBack?.()).toBe(true);
    const menuOut = stripAnsi(settingsView.render(ctx).join('\n'));
    expect(menuOut).toContain('Icon mode');
  });

  it('aligns every Chinese about value on the same visual column', async () => {
    const ctx = fakeCtx();
    setLanguage('zh');
    try {
      await settingsView.load?.(ctx);
      settingsView.handleKey?.('\x1b[F', ctx);
      settingsView.handleKey?.('\r', ctx);
      const lines = settingsView.render(ctx).map(stripAnsi);
      const labels = [
        '项目', '版本', '描述', 'GitHub', '网站', '邮箱', '许可证',
      ];
      const starts = labels.map((label) => {
        const line = lines.find((candidate) => candidate.trimStart().startsWith(label))!;
        const labelEnd = line.indexOf(label) + label.length;
        const valueOffset = line.slice(labelEnd).search(/\S/u);
        return visualWidth(line.slice(0, labelEnd + valueOffset));
      });

      expect(new Set(starts)).toEqual(new Set([15]));
    } finally {
      setLanguage('en');
      await settingsView.load?.(ctx);
    }
  });
});
