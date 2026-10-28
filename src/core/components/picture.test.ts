import { describe, it, expect } from 'vitest';
import { pictureBeside } from './picture.js';
import { stripAnsi, visualWidth } from '../text.js';

const picture = ['####', '####', '####'];

describe('pictureBeside', () => {
  it('centres short text against the picture', () => {
    const lines = pictureBeside(picture, ['A title'], 60)?.map(stripAnsi);
    expect(lines).toHaveLength(3);
    expect(lines?.[1]).toContain('A title');
    expect(lines?.[0]).not.toContain('A title');
  });

  it('keeps the picture on top and runs on when the text is taller', () => {
    const lines = pictureBeside(picture, ['one', 'two', 'three', 'four', 'five'], 60)?.map(
      stripAnsi,
    );
    expect(lines).toHaveLength(5);
    expect(lines?.[0]).toContain('####');
    expect(lines?.[4]).not.toContain('####');
    expect(lines?.[4]).toContain('five');
  });

  it('declines when the text column would be too narrow', () => {
    expect(pictureBeside(picture, ['title'], 24)).toBeUndefined();
    expect(pictureBeside(picture, ['title'], 60, 60)).toBeUndefined();
  });

  it('never exceeds the available width', () => {
    const long = 'a long title that has to wrap inside the column next to the picture';
    expect(pictureBeside(picture, [long], 50)?.every((line) => visualWidth(line) <= 50)).toBe(true);
  });
});
