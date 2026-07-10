export type AuthErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'UNTRUSTED_URL'
  | 'HTTP_ERROR'
  | 'LOGIN_PAGE_CHANGED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_INACTIVE'
  | 'INTERACTIVE_CHALLENGE'
  | 'UNEXPECTED_RESPONSE'
  | 'SESSION_EXPIRED';

export type AuthStage = 'login-page' | 'challenge-check' | 'credentials' | 'sso' | 'session';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly stage: AuthStage;
  readonly retryable: boolean;

  constructor(
    code: AuthErrorCode,
    stage: AuthStage,
    message: string,
    options: { retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.stage = stage;
    this.retryable = options.retryable ?? false;
  }
}

export class SessionExpiredError extends AuthError {
  constructor() {
    super('SESSION_EXPIRED', 'session', 'The campus login session has expired.', { retryable: true });
    this.name = 'SessionExpiredError';
  }
}
