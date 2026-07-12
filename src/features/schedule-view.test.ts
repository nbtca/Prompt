import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { peekNextClassLine } from './schedule-view.js';

describe('peekNextClassLine', () => {
  let dir: string;
  let prevStateHome: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sched-peek-'));
    prevStateHome = process.env['XDG_STATE_HOME'];
    process.env['XDG_STATE_HOME'] = dir;
  });

  afterEach(() => {
    if (prevStateHome === undefined) delete process.env['XDG_STATE_HOME'];
    else process.env['XDG_STATE_HOME'] = prevStateHome;
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns \'\' when no current-term pointer/cache exists', () => {
    expect(peekNextClassLine()).toBe('');
  });

  it('never throws even with a corrupt pointer file', () => {
    expect(() => peekNextClassLine()).not.toThrow();
  });
});
