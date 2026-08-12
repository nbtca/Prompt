import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { ansi } from '../core/canvas.js';

const homeLoad = vi.hoisted(() => vi.fn());
const dispose = vi.hoisted(() => vi.fn());

vi.mock('./tabs.js', () => ({
  getAppTabs: () => [{ id: 'home', title: 'Home' }],
}));

vi.mock('./views/home.js', () => ({
  homeView: {
    id: 'home',
    title: 'Home',
    load: homeLoad,
    render: () => ['Home'],
    dispose,
  },
}));

vi.mock('./views/schedule.js', () => ({
  scheduleView: { id: 'schedule', title: 'Schedule', render: () => [], dispose },
}));

vi.mock('./views/docs.js', () => ({
  docsView: { id: 'docs', title: 'Docs', render: () => [], dispose },
}));

vi.mock('./views/events.js', () => ({
  eventsView: { id: 'events', title: 'Events', render: () => [], dispose },
}));

vi.mock('./views/settings.js', () => ({
  settingsView: { id: 'settings', title: 'Settings', render: () => [], dispose },
}));

const { runApp } = await import('./app.js');

describe('runApp terminal lifecycle', () => {
  const originalStdinTty = process.stdin.isTTY;
  const originalStdoutTty = process.stdout.isTTY;
  const originalSetRawMode = Object.getOwnPropertyDescriptor(process.stdin, 'setRawMode');
  const originalExitCode = process.exitCode;
  let stdoutWrite: MockInstance<typeof process.stdout.write>;
  let stdinResume: MockInstance<typeof process.stdin.resume>;
  let stdinPause: MockInstance<typeof process.stdin.pause>;
  let setRawMode: ReturnType<typeof vi.fn>;
  let signal: AbortSignal | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    signal = undefined;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    setRawMode = vi.fn();
    Object.defineProperty(process.stdin, 'setRawMode', {
      value: setRawMode,
      configurable: true,
    });
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stdinResume = vi.spyOn(process.stdin, 'resume').mockImplementation(() => process.stdin);
    stdinPause = vi.spyOn(process.stdin, 'pause').mockImplementation(() => process.stdin);
    homeLoad.mockImplementation(
      (ctx: { signal?: AbortSignal }) =>
        new Promise<void>((resolve) => {
          signal = ctx.signal;
          if (signal?.aborted) resolve();
          else
            signal?.addEventListener(
              'abort',
              () => {
                resolve();
              },
              { once: true },
            );
        }),
    );
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
    stdinResume.mockRestore();
    stdinPause.mockRestore();
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalStdinTty,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalStdoutTty,
      configurable: true,
    });
    if (originalSetRawMode) Object.defineProperty(process.stdin, 'setRawMode', originalSetRawMode);
    else Reflect.deleteProperty(process.stdin, 'setRawMode');
    process.exitCode = originalExitCode;
  });

  function writtenOutput(): string {
    return stdoutWrite.mock.calls.map(([value]) => String(value)).join('');
  }

  it('aborts pending view loads and restores the terminal when q quits', async () => {
    const running = runApp();

    process.stdin.emit('data', Buffer.from('q'));
    await running;

    expect(signal?.aborted).toBe(true);
    expect(setRawMode.mock.calls).toEqual([[true], [false]]);
    expect(writtenOutput().split(ansi.leaveAlt)).toHaveLength(2);
    expect(writtenOutput()).toContain(ansi.showCursor + ansi.leaveAlt);
    expect(process.exitCode).toBe(originalExitCode);
  });

  it.each([
    ['raw Ctrl-C', () => process.stdin.emit('data', Buffer.from('\x03'))],
    ['SIGINT', () => process.emit('SIGINT')],
  ] as const)('exits with signal status on %s', async (_label, stop) => {
    const running = runApp();

    stop();
    await running;

    expect(signal?.aborted).toBe(true);
    expect(process.exitCode).toBe(130);
    expect(setRawMode.mock.calls).toEqual([[true], [false]]);
    expect(writtenOutput().split(ansi.leaveAlt)).toHaveLength(2);
  });

  it.each([
    ['SIGTERM', 143],
    ['SIGHUP', 129],
  ] as const)('restores the terminal exactly once on %s', async (terminationSignal, exitCode) => {
    const running = runApp();

    process.emit(terminationSignal);
    await running;

    expect(signal?.aborted).toBe(true);
    expect(process.exitCode).toBe(exitCode);
    expect(setRawMode.mock.calls).toEqual([[true], [false]]);
    expect(writtenOutput().split(ansi.leaveAlt)).toHaveLength(2);
  });
});
