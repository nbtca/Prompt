import { describe, it, expect, beforeAll } from 'vitest';
import { renderServiceStatusTable, type ServiceStatus } from './status.js';
import { setLanguage } from '../i18n/index.js';
import { resetIconCache } from '../core/icons.js';
import { stripAnsi } from '../core/text.js';

beforeAll(() => { setLanguage('en'); process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache(); });

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
    expect(out).toContain('…');           // pending glyph (unicode)
  });

  it('output for fully-resolved items is unchanged by the pending feature', () => {
    const items: ServiceStatus[] = [
      { name: 'Homepage', url: 'x', ok: true, latencyMs: 42, group: 'nbtca' },
    ];
    const out = stripAnsi(renderServiceStatusTable(items, { color: false }));
    expect(out).not.toContain('…');
  });
});
