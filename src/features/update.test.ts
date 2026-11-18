import { describe, it, expect, vi } from 'vitest';
import { fetchLatestVersion } from './update.js';

const ok = (version: unknown) =>
  Promise.resolve(new Response(JSON.stringify({ version }), { status: 200 }));

describe('fetchLatestVersion', () => {
  it('returns the published version', async () => {
    expect(await fetchLatestVersion(() => ok('1.6.1'))).toEqual({ version: '1.6.1' });
  });

  it('retries a dropped connection once', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockImplementationOnce(() => ok('1.6.1'));
    expect(await fetchLatestVersion(fetcher)).toEqual({ version: '1.6.1' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reports a connection that keeps failing as offline', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    expect(await fetchLatestVersion(fetcher)).toEqual({ error: 'network' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('gives up after a timeout without waiting a second time', async () => {
    const fetcher = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason as Error);
          });
        }),
    );
    expect(await fetchLatestVersion(fetcher, 20)).toEqual({ error: 'timeout' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('treats an error status or a malformed body as a bad response', async () => {
    expect(
      await fetchLatestVersion(() => Promise.resolve(new Response('', { status: 503 }))),
    ).toEqual({ error: 'response' });
    expect(await fetchLatestVersion(() => ok(42))).toEqual({ error: 'response' });
  });
});
