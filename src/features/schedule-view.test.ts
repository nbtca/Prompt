import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  nextClassLine,
  peekSchedule,
  todayLines,
  weekAheadInfo,
  type CachedSchedule,
} from './schedule-view.js';
import { setLanguage } from '../i18n/index.js';
import { resetIconCache } from '../core/icons.js';
import { campusDateTime } from '@nbtca/nbtcal/timetable';
import { stripAnsi, visualWidth } from '../core/text.js';

const meeting = (courseName: string, weekday: number, location: string | null = null) => ({
  sourceId: null,
  courseName,
  teacherNames: [],
  location,
  weekday,
  startPeriod: 1,
  endPeriod: 1,
  weeks: [1],
  kind: 'regular',
});

function timetableJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    term: { academicYear: '2026', semester: '1' },
    meetings: [],
    unresolvedItems: [],
    periods: [{ period: 1, label: null, start: '08:00', end: '09:40' }],
    calendarDays: [],
    warnings: [],
    fetchedAt: '2026-09-14T00:00:00Z',
    ...overrides,
  };
}

let dir: string;
let prevStateHome: string | undefined;

beforeEach(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
  dir = mkdtempSync(join(tmpdir(), 'sched-peek-'));
  prevStateHome = process.env['XDG_STATE_HOME'];
  process.env['XDG_STATE_HOME'] = dir;
});

afterEach(() => {
  if (prevStateHome === undefined) delete process.env['XDG_STATE_HOME'];
  else process.env['XDG_STATE_HOME'] = prevStateHome;
  rmSync(dir, { recursive: true, force: true });
});

function writeCache(timetable: Record<string, unknown>, weekOneMonday = '2026-09-14'): void {
  mkdirSync(join(dir, 'nbtca'), { recursive: true });
  writeFileSync(
    join(dir, 'nbtca', 'current-term.json'),
    JSON.stringify({ termKey: '2026-1', weekOneMonday }),
  );
  writeFileSync(join(dir, 'nbtca', 'timetable-2026-1.json'), JSON.stringify(timetable));
}

function cached(): CachedSchedule {
  const value = peekSchedule();
  if (!value) throw new Error('Expected a cached schedule');
  return value;
}

describe('peekSchedule', () => {
  it('returns null when no current-term pointer/cache exists', () => {
    expect(peekSchedule()).toBeNull();
  });

  it('returns null instead of throwing on a corrupt pointer file', () => {
    mkdirSync(join(dir, 'nbtca'), { recursive: true });
    writeFileSync(join(dir, 'nbtca', 'current-term.json'), '{not json');
    expect(peekSchedule()).toBeNull();
  });

  it('keeps the real unresolved items from the cache', () => {
    writeCache(
      timetableJson({
        unresolvedItems: [
          { kind: 'practice', itemIndex: 0, sourceFields: { kcmc: 'Fitness test' } },
          { kind: 'practice', itemIndex: 1, sourceFields: { kcmc: 'Lab' } },
        ],
      }),
    );
    expect(cached().timetable.unresolvedItems).toHaveLength(2);
  });
});

describe('todayLines', () => {
  it("renders today's classes via the same rich timeline Schedule's hub uses", () => {
    writeCache(timetableJson({ meetings: [meeting('Math', 1, 'Room 201')] }));
    const lines = todayLines(cached(), campusDateTime('2026-09-14', '20:00'));
    const out = stripAnsi(lines.join('\n'));
    expect(out).toContain('Math');
    expect(out).toContain('Done');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('fits a live class inside the frame at forty columns', () => {
    writeCache(
      timetableJson({
        meetings: [meeting('Situation and Policy Seminar', 1, 'Maker Space, Library 3F')],
      }),
    );
    const lines = todayLines(cached(), campusDateTime('2026-09-14', '08:30'), 40);
    const live = stripAnsi(lines[0] ?? '');
    expect(live).toContain('min left');
    expect(live).not.toContain('Maker Space');
    expect(visualWidth(live)).toBeLessThanOrEqual(37);
  });
});

describe('nextClassLine', () => {
  it('shows a localized countdown to the next class', () => {
    writeCache(timetableJson({ meetings: [meeting('Math', 2)] }));
    const line = stripAnsi(nextClassLine(cached(), campusDateTime('2026-09-14', '06:00')));
    expect(line).toContain('Math');
    expect(line).toContain('in 1d 2h');
  });
});

describe('weekAheadInfo', () => {
  it('returns null when the term has not started yet (negative week)', () => {
    writeCache(timetableJson({ periods: [] }), '2099-01-05');
    expect(weekAheadInfo(cached(), campusDateTime('2026-09-14', '12:00'))).toBeNull();
  });

  it('computes raw per-day classDays with no weekend override applied', () => {
    writeCache(timetableJson({ meetings: [meeting('Math', 1), meeting('PE', 6)] }));
    const info = weekAheadInfo(cached(), campusDateTime('2026-09-14', '12:00'));
    expect(info?.classDays).toEqual([true, false, false, false, false, true, false]);
  });

  it('spans the current campus week from Monday midnight', () => {
    writeCache(timetableJson({ periods: [] }));
    const info = weekAheadInfo(cached(), campusDateTime('2026-09-23', '12:00'));
    expect(info?.weekStart).toBe('2026-09-21');
  });
});
