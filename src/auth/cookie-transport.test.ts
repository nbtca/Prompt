import { describe, expect, it, vi } from 'vitest';
import { AuthError } from './errors.js';
import { assertAllowedCampusUrl, createCampusCookieSession } from './cookie-transport.js';

function mockResponse(url: string, body = 'ok', init: ResponseInit = {}): Response {
  const response = new Response(body, init);
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

describe('campus URL policy', () => {
  it('allows only exact HTTPS campus hosts and routes', () => {
    expect(() => assertAllowedCampusUrl(new URL(
      'https://jwxt-443.webvpn.nbt.edu.cn/jwglxt/kbcx/xskbcx_cxXsgrkb.html',
    ))).not.toThrow();
    expect(() => assertAllowedCampusUrl(new URL(
      'https://authserver-443.webvpn.nbt.edu.cn/authserver/login?service=https%3A%2F%2Fwebvpn.nbt.edu.cn%2Fusers%2Fauth%2Fcas%2Fcallback',
    ))).not.toThrow();
    expect(() => assertAllowedCampusUrl(new URL(
      'https://authserver-443.webvpn.nbt.edu.cn/authserver/login?service=https%3A%2F%2Fjwxt-443.webvpn.nbt.edu.cn%2Fsso%2Fjziotlogin',
    ))).not.toThrow();
    expect(() => assertAllowedCampusUrl(new URL(
      'https://webvpn.nbt.edu.cn/vpn_key/update?origin=https%3A%2F%2Fjwxt-443.webvpn.nbt.edu.cn%2Fjwglxt%2Fkbcx%2Fxskbcx_cxXsgrkb.html',
    ))).not.toThrow();
    expect(() => assertAllowedCampusUrl(new URL(
      'https://jwxt-443.webvpn.nbt.edu.cn/jwglxt/ticketlogin',
    ))).not.toThrow();
    expect(() => assertAllowedCampusUrl(new URL(
      'https://jwxt-443.webvpn.nbt.edu.cn/jwglxt/xtgl/login_slogin.html',
    ))).not.toThrow();
    expect(() => assertAllowedCampusUrl(new URL(
      'https://webvpn.nbt.edu.cn/vpn_key/update?origin=https%3A%2F%2Fauthserver-443.webvpn.nbt.edu.cn%2Fauthserver%2Flogin',
    ))).not.toThrow();
    expect(() => assertAllowedCampusUrl(new URL(
      'https://webvpn.nbt.edu.cn/vpn_key/update',
    ))).not.toThrow();
  });

  it.each([
    'http://jwxt-443.webvpn.nbt.edu.cn/jwglxt/kbcx/x.html',
    'https://jwxt-443.webvpn.nbt.edu.cn.evil.example/jwglxt/kbcx/x.html',
    'https://jwxt-443.webvpn.nbt.edu.cn/other/private.html',
    'https://webvpn.nbt.edu.cn/vpn_key/update?origin=https%3A%2F%2Fevil.example%2F',
    'https://authserver-443.webvpn.nbt.edu.cn/authserver/login?service=https%3A%2F%2Fevil.example%2Fcallback',
    'https://authserver-443.webvpn.nbt.edu.cn/authserver/login?service=https%3A%2F%2Fuser%3Apass%40webvpn.nbt.edu.cn%3A444%2Fusers%2Fauth%2Fcas%2Fcallback',
    'https://jwxt-443.webvpn.nbt.edu.cn/sso/jziotlogin-extra',
    'https://jwxt-443.webvpn.nbt.edu.cn/jwglxt/kbcx/unapproved.html',
  ])('rejects %s', (url) => {
    expect(() => assertAllowedCampusUrl(new URL(url))).toThrowError(
      expect.objectContaining({ code: 'UNTRUSTED_URL' }),
    );
  });
});

describe('cookie transport', () => {
  it('keeps cookies in its private jar and rejects caller-supplied cookies', async () => {
    const baseFetch = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : input.toString();
      return mockResponse(url, 'ok', { headers: { 'set-cookie': 'sid=opaque; Secure; HttpOnly; Path=/' } });
    }) as unknown as typeof fetch;
    const session = createCampusCookieSession({ baseFetch });
    await session.request(new URL('https://webvpn.nbt.edu.cn/'));
    expect((await session.serialize()).cookies).toHaveLength(1);
    await expect(session.request(new URL('https://webvpn.nbt.edu.cn/'), {
      headers: { Cookie: 'attacker=value' },
    })).rejects.toBeInstanceOf(AuthError);
    await session.close();
  });

  it('preserves jar cookies when fetch-cookie follows a Request redirect', async () => {
    let redirectedCookie: string | null = null;
    const baseFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      for (const [name, value] of new Headers(init?.headers)) headers.set(name, value);
      if (url.pathname === '/') {
        return mockResponse(url.href, '', {
          status: 302,
          headers: {
            location: '/users/sign_in',
            'set-cookie': 'sid=opaque; Secure; HttpOnly; Path=/',
          },
        });
      }
      redirectedCookie = headers.get('cookie');
      return mockResponse(url.href);
    }) as unknown as typeof fetch;
    const session = createCampusCookieSession({ baseFetch });
    await session.request(new URL('https://webvpn.nbt.edu.cn/'));
    expect(redirectedCookie).toBe('sid=opaque');
    await session.close();
  });

  it('does not expose an underlying abort message', async () => {
    const session = createCampusCookieSession({
      baseFetch: (async () => { throw new DOMException('private abort marker', 'AbortError'); }) as typeof fetch,
    });
    let caught: unknown;
    try { await session.request(new URL('https://webvpn.nbt.edu.cn/')); } catch (error) { caught = error; }
    expect(caught).toMatchObject({ name: 'AbortError' });
    expect(String(caught)).not.toContain('private abort marker');
  });
});
