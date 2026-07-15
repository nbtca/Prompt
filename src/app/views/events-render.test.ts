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

  it('hub mode with real heatmap data expands each grid row into its own array entry', () => {
    // Regression test: renderHeatmap() returns one multi-line string (the
    // whole grid joined by '\n'), and renderHubBody used to push that
    // directly into the body-lines array as a single entry instead of
    // splitting it. Every downstream consumer (fitBody/fitLine/composeFrame)
    // assumes one array entry == one terminal row, so a smuggled-in '\n'
    // corrupts the whole frame's row-count accounting — this was the actual
    // cause of a real bug where the heatmap rendered as one truncated row
    // and the header was scrolled out of view above it.
    const hubField = new ListField({ title: 'Events', options: [{ value: 'upcoming', label: 'Events' }] });
    const heatmapBuckets = [{ date: '2026-07-14', count: 1 }, { date: '2026-07-15', count: 0 }];
    const lines = renderEvents({ mode: 'hub', hubField, heatmapBuckets }, new Date('2026-07-15'));
    for (const line of lines) {
      expect(line).not.toContain('\n');
    }
    // The heatmap grid alone is a title + blank + month-label + 7 grid rows
    // + blank + legend = 11 lines; a collapsed-to-one-entry regression would
    // make this assertion fail even though `lines.length` is technically
    // non-zero.
    expect(lines.length).toBeGreaterThan(10);
  });

  it('hub mode shows a recent-activity briefing under the heatmap when present', () => {
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
    // Regression: the heatmap (11 lines) + a full recent-activity briefing
    // (up to 5 events) already exceeds a 24-row terminal's body budget
    // before the menu even starts — hubField never had maxVisible set at
    // all, so on a short terminal the menu (including items a student
    // needs, like search/past-events) was silently cut off with no
    // scroll indicator. Mirrors the same fix already shipped for
    // Schedule's hub.
    const manyOptions = Array.from({ length: 8 }, (_, i) => ({ value: String(i), label: `MenuOption${i}` }));
    const hubField = new ListField({ title: 'Events', options: manyOptions });
    const heatmapBuckets = Array.from({ length: 30 }, (_, i) => ({ date: `2026-07-${String(i + 1).padStart(2, '0')}`, count: 1 }));
    const recentEvents = Array.from({ length: 5 }, (_, i) => ({
      date: `07-${17 + i}`, time: '20:30', title: `Event${i}`, location: 'TBD', description: '',
      startDate: new Date('2026-07-17T20:30:00'), recurring: false, uid: `e-${i}`,
    }));
    const out = stripAnsi(renderEvents({
      mode: 'hub', hubField, heatmapBuckets, recentEvents,
    }, new Date('2026-07-15'), 19).join('\n'));
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
