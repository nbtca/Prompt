import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { checkServices, renderServiceStatusTable, type ServiceStatus } from './status.js';
import { setLanguage } from '../i18n/index.js';
import { resetIconCache } from '../core/icons.js';
import { stripAnsi } from '../core/text.js';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('renderServiceStatusTable pending state', () => {
  it('renders a pending marker for a not-yet-resolved service and keeps resolved rows', () => {
    const items: ServiceStatus[] = [
      { name: 'Homepage', url: 'x', ok: true, latencyMs: 42, group: 'nbtca' },
      { name: 'Docs', url: 'y', ok: false, group: 'nbtca', pending: true },
    ];
    const out = stripAnsi(renderServiceStatusTable(items, { color: false }));
    expect(out).toContain('Homepage');
    expect(out).toContain('42ms');
    expect(out).toContain('Docs');
    expect(out).toContain('…'); // pending glyph (unicode)
  });

  it('output for fully-resolved items is unchanged by the pending feature', () => {
    const items: ServiceStatus[] = [
      { name: 'Homepage', url: 'x', ok: true, latencyMs: 42, group: 'nbtca' },
    ];
    const out = stripAnsi(renderServiceStatusTable(items, { color: false }));
    expect(out).not.toContain('…');
  });
});

describe('checkServices', () => {
  it('cancels response bodies after reading status headers', async () => {
    const cancelSpies: ReturnType<typeof vi.spyOn>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => {
        const response = new Response('unused');
        if (response.body) cancelSpies.push(vi.spyOn(response.body, 'cancel'));
        return Promise.resolve(response);
      }),
    );

    const result = await checkServices({ timeoutMs: 100, retries: 0 });

    expect(result).toHaveLength(8);
    expect(cancelSpies).toHaveLength(8);
    for (const cancel of cancelSpies) expect(cancel).toHaveBeenCalledOnce();
  });

  it('sanitizes network error messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.reject(new Error('offline\nforged\u001B[2J'))),
    );

    const result = await checkServices({ timeoutMs: 100, retries: 0 });

    expect(result.every((item) => item.error === 'offline forged')).toBe(true);
  });
});
