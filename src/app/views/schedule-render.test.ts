import { describe, it, expect, beforeAll } from 'vitest';
import { renderSchedule, type ScheduleViewState } from './schedule-render.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi } from '../../core/text.js';
import type { Timetable } from '@nbtca/nbtcal/timetable';
import type { Event } from '../../features/calendar.js';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

const timetable: Timetable = {
  term: { academicYear: '2026', semester: '3' },
  meetings: [{
    sourceId: null, courseName: 'Math', teacherNames: ['Dr Li'], location: 'Room 201',
    weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1], kind: 'regular',
  }],
  unresolvedItems: [{ kind: 'practice', itemIndex: 0, sourceFields: { kcmc: 'Fitness test' } }],
  periods: [{ period: 1, label: null, start: '08:00', end: '08:45' }],
  calendarDays: [],
  warnings: [],
  fetchedAt: new Date('2026-09-07T00:00:00Z'),
};

// A realistic full-day period table (matches the real campus period system,
// which defines up to 12 periods/day) — the single-period `timetable`
// fixture above is too small to ever exercise the "doesn't fit, fall back
// to the strip" branch of the adaptive hub.
const busyTimetable: Timetable = {
  ...timetable,
  meetings: [
    { sourceId: null, courseName: 'Math', teacherNames: ['Dr Li'], location: 'Room 201', weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1], kind: 'regular' },
    { sourceId: null, courseName: 'Physics', teacherNames: ['Dr Wu'], location: 'Room 105', weekday: 1, startPeriod: 3, endPeriod: 3, weeks: [1], kind: 'regular' },
  ],
  periods: Array.from({ length: 12 }, (_, i) => ({
    period: i + 1, label: null,
    start: `${String(8 + i).padStart(2, '0')}:00`, end: `${String(8 + i).padStart(2, '0')}:45`,
  })),
};

describe('renderSchedule', () => {
  it('loading mode shows a loading hint', () => {
    const out = stripAnsi(renderSchedule({ mode: 'loading' }, new Date()).join('\n'));
    expect(out.length).toBeGreaterThan(0);
  });

  it('needsLoginId mode renders the id field', () => {
    const idField = new TextField({ message: 'Student id' });
    const out = stripAnsi(renderSchedule({ mode: 'needsLoginId', idField }, new Date()).join('\n'));
    expect(out).toContain('Student id');
  });

  it('hub mode shows the next-class banner, today, and the unresolved badge', () => {
    const hubField = new ListField({
      title: 'Schedule',
      options: [
        { value: 'week', label: 'This week' },
        { value: 'unresolved', label: 'Needs attention', hint: '1' },
      ],
    });
    const out = stripAnsi(renderSchedule({
      mode: 'hub', key: '2026-3', weekOne: '2026-09-07', timetable, hubField,
    }, new Date('2026-09-07T07:00:00')).join('\n'));
    expect(out).toContain('Math');
    expect(out).toContain('Needs attention');
  });

  it('hub mode shows a "term not started" state instead of a negative week when weekOne is in the future', () => {
    // Regression: weekOne can be auto-inferred *ahead* of `now` while on
    // break (it deliberately points at the upcoming term so it's ready
    // once classes start — see academic-calendar.ts). Rendering the
    // today/timeline/week-strip section anyway against a future weekOne
    // produced a nonsensical negative week number and an empty class grid
    // that read as "there are classes right now."
    const hubField = new ListField({ title: 'Schedule', options: [{ value: 'week', label: 'This week' }] });
    const out = stripAnsi(renderSchedule({
      mode: 'hub', key: '2026-3', weekOne: '2099-01-05', timetable, hubField,
    }, new Date('2026-09-07T07:00:00')).join('\n'));
    expect(out).toContain("Term hasn't started yet");
    expect(out).toContain('2099-01-05');
    // A *negative* week number specifically -- "Week 1 preview" (the
    // deliberate week-1-preview grid added below) legitimately contains
    // "Week 1" and must not trip this assertion.
    expect(out).not.toMatch(/Week -\d/);
  });

  describe('term-not-started week-1 preview', () => {
    // Regression: previously this state showed *only* "Term hasn't started
    // yet" text, with zero grid content regardless of how tall the
    // terminal was — "should we show a grid" was gated on there being a
    // "current week" concept at all, not on available room, which broke
    // this app's own adaptive-density convention (every other section
    // shows more content on a tall terminal, never *no* content). The
    // timetable's real week-1 data is already fetched by this point (see
    // academic-calendar.ts's weekOne-ahead-of-now behavior), so there's no
    // reason not to preview it.
    it('shows a week-1 preview grid on a tall terminal even though the term has not started', () => {
      const hubField = new ListField({ title: 'Schedule', options: [{ value: 'week', label: 'This week' }] });
      const out = stripAnsi(renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2099-01-05', timetable: busyTimetable, hubField,
      }, new Date('2026-09-07T07:00:00'), 45).join('\n'));
      expect(out).toContain("Term hasn't started yet");
      expect(out).toContain('Week 1 preview');
      // Room 105 (Physics's location) is what the full grid distinctly
      // places at period 3 -- the course name itself may truncate under
      // location-priority cell formatting, location does not.
      expect(out).toContain('Room 105');
      expect(out).toContain('19:00'); // busyTimetable's 12-period table starts period 12 at 19:00
    });

    it('falls back to the week strip on a short terminal even though the term has not started', () => {
      const hubField = new ListField({ title: 'Schedule', options: [{ value: 'week', label: 'This week' }] });
      const out = stripAnsi(renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2099-01-05', timetable: busyTimetable, hubField,
      }, new Date('2026-09-07T07:00:00'), 19).join('\n'));
      expect(out).toContain('Week 1 preview');
      expect(out).not.toContain('19:00');
      expect(out).toContain('has class'); // the strip's own legend text
    });

    it('shows an empty week-1 preview without crashing when there are no meetings at all', () => {
      const emptyTimetable: Timetable = { ...timetable, meetings: [] };
      const hubField = new ListField({ title: 'Schedule', options: [{ value: 'week', label: 'This week' }] });
      expect(() => renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2099-01-05', timetable: emptyTimetable, hubField,
      }, new Date('2026-09-07T07:00:00'), 45)).not.toThrow();
      const out = stripAnsi(renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2099-01-05', timetable: emptyTimetable, hubField,
      }, new Date('2026-09-07T07:00:00'), 45).join('\n'));
      expect(out).toContain('Week 1 preview');
      expect(out).not.toContain('Math');
    });

    it('never collapses the week-1 preview into one array entry', () => {
      const hubField = new ListField({ title: 'Schedule', options: [{ value: 'week', label: 'This week' }] });
      const lines = renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2099-01-05', timetable: busyTimetable, hubField,
      }, new Date('2026-09-07T07:00:00'), 45);
      for (const line of lines) {
        expect(line).not.toContain('\n');
      }
    });
  });

  it('hub mode windows the menu instead of overflowing when the timeline pushes it past bodyRows', () => {
    // Regression guard: the timeline/week-strip above the menu have dynamic
    // height, and hubField previously had no maxVisible at all — a short
    // terminal (or a busy today) silently dropped the menu's bottom rows
    // (the unresolved-items warning, log out) with no scroll indicator.
    const manyOptions = Array.from({ length: 8 }, (_, i) => ({ value: String(i), label: `MenuOption${i}` }));
    const hubField = new ListField({ title: 'Schedule', options: manyOptions });
    const out = stripAnsi(renderSchedule({
      mode: 'hub', key: '2026-3', weekOne: '2026-09-07', timetable, hubField,
    }, new Date('2026-09-07T07:00:00'), 15).join('\n'));
    const visibleCount = manyOptions.filter((o) => out.includes(o.label)).length;
    expect(visibleCount).toBeLessThan(manyOptions.length);
    expect(visibleCount).toBeGreaterThan(0);
  });

  it('hub mode never collapses a multi-line renderer output into one array entry', () => {
    // Regression guard for the renderTodayTimeline/renderWeekStrip wiring:
    // both return one '\n'-joined string by this module's convention, and a
    // missed .split('\n') at the call site corrupts the frame compositor's
    // row count (the exact bug that previously pushed the header off-screen).
    const hubField = new ListField({ title: 'Schedule', options: [{ value: 'week', label: 'This week' }] });
    const lines = renderSchedule({
      mode: 'hub', key: '2026-3', weekOne: '2026-09-07', timetable, hubField,
    }, new Date('2026-09-07T07:00:00'));
    for (const line of lines) {
      expect(line).not.toContain('\n');
    }
  });

  describe('adaptive week section', () => {
    it('shows the full week grid inline on a tall terminal, with the menu still reachable', () => {
      const hubField = new ListField({ title: 'Schedule', options: [{ value: 'week', label: 'This week' }, { value: 'logout', label: 'Log out' }] });
      const out = stripAnsi(renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2026-09-07', timetable: busyTimetable, hubField,
      }, new Date('2026-09-07T07:00:00'), 45).join('\n'));
      expect(out).toContain('Physics'); // only the full grid places period-3 courses distinctly
      expect(out).toContain('19:00'); // busyTimetable's 12-period table starts period 12 at 19:00
      expect(out).toContain('Log out'); // menu still rendered underneath
    });

    it('stays with the compact week strip on a normal-size terminal', () => {
      const hubField = new ListField({ title: 'Schedule', options: [{ value: 'week', label: 'This week' }] });
      const out = stripAnsi(renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2026-09-07', timetable: busyTimetable, hubField,
      }, new Date('2026-09-07T07:00:00'), 19).join('\n'));
      expect(out).not.toContain('19:00');
      expect(out).toContain('has class'); // the strip's own legend text
    });

    it('never collapses the inline grid into one array entry', () => {
      const hubField = new ListField({ title: 'Schedule', options: [{ value: 'week', label: 'This week' }] });
      const lines = renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2026-09-07', timetable: busyTimetable, hubField,
      }, new Date('2026-09-07T07:00:00'), 45);
      for (const line of lines) {
        expect(line).not.toContain('\n');
      }
    });

    it('threads the real terminal column width down to the grid, so a wide terminal stops truncating real course names', () => {
      // Regression: the grid's cell width used to be a hardcoded 10
      // regardless of the actual terminal width, so real course names
      // truncated to "..." even with plenty of unused horizontal space —
      // renderSchedule now threads ctx.size.cols all the way down.
      const longNameTimetable: Timetable = {
        ...timetable,
        meetings: [{ sourceId: null, courseName: '工业机器人系统', teacherNames: ['Dr Wu'], location: 'Room 105', weekday: 1, startPeriod: 1, endPeriod: 1, weeks: [1], kind: 'regular' }],
      };
      const hubField = new ListField({ title: 'Schedule', options: [{ value: 'week', label: 'This week' }] });
      const narrowLines = renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2026-09-07', timetable: longNameTimetable, hubField,
      }, new Date('2026-09-07T07:00:00'), 45, 80).map((l) => stripAnsi(l));
      // Wide enough for the cell to fit "Room 105" + separator + the full
      // 14-column course name (location takes priority in each cell, so a
      // merely-wider-than-80 terminal isn't automatically enough once a
      // location is also competing for the same cell width).
      const wideLines = renderSchedule({
        mode: 'hub', key: '2026-3', weekOne: '2026-09-07', timetable: longNameTimetable, hubField,
      }, new Date('2026-09-07T07:00:00'), 45, 210).map((l) => stripAnsi(l));
      // Scoped to the grid's own period-1 row specifically, searching only
      // *after* the "This week" heading -- the Today timeline above the
      // grid also has its own "08:00 ─┬─ ..." row (never truncated), so a
      // bare "starts with 08:00" search would ambiguously match that one
      // first instead of the grid's.
      const narrowHeadingIdx = narrowLines.findIndex((l) => l.includes('This week'));
      const wideHeadingIdx = wideLines.findIndex((l) => l.includes('This week'));
      const narrowGridRow = narrowLines.slice(narrowHeadingIdx).find((l) => l.trim().startsWith('08:00'))!;
      const wideGridRow = wideLines.slice(wideHeadingIdx).find((l) => l.trim().startsWith('08:00'))!;
      expect(narrowGridRow).not.toContain('工业机器人系统');
      expect(wideGridRow).toContain('工业机器人系统');
    });
  });

  it('week mode renders the grid', () => {
    const out = stripAnsi(renderSchedule({
      mode: 'week', key: '2026-3', weekOne: '2026-09-07', timetable,
    }, new Date('2026-09-07T09:00:00')).join('\n'));
    expect(out).toContain('Math');
  });

  it('unresolved mode lists the unresolved item', () => {
    const out = stripAnsi(renderSchedule({
      mode: 'unresolved', key: '2026-3', weekOne: '2026-09-07', timetable,
    }, new Date()).join('\n'));
    expect(out).toContain('Fitness test');
  });

  it('termDensity mode renders the term density strip with its own title', () => {
    const out = stripAnsi(renderSchedule({
      mode: 'termDensity', key: '2026-3', weekOne: '2026-09-07', timetable,
    }, new Date('2026-09-07T09:00:00')).join('\n'));
    expect(out).toContain('Term density');
  });

  it('error mode shows the error message', () => {
    const out = stripAnsi(renderSchedule({ mode: 'error', errorMessage: 'Something broke' }, new Date()).join('\n'));
    expect(out).toContain('Something broke');
  });
});

describe('renderSchedule — public mode', () => {
  it('shows a loading hint while publicWindow is undefined', () => {
    const out = stripAnsi(renderSchedule({ mode: 'public' }, new Date()).join('\n'));
    expect(out.trim().length).toBeGreaterThan(0);
  });

  it('shows the unavailable hint when publicWindow is null', () => {
    const out = stripAnsi(renderSchedule({ mode: 'public', publicWindow: null }, new Date()).join('\n'));
    expect(out).toContain('Academic calendar not available yet');
  });

  it('shows the on-break state', () => {
    const state = { mode: 'public' as const, publicWindow: { status: 'onBreak' as const, breakTitle: '暑假' } };
    const out = stripAnsi(renderSchedule(state, new Date()).join('\n'));
    expect(out).toContain('On break');
    expect(out).toContain('暑假');
  });

  it('shows term/week and a progress bar when nextBreakStart is known', () => {
    const state = {
      mode: 'public' as const,
      publicWindow: {
        status: 'inTerm' as const, academicYear: '2026-2027', semester: '1' as const,
        weekOneMonday: '2026-09-14', currentWeek: 3,
        nextBreakStart: '2027-01-13', nextBreakTitle: '寒假',
      },
    };
    const out = stripAnsi(renderSchedule(state, new Date('2026-10-01')).join('\n'));
    expect(out).toContain('2026-2027');
    expect(out).toContain('Term 1');
    expect(out).toContain('Week 3');
    expect(out).toContain('days until');
  });

  it('groups the term heading, progress bar, and countdown as one block with no blank lines inside it', () => {
    // Regression: this cluster used to push a blank line *before* the bar
    // and *before* the countdown line, inverting the app's dominant
    // "content, then blank" rhythm (every other hub — Home, Events —
    // never puts a blank before a block's own content).
    const state: ScheduleViewState = {
      mode: 'public',
      publicWindow: {
        status: 'inTerm', academicYear: '2026-2027', semester: '1',
        weekOneMonday: '2026-09-14', currentWeek: 3,
        nextBreakStart: '2027-01-13', nextBreakTitle: '寒假',
      },
    };
    const lines = renderSchedule(state, new Date('2026-10-01')).map((l) => stripAnsi(l));
    const headingIndex = lines.findIndex((l) => l.includes('2026-2027'));
    const barIndex = lines.findIndex((l) => /\d+\/\d+/.test(l));
    expect(lines[headingIndex + 1]?.trim()).not.toBe(''); // no blank right after the heading
    expect(barIndex).toBeGreaterThan(headingIndex);
  });

  it('shows term/week without a progress bar when nextBreakStart is unknown', () => {
    const state = {
      mode: 'public' as const,
      publicWindow: {
        status: 'inTerm' as const, academicYear: '2026-2027', semester: '1' as const,
        weekOneMonday: '2026-09-14', currentWeek: 3,
      },
    };
    expect(() => renderSchedule(state, new Date('2026-10-01'))).not.toThrow();
  });

  it('renders upcoming public events via the shared briefing format', () => {
    const upcoming: Event[] = [{
      date: '10-01', time: '', title: 'National Day', location: 'TBD', description: '',
      startDate: new Date('2026-10-01'), recurring: true, uid: 'nd-1',
    }];
    const state = { mode: 'public' as const, publicWindow: null, publicUpcoming: upcoming };
    const out = stripAnsi(renderSchedule(state, new Date()).join('\n'));
    expect(out).toContain('National Day');
  });

  it('renders the login action field', () => {
    const publicField = new ListField({ title: 'x', options: [{ value: 'login', label: 'Log in' }] });
    const out = stripAnsi(renderSchedule({ mode: 'public', publicField }, new Date()).join('\n'));
    expect(out).toContain('Log in');
  });

  it('never collapses a multi-line renderer output into one array entry', () => {
    const publicField = new ListField({ title: 'x', options: [{ value: 'login', label: 'Log in' }] });
    const state = {
      mode: 'public' as const,
      publicWindow: {
        status: 'inTerm' as const, academicYear: '2026-2027', semester: '1' as const,
        weekOneMonday: '2026-09-14', currentWeek: 3,
        nextBreakStart: '2027-01-13', nextBreakTitle: '寒假',
      },
      publicUpcoming: [{
        date: '10-01', time: '', title: 'National Day', location: 'TBD', description: '',
        startDate: new Date('2026-10-01'), recurring: true, uid: 'nd-1',
      }] as Event[],
      publicField,
    };
    for (const line of renderSchedule(state, new Date('2026-10-01'))) {
      expect(line).not.toContain('\n');
    }
  });

  describe('adaptive public-upcoming count', () => {
    const manyUpcoming: Event[] = Array.from({ length: 12 }, (_, i) => ({
      date: `07-${17 + i}`, time: '', title: `Event${i}`, location: 'TBD', description: '',
      startDate: new Date('2026-07-17'), recurring: false, uid: `e-${i}`,
    }));

    it('shows only as many public-upcoming events as fit, reserving room for the login field, on a normal terminal', () => {
      const publicField = new ListField({ title: 'x', options: [{ value: 'login', label: 'Log in' }] });
      const out = stripAnsi(renderSchedule({
        mode: 'public', publicWindow: null, publicUpcoming: manyUpcoming, publicField,
      }, new Date(), 15).join('\n'));
      const visibleCount = manyUpcoming.filter((e) => out.includes(e.title)).length;
      expect(visibleCount).toBeLessThan(manyUpcoming.length);
      expect(visibleCount).toBeGreaterThan(0);
      expect(out).toContain('Log in'); // login field still present, not starved out
    });

    it('shows more public-upcoming events on a tall terminal', () => {
      const publicField = new ListField({ title: 'x', options: [{ value: 'login', label: 'Log in' }] });
      const out = stripAnsi(renderSchedule({
        mode: 'public', publicWindow: null, publicUpcoming: manyUpcoming, publicField,
      }, new Date(), 45).join('\n'));
      for (const e of manyUpcoming) expect(out).toContain(e.title);
    });
  });
});
