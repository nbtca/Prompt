import { createNbtStudentRecordsClient, type StudentRecords } from '@nbtca/nbtcal/academic';
import type { AcademicTermRef, AuthenticatedTransport } from '@nbtca/nbtcal/timetable';
import { sanitizeTerminalLine } from '../core/text.js';

export type { StudentRecords, StudentRecordsKind } from '@nbtca/nbtcal/academic';

function sanitizeRecord<T extends object>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]: [string, unknown]) => [
      key,
      typeof value === 'string' ? sanitizeTerminalLine(value) : value,
    ]),
  ) as T;
}

export function createStudentRecordsClient(transport: AuthenticatedTransport, baseUrl: string) {
  const client = createNbtStudentRecordsClient(transport, { baseUrl });
  return {
    async fetchRecords(
      kind: StudentRecords['kind'],
      term: AcademicTermRef,
      signal?: AbortSignal,
    ): Promise<StudentRecords> {
      const records = await client.fetchRecords(kind, term, signal ? { signal } : {});
      return records.kind === 'exams'
        ? { ...records, items: records.items.map(sanitizeRecord) }
        : { ...records, items: records.items.map(sanitizeRecord) };
    },
  };
}
