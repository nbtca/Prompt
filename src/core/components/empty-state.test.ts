import { describe, expect, it } from 'vitest';
import { emptyStateLines } from './empty-state.js';
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
});
