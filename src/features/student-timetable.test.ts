import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SessionExpiredError } from '../auth/errors.js';
import type { AuthenticatedNbtSession } from '../auth/nbt-auth.js';
import type { PersistedNbtSession, SessionStore } from '../auth/session-store.js';
import {
  relevantTerms,
  resolveTerm,
  withAuthenticatedSession,
  writePrivateIcs,
} from './student-timetable.js';

const catalog = [
  {
    academicYear: '2025', semester: '12', academicYearLabel: '2025-2026',
    semesterLabel: '第二学期', current: false,
  },
  {
    academicYear: '2026', semester: '3', academicYearLabel: '2026-2027',
    semesterLabel: '第一学期', current: true,
  },
];

describe('resolveTerm', () => {
  it('defaults to the current academic term', () => {
    expect(resolveTerm(catalog)).toMatchObject({ academicYear: '2026', semester: '3' });
  });
  it('accepts exact opaque codes and user-facing semester aliases', () => {
    expect(resolveTerm(catalog, '2025:12')).toMatchObject({ academicYear: '2025', semester: '12' });
    expect(resolveTerm(catalog, '2026-1')).toMatchObject({ academicYear: '2026', semester: '3' });
  });
  it('rejects unknown terms instead of silently using current', () => {
    expect(() => resolveTerm(catalog, '2024-1')).toThrow(/Unknown academic term/);
  });
  it('requires an explicit selector if JWXT does not mark exactly one current term', () => {
    expect(() => resolveTerm(catalog.map((term) => ({ ...term, current: false }))))
      .toThrow(/could not be determined/);
  });
});

function persisted(): PersistedNbtSession {
  return {
    version: 1,
    provider: 'nbt-webvpn',
    jar: { version: 'tough-cookie@6.0.0', storeType: 'MemoryCookieStore', cookies: [] },
    authenticatedAt: '2026-07-10T00:00:00.000Z',
    validatedAt: '2026-07-10T00:00:00.000Z',
    expiresAt: '2026-07-17T00:00:00.000Z',
  };
}

function fakeSession(onClose: () => void = () => {}): AuthenticatedNbtSession {
  return {
    accountHint: undefined,
    timetableTransport: async () => new Response(),
    snapshot: async () => persisted(),
    close: async () => onClose(),
  };
}

describe('authenticated session orchestration', () => {
  it('clears an expired restored session even without an interactive terminal', async () => {
    let clears = 0;
    let closes = 0;
    const store: SessionStore = {
      filePath: '/unused',
      load: () => persisted(),
      save: () => { throw new Error('must not save'); },
      clear: () => { clears += 1; },
    };
    await expect(withAuthenticatedSession(async () => {
      throw new SessionExpiredError();
    }, {
      oneShot: false,
      isInteractive: false,
      store,
      stderr: { write: () => true },
      restoreSession: async () => fakeSession(() => { closes += 1; }),
    })).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(clears).toBe(1);
    expect(closes).toBe(1);
  });

  it('one-shot mode neither loads nor saves the persistent store', async () => {
    let closes = 0;
    const store: SessionStore = {
      filePath: '/unused',
      load: () => { throw new Error('must not load'); },
      save: () => { throw new Error('must not save'); },
      clear: () => { throw new Error('must not clear'); },
    };
    await expect(withAuthenticatedSession(async () => 42, {
      oneShot: true,
      isInteractive: true,
      store,
      stderr: { write: () => true },
      login: async () => fakeSession(() => { closes += 1; }),
    })).resolves.toBe(42);
    expect(closes).toBe(1);
  });

  it('discloses and saves a new persistent session before running the operation', async () => {
    const events: string[] = [];
    let messages = '';
    const store: SessionStore = {
      filePath: '/unused',
      load: () => null,
      save: () => { events.push('save'); },
      clear: () => { throw new Error('must not clear'); },
    };
    await expect(withAuthenticatedSession(async () => {
      events.push('operation');
      return 7;
    }, {
      oneShot: false,
      isInteractive: true,
      store,
      stderr: { write: (value) => { messages += String(value); return true; } },
      login: async () => fakeSession(),
    })).resolves.toBe(7);
    expect(events).toEqual(['save', 'operation', 'save']);
    expect(messages).toMatch(/--one-shot/);
  });
});

describe('private ICS output', () => {
  it('atomically replaces a symlink instead of following it', () => {
    if (process.platform === 'win32') return;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nbtca-ics-'));
    try {
      const target = path.join(directory, 'target.ics');
      const output = path.join(directory, 'schedule.ics');
      fs.writeFileSync(target, 'original');
      fs.symlinkSync(target, output);
      writePrivateIcs(output, 'replacement');
      expect(fs.readFileSync(target, 'utf8')).toBe('original');
      expect(fs.readFileSync(output, 'utf8')).toBe('replacement');
      expect(fs.lstatSync(output).isSymbolicLink()).toBe(false);
      expect(fs.statSync(output).mode & 0o777).toBe(0o600);
      expect(fs.readdirSync(directory).sort()).toEqual(['schedule.ics', 'target.ics']);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('relevantTerms', () => {
  it('hides generic future and implausibly old catalog years', () => {
    const broadCatalog = [
      { ...catalog[1]!, academicYear: '2031', academicYearLabel: '2031-2032', current: false },
      catalog[1]!,
      catalog[0]!,
      { ...catalog[0]!, academicYear: '2021', academicYearLabel: '2021-2022' },
    ];
    expect(relevantTerms(broadCatalog).map((term) => term.academicYear)).toEqual(['2026', '2025']);
  });
});
