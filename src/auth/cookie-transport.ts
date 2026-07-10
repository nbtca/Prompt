import makeFetchCookie from 'fetch-cookie';
import { CookieJar, type SerializedCookieJar } from 'tough-cookie';
import { AuthError, SessionExpiredError, type AuthStage } from './errors.js';

const WEBVPN_HOST = 'webvpn.nbt.edu.cn';
const AUTH_HOST = 'authserver-443.webvpn.nbt.edu.cn';
export const JWXT_HOST = 'jwxt-443.webvpn.nbt.edu.cn';

const WEBVPN_PATHS = new Set([
  '/',
  '/users/sign_in',
  '/users/auth/cas',
  '/users/auth/cas/callback',
  '/vpn_key/update',
]);

const AUTH_PATHS = new Set([
  '/authserver/login',
  '/authserver/checkNeedCaptcha.htl',
]);

const JWXT_EXACT_PATHS = new Set([
  '/sso/jziotlogin',
  '/jwglxt/ticketlogin',
  '/jwglxt/xtgl/login_slogin.html',
  '/jwglxt/xtgl/index_initMenu.html',
  '/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html',
  '/jwglxt/kbcx/xskbcx_cxXsgrkb.html',
  '/jwglxt/kbcx/xskbcx_cxRjc.html',
]);

function isAllowedJwxtPath(pathname: string): boolean {
  return JWXT_EXACT_PATHS.has(pathname);
}

function assertAllowedVpnOrigin(value: string): void {
  let nested: URL;
  try {
    nested = new URL(value);
  } catch {
    throw new AuthError('UNTRUSTED_URL', 'session', 'The campus service returned an untrusted redirect.');
  }
  if (
    nested.protocol !== 'https:'
    || (nested.port !== '' && nested.port !== '443')
    || nested.username !== ''
    || nested.password !== ''
  ) {
    throw new AuthError('UNTRUSTED_URL', 'session', 'The campus service returned an untrusted redirect.');
  }
  const host = nested.hostname.toLowerCase();
  const allowed = (
    host === JWXT_HOST && isAllowedJwxtPath(nested.pathname)
  ) || (
    host === AUTH_HOST && nested.pathname === '/authserver/login'
  ) || (
    host === WEBVPN_HOST && [
      '/',
      '/users/sign_in',
      '/users/auth/cas',
      '/users/auth/cas/callback',
    ].includes(nested.pathname)
  );
  if (!allowed) {
    throw new AuthError('UNTRUSTED_URL', 'session', 'The campus service returned an untrusted redirect.');
  }
}

function assertAllowedCasService(value: string): void {
  let service: URL;
  try {
    service = new URL(value);
  } catch {
    throw new AuthError('UNTRUSTED_URL', 'session', 'The campus service returned an untrusted redirect.');
  }
  const allowed = service.protocol === 'https:'
    && (service.port === '' || service.port === '443')
    && service.username === ''
    && service.password === ''
    && (
    (
      service.hostname.toLowerCase() === WEBVPN_HOST
      && service.pathname === '/users/auth/cas/callback'
    ) || (
      service.hostname.toLowerCase() === JWXT_HOST
      && service.pathname === '/sso/jziotlogin'
    )
    );
  if (!allowed) {
    throw new AuthError('UNTRUSTED_URL', 'session', 'The campus service returned an untrusted redirect.');
  }
}

export function assertAllowedCampusUrl(url: URL): void {
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:'
    || (url.port !== '' && url.port !== '443')
    || url.username !== ''
    || url.password !== ''
  ) {
    throw new AuthError('UNTRUSTED_URL', 'session', 'The campus service URL is not allowed.');
  }

  if (hostname === WEBVPN_HOST && WEBVPN_PATHS.has(url.pathname)) {
    if (url.pathname === '/vpn_key/update') {
      const origin = url.searchParams.get('origin');
      // The post-CAS callback currently uses this route without `origin`;
      // unauthenticated JWXT redirects include one and are validated below.
      if (origin) assertAllowedVpnOrigin(origin);
    }
    return;
  }
  if (hostname === AUTH_HOST && AUTH_PATHS.has(url.pathname)) {
    const service = url.searchParams.get('service');
    if (service) assertAllowedCasService(service);
    return;
  }
  if (hostname === JWXT_HOST && isAllowedJwxtPath(url.pathname)) return;

  throw new AuthError('UNTRUSTED_URL', 'session', 'The campus service URL is not allowed.');
}

function safeHeaders(headers: RequestInit['headers']): Record<string, string> {
  const result = new Headers(headers);
  for (const forbidden of ['authorization', 'cookie', 'host']) {
    if (result.has(forbidden)) {
      throw new AuthError('UNTRUSTED_URL', 'session', 'Caller-supplied authentication headers are not allowed.');
    }
  }
  return Object.fromEntries(result.entries());
}

function abortSignal(signal: AbortSignal | null | undefined, timeoutMs: number): {
  signal: AbortSignal;
  cleanup(): void;
  timedOut(): boolean;
} {
  const controller = new AbortController();
  let didTimeout = false;
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  timer.unref?.();
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
    timedOut: () => didTimeout,
  };
}

function safeFetchError(error: unknown, stage: AuthStage, didTimeout: boolean): Error {
  if (error instanceof AuthError) return error;
  if (didTimeout) return new AuthError('TIMEOUT', stage, 'The campus service request timed out.', { retryable: true });
  if (typeof error === 'object' && error !== null && Reflect.get(error, 'name') === 'AbortError') {
    return new DOMException('The campus service request was aborted.', 'AbortError');
  }
  return new AuthError('NETWORK', stage, 'The campus service request failed.', { retryable: true });
}

export interface CampusCookieSession {
  request(url: URL, init?: RequestInit, stage?: AuthStage): Promise<Response>;
  timetableTransport(url: URL, init: RequestInit): Promise<Response>;
  serialize(): Promise<SerializedCookieJar>;
  close(): Promise<void>;
}

export interface CreateCampusCookieSessionOptions {
  jar?: CookieJar;
  baseFetch?: typeof fetch;
  timeoutMs?: number;
}

export function createCampusCookieSession(
  options: CreateCampusCookieSessionOptions = {},
): CampusCookieSession {
  // Tough Cookie's secure defaults reject public suffixes and use strict
  // parsing while tolerating legacy prefix mistakes. The campus WebVPN relies
  // on its default special-domain handling during the CAS callback.
  const jar = options.jar ?? new CookieJar();
  const baseFetch = options.baseFetch ?? globalThis.fetch;
  const guardedFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    assertAllowedCampusUrl(url);
    // Caller headers were checked before fetch-cookie received them. A Cookie
    // header at this layer was added by the private jar and is expected.
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    for (const [name, value] of new Headers(init?.headers)) headers.set(name, value);
    if (headers.has('authorization') || headers.has('host')) {
      throw new AuthError('UNTRUSTED_URL', 'session', 'Authentication headers are not allowed.');
    }
    return baseFetch(input, init);
  };
  const cookieFetch = makeFetchCookie(guardedFetch, jar, false);
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function request(url: URL, init: RequestInit = {}, stage: AuthStage = 'session'): Promise<Response> {
    assertAllowedCampusUrl(url);
    if (init.method && init.method !== 'GET' && init.method !== 'POST') {
      throw new AuthError('UNTRUSTED_URL', stage, 'Only read and login requests are allowed.');
    }
    const controlled = abortSignal(init.signal, timeoutMs);
    try {
      return await cookieFetch(url, {
        ...init,
        headers: safeHeaders(init.headers),
        signal: controlled.signal,
        maxRedirect: 8,
      });
    } catch (error) {
      throw safeFetchError(error, stage, controlled.timedOut());
    } finally {
      controlled.cleanup();
    }
  }

  async function timetableTransport(url: URL, init: RequestInit): Promise<Response> {
    if (url.hostname.toLowerCase() !== JWXT_HOST || !isAllowedJwxtPath(url.pathname)) {
      throw new AuthError('UNTRUSTED_URL', 'session', 'The timetable transport only accepts JWXT routes.');
    }
    const response = await request(url, init, 'session');
    try {
      const finalUrl = new URL(response.url);
      if (
        finalUrl.hostname.toLowerCase() !== JWXT_HOST
        || finalUrl.pathname.includes('/authserver/login')
        || finalUrl.pathname.includes('/users/sign_in')
        || finalUrl.pathname === '/vpn_key/update'
      ) throw new SessionExpiredError();
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new SessionExpiredError();
    }
    if (response.status === 401 || response.status === 403) throw new SessionExpiredError();
    return response;
  }

  return {
    request,
    timetableTransport,
    serialize: () => jar.serialize(),
    close: () => jar.removeAllCookies(),
  };
}

export async function cookieSessionFromSerialized(
  serialized: SerializedCookieJar,
  options: Omit<CreateCampusCookieSessionOptions, 'jar'> = {},
): Promise<CampusCookieSession> {
  let jar: CookieJar;
  try {
    jar = await CookieJar.deserialize(serialized);
  } catch {
    throw new SessionExpiredError();
  }
  return createCampusCookieSession({ ...options, jar });
}
