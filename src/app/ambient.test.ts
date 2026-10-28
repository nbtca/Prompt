import { describe, it, expect } from 'vitest';
import { withAmbient, type AmbientSpec } from './ambient.js';
import { eventIconConference } from '../art/bitmaps.js';
import { stripAnsi, visualWidth } from '../core/text.js';

const body = Array.from(
  { length: 6 },
  (_, index) => `   line ${String(index)} of the page content ${'.'.repeat(30)}`,
);
const noon = new Date('2026-10-28T12:00:00');

const specs: [string, AmbientSpec][] = [
  ['sky', { kind: 'sky' }],
  ['mountain', { kind: 'mountain', progress: 0.4, weeks: 17 }],
  ['shelf', { kind: 'shelf' }],
  ['emblem', { kind: 'emblem' }],
  ['icon', { kind: 'icon', icon: eventIconConference }],
];

describe('withAmbient', () => {
  it.each(specs)('draws the %s in a big window without disturbing the content', (_name, spec) => {
    const lines = withAmbient(body, spec, 120, 38, noon);
    expect(lines.length).toBeGreaterThan(body.length);
    expect(lines.length).toBeLessThanOrEqual(38);
    expect(lines.every((line) => visualWidth(line) <= 120)).toBe(true);
    expect(lines.map((line) => stripAnsi(line).trimEnd()).join('\n')).toContain(
      'line 5 of the page content',
    );
  });

  it.each(specs)(
    'leaves the %s out when the content fills an ordinary 80 x 24 window',
    (_name, spec) => {
      const full = Array.from(
        { length: 17 },
        (_, index) => `   line ${String(index)} ${'.'.repeat(50)}`,
      );
      expect(withAmbient(full, spec, 80, 19, noon)).toEqual(full);
    },
  );

  it('lays a scene under the content as a panorama when enough rows are free', () => {
    const lines = withAmbient(body, { kind: 'sky' }, 120, 38, noon);
    expect(lines.slice(0, body.length)).toEqual(body);
    expect(lines[body.length]).toBe('');
    expect(lines.length).toBe(38);
    expect(Math.max(...lines.slice(body.length + 1).map(visualWidth))).toBeGreaterThan(100);
  });

  it('puts a scene beside the content when too few rows remain below it', () => {
    const tall = Array.from(
      { length: 24 },
      (_, index) => `   row ${String(index)} ${'.'.repeat(40)}`,
    );
    const lines = withAmbient(tall, { kind: 'sky' }, 120, 30, noon);
    expect(lines.length).toBeLessThanOrEqual(30);
    expect(visualWidth(lines[0] ?? '')).toBeGreaterThan(visualWidth(tall[0] ?? ''));
  });

  it('reuses the picture for the same window and minute', () => {
    const first = withAmbient(body, { kind: 'sky' }, 120, 38, noon);
    const second = withAmbient(body, { kind: 'sky' }, 120, 38, new Date(noon.getTime() + 20_000));
    expect(second).toEqual(first);
  });

  it('grows the picture with the space', () => {
    const small = withAmbient(body, { kind: 'sky' }, 100, 16, noon);
    const large = withAmbient(body, { kind: 'sky' }, 120, 38, noon);
    expect(large.length).toBeGreaterThan(small.length);
  });

  it('keeps the page untouched without a spec or without a measured window', () => {
    expect(withAmbient(body, undefined, 120, 38)).toEqual(body);
    expect(withAmbient(body, { kind: 'sky' }, Number.POSITIVE_INFINITY, 38)).toEqual(body);
  });

  it('is plain ASCII when the picture is drawn by tone', () => {
    const lines = withAmbient(body, { kind: 'sky' }, 120, 38, noon).map(stripAnsi);
    expect(lines.join('')).toMatch(/^[\x20-\x7e]*$/);
  });
});
