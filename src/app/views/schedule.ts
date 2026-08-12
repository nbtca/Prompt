import path from 'node:path';
import {
  createNbtTimetableClient,
  createTimetableSchedule,
  timetableToIcs,
  type AcademicTerm,
  type NbtTimetableClient,
  type Timetable,
} from '@nbtca/nbtcal/timetable';
import type { AppContext, View } from '../view.js';
import { captureFooterHint, passiveFooterHint } from '../chrome.js';
import { ListField, computeMaxVisible } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { renderSchedule, hubShortcuts, type ScheduleViewState } from './schedule-render.js';
import { defaultGridCursor, handleGridKey } from './schedule-grid-cursor.js';
import { setVimKeysActive } from '../../core/vim-keys.js';
import { t } from '../../i18n/index.js';
import { AuthError } from '../../auth/errors.js';
import {
  loginWithStudentPassword,
  restoreNbtSession,
  type AuthenticatedNbtSession,
} from '../../auth/nbt-auth.js';
import { createSessionStore } from '../../auth/session-store.js';
import {
  resolveTerm,
  relevantTerms,
  writePrivateIcs,
  isSessionExpired,
  JWXT_ORIGIN,
  safeMessage,
} from '../../features/student-timetable.js';
import {
  termKey,
  loadWeekOne,
  saveWeekOne,
  saveTimetableCache,
  saveCurrentPointer,
  loadCurrentPointer,
  loadTimetableCache,
  clearScheduleCache,
} from '../../features/schedule-store.js';
import { loadCalendarOrThrow, toDisplayEvent } from '../../features/calendar.js';
import type { Event } from '../../features/calendar.js';
import {
  currentAcademicWindow,
  inferWeekOneMonday,
  isAcademicBreakEvent,
  type AcademicWindow,
  type OnBreak,
} from '@nbtca/nbtcal';
import { sanitizeAcademicTerm, sanitizeTimetable } from '../../features/timetable-sanitize.js';
import { addLocalDays, parseLocalMonday } from '../../core/calendar-day.js';

let state: ScheduleViewState = { mode: 'loading' };
let session: AuthenticatedNbtSession | null = null;
let client: NbtTimetableClient | null = null;
let catalog: AcademicTerm[] = [];
let pendingId = '';

async function releaseSession(target: AuthenticatedNbtSession | null = session): Promise<void> {
  if (!target) return;
  if (session === target) {
    session = null;
    client = null;
  }
  try {
    await target.close();
  } catch {}
}

function isTimetableLike(value: unknown): value is Timetable {
  return (
    !!value &&
    typeof value === 'object' &&
    Array.isArray((value as Timetable).meetings) &&
    Array.isArray((value as Timetable).periods)
  );
}

function readCachedTimetable(value: unknown): Timetable | null {
  if (!isTimetableLike(value)) return null;
  try {
    return sanitizeTimetable(value);
  } catch {
    return null;
  }
}

function returnToHub(): boolean {
  const tt = state.timetable;
  const backKey = state.key;
  const backWeekOne = state.weekOne;
  if (tt && backKey && backWeekOne) {
    const schedule = createTimetableSchedule(tt, { weekOneMonday: backWeekOne });
    state = {
      mode: 'hub',
      key: backKey,
      ...(state.term ? { term: state.term } : {}),
      weekOne: backWeekOne,
      timetable: tt,
      gridCursor: state.gridCursor ?? defaultGridCursor(schedule.weekdayAt(new Date()), tt.periods),
    };
    return true;
  }
  return false;
}

function goToLoginId(errorMessage?: string): void {
  pendingId = '';
  setVimKeysActive(false);
  state = {
    mode: 'needsLoginId',
    ...(errorMessage === undefined ? {} : { errorMessage }),
    idField: new TextField({
      message: t().timetable.studentId,
      placeholder: t().timetable.studentIdHint,
    }),
  };
}

function buildPublicField(): ListField {
  const trans = t();
  return new ListField({
    title: trans.timetable.menuEntry,
    options: [{ value: 'login', label: trans.timetable.publicLoginAction }],
    footer: trans.menu.hintMove,
  });
}

const PUBLIC_UPCOMING_FETCH_CAP = 15;

async function goToPublic(ctx: AppContext): Promise<void> {
  setVimKeysActive(true);
  state = { mode: 'public', publicField: buildPublicField() };
  ctx.rerender();
  try {
    const cal = await loadCalendarOrThrow();
    const now = new Date();
    const windowEvents = cal.inRange(addLocalDays(now, -400), addLocalDays(now, 400));
    const publicWindow: AcademicWindow | OnBreak | null = currentAcademicWindow(windowEvents, now);
    const publicUpcoming: Event[] = cal
      .upcoming({ days: 30 })
      .filter((e) => !isAcademicBreakEvent(e))
      .slice(0, PUBLIC_UPCOMING_FETCH_CAP)
      .map(toDisplayEvent);
    state = { ...state, publicWindow, publicUpcoming };
  } catch {
    state = { ...state, publicWindow: null };
  }
  ctx.rerender();
}

async function tryInferWeekOne(): Promise<string | null> {
  try {
    const cal = await loadCalendarOrThrow();
    const now = new Date();
    const events = cal.inRange(addLocalDays(now, -400), addLocalDays(now, 400));
    return inferWeekOneMonday(events, now);
  } catch {
    return null;
  }
}

async function afterAuthenticated(ctx: AppContext, s: AuthenticatedNbtSession): Promise<void> {
  const hadCache = state.mode === 'hub';
  if (session && session !== s) await releaseSession(session);
  session = s;
  client = createNbtTimetableClient(s.timetableTransport, { baseUrl: JWXT_ORIGIN });
  try {
    catalog = (await client.listTerms()).map(sanitizeAcademicTerm);
    const term = resolveTerm(catalog);
    const key = termKey(term);
    let weekOne = loadWeekOne(key);
    if (!weekOne) {
      weekOne = await tryInferWeekOne();
      if (weekOne) saveWeekOne(key, weekOne);
    }
    if (!weekOne) {
      setVimKeysActive(false);
      state = {
        mode: 'needsWeekOne',
        key,
        term,
        errorMessage: t().timetable.weekOneAutoFailed,
        weekOneField: new TextField({
          message: t().timetable.weekOne,
          placeholder: t().timetable.weekOneHint,
        }),
      };
      ctx.rerender();
      return;
    }
    await fetchAndShowHub(ctx, term, key, weekOne);
  } catch (err) {
    if (isSessionExpired(err)) {
      createSessionStore().clear();
      await releaseSession(s);
      if (!hadCache) goToLoginId(t().timetable.expiredRelogin);
    } else {
      await releaseSession(s);
      if (!hadCache) state = { mode: 'error', errorMessage: safeMessage(err) };
    }
    ctx.rerender();
  }
}

async function fetchAndShowHub(
  ctx: AppContext,
  term: AcademicTerm,
  key: string,
  weekOne: string,
): Promise<void> {
  if (!client) return;
  state = { mode: 'loading', statusMessage: t().calendar.loading };
  ctx.rerender();
  try {
    const timetable = sanitizeTimetable(await client.fetchTerm(term));
    const schedule = createTimetableSchedule(timetable, { weekOneMonday: weekOne });
    saveTimetableCache(key, timetable);
    saveCurrentPointer(key, weekOne);
    state = {
      mode: 'hub',
      key,
      term,
      weekOne,
      timetable,
      gridCursor: defaultGridCursor(schedule.weekdayAt(new Date()), timetable.periods),
    };
  } catch (err) {
    if (isSessionExpired(err)) {
      createSessionStore().clear();
      await releaseSession();
      goToLoginId(t().timetable.expiredRelogin);
    } else {
      state = { mode: 'error', errorMessage: safeMessage(err) };
    }
  }
  ctx.rerender();
}

async function refreshFromNetwork(ctx: AppContext): Promise<void> {
  const hadCache = state.mode === 'hub';
  try {
    const store = createSessionStore();
    const persisted = store.load();
    if (!persisted) {
      if (!hadCache) await goToPublic(ctx);
      return;
    }
    const restored = await restoreNbtSession(persisted);
    await afterAuthenticated(ctx, restored);
  } catch (err) {
    if (!hadCache) {
      if (err instanceof AuthError && isSessionExpired(err)) {
        createSessionStore().clear();
      }
      await goToPublic(ctx);
    }
  }
}

export const scheduleView = {
  id: 'schedule',
  title: t().timetable.menuEntry,

  async load(ctx: AppContext): Promise<void> {
    const ptr = loadCurrentPointer();
    const cached = readCachedTimetable(ptr ? loadTimetableCache(ptr.termKey) : null);
    if (ptr && cached) {
      const schedule = createTimetableSchedule(cached, { weekOneMonday: ptr.weekOneMonday });
      state = {
        mode: 'hub',
        key: ptr.termKey,
        weekOne: ptr.weekOneMonday,
        timetable: cached,
        gridCursor: defaultGridCursor(schedule.weekdayAt(new Date()), cached.periods),
      };
    } else {
      state = { mode: 'loading' };
    }
    ctx.rerender();
    await refreshFromNetwork(ctx);
  },

  async dispose(): Promise<void> {
    await releaseSession();
  },

  render(ctx: AppContext): string[] {
    state.termField?.setMaxVisible(computeMaxVisible(ctx.bodyRows));
    return renderSchedule(state, new Date(), ctx.bodyRows, ctx.size.cols);
  },

  capturesInput(): boolean {
    return (
      state.mode === 'needsLoginId' ||
      state.mode === 'needsLoginPassword' ||
      state.mode === 'needsWeekOne'
    );
  },

  capturesPageKeys(): boolean {
    return state.mode === 'public' || state.mode === 'termPicker';
  },

  footerHint(tabCount: number, cols = Number.POSITIVE_INFINITY): string | undefined {
    const capturing =
      state.mode === 'needsLoginId' ||
      state.mode === 'needsLoginPassword' ||
      state.mode === 'needsWeekOne';
    if (capturing) return captureFooterHint(cols);
    const passive =
      state.mode === 'loading' ||
      state.mode === 'authenticating' ||
      state.mode === 'error' ||
      state.mode === 'meetingDetail' ||
      state.mode === 'unresolved' ||
      state.mode === 'termDensity';
    return passive ? passiveFooterHint(tabCount, cols) : undefined;
  },

  handleBack(ctx: AppContext): boolean {
    if (state.mode === 'needsLoginId') {
      void goToPublic(ctx);
      return true;
    }
    if (state.mode === 'needsLoginPassword' || state.mode === 'needsWeekOne') {
      goToLoginId();
      return true;
    }
    if (state.mode === 'meetingDetail') {
      if (state.detailFrom === 'week') {
        state = { ...state, mode: 'week' };
        return true;
      }
      return returnToHub();
    }
    if (
      state.mode === 'week' ||
      state.mode === 'unresolved' ||
      state.mode === 'termPicker' ||
      state.mode === 'termDensity'
    ) {
      return returnToHub();
    }
    return false;
  },

  handleKey(key: string, ctx: AppContext): void {
    switch (state.mode) {
      case 'public': {
        const result = state.publicField?.handleKey(key);
        if (result?.selected === 'login') goToLoginId();
        return;
      }
      case 'needsLoginId': {
        const result = state.idField?.handleKey(key);
        if (result?.cancelled) {
          void goToPublic(ctx);
          return;
        }
        if (result?.submitted !== undefined) {
          pendingId = result.submitted;
          state = {
            mode: 'needsLoginPassword',
            passwordField: new TextField({
              message: t().timetable.password,
              placeholder: t().timetable.passwordHint,
              secret: true,
            }),
          };
        }
        return;
      }
      case 'needsLoginPassword': {
        const result = state.passwordField?.handleKey(key);
        if (result?.cancelled) {
          goToLoginId();
          return;
        }
        if (result?.submitted !== undefined) {
          const password = result.submitted;
          setVimKeysActive(true);
          state = { mode: 'authenticating', statusMessage: t().timetable.loginWillSave };
          ctx.rerender();
          void loginWithStudentPassword(pendingId, password)
            .then(async (s) => {
              let handedOff = false;
              try {
                createSessionStore().save(await s.snapshot());
                handedOff = true;
                await afterAuthenticated(ctx, s);
              } finally {
                if (!handedOff) await releaseSession(s);
              }
            })
            .catch((err: unknown) => {
              goToLoginId(safeMessage(err));
              ctx.rerender();
            });
        }
        return;
      }
      case 'needsWeekOne': {
        const result = state.weekOneField?.handleKey(key);
        if (result?.cancelled) {
          goToLoginId();
          return;
        }
        if (result?.submitted !== undefined) {
          const trimmed = result.submitted.trim();
          let valid = true;
          try {
            parseLocalMonday(trimmed);
          } catch {
            valid = false;
          }
          const targetKey = state.key;
          const targetTerm = state.term;
          if (!valid || !targetKey || !targetTerm) {
            state = { ...state, errorMessage: t().timetable.weekOneHint };
            return;
          }
          saveWeekOne(targetKey, trimmed);
          setVimKeysActive(true);
          void fetchAndShowHub(ctx, targetTerm, targetKey, trimmed);
        }
        return;
      }
      case 'hub': {
        const tt = state.timetable;
        const hubKey = state.key;
        const hubWeekOne = state.weekOne;
        if (!tt || !hubKey || !hubWeekOne) return;
        {
          const schedule = createTimetableSchedule(tt, { weekOneMonday: hubWeekOne });
          const now = new Date();
          const cursor = state.gridCursor ?? defaultGridCursor(schedule.weekdayAt(now), tt.periods);
          const week = Math.max(1, schedule.weekAt(now));
          const nav = handleGridKey(key, cursor, tt, week);
          if (nav.kind === 'moveCursor') {
            state = { ...state, gridCursor: nav.cursor };
            return;
          }
          if (nav.kind === 'openDetail') {
            state = {
              ...state,
              mode: 'meetingDetail',
              detailMeeting: nav.meeting,
              detailFrom: 'hub',
            };
            return;
          }
        }

        const shortcut = hubShortcuts(tt).find((sc) => sc.key === key);
        if (!shortcut) return;
        if (shortcut.key === 'w') {
          state = { ...state, mode: 'week' };
          return;
        }
        if (shortcut.key === 't') {
          state = { ...state, mode: 'termDensity' };
          return;
        }
        if (shortcut.key === 'u') {
          state = { ...state, mode: 'unresolved' };
          return;
        }
        if (shortcut.key === 's') {
          const options = relevantTerms(catalog).map((tm) => ({
            value: `${tm.academicYear}:${tm.semester}`,
            label: tm.academicYearLabel,
            ...(tm.current ? { hint: t().common.current } : {}),
          }));
          options.push({ value: '__back__', label: t().common.back });
          state = {
            ...state,
            mode: 'termPicker',
            termField: new ListField({
              title: t().timetable.hubSwitchTerm,
              options,
              maxVisible: computeMaxVisible(ctx.bodyRows),
            }),
          };
          return;
        }
        if (shortcut.key === 'e') {
          try {
            const ics = timetableToIcs(tt, {
              weekOneMonday: hubWeekOne,
              calendarName: `NBT ${state.term?.academicYearLabel ?? ''}`,
            });
            const out = `timetable-${hubKey}.ics`;
            writePrivateIcs(out, ics);
            state = { ...state, statusMessage: `${t().common.success}: ${path.resolve(out)}` };
          } catch {
            state = { ...state, statusMessage: t().timetable.genericError };
          }
          return;
        }
        if (shortcut.key === 'x') {
          createSessionStore().clear();
          clearScheduleCache();
          void releaseSession();
          void goToPublic(ctx);
        }
        return;
      }
      case 'week': {
        const tt = state.timetable;
        const weekOne = state.weekOne;
        if (!tt || !weekOne) {
          returnToHub();
          return;
        }
        const schedule = createTimetableSchedule(tt, { weekOneMonday: weekOne });
        const now = new Date();
        const cursor = state.gridCursor ?? defaultGridCursor(schedule.weekdayAt(now), tt.periods);
        const week = Math.max(1, schedule.weekAt(now));
        const nav = handleGridKey(key, cursor, tt, week);
        if (nav.kind === 'moveCursor') {
          state = { ...state, gridCursor: nav.cursor };
          return;
        }
        if (nav.kind === 'openDetail') {
          state = {
            ...state,
            mode: 'meetingDetail',
            detailMeeting: nav.meeting,
            detailFrom: 'week',
          };
          return;
        }
        returnToHub();
        return;
      }
      case 'meetingDetail': {
        if (state.detailFrom === 'week') {
          state = { ...state, mode: 'week' };
          return;
        }
        returnToHub();
        return;
      }
      case 'unresolved':
      case 'termDensity': {
        returnToHub();
        return;
      }
      case 'termPicker': {
        const result = state.termField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__back__') {
          returnToHub();
          return;
        }
        const term = resolveTerm(catalog, result.selected);
        const newTermKey = termKey(term);
        const weekOne = loadWeekOne(newTermKey);
        if (!weekOne) {
          setVimKeysActive(false);
          state = {
            mode: 'needsWeekOne',
            key: newTermKey,
            term,
            weekOneField: new TextField({
              message: t().timetable.weekOne,
              placeholder: t().timetable.weekOneHint,
            }),
          };
          return;
        }
        void fetchAndShowHub(ctx, term, newTermKey, weekOne);
        return;
      }
      case 'loading':
      case 'authenticating':
      case 'error':
        return;
    }
  },
} satisfies View;
