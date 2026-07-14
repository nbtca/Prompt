import { describe, it, expect } from 'vitest';
import { ListField } from './list-field.js';

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
