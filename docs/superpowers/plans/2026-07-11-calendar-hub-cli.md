# Calendar Hub (Prompt CLI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Prompt CLI's calendar into a full-feature hub — next-event countdown, week/month/range views, recurring-event markers, keyword search, and single-event `.ics` export — using nbtcal's full API (`next`/`inRange`/`recurring`) plus the new `eventToICS`.

**Architecture:** Add one new pure module `features/calendar-query.ts` (ranges/filter/countdown/filename math) and extend `features/calendar.ts` in place (display model, recurring marker, countdown banner, the interactive hub, export). All new UI uses the Quiet-Precision widgets (Menu/TextInput/Screen/messages) from Phases 1–3. The hub keeps raw `CalendarEvent[]` so export has full fidelity.

**Tech Stack:** TypeScript (ESM, `.js` specifiers), Node ≥20.12, `vitest`, `@nbtca/nbtcal` (locally linked `0.4.0` build providing `eventToICS`).

## Global Constraints

- Node ≥ 20.12; ESM only; relative imports use `.js` specifiers.
- **nbtcal dependency:** the CLI consumes a locally-linked `@nbtca/nbtcal@0.4.0` build (already copied into `node_modules`). `eventToICS` and `CalendarEvent` import from `@nbtca/nbtcal`. **Do NOT** edit `package.json`'s nbtcal version or run `npm install` (0.4.0 isn't published yet — that's a release step). If a task needs a clean `node_modules`, re-link with `cp -r ../nbtcal/dist node_modules/@nbtca/nbtcal/dist && cp ../nbtcal/package.json node_modules/@nbtca/nbtcal/package.json`.
- No new npm dependencies.
- Keep the public API importable from `./features/calendar.js` unchanged (`toDisplayEvent`, `fetchEvents`, `fetchHeatmapBuckets`, `renderEventsTable`, `serializeEvents`, `showEventsPreview`, `showCalendar`) — `index.ts`, `core/menu.ts`, and `calendar.test.ts` import from there.
- Non-interactive CLI (`events --json/--plain/--today/--heatmap/--next`) behavior unchanged; new `--week`/`--month`/`--search` flags degrade like existing ones. JSON gains additive `recurring`/`uid` fields.
- Every new user-facing string gets both `en` and `zh` entries plus a `Translations` interface field.
- New interactive UI uses the existing widgets (`runMenu`, `runTextInput`, `enterScreen`/`breadcrumb`, `success`/`error`, `type`/`space`/`glyph`) — no bare literals; all degrade under non-TTY/reduced-motion.
- Co-located `*.test.ts`; render tests strip ANSI (`stripAnsi`) and pin/restore icon mode; language pinned via `setLanguage('en')`.

---

### Task 1: Pure query helpers (`calendar-query.ts`)

**Files:**
- Create: `src/features/calendar-query.ts`
- Test: `src/features/calendar-query.test.ts`

**Interfaces:**
- Consumes: `CalendarEvent` from `@nbtca/nbtcal`.
- Produces:
  - `weekRange(now: Date): { start: Date; end: Date }` — Mon 00:00 of current week → next Mon 00:00 (local).
  - `monthRange(now: Date): { start: Date; end: Date }` — 1st 00:00 of current month → 1st 00:00 of next month (local).
  - `filterEvents(events: CalendarEvent[], query: string): CalendarEvent[]` — case-insensitive title/location substring match; empty query → all.
  - `interface Countdown { past: boolean; days: number; hours: number; minutes: number }`
  - `countdownParts(target: Date, now: Date): Countdown`
  - `buildExportFilename(event: CalendarEvent): string` — safe `<title>.ics`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/calendar-query.test.ts
import { describe, it, expect } from 'vitest';
import type { CalendarEvent } from '@nbtca/nbtcal';
import { weekRange, monthRange, filterEvents, countdownParts, buildExportFilename } from './calendar-query.js';

function ev(o: Partial<CalendarEvent>): CalendarEvent {
  return { uid: 'u', title: 'T', start: new Date(), end: null, isAllDay: false, location: null, description: null, recurring: false, ...o };
}

describe('weekRange', () => {
  it('spans Monday 00:00 to the next Monday 00:00', () => {
    const wed = new Date(2026, 2, 25, 15, 0, 0); // Wed 2026-03-25
    const { start, end } = weekRange(wed);
    expect(start.getDay()).toBe(1);              // Monday
    expect(start.getHours()).toBe(0);
    expect(start.getDate()).toBe(23);            // Mon 2026-03-23
    expect(end.getDate()).toBe(30);              // next Mon 2026-03-30
    expect(Math.round((end.getTime() - start.getTime()) / 86400000)).toBe(7);
  });
});

describe('monthRange', () => {
  it('spans the 1st of this month to the 1st of next month', () => {
    const { start, end } = monthRange(new Date(2026, 2, 25));
    expect(start.getMonth()).toBe(2); expect(start.getDate()).toBe(1); expect(start.getHours()).toBe(0);
    expect(end.getMonth()).toBe(3); expect(end.getDate()).toBe(1);
  });
});

describe('filterEvents', () => {
  const events = [ev({ title: 'Hack Night', location: 'Lab' }), ev({ title: 'Study Group', location: 'Library' })];
  it('matches title case-insensitively', () => {
    expect(filterEvents(events, 'hack').map(e => e.title)).toEqual(['Hack Night']);
  });
  it('matches location', () => {
    expect(filterEvents(events, 'library').map(e => e.title)).toEqual(['Study Group']);
  });
  it('empty query returns all', () => {
    expect(filterEvents(events, '  ')).toHaveLength(2);
  });
});

describe('countdownParts', () => {
  const now = new Date('2026-03-25T12:00:00Z');
  it('breaks a future delta into d/h/m', () => {
    const t = new Date('2026-03-28T16:30:00Z'); // +3d 4h 30m
    expect(countdownParts(t, now)).toEqual({ past: false, days: 3, hours: 4, minutes: 30 });
  });
  it('marks a non-future target as past', () => {
    expect(countdownParts(new Date('2026-03-25T11:00:00Z'), now).past).toBe(true);
  });
});

describe('buildExportFilename', () => {
  it('sanitizes to a safe .ics name', () => {
    expect(buildExportFilename(ev({ title: 'Hack Night: v2 / 2026' }))).toBe('Hack-Night-v2-2026.ics');
  });
  it('falls back to event.ics for empty/odd titles', () => {
    expect(buildExportFilename(ev({ title: null }))).toBe('event.ics');
    expect(buildExportFilename(ev({ title: '///' }))).toBe('event.ics');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/calendar-query.test.ts`
Expected: FAIL — cannot find module `./calendar-query.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/calendar-query.ts
import type { CalendarEvent } from '@nbtca/nbtcal';

export function weekRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const mondayOffset = (start.getDay() + 6) % 7; // days since Monday
  start.setDate(start.getDate() - mondayOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

export function monthRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

export function filterEvents(events: CalendarEvent[], query: string): CalendarEvent[] {
  const q = query.trim().toLowerCase();
  if (!q) return events;
  return events.filter(
    (e) =>
      (e.title ?? '').toLowerCase().includes(q) ||
      (e.location ?? '').toLowerCase().includes(q),
  );
}

export interface Countdown {
  past: boolean;
  days: number;
  hours: number;
  minutes: number;
}

export function countdownParts(target: Date, now: Date): Countdown {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return { past: true, days: 0, hours: 0, minutes: 0 };
  const totalMin = Math.floor(ms / 60000);
  return {
    past: false,
    days: Math.floor(totalMin / 1440),
    hours: Math.floor((totalMin % 1440) / 60),
    minutes: totalMin % 60,
  };
}

export function buildExportFilename(event: CalendarEvent): string {
  const cleaned = (event.title ?? '')
    .replace(/[^\p{L}\p{N}\-_ ]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return `${cleaned || 'event'}.ics`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/calendar-query.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/calendar-query.ts src/features/calendar-query.test.ts
git commit -m "feat(calendar): pure query helpers — ranges, filter, countdown, export filename"
```

---

### Task 2: Carry `recurring` + `uid` through the display model

**Files:**
- Modify: `src/features/calendar.ts` (the `Event`/`EventOutputItem` interfaces, `toDisplayEvent`, `serializeEvents`)
- Test: `src/features/calendar.test.ts` (append)

**Interfaces:**
- Produces: `Event` and `EventOutputItem` gain `recurring: boolean` and `uid: string`; `toDisplayEvent` populates them; `serializeEvents` emits them.

- [ ] **Step 1: Write the failing test**

Append to `src/features/calendar.test.ts`:

```ts
describe('toDisplayEvent recurring/uid', () => {
  it('carries recurring and uid from the source event', () => {
    const e = makeEvent({ recurring: true, uid: 'abc-123' });
    const result = toDisplayEvent(e);
    expect(result.recurring).toBe(true);
    expect(result.uid).toBe('abc-123');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/calendar.test.ts`
Expected: FAIL — `recurring`/`uid` are not on the display event.

- [ ] **Step 3: Extend the model**

In `src/features/calendar.ts`, add to the `Event` interface: `recurring: boolean;` and `uid: string;`. Add to `EventOutputItem`: `recurring: boolean;` and `uid: string;`. In `toDisplayEvent`, add to the returned object: `recurring: e.recurring,` and `uid: e.uid,`. In `serializeEvents`, add to each mapped object: `recurring: event.recurring,` and `uid: event.uid,`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/calendar.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/calendar.ts src/features/calendar.test.ts
git commit -m "feat(calendar): carry recurring and uid through the display model"
```

---

### Task 3: Recurring marker in the events table

**Files:**
- Modify: `src/features/calendar.ts` (`renderEventsTable`)
- Test: `src/features/calendar.test.ts` (append)

**Interfaces:**
- Produces: `renderEventsTable` prefixes recurring events' title with a `↻ ` marker (`pickIcon('↻','~')`).

- [ ] **Step 1: Write the failing test**

Append to `src/features/calendar.test.ts` (add imports at top if missing: `import { renderEventsTable } from './calendar.js';`, `import { stripAnsi } from '../core/text.js';`, `import { resetIconCache } from '../core/icons.js';`):

```ts
describe('renderEventsTable recurring marker', () => {
  it('prefixes recurring events with the ascii recurring marker', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache();
    const events = [toDisplayEvent(makeEvent({ title: 'Weekly Sync', recurring: true }))];
    const out = stripAnsi(renderEventsTable(events, { color: false }));
    process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache();
    expect(out).toContain('~ Weekly Sync');
  });
  it('does not mark non-recurring events', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache();
    const events = [toDisplayEvent(makeEvent({ title: 'One Off', recurring: false }))];
    const out = stripAnsi(renderEventsTable(events, { color: false }));
    process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache();
    expect(out).not.toContain('~ One Off');
    expect(out).toContain('One Off');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/calendar.test.ts`
Expected: FAIL — no recurring marker rendered.

- [ ] **Step 3: Add the marker**

In `renderEventsTable`, where the title column is built (currently `const titleCol = padEndV(applyBold(truncate(event.title, titleWidth)), titleWidth);`), prefix the recurring marker before truncation so alignment stays consistent:

```ts
    const marker = event.recurring ? `${pickIcon('↻', '~')} ` : '';
    const titleText = truncate(`${marker}${event.title}`, titleWidth);
    const titleCol = padEndV(applyBold(titleText), titleWidth);
```

(`pickIcon` is already imported in `calendar.ts`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/calendar.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/calendar.ts src/features/calendar.test.ts
git commit -m "feat(calendar): mark recurring events in the events table"
```

---

### Task 4: Countdown banner

**Files:**
- Modify: `src/features/calendar.ts` (add `renderCountdownBanner`)
- Modify: `src/i18n/index.ts`, `src/i18n/locales/en.json`, `src/i18n/locales/zh.json`
- Test: `src/features/calendar.test.ts` (append)

**Interfaces:**
- Consumes: `countdownParts` from `./calendar-query.js`; `Event`.
- Produces: `renderCountdownBanner(event: Event | undefined, now: Date): string` — e.g. `→ Next · Hack Night · in 3d 4h`; empty string when no event.

- [ ] **Step 1: Add i18n keys**

In `src/i18n/index.ts`, extend the `calendar` block of the `Translations` interface (after `viewPastDetail: string;`):

```ts
    next: string;
    startingNow: string;
    thisWeek: string;
    thisMonth: string;
    search: string;
    searchPrompt: string;
    searchPlaceholder: string;
    searchNoResults: string;
    exportIcs: string;
    exportSuccess: string;
    exportError: string;
    recurringLabel: string;
    inPrefix: string;
```

In `src/i18n/locales/en.json` `calendar` block, add:

```json
    "next": "Next",
    "inPrefix": "in",
    "startingNow": "starting now",
    "thisWeek": "This Week",
    "thisMonth": "This Month",
    "search": "Search",
    "searchPrompt": "Search events",
    "searchPlaceholder": "keyword…",
    "searchNoResults": "No matching events",
    "exportIcs": "Export .ics",
    "exportSuccess": "Saved",
    "exportError": "Could not write the .ics file",
    "recurringLabel": "recurring"
```

In `src/i18n/locales/zh.json` `calendar` block, add:

```json
    "next": "下一场",
    "inPrefix": "还有",
    "startingNow": "即将开始",
    "thisWeek": "本周",
    "thisMonth": "本月",
    "search": "搜索",
    "searchPrompt": "搜索活动",
    "searchPlaceholder": "关键词…",
    "searchNoResults": "没有匹配的活动",
    "exportIcs": "导出 .ics",
    "exportSuccess": "已保存",
    "exportError": "无法写入 .ics 文件",
    "recurringLabel": "循环"
```

- [ ] **Step 2: Write the failing test**

Append to `src/features/calendar.test.ts`:

```ts
describe('renderCountdownBanner', () => {
  it('shows the next event title and a d/h countdown', () => {
    process.env['NBTCA_ICON_MODE'] = 'ascii'; resetIconCache();
    const now = new Date('2026-03-25T12:00:00');
    const e = toDisplayEvent(makeEvent({ title: 'Hack Night', start: new Date('2026-03-28T16:00:00'), end: new Date('2026-03-28T18:00:00') }));
    const out = stripAnsi(renderCountdownBanner(e, now));
    process.env['NBTCA_ICON_MODE'] = 'unicode'; resetIconCache();
    expect(out).toContain('Next');
    expect(out).toContain('Hack Night');
    expect(out).toMatch(/3d/);
  });
  it('returns empty string when there is no event', () => {
    expect(renderCountdownBanner(undefined, new Date())).toBe('');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/features/calendar.test.ts`
Expected: FAIL — `renderCountdownBanner` not exported.

- [ ] **Step 4: Implement**

In `src/features/calendar.ts`, add the import `import { countdownParts } from './calendar-query.js';` and the `type`/`space`/`glyph` imports if not present (`import { c, type, space, glyph } from '../core/theme.js';` — extend the existing theme import). Then add:

```ts
export function renderCountdownBanner(event: Event | undefined, now: Date): string {
  if (!event) return '';
  const trans = t();
  const p = countdownParts(event.startDate, now);
  const inp = trans.calendar.inPrefix;
  const when = p.past
    ? trans.calendar.startingNow
    : p.days > 0
      ? `${inp} ${p.days}d ${p.hours}h`
      : p.hours > 0
        ? `${inp} ${p.hours}h ${p.minutes}m`
        : `${inp} ${p.minutes}m`;
  const dot = pickIcon('·', '-');
  return `${space.indent}${type.heading(glyph.cursor())} ${type.label(trans.calendar.next)}  ${dot}  ${type.body(event.title)}  ${dot}  ${type.hint(when)}`;
}
```

(`calendar.inPrefix` was added to the interface and both locale files in Step 1.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/features/calendar.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/calendar.ts src/i18n/index.ts src/i18n/locales/en.json src/i18n/locales/zh.json src/features/calendar.test.ts
git commit -m "feat(calendar): next-event countdown banner"
```

---

### Task 5: `.ics` export helper

**Files:**
- Modify: `src/features/calendar.ts` (add `exportEventIcs`)
- Test: `src/features/calendar-query.test.ts` is not enough (this writes a file) — add a focused test in `src/features/calendar.test.ts`

**Interfaces:**
- Consumes: `eventToICS` from `@nbtca/nbtcal`; `buildExportFilename` from `./calendar-query.js`; `CalendarEvent`.
- Produces: `exportEventIcs(event: CalendarEvent, dir?: string): { ok: boolean; path: string; error?: string }` — writes `<filename>.ics` into `dir` (default `process.cwd()`); never throws.

- [ ] **Step 1: Write the failing test**

Append to `src/features/calendar.test.ts` (add `import { exportEventIcs } from './calendar.js';`, `import { mkdtempSync, readFileSync, rmSync } from 'fs';`, `import { tmpdir } from 'os';`, `import { join } from 'path';`):

```ts
describe('exportEventIcs', () => {
  it('writes a valid .ics file and returns its path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ics-'));
    try {
      const event = { uid: 'u1', title: 'Hack Night', start: new Date('2026-03-25T12:00:00Z'), end: new Date('2026-03-25T14:00:00Z'), isAllDay: false, location: 'Lab', description: null, recurring: false };
      const res = exportEventIcs(event, dir);
      expect(res.ok).toBe(true);
      expect(res.path).toBe(join(dir, 'Hack-Night.ics'));
      const contents = readFileSync(res.path, 'utf-8');
      expect(contents).toContain('BEGIN:VCALENDAR');
      expect(contents).toContain('SUMMARY:Hack Night');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns ok:false on an unwritable directory instead of throwing', () => {
    const event = { uid: 'u1', title: 'X', start: new Date(), end: null, isAllDay: false, location: null, description: null, recurring: false };
    const res = exportEventIcs(event, '/nonexistent-dir-xyz-123');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/calendar.test.ts`
Expected: FAIL — `exportEventIcs` not exported.

- [ ] **Step 3: Implement**

In `src/features/calendar.ts`, add imports `import { eventToICS, type CalendarEvent } from '@nbtca/nbtcal';` (extend the existing nbtcal import — `CalendarEvent`/`Calendar` are already imported; add `eventToICS`), `import { buildExportFilename } from './calendar-query.js';`, `import { writeFileSync } from 'fs';`, `import { join } from 'path';`. Then:

```ts
export function exportEventIcs(event: CalendarEvent, dir: string = process.cwd()): { ok: boolean; path: string; error?: string } {
  const path = join(dir, buildExportFilename(event));
  try {
    writeFileSync(path, eventToICS(event), 'utf-8');
    return { ok: true, path };
  } catch (err) {
    return { ok: false, path, error: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/calendar.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/calendar.ts src/features/calendar.test.ts
git commit -m "feat(calendar): eventToICS export helper"
```

---

### Task 6: The interactive calendar hub

**Files:**
- Modify: `src/features/calendar.ts` (`showCalendar`, add view + detail helpers)

**Interfaces:**
- Consumes: `runMenu`, `menuFooter` from `../core/components/menu.js`; `enterScreen`, `breadcrumb` from `../core/transitions.js`; `weekRange`, `monthRange` from `./calendar-query.js`; `renderCountdownBanner`, `renderEventsTable`, `exportEventIcs`, `toDisplayEvent`; `success`/`error` from `../core/ui.js`; `runTextInput` (Task 7).

- [ ] **Step 1: Restructure `showCalendar` into a hub**

Replace the body of `showCalendar` in `src/features/calendar.ts`. The hub: enter the screen, load the calendar, show the countdown banner + heatmap, then loop a menu of views. Each view renders the table and lets the user pick an event → detail → optional export. Keep the raw `CalendarEvent[]` for export/detail.

```ts
export async function showCalendar(): Promise<void> {
  const trans = t();
  await enterScreen(breadcrumb(trans.menu.events));
  const spinner = createSpinner(trans.calendar.loading);
  let cal: Calendar;
  try {
    cal = await loadCalendarOrThrow();
    spinner.stop();
  } catch {
    spinner.error(trans.calendar.error);
    console.log(c.muted('  ' + trans.calendar.errorHint));
    console.log();
    return;
  }

  const now = new Date();
  const upcoming = cal.upcoming({ days: 30 });
  console.log();
  console.log(renderCountdownBanner(upcoming[0] ? toDisplayEvent(upcoming[0]) : undefined, now));
  console.log();
  console.log(renderHeatmap(cal.heatmap({ start: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000), end: now, bucket: 'day' }), now, { color: true }));
  console.log();

  while (true) {
    const action = await runMenu({
      title: trans.calendar.viewDetail,
      options: [
        { value: 'upcoming', label: trans.menu.events, hint: String(upcoming.length) },
        { value: 'week',     label: trans.calendar.thisWeek },
        { value: 'month',    label: trans.calendar.thisMonth },
        { value: 'search',   label: trans.calendar.search },
        { value: 'past',     label: trans.calendar.pastEvents },
      ],
      footer: menuFooter(),
    });
    if (action === null) return;
    if (action === 'upcoming') await showEventList(upcoming, trans.menu.events);
    else if (action === 'week')  { const r = weekRange(now);  await showEventList(cal.inRange(r.start, r.end), trans.calendar.thisWeek); }
    else if (action === 'month') { const r = monthRange(now); await showEventList(cal.inRange(r.start, r.end), trans.calendar.thisMonth); }
    else if (action === 'search') await showSearch(cal);
    else if (action === 'past')  await showEventList(cal.past({ days: 30 }).reverse(), trans.calendar.pastEvents);
  }
}
```

- [ ] **Step 2: Add `showEventList` and `showEventDetail` (raw-event aware)**

Add helper functions in `src/features/calendar.ts`:

```ts
async function showEventList(events: CalendarEvent[], title: string): Promise<void> {
  const trans = t();
  if (events.length === 0) {
    console.log(`${space.indent}${type.hint(trans.calendar.noEvents)}`);
    console.log();
    return;
  }
  const display = events.map(toDisplayEvent);
  console.log();
  console.log(renderEventsTable(display, { color: true }));
  console.log();
  const selected = await runMenu({
    title,
    options: events.map((e, i) => ({
      value: String(i),
      label: `${display[i]!.date}${display[i]!.time ? ' ' + display[i]!.time : ''}  ${display[i]!.title}`,
      hint: display[i]!.location,
    })),
    footer: menuFooter(),
  });
  if (selected === null) return;
  const raw = events[Number.parseInt(selected, 10)];
  if (raw) await showEventDetailRaw(raw);
}

async function showEventDetailRaw(raw: CalendarEvent): Promise<void> {
  const trans = t();
  const e = toDisplayEvent(raw);
  console.log();
  console.log(chalk.bold.cyan(`  ${e.title}`));
  console.log(c.muted(`  ${e.date}${e.time ? ' ' + e.time : ''}  ${pickIcon('·', '|')}  ${e.location}`));
  if (raw.recurring) console.log(c.muted(`  ${pickIcon('↻', '~')} ${trans.calendar.recurringLabel}`));
  if (e.description) { console.log(); for (const line of e.description.trim().split('\n')) console.log(`  ${line}`); }
  else console.log(c.muted(`  ${trans.calendar.noDescription}`));
  console.log();

  const action = await runMenu({
    title: e.title,
    options: [{ value: 'export', label: trans.calendar.exportIcs }],
    footer: menuFooter(),
  });
  if (action === 'export') {
    const res = exportEventIcs(raw);
    if (res.ok) success(`${trans.calendar.exportSuccess}: ${res.path}`);
    else error(`${trans.calendar.exportError}: ${res.error ?? ''}`);
  }
}
```

Add any missing imports at the top: `runMenu`/`menuFooter` from `../core/components/menu.js`; `enterScreen`/`breadcrumb` from `../core/transitions.js`; `success`/`error` from `../core/ui.js`; `weekRange`/`monthRange` from `./calendar-query.js`. Remove the now-unused old `showCalendar`/`showPastEvents`/`showEventDetail` bodies they replace (keep `showEventsPreview` and the pure render/data exports). Confirm the old `@clack`-free code compiles.

- [ ] **Step 3: Build + full suite**

Run: `npm run build && npx vitest run`
Expected: build clean; all tests pass (the pure-function tests are unaffected; the interactive hub has no unit test — it's verified live).

- [ ] **Step 4: Commit**

```bash
git add src/features/calendar.ts
git commit -m "feat(calendar): interactive hub with range views, countdown, and export"
```

---

### Task 7: Search view

**Files:**
- Modify: `src/features/calendar.ts` (add `showSearch`)

**Interfaces:**
- Consumes: `runTextInput` from `../core/components/text-input.js`; `filterEvents` from `./calendar-query.js`; `Calendar` (nbtcal).

- [ ] **Step 1: Implement `showSearch`**

Add to `src/features/calendar.ts` (import `runTextInput` from `../core/components/text-input.js` and `filterEvents` from `./calendar-query.js`):

```ts
async function showSearch(cal: Calendar): Promise<void> {
  const trans = t();
  const query = await runTextInput({ message: trans.calendar.searchPrompt, placeholder: trans.calendar.searchPlaceholder });
  if (query === null || !query.trim()) return;
  const now = new Date();
  const pool = cal.inRange(now, new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000));
  const results = filterEvents(pool, query);
  if (results.length === 0) {
    console.log(`${space.indent}${type.hint(trans.calendar.searchNoResults)}`);
    console.log();
    return;
  }
  await showEventList(results, `${trans.calendar.search}: ${query.trim()}`);
}
```

- [ ] **Step 2: Build + full suite**

Run: `npm run build && npx vitest run`
Expected: build clean; all tests green.

- [ ] **Step 3: Commit**

```bash
git add src/features/calendar.ts
git commit -m "feat(calendar): keyword search view"
```

---

### Task 8: CLI flags `--week` / `--month` / `--search`

**Files:**
- Modify: `src/index.ts` (`runEventsCommand`, `getAllowedFlagsFor`, `getAllowedFlagPrefixesFor`, `KNOWN_FLAGS`, `KNOWN_FLAG_PREFIXES`, help text)

**Interfaces:**
- Consumes: `weekRange`/`monthRange`/`filterEvents` from `./features/calendar-query.js`; `loadCalendar` (via a new `fetchInRange` helper) — reuse the existing `fetchEvents` pattern.

- [ ] **Step 1: Add a range/search fetch path**

In `src/features/calendar.ts`, add and export two thin data helpers next to `fetchEvents`:

```ts
export async function fetchInRange(start: Date, end: Date): Promise<Event[]> {
  return (await loadCalendarOrThrow()).inRange(start, end).map(toDisplayEvent);
}
```

- [ ] **Step 2: Wire the flags in `runEventsCommand`**

In `src/index.ts`, register the flags: add `'--week'`, `'--month'` to `KNOWN_FLAGS`; add `'--search='` to `KNOWN_FLAG_PREFIXES`. In `getAllowedFlagsFor` under `case 'events'`, add `allowed.add('--week'); allowed.add('--month');`. In `getAllowedFlagPrefixesFor`, for `events` return `['--next=', '--search=']`. Then in `runEventsCommand`, before the existing `fetchEvents()` call, branch:

```ts
  const { weekRange, monthRange, filterEvents } = await import('./features/calendar-query.js');
  const { fetchInRange } = await import('./features/calendar.js');
  const now = new Date();
  let events: Event[];
  if (flags.has('--week'))  { const r = weekRange(now);  events = await fetchInRange(r.start, r.end); }
  else if (flags.has('--month')) { const r = monthRange(now); events = await fetchInRange(r.start, r.end); }
  else { events = await fetchEvents(); }

  const searchFlag = Array.from(flags).find(f => f.startsWith('--search='));
  if (searchFlag) {
    const q = searchFlag.slice('--search='.length);
    // filterEvents works on display events by title/location; reuse a display-level filter
    events = events.filter(e => `${e.title} ${e.location}`.toLowerCase().includes(q.toLowerCase()));
  }
```

(Keep the existing `--today`/`--next=`/`--heatmap`/`--json` handling after this block, operating on `events`.)

- [ ] **Step 3: Update help text**

In `printHelp`, add three lines under the flags list:

```ts
  console.log(`  --week             ${c.flagWeek}`);
  console.log(`  --month            ${c.flagMonth}`);
  console.log(`  --search=<q>       ${c.flagSearch}`);
```

Add `flagWeek`/`flagMonth`/`flagSearch` to the `cli` block of the `Translations` interface and both locale files: en `"Events this week"`, `"Events this month"`, `"Filter events by keyword"`; zh `"本周活动"`, `"本月活动"`, `"按关键词过滤活动"`.

- [ ] **Step 4: Build + verify**

Run:
```bash
npm run build
node dist/index.js events --week --plain | head -5
node dist/index.js events --month --json | head -3
node dist/index.js events --search=hack --plain | head -5
npx vitest run
bash scripts/test-cli.sh
```
Expected: build clean; the flag commands produce filtered output; tests + CLI contract pass.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/features/calendar.ts src/i18n/index.ts src/i18n/locales/en.json src/i18n/locales/zh.json
git commit -m "feat(events): --week, --month, --search CLI flags"
```

---

## Self-Review

**Spec coverage (Sub-project 2):**
- Next-event countdown → Task 4 (+ Task 1 `countdownParts`). ✅
- Week/month/range views via `inRange` → Tasks 1, 6, 8. ✅
- Recurring markers → Tasks 2 (model), 3 (table), 6 (detail line). ✅
- Search → Tasks 1 (`filterEvents`), 7 (view), 8 (`--search`). ✅
- `.ics` export via nbtcal `eventToICS` → Tasks 1 (`buildExportFilename`), 5 (`exportEventIcs`), 6 (detail action). ✅
- Additive JSON `recurring`/`uid` → Task 2. ✅
- Quiet-Precision widgets + breadcrumb + degradation → Tasks 6–7. ✅

**Placeholder scan:** No TBD/TODO; each step has complete code or exact commands. The one conditional note (Task 4 `trans.common.in`) is resolved inline by adding a `calendar.inPrefix` key.

**Type consistency:** `Event` gains `recurring`/`uid` (Task 2) used by `renderCountdownBanner`/`showEventList`; `exportEventIcs(event: CalendarEvent, dir?)` and `buildExportFilename(event)` operate on the raw `CalendarEvent` (so export keeps real title/uid, not display fallbacks); `weekRange`/`monthRange` return `{start,end}` consumed by `inRange`; `filterEvents(CalendarEvent[], string)` used interactively (Task 7) while the CLI (Task 8) filters display events inline. Consistent across tasks.

**File-org note:** the spec's optional 3-file split (query/render/hub) is realized as `calendar-query.ts` (new, pure) + `calendar.ts` (extended in place). Moving `renderEventsTable` out was avoided to keep `index.ts`/`menu.ts`/`calendar.test.ts` imports stable and reduce churn; `calendar.ts` remains the single interactive+render surface.

**Interactive coverage:** the hub/search/detail loops are verified live (countdown → each view → detail → export writes a valid `.ics`), not unit-tested; all their logic is factored into the pure, tested helpers (`countdownParts`/ranges/`filterEvents`/`buildExportFilename`/`exportEventIcs`).
