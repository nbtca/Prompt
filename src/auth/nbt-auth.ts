import { createCipheriv, randomBytes } from 'node:crypto';
import { load } from 'cheerio';
import { AuthError } from './errors.js';
import {
  JWXT_HOST,
  cookieSessionFromSerialized,
  createCampusCookieSession,
  type CampusCookieSession,
  type CreateCampusCookieSessionOptions,
} from './cookie-transport.js';
import type { PersistedNbtSession } from './session-store.js';

const WEBVPN_ENTRY = new URL('https://webvpn.nbt.edu.cn/');
const SSO_ENTRY = new URL(`https://${JWXT_HOST}/sso/jziotlogin`);
const JWXT_MENU = new URL(`https://${JWXT_HOST}/jwglxt/xtgl/index_initMenu.html`);
const TIMETABLE_INDEX = new URL(
  `https://${JWXT_HOST}/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N2151&layout=default`,
);
const RANDOM_ALPHABET = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';
const MAX_AUTH_HTML_BYTES = 2 * 1024 * 1024;
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type RandomBytesSource = (size: number) => Uint8Array;

export interface LoginOptions extends Omit<CreateCampusCookieSessionOptions, 'jar'> {
  now?: () => Date;
  randomBytes?: RandomBytesSource;
  signal?: AbortSignal;
}

export interface AuthenticatedNbtSession {
  readonly accountHint: string | undefined;
  readonly timetableTransport: (url: URL, init: RequestInit) => Promise<Response>;
  snapshot(validatedAt?: Date): Promise<PersistedNbtSession>;
  close(): Promise<void>;
}

interface LoginForm {
  action: URL;
  execution: string;
  salt: string;
}

function randomCharacters(length: number, source: RandomBytesSource): string {
  const bytes = source(length);
  if (bytes.length < length) throw new AuthError('LOGIN_PAGE_CHANGED', 'credentials', 'Secure login initialization failed.');
  let result = '';
  for (let index = 0; index < length; index += 1) {
    result += RANDOM_ALPHABET[bytes[index]! % RANDOM_ALPHABET.length];
  }
  return result;
}

export function encryptCampusPassword(
  password: string,
  salt: string,
  source: RandomBytesSource = randomBytes,
): string {
  const key = Buffer.from(salt, 'utf8');
  if (key.length !== 16) {
    key.fill(0);
    throw new AuthError('LOGIN_PAGE_CHANGED', 'credentials', 'The campus login page changed unexpectedly.');
  }
  const ivText = randomCharacters(16, source);
  const prefix = randomCharacters(64, source);
  const iv = Buffer.from(ivText, 'utf8');
  const plaintext = Buffer.from(prefix + password, 'utf8');
  try {
    const cipher = createCipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([cipher.update(plaintext), cipher.final()]).toString('base64');
  } finally {
    key.fill(0);
    iv.fill(0);
    plaintext.fill(0);
  }
}

function parseLoginForm(html: string, responseUrl: string): LoginForm {
  const $ = load(html);
  const form = $('#pwdFromId');
  const execution = String(form.find('input[name="execution"], #execution').first().val() ?? '').trim();
  const salt = String(form.find('#pwdEncryptSalt, input[name="pwdEncryptSalt"]').first().val() ?? '').trim();
  const actionValue = form.attr('action');
  if (form.length === 0 || !execution || !salt || !actionValue) {
    throw new AuthError('LOGIN_PAGE_CHANGED', 'login-page', 'The campus login page changed unexpectedly.');
  }

  let current: URL;
  let action: URL;
  try {
    current = new URL(responseUrl);
    action = new URL(actionValue, current);
  } catch {
    throw new AuthError('LOGIN_PAGE_CHANGED', 'login-page', 'The campus login page changed unexpectedly.');
  }
  const service = current.searchParams.get('service');
  if (service && !action.searchParams.has('service')) action.searchParams.set('service', service);
  return { action, execution, salt };
}

function hasLoginFingerprint(html: string): boolean {
  return /(?:id=["']pwdFromId["']|id=["']pwdEncryptSalt["']|name=["']execution["'])/i.test(html);
}

function classifyRejectedLogin(html: string): AuthError {
  const $ = load(html);
  const visibleError = [
    $('#showErrorTip').text(),
    $('#showWarnTip').text(),
    $('#errorMsg').text(),
    $('.alert-danger').text(),
  ].join(' ').replace(/\s+/g, ' ').trim();
  if (/锁定|冻结|次数过多|稍后再试/.test(visibleError)) {
    return new AuthError('ACCOUNT_LOCKED', 'credentials', 'The campus account is temporarily locked.');
  }
  if (/激活|未启用/.test(visibleError)) {
    return new AuthError('ACCOUNT_INACTIVE', 'credentials', 'The campus account must be activated first.');
  }
  if (/验证码|滑块|captcha/i.test(visibleError)) {
    return new AuthError(
      'INTERACTIVE_CHALLENGE',
      'credentials',
      'The campus login requires an interactive browser challenge.',
    );
  }
  if (/用户名|账号|密码|credential|password/i.test(visibleError)) {
    return new AuthError('INVALID_CREDENTIALS', 'credentials', 'The student id or password was rejected.');
  }
  return new AuthError('UNEXPECTED_RESPONSE', 'credentials', 'Campus login could not be confirmed.');
}

async function readText(response: Response, stage: 'login-page' | 'challenge-check' | 'credentials' | 'sso'): Promise<string> {
  if (response.status < 200 || response.status >= 300) {
    throw new AuthError('HTTP_ERROR', stage, 'The campus service returned an error.', { retryable: response.status >= 500 });
  }
  const length = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(length) && length > MAX_AUTH_HTML_BYTES) {
    throw new AuthError('UNEXPECTED_RESPONSE', stage, 'The campus service returned an unexpected response.');
  }
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_AUTH_HTML_BYTES) {
    throw new AuthError('UNEXPECTED_RESPONSE', stage, 'The campus service returned an unexpected response.');
  }
  return text;
}

async function challengeRequired(
  cookies: CampusCookieSession,
  loginUrl: URL,
  username: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const endpoint = new URL('/authserver/checkNeedCaptcha.htl', loginUrl);
  endpoint.searchParams.set('username', username);
  const response = await cookies.request(endpoint, {
    method: 'GET',
    headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    signal,
  }, 'challenge-check');
  const text = await readText(response, 'challenge-check');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new AuthError('LOGIN_PAGE_CHANGED', 'challenge-check', 'The campus challenge response changed unexpectedly.');
  }
  if (typeof parsed === 'boolean') return parsed;
  if (typeof parsed === 'object' && parsed !== null) {
    const value = Reflect.get(parsed, 'isNeed') ?? Reflect.get(parsed, 'needCaptcha');
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
  }
  throw new AuthError('LOGIN_PAGE_CHANGED', 'challenge-check', 'The campus challenge response changed unexpectedly.');
}

function maskAccountId(username: string): string {
  const characters = [...username];
  if (characters.length <= 2) return '•'.repeat(characters.length);
  return `${'•'.repeat(characters.length - 2)}${characters.slice(-2).join('')}`;
}

function createAuthenticatedSession(
  cookies: CampusCookieSession,
  metadata: {
    accountHint?: string;
    authenticatedAt: string;
  },
): AuthenticatedNbtSession {
  return {
    accountHint: metadata.accountHint,
    timetableTransport: (url, init) => cookies.timetableTransport(url, init),
    async snapshot(validatedAt = new Date()) {
      const validatedAtText = validatedAt.toISOString();
      return {
        version: 1,
        provider: 'nbt-webvpn',
        jar: await cookies.serialize(),
        accountHint: metadata.accountHint,
        authenticatedAt: metadata.authenticatedAt,
        validatedAt: validatedAtText,
        expiresAt: new Date(validatedAt.getTime() + SESSION_MAX_AGE_MS).toISOString(),
      };
    },
    close: () => cookies.close(),
  };
}

async function verifyJwxtSession(cookies: CampusCookieSession, signal?: AbortSignal): Promise<void> {
  await readText(await cookies.request(SSO_ENTRY, { method: 'GET', signal }, 'sso'), 'sso');
  await readText(await cookies.request(JWXT_MENU, { method: 'GET', signal }, 'sso'), 'sso');
  const response = await cookies.request(TIMETABLE_INDEX, { method: 'GET', signal }, 'sso');
  const html = await readText(response, 'sso');
  let finalUrl: URL;
  try { finalUrl = new URL(response.url); } catch {
    throw new AuthError('UNEXPECTED_RESPONSE', 'sso', 'Campus login could not be confirmed.');
  }
  if (
    finalUrl.hostname.toLowerCase() !== JWXT_HOST
    || hasLoginFingerprint(html)
    || !/<select\b[^>]*(?:id|name)=["']xnm["']/i.test(html)
    || !/<select\b[^>]*(?:id|name)=["']xqm["']/i.test(html)
  ) {
    throw new AuthError('UNEXPECTED_RESPONSE', 'sso', 'Campus login could not be confirmed.');
  }
}

export async function loginWithStudentPassword(
  username: string,
  password: string,
  options: LoginOptions = {},
): Promise<AuthenticatedNbtSession> {
  if (!username.trim() || !password) {
    throw new AuthError('INVALID_CREDENTIALS', 'credentials', 'Student id and password are required.');
  }
  const normalizedUsername = username.trim();
  const cookies = createCampusCookieSession(options);
  try {
    const loginResponse = await cookies.request(WEBVPN_ENTRY, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: options.signal,
    }, 'login-page');
    const loginHtml = await readText(loginResponse, 'login-page');
    const form = parseLoginForm(loginHtml, loginResponse.url);

    if (await challengeRequired(cookies, form.action, normalizedUsername, options.signal)) {
      throw new AuthError(
        'INTERACTIVE_CHALLENGE',
        'challenge-check',
        'The campus login requires an interactive browser challenge.',
      );
    }

    const encryptedPassword = encryptCampusPassword(
      password,
      form.salt,
      options.randomBytes ?? randomBytes,
    );
    const body = new URLSearchParams({
      username: normalizedUsername,
      password: encryptedPassword,
      _eventId: 'submit',
      cllt: 'userNameLogin',
      dllt: 'generalLogin',
      execution: form.execution,
    });
    const credentialResponse = await cookies.request(form.action, {
      method: 'POST',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: loginResponse.url,
      },
      body: body.toString(),
      signal: options.signal,
    }, 'credentials');
    const credentialHtml = await readText(credentialResponse, 'credentials');
    if (hasLoginFingerprint(credentialHtml)) throw classifyRejectedLogin(credentialHtml);

    await verifyJwxtSession(cookies, options.signal);
    const authenticatedAt = (options.now ?? (() => new Date()))().toISOString();
    return createAuthenticatedSession(cookies, {
      accountHint: maskAccountId(normalizedUsername),
      authenticatedAt,
    });
  } catch (error) {
    await cookies.close();
    if (error instanceof AuthError) throw error;
    if (typeof error === 'object' && error !== null && Reflect.get(error, 'name') === 'AbortError') throw error;
    throw new AuthError('NETWORK', 'credentials', 'The campus login request failed.', { retryable: true });
  }
}

export async function restoreNbtSession(
  persisted: PersistedNbtSession,
  options: Omit<CreateCampusCookieSessionOptions, 'jar'> = {},
): Promise<AuthenticatedNbtSession> {
  const cookies = await cookieSessionFromSerialized(persisted.jar, options);
  return createAuthenticatedSession(cookies, {
    accountHint: persisted.accountHint,
    authenticatedAt: persisted.authenticatedAt,
  });
}
