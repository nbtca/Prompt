import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { checkServices, renderServiceStatusTable, type ServiceStatus } from './status.js';
import { setLanguage } from '../i18n/index.js';
import { resetIconCache } from '../core/icons.js';
import { stripAnsi } from '../core/text.js';

async function settleWithin<T>(promise: Promise<T>, timeoutMs = 100): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Promise did not settle within ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('renderServiceStatusTable pending state', () => {
  it('renders a pending marker for a not-yet-resolved service and keeps resolved rows', () => {
    const items: ServiceStatus[] = [
      { name: 'Homepage', url: 'x', ok: true, latencyMs: 42, group: 'nbtca' },
      { name: 'Docs', url: 'y', ok: false, group: 'nbtca', pending: true },
    ];
    const out = stripAnsi(renderServiceStatusTable(items, { color: false }));
    expect(out).toContain('Homepage');
    expect(out).toContain('42ms');
    expect(out).toContain('Docs');
    expect(out).toContain('…'); // pending glyph (unicode)
  });

  it('output for fully-resolved items is unchanged by the pending feature', () => {
    const items: ServiceStatus[] = [
      { name: 'Homepage', url: 'x', ok: true, latencyMs: 42, group: 'nbtca' },
    ];
    const out = stripAnsi(renderServiceStatusTable(items, { color: false }));
    expect(out).not.toContain('…');
  });
});

describe('checkServices', () => {
  it('cancels response bodies after reading status headers', async () => {
    const cancelSpies: ReturnType<typeof vi.spyOn>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => {
        const response = new Response('unused');
        if (response.body) cancelSpies.push(vi.spyOn(response.body, 'cancel'));
        return Promise.resolve(response);
      }),
    );

    const result = await checkServices({ timeoutMs: 100, retries: 0 });

    expect(result).toHaveLength(8);
    expect(cancelSpies).toHaveLength(8);
    for (const cancel of cancelSpies) expect(cancel).toHaveBeenCalledOnce();
  });

  it('sanitizes network error messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.reject(new Error('offline\nforged\u001B[2J'))),
    );

    const result = await checkServices({ timeoutMs: 100, retries: 0 });

    expect(result.every((item) => item.error === 'offline forged')).toBe(true);
  });

  it('propagates caller cancellation without retrying aborted requests', async () => {
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const rejectAbort = () => {
          const reason: unknown = signal?.reason;
          reject(reason instanceof Error ? reason : new DOMException('Aborted', 'AbortError'));
        };
        if (signal?.aborted) rejectAbort();
        else signal?.addEventListener('abort', rejectAbort, { once: true });
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const caller = new AbortController();
    const request = checkServices({ timeoutMs: 20, retries: 5, signal: caller.signal });

    expect(fetchMock).toHaveBeenCalledTimes(8);
    caller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it('rejects caller cancellation when fetch ignores the signal and resolves afterward', async () => {
    const resolveResponses: ((response: Response) => void)[] = [];
    const fetchMock = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponses.push(resolve);
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const caller = new AbortController();
    const request = checkServices({ timeoutMs: 100, retries: 5, signal: caller.signal });

    expect(fetchMock).toHaveBeenCalledTimes(8);
    caller.abort();
    for (const resolve of resolveResponses) resolve(new Response(null, { status: 200 }));

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it('rejects caller cancellation when fetch ignores the signal forever', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>(() => {
          // Intentionally ignore both the request and its AbortSignal.
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const caller = new AbortController();
    const request = checkServices({ timeoutMs: 100, retries: 5, signal: caller.signal });

    expect(fetchMock).toHaveBeenCalledTimes(8);
    caller.abort();

    await expect(settleWithin(request)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it('times out ignored requests, cleans race listeners, and preserves retries', async () => {
    const listenerSpies: {
      add: ReturnType<typeof vi.spyOn>;
      remove: ReturnType<typeof vi.spyOn>;
    }[] = [];
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      if (!init?.signal) throw new Error('Expected a request signal');
      listenerSpies.push({
        add: vi.spyOn(init.signal, 'addEventListener'),
        remove: vi.spyOn(init.signal, 'removeEventListener'),
      });
      return new Promise<Response>(() => {
        // Intentionally ignore both the request and its AbortSignal.
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await settleWithin(checkServices({ timeoutMs: 5, retries: 1 }), 200);

    expect(result.every((item) => !item.ok && item.error === 'Request timed out')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(16);
    expect(listenerSpies).toHaveLength(16);
    for (const { add, remove } of listenerSpies) {
      expect(add).toHaveBeenCalledOnce();
      expect(remove).toHaveBeenCalledOnce();
    }
  });

  it('treats a successful response that arrives after the timeout as timed out', async () => {
    const cancelSpies: ReturnType<typeof vi.spyOn>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        () =>
          new Promise<Response>((resolve) => {
            setTimeout(() => {
              const response = new Response('late', { status: 200 });
              if (response.body) cancelSpies.push(vi.spyOn(response.body, 'cancel'));
              resolve(response);
            }, 30);
          }),
      ),
    );

    const result = await checkServices({ timeoutMs: 5, retries: 0 });

    expect(result).toHaveLength(8);
    expect(result.every((item) => !item.ok && item.error === 'Request timed out')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(cancelSpies).toHaveLength(8);
    for (const cancel of cancelSpies) expect(cancel).toHaveBeenCalledOnce();
  });

  it('does not block status results on response body cancellation', async () => {
    const cancel = vi.fn<() => Promise<void>>(
      () =>
        new Promise<void>(() => {
          // Intentionally model cleanup that never settles.
        }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              cancel,
            }),
          ),
        ),
      ),
    );

    const result = await settleWithin(checkServices({ timeoutMs: 100, retries: 0 }));

    expect(result).toHaveLength(8);
    expect(result.every((item) => item.ok)).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(8);
  });

  it('does not let an inaccessible response body override a successful status', async () => {
    const response = new Response(null, { status: 204 });
    Object.defineProperty(response, 'body', {
      configurable: true,
      get: () => {
        throw new Error('body getter exploded');
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.resolve(response)),
    );

    const result = await checkServices({ timeoutMs: 100, retries: 0 });

    expect(result).toHaveLength(8);
    expect(result.every((item) => item.ok && item.statusCode === 204)).toBe(true);
  });

  it('handles a fetch rejection that arrives after the timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        () =>
          new Promise<Response>((_resolve, reject) => {
            setTimeout(() => {
              reject(new Error('late failure'));
            }, 30);
          }),
      ),
    );

    const result = await checkServices({ timeoutMs: 5, retries: 0 });

    expect(result.every((item) => !item.ok && item.error === 'Request timed out')).toBe(true);
    await new Promise((resolve) => {
      setTimeout(resolve, 40);
    });
  });
});
