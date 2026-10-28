import { describe, expect, it } from 'vitest';
import { emptyStateLines, loadingStateLines, offlineContext } from './empty-state.js';
import { stripAnsi, visualWidth } from '../text.js';

describe('emptyStateLines', () => {
  it.each(['calendar', 'search'] as const)(
    'keeps the %s illustration and status within a roomy body',
    (kind) => {
      const lines = emptyStateLines(kind, 'No upcoming events', 80, 3);
      expect(lines).toHaveLength(3);
      expect(lines.map(stripAnsi).join('\n')).toContain('No upcoming events');
      expect(lines.every((line) => visualWidth(line) <= 80)).toBe(true);
      expect(lines.every((line) => /^[\x20-\x7e]*$/.test(stripAnsi(line)))).toBe(true);
    },
  );

  it.each([
    [20, 10, '未找到匹配的文档'],
    [80, 1, 'No upcoming events'],
    [
      40,
      3,
      'This unusually long status must remain completely readable without an illustration taking room from the message',
    ],
  ])(
    'preserves the complete status within %i columns and %i rows of art budget',
    (cols, rows, label) => {
      const lines = emptyStateLines('search', label, cols, rows);
      expect(lines.map(stripAnsi).join('').replace(/\s/g, '')).toBe(label.replace(/\s/g, ''));
      expect(lines.every((line) => visualWidth(line) <= cols)).toBe(true);
    },
  );

  it.each(['calendar', 'search'] as const)(
    'draws the larger %s picture when there are six rows to spare',
    (kind) => {
      const lines = emptyStateLines(kind, 'No upcoming events', 80, 8);
      expect(lines).toHaveLength(6);
      expect(lines.map(stripAnsi).join('\n')).toContain('No upcoming events');
      expect(lines.every((line) => visualWidth(line) <= 80)).toBe(true);
    },
  );

  it('falls back to the three-line sketch below six rows', () => {
    expect(emptyStateLines('calendar', 'No upcoming events', 80, 5)).toHaveLength(3);
  });

  it('animates the loading picture and falls back to the spinner line when cramped', () => {
    const first = loadingStateLines('Loading...', 80, 8, 0);
    const later = loadingStateLines('Loading...', 80, 8, 1600);
    expect(first).toHaveLength(6);
    expect(first.map(stripAnsi).join('\n')).toContain('Loading...');
    expect(first).not.toEqual(later);
    expect(loadingStateLines('Loading...', 80, 3, 0)).toHaveLength(1);
    expect(loadingStateLines('Loading...', 30, 20, 0)).toHaveLength(1);
  });

  it('keeps the hint, and any URL in it, whole beneath the offline picture', () => {
    const hint = ['   Try again later, or read them at https://docs.nbtca.space'];
    const lines = offlineContext('Could not load.', hint, ['plain'], 80, 12);
    const text = lines.map(stripAnsi);
    expect(text.some((line) => line.includes('Could not load.'))).toBe(true);
    expect(text).toContain(hint[0]);
    expect(lines.every((line) => visualWidth(line) <= 80)).toBe(true);
    expect(offlineContext('Could not load.', hint, ['plain'], 80, 6)).toEqual(['plain']);
  });
});
