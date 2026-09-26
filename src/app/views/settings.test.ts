import { describe, it, expect, beforeAll, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { settingsView } from './settings.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi, visualWidth } from '../../core/text.js';
import type { AppContext } from '../view.js';

beforeAll(() => {
  process.env['XDG_CONFIG_HOME'] = mkdtempSync(join(tmpdir(), 'nbtca-settings-'));
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

function fakeCtx(): AppContext {
  return {
    size: { rows: 24, cols: 80 },
    bodyRows: 19,
    rerender: vi.fn(),
    resetScroll: vi.fn(),
    runClassic: vi.fn(async (fn: () => Promise<void>) => {
      await fn();
    }),
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
    await settingsView.load();
    const out = stripAnsi(settingsView.render(ctx).join('\n'));
    expect(out.trim().length).toBeGreaterThan(0);
  });

  it('capturesInput is false or absent (no text fields in this view)', () => {
    expect(settingsView.capturesInput()).toBe(false);
  });

  it('handleBack() is false at the top-level menu, true after entering a sub-list, and returns you to the menu', async () => {
    const ctx = fakeCtx();
    await settingsView.load();
    expect(settingsView.handleBack()).toBe(false);

    settingsView.handleKey('\r'); // Enter on the first menu item (Language)
    const subListOut = stripAnsi(settingsView.render(ctx).join('\n'));
    expect(subListOut).toContain('English');

    expect(settingsView.handleBack()).toBe(true);
    const menuOut = stripAnsi(settingsView.render(ctx).join('\n'));
    expect(menuOut).toContain('Icon Mode');
  });

  it('aligns every Chinese about value on the same visual column', async () => {
    const ctx = fakeCtx();
    setLanguage('zh');
    try {
      await settingsView.load();
      settingsView.handleKey('\x1b[F');
      settingsView.handleKey('\r');
      const lines = settingsView.render(ctx).map(stripAnsi);
      const labels = ['项目', '版本', '描述', 'GitHub', '网站', '邮箱', '许可证'];
      const starts = labels.map((label) => {
        const line = lines.find((candidate) => candidate.trimStart().startsWith(label));
        if (line === undefined) throw new Error(`Missing ${label} setting`);
        const labelEnd = line.indexOf(label) + label.length;
        const valueOffset = line.slice(labelEnd).search(/\S/u);
        return visualWidth(line.slice(0, labelEnd + valueOffset));
      });

      expect(new Set(starts)).toEqual(new Set([15]));
    } finally {
      setLanguage('en');
      await settingsView.load();
    }
  });

  function selectedLabel(ctx: AppContext): string {
    const line = settingsView
      .render(ctx)
      .map(stripAnsi)
      .find((candidate) => candidate.includes('→'));
    return (
      line
        ?.replace('→', '')
        .trim()
        .split(/\s{2,}/u)[0] ?? ''
    );
  }

  it('keeps the cursor on the entry the user came back from', async () => {
    const ctx = fakeCtx();
    await settingsView.load();
    settingsView.handleKey('\x1b[B');
    settingsView.handleKey('\x1b[B');
    settingsView.handleKey('\r');
    settingsView.handleBack();
    expect(selectedLabel(ctx)).toBe('Color Mode');

    settingsView.handleKey('\x1b[F');
    settingsView.handleKey('\r');
    settingsView.handleKey('\r');
    expect(selectedLabel(ctx)).toBe('About');
  });

  it('asks before resetting and stays put when cancelled', async () => {
    const ctx = fakeCtx();
    await settingsView.load();
    for (let step = 0; step < 3; step += 1) settingsView.handleKey('\x1b[B');
    settingsView.handleKey('\r');
    const confirm = stripAnsi(settingsView.render(ctx).join('\n'));
    expect(confirm).toContain('Reset icon mode and color mode to their defaults?');
    expect(selectedLabel(ctx)).toBe('Cancel');

    settingsView.handleKey('\r');
    expect(selectedLabel(ctx)).toBe('Reset to Defaults');
    expect(stripAnsi(settingsView.render(ctx).join('\n'))).not.toContain('reset');
  });

  it('names the setting that changed', async () => {
    const ctx = fakeCtx();
    await settingsView.load();
    settingsView.handleKey('\x1b[B');
    settingsView.handleKey('\r');
    settingsView.handleKey('\r');
    expect(stripAnsi(settingsView.render(ctx).join('\n'))).toMatch(/Icon mode (updated|changed)/u);
    expect(selectedLabel(ctx)).toBe('Icon Mode');
  });
});
