import { describe, it, expect, beforeAll } from 'vitest';
import { ListField, computeMaxVisible } from './list-field.js';
import { setLanguage } from '../../i18n/index.js';

beforeAll(() => setLanguage('en'));

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
  const manyOptions = Array.from({ length: 20 }, (_, i) => ({ value: String(i), label: `Item ${i}` }));

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

describe('computeMaxVisible', () => {
  it('reserves headroom for title/blank/indicator/footer chrome', () => {
    expect(computeMaxVisible(19)).toBe(15);
  });
  it('floors at 3 so a tiny terminal never gets a degenerate window', () => {
    expect(computeMaxVisible(2)).toBe(3);
  });
});
