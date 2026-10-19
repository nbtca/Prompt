import path from 'node:path';
import { studentExamsToIcs } from '@nbtca/nbtcal/academic';
import { createNbtTimetableClient } from '@nbtca/nbtcal/timetable';
import { AuthError } from '../auth/errors.js';
import { createSessionStore } from '../auth/session-store.js';
import { JWXT_ORIGIN } from '../config/campus.js';
import {
  resolveTerm,
  PromptCancelledError,
  safeMessage,
  withAuthenticatedSession,
  writePrivateIcs,
  type StudentTimetableCommandOptions,
} from './student-timetable.js';
import { sanitizeAcademicTerm } from './timetable-sanitize.js';
import { createStudentRecordsClient, type StudentRecordsKind } from './student-records-client.js';
import { renderStudentRecords } from './student-records-render.js';
import { fmt, t } from '../i18n/index.js';

export async function runStudentRecordsCommand(
  kind: StudentRecordsKind,
  options: StudentTimetableCommandOptions,
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const isInteractive = options.isInteractive ?? (process.stdin.isTTY && process.stdout.isTTY);
  const outputFlag = [...options.flags].find((flag) => flag.startsWith('--output='));
  const output = outputFlag?.slice('--output='.length);
  if (output !== undefined && (kind !== 'exams' || !output.trim() || options.flags.has('--json'))) {
    stderr.write(`${t().records.invalidExportOptions}\n`);
    return 1;
  }
  const termFlag = [...options.flags].find((flag) => flag.startsWith('--term='));
  if (termFlag === '--term=') {
    stderr.write(`${t().timetable.unknownTerm}\n`);
    return 1;
  }
  try {
    return await withAuthenticatedSession(
      async (session) => {
        const client = createNbtTimetableClient(session.timetableTransport, {
          baseUrl: JWXT_ORIGIN,
        });
        const terms = (await client.listTerms()).map(sanitizeAcademicTerm);
        const term = resolveTerm(terms, termFlag?.slice('--term='.length));
        const records = await createStudentRecordsClient(
          session.timetableTransport,
          JWXT_ORIGIN,
        ).fetchRecords(kind, term);
        if (output !== undefined && records.kind === 'exams') {
          writePrivateIcs(output, studentExamsToIcs(records));
          stdout.write(`${fmt(t().records.exported, { file: path.resolve(output) })}\n`);
          return 0;
        }
        stdout.write(
          options.flags.has('--json')
            ? `${JSON.stringify(records, null, 2)}\n`
            : `${renderStudentRecords(records, term).join('\n')}\n`,
        );
        return 0;
      },
      {
        oneShot: options.flags.has('--one-shot') || options.flags.has('--no-save'),
        isInteractive,
        store: options.store ?? createSessionStore(),
        stderr,
      },
    );
  } catch (error) {
    if (error instanceof PromptCancelledError) return 130;
    if (!isInteractive && error instanceof AuthError && error.code === 'INVALID_CREDENTIALS') {
      stderr.write(`${t().timetable.noSession}\n`);
      return 2;
    }
    stderr.write(`${safeMessage(error)}\n`);
    return 1;
  }
}
