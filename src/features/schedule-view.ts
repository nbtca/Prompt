import path from 'node:path';
import {
  createNbtTimetableClient,
  timetableToIcs,
  type AcademicTerm,
  type AcademicTermRef,
  type NbtTimetableClient,
  type Timetable,
} from '@nbtca/nbtcal/timetable';
import { runMenu, menuFooter } from '../core/components/menu.js';
import { runTextInput } from '../core/components/text-input.js';
import { enterScreen, breadcrumb } from '../core/transitions.js';
import { createSpinner, success, error } from '../core/ui.js';
import { c, type, space } from '../core/theme.js';
import { t, fmt } from '../i18n/index.js';
import { createSessionStore } from '../auth/session-store.js';
import {
  withAuthenticatedSession,
  resolveTerm,
  relevantTerms,
  writePrivateIcs,
  isSessionExpired,
  safeMessage,
  JWXT_ORIGIN,
} from './student-timetable.js';
import { currentWeekNumber, campusWeekday, meetingsOnDay, nextMeeting } from './schedule-query.js';
import { renderNextClassBanner, renderTodayClasses, renderWeekGrid } from './schedule-render.js';
import {
  termKey, loadWeekOne, saveWeekOne, saveTimetableCache,
  saveCurrentPointer, loadCurrentPointer, loadTimetableCache, clearScheduleCache,
} from './schedule-store.js';

/** Loads a saved week-one Monday for `key`, or prompts for and persists a new one.
 * Returns null when the user cancels or enters an unparsable date (caller aborts). */
async function ensureWeekOne(key: string): Promise<string | null> {
  const saved = loadWeekOne(key);
  if (saved) return saved;
  const value = await runTextInput({
    message: t().timetable.promptWeekOne,
    placeholder: 'YYYY-MM-DD',
  });
  if (value === null) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  if (Number.isNaN(new Date(`${trimmed}T00:00:00`).getTime())) return null;
  saveWeekOne(key, trimmed);
  return trimmed;
}

/** Fetches a term's timetable behind a spinner, caching it on success. Returns null
 * (after reporting the error) on failure so callers can keep the previous state. */
async function fetchTimetableWithSpinner(
  client: NbtTimetableClient,
  term: AcademicTermRef,
  key: string,
  weekOne: string,
): Promise<Timetable | null> {
  const trans = t();
  const spinner = createSpinner(trans.calendar.loading);
  try {
    const tt = await client.fetchTerm(term);
    spinner.stop();
    saveTimetableCache(key, tt);
    saveCurrentPointer(key, weekOne);
    return tt;
  } catch (err) {
    if (isSessionExpired(err)) { spinner.stop(); throw err; }
    spinner.error(trans.timetable.genericError);
    return null;
  }
}

function renderHub(tt: Timetable, weekOne: string, now: Date): { week: number; today: Timetable['meetings'][number][] } {
  const week = currentWeekNumber(weekOne, now);
  const today = meetingsOnDay(tt.meetings, campusWeekday(now), week);
  const trans = t();

  console.log();
  const banner = renderNextClassBanner(nextMeeting(tt.meetings, tt.periods, weekOne, now), now);
  console.log(banner || `${space.indent}${type.hint(trans.timetable.noNextClass)}`);
  console.log();
  console.log(renderTodayClasses(today, tt.periods, now));
  console.log();

  return { week, today };
}

async function switchTerm(
  client: NbtTimetableClient,
  catalog: readonly AcademicTerm[],
): Promise<{ term: AcademicTerm; key: string; weekOne: string; tt: Timetable } | null> {
  const trans = t();
  const picked = await runMenu({
    title: trans.timetable.hubSwitchTerm,
    options: relevantTerms(catalog).map((tm) => ({
      value: `${tm.academicYear}:${tm.semester}`,
      label: tm.academicYearLabel,
      hint: tm.current ? trans.common.current : undefined,
    })),
    footer: menuFooter(),
  });
  if (picked === null) return null;

  const term = resolveTerm(catalog, picked);
  const key = termKey(term);
  const weekOne = await ensureWeekOne(key);
  if (!weekOne) return null;
  const tt = await fetchTimetableWithSpinner(client, term as AcademicTermRef, key, weekOne);
  if (!tt) return null;
  return { term, key, weekOne, tt };
}

function exportTimetable(tt: Timetable, term: AcademicTerm, key: string, weekOne: string): void {
  const trans = t();
  const ics = timetableToIcs(tt, { weekOneMonday: weekOne, calendarName: `NBT ${term.academicYearLabel}` });
  const out = `timetable-${key}.ics`;
  try {
    writePrivateIcs(out, ics);
    success(fmt(trans.timetable.exported, { count: tt.meetings.length, file: path.resolve(out) }));
  } catch {
    error(trans.timetable.genericError);
  }
}

/** Interactive schedule hub: login/restore, resolve the current term, load or prompt
 * for the week-one Monday, fetch the timetable, then loop a menu of today / week-grid /
 * switch-term / export actions until the user cancels. */
export async function showSchedule(): Promise<void> {
  const trans = t();
  await enterScreen(breadcrumb(trans.timetable.menuEntry));

  try {
    await withAuthenticatedSession(async (session) => {
      const client = createNbtTimetableClient(session.timetableTransport, { baseUrl: JWXT_ORIGIN });

      const catalog = await client.listTerms();
      let term = resolveTerm(catalog);
      let key = termKey(term);
      let weekOne = await ensureWeekOne(key);
      if (!weekOne) return 0;

      const initial = await fetchTimetableWithSpinner(client, term as AcademicTermRef, key, weekOne);
      if (!initial) return 1;
      let tt = initial;

      while (true) {
        const now = new Date();
        const { week, today } = renderHub(tt, weekOne, now);

        const action = await runMenu({
          title: `${trans.timetable.menuEntry}  ${c.muted(term.academicYearLabel)}  ${c.muted(trans.timetable.weekLabel + String(week))}`,
          options: [
            { value: 'today', label: trans.timetable.hubToday, hint: String(today.length) },
            { value: 'week', label: trans.timetable.hubWeek },
            { value: 'term', label: trans.timetable.hubSwitchTerm, hint: term.academicYearLabel },
            { value: 'export', label: trans.timetable.hubExport },
            { value: 'logout', label: trans.timetable.hubLogout },
          ],
          footer: menuFooter(),
        });
        if (action === null) return 0;

        if (action === 'today') {
          continue; // The next loop iteration repaints today's classes.
        }
        if (action === 'week') {
          console.log();
          console.log(renderWeekGrid(tt.meetings, tt.periods, week, now));
          console.log();
          continue;
        }
        if (action === 'term') {
          const switched = await switchTerm(client, catalog);
          if (!switched) continue;
          term = switched.term;
          key = switched.key;
          weekOne = switched.weekOne;
          tt = switched.tt;
          continue;
        }
        if (action === 'export') {
          exportTimetable(tt, term, key, weekOne);
          continue;
        }
        if (action === 'logout') {
          createSessionStore().clear();
          clearScheduleCache();
          return 0;
        }
      }
    }, {
      oneShot: false,
      isInteractive: true,
      store: createSessionStore(),
      stderr: process.stderr,
    });
  } catch (err) {
    error(safeMessage(err));
  }
}

/** Best-effort, cache-only startup line: reads the last-used term pointer and its
 * cached timetable (no network) and renders the next-class banner, or '' if the
 * student isn't "set up" yet or anything about the cache is missing/corrupt. */
export function peekNextClassLine(now: Date = new Date()): string {
  try {
    const ptr = loadCurrentPointer();
    if (!ptr) return '';
    const cached = loadTimetableCache(ptr.termKey) as { meetings?: unknown; periods?: unknown } | null;
    if (!cached || !Array.isArray(cached.meetings) || !Array.isArray(cached.periods)) return '';
    const next = nextMeeting(
      cached.meetings as Timetable['meetings'], cached.periods as Timetable['periods'], ptr.weekOneMonday, now,
    );
    return renderNextClassBanner(next, now);
  } catch { return ''; }
}

/** Cache-only (no network) render of today's classes for the current term, or [] if not set up. */
export function peekTodayLines(now: Date = new Date()): string[] {
  try {
    const ptr = loadCurrentPointer();
    if (!ptr) return [];
    const cached = loadTimetableCache(ptr.termKey) as { meetings?: unknown; periods?: unknown } | null;
    if (!cached || !Array.isArray(cached.meetings) || !Array.isArray(cached.periods)) return [];
    const week = currentWeekNumber(ptr.weekOneMonday, now);
    const today = meetingsOnDay(cached.meetings as Timetable['meetings'], campusWeekday(now), week);
    return renderTodayClasses(today, cached.periods as Timetable['periods'], now).split('\n');
  } catch { return []; }
}
