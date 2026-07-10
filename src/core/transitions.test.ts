import { describe, it, expect, beforeEach } from 'vitest';
import { breadcrumb, buildScreenHeaderLines } from './transitions.js';
import { stripAnsi } from './text.js';
import { resetIconCache } from './icons.js';

describe('transitions header', () => {
  beforeEach(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });
  const done = () => { process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache(); };

  it('breadcrumb composes nbtca > label with an ascii separator', () => {
    expect(stripAnsi(breadcrumb('Status'))).toBe('nbtca > Status'); done();
  });

  it('buildScreenHeaderLines yields heading, a rule, and a trailing blank', () => {
    const lines = buildScreenHeaderLines('nbtca > Status').map(stripAnsi);
    expect(lines[0]).toContain('nbtca > Status');
    expect(lines[1]!.trim()).toMatch(/^-{3,}$/);
    expect(lines[2]).toBe('');
    done();
  });
});
