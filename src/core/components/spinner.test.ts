import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderSpinnerFrame, startSpinner, spinnerFrame, loadingLines } from './spinner.js';
import { stripAnsi, visualWidth } from '../text.js';
import { resetIconCache } from '../icons.js';

describe('spinner', () => {
  beforeEach(() => {
    process.env['NBTCA_ICON_MODE'] = 'ascii';
    resetIconCache();
  });
  afterEach(() => {
    process.env['NBTCA_ICON_MODE'] = 'unicode';
    resetIconCache();
  });

  it('renderSpinnerFrame places frame then message', () => {
    const out = stripAnsi(renderSpinnerFrame('|', 'loading'));
    expect(out).toBe('   | loading');
  });

  it('spinnerFrame holds one frame when motion is reduced', () => {
    expect(spinnerFrame(0)).toBe(spinnerFrame(10 * 80));
  });

  it('loadingLines keeps the spinner and the message on one line when it fits', () => {
    const [line, ...rest] = loadingLines('loading', 40, 0);
    expect(rest).toEqual([]);
    expect(stripAnsi(line ?? '')).toBe(`   ${spinnerFrame(0)} loading`);
  });

  it('loadingLines drops the spinner rather than stranding it on its own line', () => {
    const lines = loadingLines('a fairly long loading message', 20, 0);
    expect(lines.length).toBeGreaterThan(1);
    expect(stripAnsi(lines[0] ?? '')).not.toContain(spinnerFrame(0));
    for (const line of lines) expect(visualWidth(line)).toBeLessThanOrEqual(20);
  });

  it('reduced-motion: start writes nothing, stop writes a success line', () => {
    const out: string[] = [];
    const s = startSpinner('working', { reducedMotion: true, write: (x) => out.push(x) });
    expect(out).toEqual([]); // no animation frames on start
    s.stop('finished');
    expect(stripAnsi(out.join(''))).toContain('+ finished');
  });

  it('reduced-motion: error writes an error line', () => {
    const out: string[] = [];
    const s = startSpinner('working', { reducedMotion: true, write: (x) => out.push(x) });
    s.error('failed');
    expect(stripAnsi(out.join(''))).toContain('x failed');
  });

  it('reduced-motion: stop with no message writes nothing', () => {
    const out: string[] = [];
    const s = startSpinner('working', { reducedMotion: true, write: (x) => out.push(x) });
    s.stop();
    expect(out.join('')).toBe('');
  });
});
