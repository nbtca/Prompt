import { describe, it, expect, beforeAll } from 'vitest';
import { renderSchedule, type ScheduleViewState } from './schedule-render.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi } from '../../core/text.js';
import type { Timetable } from '@nbtca/nbtcal/timetable';

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

  it('error mode shows the error message', () => {
    const out = stripAnsi(renderSchedule({ mode: 'error', errorMessage: 'Something broke' }, new Date()).join('\n'));
    expect(out).toContain('Something broke');
  });
});
