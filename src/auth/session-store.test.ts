import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSessionStore, type PersistedNbtSession } from './session-store.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function tempFile(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nbtca-session-'));
  temporaryDirectories.push(directory);
  return path.join(directory, 'state', 'session.json');
}

function fixture(overrides: Partial<PersistedNbtSession> = {}): PersistedNbtSession {
  return {
    version: 1,
    provider: 'nbt-webvpn',
    jar: { version: 'tough-cookie@6.0.0', storeType: 'MemoryCookieStore', rejectPublicSuffixes: true, cookies: [] },
    accountHint: '••••••••00',
    authenticatedAt: '2026-07-10T08:00:00.000Z',
    validatedAt: '2026-07-10T08:00:00.000Z',
    ...overrides,
  };
}

describe('session store', () => {
  it('atomically round-trips a versioned cookie jar with restrictive permissions', () => {
    const filePath = tempFile();
    const store = createSessionStore({ filePath });
    store.save(fixture());
    expect(store.load()).toEqual(fixture());
    if (process.platform !== 'win32') {
      expect(fs.statSync(path.dirname(filePath)).mode & 0o777).toBe(0o700);
      expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);
    }
    expect(fs.readdirSync(path.dirname(filePath))).toEqual(['session.json']);
  });

  it('deletes expired, corrupt and unknown-version sessions', () => {
    const now = () => new Date('2026-07-10T09:00:00.000Z');
    for (const contents of [
      JSON.stringify(fixture({ expiresAt: '2026-07-10T08:59:59.000Z' })),
      '{not-json',
      JSON.stringify({ ...fixture(), version: 99 }),
    ]) {
      const filePath = tempFile();
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, contents);
      const store = createSessionStore({ filePath, now });
      expect(store.load()).toBeNull();
      expect(fs.existsSync(filePath)).toBe(false);
    }
  });

  it('logout is idempotent and clears abandoned temporary files', () => {
    const filePath = tempFile();
    const store = createSessionStore({ filePath });
    store.save(fixture());
    fs.writeFileSync(`${filePath}.old.tmp`, 'secret');
    store.clear();
    store.clear();
    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.existsSync(`${filePath}.old.tmp`)).toBe(false);
  });

  it('never requires or stores a password field', () => {
    const filePath = tempFile();
    const store = createSessionStore({ filePath });
    store.save(fixture());
    expect(fs.readFileSync(filePath, 'utf8')).not.toMatch(/password|credential/i);
  });

  it('rejects control characters in a persisted account hint', () => {
    const filePath = tempFile();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(fixture({ accountHint: 'safe\u001b[2J' })));
    expect(createSessionStore({ filePath }).load()).toBeNull();
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
