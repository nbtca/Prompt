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
