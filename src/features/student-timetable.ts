import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createNbtTimetableClient,
  timetableToIcs,
  TimetableError,
  type AcademicTerm,
  type AcademicTermRef,
} from '@nbtca/nbtcal/timetable';
import { runSecretInput, runTextInput } from '../core/components/text-input.js';
import { runMenu } from '../core/components/menu.js';
import { glyph } from '../core/theme.js';
import { AuthError } from '../auth/errors.js';
import { loginWithStudentPassword, restoreNbtSession, type AuthenticatedNbtSession } from '../auth/nbt-auth.js';
import { createSessionStore, type SessionStore } from '../auth/session-store.js';
import { clearScheduleCache } from './schedule-store.js';
import { fmt, t } from '../i18n/index.js';

export const JWXT_ORIGIN = 'https://jwxt-443.webvpn.nbt.edu.cn';

export type StudentTimetableSubcommand = 'login' | 'logout' | 'status' | 'terms' | 'export';

export interface StudentTimetableCommandOptions {
  flags: ReadonlySet<string>;
  isInteractive?: boolean;
  store?: SessionStore;
  stdout?: Pick<NodeJS.WriteStream, 'write'>;
  stderr?: Pick<NodeJS.WriteStream, 'write'>;
}

function flagValue(flags: ReadonlySet<string>, prefix: string): string | undefined {
  const flag = [...flags].find((value) => value.startsWith(prefix));
  return flag?.slice(prefix.length);
}

function semesterAlias(value: string): string {
  if (value === '1') return '3';
  if (value === '2') return '12';
  if (value === '3') return '16';
  return value;
}

export function resolveTerm(
  catalog: readonly AcademicTerm[],
  selector?: string,
): AcademicTerm {
  if (catalog.length === 0) throw new Error('No academic terms are available.');
  if (!selector) {
    const current = catalog.filter((term) => term.current);
    if (current.length !== 1) throw new Error('The current academic term could not be determined.');
    return current[0]!;
  }

  const exact = catalog.find(
    (term) => `${term.academicYear}:${term.semester}` === selector,
  );
  if (exact) return exact;

  const shorthand = /^(\d{4})[-/:](\d+)$/.exec(selector);
  if (shorthand?.[1] && shorthand[2]) {
    const semester = semesterAlias(shorthand[2]);
    const matched = catalog.find(
      (term) => term.academicYear === shorthand[1] && term.semester === semester,
    );
    if (matched) return matched;
  }
  throw new Error('Unknown academic term. Run `nbtca schedule terms` first.');
}

export function relevantTerms(catalog: readonly AcademicTerm[]): AcademicTerm[] {
  const selected = catalog.find((term) => term.current);
  const currentYear = Number.parseInt(selected?.academicYear ?? '', 10);
  if (!Number.isInteger(currentYear)) return [...catalog].slice(0, 15);
  return catalog.filter((term) => {
    const year = Number.parseInt(term.academicYear, 10);
    return Number.isInteger(year) && year <= currentYear && year >= currentYear - 4;
  });
}

function displaySemesterLabel(term: AcademicTerm): string {
  const aliases: Readonly<Record<string, string>> = { '3': '1', '12': '2', '16': '3' };
  const aliased = aliases[term.semester];
  if (aliased) return fmt(t().timetable.semesterNumber, { number: aliased });
  return /^\d+$/.test(term.semesterLabel)
    ? fmt(t().timetable.semesterNumber, { number: term.semesterLabel })
    : term.semesterLabel;
}

export function isSessionExpired(error: unknown): boolean {
  return (
    error instanceof AuthError && error.code === 'SESSION_EXPIRED'
  ) || (
    error instanceof TimetableError && error.code === 'SESSION_EXPIRED'
  );
}

function safeMessage(error: unknown): string {
  const trans = t().timetable;
  if (error instanceof AuthError) {
    switch (error.code) {
      case 'INVALID_CREDENTIALS': return trans.invalidCredentials;
      case 'ACCOUNT_LOCKED': return trans.accountLocked;
      case 'ACCOUNT_INACTIVE': return trans.accountInactive;
      case 'INTERACTIVE_CHALLENGE': return trans.challenge;
      case 'SESSION_EXPIRED': return trans.sessionExpired;
      case 'TIMEOUT': return trans.timeout;
      case 'NETWORK': return trans.network;
      case 'UNTRUSTED_URL': return trans.untrustedUrl;
      case 'HTTP_ERROR': return trans.httpError;
      case 'LOGIN_PAGE_CHANGED': return trans.loginChanged;
      case 'UNEXPECTED_RESPONSE': return trans.unexpectedResponse;
      default: return trans.genericError;
    }
  }
  if (error instanceof TimetableError) {
    switch (error.code) {
      case 'MISSING_CALENDAR_DATES': return trans.missingDates;
      case 'MISSING_PERIOD_TIME': return trans.missingPeriod;
      case 'TERM_MISMATCH': return trans.termMismatch;
      case 'SESSION_EXPIRED': return trans.sessionExpired;
      default: return trans.invalidData;
    }
  }
  if (error instanceof Error && error.message === 'Unknown academic term. Run `nbtca schedule terms` first.') {
    return trans.unknownTerm;
  }
  if (error instanceof Error && error.message === 'No academic terms are available.') return trans.noTerms;
  if (error instanceof Error && error.message === 'The current academic term could not be determined.') {
    return trans.currentTermUnknown;
  }
  return trans.genericError;
}

async function interactiveLogin(isInteractive: boolean): Promise<AuthenticatedNbtSession> {
  const trans = t().timetable;
  if (!isInteractive) {
    throw new AuthError('INVALID_CREDENTIALS', 'credentials', 'Interactive login requires a terminal.');
  }
  const username = await runSecretInput({
    message: trans.studentId,
    placeholder: trans.studentIdHint,
    allowEmpty: false,
    mask: '•',
  });
  if (!username) throw new AuthError('INVALID_CREDENTIALS', 'credentials', 'Student id is required.');
  const password = await runSecretInput({
    message: trans.password,
    placeholder: trans.passwordHint,
    allowEmpty: false,
  });
  if (!password) throw new AuthError('INVALID_CREDENTIALS', 'credentials', 'Password is required.');
  return loginWithStudentPassword(username, password);
}

export async function withAuthenticatedSession<T>(
  operation: (session: AuthenticatedNbtSession) => Promise<T>,
  options: {
    oneShot: boolean;
    isInteractive: boolean;
    store: SessionStore;
    stderr: Pick<NodeJS.WriteStream, 'write'>;
    restoreSession?: typeof restoreNbtSession;
    login?: (isInteractive: boolean) => Promise<AuthenticatedNbtSession>;
  },
): Promise<T> {
  let persisted = options.oneShot ? null : options.store.load();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let session: AuthenticatedNbtSession | null = null;
    const wasRestored = persisted !== null;
    let savedBeforeOperation = false;
    try {
      if (!wasRestored && !options.oneShot) {
        options.stderr.write(`${t().timetable.loginWillSave}\n`);
      }
      session = persisted
        ? await (options.restoreSession ?? restoreNbtSession)(persisted)
        : await (options.login ?? interactiveLogin)(options.isInteractive);
      if (!options.oneShot && !wasRestored) {
        options.store.save(await session.snapshot());
        savedBeforeOperation = true;
      }
      const result = await operation(session);
      if (!options.oneShot) {
        try {
          options.store.save(await session.snapshot());
        } catch {
          // A new session was already saved before the operation, or a restored
          // session still has its previous atomic file. Do not turn a completed
          // export into a reported failure just because its TTL could not refresh.
          if (!savedBeforeOperation && !wasRestored) throw new Error('Session persistence failed.');
          options.stderr.write(`${t().timetable.sessionRefreshFailed}\n`);
        }
      }
      return result;
    } catch (error) {
      if (isSessionExpired(error)) {
        if (!options.oneShot) options.store.clear();
        persisted = null;
        if (!wasRestored || !options.isInteractive || attempt > 0) throw error;
        options.stderr.write(`${t().timetable.expiredRelogin}\n`);
      } else {
        throw error;
      }
    } finally {
      await session?.close();
    }
  }
  throw new AuthError('SESSION_EXPIRED', 'session', 'The campus login session has expired.');
}

export function writePrivateIcs(filePath: string, contents: string): void {
  const resolved = path.resolve(filePath);
  const temporaryPath = path.join(
    path.dirname(resolved),
    `.${path.basename(resolved)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    fs.writeFileSync(temporaryPath, contents, {
      encoding: 'utf8', flag: 'wx', mode: 0o600,
    });
    fs.renameSync(temporaryPath, resolved);
    try { fs.chmodSync(resolved, 0o600); } catch { /* Best effort on non-POSIX filesystems. */ }
  } finally {
    try { fs.unlinkSync(temporaryPath); } catch { /* Rename or the original error is authoritative. */ }
  }
}

function clientFor(session: AuthenticatedNbtSession) {
  return createNbtTimetableClient(session.timetableTransport, { baseUrl: JWXT_ORIGIN });
}

async function resolveWeekOneMonday(
  explicitValue: string | undefined,
  hasAuthoritativeDates: boolean,
  isInteractive: boolean,
): Promise<string | undefined> {
  if (hasAuthoritativeDates) return explicitValue;
  if (explicitValue) return explicitValue;
  if (!isInteractive) return undefined;
  const value = await runTextInput({
    message: t().timetable.weekOne,
    placeholder: t().timetable.weekOneHint,
    allowEmpty: false,
  });
  return value || undefined;
}

export async function runStudentTimetableCommand(
  subcommandValue: string | undefined,
  options: StudentTimetableCommandOptions,
): Promise<number> {
  const subcommand = (subcommandValue ?? 'export').toLowerCase() as StudentTimetableSubcommand;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const isInteractive = options.isInteractive ?? (!!process.stdin.isTTY && !!process.stdout.isTTY);
  const store = options.store ?? createSessionStore();
  const oneShot = options.flags.has('--one-shot') || options.flags.has('--no-save');
  const trans = t().timetable;

  if (!['login', 'logout', 'status', 'terms', 'export'].includes(subcommand)) {
    stderr.write(`${trans.unknownCommand}\n`);
    return 1;
  }

  const commonFlags = new Set(['--plain', '--one-shot', '--no-save']);
  const allowedFlags = subcommand === 'export'
    ? [...commonFlags, '--term=', '--output=', '--week-one=']
    : subcommand === 'logout'
      ? ['--plain']
      : [...commonFlags];
  const invalidFlag = [...options.flags].find((flag) => !allowedFlags.some((allowed) => (
    allowed.endsWith('=') ? flag.startsWith(allowed) : flag === allowed
  )));
  if (invalidFlag) {
    stderr.write(`${fmt(trans.invalidOption, { flag: invalidFlag })}\n`);
    return 1;
  }

  try {
    if (subcommand === 'logout') {
      store.clear();
      clearScheduleCache();
      stdout.write(`${trans.loggedOut}\n`);
      return 0;
    }
    if (subcommand === 'status') {
      const persisted = oneShot ? null : store.load();
      stdout.write(persisted
        ? `${fmt(trans.savedStatus, { account: persisted.accountHint ? ` (${persisted.accountHint})` : '' })}\n`
        : `${trans.noSavedStatus}\n`);
      return persisted ? 0 : 1;
    }
    if (subcommand === 'login') {
      const session = await interactiveLogin(isInteractive);
      try {
        if (!oneShot) store.save(await session.snapshot());
        stdout.write(`${oneShot ? trans.loginOneShot : trans.loginSaved}\n`);
      } finally {
        await session.close();
      }
      return 0;
    }

    return await withAuthenticatedSession(async (session) => {
      const client = clientFor(session);
      const catalog = await client.listTerms();
      if (subcommand === 'terms') {
        stdout.write(`${trans.candidateTerms}\n`);
        for (const term of relevantTerms(catalog)) {
          stdout.write(`${term.current ? '*' : ' '} ${term.academicYear}:${term.semester}  ${term.academicYearLabel} ${displaySemesterLabel(term)}\n`);
        }
        return 0;
      }

      const selected = resolveTerm(catalog, flagValue(options.flags, '--term='));
      const timetable = await client.fetchTerm(selected as AcademicTermRef);
      const output = flagValue(options.flags, '--output=')
        || `timetable-${selected.academicYear}-${selected.semester}.ics`;
      const weekOneMonday = await resolveWeekOneMonday(
        flagValue(options.flags, '--week-one='),
        timetable.calendarDays.length > 0,
        isInteractive,
      );
      const ics = timetableToIcs(timetable, {
        weekOneMonday,
        calendarName: fmt(trans.calendarName, {
          year: selected.academicYearLabel,
          semester: displaySemesterLabel(selected),
        }),
      });
      writePrivateIcs(output, ics);
      stdout.write(`${fmt(trans.exported, {
        count: timetable.meetings.length,
        file: path.resolve(output),
      })}\n`);
      const actionableWarnings = timetable.warnings.filter(
        (warning) => warning.code !== 'CALENDAR_DATES_UNAVAILABLE' || !weekOneMonday,
      );
      if (actionableWarnings.length > 0) {
        stderr.write(`${fmt(trans.warnings, { count: actionableWarnings.length })}\n`);
      }
      if (timetable.unresolvedItems.length > 0) {
        stderr.write(`${fmt(trans.unresolvedPractice, { count: timetable.unresolvedItems.length })}\n`);
      }
      return 0;
    }, { oneShot, isInteractive, store, stderr });
  } catch (error) {
    if (!isInteractive && error instanceof AuthError && error.code === 'INVALID_CREDENTIALS') {
      stderr.write(`${trans.noSession}\n`);
      return 2;
    }
    stderr.write(`${safeMessage(error)}\n`);
    return 1;
  }
}

export async function showStudentTimetableMenu(): Promise<void> {
  while (true) {
    const trans = t();
    const footer = `${glyph.updown()} ${trans.menu.hintMove}   ${glyph.enter()} ${trans.menu.hintOpen}   q ${trans.menu.hintQuit}`;
    const action = await runMenu({
      title: trans.timetable.menuTitle,
      options: [
        { value: 'export', label: trans.timetable.actionExport },
        { value: 'terms', label: trans.timetable.actionTerms },
        { value: 'status', label: trans.timetable.actionStatus },
        { value: 'login', label: trans.timetable.actionLogin },
        { value: 'logout', label: trans.timetable.actionLogout },
      ],
      footer,
    });
    if (action === null) return;

    const flags = new Set<string>();
    if (action === 'export') {
      const term = await runTextInput({
        message: trans.timetable.termPrompt,
        placeholder: trans.timetable.termPromptHint,
      });
      if (term === null) continue;
      if (term.trim()) flags.add(`--term=${term.trim()}`);
    }
    await runStudentTimetableCommand(action, {
      flags,
      isInteractive: true,
    });
  }
}
