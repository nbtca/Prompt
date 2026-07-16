import { describe, it, expect, beforeAll } from 'vitest';
import { renderEvents, type EventsViewState } from './events-render.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi } from '../../core/text.js';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

describe('renderEvents', () => {
  it('loading mode shows a loading hint', () => {
    const out = stripAnsi(renderEvents({ mode: 'loading' }, new Date()).join('\n'));
    expect(out.trim().length).toBeGreaterThan(0);
  });

  it('hub mode shows the hub action list', () => {
    const hubField = new ListField({ title: 'Events', options: [{ value: 'upcoming', label: 'Events' }] });
    const out = stripAnsi(renderEvents({ mode: 'hub', hubField, heatmapBuckets: [] }, new Date()).join('\n'));
    expect(out).toContain('Events');
  });

  it('hub mode does not render the heatmap grid, even when heatmapBuckets is populated', () => {
    // The full-year heatmap moved out of the glanceable hub and into its
    // own drill-down destination (mirrors Schedule: the hub shows a
    // compact week strip, not the full weekday x period grid) — a student
    // scanning the hub for "what's next" shouldn't have to look past 11
    // lines of a mostly-empty contribution grid to reach the menu.
    const hubField = new ListField({ title: 'Events', options: [{ value: 'upcoming', label: 'Events' }] });
    const heatmapBuckets = [{ date: '2026-07-14', count: 1 }, { date: '2026-07-15', count: 0 }];
    const out = stripAnsi(renderEvents({ mode: 'hub', hubField, heatmapBuckets }, new Date('2026-07-15')).join('\n'));
    expect(out).not.toContain('Activity (last 12 months)');
    expect(out).not.toContain('Less');
  });

  it('hub mode shows a recent-activity briefing when present', () => {
    const hubField = new ListField({ title: 'Events', options: [{ value: 'upcoming', label: 'Events' }] });
    const recentEvents = [{
      date: '07-17', time: '20:30', title: 'NWDC', location: 'TBD', description: '',
      startDate: new Date('2026-07-17T20:30:00'), recurring: true, uid: 'nwdc-1',
    }];
    const out = stripAnsi(renderEvents({ mode: 'hub', hubField, heatmapBuckets: [], recentEvents }, new Date('2026-07-15')).join('\n'));
    expect(out).toContain('Recent');
    expect(out).toContain('NWDC');
  });

  it('hub mode omits the recent-activity heading when there are no recent events', () => {
    const hubField = new ListField({ title: 'Events', options: [{ value: 'upcoming', label: 'Events' }] });
    const out = stripAnsi(renderEvents({ mode: 'hub', hubField, heatmapBuckets: [], recentEvents: [] }, new Date()).join('\n'));
    expect(out).not.toContain('Recent');
  });

  it('hub mode windows the menu against actual content height instead of overflowing', () => {
    // Regression: even without the heatmap, a full recent-activity
    // briefing (up to 5 events) plus a busy menu can still exceed a short
    // terminal's body budget — hubField never had maxVisible set at all,
    // so the menu (including items a student needs, like search/past
    // events) was silently cut off with no scroll indicator. Mirrors the
    // same fix already shipped for Schedule's hub.
    const manyOptions = Array.from({ length: 8 }, (_, i) => ({ value: String(i), label: `MenuOption${i}` }));
    const hubField = new ListField({ title: 'Events', options: manyOptions });
    const recentEvents = Array.from({ length: 5 }, (_, i) => ({
      date: `07-${17 + i}`, time: '20:30', title: `Event${i}`, location: 'TBD', description: '',
      startDate: new Date('2026-07-17T20:30:00'), recurring: false, uid: `e-${i}`,
    }));
    const out = stripAnsi(renderEvents({
      mode: 'hub', hubField, recentEvents,
    }, new Date('2026-07-15'), 12).join('\n'));
    const visibleCount = manyOptions.filter((o) => out.includes(o.label)).length;
    expect(visibleCount).toBeLessThan(manyOptions.length);
    expect(visibleCount).toBeGreaterThan(0);
  });

  it('list mode shows the list field', () => {
    const listField = new ListField({ title: 'Events', options: [{ value: '0', label: 'Hackathon' }] });
    const out = stripAnsi(renderEvents({ mode: 'list', listField }, new Date()).join('\n'));
    expect(out).toContain('Hackathon');
  });

  it('detail mode shows the event title and the action list', () => {
    const detailField = new ListField({ title: 'Hackathon', options: [{ value: 'export', label: 'Export .ics' }] });
    const out = stripAnsi(renderEvents({
      mode: 'detail', detailField,
      detailTitle: 'Hackathon', detailMeta: '03-25  ·  Main Hall', detailDescription: 'Bring a laptop.',
    }, new Date()).join('\n'));
    expect(out).toContain('Hackathon');
    expect(out).toContain('Bring a laptop.');
  });

  it('heatmap mode shows the full-year grid, split into one array entry per row', () => {
    // Regression guard matching the multi-line-collapse pattern already
    // fixed elsewhere in this codebase: renderHeatmap() returns one
    // '\n'-joined string, and this call site must split it before pushing.
    const heatmapBuckets = [{ date: '2026-07-14', count: 1 }, { date: '2026-07-15', count: 0 }];
    const lines = renderEvents({ mode: 'heatmap', heatmapBuckets }, new Date('2026-07-15'));
    for (const line of lines) {
      expect(line).not.toContain('\n');
    }
    expect(lines.length).toBeGreaterThan(10);
    expect(stripAnsi(lines.join('\n'))).toContain('Activity (last 12 months)');
  });

  it('search mode renders the text field', () => {
    const searchField = new TextField({ message: 'Search events' });
    const out = stripAnsi(renderEvents({ mode: 'search', searchField }, new Date()).join('\n'));
    expect(out).toContain('Search events');
  });

  it('error mode shows the error message', () => {
    const out = stripAnsi(renderEvents({ mode: 'error', errorMessage: 'Broke' }, new Date()).join('\n'));
    expect(out).toContain('Broke');
  });
});
