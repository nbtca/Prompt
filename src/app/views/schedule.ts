import path from 'node:path';
import {
  createNbtTimetableClient,
  timetableToIcs,
  type AcademicTerm,
  type AcademicTermRef,
  type NbtTimetableClient,
  type Timetable,
} from '@nbtca/nbtcal/timetable';
import type { AppContext, View } from '../view.js';
import { ListField, computeMaxVisible } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { renderSchedule, type ScheduleViewState } from './schedule-render.js';
import { setVimKeysActive } from '../../core/vim-keys.js';
import { c } from '../../core/theme.js';
import { pickIcon } from '../../core/icons.js';
import { t } from '../../i18n/index.js';
import { AuthError } from '../../auth/errors.js';
import { loginWithStudentPassword, restoreNbtSession, type AuthenticatedNbtSession } from '../../auth/nbt-auth.js';
import { createSessionStore } from '../../auth/session-store.js';
import {
  resolveTerm, relevantTerms, writePrivateIcs, isSessionExpired, JWXT_ORIGIN,
} from '../../features/student-timetable.js';
import {
  termKey, loadWeekOne, saveWeekOne, saveTimetableCache,
  saveCurrentPointer, loadCurrentPointer, loadTimetableCache, clearScheduleCache,
} from '../../features/schedule-store.js';

let state: ScheduleViewState = { mode: 'loading' };
let session: AuthenticatedNbtSession | null = null;
let client: NbtTimetableClient | null = null;
let catalog: AcademicTerm[] = [];
let pendingId = '';

function captureFooterHint(): string {
  const trans = t();
  return `Ctrl+C ${trans.common.exit}  ·  Esc ${trans.common.back}  ·  Enter ${trans.common.confirm}`;
}

function isTimetableLike(value: unknown): value is Timetable {
  return !!value && typeof value === 'object'
    && Array.isArray((value as Timetable).meetings)
    && Array.isArray((value as Timetable).periods);
}

/** Exported for direct unit testing — pure given a Timetable, no module state. */
export function buildHubField(tt: Timetable): ListField {
  const trans = t();
  const options = [
    { value: 'week', label: trans.timetable.hubWeek },
    { value: 'term', label: trans.timetable.hubSwitchTerm },
    { value: 'export', label: trans.timetable.hubExport },
    ...(tt.unresolvedItems.length > 0
      ? [{
        value: 'unresolved',
        // Warn-colored so it stands out even when not the selected row —
        // this is the one thing on the hub that genuinely needs the
        // student's attention, unlike the routine actions around it.
        label: c.warn(`${pickIcon('⚠', '!')} ${trans.timetable.hubUnresolved}`),
        hint: String(tt.unresolvedItems.length),
      }]
      : []),
    { value: 'logout', label: trans.timetable.hubLogout },
  ];
  return new ListField({ title: trans.timetable.menuEntry, options, footer: trans.menu.hintMove });
}

function returnToHub(): boolean {
  const tt = state.timetable;
  const backKey = state.key;
  const backWeekOne = state.weekOne;
  if (tt && backKey && backWeekOne) {
    state = { mode: 'hub', key: backKey, term: state.term, weekOne: backWeekOne, timetable: tt, hubField: buildHubField(tt) };
    return true;
  }
  return false;
}

function goToLoginId(errorMessage?: string): void {
  pendingId = '';
  setVimKeysActive(false);
  state = {
    mode: 'needsLoginId',
    errorMessage,
    idField: new TextField({ message: t().timetable.studentId, placeholder: t().timetable.studentIdHint }),
  };
}

async function afterAuthenticated(ctx: AppContext, s: AuthenticatedNbtSession): Promise<void> {
  session = s;
  client = createNbtTimetableClient(s.timetableTransport, { baseUrl: JWXT_ORIGIN });
  try {
    catalog = await client.listTerms();
    const term = resolveTerm(catalog);
    const key = termKey(term);
    const weekOne = loadWeekOne(key);
    if (!weekOne) {
      setVimKeysActive(false);
      state = {
        mode: 'needsWeekOne',
        key,
        term,
        weekOneField: new TextField({ message: t().timetable.weekOne, placeholder: t().timetable.weekOneHint }),
      };
      ctx.rerender();
      return;
    }
    await fetchAndShowHub(ctx, term, key, weekOne);
  } catch {
    state = { mode: 'error', errorMessage: t().timetable.genericError };
    ctx.rerender();
  }
}

async function fetchAndShowHub(ctx: AppContext, term: AcademicTerm, key: string, weekOne: string): Promise<void> {
  if (!client) return;
  state = { mode: 'loading', statusMessage: t().calendar.loading };
  ctx.rerender();
  try {
    const timetable = await client.fetchTerm(term as AcademicTermRef);
    saveTimetableCache(key, timetable);
    saveCurrentPointer(key, weekOne);
    state = { mode: 'hub', key, term, weekOne, timetable, hubField: buildHubField(timetable) };
  } catch (err) {
    if (isSessionExpired(err)) {
      createSessionStore().clear();
      goToLoginId(t().timetable.expiredRelogin);
    } else {
      state = { mode: 'error', errorMessage: t().timetable.genericError };
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
      if (!hadCache) goToLoginId();
      return;
    }
    const restored = await restoreNbtSession(persisted);
    await afterAuthenticated(ctx, restored);
  } catch (err) {
    if (!hadCache) {
      if (err instanceof AuthError && isSessionExpired(err)) {
        createSessionStore().clear();
      }
      goToLoginId();
    }
    // best-effort: a cached hub already showed, keep it as-is on refresh failure.
  }
}

export const scheduleView: View = {
  id: 'schedule',
  title: t().timetable.menuEntry,

  async load(ctx: AppContext): Promise<void> {
    const ptr = loadCurrentPointer();
    const cached = ptr ? loadTimetableCache(ptr.termKey) : null;
    if (ptr && isTimetableLike(cached)) {
      state = { mode: 'hub', key: ptr.termKey, weekOne: ptr.weekOneMonday, timetable: cached, hubField: buildHubField(cached) };
    } else {
      state = { mode: 'loading' };
    }
    ctx.rerender();
    await refreshFromNetwork(ctx);
  },

  render(ctx: AppContext): string[] {
    // Sync every visible field's scroll window to the *current* terminal
    // size on every frame (not just construction time) — this is what
    // keeps a long list correctly windowed across a live resize.
    state.termField?.setMaxVisible(computeMaxVisible(ctx.bodyRows));
    return renderSchedule(state, new Date());
  },

  capturesInput(): boolean {
    return state.mode === 'needsLoginId' || state.mode === 'needsLoginPassword' || state.mode === 'needsWeekOne';
  },

  footerHint(): string | undefined {
    const capturing = state.mode === 'needsLoginId' || state.mode === 'needsLoginPassword' || state.mode === 'needsWeekOne';
    return capturing ? captureFooterHint() : undefined;
  },

  handleBack(): boolean {
    if (state.mode === 'week' || state.mode === 'unresolved' || state.mode === 'termPicker') {
      return returnToHub();
    }
    return false;
  },

  handleKey(key: string, ctx: AppContext): void {
    switch (state.mode) {
      case 'needsLoginId': {
        const result = state.idField?.handleKey(key);
        if (result?.cancelled) { goToLoginId(); return; }
        if (result?.submitted !== undefined) {
          pendingId = result.submitted;
          state = {
            mode: 'needsLoginPassword',
            passwordField: new TextField({ message: t().timetable.password, placeholder: t().timetable.passwordHint, secret: true }),
          };
        }
        return;
      }
      case 'needsLoginPassword': {
        const result = state.passwordField?.handleKey(key);
        if (result?.cancelled) { goToLoginId(); return; }
        if (result?.submitted !== undefined) {
          const password = result.submitted;
          setVimKeysActive(true);
          state = { mode: 'authenticating', statusMessage: t().timetable.loginWillSave };
          ctx.rerender();
          void loginWithStudentPassword(pendingId, password)
            .then(async (s) => {
              createSessionStore().save(await s.snapshot());
              await afterAuthenticated(ctx, s);
            })
            .catch(() => {
              goToLoginId(t().timetable.invalidCredentials);
              ctx.rerender();
            });
        }
        return;
      }
      case 'needsWeekOne': {
        const result = state.weekOneField?.handleKey(key);
        if (result?.cancelled) { goToLoginId(); return; }
        if (result?.submitted !== undefined) {
          const trimmed = result.submitted.trim();
          const valid = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) && !Number.isNaN(new Date(`${trimmed}T00:00:00`).getTime());
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
        const result = state.hubField?.handleKey(key);
        const tt = state.timetable;
        const hubKey = state.key;
        const hubWeekOne = state.weekOne;
        if (!result?.selected || !tt || !hubKey || !hubWeekOne) return;
        if (result.selected === 'week') { state = { ...state, mode: 'week' }; return; }
        if (result.selected === 'unresolved') { state = { ...state, mode: 'unresolved' }; return; }
        if (result.selected === 'term') {
          const options = relevantTerms(catalog).map((tm) => ({
            value: `${tm.academicYear}:${tm.semester}`,
            label: tm.academicYearLabel,
            hint: tm.current ? t().common.current : undefined,
          }));
          options.push({ value: '__back__', label: t().common.back, hint: undefined });
          state = {
            ...state,
            mode: 'termPicker',
            termField: new ListField({ title: t().timetable.hubSwitchTerm, options, maxVisible: computeMaxVisible(ctx.bodyRows) }),
          };
          return;
        }
        if (result.selected === 'export') {
          try {
            const ics = timetableToIcs(tt, { weekOneMonday: hubWeekOne, calendarName: `NBT ${state.term?.academicYearLabel ?? ''}` });
            const out = `timetable-${hubKey}.ics`;
            writePrivateIcs(out, ics);
            state = { ...state, statusMessage: `${t().common.success}: ${path.resolve(out)}` };
          } catch {
            state = { ...state, statusMessage: t().timetable.genericError };
          }
          return;
        }
        if (result.selected === 'logout') {
          createSessionStore().clear();
          clearScheduleCache();
          void session?.close();
          session = null;
          client = null;
          goToLoginId();
        }
        return;
      }
      case 'week':
      case 'unresolved': {
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
            weekOneField: new TextField({ message: t().timetable.weekOne, placeholder: t().timetable.weekOneHint }),
          };
          return;
        }
        void fetchAndShowHub(ctx, term, newTermKey, weekOne);
        return;
      }
      default:
        return;
    }
  },
};
