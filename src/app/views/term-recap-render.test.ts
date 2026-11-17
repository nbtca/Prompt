import { describe, it, expect, beforeEach } from 'vitest';
import { recapCards, renderRecapCard } from './term-recap-render.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi } from '../../core/text.js';
import type { TermRecap } from '../../features/term-recap.js';

const recap: TermRecap = {
  finished: true,
  progress: 1,
  classes: 248,
  hours: 186.5,
  courses: 11,
  weeks: 16,
  earlyClasses: 0,
  busiestDay: { date: '2026-11-04', classes: 6, from: '08:00', to: '21:15' },
  topCourse: { name: 'Calculus', hours: 48.4 },
  events: 0,
};

beforeEach(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

describe('recapCards', () => {
  it('skips cards without data and ends with a farewell', () => {
    const cards = recapCards(recap);
    expect(cards.map((card) => card.value)).toEqual([248, 0, 6, 48, undefined]);
    expect(cards[1]?.detail).toMatch(/No early classes/);
    expect(cards[2]?.lead).toBe('Your fullest day was November 4, with');
    expect(cards.at(-1)?.lead).toMatch(/See you next term/);
  });
});

describe('renderRecapCard', () => {
  it('counts the number up and lands on the exact value', () => {
    const cards = recapCards(recap);
    const start = stripAnsi(renderRecapCard(cards, 0, 'Term recap', 0, 80).join('\n'));
    const end = stripAnsi(renderRecapCard(cards, 0, 'Term recap', Infinity, 80).join('\n'));
    expect(start).toContain('█▀█');
    expect(end).toContain('classes');
    expect(end).toContain('186.5 hours across 11 courses and 16 teaching weeks.');
    expect(end).toContain('● ○ ○ ○ ○');
    expect(end).not.toBe(start);
  });

  it('falls back to a plain number when the big digits do not fit', () => {
    const lines = renderRecapCard(recapCards(recap), 0, 'Term recap', Infinity, 16).map(stripAnsi);
    expect(lines).toContain('   248  classes');
  });
});
