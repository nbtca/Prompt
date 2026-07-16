import { describe, it, expect, beforeAll } from 'vitest';
import { renderHome } from './home.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi } from '../../core/text.js';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

const noon = new Date('2026-07-15T12:00:00');

describe('renderHome (schedule-first dashboard)', () => {
  it('shows next class, today classes, and upcoming events', () => {
    const out = stripAnsi(renderHome({
      nextClassLine: '  Next class in 2h',
      todayLines: ['  08:00 Math', '  10:00 Physics'],
      eventLines: ['  03-25 Hackathon', '  03-28 Study group'],
      loading: false,
    }, noon).join('\n'));
    expect(out).toContain('Next class in 2h');
    expect(out).toContain('08:00 Math');
    expect(out).toContain('Hackathon');
  });

  it('falls back to "no class today" and "no upcoming class" when schedule is empty', () => {
    const out = stripAnsi(renderHome({ nextClassLine: '', todayLines: [], eventLines: [], loading: false }, noon).join('\n'));
    expect(out).toContain('No classes today');
    expect(out).toContain('No upcoming classes');
  });

  it('shows a loading state for events before they land', () => {
    const out = stripAnsi(renderHome({ loading: true }, noon).join('\n'));
    expect(out).toContain('Loading');
  });

  it('always returns a non-empty array', () => {
    const out = renderHome({}, noon);
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });

  it('shows real "no upcoming events" copy when the fetch succeeded but returned nothing, not a bare glyph', () => {
    // Regression: this used to render a lone "-" with no words at all —
    // every other empty state in the app (and every other panel on this
    // same screen) uses actual translated copy.
    const out = stripAnsi(renderHome({ eventLines: [], loading: false }, noon).join('\n'));
    expect(out).toContain('No upcoming events');
  });

  it('shows an error state when the events fetch failed, distinct from "no events"', () => {
    // Regression: Events/Docs/Schedule all show a real error line on fetch
    // failure; Home silently fell back to the same empty-state placeholder
    // used for "genuinely nothing happening," so a network failure and a
    // quiet week looked identical.
    const out = stripAnsi(renderHome({ eventsError: true, loading: false }, noon).join('\n'));
    expect(out).toContain('Failed to load event calendar');
    expect(out).not.toContain('No upcoming events');
  });
});

describe('renderHome adaptive event count', () => {
  const manyEventLines = Array.from({ length: 12 }, (_, i) => `  07-${17 + i}  Event ${i}`);

  it('shows only as many events as fit on a normal-size terminal', () => {
    const out = stripAnsi(renderHome({
      nextClassLine: '', todayLines: [], eventLines: manyEventLines, loading: false,
    }, noon, 12).join('\n'));
    const visibleCount = manyEventLines.filter((l) => out.includes(l.trim())).length;
    expect(visibleCount).toBeLessThan(manyEventLines.length);
    expect(visibleCount).toBeGreaterThan(0);
  });

  it('shows more events on a tall terminal, up to everything available', () => {
    const out = stripAnsi(renderHome({
      nextClassLine: '', todayLines: [], eventLines: manyEventLines, loading: false,
    }, noon, 50).join('\n'));
    for (const l of manyEventLines) expect(out).toContain(l.trim());
  });
});

describe('renderHome day-progress bar', () => {
  it('shows a half-filled bar and 50% at noon', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    resetIconCache();
    const out = stripAnsi(renderHome({}, noon).join('\n'));
    expect(out).toContain('##########----------'); // 20-wide bar, half filled
    expect(out).toContain('50%');
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
  });

  it('is empty at midnight and full just before it', () => {
    const out = stripAnsi(renderHome({}, new Date('2026-07-15T00:00:00')).join('\n'));
    expect(out).toContain('0%');
    const lateOut = stripAnsi(renderHome({}, new Date('2026-07-15T23:59:00')).join('\n'));
    expect(lateOut).toContain('100%');
  });
});

describe('renderHome — week overview panel (Part D)', () => {
  it('does not show the week overview panel at all when weekAhead is absent', () => {
    const out = stripAnsi(renderHome({ loading: false }, noon).join('\n'));
    expect(out).not.toContain('Week overview');
  });

  it('shows the panel with class/event row labels and a legend when weekAhead data is present', () => {
    const lines = renderHome({
      loading: false,
      weekAhead: { classDays: [true, false, true, false, false, false, false], eventDays: [false, true, false, false, true, false, false] },
    }, noon).map((l) => stripAnsi(l));
    const titleIdx = lines.findIndex((l) => l.includes('Week overview'));
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(lines[titleIdx + 2]).toContain('Classes');
    expect(lines[titleIdx + 3]).toContain('Events');
    expect(lines[titleIdx + 4]).toContain('Busy');
    expect(lines[titleIdx + 4]).toContain('Free');
    expect(lines[titleIdx + 4]).toContain('N/A');
  });

  it('hardcodes weekend cells on the class row regardless of classDays data', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    try {
      const lines = renderHome({
        loading: false,
        // classDays[5]/[6] (Sat/Sun) are true on purpose -- the render
        // layer must still show them as weekend/N-A, not "busy".
        weekAhead: { classDays: [false, false, false, false, false, true, true] },
      }, noon).map((l) => stripAnsi(l));
      const titleIdx = lines.findIndex((l) => l.includes('Week overview'));
      const classCells = lines[titleIdx + 2]!.trim().split(/\s+/).slice(1);
      expect(classCells[5]).toBe('··');
      expect(classCells[6]).toBe('··');
    } finally {
      process.env['NBTCA_ICON_MODE'] = 'ascii';
      resetIconCache();
    }
  });

  it('does NOT hardcode weekend cells on the event row -- a real weekend event shows as busy', () => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    try {
      const lines = renderHome({
        loading: false,
        weekAhead: {
          classDays: [false, false, false, false, false, false, false],
          eventDays: [false, false, false, false, false, true, false], // Saturday has an event
        },
      }, noon).map((l) => stripAnsi(l));
      const titleIdx = lines.findIndex((l) => l.includes('Week overview'));
      const eventCells = lines[titleIdx + 3]!.trim().split(/\s+/).slice(1);
      expect(eventCells[5]).toBe('▓▓'); // Saturday: busy, not weekend/N-A
      expect(eventCells[6]).toBe('░░'); // Sunday: free, not weekend/N-A
    } finally {
      process.env['NBTCA_ICON_MODE'] = 'ascii';
      resetIconCache();
    }
  });

  it('renders the event row with no glyphs at all when eventDays is not yet known', () => {
    const lines = renderHome({
      loading: false,
      weekAhead: { classDays: [true, false, false, false, false, false, false] }, // no eventDays
    }, noon).map((l) => stripAnsi(l));
    const titleIdx = lines.findIndex((l) => l.includes('Week overview'));
    const eventLine = lines[titleIdx + 3]!;
    expect(eventLine).not.toMatch(/[▓░]/);
  });

  it('never collapses the grid into one array entry', () => {
    const lines = renderHome({
      loading: false,
      weekAhead: { classDays: [true, false, false, false, false, false, false], eventDays: [false, true, false, false, false, false, false] },
    }, noon);
    for (const l of lines) expect(l).not.toContain('\n');
  });
});

describe('renderHome — unresolved items warning (Part E)', () => {
  it('does not show a warning line when unresolvedCount is 0 or absent', () => {
    const out = stripAnsi(renderHome({ loading: false }, noon).join('\n'));
    expect(out).not.toContain('Needs attention');
  });

  it('shows a warning line with the real count when unresolvedCount > 0', () => {
    const out = stripAnsi(renderHome({ loading: false, unresolvedCount: 3 }, noon).join('\n'));
    expect(out).toContain('Needs attention');
    expect(out).toContain('3');
  });

  it('places the warning after Today/Week overview and before Events', () => {
    const lines = renderHome({
      loading: false, unresolvedCount: 1,
      weekAhead: { classDays: [false, false, false, false, false, false, false] },
    }, noon).map((l) => stripAnsi(l));
    const todayIdx = lines.findIndex((l) => l.includes('Today'));
    const weekIdx = lines.findIndex((l) => l.includes('Week overview'));
    const warnIdx = lines.findIndex((l) => l.includes('Needs attention'));
    expect(warnIdx).toBeGreaterThan(todayIdx);
    expect(warnIdx).toBeGreaterThan(weekIdx);
  });
});
