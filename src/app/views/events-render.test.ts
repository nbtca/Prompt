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
