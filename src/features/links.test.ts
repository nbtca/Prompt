import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChildProcess } from 'node:child_process';
import open from 'open';
import { setLanguage } from '../i18n/index.js';
import { launchBrowserUrl, openUrlInBrowser } from './links.js';

vi.mock('open', () => ({ default: vi.fn() }));

beforeEach(() => {
  setLanguage('en');
});

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(open).mockReset();
  vi.restoreAllMocks();
});

function launcherWithExitCode(exitCode: number): ChildProcess {
  const child = new ChildProcess();
  Object.defineProperty(child, 'exitCode', { value: exitCode, configurable: true });
  return child;
}

async function startLaunch(child: ChildProcess): Promise<{ result: Promise<boolean> }> {
  vi.mocked(open).mockResolvedValueOnce(child);
  const result = launchBrowserUrl('https://nbtca.space');
  await Promise.resolve();
  return { result };
}

describe('launchBrowserUrl', () => {
  it('accepts a launcher that closes successfully', async () => {
    const child = new ChildProcess();
    const { result } = await startLaunch(child);

    child.emit('close', 0, null);

    await expect(result).resolves.toBe(true);
    expect(child.listenerCount('close')).toBe(0);
    expect(child.listenerCount('error')).toBe(0);
  });

  it('rejects a launcher that closes with a nonzero code', async () => {
    const child = new ChildProcess();
    const { result } = await startLaunch(child);

    child.emit('close', 3, null);

    await expect(result).resolves.toBe(false);
    expect(child.listenerCount('close')).toBe(0);
    expect(child.listenerCount('error')).toBe(0);
  });

  it('rejects a launcher error', async () => {
    const child = new ChildProcess();
    const { result } = await startLaunch(child);

    child.emit('error', new Error('launcher failed'));

    await expect(result).resolves.toBe(false);
    expect(child.listenerCount('close')).toBe(0);
    expect(child.listenerCount('error')).toBe(0);
  });

  it('accepts a launcher that remains active past the settle window', async () => {
    vi.useFakeTimers();
    const child = new ChildProcess();
    const { result } = await startLaunch(child);

    await vi.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toBe(true);
    expect(child.listenerCount('close')).toBe(0);
    expect(child.listenerCount('error')).toBe(0);
  });

  it('uses an exit code already available when open resolves', async () => {
    vi.mocked(open).mockResolvedValueOnce(launcherWithExitCode(4));

    await expect(launchBrowserUrl('https://nbtca.space')).resolves.toBe(false);
  });
});

describe('openUrlInBrowser', () => {
  it('returns true when the browser command starts', async () => {
    vi.mocked(open).mockResolvedValueOnce(launcherWithExitCode(0));

    await expect(openUrlInBrowser('https://nbtca.space')).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith('https://nbtca.space');
  });

  it('prints the exact manual URL when the browser command fails', async () => {
    vi.mocked(open).mockRejectedValueOnce(new Error('no browser'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(openUrlInBrowser('https://nbtca.space/repair')).resolves.toBe(false);
    expect(error.mock.calls.flat().join('\n')).toContain('Failed to open browser');
    expect(error.mock.calls.flat().join('\n')).toContain('https://nbtca.space/repair');
  });
});
