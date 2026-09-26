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

  const withTip = (tip: string) =>
    loginPage.replace('<div id="showErrorTip"></div>', `<div id="showErrorTip">${tip}</div>`);

  interface Credentials {
    url: URL;
    headers: Headers;
    body: URLSearchParams;
  }

  // The campus authserver answers a rejected login with HTTP 401, never 200.
  function rejectingFetch(
    rejection: string,
    init: ResponseInit = { status: 401 },
    login = loginPage,
  ): { baseFetch: typeof fetch; credentials: Credentials[] } {
    const credentials: Credentials[] = [];
    const baseFetch = vi.fn((input: string | URL | Request, requestInit?: RequestInit) => {
      const url = inputUrl(input);
      if (url.hostname === 'webvpn.nbt.edu.cn') {
        return Promise.resolve(
          mockResponse(
            'https://authserver-443.webvpn.nbt.edu.cn/authserver/login?service=https%3A%2F%2Fwebvpn.nbt.edu.cn%2Fusers%2Fauth%2Fcas%2Fcallback',
            login,
          ),
        );
      }
      if (url.pathname.endsWith('/checkNeedCaptcha.htl')) {
        return Promise.resolve(mockResponse(url.href, '{"isNeed":false}'));
      }
      const body = requestInit?.body;
      credentials.push({
        url,
        headers: new Headers(requestInit?.headers),
        body: new URLSearchParams(typeof body === 'string' ? body : ''),
      });
      return Promise.resolve(mockResponse(url.href, rejection, init));
    }) as unknown as typeof fetch;
    return { baseFetch, credentials };
  }

  async function rejectionCode(rejection: string, init?: ResponseInit): Promise<unknown> {
    const { baseFetch } = rejectingFetch(rejection, init);
    try {
      await loginWithStudentPassword('3240000000', 'wrong', { baseFetch });
    } catch (error) {
      return error;
    }
    return null;
  }

  it('classifies a credential rejection without returning remote HTML', async () => {
    const marker = 'private-remote-marker';
    const caught = await rejectionCode(withTip(`用户名或密码错误 ${marker}`));
    expect(caught).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(String(caught)).not.toContain(marker);
  });

  it('still reports a lockout that mentions the password', async () => {
    await expect(rejectionCode(withTip('密码错误次数过多，账户已被锁定'))).resolves.toMatchObject({
      code: 'ACCOUNT_LOCKED',
    });
  });

  it('reports an inactive account that carries no credential wording', async () => {
    await expect(rejectionCode(withTip('该帐号尚未激活'))).resolves.toMatchObject({
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
    await expect(rejectionCode(withTip(tip))).resolves.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('negotiates no locale, so the campus keeps rendering the message key', async () => {
    const { baseFetch, credentials } = rejectingFetch(withTip('accountLogin_account_pwd_error'));
    await expect(
      loginWithStudentPassword('3240000000', 'wrong', { baseFetch }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(credentials[0]?.headers.get('accept-language')).toBeNull();
  });

  it('does not treat a 401 without a login form as a successful login', async () => {
    await expect(rejectionCode('gateway down')).resolves.toBeInstanceOf(AuthError);
  });

  const salt = '1234567890abcdef';
  const fields = `<input name="execution" value="e"><input id="pwdEncryptSalt" value="${salt}">`;
  const authserver = 'https://authserver-443.webvpn.nbt.edu.cn';
  const service = 'service=https%3A%2F%2Fwebvpn.nbt.edu.cn%2Fusers%2Fauth%2Fcas%2Fcallback';

  it.each<[string, string, { action: string; execution: string; salt?: string } | string]>([
    [
      'uppercase tags, reordered attributes and single quotes',
      `<FORM ACTION="/authserver/login?f=a" ID="pwdFromId"><INPUT VALUE="ex" NAME="execution"><Input Value='${salt}' iD='pwdEncryptSalt'></FORM>`,
      { action: `/authserver/login?f=a&${service}`, execution: 'ex' },
    ],
    [
      'unquoted attributes',
      `<form id=pwdFromId action=/authserver/login?f=a><input name=execution value=abc/def><input id=pwdEncryptSalt value=${salt}></form>`,
      { action: `/authserver/login?f=a&${service}`, execution: 'abc/def' },
    ],
    [
      'character references in attribute values',
      `<form id="pwdFromId" action="/authserver/login?x=1&amp;y=2&ampz=3"><input name="execution" value="e&amp;x&#65;&#x42;&lt;&gt;&quot;&apos;&nbsp;z&amp"><input id="pwdEncryptSalt" value="${salt}"></form>`,
      { action: `/authserver/login?x=1&y=2&ampz=3&${service}`, execution: 'e&xAB<>"\' z&' },
    ],
    [
      'a decoy form inside a comment',
      `<!-- <form id="pwdFromId" action="/authserver/login?f=decoy"><input name="execution" value="decoy"> --><form id="pwdFromId" action="/authserver/login?f=real">${fields}</form>`,
      { action: `/authserver/login?f=real&${service}`, execution: 'e' },
    ],
    [
      'decoy forms inside scripts',
      `<script>var f = '<form id="pwdFromId" action="/authserver/login?f=decoy"><input name="execution" value="decoy">';</script><script><!--<script>x</script>--></script><form id="pwdFromId" action="/authserver/login?f=real">${fields}</form>`,
      { action: `/authserver/login?f=real&${service}`, execution: 'e' },
    ],
    [
      'decoys inside textarea, title and template',
      `<textarea><form id="pwdFromId" action="/authserver/login?f=t1"></textarea><title><form id="pwdFromId" action="/authserver/login?f=t2"></title><form id="pwdFromId" action="/authserver/login?f=real"><template><input name="execution" value="tpl"></template>${fields}</form>`,
      { action: `/authserver/login?f=real&${service}`, execution: 'e' },
    ],
    [
      'fields spread across sibling forms',
      `<form id="pwdFromId" action="/authserver/login?f=first"><input name="execution" value="e1"></form><form id="pwdFromId" action="/authserver/login?f=second"><input name="execution" value="e2"><input id="pwdEncryptSalt" value="${salt}"></form>`,
      { action: `/authserver/login?f=first&${service}`, execution: 'e1' },
    ],
    [
      'the first matching field in document order',
      `<form id="pwdFromId" action="/authserver/login?f=a"><input id="execution" value="by-id"><input name="execution" value="by-name"><input name="pwdEncryptSalt" value="fedcba0987654321"><input id="pwdEncryptSalt" value="${salt}"></form>`,
      { action: `/authserver/login?f=a&${service}`, execution: 'by-id', salt: 'fedcba0987654321' },
    ],
    [
      'the campus page layout',
      `<!DOCTYPE html><html><head><title>统一身份认证</title><script>var pwdFromId = '<form id="pwdFromId">';</script></head><body><div class="auth_login_content"><form id="pwdFromId" class="loginFromClass" method="post" action="/authserver/login?${service}"><input type="hidden" id="execution" name="execution" value="e3a6b8c1_ZXlKaGJHY2lPaUpJVXpVeE1pSjk="><input type="hidden" id="pwdEncryptSalt" value="${salt}"><span id="showErrorTip" class="form-error"></span></form></div></body></html>`,
      {
        action: `/authserver/login?${service}`,
        execution: 'e3a6b8c1_ZXlKaGJHY2lPaUpJVXpVeE1pSjk=',
      },
    ],
    ['no login form', `<div>${fields}</div>`, 'LOGIN_PAGE_CHANGED'],
    [
      'a nested form tag, which HTML ignores',
      `<form id="pwdFromId" action="/authserver/login?f=a"><form id="inner" action="/authserver/login?f=inner"><input name="execution" value="e"></form><input id="pwdEncryptSalt" value="${salt}"></form>`,
      'LOGIN_PAGE_CHANGED',
    ],
    [
      'a field that is not an input',
      `<form id="pwdFromId" action="/authserver/login?f=a"><span id="execution">x</span>${fields}</form>`,
      'LOGIN_PAGE_CHANGED',
    ],
  ])('reads the login form with %s', async (_name, login, expected) => {
    const { baseFetch, credentials } = rejectingFetch(withTip('pwd'), undefined, login);
    const zeros = (size: number) => new Uint8Array(size);
    const caught = await loginWithStudentPassword('3240000000', 'wrong', {
      baseFetch,
      randomBytes: zeros,
    }).catch((error: unknown) => error);
    if (typeof expected === 'string') {
      expect(caught).toMatchObject({ code: expected });
      expect(credentials).toHaveLength(0);
      return;
    }
    expect(caught).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(credentials[0]?.url.href).toBe(authserver + expected.action);
    expect(credentials[0]?.body.get('execution')).toBe(expected.execution);
    expect(credentials[0]?.body.get('password')).toBe(
      encryptCampusPassword('wrong', expected.salt ?? salt, zeros),
    );
  });

  it.each([
    [
      'nested tags inside the tip',
      '<div id="showErrorTip"><span>用户名</span><b>或<i>密码</i></b>错误</div>',
      'INVALID_CREDENTIALS',
    ],
    [
      'a comment inside the tip',
      '<div id="showErrorTip"><!-- 锁定 -->用户名或密码错误</div>',
      'INVALID_CREDENTIALS',
    ],
    [
      'script text inside the tip, which is not visible',
      '<div id="showErrorTip"><script>var m = "账户已被锁定";</script>用户名或密码错误</div>',
      'INVALID_CREDENTIALS',
    ],
    [
      'character references',
      '<div id="showErrorTip">&#29992;&#x6237;&#21517;&nbsp;&lt;b&gt;</div>',
      'INVALID_CREDENTIALS',
    ],
    [
      'text split across two tips with the same id',
      '<div id="showErrorTip">用户</div><div id="showErrorTip">名或密码错误</div>',
      'INVALID_CREDENTIALS',
    ],
    [
      'the warning tip, error message and alert class together',
      '<span id="showWarnTip">请输入验证码</span><p id="errorMsg">x</p><div class="a alert-danger b">账户已被锁定</div>',
      'ACCOUNT_LOCKED',
    ],
    [
      'ids and classes that differ in case or suffix',
      '<div class="ALERT-DANGER">锁定</div><div id="ShowErrorTip">锁定</div><div class="alert-dangerous">锁定</div>',
      'UNEXPECTED_RESPONSE',
    ],
  ])('classifies a rejection page with %s', async (_name, tips, code) => {
    await expect(rejectionCode(tips + loginPage)).resolves.toMatchObject({ code });
  });
});
