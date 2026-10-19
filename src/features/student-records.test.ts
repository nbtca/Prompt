import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as TimetableModule from '@nbtca/nbtcal/timetable';
import type { AcademicTerm } from '@nbtca/nbtcal/timetable';
import type { PersistedNbtSession, SessionStore } from '../auth/session-store.js';
import { runStudentRecordsCommand } from './student-records.js';
import { t } from '../i18n/index.js';

const { restore, listTerms, transport, close, input } = vi.hoisted(() => ({
  restore: vi.fn(),
  listTerms: vi.fn(),
  transport: vi.fn(),
  close: vi.fn(),
  input: vi.fn(),
}));
vi.mock('../auth/nbt-auth.js', () => ({
  restoreNbtSession: restore,
  loginWithStudentPassword: vi.fn(),
}));
vi.mock('../core/components/text-input.js', () => ({
  runTextInput: input,
  runSecretInput: vi.fn(),
}));
vi.mock('@nbtca/nbtcal/timetable', async (original) => ({
  ...(await original<typeof TimetableModule>()),
  createNbtTimetableClient: () => ({ listTerms }),
}));

const term: AcademicTerm = {
  academicYear: '2026',
  semester: '3',
  academicYearLabel: '2026-2027',
  semesterLabel: '1',
  current: true,
};
const snapshot: PersistedNbtSession = {
  version: 1,
  provider: 'nbt-webvpn',
  jar: { version: 1, cookies: [] },
  authenticatedAt: '2026-10-01T00:00:00Z',
  validatedAt: '2026-10-01T00:00:00Z',
  expiresAt: '2026-10-02T00:00:00Z',
};
function output() {
  let value = '';
  return {
    write(chunk: string | Uint8Array) {
      value += String(chunk);
      return true;
    },
    text: () => value,
  };
}
function store() {
  return {
    filePath: '/unused',
    load: vi.fn<SessionStore['load']>(() => snapshot),
    save: vi.fn(),
    clear: vi.fn(),
  } satisfies SessionStore;
}

beforeEach(() => {
  vi.resetAllMocks();
  listTerms.mockResolvedValue([term]);
  restore.mockResolvedValue({
    timetableTransport: transport,
    snapshot: () => Promise.resolve(snapshot),
    close,
  });
  transport.mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          items: [
            {
              xnm: '2026',
              xqm: '3',
              kcmc: 'Algorithms',
              cj: '良好',
              xh: 'SYNTHETIC-ID',
              xm: 'Synthetic Student',
            },
          ],
          currentPage: 1,
          totalPage: 1,
          totalResult: 1,
        }),
      ),
    ),
  );
});

describe('student records commands', () => {
  it.each(['exams', 'grades'] as const)(
    'reuses the session for %s JSON without persisting records',
    async (kind) => {
      const stdout = output();
      const stderr = output();
      const sessionStore = store();
      const code = await runStudentRecordsCommand(kind, {
        flags: new Set(['--json']),
        isInteractive: false,
        stdout,
        stderr,
        store: sessionStore,
      });
      expect(code).toBe(0);
      const parsed = JSON.parse(stdout.text()) as { kind: string; items: unknown[] };
      expect(parsed.kind).toBe(kind);
      expect(parsed.items).toHaveLength(1);
      expect(stdout.text()).not.toMatch(/SYNTHETIC-ID|Synthetic Student/);
      expect(sessionStore.save).toHaveBeenCalledExactlyOnceWith(snapshot);
      expect(close).toHaveBeenCalledOnce();
      expect(stderr.text()).toBe('');
    },
  );

  it('requires a saved session in a noninteractive terminal', async () => {
    const stderr = output();
    const sessionStore = store();
    vi.mocked(sessionStore.load).mockReturnValue(null);
    expect(
      await runStudentRecordsCommand('grades', {
        flags: new Set(),
        isInteractive: false,
        stdout: output(),
        stderr,
        store: sessionStore,
      }),
    ).toBe(2);
    expect(stderr.text()).toContain(t().timetable.noSession);
    expect(transport).not.toHaveBeenCalled();
  });

  it('clears an expired session without emitting raw campus data', async () => {
    transport.mockResolvedValue(new Response('private marker', { status: 401 }));
    const sessionStore = store();
    const stdout = output();
    const stderr = output();
    expect(
      await runStudentRecordsCommand('exams', {
        flags: new Set(),
        isInteractive: false,
        stdout,
        stderr,
        store: sessionStore,
      }),
    ).toBe(1);
    expect(sessionStore.clear).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(stdout.text()).toBe('');
    expect(stderr.text()).not.toContain('private marker');
  });

  it('rejects an empty term before reading the saved session', async () => {
    const sessionStore = store();
    expect(
      await runStudentRecordsCommand('grades', {
        flags: new Set(['--term=']),
        isInteractive: false,
        stdout: output(),
        stderr: output(),
        store: sessionStore,
      }),
    ).toBe(1);
    expect(sessionStore.load).not.toHaveBeenCalled();
  });

  it('does not silently use the current term for an unknown selector', async () => {
    const stderr = output();
    expect(
      await runStudentRecordsCommand('exams', {
        flags: new Set(['--term=2020-1']),
        isInteractive: false,
        stdout: output(),
        stderr,
        store: store(),
      }),
    ).toBe(1);
    expect(stderr.text()).toContain(t().timetable.unknownTerm);
    expect(transport).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it.each(['--one-shot', '--no-save'])(
    'cancels %s without reading or writing a session',
    async (flag) => {
      input.mockResolvedValue(null);
      const sessionStore = store();
      const stdout = output();
      const stderr = output();
      expect(
        await runStudentRecordsCommand('grades', {
          flags: new Set([flag]),
          isInteractive: true,
          stdout,
          stderr,
          store: sessionStore,
        }),
      ).toBe(130);
      expect(sessionStore.load).not.toHaveBeenCalled();
      expect(sessionStore.save).not.toHaveBeenCalled();
      expect(sessionStore.clear).not.toHaveBeenCalled();
      expect(stdout.text() + stderr.text()).toBe('');
    },
  );
});

describe('exam calendar output', () => {
  it('writes a private ICS using the nbtcal exporter and owner-only permissions', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nbtca-exam-export-'));
    try {
      const file = path.join(directory, 'exams.ics');
      transport.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [{ xnm: '2026', xqm: '3', kcmc: 'Algorithms', kssj: '2026-12-10(09:00-11:00)' }],
            currentPage: 1,
            totalPage: 1,
            totalResult: 1,
          }),
        ),
      );
      expect(
        await runStudentRecordsCommand('exams', {
          flags: new Set([`--output=${file}`]),
          isInteractive: false,
          stdout: output(),
          stderr: output(),
          store: store(),
        }),
      ).toBe(0);
      const ics = fs.readFileSync(file, 'utf8');
      expect(ics).toContain('CLASS:PRIVATE');
      expect(ics).toContain('DTSTART:20261210T010000Z');
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not create or overwrite an export when an exam time is unpublished', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nbtca-exam-export-'));
    try {
      const file = path.join(directory, 'exams.ics');
      fs.writeFileSync(file, 'existing calendar');
      const stderr = output();
      expect(
        await runStudentRecordsCommand('exams', {
          flags: new Set([`--output=${file}`]),
          isInteractive: false,
          stdout: output(),
          stderr,
          store: store(),
        }),
      ).toBe(1);
      expect(stderr.text()).toContain(t().records.exportNeedsTime);
      expect(fs.readFileSync(file, 'utf8')).toBe('existing calendar');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([['--output='], ['--output=exams.ics', '--json']])(
    'rejects ambiguous export options before authentication',
    async (...flags) => {
      const sessionStore = store();
      expect(
        await runStudentRecordsCommand('exams', {
          flags: new Set(flags),
          isInteractive: false,
          stdout: output(),
          stderr: output(),
          store: sessionStore,
        }),
      ).toBe(1);
      expect(sessionStore.load).not.toHaveBeenCalled();
    },
  );
});
