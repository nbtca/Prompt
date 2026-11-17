import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StudentGrade } from '@nbtca/nbtcal/academic';
import { markGradeSeen, sealedGrades, SEEN_GRADES_FILE } from './grade-seen.js';
import { clearScheduleCache } from './schedule-store.js';

const grade = (courseName: string, value: string | null): StudentGrade => ({
  courseCode: `C-${courseName}`,
  courseName,
  grade: value,
  credits: 3,
  gradePoint: value === null ? null : 3.7,
  courseNature: null,
  examNature: null,
  remark: null,
  voided: false,
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'grades-seen-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('sealedGrades', () => {
  it('seals nothing on the first look at a term, then seals grades published since', () => {
    expect(
      sealedGrades('2026-3', [grade('Calculus', '92'), grade('Physics', null)], dir).size,
    ).toBe(0);
    const later = [grade('Calculus', '92'), grade('Physics', '88'), grade('Networks', null)];
    expect([...sealedGrades('2026-3', later, dir)]).toEqual([1]);
    expect([...sealedGrades('2026-3', later, dir)]).toEqual([1]);
  });

  it('keeps a grade unsealed once it is revealed', () => {
    sealedGrades('2026-3', [], dir);
    const physics = grade('Physics', '88');
    expect(sealedGrades('2026-3', [physics], dir).size).toBe(1);
    markGradeSeen('2026-3', physics, dir);
    expect(sealedGrades('2026-3', [physics], dir).size).toBe(0);
  });

  it('stores only salted fingerprints, privately, and logout removes them', () => {
    sealedGrades('2026-3', [grade('Calculus', '92')], dir);
    const file = join(dir, SEEN_GRADES_FILE);
    const store = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(store).sort()).toEqual(['salt', 'terms']);
    expect(store['terms']).toEqual({ '2026-3': [expect.stringMatching(/^[0-9a-f]{32}$/)] });
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
    clearScheduleCache(dir);
    expect(existsSync(file)).toBe(false);
  });
});
