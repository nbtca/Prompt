import { describe, expect, it, vi } from 'vitest';
import { encryptCampusPassword, loginWithStudentPassword } from './nbt-auth.js';
import { AuthError } from './errors.js';

function mockResponse(url: string, body: string, init: ResponseInit = {}): Response {
  const response = new Response(body, init);
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

const loginPage = `
  <form id="pwdFromId" action="/authserver/login">
    <input id="execution" name="execution" value="execution-token">
    <input id="pwdEncryptSalt" value="1234567890abcdef">
    <div id="showErrorTip"></div>
    <div hidden class="sliderCaptcha captcha-container"></div>
  </form>`;

function inputUrl(input: string | URL | Request): URL {
  return new URL(input instanceof Request ? input.url : input.toString());
}

describe('encryptCampusPassword', () => {
  it('matches the campus AES-CBC format with deterministic random input', () => {
    const encrypted = encryptCampusPassword(
      'secret',
      '1234567890abcdef',
      (size) => new Uint8Array(size),
    );
    expect(encrypted).toBe(
      'Y2fkMlmY/KyUHnWiA9lVrpgeY3fUtkeysNtjTP8jDWeof6ZJyPt0i8Xy7tejPD9rcfGdHPtZ26ZMgRksPL5q3mt826hLU3QVWAd+UpLJnh4=',
    );
  });

  it('fails closed if the encryption salt changes shape', () => {
    let caught: unknown;
    try {
      encryptCampusPassword('secret', 'short', (size) => new Uint8Array(size));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AuthError);
    if (caught instanceof AuthError) expect(caught.code).toBe('LOGIN_PAGE_CHANGED');
  });
});

describe('loginWithStudentPassword', () => {
  it('confirms login through a positive JWXT timetable marker and persists no password', async () => {
    const submittedBodies: string[] = [];
    const baseFetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = inputUrl(input);
      if (url.hostname === 'webvpn.nbt.edu.cn') {
        return Promise.resolve(
          mockResponse(
            'https://authserver-443.webvpn.nbt.edu.cn/authserver/login?service=https%3A%2F%2Fwebvpn.nbt.edu.cn%2Fusers%2Fauth%2Fcas%2Fcallback',
            loginPage,
          ),
        );
      }
      if (url.pathname.endsWith('/checkNeedCaptcha.htl')) {
        return Promise.resolve(
          mockResponse(url.href, '{"isNeed":false}', {
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      if (url.hostname === 'authserver-443.webvpn.nbt.edu.cn') {
        const body = init?.body;
        submittedBodies.push(typeof body === 'string' ? body : '');
        return Promise.resolve(
          mockResponse('https://webvpn.nbt.edu.cn/', '<html>signed in</html>', {
            headers: { 'set-cookie': 'webvpn=opaque; Secure; HttpOnly; Path=/' },
          }),
        );
      }
      if (url.pathname.endsWith('cxXskbcxIndex.html')) {
        return Promise.resolve(
          mockResponse(
            url.href,
            `
          <select id="xnm"><option value="2026">2026-2027</option></select>
          <select name="xqm"><option value="3">第一学期</option></select>`,
          ),
        );
      }
      return Promise.resolve(mockResponse(url.href, '<html>jwxt</html>'));
    }) as unknown as typeof fetch;

    const password = 'local-test-password';
    const session = await loginWithStudentPassword('3240000000', password, {
      baseFetch,
      randomBytes: (size) => new Uint8Array(size),
      now: () => new Date('2026-07-10T08:00:00Z'),
    });
    const persisted = await session.snapshot(new Date('2026-07-10T08:01:00Z'));
    const serialized = JSON.stringify(persisted);
    expect(persisted.accountHint).toBe('••••••••00');
    expect(persisted.expiresAt).toBe('2026-07-17T08:01:00.000Z');
    expect(serialized).not.toContain('3240000000');
    expect(serialized).not.toContain(password);
    expect(submittedBodies).toHaveLength(1);
    expect(submittedBodies[0]).not.toContain(password);
    expect(submittedBodies[0]).toContain('username=3240000000');
    await session.close();
  });

  it('stops before password submission when the account needs a slider challenge', async () => {
    let postedCredentials = false;
    const baseFetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = inputUrl(input);
      if (url.hostname === 'webvpn.nbt.edu.cn') {
        return Promise.resolve(
          mockResponse(
            'https://authserver-443.webvpn.nbt.edu.cn/authserver/login?service=https%3A%2F%2Fwebvpn.nbt.edu.cn%2Fusers%2Fauth%2Fcas%2Fcallback',
            loginPage,
          ),
        );
      }
      if (url.pathname.endsWith('/checkNeedCaptcha.htl')) {
        return Promise.resolve(mockResponse(url.href, '{"isNeed":true}'));
      }
      if (init?.method === 'POST') postedCredentials = true;
      return Promise.resolve(mockResponse(url.href, 'unexpected'));
    }) as unknown as typeof fetch;

    await expect(
      loginWithStudentPassword('3240000000', 'not-submitted', { baseFetch }),
    ).rejects.toMatchObject({ code: 'INTERACTIVE_CHALLENGE' });
    expect(postedCredentials).toBe(false);
  });

  // The campus authserver answers a rejected login with HTTP 401, never 200.
  function rejectingFetch(
    tip: string,
    init: ResponseInit = { status: 401 },
  ): { baseFetch: typeof fetch; credentialHeaders: Headers[] } {
    const credentialHeaders: Headers[] = [];
    const baseFetch = vi.fn((input: string | URL | Request, requestInit?: RequestInit) => {
      const url = inputUrl(input);
      if (url.hostname === 'webvpn.nbt.edu.cn') {
        return Promise.resolve(
          mockResponse(
            'https://authserver-443.webvpn.nbt.edu.cn/authserver/login?service=https%3A%2F%2Fwebvpn.nbt.edu.cn%2Fusers%2Fauth%2Fcas%2Fcallback',
            loginPage,
          ),
        );
      }
      if (url.pathname.endsWith('/checkNeedCaptcha.htl')) {
        return Promise.resolve(mockResponse(url.href, '{"isNeed":false}'));
      }
      credentialHeaders.push(new Headers(requestInit?.headers));
      return Promise.resolve(
        mockResponse(
          url.href,
          loginPage.replace('<div id="showErrorTip"></div>', `<div id="showErrorTip">${tip}</div>`),
          init,
        ),
      );
    }) as unknown as typeof fetch;
    return { baseFetch, credentialHeaders };
  }

  async function rejectionCode(tip: string, init?: ResponseInit): Promise<unknown> {
    const { baseFetch } = rejectingFetch(tip, init);
    try {
      await loginWithStudentPassword('3240000000', 'wrong', { baseFetch });
    } catch (error) {
      return error;
    }
    return null;
  }

  it('classifies a credential rejection without returning remote HTML', async () => {
    const marker = 'private-remote-marker';
    const caught = await rejectionCode(`用户名或密码错误 ${marker}`);
    expect(caught).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(String(caught)).not.toContain(marker);
  });

  it('still reports a lockout that mentions the password', async () => {
    await expect(rejectionCode('密码错误次数过多，账户已被锁定')).resolves.toMatchObject({
      code: 'ACCOUNT_LOCKED',
    });
  });

  it('reports an inactive account that carries no credential wording', async () => {
    await expect(rejectionCode('该帐号尚未激活')).resolves.toMatchObject({
      code: 'ACCOUNT_INACTIVE',
    });
  });

  // The three shapes one campus rejection takes: bare message key (no locale
  // negotiated, which is what the CLI gets), zh_CN, and en.
  it.each([
    ['accountLogin_account_pwd_error'],
    ['您提供的用户名或者密码有误，首次登录请先帐号激活'],
    ['username or password is incorrect'],
  ])('classifies the campus credential rejection rendered as %s', async (tip) => {
    await expect(rejectionCode(tip)).resolves.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('negotiates no locale, so the campus keeps rendering the message key', async () => {
    const { baseFetch, credentialHeaders } = rejectingFetch('accountLogin_account_pwd_error');
    await expect(
      loginWithStudentPassword('3240000000', 'wrong', { baseFetch }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(credentialHeaders[0]?.get('accept-language')).toBeNull();
  });

  it('does not treat a 401 without a login form as a successful login', async () => {
    const baseFetch = vi.fn((input: string | URL | Request) => {
      const url = inputUrl(input);
      if (url.hostname === 'webvpn.nbt.edu.cn') {
        return Promise.resolve(
          mockResponse(
            'https://authserver-443.webvpn.nbt.edu.cn/authserver/login?service=https%3A%2F%2Fwebvpn.nbt.edu.cn%2Fusers%2Fauth%2Fcas%2Fcallback',
            loginPage,
          ),
        );
      }
      if (url.pathname.endsWith('/checkNeedCaptcha.htl')) {
        return Promise.resolve(mockResponse(url.href, '{"isNeed":false}'));
      }
      return Promise.resolve(mockResponse(url.href, 'gateway down', { status: 401 }));
    }) as unknown as typeof fetch;

    await expect(
      loginWithStudentPassword('3240000000', 'wrong', { baseFetch }),
    ).rejects.toBeInstanceOf(AuthError);
  });
});
