import { describe, it, expect } from 'vitest';
import { TextField } from './text-field.js';

describe('TextField', () => {
  it('starts empty', () => {
    const field = new TextField({ message: 'Name' });
    expect(field.currentValue).toBe('');
  });

  it('appends typed characters', () => {
    const field = new TextField({ message: 'Name' });
    field.handleKey('h');
    field.handleKey('i');
    expect(field.currentValue).toBe('hi');
  });

  it('backspace removes the last character', () => {
    const field = new TextField({ message: 'Name' });
    field.handleKey('h');
    field.handleKey('i');
    field.handleKey('\x7f');
    expect(field.currentValue).toBe('h');
  });

  it('submits the value on enter', () => {
    const field = new TextField({ message: 'Name' });
    field.handleKey('h');
    field.handleKey('i');
    expect(field.handleKey('\r')).toEqual({ submitted: 'hi' });
  });

  it('rejects an empty submit unless allowEmpty', () => {
    const field = new TextField({ message: 'Name' });
    expect(field.handleKey('\r')).toEqual({});
    const allowEmptyField = new TextField({ message: 'Name', allowEmpty: true });
    expect(allowEmptyField.handleKey('\r')).toEqual({ submitted: '' });
  });

  it('returns cancelled on esc/ctrl-c', () => {
    const field = new TextField({ message: 'Name' });
    expect(field.handleKey('\x1b')).toEqual({ cancelled: true });
    expect(field.handleKey('\x03')).toEqual({ cancelled: true });
  });

  it('render() never reveals the value when secret', () => {
    const field = new TextField({ message: 'Password', secret: true });
    field.handleKey('s');
    field.handleKey('e');
    field.handleKey('c');
    expect(field.render().join('\n')).not.toContain('sec');
  });
});
