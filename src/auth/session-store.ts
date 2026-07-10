import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SerializedCookieJar } from 'tough-cookie';
import { getStateDir, getWritableStateDir } from '../config/paths.js';

export const SESSION_SCHEMA_VERSION = 1 as const;

export interface PersistedNbtSession {
  version: typeof SESSION_SCHEMA_VERSION;
  provider: 'nbt-webvpn';
  jar: SerializedCookieJar;
  /** Already masked; never store the complete student id. */
  accountHint?: string;
  authenticatedAt: string;
  validatedAt: string;
  expiresAt?: string;
}

export interface SessionStore {
  readonly filePath: string;
  load(): PersistedNbtSession | null;
  save(session: PersistedNbtSession): void;
  clear(): void;
}

export interface CreateSessionStoreOptions {
  filePath?: string;
  now?: () => Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isSerializedJar(value: unknown): value is SerializedCookieJar {
  return isRecord(value) && Array.isArray(value['cookies']);
}

function parseSession(value: unknown): PersistedNbtSession | null {
  if (!isRecord(value)) return null;
  if (value['version'] !== SESSION_SCHEMA_VERSION || value['provider'] !== 'nbt-webvpn') return null;
  if (!isSerializedJar(value['jar'])) return null;
  if (!isIsoDate(value['authenticatedAt']) || !isIsoDate(value['validatedAt'])) return null;
  if (value['expiresAt'] !== undefined && !isIsoDate(value['expiresAt'])) return null;
  if (
    value['accountHint'] !== undefined
    && (
      typeof value['accountHint'] !== 'string'
      || value['accountHint'].length > 64
      || /[\u0000-\u001f\u007f]/.test(value['accountHint'])
    )
  ) return null;
  return {
    version: SESSION_SCHEMA_VERSION,
    provider: 'nbt-webvpn',
    jar: value['jar'],
    accountHint: value['accountHint'] as string | undefined,
    authenticatedAt: value['authenticatedAt'],
    validatedAt: value['validatedAt'],
    expiresAt: value['expiresAt'] as string | undefined,
  };
}

function removeFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (!isRecord(error) || error['code'] !== 'ENOENT') throw error;
  }
}

function clearTemporaryFiles(filePath: string): void {
  const directory = path.dirname(filePath);
  const prefix = `${path.basename(filePath)}.`;
  try {
    for (const entry of fs.readdirSync(directory)) {
      if (entry.startsWith(prefix) && entry.endsWith('.tmp')) removeFile(path.join(directory, entry));
    }
  } catch (error) {
    if (!isRecord(error) || error['code'] !== 'ENOENT') throw error;
  }
}

export function createSessionStore(options: CreateSessionStoreOptions = {}): SessionStore {
  const now = options.now ?? (() => new Date());
  const filePath = options.filePath ?? path.join(getStateDir(), 'session.json');

  function clear(): void {
    removeFile(filePath);
    clearTemporaryFiles(filePath);
  }

  function load(): PersistedNbtSession | null {
    try {
      const parsed = parseSession(JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown);
      if (!parsed || (parsed.expiresAt && Date.parse(parsed.expiresAt) <= now().getTime())) {
        clear();
        return null;
      }
      return parsed;
    } catch (error) {
      if (isRecord(error) && error['code'] === 'ENOENT') return null;
      clear();
      return null;
    }
  }

  function save(session: PersistedNbtSession): void {
    const validated = parseSession(session);
    if (!validated) throw new TypeError('Invalid persisted session.');
    const directory = options.filePath ? path.dirname(filePath) : getWritableStateDir();
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(directory, 0o700); } catch { /* Best effort on non-POSIX filesystems. */ }

    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, `${JSON.stringify(validated)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      fs.renameSync(temporaryPath, filePath);
      try { fs.chmodSync(filePath, 0o600); } catch { /* Best effort on non-POSIX filesystems. */ }
    } finally {
      try { removeFile(temporaryPath); } catch { /* The main write result is authoritative. */ }
    }
  }

  return { filePath, load, save, clear };
}
