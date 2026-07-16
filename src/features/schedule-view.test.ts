import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { peekNextClassLine, peekTodayLines, peekWeekAheadInfo, peekUnresolvedCount } from './schedule-view.js';
import { setLanguage } from '../i18n/index.js';
import { resetIconCache } from '../core/icons.js';
import { stripAnsi } from '../core/text.js';

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

describe('peekTodayLines', () => {
  let dir: string;
  let prevStateHome: string | undefined;

  beforeEach(() => {
    setLanguage('en');
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    dir = mkdtempSync(join(tmpdir(), 'sched-peek-today-'));
    prevStateHome = process.env['XDG_STATE_HOME'];
    process.env['XDG_STATE_HOME'] = dir;
  });

  afterEach(() => {
    if (prevStateHome === undefined) delete process.env['XDG_STATE_HOME'];
    else process.env['XDG_STATE_HOME'] = prevStateHome;
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns [] when no current-term pointer/cache exists', () => {
    expect(peekTodayLines()).toEqual([]);
  });

  it('renders today\'s classes via the same rich timeline Schedule\'s hub uses, not the old flat list', () => {
    // Regression: Home used to render today's classes via the legacy
    // renderTodayClasses (a flat one-line-per-class list), while Schedule's
    // hub had already moved to renderTodayTimeline (connectors, live
    // in-progress highlighting, a closing end-of-day line) for the exact
    // same underlying data — the same information looked like two
    // different products depending on which tab you were on.
    mkdirSync(join(dir, 'nbtca'), { recursive: true });
    writeFileSync(join(dir, 'nbtca', 'current-term.json'), JSON.stringify({ termKey: '2026-1', weekOneMonday: '2026-09-14' }));
    writeFileSync(join(dir, 'nbtca', 'timetable-2026-1.json'), JSON.stringify({
      term: { academicYear: '2026', semester: '1' },
      meetings: [{
        sourceId: null, courseName: 'Math', teacherNames: ['Dr Li'], location: 'Room 201',
        weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1], kind: 'regular',
      }],
      unresolvedItems: [], periods: [{ period: 1, label: null, start: '08:00', end: '09:40' }],
      calendarDays: [], warnings: [], fetchedAt: '2026-09-14T00:00:00Z',
    }));

    const monday = new Date('2026-09-14T20:00:00'); // week 1, Monday, well after the class ends
    const lines = peekTodayLines(monday);
    const out = stripAnsi(lines.join('\n'));
    expect(out).toContain('Math');
    // Only renderTodayTimeline produces this closing "end of day" line and
    // "Done" status text — renderTodayClasses (the old renderer) has
    // neither, so this fails if the swap regresses back to the flat list.
    expect(out).toContain('Done');
    expect(lines.length).toBeGreaterThan(1); // 1 class line + the closing end-of-day line
  });
});

describe('peekWeekAheadInfo', () => {
  let dir: string;
  let prevStateHome: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sched-peek-week-'));
    prevStateHome = process.env['XDG_STATE_HOME'];
    process.env['XDG_STATE_HOME'] = dir;
  });

  afterEach(() => {
    if (prevStateHome === undefined) delete process.env['XDG_STATE_HOME'];
    else process.env['XDG_STATE_HOME'] = prevStateHome;
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when no current-term pointer/cache exists', () => {
    expect(peekWeekAheadInfo()).toBeNull();
  });

  it('returns null when the term has not started yet (negative week)', () => {
    mkdirSync(join(dir, 'nbtca'), { recursive: true });
    writeFileSync(join(dir, 'nbtca', 'current-term.json'), JSON.stringify({ termKey: '2026-1', weekOneMonday: '2099-01-05' }));
    writeFileSync(join(dir, 'nbtca', 'timetable-2026-1.json'), JSON.stringify({
      term: { academicYear: '2099', semester: '1' }, meetings: [], unresolvedItems: [],
      periods: [], calendarDays: [], warnings: [], fetchedAt: '2026-09-14T00:00:00Z',
    }));
    expect(peekWeekAheadInfo(new Date('2026-09-14T12:00:00'))).toBeNull();
  });

  it('computes raw per-day classDays with no weekend override applied', () => {
    mkdirSync(join(dir, 'nbtca'), { recursive: true });
    writeFileSync(join(dir, 'nbtca', 'current-term.json'), JSON.stringify({ termKey: '2026-1', weekOneMonday: '2026-09-14' }));
    writeFileSync(join(dir, 'nbtca', 'timetable-2026-1.json'), JSON.stringify({
      term: { academicYear: '2026', semester: '1' },
      meetings: [
        { sourceId: null, courseName: 'Math', teacherNames: [], location: null, weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1], kind: 'regular' },
        // A weekday-6 (Saturday) meeting on purpose: this function's own
        // contract is the *raw* per-day signal, no weekend override — that
        // override is applied later, at render time (Task 3).
        { sourceId: null, courseName: 'PE', teacherNames: [], location: null, weekday: 6, startPeriod: 1, endPeriod: 1, weeks: [1], kind: 'regular' },
      ],
      unresolvedItems: [], periods: [{ period: 1, label: null, start: '08:00', end: '08:45' }],
      calendarDays: [], warnings: [], fetchedAt: '2026-09-14T00:00:00Z',
    }));
    const info = peekWeekAheadInfo(new Date('2026-09-14T12:00:00')); // Monday of week 1
    expect(info).not.toBeNull();
    expect(info!.classDays).toEqual([true, false, false, false, false, true, false]);
  });

  it('returns the Monday of the current campus week as weekStartDate', () => {
    mkdirSync(join(dir, 'nbtca'), { recursive: true });
    writeFileSync(join(dir, 'nbtca', 'current-term.json'), JSON.stringify({ termKey: '2026-1', weekOneMonday: '2026-09-14' }));
    writeFileSync(join(dir, 'nbtca', 'timetable-2026-1.json'), JSON.stringify({
      term: { academicYear: '2026', semester: '1' }, meetings: [], unresolvedItems: [],
      periods: [], calendarDays: [], warnings: [], fetchedAt: '2026-09-14T00:00:00Z',
    }));
    // 2026-09-23 is a Wednesday in week 2 (weekOneMonday + 9 days) -> that
    // week's Monday is 2026-09-21.
    const info = peekWeekAheadInfo(new Date('2026-09-23T12:00:00'));
    expect(info).not.toBeNull();
    expect(info!.weekStartDate.getFullYear()).toBe(2026);
    expect(info!.weekStartDate.getMonth()).toBe(8); // September, 0-indexed
    expect(info!.weekStartDate.getDate()).toBe(21);
  });

  it('never throws even with a corrupt cache', () => {
    expect(() => peekWeekAheadInfo()).not.toThrow();
  });
});

describe('peekUnresolvedCount', () => {
  let dir: string;
  let prevStateHome: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sched-peek-unresolved-'));
    prevStateHome = process.env['XDG_STATE_HOME'];
    process.env['XDG_STATE_HOME'] = dir;
  });

  afterEach(() => {
    if (prevStateHome === undefined) delete process.env['XDG_STATE_HOME'];
    else process.env['XDG_STATE_HOME'] = prevStateHome;
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns 0 when no current-term pointer/cache exists', () => {
    expect(peekUnresolvedCount()).toBe(0);
  });

  it('returns the real unresolved item count from the cache', () => {
    mkdirSync(join(dir, 'nbtca'), { recursive: true });
    writeFileSync(join(dir, 'nbtca', 'current-term.json'), JSON.stringify({ termKey: '2026-1', weekOneMonday: '2026-09-14' }));
    writeFileSync(join(dir, 'nbtca', 'timetable-2026-1.json'), JSON.stringify({
      term: { academicYear: '2026', semester: '1' }, meetings: [],
      unresolvedItems: [
        { kind: 'practice', itemIndex: 0, sourceFields: { kcmc: 'Fitness test' } },
        { kind: 'practice', itemIndex: 1, sourceFields: { kcmc: 'Lab' } },
      ],
      periods: [], calendarDays: [], warnings: [], fetchedAt: '2026-09-14T00:00:00Z',
    }));
    expect(peekUnresolvedCount()).toBe(2);
  });

  it('never throws even with a corrupt cache', () => {
    expect(() => peekUnresolvedCount()).not.toThrow();
  });
});
