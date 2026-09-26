import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCookieJar } from './cookie-jar.js';

const WEBVPN = new URL('https://webvpn.nbt.edu.cn/users/sign_in');
const JWXT = new URL('https://jwxt-443.webvpn.nbt.edu.cn/jwglxt/kbcx/xskbcx_cxXsgrkb.html');

function jarWith(url: URL, ...headers: string[]) {
  const jar = createCookieJar();
  jar.store(url, headers);
  return jar;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('cookie jar', () => {
  it('parses several Set-Cookie headers and trims names and values', () => {
    const jar = jarWith(WEBVPN, ' a = 1 ; Path=/', 'b=2=3; Path=/', 'broken', '=anonymous');
    expect(jar.cookieHeader(WEBVPN)).toBe('a=1; b=2=3');
  });

  it('keeps host-only cookies on their host and shares Domain cookies with subdomains', () => {
    const jar = jarWith(WEBVPN, 'host=1; Path=/', 'shared=2; Domain=.WebVPN.nbt.edu.cn; Path=/');
    expect(jar.cookieHeader(new URL('https://webvpn.nbt.edu.cn/'))).toBe('host=1; shared=2');
    expect(jar.cookieHeader(JWXT)).toBe('shared=2');
  });

  it.each([
    'Domain=jwxt-443.webvpn.nbt.edu.cn',
    'Domain=edu.cn',
    'Domain=cn',
    'Domain=bt.edu.cn',
    'Domain=evil.example',
  ])('rejects a cookie with %s set from webvpn', (attribute) => {
    const jar = jarWith(WEBVPN, `sid=1; ${attribute}; Path=/`);
    expect(jar.serialize().cookies).toEqual([]);
  });

  it('accepts the campus registrable domain but nothing above it', () => {
    const jar = jarWith(JWXT, 'campus=1; Domain=nbt.edu.cn; Path=/');
    expect(jar.cookieHeader(WEBVPN)).toBe('campus=1');
  });

  it('refuses hosts outside the campus domain entirely', () => {
    const jar = jarWith(new URL('https://evil.example/'), 'sid=1');
    expect(jar.serialize().cookies).toEqual([]);
  });

  it('defaults and matches paths per RFC 6265', () => {
    const jar = jarWith(
      new URL('https://jwxt-443.webvpn.nbt.edu.cn/jwglxt/kbcx/page.html'),
      'implicit=1',
      'explicit=2; Path=/jwglxt',
      'relative=3; Path=jwglxt',
    );
    expect(jar.cookieHeader(JWXT)).toBe('implicit=1; relative=3; explicit=2');
    expect(jar.cookieHeader(new URL('https://jwxt-443.webvpn.nbt.edu.cn/jwglxt'))).toBe(
      'explicit=2',
    );
    expect(jar.cookieHeader(new URL('https://jwxt-443.webvpn.nbt.edu.cn/jwglxtx'))).toBe('');
  });

  it('orders longer paths first and keeps creation order otherwise', () => {
    const jar = jarWith(JWXT, 'b=1; Path=/', 'a=2; Path=/', 'c=3; Path=/jwglxt/');
    expect(jar.cookieHeader(JWXT)).toBe('c=3; b=1; a=2');
  });

  it('sends Secure cookies only over HTTPS', () => {
    const jar = jarWith(WEBVPN, 'sid=1; Secure; HttpOnly; SameSite=Strict; Path=/');
    expect(jar.cookieHeader(new URL('http://webvpn.nbt.edu.cn/'))).toBe('');
    expect(jar.cookieHeader(new URL('https://webvpn.nbt.edu.cn/'))).toBe('sid=1');
  });

  it('enforces cookie name prefixes', () => {
    const jar = jarWith(
      WEBVPN,
      '__Secure-a=1; Path=/',
      '__Secure-b=2; Secure; Path=/',
      '__Host-c=3; Secure; Path=/; Domain=webvpn.nbt.edu.cn',
      '__Host-d=4; Secure; Path=/',
    );
    expect(jar.cookieHeader(WEBVPN)).toBe('__Secure-b=2; __Host-d=4');
  });

  it('replaces a cookie by name, domain and path without changing its position', () => {
    const jar = jarWith(WEBVPN, 'a=1; Path=/', 'b=2; Path=/', 'a=3; Path=/', 'a=4; Path=/users');
    expect(jar.cookieHeader(WEBVPN)).toBe('a=4; a=3; b=2');
  });

  it('expires cookies, lets Max-Age win over Expires and deletes on Max-Age=0', () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 6, 10) });
    const jar = jarWith(
      WEBVPN,
      'short=1; Max-Age=60; Expires=Wed, 01 Jan 2031 00:00:00 GMT; Path=/',
      'long=2; Expires=Wed, 01 Jan 2031 00:00:00 GMT; Max-Age=3600; Path=/',
      'gone=3; Path=/',
    );
    jar.store(WEBVPN, [
      'gone=; Max-Age=0; Path=/',
      'past=4; Expires=Thu, 01-Jan-1970 00:00:10 GMT',
    ]);
    expect(jar.cookieHeader(WEBVPN)).toBe('short=1; long=2');
    vi.advanceTimersByTime(61_000);
    expect(jar.cookieHeader(WEBVPN)).toBe('long=2');
    vi.advanceTimersByTime(3_600_000);
    expect(jar.serialize().cookies).toEqual([]);
  });

  it('caps a cookie lifetime at 400 days', () => {
    vi.useFakeTimers({ now: 0 });
    const jar = jarWith(WEBVPN, 'sid=1; Max-Age=99999999999999999999');
    expect(jar.serialize().cookies[0]?.expires).toBe(400 * 24 * 60 * 60 * 1000);
  });

  it('ignores oversized cookies and control characters, and caps the cookie count', () => {
    const jar = jarWith(WEBVPN, `big=${'x'.repeat(4096)}`, 'bad=a\u007fb');
    expect(jar.serialize().cookies).toEqual([]);
    jar.store(
      WEBVPN,
      Array.from({ length: 120 }, (_, index) => `c${index}=1; Path=/`),
    );
    const names = jar.serialize().cookies.map((cookie) => cookie.name);
    expect(names).toHaveLength(100);
    expect(names[0]).toBe('c20');
  });

  it('round-trips through its versioned JSON format', () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 6, 10) });
    const jar = jarWith(
      WEBVPN,
      'session=1; Secure; HttpOnly; Path=/',
      'persistent=2; Domain=nbt.edu.cn; Max-Age=3600; Path=/users',
    );
    const serialized = JSON.parse(JSON.stringify(jar.serialize())) as unknown;
    const restored = createCookieJar(serialized);
    expect(restored.serialize()).toEqual(jar.serialize());
    expect(restored.cookieHeader(WEBVPN)).toBe(jar.cookieHeader(WEBVPN));
  });

  it.each([
    [
      'a tough-cookie jar',
      {
        version: 'tough-cookie@6.0.0',
        storeType: 'MemoryCookieStore',
        rejectPublicSuffixes: true,
        cookies: [{ key: 'sid', value: '1', domain: 'webvpn.nbt.edu.cn', path: '/' }],
      },
    ],
    ['a future version', { version: 2, cookies: [] }],
    [
      'a cookie outside the campus',
      {
        version: 1,
        cookies: [
          {
            name: 'sid',
            value: '1',
            domain: 'evil.example',
            path: '/',
            hostOnly: true,
            secure: true,
            httpOnly: true,
          },
        ],
      },
    ],
    ['null', null],
  ])('rejects %s', (_label, serialized) => {
    expect(() => createCookieJar(serialized)).toThrow(TypeError);
  });
});

function expiryOf(date: string, now = 0): number | undefined {
  vi.useFakeTimers({ now });
  return jarWith(WEBVPN, `d=1; Expires=${date}`).serialize().cookies[0]?.expires;
}

describe('cookie dates', () => {
  it.each([
    ['Wed, 21 Oct 2015 07:28:00 GMT', Date.UTC(2015, 9, 21, 7, 28)],
    ['Thu, 01-Jan-1970 00:00:10 GMT', 10_000],
    ['Sunday, 06-Nov-94 08:49:37 GMT', Date.UTC(1994, 10, 6, 8, 49, 37)],
    ['Sun Nov  6 08:49:37 1994', Date.UTC(1994, 10, 6, 8, 49, 37)],
    ['Fri, 31 Dec 29 23:59:59 GMT', Date.UTC(2029, 11, 31, 23, 59, 59)],
  ])('parses %s', (text, expected) => {
    expect(expiryOf(text, expected - 1000)).toBe(expected);
  });

  it.each(['', 'tomorrow', 'Mon, 30 Feb 2026 00:00:00 GMT', 'Mon, 01 Jan 1600 00:00:00 GMT'])(
    'rejects %j',
    (text) => {
      expect(expiryOf(text)).toBeUndefined();
    },
  );
});
