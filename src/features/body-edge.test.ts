import { beforeAll, describe, expect, it } from 'vitest';
import type { HeatmapBucket } from '@nbtca/nbtcal';
import type { TimetableMeeting } from '@nbtca/nbtcal/timetable';
import { renderCountdownBanner, renderEventBriefLines, type Event } from './calendar.js';
import { renderHeatmap } from './calendar-heatmap.js';
import { renderDaySwitcher, renderNextClassBanner, renderTermDensity } from './schedule-render.js';
import { setLanguage, type Language } from '../i18n/index.js';
import { resetIconCache } from '../core/icons.js';
import { bodyEdge } from '../core/theme.js';
import { visualWidth } from '../core/text.js';

beforeAll(() => {
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

const now = new Date('2026-09-27T09:00:00');
const event: Event = {
  date: '09-27',
  time: '21:30',
  title: 'CTF 训练赛',
  location: '',
  description: '',
  startDate: new Date('2026-09-27T21:34:00'),
  recurring: false,
  uid: 'ctf',
};
const meeting: TimetableMeeting = {
  sourceId: null,
  courseName: '高等数学A',
  teacherNames: [],
  location: '教3-201',
  weekday: 1,
  startPeriod: 1,
  endPeriod: 2,
  weeks: Array.from({ length: 19 }, (_, index) => index + 1),
  kind: 'regular',
};
const buckets: HeatmapBucket[] = Array.from({ length: 365 }, (_, index) => ({
  date: new Date(Date.UTC(2025, 8, 28 + index)).toISOString().slice(0, 10),
  count: index % 3,
}));

const renderers: Record<string, (cols: number) => string> = {
  countdownBanner: (cols) => renderCountdownBanner(event, now, cols),
  eventBrief: (cols) => renderEventBriefLines(event, now, cols).join('\n'),
  heatmap: (cols) => renderHeatmap(buckets, now, { cols }),
  nextClassBanner: (cols) =>
    renderNextClassBanner({ meeting, start: new Date('2026-09-28T16:00:00') }, now, cols),
  daySwitcher: (cols) => renderDaySwitcher(1, 7, cols),
  termDensity: (cols) => renderTermDensity([meeting], '2026-09-07', 3, cols),
};

describe.each<Language>(['zh', 'en'])('body edge (%s)', (language) => {
  beforeAll(() => {
    setLanguage(language);
  });

  it.each(Object.keys(renderers).flatMap((name) => [40, 60].map((cols) => [name, cols] as const)))(
    '%s stays inside the rule at %i columns',
    (name, cols) => {
      const lines = (renderers[name]?.(cols) ?? '').split('\n');
      for (const line of lines) expect(visualWidth(line), line).toBeLessThanOrEqual(bodyEdge(cols));
    },
  );
});
