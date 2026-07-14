# App-Shell Phase B — Native Events View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Events tab from the classic bridge into a native app-shell `View`: countdown + heatmap hub, upcoming/week/month/search/past lists, and event detail + export, all redrawn in place with no alt-screen exit.

**Architecture:** Same `mode`-state-machine pattern as Schedule and Docs, built from `ListField`/`TextField` plus `calendar.ts`'s already-pure/exported functions (`loadCalendarOrThrow`, `toDisplayEvent`, `renderCountdownBanner`, `exportEventIcs`) and `calendar-heatmap.ts`'s `renderHeatmap`, `calendar-query.ts`'s `weekRange`/`monthRange`/`filterEvents`. No new i18n keys — every string this view needs already exists under `calendar.*`. One deliberate UX change from the classic surface: list mode shows only the interactive picker (not a separate static table above it), since the native frame has a fixed `bodyRows` and a duplicate read-only table would waste vertical space that a scrolling terminal never had to ration.

**Tech Stack:** TypeScript, Node.js, Vitest. No new dependencies.

## Global Constraints

- Node.js >= 20.12.0. No new npm dependency.
- Non-interactive CLI command mode (`nbtca events ...`) is untouched.
- `src/features/calendar.ts`'s classic `showCalendar()` is not deleted — stays reachable from `showMainMenu`.
- Events data is refetched each time the tab loads (matches the classic surface's behavior — event data is public/cheap and changes more often than a personal timetable, unlike Schedule's cache-first treatment).

---

### Task 1: `renderEvents` — pure per-mode body renderer

**Files:**
- Create: `src/app/views/events-render.ts`
- Test: `src/app/views/events-render.test.ts`

**Interfaces:**
- Consumes: `ListField`, `TextField`; `renderCountdownBanner`, `type Event` (`src/features/calendar.ts`); `renderHeatmap` (`src/features/calendar-heatmap.ts`); `type HeatmapBucket` (`@nbtca/nbtcal`).
- Produces: `export interface EventsViewState { mode: EventsMode; ... }`, `export function renderEvents(state: EventsViewState, now: Date): string[]`. Consumed by Task 2.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/views/events-render.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { renderEvents, type EventsViewState } from './events-render.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi } from '../../core/text.js';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

describe('renderEvents', () => {
  it('loading mode shows a loading hint', () => {
    const out = stripAnsi(renderEvents({ mode: 'loading' }, new Date()).join('\n'));
    expect(out.trim().length).toBeGreaterThan(0);
  });

  it('hub mode shows the hub action list', () => {
    const hubField = new ListField({ title: 'Events', options: [{ value: 'upcoming', label: 'Events' }] });
    const out = stripAnsi(renderEvents({ mode: 'hub', hubField, heatmapBuckets: [] }, new Date()).join('\n'));
    expect(out).toContain('Events');
  });

  it('list mode shows the list field', () => {
    const listField = new ListField({ title: 'Events', options: [{ value: '0', label: 'Hackathon' }] });
    const out = stripAnsi(renderEvents({ mode: 'list', listField }, new Date()).join('\n'));
    expect(out).toContain('Hackathon');
  });

  it('detail mode shows the event title and the action list', () => {
    const detailField = new ListField({ title: 'Hackathon', options: [{ value: 'export', label: 'Export .ics' }] });
    const out = stripAnsi(renderEvents({
      mode: 'detail', detailField,
      detailTitle: 'Hackathon', detailMeta: '03-25  ·  Main Hall', detailDescription: 'Bring a laptop.',
    }, new Date()).join('\n'));
    expect(out).toContain('Hackathon');
    expect(out).toContain('Bring a laptop.');
  });

  it('search mode renders the text field', () => {
    const searchField = new TextField({ message: 'Search events' });
    const out = stripAnsi(renderEvents({ mode: 'search', searchField }, new Date()).join('\n'));
    expect(out).toContain('Search events');
  });

  it('error mode shows the error message', () => {
    const out = stripAnsi(renderEvents({ mode: 'error', errorMessage: 'Broke' }, new Date()).join('\n'));
    expect(out).toContain('Broke');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/views/events-render.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/views/events-render.ts
import type { HeatmapBucket } from '@nbtca/nbtcal';
import { type, space } from '../../core/theme.js';
import { t } from '../../i18n/index.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { renderCountdownBanner, type Event } from '../../features/calendar.js';
import { renderHeatmap } from '../../features/calendar-heatmap.js';

export type EventsMode = 'loading' | 'hub' | 'list' | 'detail' | 'search' | 'error';

export interface EventsViewState {
  mode: EventsMode;
  errorMessage?: string;
  statusMessage?: string;
  nextEvent?: Event;
  heatmapBuckets?: HeatmapBucket[];
  hubField?: ListField;
  listField?: ListField;
  detailField?: ListField;
  detailTitle?: string;
  detailMeta?: string;
  detailDescription?: string;
  searchField?: TextField;
}

function heading(label: string): string {
  return `${space.indent}${type.heading(label)}`;
}

function hint(label: string): string {
  return `${space.indent}${type.hint(label)}`;
}

function renderHubBody(state: EventsViewState, now: Date): string[] {
  const lines: string[] = [];
  const banner = renderCountdownBanner(state.nextEvent, now);
  if (banner) { lines.push(banner); lines.push(''); }
  if (state.heatmapBuckets && state.heatmapBuckets.length > 0) {
    lines.push(renderHeatmap(state.heatmapBuckets, now, { color: true }));
    lines.push('');
  }
  if (state.hubField) lines.push(...state.hubField.render());
  return lines;
}

export function renderEvents(state: EventsViewState, now: Date): string[] {
  const trans = t();
  switch (state.mode) {
    case 'loading':
      return [hint(trans.calendar.loading)];
    case 'hub':
      return renderHubBody(state, now);
    case 'list':
      return state.listField?.render() ?? [];
    case 'detail':
      return [
        heading(state.detailTitle ?? ''),
        hint(state.detailMeta ?? ''),
        '',
        ...(state.detailDescription ? state.detailDescription.split('\n').map((l) => `${space.indent}${l}`) : [hint(trans.calendar.noDescription)]),
        '',
        ...(state.statusMessage ? [hint(state.statusMessage), ''] : []),
        ...(state.detailField?.render() ?? []),
      ];
    case 'search':
      return state.searchField?.render() ?? [];
    case 'error':
      return [hint(state.errorMessage ?? trans.calendar.error)];
    default:
      return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/views/events-render.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/views/events-render.ts src/app/views/events-render.test.ts
git commit -m "feat(app): pure per-mode renderer for the native Events view"
```

---

### Task 2: `views/events.ts` — the stateful native Events view

**Files:**
- Create: `src/app/views/events.ts`
- Test: `src/app/views/events.test.ts`

**Interfaces:**
- Consumes: `EventsViewState`, `renderEvents` (Task 1); `ListField`, `TextField`; `AppContext`, `View`; `loadCalendarOrThrow`, `toDisplayEvent`, `exportEventIcs`, `type Event` (`src/features/calendar.ts`, now exported); `weekRange`, `monthRange`, `filterEvents` (`src/features/calendar-query.ts`, already exported); `type CalendarEvent`, `type Calendar` (`@nbtca/nbtcal`).
- Produces: `export const eventsView: View` with `id: 'events'`. Consumed by Task 3.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/views/events.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { eventsView } from './events.js';
import { setLanguage } from '../../i18n/index.js';
import { resetIconCache } from '../../core/icons.js';
import { stripAnsi } from '../../core/text.js';
import type { AppContext } from '../view.js';

beforeAll(() => {
  setLanguage('en');
  process.env['NBTCA_ICON_MODE'] = 'unicode';
  resetIconCache();
});

function fakeCtx(): AppContext {
  return {
    size: { rows: 24, cols: 80 },
    bodyRows: 19,
    rerender: vi.fn(),
    runClassic: vi.fn(async (fn: () => Promise<void>) => { await fn(); }),
    quit: vi.fn(),
  };
}

describe('eventsView', () => {
  it('has the expected id and title', () => {
    expect(eventsView.id).toBe('events');
    expect(typeof eventsView.title).toBe('string');
  });

  it('render() never throws before load() has run', () => {
    const ctx = fakeCtx();
    expect(() => eventsView.render(ctx)).not.toThrow();
  });

  it('render() output is non-empty text', () => {
    const ctx = fakeCtx();
    const out = stripAnsi(eventsView.render(ctx).join('\n'));
    expect(out.trim().length).toBeGreaterThan(0);
  });

  it('capturesInput() returns a boolean and does not throw', () => {
    expect(typeof eventsView.capturesInput?.()).toBe('boolean');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/views/events.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/views/events.ts
import type { Calendar, CalendarEvent } from '@nbtca/nbtcal';
import type { AppContext, View } from '../view.js';
import { ListField } from '../fields/list-field.js';
import { TextField } from '../fields/text-field.js';
import { renderEvents, type EventsViewState } from './events-render.js';
import { setVimKeysActive } from '../../core/vim-keys.js';
import { t } from '../../i18n/index.js';
import { loadCalendarOrThrow, toDisplayEvent, exportEventIcs } from '../../features/calendar.js';
import { weekRange, monthRange, filterEvents } from '../../features/calendar-query.js';

let state: EventsViewState = { mode: 'loading' };
let calendar: Calendar | null = null;
let currentList: CalendarEvent[] = [];

function backLabel(): string {
  return t().common.back;
}

function buildHubField(): ListField {
  const trans = t();
  const options = [
    { value: 'upcoming', label: trans.menu.events },
    { value: 'week', label: trans.calendar.thisWeek },
    { value: 'month', label: trans.calendar.thisMonth },
    { value: 'search', label: trans.calendar.search },
    { value: 'past', label: trans.calendar.pastEvents },
  ];
  return new ListField({ title: trans.menu.events, options });
}

function buildListField(title: string, events: CalendarEvent[]): ListField {
  const trans = t();
  const display = events.map(toDisplayEvent);
  const options = [
    ...events.map((_e, i) => ({
      value: String(i),
      label: `${display[i]!.date}${display[i]!.time ? ' ' + display[i]!.time : ''}  ${display[i]!.title}`,
      hint: display[i]!.location,
    })),
    { value: '__back__', label: backLabel() },
  ];
  return new ListField({ title: title || trans.menu.events, options: options.length > 1 ? options : [{ value: '__back__', label: `${trans.calendar.noEvents} — ${backLabel()}` }] });
}

function showList(title: string, events: CalendarEvent[]): void {
  currentList = events;
  state = { mode: 'list', listField: buildListField(title, events) };
}

function goToHub(): void {
  const nextEvent = calendar ? calendar.upcoming({ days: 30 })[0] : undefined;
  state = {
    mode: 'hub',
    hubField: buildHubField(),
    nextEvent: nextEvent ? toDisplayEvent(nextEvent) : undefined,
    heatmapBuckets: calendar
      ? calendar.heatmap({ start: new Date(Date.now() - 365 * 86400000), end: new Date(), bucket: 'day' })
      : [],
  };
}

function showDetail(raw: CalendarEvent): void {
  const trans = t();
  const e = toDisplayEvent(raw);
  const dot = trans.calendar ? '·' : '·';
  state = {
    mode: 'detail',
    detailTitle: e.title,
    detailMeta: `${e.date}${e.time ? ' ' + e.time : ''}  ${dot}  ${e.location}${raw.recurring ? `  ${dot}  ${trans.calendar.recurringLabel}` : ''}`,
    detailDescription: e.description,
    detailField: new ListField({
      title: e.title,
      options: [
        { value: 'export', label: trans.calendar.exportIcs },
        { value: '__back__', label: backLabel() },
      ],
    }),
  };
}

export const eventsView: View = {
  id: 'events',
  title: t().menu.events,

  async load(ctx: AppContext): Promise<void> {
    state = { mode: 'loading' };
    ctx.rerender();
    try {
      calendar = await loadCalendarOrThrow();
      goToHub();
    } catch {
      state = { mode: 'error', errorMessage: t().calendar.error };
    }
    ctx.rerender();
  },

  render(_ctx: AppContext): string[] {
    return renderEvents(state, new Date());
  },

  capturesInput(): boolean {
    return state.mode === 'search';
  },

  handleKey(key: string, _ctx: AppContext): void {
    if (!calendar) return;
    switch (state.mode) {
      case 'hub': {
        const result = state.hubField?.handleKey(key);
        if (!result?.selected) return;
        const now = new Date();
        if (result.selected === 'upcoming') { showList(t().menu.events, calendar.upcoming({ days: 30 })); return; }
        if (result.selected === 'week') { const r = weekRange(now); showList(t().calendar.thisWeek, calendar.inRange(r.start, r.end)); return; }
        if (result.selected === 'month') { const r = monthRange(now); showList(t().calendar.thisMonth, calendar.inRange(r.start, r.end)); return; }
        if (result.selected === 'past') { showList(t().calendar.pastEvents, calendar.past({ days: 30 }).reverse()); return; }
        if (result.selected === 'search') {
          setVimKeysActive(false);
          state = { mode: 'search', searchField: new TextField({ message: t().calendar.searchPrompt, placeholder: t().calendar.searchPlaceholder, allowEmpty: true }) };
        }
        return;
      }
      case 'list': {
        const result = state.listField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__back__') { goToHub(); return; }
        const raw = currentList[Number.parseInt(result.selected, 10)];
        if (raw) showDetail(raw);
        return;
      }
      case 'detail': {
        const result = state.detailField?.handleKey(key);
        if (!result?.selected) return;
        if (result.selected === '__back__') { showList('', currentList); return; }
        if (result.selected === 'export' && state.detailTitle) {
          const raw = currentList.find((e) => toDisplayEvent(e).title === state.detailTitle);
          if (raw) {
            const res = exportEventIcs(raw);
            state = { ...state, statusMessage: res.ok ? `${t().calendar.exportSuccess}: ${res.path}` : `${t().calendar.exportError}: ${res.error ?? ''}` };
          }
        }
        return;
      }
      case 'search': {
        const result = state.searchField?.handleKey(key);
        if (result?.cancelled) { setVimKeysActive(true); goToHub(); return; }
        if (result?.submitted !== undefined) {
          setVimKeysActive(true);
          const query = result.submitted.trim();
          if (!query || !calendar) { goToHub(); return; }
          const now = new Date();
          const pool = calendar.inRange(now, new Date(now.getTime() + 365 * 86400000));
          const results = filterEvents(pool, query);
          showList(`${t().calendar.search}: ${query}`, results);
        }
        return;
      }
      default:
        return;
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/views/events.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full test suite and build; fix any TypeScript errors that surface**

Run: `npm run build && npx vitest run`
Expected: PASS. (Note: `showDetail`'s `dot` variable is redundant scaffolding left from drafting — simplify to a plain `'·'` literal or `pickIcon('·','-')` if a build/lint error flags it as always-true; fix inline if `tsc`/eslint complains, this is exactly the kind of small thing the implementer should clean up while making the build pass.)

- [ ] **Step 6: Commit**

```bash
git add src/app/views/events.ts src/app/views/events.test.ts
git commit -m "feat(app): native Events view (hub, list, detail, search, export)"
```

---

### Task 3: Wire the native Events view into the app shell

**Files:**
- Modify: `src/app/app.ts`

- [ ] **Step 1: Update imports and the `nativeViews`/`classicFor` maps**

Remove `import { showCalendar } from '../features/calendar.js';` and add:

```typescript
import { eventsView } from './views/events.js';
```

```typescript
  const nativeViews: Partial<Record<ViewId, View>> = {
    home: homeView,
    schedule: scheduleView,
    docs: docsView,
    events: eventsView,
  };

  const classicFor: Partial<Record<ViewId, () => Promise<void>>> = {
    settings: showSettingsMenu,
  };
```

- [ ] **Step 2: Build and run the full test suite**

Run: `npm run build && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Manual live-launch verification**

Run: `npx tsx src/index.ts` in an interactive terminal.
- [ ] Tab to Events: hub shows countdown banner (if any upcoming event) + heatmap + action list.
- [ ] Open Upcoming/This week/This month/Past: each shows a selectable list; selecting an event shows its detail with Export/Back.
- [ ] Export from detail: confirm the `.ics` path is echoed and the file exists on disk.
- [ ] Search: type letters that overlap vim-keys (`j`, `k`, `q`) and confirm they type literally, not trigger navigation.
- [ ] Tab away and back: hub reloads fresh (this view intentionally refetches, unlike Schedule's cache-first).
- [ ] Resize mid-navigation: frame stays exactly `rows` lines.
- [ ] `q` from Events: terminal fully restored.

- [ ] **Step 4: Commit**

```bash
git add src/app/app.ts
git commit -m "feat(app): switch Events tab to the native app-shell view"
```

## Definition of done

- All 3 tasks committed.
- `npm run build && npx vitest run` passes with zero failures.
- The manual live-launch checklist in Task 3 Step 3 is checked off against a real terminal session.
- `src/features/calendar.ts`'s `showCalendar` still exists, still compiles, stays reachable from `showMainMenu`.

## Follow-on plans

1. Native Settings view (`views/settings.ts`) — after which `classicFor` and the "classic bridge" machinery in `app.ts` can be deleted entirely, closing out Phase B.
