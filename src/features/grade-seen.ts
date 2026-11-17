import { createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { StudentGrade } from '@nbtca/nbtcal/academic';
import { getStateDir, getWritableStateDir } from '../config/paths.js';

export const SEEN_GRADES_FILE = 'seen-grades.json';

interface Store {
  salt: string;
  terms: Record<string, string[]>;
}

function read(dir: string): Store | undefined {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(dir, SEEN_GRADES_FILE), 'utf8')) as Store;
    if (typeof value.salt !== 'string' || typeof value.terms !== 'object') return undefined;
    return value;
  } catch {
    return undefined;
  }
}

function write(dir: string, store: Store): void {
  const file = path.join(dir, SEEN_GRADES_FILE);
  fs.writeFileSync(file, JSON.stringify(store), { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

// Only whether a course has a published result is kept, never the result, so the file reveals no grade.
function fingerprint(salt: string, grade: StudentGrade): string {
  return createHmac('sha256', salt)
    .update(`${grade.courseCode ?? ''}\u0000${grade.courseName}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Indexes of published grades not seen before in this term. The first look at a term seals nothing,
 * so a new install does not present every old grade as new.
 */
export function sealedGrades(
  term: string,
  grades: readonly StudentGrade[],
  dir = getWritableStateDir(),
): Set<number> {
  try {
    const store = read(dir) ?? { salt: randomBytes(32).toString('hex'), terms: {} };
    const seen = store.terms[term];
    if (!seen) {
      store.terms[term] = grades
        .filter((grade) => grade.grade !== null)
        .map((grade) => fingerprint(store.salt, grade));
      write(dir, store);
      return new Set();
    }
    const known = new Set(seen);
    return new Set(
      grades.flatMap((grade, index) =>
        grade.grade !== null && !known.has(fingerprint(store.salt, grade)) ? [index] : [],
      ),
    );
  } catch {
    return new Set();
  }
}

export function markGradeSeen(term: string, grade: StudentGrade, dir = getStateDir()): void {
  try {
    const store = read(dir);
    if (!store) return;
    const seen = new Set(store.terms[term] ?? []);
    seen.add(fingerprint(store.salt, grade));
    store.terms[term] = [...seen];
    write(dir, store);
  } catch {
    /* best effort: the grade stays sealed next time */
  }
}
