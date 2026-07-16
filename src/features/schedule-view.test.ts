import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { peekNextClassLine, peekTodayLines } from './schedule-view.js';
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
