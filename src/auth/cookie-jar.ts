const CAMPUS_DOMAIN = 'nbt.edu.cn';
const MAX_COOKIES = 100;
const MAX_PAIR_LENGTH = 4096;
const MAX_ATTRIBUTE_LENGTH = 1024;
const MAX_LIFETIME_MS = 400 * 24 * 60 * 60 * 1000;
const CONTROL = /[\u0000-\u001f\u007f]/;
const DATE_DELIMITER = /[\x09\x20-\x2f\x3b-\x40\x5b-\x60\x7b-\x7e]+/;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  hostOnly: boolean;
  secure: boolean;
  httpOnly: boolean;
  expires?: number;
}

export interface SerializedCookieJar {
  version: 1;
  cookies: StoredCookie[];
}

export interface CookieJar {
  store(url: URL, setCookieHeaders: readonly string[]): void;
  cookieHeader(url: URL): string;
  serialize(): SerializedCookieJar;
  clear(): void;
}

function isCampusDomain(domain: string): boolean {
  return domain === CAMPUS_DOMAIN || domain.endsWith(`.${CAMPUS_DOMAIN}`);
}

function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function pathMatches(requestPath: string, cookiePath: string): boolean {
  return (
    requestPath === cookiePath ||
    (requestPath.startsWith(cookiePath) &&
      (cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/'))
  );
}

function defaultPath(requestPath: string): string {
  const lastSlash = requestPath.lastIndexOf('/');
  return lastSlash <= 0 ? '/' : requestPath.slice(0, lastSlash);
}

function parseCookieDate(text: string): number | undefined {
  let time: number[] | undefined;
  let day: number | undefined;
  let month: number | undefined;
  let year: number | undefined;
  for (const token of text.split(DATE_DELIMITER)) {
    let match: RegExpExecArray | null;
    if (!time && (match = /^(\d{1,2}):(\d{1,2}):(\d{1,2})(?!\d)/.exec(token))) {
      time = match.slice(1).map(Number);
    } else if (day === undefined && (match = /^\d{1,2}(?!\d)/.exec(token))) {
      day = Number(match[0]);
    } else if (month === undefined && MONTHS.includes(token.slice(0, 3).toLowerCase())) {
      month = MONTHS.indexOf(token.slice(0, 3).toLowerCase());
    } else if (year === undefined && (match = /^\d{2,4}(?!\d)/.exec(token))) {
      year = Number(match[0]);
    }
  }
  if (!time || day === undefined || month === undefined || year === undefined) return undefined;
  if (year >= 70 && year <= 99) year += 1900;
  else if (year <= 69) year += 2000;
  const [hours = 0, minutes = 0, seconds = 0] = time;
  if (day < 1 || year < 1601 || hours > 23 || minutes > 59 || seconds > 59) return undefined;
  const date = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
  return date.getUTCMonth() === month && date.getUTCDate() === day ? date.getTime() : undefined;
}

function isStoredCookie(value: unknown): value is StoredCookie {
  if (typeof value !== 'object' || value === null) return false;
  const cookie = value as Record<string, unknown>;
  return (
    typeof cookie['name'] === 'string' &&
    cookie['name'] !== '' &&
    !CONTROL.test(cookie['name']) &&
    typeof cookie['value'] === 'string' &&
    !CONTROL.test(cookie['value']) &&
    typeof cookie['domain'] === 'string' &&
    isCampusDomain(cookie['domain']) &&
    typeof cookie['path'] === 'string' &&
    cookie['path'].startsWith('/') &&
    typeof cookie['hostOnly'] === 'boolean' &&
    typeof cookie['secure'] === 'boolean' &&
    typeof cookie['httpOnly'] === 'boolean' &&
    (cookie['expires'] === undefined || Number.isFinite(cookie['expires']))
  );
}

function isSerializedJar(value: unknown): value is SerializedCookieJar {
  if (typeof value !== 'object' || value === null) return false;
  const { version, cookies } = value as Record<string, unknown>;
  return (
    version === 1 &&
    Array.isArray(cookies) &&
    cookies.length <= MAX_COOKIES &&
    cookies.every(isStoredCookie)
  );
}

export function createCookieJar(serialized?: unknown): CookieJar {
  const cookies = new Map<string, StoredCookie>();
  const keyOf = (cookie: StoredCookie) => JSON.stringify([cookie.domain, cookie.path, cookie.name]);

  if (serialized !== undefined) {
    if (!isSerializedJar(serialized)) throw new TypeError('Unsupported cookie jar.');
    for (const {
      name,
      value,
      domain,
      path,
      hostOnly,
      secure,
      httpOnly,
      expires,
    } of serialized.cookies) {
      const cookie = { name, value, domain, path, hostOnly, secure, httpOnly };
      cookies.set(keyOf(cookie), expires === undefined ? cookie : { ...cookie, expires });
    }
  }

  function isExpired(cookie: StoredCookie, now: number): boolean {
    return cookie.expires !== undefined && cookie.expires <= now;
  }

  function storeOne(url: URL, header: string, now: number): void {
    const [pair = '', ...attributes] = header.trim().split(';');
    const separator = pair.indexOf('=');
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (separator <= 0 || !name || CONTROL.test(name) || CONTROL.test(value)) return;
    if (name.length + value.length > MAX_PAIR_LENGTH) return;

    let domain: string | undefined;
    let path: string | undefined;
    let expires: number | undefined;
    let maxAge: number | undefined;
    let secure = false;
    let httpOnly = false;
    for (const attribute of attributes) {
      const split = attribute.indexOf('=');
      const key = (split === -1 ? attribute : attribute.slice(0, split)).trim().toLowerCase();
      const argument = split === -1 ? '' : attribute.slice(split + 1).trim();
      if (argument.length > MAX_ATTRIBUTE_LENGTH) continue;
      if (key === 'expires') expires = parseCookieDate(argument) ?? expires;
      else if (key === 'max-age' && /^-?\d+$/.test(argument)) maxAge = Number(argument);
      else if (key === 'domain' && argument.replace(/^\./, ''))
        domain = argument.replace(/^\./, '').toLowerCase();
      else if (key === 'path') path = argument.startsWith('/') ? argument : undefined;
      else if (key === 'secure') secure = true;
      else if (key === 'httponly') httpOnly = true;
    }

    const host = url.hostname;
    if (domain !== undefined && !domainMatches(host, domain)) return;
    const cookie: StoredCookie = {
      name,
      value,
      domain: domain ?? host,
      path: path ?? defaultPath(url.pathname),
      hostOnly: domain === undefined,
      secure,
      httpOnly,
    };
    if (!isCampusDomain(cookie.domain)) return;
    if (secure && url.protocol !== 'https:') return;
    if (name.startsWith('__Secure-') && !secure) return;
    if (name.startsWith('__Host-') && (!secure || !cookie.hostOnly || cookie.path !== '/')) return;

    const expiry = maxAge === undefined ? expires : maxAge <= 0 ? 0 : now + maxAge * 1000;
    if (expiry !== undefined) cookie.expires = Math.min(expiry, now + MAX_LIFETIME_MS);
    const key = keyOf(cookie);
    if (isExpired(cookie, now)) {
      cookies.delete(key);
      return;
    }
    cookies.set(key, cookie);
    if (cookies.size <= MAX_COOKIES) return;
    for (const [staleKey, stale] of cookies) if (isExpired(stale, now)) cookies.delete(staleKey);
    for (const staleKey of cookies.keys()) {
      if (cookies.size <= MAX_COOKIES) break;
      cookies.delete(staleKey);
    }
  }

  return {
    store(url, setCookieHeaders) {
      const now = Date.now();
      for (const header of setCookieHeaders) storeOne(url, header, now);
    },
    cookieHeader(url) {
      const now = Date.now();
      const matches: StoredCookie[] = [];
      for (const [key, cookie] of cookies) {
        if (isExpired(cookie, now)) cookies.delete(key);
        else if (
          (cookie.hostOnly
            ? url.hostname === cookie.domain
            : domainMatches(url.hostname, cookie.domain)) &&
          pathMatches(url.pathname, cookie.path) &&
          (!cookie.secure || url.protocol === 'https:')
        )
          matches.push(cookie);
      }
      return matches
        .sort((a, b) => b.path.length - a.path.length)
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join('; ');
    },
    serialize() {
      const now = Date.now();
      return {
        version: 1,
        cookies: [...cookies.values()].filter((cookie) => !isExpired(cookie, now)),
      };
    },
    clear() {
      cookies.clear();
    },
  };
}
