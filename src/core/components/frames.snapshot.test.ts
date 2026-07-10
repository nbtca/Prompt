import { describe, it, expect, beforeAll } from 'vitest';
import { renderMenu } from './menu.js';
import { renderScreen } from './screen.js';
import { stripAnsi } from '../text.js';
import { resetIconCache } from '../icons.js';

beforeAll(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });

describe('frame snapshots (ascii, no-color)', () => {
  it('main menu frame', () => {
    const frame = stripAnsi(renderMenu({
      title: 'nbtca',
      selectedIndex: 0,
      options: [
        { value: 'events', label: 'Events', hint: '3 upcoming' },
        { value: 'docs', label: 'Docs', hint: 'Knowledge base' },
      ],
      footer: 'up/down move   enter open   q quit',
    }));
    expect(frame).toMatchInlineSnapshot(`
      "   nbtca

         > Events  3 upcoming
           Docs    Knowledge base

         up/down move   enter open   q quit"
    `);
  });

  it('screen frame', () => {
    const frame = stripAnsi(renderScreen({ title: 'nbtca > Status', body: '  body line', footer: 'q back', width: 20 }));
    expect(frame).toMatchInlineSnapshot(`
      "   nbtca > Status
         --------------------
        body line

         q back"
    `);
  });
});
