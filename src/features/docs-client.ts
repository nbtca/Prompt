import { AsyncLocalStorage } from 'node:async_hooks';
import { createDocsClient } from '@nbtca/docs';
import type { DocsClient } from '@nbtca/docs';

interface DocsFetchStore {
  delegate: typeof fetch;
  dispatching: boolean;
  signal: AbortSignal | undefined;
}

interface DocsFetchContext {
  active: number;
  contextualFetch: typeof fetch;
  delegate: typeof fetch;
  getFetch: () => typeof fetch;
  nativeFetch: typeof fetch;
  restoreDescriptor: PropertyDescriptor | undefined;
  setFetch: (value: typeof fetch) => void;
  storage: AsyncLocalStorage<DocsFetchStore>;
}

const contextKey = Symbol.for('@nbtca/prompt/docs-fetch-context/v2');
const globalWithContext = globalThis as typeof globalThis & {
  [contextKey]?: DocsFetchContext;
};

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError');
}

function raceWithSignal<T>(
  request: Promise<T>,
  signal: AbortSignal | null | undefined,
): Promise<T> {
  if (!signal) return request;
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise<T>((resolve, reject) => {
    const finish = (result: () => void) => {
      signal.removeEventListener('abort', onAbort);
      result();
    };
    const onAbort = () => {
      finish(() => {
        reject(abortError(signal));
      });
    };
    signal.addEventListener('abort', onAbort, { once: true });
    void request.then(
      (value) => {
        finish(() => {
          resolve(value);
        });
      },
      (error: unknown) => {
        finish(() => {
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      },
    );
  });
}

function createDocsFetchContext(): DocsFetchContext {
  const installed = globalWithContext[contextKey];
  if (installed) return installed;

  const nativeFetch = globalThis.fetch;
  const storage = new AsyncLocalStorage<DocsFetchStore>();
  let delegate = nativeFetch;
  let fallbackDispatching = false;
  const contextualFetch: typeof fetch = (input, init) => {
    const forward = (delegate: typeof fetch, options: RequestInit | undefined) =>
      options ? delegate(input, options) : delegate(input);
    const store = storage.getStore();
    if (!store) {
      if (fallbackDispatching) return forward(nativeFetch, init);
      fallbackDispatching = true;
      try {
        return forward(delegate, init);
      } finally {
        fallbackDispatching = false;
      }
    }
    if (store.dispatching) return forward(nativeFetch, init);
    if (store.signal?.aborted) return Promise.reject(abortError(store.signal));

    const requestSignal = init?.signal;
    const signal = store.signal
      ? requestSignal
        ? AbortSignal.any([store.signal, requestSignal])
        : store.signal
      : requestSignal;
    store.dispatching = true;
    try {
      return raceWithSignal(forward(store.delegate, signal ? { ...init, signal } : init), signal);
    } finally {
      store.dispatching = false;
    }
  };
  const getFetch = () => (storage.getStore() ? contextualFetch : delegate);
  const setFetch = (value: typeof fetch) => {
    delegate = value;
  };
  const context: DocsFetchContext = {
    active: 0,
    contextualFetch,
    get delegate() {
      return delegate;
    },
    set delegate(value: typeof fetch) {
      delegate = value;
    },
    getFetch,
    nativeFetch,
    restoreDescriptor: undefined,
    setFetch,
    storage,
  };
  globalWithContext[contextKey] = context;
  return context;
}

function beginDocsFetch(): { context: DocsFetchContext; finish(): void } {
  const context = createDocsFetchContext();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const installedAccessor =
    descriptor?.get === context.getFetch && descriptor.set === context.setFetch;
  const installedValue = descriptor?.value === context.contextualFetch;
  if (context.active === 0) context.restoreDescriptor = descriptor;
  if (!installedAccessor && !installedValue) {
    const observed = globalThis.fetch;
    if (observed !== context.contextualFetch) context.delegate = observed;
    if (descriptor?.configurable === false) {
      if (descriptor.writable !== true) {
        return {
          context,
          finish() {
            return undefined;
          },
        };
      }
      globalThis.fetch = context.contextualFetch;
    } else {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get: context.getFetch,
        set: context.setFetch,
      });
    }
  }
  context.active += 1;
  let finished = false;
  return {
    context,
    finish() {
      if (finished) return;
      finished = true;
      context.active = Math.max(0, context.active - 1);
      if (context.active > 0) return;
      const current = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
      if (current?.value === context.contextualFetch && current.writable === true) {
        globalThis.fetch = context.delegate;
        return;
      }
      if (current?.get !== context.getFetch || current.set !== context.setFetch) return;
      const restore = context.restoreDescriptor;
      if (restore && ('get' in restore || 'set' in restore)) {
        Object.defineProperty(globalThis, 'fetch', restore);
      } else {
        Object.defineProperty(globalThis, 'fetch', {
          configurable: restore?.configurable ?? true,
          enumerable: restore?.enumerable ?? true,
          value: context.delegate,
          writable: restore?.writable ?? true,
        });
      }
    },
  };
}

const defaultClient = createDocsClient();
const clientsBySignal = new WeakMap<AbortSignal, DocsClient>();
const clients = new Set<DocsClient>([defaultClient]);

function clientFor(signal: AbortSignal | undefined): DocsClient {
  if (!signal) return defaultClient;
  const existing = clientsBySignal.get(signal);
  if (existing) return existing;

  const client = createDocsClient();
  clientsBySignal.set(signal, client);
  clients.add(client);
  signal.addEventListener(
    'abort',
    () => {
      client.clear();
      clients.delete(client);
      clientsBySignal.delete(signal);
    },
    { once: true },
  );
  return client;
}

export function clearDocsClients(): void {
  for (const client of clients) client.clear();
}

export function runDocsClientOperation<T>(
  signal: AbortSignal | undefined,
  operation: (client: DocsClient) => Promise<T>,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  const scope = beginDocsFetch();
  let request: Promise<T>;
  try {
    request = scope.context.storage.run(
      { delegate: scope.context.delegate, dispatching: false, signal },
      () => operation(clientFor(signal)),
    );
  } catch (error) {
    scope.finish();
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const settle = (result: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      result();
    };
    const onAbort = () => {
      settle(() => {
        reject(signal ? abortError(signal) : new DOMException('Aborted', 'AbortError'));
      });
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    void request.then(
      (value) => {
        scope.finish();
        settle(() => {
          resolve(value);
        });
      },
      (error: unknown) => {
        scope.finish();
        settle(() => {
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      },
    );
  });
}
