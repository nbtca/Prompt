import fs from 'fs';
import path from 'path';
import { getWritableConfigDir, getConfigDir, getWritableStateDir, getStateDir } from '../config/paths.js';

export function termKey(term: { academicYear: string; semester: string }): string {
  return `${term.academicYear}-${term.semester}`;
}

function readJson(file: string): unknown | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* best effort */ }
}

function weekOnePath(dir?: string): string {
  return path.join(dir ?? getWritableConfigDir(), 'week-one.json');
}
export function saveWeekOne(termKey: string, iso: string, dir?: string): void {
  const file = weekOnePath(dir);
  const store = (readJson(file) as Record<string, string> | null) ?? {};
  store[termKey] = iso;
  writeJson(file, store);
}
export function loadWeekOne(termKey: string, dir?: string): string | null {
  const file = path.join(dir ?? getConfigDir(), 'week-one.json');
  const store = readJson(file) as Record<string, string> | null;
  return store?.[termKey] ?? null;
}

function cachePath(termKey: string, dir?: string): string {
  return path.join(dir ?? getWritableStateDir(), `timetable-${termKey}.json`);
}
export function saveTimetableCache(termKey: string, data: unknown, dir?: string): void {
  writeJson(cachePath(termKey, dir), data);
}
export function loadTimetableCache(termKey: string, dir?: string): unknown | null {
  const file = path.join(dir ?? getStateDir(), `timetable-${termKey}.json`);
  return readJson(file);
}

interface CurrentPointer { termKey: string; weekOneMonday: string; }

function currentPointerPath(dir?: string): string {
  return path.join(dir ?? getWritableStateDir(), 'current-term.json');
}
export function saveCurrentPointer(termKey: string, weekOneMonday: string, dir?: string): void {
  writeJson(currentPointerPath(dir), { termKey, weekOneMonday });
}
export function loadCurrentPointer(dir?: string): CurrentPointer | null {
  const file = path.join(dir ?? getStateDir(), 'current-term.json');
  const value = readJson(file) as Partial<CurrentPointer> | null;
  if (!value || typeof value.termKey !== 'string' || typeof value.weekOneMonday !== 'string') return null;
  return { termKey: value.termKey, weekOneMonday: value.weekOneMonday };
}

/** Remove the cached timetables and the current-term pointer (e.g. on logout). Best-effort. */
export function clearScheduleCache(dir?: string): void {
  const stateDir = dir ?? getStateDir();
  try {
    for (const f of fs.readdirSync(stateDir)) {
      if (f === 'current-term.json' || (f.startsWith('timetable-') && f.endsWith('.json'))) {
        try { fs.unlinkSync(path.join(stateDir, f)); } catch { /* best effort */ }
      }
    }
  } catch { /* best effort: dir may not exist */ }
}
