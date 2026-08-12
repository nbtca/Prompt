import { describe, it, expect } from 'vitest';
import { parseKey, nextIndex, renderMenu, runMenu } from './menu.js';
import { stripAnsi, visualWidth } from '../text.js';
import { resetIconCache } from '../icons.js';

describe('parseKey', () => {
  it('maps arrow sequences', () => {
    expect(parseKey('\x1b[A')).toBe('up');
    expect(parseKey('\x1b[B')).toBe('down');
    expect(parseKey('\x1b[H')).toBe('home');
    expect(parseKey('\x1b[F')).toBe('end');
  });
  it('maps paging and common home/end sequences', () => {
    expect(parseKey('\x1b[5~')).toBe('pageUp');
    expect(parseKey('\x1b[6~')).toBe('pageDown');
    expect(parseKey('\x1b[1~')).toBe('home');
    expect(parseKey('\x1bOF')).toBe('end');
  });
  it('maps enter (CR and LF)', () => {
    expect(parseKey('\r')).toBe('enter');
    expect(parseKey('\n')).toBe('enter');
  });
  it('maps ctrl-c and bare esc to cancel', () => {
    expect(parseKey('\x03')).toBe('cancel');
    expect(parseKey('\x1b')).toBe('cancel');
  });
  it('unknown input is none', () => {
    expect(parseKey('x')).toBe('none');
  });
  it('accepts a Buffer', () => {
    expect(parseKey(Buffer.from('\x1b[B'))).toBe('down');
  });
});

describe('nextIndex', () => {
  it('down wraps from last to first', () => {
    expect(nextIndex(2, 'down', 3)).toBe(0);
  });
  it('up wraps from first to last', () => {
    expect(nextIndex(0, 'up', 3)).toBe(2);
  });
  it('home and end jump to bounds', () => {
    expect(nextIndex(1, 'home', 3)).toBe(0);
    expect(nextIndex(1, 'end', 3)).toBe(2);
  });
  it('page keys move by a bounded viewport-sized step', () => {
    expect(nextIndex(8, 'pageUp', 20, 4)).toBe(4);
    expect(nextIndex(8, 'pageDown', 20, 4)).toBe(12);
    expect(nextIndex(18, 'pageDown', 20, 4)).toBe(19);
  });
  it('none keeps current', () => {
    expect(nextIndex(1, 'none', 3)).toBe(1);
  });
  it('empty list stays at 0', () => {
    expect(nextIndex(0, 'down', 0)).toBe(0);
  });
});

describe('renderMenu', () => {
  const state = {
    title: 'nbtca',
    options: [
      { value: 'events', label: 'Events', hint: '3 upcoming' },
      { value: 'docs', label: 'Docs', hint: 'wiki' },
    ],
    selectedIndex: 0,
    footer: 'up/down move',
  };

  function plain(): string[] {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    resetIconCache();
    const out = stripAnsi(renderMenu(state)).split('\n');
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
    return out;
  }

  it('marks the selected option with the cursor glyph', () => {
    const lines = plain();
    const eventsLine = lines.find((l) => l.includes('Events'));
    const docsLine = lines.find((l) => l.includes('Docs'));
    expect(eventsLine).toContain('>');
    expect(docsLine).not.toContain('>');
  });

  it('includes the title and the footer', () => {
    const lines = plain();
    expect(lines[0]).toContain('nbtca');
    expect(lines[lines.length - 1]).toContain('up/down move');
  });

  it('renders hints for each option', () => {
    const lines = plain();
    expect(lines.some((l) => l.includes('3 upcoming'))).toBe(true);
    expect(lines.some((l) => l.includes('wiki'))).toBe(true);
  });

  it.each(['Log in to see my timetable', '登录查看我的完整个人课表'])(
    'wraps a complete selected option at twenty columns',
    (label) => {
      process.env['NBTCA_ICON_MODE'] = 'ascii';
      resetIconCache();
      try {
        const lines = renderMenu(
          {
            title: 'Schedule',
            options: [{ value: 'login', label }],
            selectedIndex: 0,
          },
          20,
        ).split('\n');
        const text = lines.map(stripAnsi).join('').replace(/\s/g, '');

        expect(lines.every((line) => visualWidth(line) <= 20)).toBe(true);
        expect(text).toContain(label.replace(/\s/g, ''));
        expect(lines.filter((line) => stripAnsi(line).includes('>'))).toHaveLength(1);
      } finally {
        process.env['NBTCA_ICON_MODE'] = 'unicode';
        resetIconCache();
      }
    },
  );
});

describe('runMenu', () => {
  it('resolves null when not attached to a TTY (vitest)', async () => {
    const result = await runMenu({
      title: 'nbtca',
      options: [{ value: 'events', label: 'Events' }],
    });
    expect(result).toBeNull();
  });
});
