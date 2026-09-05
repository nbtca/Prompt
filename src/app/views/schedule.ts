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
import { loadCalendarOrThrow } from '../../features/calendar.js';
import {
  currentAcademicWindow,
  inferWeekOneMonday,
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
let lifecycleGeneration = 0;
const closingSessions = new WeakMap<AuthenticatedNbtSession, Promise<void>>();

function isLifecycleActive(ctx: AppContext, generation: number): boolean {
  return generation === lifecycleGeneration && ctx.signal?.aborted !== true;
}

async function closeSession(target: AuthenticatedNbtSession): Promise<void> {
  let closing = closingSessions.get(target);
  if (!closing) {
    closing = Promise.resolve()
      .then(() => target.close())
      .catch(() => undefined);
    closingSessions.set(target, closing);
  }
  await closing;
}

async function releaseSession(target: AuthenticatedNbtSession | null = session): Promise<void> {
  if (!target) return;
  if (session === target) {
    session = null;
    client = null;
  }
  await closeSession(target);
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
  return new ListField({
    options: [{ value: 'login', label: t().timetable.publicLoginAction }],
  });
}

async function goToPublic(ctx: AppContext, generation = lifecycleGeneration): Promise<void> {
  if (!isLifecycleActive(ctx, generation)) return;
  setVimKeysActive(true);
  state = { mode: 'public', publicField: buildPublicField() };
  ctx.rerender();
  try {
    const cal = await loadCalendarOrThrow(ctx.signal);
    if (!isLifecycleActive(ctx, generation)) return;
    const now = new Date();
    const windowEvents = cal.inRange(addLocalDays(now, -400), addLocalDays(now, 400));
    const publicWindow: AcademicWindow | OnBreak | null = currentAcademicWindow(windowEvents, now);
    state = { ...state, publicWindow };
  } catch {
    if (!isLifecycleActive(ctx, generation)) return;
    state = { ...state, publicWindow: null };
  }
  if (isLifecycleActive(ctx, generation)) ctx.rerender();
}

async function tryInferWeekOne(ctx: AppContext, generation: number): Promise<string | null> {
  try {
    const cal = await loadCalendarOrThrow(ctx.signal);
    if (!isLifecycleActive(ctx, generation)) return null;
    const now = new Date();
    const events = cal.inRange(addLocalDays(now, -400), addLocalDays(now, 400));
    return inferWeekOneMonday(events, now);
  } catch {
    return null;
  }
}

async function afterAuthenticated(
  ctx: AppContext,
  s: AuthenticatedNbtSession,
  generation: number,
): Promise<void> {
  if (!isLifecycleActive(ctx, generation)) {
    await closeSession(s);
    return;
  }
  const hadCache = state.mode === 'hub';
  if (session && session !== s) await releaseSession(session);
  if (!isLifecycleActive(ctx, generation)) {
    await closeSession(s);
    return;
  }
  session = s;
  client = createNbtTimetableClient(s.timetableTransport, { baseUrl: JWXT_ORIGIN });
  try {
    const nextCatalog = (
      await client.listTerms(ctx.signal === undefined ? {} : { signal: ctx.signal })
    ).map(sanitizeAcademicTerm);
    if (!isLifecycleActive(ctx, generation)) return;
    catalog = nextCatalog;
    const term = resolveTerm(catalog);
    const key = termKey(term);
    let weekOne = loadWeekOne(key);
    if (!weekOne) {
      weekOne = await tryInferWeekOne(ctx, generation);
      if (!isLifecycleActive(ctx, generation)) return;
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
    await fetchAndShowHub(ctx, term, key, weekOne, generation);
  } catch (err) {
    if (!isLifecycleActive(ctx, generation)) return;
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
  generation = lifecycleGeneration,
): Promise<void> {
  if (!client || !isLifecycleActive(ctx, generation)) return;
  state = { mode: 'loading', statusMessage: t().calendar.loading };
  ctx.rerender();
  try {
    const timetable = sanitizeTimetable(
      await client.fetchTerm(term, ctx.signal === undefined ? {} : { signal: ctx.signal }),
    );
    if (!isLifecycleActive(ctx, generation)) return;
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
    if (!isLifecycleActive(ctx, generation)) return;
    if (isSessionExpired(err)) {
      createSessionStore().clear();
      await releaseSession();
      goToLoginId(t().timetable.expiredRelogin);
    } else {
      state = { mode: 'error', errorMessage: safeMessage(err) };
    }
  }
  if (isLifecycleActive(ctx, generation)) ctx.rerender();
}

async function refreshFromNetwork(ctx: AppContext, generation: number): Promise<void> {
  if (!isLifecycleActive(ctx, generation)) return;
  const hadCache = state.mode === 'hub';
  try {
    const store = createSessionStore();
    const persisted = store.load();
    if (!persisted) {
      if (!hadCache) await goToPublic(ctx, generation);
      return;
    }
    const restored = await restoreNbtSession(persisted);
    if (!isLifecycleActive(ctx, generation)) {
      await closeSession(restored);
      return;
    }
    await afterAuthenticated(ctx, restored, generation);
  } catch (err) {
    if (!isLifecycleActive(ctx, generation)) return;
    if (!hadCache) {
      if (err instanceof AuthError && isSessionExpired(err)) {
        createSessionStore().clear();
      }
      await goToPublic(ctx, generation);
    }
  }
}

export const scheduleView = {
  id: 'schedule',
  title: t().timetable.menuEntry,

  async load(ctx: AppContext): Promise<void> {
    const generation = ++lifecycleGeneration;
    if (!isLifecycleActive(ctx, generation)) return;
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
    await refreshFromNetwork(ctx, generation);
  },

  async dispose(): Promise<void> {
    lifecycleGeneration += 1;
    setVimKeysActive(true);
    await releaseSession();
  },

  render(ctx: AppContext): string[] {
    state.termField?.setMaxVisible(computeMaxVisible(ctx.bodyRows));
    return renderSchedule(state, new Date(), ctx.bodyRows, ctx.size.cols);
  },

  isBusy(): boolean {
    return state.mode === 'loading';
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
          const generation = lifecycleGeneration;
          setVimKeysActive(true);
          state = { mode: 'authenticating', statusMessage: t().timetable.loginWillSave };
          ctx.rerender();
          void loginWithStudentPassword(
            pendingId,
            password,
            ctx.signal === undefined ? {} : { signal: ctx.signal },
          )
            .then(async (s) => {
              try {
                if (!isLifecycleActive(ctx, generation)) {
                  await closeSession(s);
                  return;
                }
                const snapshot = await s.snapshot();
                if (!isLifecycleActive(ctx, generation)) {
                  await closeSession(s);
                  return;
                }
                createSessionStore().save(snapshot);
                await afterAuthenticated(ctx, s, generation);
              } catch (error) {
                await closeSession(s);
                throw error;
              }
            })
            .catch((err: unknown) => {
              if (!isLifecycleActive(ctx, generation)) return;
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
          void fetchAndShowHub(ctx, targetTerm, targetKey, trimmed, lifecycleGeneration);
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
          const generation = ++lifecycleGeneration;
          createSessionStore().clear();
          clearScheduleCache();
          void releaseSession();
          void goToPublic(ctx, generation);
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
        void fetchAndShowHub(ctx, term, newTermKey, weekOne, lifecycleGeneration);
        return;
      }
      case 'loading':
      case 'authenticating':
      case 'error':
        return;
    }
  },
} satisfies View;
