import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  termKey, saveWeekOne, loadWeekOne, saveTimetableCache, loadTimetableCache,
  saveCurrentPointer, loadCurrentPointer,
} from './schedule-store.js';

describe('schedule-store', () => {
  it('termKey composes year-semester', () => {
    expect(termKey({ academicYear: '2026', semester: '3' })).toBe('2026-3');
  });
  it('week-one round-trips per term via an injected dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sched-'));
    try {
      saveWeekOne('2026-3', '2026-09-07', dir);
      expect(loadWeekOne('2026-3', dir)).toBe('2026-09-07');
      expect(loadWeekOne('2025-1', dir)).toBeNull();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('timetable cache round-trips', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sched-'));
    try {
      saveTimetableCache('2026-3', { meetings: [1, 2] }, dir);
      expect(loadTimetableCache('2026-3', dir)).toEqual({ meetings: [1, 2] });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('current-term pointer round-trips', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sched-'));
    try {
      expect(loadCurrentPointer(dir)).toBeNull();
      saveCurrentPointer('2026-3', '2026-09-07', dir);
      expect(loadCurrentPointer(dir)).toEqual({ termKey: '2026-3', weekOneMonday: '2026-09-07' });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
