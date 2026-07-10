import { describe, it, expect, beforeEach } from 'vitest';
import { renderSpinnerFrame, startSpinner } from './spinner.js';
import { stripAnsi } from '../text.js';
import { resetIconCache } from '../icons.js';

describe('spinner', () => {
  beforeEach(() => { process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache(); });
  const done = () => { process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache(); };

  it('renderSpinnerFrame places frame then message', () => {
    const out = stripAnsi(renderSpinnerFrame('|', 'loading'));
    expect(out).toBe('   | loading');
    done();
  });

  it('reduced-motion: start writes nothing, stop writes a success line', () => {
    const out: string[] = [];
    const s = startSpinner('working', { reducedMotion: true, write: (x) => out.push(x) });
    expect(out).toEqual([]);                       // no animation frames on start
    s.stop('finished');
    expect(stripAnsi(out.join(''))).toContain('+ finished');
    done();
  });

  it('reduced-motion: error writes an error line', () => {
    const out: string[] = [];
    const s = startSpinner('working', { reducedMotion: true, write: (x) => out.push(x) });
    s.error('failed');
    expect(stripAnsi(out.join(''))).toContain('x failed');
    done();
  });

  it('reduced-motion: stop with no message writes nothing', () => {
    const out: string[] = [];
    const s = startSpinner('working', { reducedMotion: true, write: (x) => out.push(x) });
    s.stop();
    expect(out.join('')).toBe('');
    done();
  });
});
