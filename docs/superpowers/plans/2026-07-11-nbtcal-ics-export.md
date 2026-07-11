# nbtcal `.ics` Export (`eventToICS`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add RFC 5545-compliant single-event iCalendar serialization (`eventToICS`) to the `@nbtca/nbtcal` library so consumers (the Prompt CLI) can export events as `.ics`.

**Architecture:** A new pure module `src/serialize.ts` that turns one `CalendarEvent` into a complete `VCALENDAR`/`VEVENT` string. UTC datetimes for timed events, `VALUE=DATE` for all-day, RFC text escaping, and 75-octet line folding. Exported from `src/index.ts`. Additive, non-breaking → version `0.4.0`.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Node, `vitest`, `ical.js` (already a dependency, used only in the round-trip test via the existing `parseCalendar`).

## Global Constraints

- **Work in the sibling repo:** all paths are under `/Users/m1ng/code/github/nbtca/nbtcal` (NOT the Prompt repo). Run all `git`/`npm`/`vitest` commands from that directory.
- The repo is on `main`; **create and work on a branch `feat/ics-export`** (Task 1 Step 0). Do not commit to `main`.
- ESM only; relative imports use `.js` specifiers; `strict` TypeScript.
- No new npm dependencies (`ical.js` already present).
- `CalendarEvent` shape (from `src/types.ts`): `{ uid: string; title: string | null; start: Date; end: Date | null; isAllDay: boolean; location: string | null; description: string | null; recurring: boolean }`.
- Output uses CRLF (`\r\n`) line endings and ends with a trailing CRLF.
- Datetime formatting is UTC-based and deterministic (no machine-timezone dependence): timed → `YYYYMMDDTHHMMSSZ`; all-day `VALUE=DATE` → `YYYYMMDD` from UTC components.
- Follow existing test conventions (co-located `src/*.test.ts`, `vitest`, `describe/it/expect`).

---

### Task 1: `eventToICS` — envelope, timed/all-day, escaping, null-omission

**Files:**
- Create: `/Users/m1ng/code/github/nbtca/nbtcal/src/serialize.ts`
- Test: `/Users/m1ng/code/github/nbtca/nbtcal/src/serialize.test.ts`

**Interfaces:**
- Consumes: `CalendarEvent` from `./types.js`.
- Produces:
  - `interface EventToICSOptions { prodId?: string; now?: Date }`
  - `eventToICS(event: CalendarEvent, options?: EventToICSOptions): string` (unfolded logical lines in this task; folding added in Task 2)

- [ ] **Step 0: Branch**

Run (from `/Users/m1ng/code/github/nbtca/nbtcal`): `git checkout -b feat/ics-export`
Expected: switched to a new branch.

- [ ] **Step 1: Write the failing test**

```ts
// src/serialize.test.ts
import { describe, it, expect } from 'vitest';
import { eventToICS } from './serialize.js';
import type { CalendarEvent } from './types.js';

const base: CalendarEvent = {
  uid: 'evt-1',
  title: 'Hack Night',
  start: new Date('2026-03-25T12:30:00Z'),
  end: new Date('2026-03-25T14:00:00Z'),
  isAllDay: false,
  location: 'Lab 101',
  description: 'Bring laptops',
  recurring: false,
};
const now = new Date('2026-03-01T00:00:00Z');

describe('eventToICS', () => {
  it('wraps a valid VCALENDAR/VEVENT envelope ending in CRLF', () => {
    const ics = eventToICS(base, { now });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//nbtca//nbtcal//EN');
    expect(ics).toContain('CALSCALE:GREGORIAN');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:evt-1');
    expect(ics).toContain('DTSTAMP:20260301T000000Z');
    expect(ics).toContain('END:VEVENT');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.endsWith('\r\n')).toBe(true);
  });

  it('formats a timed event start/end in UTC and includes text props', () => {
    const ics = eventToICS(base, { now });
    expect(ics).toContain('DTSTART:20260325T123000Z');
    expect(ics).toContain('DTEND:20260325T140000Z');
    expect(ics).toContain('SUMMARY:Hack Night');
    expect(ics).toContain('LOCATION:Lab 101');
    expect(ics).toContain('DESCRIPTION:Bring laptops');
  });

  it('omits DTEND when end is null', () => {
    const ics = eventToICS({ ...base, end: null }, { now });
    expect(ics).not.toContain('DTEND');
  });

  it('formats an all-day event with VALUE=DATE and an exclusive next-day end', () => {
    const allDay: CalendarEvent = { ...base, isAllDay: true, start: new Date('2026-03-25T00:00:00Z'), end: null };
    const ics = eventToICS(allDay, { now });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260325');
    expect(ics).toContain('DTEND;VALUE=DATE:20260326');
  });

  it('escapes commas, semicolons, backslashes, and newlines in text', () => {
    const ics = eventToICS({ ...base, title: 'A, B; C\\D', description: 'line1\nline2' }, { now });
    expect(ics).toContain('SUMMARY:A\\, B\\; C\\\\D');
    expect(ics).toContain('DESCRIPTION:line1\\nline2');
  });

  it('omits null title/location/description', () => {
    const ics = eventToICS({ ...base, title: null, location: null, description: null }, { now });
    expect(ics).not.toContain('SUMMARY');
    expect(ics).not.toContain('LOCATION');
    expect(ics).not.toContain('DESCRIPTION');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from the nbtcal repo): `npx vitest run src/serialize.test.ts`
Expected: FAIL — cannot find module `./serialize.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/serialize.ts
import type { CalendarEvent } from './types.js';

const DEFAULT_PRODID = '-//nbtca//nbtcal//EN';
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Timed datetime in UTC: YYYYMMDDTHHMMSSZ */
function formatUTC(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** All-day date in UTC components: YYYYMMDD */
function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

/** RFC 5545 §3.3.11 text escaping. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

export interface EventToICSOptions {
  prodId?: string;
  now?: Date;
}

export function eventToICS(event: CalendarEvent, options: EventToICSOptions = {}): string {
  const prodId = options.prodId ?? DEFAULT_PRODID;
  const now = options.now ?? new Date();

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${formatUTC(now)}`,
  ];

  if (event.isAllDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatDate(event.start)}`);
    const end = event.end ?? new Date(event.start.getTime() + DAY_MS);
    lines.push(`DTEND;VALUE=DATE:${formatDate(end)}`);
  } else {
    lines.push(`DTSTART:${formatUTC(event.start)}`);
    if (event.end) lines.push(`DTEND:${formatUTC(event.end)}`);
  }

  if (event.title != null) lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.location != null) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.description != null) lines.push(`DESCRIPTION:${escapeText(event.description)}`);

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/serialize.test.ts`
Expected: PASS (6 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/serialize.ts src/serialize.test.ts
git commit -m "feat: add eventToICS single-event iCalendar serializer"
```

---

### Task 2: RFC 5545 line folding (75 octets)

**Files:**
- Modify: `/Users/m1ng/code/github/nbtca/nbtcal/src/serialize.ts`
- Test: `/Users/m1ng/code/github/nbtca/nbtcal/src/serialize.test.ts` (append)

**Interfaces:**
- Produces: `foldLine(line: string): string` (internal); `eventToICS` output now folds physical lines > 75 octets with `\r\n ` continuations.

- [ ] **Step 1: Write the failing test**

Append to `src/serialize.test.ts`:

```ts
describe('eventToICS line folding', () => {
  it('folds content lines longer than 75 octets; short lines are unchanged', () => {
    const long = 'x'.repeat(200);
    const ics = eventToICS({ ...base, description: long }, { now });
    const physical = ics.split('\r\n');
    // every physical line is at most 75 octets
    for (const line of physical) {
      expect(Buffer.byteLength(line, 'utf-8')).toBeLessThanOrEqual(75);
    }
    // the DESCRIPTION value was folded onto at least one continuation line (leading space)
    expect(physical.some((l) => l.startsWith(' '))).toBe(true);
    // a short line like UID is not folded
    expect(physical).toContain('UID:evt-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/serialize.test.ts`
Expected: FAIL — a 200-char DESCRIPTION line exceeds 75 octets (no folding yet).

- [ ] **Step 3: Write minimal implementation**

Add `foldLine` to `src/serialize.ts` and apply it in the return. Insert the function above `eventToICS`:

```ts
/** RFC 5545 §3.1 content-line folding: split at 75 octets, continuations begin with a space. */
function foldLine(line: string): string {
  if (Buffer.byteLength(line, 'utf-8') <= 75) return line;
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const ch of line) {
    const chBytes = Buffer.byteLength(ch, 'utf-8');
    // first physical line has 75 octets of budget; continuations reserve 1 for the leading space
    const budget = chunks.length === 0 ? 75 : 74;
    if (currentBytes + chBytes > budget) {
      chunks.push(current);
      current = ch;
      currentBytes = chBytes;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current) chunks.push(current);
  return chunks.join('\r\n ');
}
```

Change the final return of `eventToICS` from:

```ts
  return lines.join('\r\n') + '\r\n';
```
to:
```ts
  return lines.map(foldLine).join('\r\n') + '\r\n';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/serialize.test.ts`
Expected: PASS (all Task 1 + folding tests).

- [ ] **Step 5: Commit**

```bash
git add src/serialize.ts src/serialize.test.ts
git commit -m "feat: fold iCalendar content lines at 75 octets"
```

---

### Task 3: Export, round-trip test, version bump

**Files:**
- Modify: `/Users/m1ng/code/github/nbtca/nbtcal/src/index.ts`
- Modify: `/Users/m1ng/code/github/nbtca/nbtcal/package.json` (version)
- Test: `/Users/m1ng/code/github/nbtca/nbtcal/src/serialize.test.ts` (append)

**Interfaces:**
- Consumes: `parseCalendar` from `./parse.js`.
- Produces: `eventToICS` and `EventToICSOptions` exported from the package root (`@nbtca/nbtcal`).

- [ ] **Step 1: Write the failing round-trip test**

Append to `src/serialize.test.ts` (add `import { parseCalendar } from './parse.js';` at the top):

```ts
describe('eventToICS round-trip', () => {
  it('produces output that parseCalendar accepts as one event', () => {
    const ics = eventToICS(base, { now });
    const parsed = parseCalendar(ics);
    expect(parsed.vevents).toHaveLength(1);
    expect(parsed.vevents[0]!.summary).toBe('Hack Night');
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npx vitest run src/serialize.test.ts`
Expected: PASS if `parseCalendar` handles the output (it should — this is the correctness gate). If it FAILS, the serializer output is not valid enough for the library's own parser; fix the serializer before proceeding. (`parseCalendar` is already imported from `./parse.js`; `ICalEvent.summary` is the ical.js accessor.)

- [ ] **Step 3: Export from index.ts**

In `src/index.ts`, add after the existing `parse` export line:

```ts
export { eventToICS } from './serialize.js';
export type { EventToICSOptions } from './serialize.js';
```

- [ ] **Step 4: Bump the version**

In `package.json`, change `"version": "0.3.0"` to `"version": "0.4.0"`.

- [ ] **Step 5: Full verify**

Run (from the nbtcal repo):
```bash
npx vitest run        # all tests green
npm run build         # tsc clean; dist/serialize.js + dist/index.js emitted with eventToICS
node -e "import('./dist/index.js').then(m => console.log(typeof m.eventToICS))"   # prints "function"
```
Expected: tests pass; build clean; the last command prints `function`.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts src/serialize.test.ts package.json
git commit -m "feat: export eventToICS; release 0.4.0"
```

---

## Self-Review

**Spec coverage (Sub-project 1):**
- `eventToICS(event, options?)` full VCALENDAR/VEVENT → Tasks 1–3. ✅
- Timed UTC / all-day VALUE=DATE / null omission → Task 1. ✅
- RFC text escaping → Task 1; 75-octet folding + CRLF → Tasks 1–2. ✅
- Exported from index; round-trip via `parseCalendar`; `0.4.0` bump → Task 3. ✅

**Placeholder scan:** No TBD/TODO; every step has complete code or an exact command with expected output.

**Type consistency:** `eventToICS(event: CalendarEvent, options?: EventToICSOptions): string` and `EventToICSOptions { prodId?, now? }` are consistent across tasks; `CalendarEvent` matches `src/types.ts`; `parseCalendar(ics).vevents` matches `src/parse.ts` (`ParsedCalendar { vevents: ICalEvent[] }`).

**Note:** All-day date components use UTC (`getUTC*`) for test determinism across machine timezones; the round-trip test (Task 3) is the correctness gate that the emitted `.ics` is parseable by the library itself.
