import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDocsClientOperation } from './docs-client.js';

interface PendingFetch {
  signal: AbortSignal | null | undefined;
  resolve: (response: Response) => void;
}

function pendingFetches(): { fetchMock: ReturnType<typeof vi.fn>; pending: PendingFetch[] } {
  const pending: PendingFetch[] = [];
  const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
    return new Promise<Response>((resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener(
        'abort',
        () => {
          const error =
            signal.reason instanceof Error
              ? signal.reason
              : new DOMException('Aborted', 'AbortError');
          reject(error);
        },
        { once: true },
      );
      pending.push({ signal, resolve });
    });
  });
  return { fetchMock, pending };
}

async function flush(): Promise<void> {
  await Promise.resolve();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('docs fetch boundary', () => {
  it('aborts the underlying request with the caller signal', async () => {
    const { fetchMock, pending } = pendingFetches();
    vi.stubGlobal('fetch', fetchMock);
    const caller = new AbortController();
    const request = runDocsClientOperation(caller.signal, () =>
      fetch('https://docs.test', { signal: new AbortController().signal }),
    );

    expect(pending[0]?.signal?.aborted).toBe(false);
    caller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(pending[0]?.signal?.aborted).toBe(true);
  });

  it('keeps concurrent caller signals isolated', async () => {
    const { fetchMock, pending } = pendingFetches();
    vi.stubGlobal('fetch', fetchMock);
    const first = new AbortController();
    const second = new AbortController();
    const firstRequest = runDocsClientOperation(first.signal, () => fetch('https://docs.test/a'));
    const secondRequest = runDocsClientOperation(second.signal, () => fetch('https://docs.test/b'));
    await flush();

    first.abort();
    await expect(firstRequest).rejects.toMatchObject({ name: 'AbortError' });
    expect(pending[0]?.signal?.aborted).toBe(true);
    expect(pending[1]?.signal?.aborted).toBe(false);

    pending[1]?.resolve(new Response('ok'));
    await expect(secondRequest).resolves.toMatchObject({ ok: true });
  });

  it('does not share a same-path request across caller lifecycles', async () => {
    const { fetchMock, pending } = pendingFetches();
    vi.stubGlobal('fetch', fetchMock);
    const first = new AbortController();
    const second = new AbortController();
    const firstRequest = runDocsClientOperation(first.signal, (client) =>
      client.getDocument('guide/same.md'),
    );
    const secondRequest = runDocsClientOperation(second.signal, (client) =>
      client.getDocument('guide/same.md'),
    );
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    first.abort();
    await expect(firstRequest).rejects.toBeDefined();
    expect(pending[1]?.signal?.aborted).toBe(false);

    pending[1]?.resolve(new Response('# Still active'));
    await expect(secondRequest).resolves.toMatchObject({ title: 'Still active' });
  });

  it('uses a fetch mock installed after module initialization', async () => {
    const lateFetch = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', lateFetch);

    await runDocsClientOperation(new AbortController().signal, () => fetch('https://docs.test'));
    expect(lateFetch).toHaveBeenCalledOnce();
    expect(globalThis.fetch).toBe(lateFetch);
  });

  it('does not recurse through a fetch instrumentation wrapper', async () => {
    const previous = globalThis.fetch;
    const instrumented = vi.fn((...args: Parameters<typeof fetch>) => previous(...args));
    vi.stubGlobal('fetch', instrumented);

    const response = await runDocsClientOperation(new AbortController().signal, () =>
      fetch('data:text/plain,ok'),
    );

    await expect(response.text()).resolves.toBe('ok');
    expect(instrumented).toHaveBeenCalledOnce();
    expect(globalThis.fetch).toBe(instrumented);
  });

  it('restores the original fetch after overlapping temporary replacements', async () => {
    const { fetchMock: original, pending: originalPending } = pendingFetches();
    vi.stubGlobal('fetch', original);
    const first = runDocsClientOperation(undefined, () => fetch('https://docs.test/first'));

    const { fetchMock: temporary, pending: temporaryPending } = pendingFetches();
    globalThis.fetch = temporary;
    const second = runDocsClientOperation(undefined, () => fetch('https://docs.test/second'));

    temporaryPending[0]?.resolve(new Response('second'));
    await second;
    expect(globalThis.fetch).toBe(temporary);
    const duringReplacement = fetch('https://docs.test/temporary');
    temporaryPending[1]?.resolve(new Response('temporary'));
    await duringReplacement;

    globalThis.fetch = original;
    originalPending[0]?.resolve(new Response('first'));
    await first;

    expect(globalThis.fetch).toBe(original);
    const plain = fetch('https://docs.test/plain');
    expect(original).toHaveBeenLastCalledWith('https://docs.test/plain');
    originalPending[1]?.resolve(new Response('plain'));
    await expect(plain).resolves.toMatchObject({ ok: true });
  });

  it('recovers after a fetch stub is restored and replaced', async () => {
    const firstFetch = vi.fn().mockResolvedValue(new Response('first'));
    vi.stubGlobal('fetch', firstFetch);
    await runDocsClientOperation(new AbortController().signal, () =>
      fetch('https://docs.test/one'),
    );
    vi.unstubAllGlobals();

    const secondFetch = vi.fn().mockResolvedValue(new Response('second'));
    vi.stubGlobal('fetch', secondFetch);
    await runDocsClientOperation(new AbortController().signal, () =>
      fetch('https://docs.test/two'),
    );

    expect(firstFetch).toHaveBeenCalledOnce();
    expect(secondFetch).toHaveBeenCalledOnce();
  });

  it('does not add a signal outside a docs operation', async () => {
    const { fetchMock, pending } = pendingFetches();
    vi.stubGlobal('fetch', fetchMock);
    const contextual = runDocsClientOperation(new AbortController().signal, () =>
      fetch('https://docs.test/context'),
    );
    await flush();
    const plain = fetch('https://docs.test/plain');
    await flush();

    expect(pending[0]?.signal).toBeDefined();
    expect(pending[1]?.signal).toBeUndefined();
    expect(fetchMock).toHaveBeenLastCalledWith('https://docs.test/plain');

    pending[0]?.resolve(new Response('context'));
    pending[1]?.resolve(new Response('plain'));
    await Promise.all([contextual, plain]);
  });

  it('settles on abort when the delegated fetch ignores its signal', async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal('fetch', fetchMock);
    const caller = new AbortController();
    const request = runDocsClientOperation(caller.signal, () => fetch('https://docs.test/hang'));

    caller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(globalThis.fetch).toBe(fetchMock);
    expect(Object.getOwnPropertyDescriptor(globalThis, 'fetch')?.value).toBe(fetchMock);
  });

  it('does not start later search requests after an ignored request is aborted', async () => {
    let resolveTree: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveTree = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const caller = new AbortController();
    const request = runDocsClientOperation(caller.signal, (client) => client.search('needle'));
    caller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });

    resolveTree?.(
      Response.json({
        tree: [{ path: 'guide/result.md', type: 'blob' }],
        truncated: false,
      }),
    );
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
