import { describe, it, expect, beforeAll } from 'vitest';
import { ListField, computeMaxVisible, renderListFieldWithContext } from './list-field.js';
import { stripAnsi, visualWidth } from '../../core/text.js';
import { setLanguage } from '../../i18n/index.js';

beforeAll(() => {
  setLanguage('en');
});

describe('ListField', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma' },
  ];

  it('starts at index 0 by default', () => {
    const field = new ListField({ title: 'Pick', options });
    expect(field.selectedIndex).toBe(0);
  });

  it('starts at initialIndex when given', () => {
    const field = new ListField({ title: 'Pick', options, initialIndex: 2 });
    expect(field.selectedIndex).toBe(2);
  });

  it('optionCount reflects how many options this specific field has', () => {
    expect(new ListField({ title: 'Pick', options }).optionCount).toBe(3);
    expect(new ListField({ title: 'Pick', options: [] }).optionCount).toBe(0);
  });

  it('moves selection down/up on arrow keys', () => {
    const field = new ListField({ title: 'Pick', options });
    field.handleKey('\x1b[B');
    expect(field.selectedIndex).toBe(1);
    field.handleKey('\x1b[A');
    expect(field.selectedIndex).toBe(0);
  });

  it('wraps at the ends', () => {
    const field = new ListField({ title: 'Pick', options });
    field.handleKey('\x1b[A');
    expect(field.selectedIndex).toBe(2);
  });

  it('returns the selected value on enter', () => {
    const field = new ListField({ title: 'Pick', options });
    field.handleKey('\x1b[B');
    expect(field.handleKey('\r')).toEqual({ selected: 'b' });
  });

  it('returns cancelled on esc/ctrl-c', () => {
    const field = new ListField({ title: 'Pick', options });
    expect(field.handleKey('\x1b')).toEqual({ cancelled: true });
    expect(field.handleKey('\x03')).toEqual({ cancelled: true });
  });

  it('render() includes the title and every option label', () => {
    const field = new ListField({ title: 'Pick one', options });
    const text = field.render().join('\n');
    expect(text).toContain('Pick one');
    expect(text).toContain('Alpha');
    expect(text).toContain('Beta');
    expect(text).toContain('Gamma');
  });
});

describe('ListField scrolling (maxVisible)', () => {
  const manyOptions = Array.from({ length: 20 }, (_, i) => ({
    value: String(i),
    label: `Item ${String(i)}`,
  }));

  it('shows every option when maxVisible is not set, however many there are', () => {
    const field = new ListField({ title: 'List', options: manyOptions });
    const text = field.render().join('\n');
    expect(text).toContain('Item 0');
    expect(text).toContain('Item 19');
  });

  it('shows only maxVisible options and a below-count at rest', () => {
    const field = new ListField({ title: 'List', options: manyOptions, maxVisible: 5 });
    const text = field.render().join('\n');
    expect(text).toContain('Item 0');
    expect(text).toContain('Item 4');
    expect(text).not.toContain('Item 5');
    expect(text).toMatch(/15/); // 15 more below
  });

  it('the more-indicator separator degrades in ASCII icon mode instead of leaking a raw Unicode dot', async () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    const { resetIconCache } = await import('../../core/icons.js');
    resetIconCache();
    const field = new ListField({ title: 'List', options: manyOptions, maxVisible: 5 });
    const text = field.render().join('\n');
    expect(text).not.toContain('·');
    delete process.env['NBTCA_ICON_MODE'];
    resetIconCache();
  });

  it('scrolls to keep the selection visible when moving down past the window', () => {
    const field = new ListField({ title: 'List', options: manyOptions, maxVisible: 5 });
    for (let i = 0; i < 7; i++) field.handleKey('\x1b[B'); // -> index 7
    const text = field.render().join('\n');
    expect(text).toContain('Item 7');
  });

  it('keeps the selection visible when jumping straight to the end', () => {
    const field = new ListField({ title: 'List', options: manyOptions, maxVisible: 5 });
    field.handleKey('\x1b[F'); // End -> last item
    const text = field.render().join('\n');
    expect(text).toContain('Item 19');
  });

  it('moves by one visible page with PageUp/PageDown', () => {
    const field = new ListField({ title: 'List', options: manyOptions, maxVisible: 5 });
    field.handleKey('\x1b[6~');
    expect(field.selectedIndex).toBe(4);
    expect(field.render().join('\n')).toContain('Item 4');
    field.handleKey('\x1b[5~');
    expect(field.selectedIndex).toBe(0);
  });

  it('scrolls back to the top when the selection wraps from last to first', () => {
    const field = new ListField({ title: 'List', options: manyOptions, maxVisible: 5 });
    field.handleKey('\x1b[F'); // jump to end
    field.handleKey('\x1b[B'); // down wraps to index 0
    const text = field.render().join('\n');
    expect(text).toContain('Item 0');
  });

  it('never scrolls when options already fit within maxVisible', () => {
    const shortOptions = manyOptions.slice(0, 3);
    const field = new ListField({ title: 'List', options: shortOptions, maxVisible: 5 });
    const text = field.render().join('\n');
    expect(text).not.toMatch(/more/i);
  });
});

describe('ListField.setMaxVisible (live resize)', () => {
  const manyOptions = Array.from({ length: 20 }, (_, i) => ({
    value: String(i),
    label: `Item ${String(i)}`,
  }));

  it('re-clamps the scroll window when the selection would fall outside a shrunk window', () => {
    const field = new ListField({ title: 'List', options: manyOptions, maxVisible: 10 });
    for (let i = 0; i < 9; i++) field.handleKey('\x1b[B'); // -> index 9, still within [0,10)
    expect(field.render().join('\n')).toContain('Item 9');

    field.setMaxVisible(5); // terminal shrank; index 9 no longer fits the window
    const text = field.render().join('\n');
    expect(text).toContain('Item 9'); // must still be visible after re-clamping
  });

  it('shows more options again after the terminal grows back', () => {
    const field = new ListField({ title: 'List', options: manyOptions, maxVisible: 5 });
    let text = field.render().join('\n');
    expect(text).not.toContain('Item 10');

    field.setMaxVisible(15);
    text = field.render().join('\n');
    expect(text).toContain('Item 10'); // now fits in the larger window
  });

  it('turning maxVisible off shows every option again', () => {
    const field = new ListField({ title: 'List', options: manyOptions, maxVisible: 5 });
    field.setMaxVisible(undefined);
    const text = field.render().join('\n');
    expect(text).toContain('Item 19');
  });
});

describe('ListField row budgets', () => {
  const manyOptions = Array.from({ length: 20 }, (_, i) => ({
    value: String(i),
    label: `Item ${String(i)}`,
  }));

  it('keeps the selected option visible in a one-row viewport', () => {
    const field = new ListField({ title: 'List', options: manyOptions });
    field.handleKey('\x1b[F');

    const lines = field.render(1).map(stripAnsi);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Item 19');
  });

  it('keeps a complete wrapped selected option in a three-row viewport', () => {
    const label = 'Log in to see my timetable';
    const field = new ListField({ title: 'Schedule', options: [{ value: 'login', label }] });

    const lines = field.render(3, 20);
    const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

    expect(lines).toHaveLength(3);
    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(text).toContain(label.replace(/\s/g, ''));
  });

  it('keeps context and an actionable option in a five-row composite viewport', () => {
    const field = new ListField({ title: 'Actions', options: manyOptions });
    const lines = renderListFieldWithContext(['Summary', '', 'Recent', 'Event', ''], field, 5).map(
      stripAnsi,
    );

    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines.join('\n')).toContain('Summary');
    expect(lines.join('\n')).toContain('Item 0');
  });
});

describe('computeMaxVisible', () => {
  it('reserves headroom for title/blank/indicator/footer chrome', () => {
    expect(computeMaxVisible(19)).toBe(15);
  });
  it('floors at 3 so a tiny terminal never gets a degenerate window', () => {
    expect(computeMaxVisible(2)).toBe(3);
  });
});

describe('ListField without a title', () => {
  const options = [{ value: 'login', label: 'Log in to see my timetable' }];

  it('renders straight to the options, expanded and compact alike', () => {
    const field = new ListField({ options });
    const expanded = field.render(Number.POSITIVE_INFINITY, 60).map(stripAnsi);
    expect(expanded[0]).toContain('Log in');

    const compact = field.render(1, 60).map(stripAnsi);
    expect(compact).toHaveLength(1);
    expect(compact[0]).toContain('Log in');
  });
});
