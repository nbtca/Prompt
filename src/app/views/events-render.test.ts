import { describe, it, expect, beforeAll } from 'vitest';
import { renderEvents, type EventsViewState } from './events-render.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi, visualWidth } from '../../core/text.js';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

describe('renderEvents', () => {
  it('loading mode shows a loading hint', () => {
    const out = stripAnsi(renderEvents({ mode: 'loading' }, new Date()).join('\n'));
    expect(out.trim().length).toBeGreaterThan(0);
  });

  it.each([
    ['en', 'loading', 'Loading event calendar...', 2],
    ['en', 'heatmap', 'No upcoming events', 1],
    ['zh', 'loading', '正在获取活动日历...', 1],
    ['zh', 'heatmap', '近期暂无活动安排', 1],
  ] as const)('wraps the complete %s %s status within twenty columns', (language, mode, expected, rows) => {
    setLanguage(language);
    try {
      const state = mode === 'loading'
        ? { mode } as const
        : { mode, heatmapBuckets: [] } as const;
      const lines = renderEvents(state, new Date(), 3, 20);
      const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

      expect(lines).toHaveLength(rows);
      expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
      expect(text).toBe(expected.replace(/\s/g, ''));
    } finally {
      setLanguage('en');
    }
  });

  it('hub mode shows the hub action list', () => {
    const hubField = new ListField({ title: 'Events', options: [{ value: 'upcoming', label: 'Events' }] });
    const out = stripAnsi(renderEvents({ mode: 'hub', hubField, heatmapBuckets: [] }, new Date()).join('\n'));
    expect(out).toContain('Events');
  });

  it.each([
    ['Events', ['Events', 'This week', 'This month', 'Search', 'Past events', 'Activity (last 12 months)']],
    ['活动', ['活动列表', '本周活动', '本月活动', '搜索活动', '往期活动', '过去十二个月活动热力图']],
  ])('fits every hub action within nine rows and twenty columns', (title, labels) => {
    const hubField = new ListField({
      title,
      options: labels.map((label, index) => ({ value: String(index), label })),
      initialIndex: labels.length - 1,
    });
    const lines = renderEvents({ mode: 'hub', hubField, heatmapBuckets: [] }, new Date(), 9, 20);
    const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

    expect(lines.length).toBeLessThanOrEqual(9);
    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    for (const label of labels) expect(text).toContain(label.replace(/\s/g, ''));
    expect(lines.filter((line) => /[→>]/u.test(stripAnsi(line)))).toHaveLength(1);
  });

  it.each([
    ['en', 'International innovation and entrepreneurship competition', 'Next'],
    ['zh', '国际创新创业项目成果展示交流活动', '下一场'],
  ] as const)('fits a complete %s countdown banner within twenty columns', (language, title, nextLabel) => {
    setLanguage(language);
    try {
      const nextEvent = {
        date: '10-01', time: '09:30', title, location: 'TBD', description: '',
        startDate: new Date('2026-10-01T09:30:00'), recurring: false, uid: 'next-event',
      };
      const hubField = new ListField({ title: 'Events', options: [{ value: 'events', label: 'Events' }] });
      const lines = renderEvents({
        mode: 'hub', hubField, nextEvent, heatmapBuckets: [],
      }, new Date('2026-09-30T09:30:00'), 12, 20);
      const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

      expect(lines.length).toBeLessThanOrEqual(12);
      expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
      expect(lines.every((line) => !line.includes('\n'))).toBe(true);
      expect(text).toContain(title.replace(/\s/g, ''));
      expect(text).toContain(nextLabel);
      expect(text).toContain('1d0h');
      expect(text).toContain('Events');
    } finally {
      setLanguage('en');
    }
  });

  it('hub mode does not render the heatmap grid on a normal-size terminal, even when heatmapBuckets is populated', () => {
    // The full-year heatmap moved out of the glanceable hub and into its
    // own drill-down destination (mirrors Schedule: the hub shows a
    // compact week strip, not the full weekday x period grid) — a student
    // scanning the hub for "what's next" shouldn't have to look past 11
    // lines of a mostly-empty contribution grid to reach the menu. This is
    // the small/default-terminal case; a tall terminal gets the heatmap
    // back inline (see the "adaptive density" describe block below).
    const hubField = new ListField({ title: 'Events', options: [{ value: 'upcoming', label: 'Events' }] });
    const heatmapBuckets = [{ date: '2026-07-14', count: 1 }, { date: '2026-07-15', count: 0 }];
    const out = stripAnsi(renderEvents({ mode: 'hub', hubField, heatmapBuckets }, new Date('2026-07-15'), 19).join('\n'));
    expect(out).not.toContain('Activity (last 12 months)');
    expect(out).not.toContain('Less');
  });

  it('hub mode shows a recent-activity briefing when present', () => {
    const hubField = new ListField({ title: 'Events', options: [{ value: 'upcoming', label: 'Events' }] });
    const recentEvents = [{
      date: '07-17', time: '20:30', title: 'NWDC', location: 'TBD', description: '',
      startDate: new Date('2026-07-17T20:30:00'), recurring: true, uid: 'nwdc-1',
    }];
    const out = stripAnsi(renderEvents({ mode: 'hub', hubField, heatmapBuckets: [], recentEvents }, new Date('2026-07-15')).join('\n'));
    expect(out).toContain('Recent');
    expect(out).toContain('NWDC');
  });

  it.each([
    ['en', 'International innovation and entrepreneurship competition'],
    ['zh', '国际创新创业项目成果展示交流活动'],
  ] as const)('wraps a complete %s recent event within twenty columns', (language, title) => {
    setLanguage(language);
    try {
      const hubField = new ListField({ title: 'Events', options: [{ value: 'upcoming', label: 'Events' }] });
      const recentEvents = [{
        date: '10-01', time: '09:30', title, location: 'TBD', description: '',
        startDate: new Date('2026-10-01T09:30:00'), recurring: true, uid: 'long-event',
      }];
      const lines = renderEvents({
        mode: 'hub', hubField, heatmapBuckets: [], recentEvents,
      }, new Date('2026-09-30'), 12, 20);
      const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

      expect(lines.length).toBeLessThanOrEqual(12);
      expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
      expect(lines.every((line) => !line.includes('\n'))).toBe(true);
      expect(text).toContain('10-0109:30');
      expect(text).toContain(title.replace(/\s/g, ''));
      expect(text).toMatch(/[↻~]/u);
      expect(text).toContain('Events');
    } finally {
      setLanguage('en');
    }
  });

  it('omits a recent event rather than showing it partially above a short hub menu', () => {
    const title = 'International innovation and entrepreneurship competition';
    const hubField = new ListField({ title: 'Events', options: [{ value: 'upcoming', label: 'Events' }] });
    const recentEvents = [{
      date: '10-01', time: '09:30', title, location: 'TBD', description: '',
      startDate: new Date('2026-10-01T09:30:00'), recurring: true, uid: 'long-event',
    }];
    const lines = renderEvents({
      mode: 'hub', hubField, heatmapBuckets: [], recentEvents,
    }, new Date('2026-09-30'), 8, 20);
    const text = stripAnsi(lines.join('\n'));

    expect(lines.length).toBeLessThanOrEqual(8);
    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(text).not.toContain('International');
    expect(text).toContain('Events');
  });

  it('hub mode omits the recent-activity heading when there are no recent events', () => {
    const hubField = new ListField({ title: 'Events', options: [{ value: 'upcoming', label: 'Events' }] });
    const out = stripAnsi(renderEvents({ mode: 'hub', hubField, heatmapBuckets: [], recentEvents: [] }, new Date()).join('\n'));
    expect(out).not.toContain('Recent');
  });

  it('hub mode windows the menu against actual content height instead of overflowing', () => {
    // Regression: even without the heatmap, a full recent-activity
    // briefing (up to 5 events) plus a busy menu can still exceed a short
    // terminal's body budget — hubField never had maxVisible set at all,
    // so the menu (including items a student needs, like search/past
    // events) was silently cut off with no scroll indicator. Mirrors the
    // same fix already shipped for Schedule's hub.
    const manyOptions = Array.from({ length: 8 }, (_, i) => ({ value: String(i), label: `MenuOption${i}` }));
    const hubField = new ListField({ title: 'Events', options: manyOptions });
    const recentEvents = Array.from({ length: 5 }, (_, i) => ({
      date: `07-${17 + i}`, time: '20:30', title: `Event${i}`, location: 'TBD', description: '',
      startDate: new Date('2026-07-17T20:30:00'), recurring: false, uid: `e-${i}`,
    }));
    const out = stripAnsi(renderEvents({
      mode: 'hub', hubField, recentEvents,
    }, new Date('2026-07-15'), 12).join('\n'));
    const visibleCount = manyOptions.filter((o) => out.includes(o.label)).length;
    expect(visibleCount).toBeLessThan(manyOptions.length);
    expect(visibleCount).toBeGreaterThan(0);
  });

  it('keeps the hub action visible in a five-row body', () => {
    const hubField = new ListField({
      title: 'Events',
      options: Array.from({ length: 6 }, (_, i) => ({ value: String(i), label: `MenuOption${i}` })),
    });
    const recentEvents = [{
      date: '07-17', time: '20:30', title: 'NWDC', location: 'TBD', description: '',
      startDate: new Date('2026-07-17T20:30:00'), recurring: true, uid: 'nwdc-1',
    }];

    const lines = renderEvents({
      mode: 'hub', hubField, recentEvents,
      nextEvent: recentEvents[0],
    }, new Date('2026-07-15'), 5);
    const visible = stripAnsi(lines.slice(0, 5).join('\n'));

    expect(visible).toContain('MenuOption0');
  });

});

describe('renderEvents — adaptive hub density', () => {
  const heatmapBuckets = [{ date: '2026-07-14', count: 1 }, { date: '2026-07-15', count: 0 }];

  it('shows the heatmap inline on a tall terminal, with everything else still reachable', () => {
    const hubField = new ListField({ title: 'Events', options: [{ value: 'upcoming', label: 'Events' }] });
    const recentEvents = [{
      date: '07-17', time: '20:30', title: 'NWDC', location: 'TBD', description: '',
      startDate: new Date('2026-07-17T20:30:00'), recurring: true, uid: 'nwdc-1',
    }];
    const out = stripAnsi(renderEvents({
      mode: 'hub', hubField, heatmapBuckets, recentEvents,
    }, new Date('2026-07-15'), 45).join('\n'));
    expect(out).toContain('Activity (last 12 months)');
    expect(out).toContain('Less');
    expect(out).toContain('NWDC');
    expect(out).toContain('Events'); // the hub menu itself
  });

  it('stays compact (no inline heatmap) right below the threshold, matching the existing small-terminal behavior', () => {
    const hubField = new ListField({ title: 'Events', options: [{ value: 'upcoming', label: 'Events' }] });
    const out = stripAnsi(renderEvents({
      mode: 'hub', hubField, heatmapBuckets,
    }, new Date('2026-07-15'), 20).join('\n'));
    expect(out).not.toContain('Activity (last 12 months)');
  });

  it('never collapses a multi-line renderer output into one array entry, even in the expanded layout', () => {
    // Same regression class as the collapsed-heatmap bug fixed earlier in
    // this codebase's history — must hold in the new inline-heatmap path
    // too, not just the drill-down 'heatmap' mode.
    const hubField = new ListField({ title: 'Events', options: [{ value: 'upcoming', label: 'Events' }] });
    const lines = renderEvents({ mode: 'hub', hubField, heatmapBuckets }, new Date('2026-07-15'), 45);
    for (const line of lines) {
      expect(line).not.toContain('\n');
    }
  });

  it('shows only as many recent-activity events as fit, reserving room for the menu, on a normal terminal', () => {
    const hubField = new ListField({ title: 'Events', options: [{ value: 'upcoming', label: 'Events' }] });
    const recentEvents = Array.from({ length: 12 }, (_, i) => ({
      date: `07-${17 + i}`, time: '20:30', title: `Event${i}`, location: 'TBD', description: '',
      startDate: new Date('2026-07-17T20:30:00'), recurring: false, uid: `e-${i}`,
    }));
    const out = stripAnsi(renderEvents({ mode: 'hub', hubField, recentEvents }, new Date('2026-07-15'), 15).join('\n'));
    const visibleCount = recentEvents.filter((e) => out.includes(e.title)).length;
    expect(visibleCount).toBeLessThan(recentEvents.length);
    expect(visibleCount).toBeGreaterThan(0);
    expect(out).toContain('Events'); // hub menu still present, not starved out
  });

  it('shows more recent-activity events on a tall terminal', () => {
    const hubField = new ListField({ title: 'Events', options: [{ value: 'upcoming', label: 'Events' }] });
    const recentEvents = Array.from({ length: 12 }, (_, i) => ({
      date: `07-${17 + i}`, time: '20:30', title: `Event${i}`, location: 'TBD', description: '',
      startDate: new Date('2026-07-17T20:30:00'), recurring: false, uid: `e-${i}`,
    }));
    const out = stripAnsi(renderEvents({ mode: 'hub', hubField, recentEvents }, new Date('2026-07-15'), 45).join('\n'));
    for (const e of recentEvents) expect(out).toContain(e.title);
  });
});

describe('renderEvents — list/detail/search/error modes', () => {
  it('list mode shows the list field', () => {
    const listField = new ListField({ title: 'Events', options: [{ value: '0', label: 'Hackathon' }] });
    const out = stripAnsi(renderEvents({ mode: 'list', listField }, new Date()).join('\n'));
    expect(out).toContain('Hackathon');
  });

  it.each([
    ['Upcoming events', 'International innovation and entrepreneurship competition', 'Tomorrow'],
    ['近期活动', '国际创新创业项目成果展示交流活动', '明天'],
  ])('fits a complete list option within six rows and twenty columns', (title, label, hint) => {
    const listField = new ListField({
      title,
      options: [{ value: 'event', label, hint }],
    });
    const lines = renderEvents({ mode: 'list', listField }, new Date(), 6, 20);
    const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

    expect(lines.length).toBeLessThanOrEqual(6);
    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(text).toContain(label.replace(/\s/g, ''));
    expect(text).toContain(hint);
    expect(lines.filter((line) => /[→>]/u.test(stripAnsi(line)))).toHaveLength(1);
  });

  it('detail mode shows the event title and the action list', () => {
    const detailField = new ListField({ title: 'Hackathon', options: [{ value: 'export', label: 'Export .ics' }] });
    const out = stripAnsi(renderEvents({
      mode: 'detail', detailField,
      detailTitle: 'Hackathon', detailMeta: '03-25  ·  Main Hall', detailDescription: 'Bring a laptop.',
    }, new Date()).join('\n'));
    expect(out).toContain('Hackathon');
    expect(out).toContain('Bring a laptop.');
  });

  it.each([
    ['Actions', 'Export this event to an iCalendar file'],
    ['操作', '将这个活动导出为个人日历文件'],
  ])('fits a complete detail action within ten rows and twenty columns', (title, label) => {
    const detailField = new ListField({
      title,
      options: [{ value: 'export', label }],
    });
    const lines = renderEvents({
      mode: 'detail', detailField,
      detailTitle: 'Hackathon', detailMeta: '03-25', detailDescription: 'Bring a laptop.',
    }, new Date(), 10, 20);
    const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

    expect(lines.length).toBeLessThanOrEqual(10);
    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(text).toContain(label.replace(/\s/g, ''));
    expect(lines.filter((line) => /[→>]/u.test(stripAnsi(line)))).toHaveLength(1);
  });

  it.each([
    [
      'International innovation and entrepreneurship competition',
      '2026-10-01 09:30 · International Innovation Center',
      'Bring a laptop and prepare a complete project presentation for the review panel.',
      'The calendar file was exported successfully.',
    ],
    [
      '国际创新创业项目成果展示交流活动',
      '2026-10-01 09:30 · 国际创新中心报告厅',
      '请携带电脑并准备完整的项目成果展示材料供评审小组审阅。',
      '日历文件已经成功导出到下载目录。',
    ],
  ])('wraps complete detail context within twenty columns', (title, meta, description, status) => {
    const detailField = new ListField({ title: 'Actions', options: [{ value: 'back', label: 'Back' }] });
    const lines = renderEvents({
      mode: 'detail', detailField,
      detailTitle: title, detailMeta: meta, detailDescription: description, statusMessage: status,
    }, new Date(), 40, 20);
    const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

    expect(lines.length).toBeLessThanOrEqual(40);
    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    for (const value of [title, meta, description, status]) {
      expect(text).toContain(value.replace(/\s/g, ''));
    }
    expect(text).toContain('Back');
  });

  it('keeps the detail action reachable when wrapped context exceeds a twelve-row body', () => {
    const detailField = new ListField({ title: 'Actions', options: [{ value: 'back', label: 'Back' }] });
    const lines = renderEvents({
      mode: 'detail', detailField,
      detailTitle: 'International innovation and entrepreneurship competition',
      detailMeta: '2026-10-01 09:30 · International Innovation Center',
      detailDescription: 'Bring a laptop and prepare a complete project presentation for the review panel.',
      statusMessage: 'The calendar file was exported successfully.',
    }, new Date(), 12, 20);

    expect(lines.length).toBeLessThanOrEqual(12);
    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(stripAnsi(lines.join('\n'))).toContain('Back');
  });

  it('heatmap mode shows the full-year grid, split into one array entry per row', () => {
    // Regression guard matching the multi-line-collapse pattern already
    // fixed elsewhere in this codebase: renderHeatmap() returns one
    // '\n'-joined string, and this call site must split it before pushing.
    const heatmapBuckets = [{ date: '2026-07-14', count: 1 }, { date: '2026-07-15', count: 0 }];
    const lines = renderEvents({ mode: 'heatmap', heatmapBuckets }, new Date('2026-07-15'));
    for (const line of lines) {
      expect(line).not.toContain('\n');
    }
    expect(lines.length).toBeGreaterThan(10);
    expect(stripAnsi(lines.join('\n'))).toContain('Activity (last 12 months)');
  });

  it('passes the terminal width through to heatmap rendering', () => {
    const heatmapBuckets = [{ date: '2026-07-14', count: 1 }];
    const lines = renderEvents({ mode: 'heatmap', heatmapBuckets }, new Date('2026-07-15'), 19, 40);
    expect(lines.every((line) => visualWidth(stripAnsi(line)) <= 40)).toBe(true);
  });

  it('search mode renders the text field', () => {
    const searchField = new TextField({ message: 'Search events' });
    const out = stripAnsi(renderEvents({ mode: 'search', searchField }, new Date()).join('\n'));
    expect(out).toContain('Search events');
  });

  it.each([
    ['Search events by title', 'international-entrepreneurship-competition'],
    ['按活动标题搜索', '国际创新创业项目成果展示交流活动'],
  ])('fits a complete events search query within twenty columns', (message, query) => {
    const searchField = new TextField({ message });
    searchField.handleKey(query);
    const lines = renderEvents({ mode: 'search', searchField }, new Date(), 5, 20);
    const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(text).toContain(message.replace(/\s/g, ''));
    expect(text).toContain(query);
    expect(lines.filter((line) => /[→>]/u.test(stripAnsi(line)))).toHaveLength(1);
  });

  it('error mode shows the error message', () => {
    const out = stripAnsi(renderEvents({ mode: 'error', errorMessage: 'Broke' }, new Date()).join('\n'));
    expect(out).toContain('Broke');
  });

  it.each([
    'The calendar service returned an unexpected network authentication error',
    '日历服务暂时无法完成网络身份验证请稍后重试',
  ])('wraps a complete error message within twenty columns', (message) => {
    const lines = renderEvents({ mode: 'error', errorMessage: message }, new Date(), 6, 20);
    const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

    expect(lines.length).toBeLessThanOrEqual(6);
    expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
    expect(text).toBe(message.replace(/\s/g, ''));
  });
});
