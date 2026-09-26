import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { AuthError, type AuthErrorCode } from './errors.js';
import { assertAllowedCampusUrl, createCampusCookieSession } from './cookie-transport.js';

function mockResponse(url: string, body = 'ok', init: ResponseInit = {}): Response {
  const response = new Response(body, init);
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

function expectAuthError(run: () => unknown, code: AuthErrorCode): void {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AuthError);
  if (caught instanceof AuthError) expect(caught.code).toBe(code);
}

describe('campus URL policy', () => {
  it('allows only exact HTTPS campus hosts and routes', () => {
    expect(() => {
      assertAllowedCampusUrl(
        new URL('https://jwxt-443.webvpn.nbt.edu.cn/jwglxt/kbcx/xskbcx_cxXsgrkb.html'),
      );
    }).not.toThrow();
    expect(() => {
      assertAllowedCampusUrl(
        new URL(
          'https://authserver-443.webvpn.nbt.edu.cn/authserver/login?service=https%3A%2F%2Fwebvpn.nbt.edu.cn%2Fusers%2Fauth%2Fcas%2Fcallback',
        ),
      );
    }).not.toThrow();
    expect(() => {
      assertAllowedCampusUrl(
        new URL(
          'https://authserver-443.webvpn.nbt.edu.cn/authserver/login?service=https%3A%2F%2Fjwxt-443.webvpn.nbt.edu.cn%2Fsso%2Fjziotlogin',
        ),
      );
    }).not.toThrow();
    expect(() => {
      assertAllowedCampusUrl(
        new URL(
          'https://webvpn.nbt.edu.cn/vpn_key/update?origin=https%3A%2F%2Fjwxt-443.webvpn.nbt.edu.cn%2Fjwglxt%2Fkbcx%2Fxskbcx_cxXsgrkb.html',
        ),
      );
    }).not.toThrow();
    expect(() => {
      assertAllowedCampusUrl(new URL('https://jwxt-443.webvpn.nbt.edu.cn/jwglxt/ticketlogin'));
    }).not.toThrow();
    expect(() => {
      assertAllowedCampusUrl(
        new URL('https://jwxt-443.webvpn.nbt.edu.cn/jwglxt/xtgl/login_slogin.html'),
      );
    }).not.toThrow();
    expect(() => {
      assertAllowedCampusUrl(
        new URL(
          'https://webvpn.nbt.edu.cn/vpn_key/update?origin=https%3A%2F%2Fauthserver-443.webvpn.nbt.edu.cn%2Fauthserver%2Flogin',
        ),
      );
    }).not.toThrow();
    expect(() => {
      assertAllowedCampusUrl(new URL('https://webvpn.nbt.edu.cn/vpn_key/update'));
    }).not.toThrow();
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
    expectAuthError(() => {
      assertAllowedCampusUrl(new URL(url));
    }, 'UNTRUSTED_URL');
  });

  // CAS sends accounts owing a profile here instead of issuing a ticket. It stays
  // blocked -- the page is a form no headless login can finish -- but a bare
  // "untrusted redirect" tells the student nothing about what to go and do.
  it('names the profile gate rather than reporting an untrusted redirect', () => {
    expectAuthError(() => {
      assertAllowedCampusUrl(
        new URL(
          'https://authserver-443.webvpn.nbt.edu.cn/authserver/improveInfo/improveUserInfo.do?service=https%3A%2F%2Fwebvpn.nbt.edu.cn%2Fusers%2Fauth%2Fcas%2Fcallback%3Furl',
        ),
      );
    }, 'PROFILE_INCOMPLETE');
  });
});

describe('cookie transport', () => {
  it('keeps cookies in its private jar and rejects caller-supplied cookies', async () => {
    const baseFetch = vi.fn((input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : input.toString();
      return Promise.resolve(
        mockResponse(url, 'ok', {
          headers: { 'set-cookie': 'sid=opaque; Secure; HttpOnly; Path=/' },
        }),
      );
    }) as unknown as typeof fetch;
    const session = createCampusCookieSession({ baseFetch });
    await session.request(new URL('https://webvpn.nbt.edu.cn/'));
    expect((await session.serialize()).cookies).toHaveLength(1);
    await expect(
      session.request(new URL('https://webvpn.nbt.edu.cn/'), {
        headers: { Cookie: 'attacker=value' },
      }),
    ).rejects.toBeInstanceOf(AuthError);
    await session.close();
  });

  it('preserves jar cookies when fetch-cookie follows a Request redirect', async () => {
    let redirectedCookie: string | null = null;
    const baseFetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      for (const [name, value] of new Headers(init?.headers)) headers.set(name, value);
      if (url.pathname === '/') {
        return Promise.resolve(
          mockResponse(url.href, '', {
            status: 302,
            headers: {
              location: '/users/sign_in',
              'set-cookie': 'sid=opaque; Secure; HttpOnly; Path=/',
            },
          }),
        );
      }
      redirectedCookie = headers.get('cookie');
      return Promise.resolve(mockResponse(url.href));
    }) as unknown as typeof fetch;
    const session = createCampusCookieSession({ baseFetch });
    await session.request(new URL('https://webvpn.nbt.edu.cn/'));
    expect(redirectedCookie).toBe('sid=opaque');
    await session.close();
  });

  it('treats a redirect to the JWXT login page as an expired session', async () => {
    const baseFetch = vi.fn((input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname === '/jwglxt/kbcx/xskbcx_cxXsgrkb.html') {
        return Promise.resolve(
          mockResponse(url.href, '', {
            status: 302,
            headers: { location: '/jwglxt/xtgl/login_slogin.html' },
          }),
        );
      }
      return Promise.resolve(mockResponse(url.href, '<form id="login"></form>'));
    }) as unknown as typeof fetch;
    const session = createCampusCookieSession({ baseFetch });
    await expect(
      session.timetableTransport(
        new URL('https://jwxt-443.webvpn.nbt.edu.cn/jwglxt/kbcx/xskbcx_cxXsgrkb.html'),
        { method: 'POST' },
      ),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    await session.close();
  });

  it('does not expose an underlying abort message', async () => {
    const session = createCampusCookieSession({
      baseFetch: () => Promise.reject(new DOMException('private abort marker', 'AbortError')),
    });
    let caught: unknown;
    try {
      await session.request(new URL('https://webvpn.nbt.edu.cn/'));
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ name: 'AbortError' });
    expect(String(caught)).not.toContain('private abort marker');
  });

  it.each([
    ['before the headers', false],
    ['after the headers', true],
  ])('times out a response that stalls %s', async (_label, sendHeaders) => {
    const server = http.createServer((_request, response) => {
      if (!sendHeaders) return;
      response.writeHead(200, { 'content-type': 'text/html' });
      response.write('<html>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const session = createCampusCookieSession({
        timeoutMs: 200,
        baseFetch: (_input, init) => globalThis.fetch(`http://127.0.0.1:${port}/`, init),
      });
      const caught = await session
        .request(new URL('https://webvpn.nbt.edu.cn/'))
        .then((response) => response.text())
        .catch((error: unknown) => error);
      expect(caught).toBeInstanceOf(AuthError);
      expect(caught).toMatchObject({ code: 'TIMEOUT' });
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});
