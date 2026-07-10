import { describe, expect, it, vi } from 'vitest';
import { encryptCampusPassword, loginWithStudentPassword } from './nbt-auth.js';

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
    const encrypted = encryptCampusPassword('secret', '1234567890abcdef', (size) => new Uint8Array(size));
    expect(encrypted).toBe(
      'Y2fkMlmY/KyUHnWiA9lVrpgeY3fUtkeysNtjTP8jDWeof6ZJyPt0i8Xy7tejPD9rcfGdHPtZ26ZMgRksPL5q3mt826hLU3QVWAd+UpLJnh4=',
    );
  });

  it('fails closed if the encryption salt changes shape', () => {
    expect(() => encryptCampusPassword('secret', 'short', (size) => new Uint8Array(size)))
      .toThrowError(expect.objectContaining({ code: 'LOGIN_PAGE_CHANGED' }));
  });
});

describe('loginWithStudentPassword', () => {
  it('confirms login through a positive JWXT timetable marker and persists no password', async () => {
    const submittedBodies: string[] = [];
    const baseFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = inputUrl(input);
      if (url.hostname === 'webvpn.nbt.edu.cn') {
        return mockResponse(
          'https://authserver-443.webvpn.nbt.edu.cn/authserver/login?service=https%3A%2F%2Fwebvpn.nbt.edu.cn%2Fusers%2Fauth%2Fcas%2Fcallback',
          loginPage,
        );
      }
      if (url.pathname.endsWith('/checkNeedCaptcha.htl')) {
        return mockResponse(url.href, '{"isNeed":false}', { headers: { 'content-type': 'application/json' } });
      }
      if (url.hostname === 'authserver-443.webvpn.nbt.edu.cn') {
        submittedBodies.push(String(init?.body ?? ''));
        return mockResponse('https://webvpn.nbt.edu.cn/', '<html>signed in</html>', {
          headers: { 'set-cookie': 'webvpn=opaque; Secure; HttpOnly; Path=/' },
        });
      }
      if (url.pathname.endsWith('cxXskbcxIndex.html')) {
        return mockResponse(url.href, `
          <select id="xnm"><option value="2026">2026-2027</option></select>
          <select name="xqm"><option value="3">第一学期</option></select>`);
      }
      return mockResponse(url.href, '<html>jwxt</html>');
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
    const baseFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = inputUrl(input);
      if (url.hostname === 'webvpn.nbt.edu.cn') {
        return mockResponse(
          'https://authserver-443.webvpn.nbt.edu.cn/authserver/login?service=https%3A%2F%2Fwebvpn.nbt.edu.cn%2Fusers%2Fauth%2Fcas%2Fcallback',
          loginPage,
        );
      }
      if (url.pathname.endsWith('/checkNeedCaptcha.htl')) {
        return mockResponse(url.href, '{"isNeed":true}');
      }
      if (init?.method === 'POST') postedCredentials = true;
      return mockResponse(url.href, 'unexpected');
    }) as unknown as typeof fetch;

    await expect(loginWithStudentPassword('3240000000', 'not-submitted', { baseFetch }))
      .rejects.toMatchObject({ code: 'INTERACTIVE_CHALLENGE' });
    expect(postedCredentials).toBe(false);
  });

  it('classifies a credential rejection without returning remote HTML', async () => {
    const marker = 'private-remote-marker';
    const baseFetch = vi.fn(async (input: string | URL | Request) => {
      const url = inputUrl(input);
      if (url.hostname === 'webvpn.nbt.edu.cn') {
        return mockResponse(
          'https://authserver-443.webvpn.nbt.edu.cn/authserver/login?service=https%3A%2F%2Fwebvpn.nbt.edu.cn%2Fusers%2Fauth%2Fcas%2Fcallback',
          loginPage,
        );
      }
      if (url.pathname.endsWith('/checkNeedCaptcha.htl')) return mockResponse(url.href, '{"isNeed":false}');
      return mockResponse(url.href, loginPage.replace(
        '<div id="showErrorTip"></div>',
        `<div id="showErrorTip">用户名或密码错误 ${marker}</div>`,
      ));
    }) as unknown as typeof fetch;

    let caught: unknown;
    try { await loginWithStudentPassword('3240000000', 'wrong', { baseFetch }); } catch (error) { caught = error; }
    expect(caught).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(String(caught)).not.toContain(marker);
  });
});
