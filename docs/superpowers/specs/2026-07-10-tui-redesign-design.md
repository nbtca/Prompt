# TUI Redesign — "Quiet Precision" (方向 A)

**Status:** Approved design, ready for implementation planning
**Date:** 2026-07-10
**Scope:** A full redesign of the interactive TUI for `@nbtca/prompt`. Non-interactive
CLI command mode (`nbtca status --json`, `nbtca events --heatmap`, etc.) is out of scope
and must keep behaving exactly as today.

## Motivation

The last two commits (`9c3d0f3`, `08e5d05`) pulled the TUI toward restraint by removing
noise. That left four gaps the maintainer wants closed at once:

1. **太平了，没记忆点** — restrained to the point of blandness; no craft, no memorability.
2. **缺少动态/生命力** — everything is static; no reveal, transition, or loading rhythm.
3. **结构/交互不顺** — navigation, enter/exit, and key handling feel unpolished.
4. **不一致/拼凑感** — each surface (menu / status / calendar / docs) speaks its own
   visual language.

The goal is **restraint *with* craft** — Linear/Vercel-style quiet precision, not
decoration — backed by a single unified design system and tasteful, always-optional motion.

## Design Decisions (locked)

- **Aesthetic:** Direction A — *Quiet Precision*. Generous whitespace, a single hairline
  rule, one cursor glyph, one accent, disciplined neutrals. Whitespace and typography do
  the work; no boxes/chrome as the primary language.
- **Rendering:** Self-render the core interactive surfaces with a lightweight ANSI
  renderer + keypress loop. This is required to hit Direction A — `@clack`'s `│` gutter,
  `◇/◆` glyphs, and green highlight cannot produce this look.
- **Framework:** No Ink / React. A small internal layer, not a new dependency.
- **`@clack/prompts`:** Removed entirely. We reimplement the small widget set we actually
  use (`select`→`Menu`, `spinner`→`Spinner`, `note`→`Note`, `text`→`TextInput`,
  `confirm`→`Confirm`). One fewer dependency; full control of the visual language.
- **Palette:** A single refined palette (brand gradient + neutral ramp + semantics).
  **No multi-theme system** — consistency is the goal, not customization (YAGNI). The
  existing icon-mode / color-mode preferences stay.
- **Motion:** Present across startup, menu, screen transitions, and loading — but tasteful
  and **always optional**. Hard-degrades to a static final frame under
  non-TTY / CI / `NO_COLOR` / ascii mode / `NBTCA_NO_MOTION`.

## Architecture

Separate a thin presentation layer from feature logic. Features stay pure and testable;
all craft lives in one place.

```
capabilities  ──┐   (isTTY, colorDepth, unicode, reducedMotion)
tokens        ──┼──►  canvas ──►  components ──►  features
motion        ──┘     (ANSI/frame)  (Menu/Screen/  (events/status/
                                     Spinner/…)      docs/links/settings)
```

### `core/capabilities.ts`
The single authority for environment detection, absorbing today's `icons.ts` logic:

- `isTTY` — `process.stdout.isTTY && process.stdin.isTTY`
- `unicode` — from icon-mode preference + locale (existing logic)
- `color` — from color-mode preference + `NO_COLOR`
- `reducedMotion` — true when `!isTTY` OR `NO_COLOR` OR `CI` OR `TERM=dumb` OR
  `NBTCA_NO_MOTION` OR icon mode is ascii

Every visual decision reads from here. Cached, with a reset hook (like `resetIconCache`).

### `core/canvas.ts`
Low-level ANSI primitives with terminal safety:

- hide/show cursor, move cursor, clear line/region, enter/leave a render frame
- responsive width via existing `visualWidth` (`core/text.ts`)
- registers `exit` + `SIGINT` cleanup so the cursor is **always** restored and the frame
  left, even on crash. `handleGracefulExit` remains the final net.

### `core/motion.ts`
A tiny frame ticker with easing. Contract: **when `reducedMotion` is true (or not a TTY),
every animation helper returns/prints the final frame immediately** — motion is sugar,
never required for correctness.

### `core/theme.ts` (grown into tokens)
From a color bag into a token set — this is what kills the 拼凑感:

- **Palette:** brand `#124689 → #0ea5e9 → #06b6d4` gradient (reserved for logo/accents
  only) + neutral ramp (`fg / muted / subtle / faint`) + semantics (`success / warn /
  error`).
- **Rhythm tokens:** indent (3 spaces), rule char `─`, cursor `→`, bullet `·`, status dot
  `●` — all with centralized ascii fallbacks (`+ - o ! ✕` family, via capabilities).
- **Type roles:** `heading / label / body / hint` as functions, replacing ad-hoc
  `chalk.dim` scattered across features.

## Components

Self-rendered, all reading from `capabilities` + `tokens`:

- **`Startup`** — logo reveal (line-by-line) + tagline fade-in + version + rule. Replaces
  `printLogo` and the loose `console.log`s in `main.ts`. Runs once, ~250ms.
- **`Menu`** — interactive list: `→` cursor, aligned `label · hint` columns, keys
  `↑↓ / j k · ⏎ · q / esc` (building on `core/vim-keys.ts`), footer keyhint bar.
  Micro-motion on selection (highlight fade, hint fade). Replaces every `@clack select`.
- **`Screen`** — the shared frame every sub-surface renders into: thin breadcrumb header +
  body + footer keyhints. This is the primary consistency mechanism.
- **`Spinner` / `Skeleton`** — shared loading rhythm with a brand pulse; supports
  per-item resolution (rows lighting up as async work completes).
- **`TextInput`** — single-line input (docs search). Replaces clack `text`.
- **`Confirm`** — yes/no prompt. Replaces clack `confirm`.
- **`Note`** — framed info block (about screen). Replaces clack `note`.

## Motion Budget

Each maps to an approved motion category; all gated by `capabilities.reducedMotion`:

| Category   | Behavior | Budget |
|------------|----------|--------|
| 启动入场   | logo reveals line-by-line, tagline fades in | ~250ms, once |
| 菜单微动   | cursor highlight fade + hint fade on move | <100ms, never blocks input |
| 界面过渡   | enter/leave sub-screen = short clear-fade, not a hard cut | brief |
| 加载节奏   | spinner pulse + status rows light up per-item as checks resolve | during fetch |

## Per-Surface Changes

Every surface renders into `Screen` for one consistent language:

- **Startup + Main menu** (`main.ts`, `core/menu.ts`) — new `Startup` + `Menu`; entry
  point becomes a clean sequence.
- **Status** (`features/status.ts`) — keep pure `renderServiceStatusTable`; wrap so rows
  light up per-item as checks resolve; frame it.
- **Events / Calendar** (`features/calendar.ts`, `calendar-heatmap.ts`) — keep pure
  renderers; adopt frame + cursor language; polish empty states.
- **Docs** (`features/docs.ts`) — `Menu` for tree nav, `TextInput` for search, `Confirm`
  for prompts; markdown reading view keeps `marked-terminal` inside the frame.
- **Links / Settings** (`features/links.ts`, `features/settings.ts`) — `Menu` +
  consistent "current value" hints; `Note` for about.

## Data Flow

Unchanged. Features still fetch events/status/docs and return **pure strings** (the
existing `renderEventsTable` / `renderServiceStatusTable` / `renderHeatmap` pattern is
kept). Interactive components wrap those pure renderers with capability context. The
non-interactive CLI paths in `index.ts` are untouched.

## Error Handling

- `canvas` cleanup on `exit` / `SIGINT` always restores cursor and leaves the frame.
- Motion helpers never throw on resize or non-TTY; they no-op to the final frame.
- `handleGracefulExit` stays the final net for uncaught errors.

## Testing

- Pure renderers keep their existing unit tests (`*.test.ts`).
- **Add:** capability-detection tests; motion "reduced → final frame immediately" tests;
  **snapshot tests of `Menu` / `Screen` frames** at fixed widths across
  unicode/ascii × color/no-color variants.
- `scripts/test-cli.sh` non-interactive smoke tests keep passing untouched.

## Phasing

- **Phase 1 — Foundation:** `capabilities`, `tokens`, `canvas`, `motion`, `Screen`,
  `Menu` → wire `Startup` + Main menu.
- **Phase 2 — Widgets + surfaces:** `Spinner`/`Skeleton`, `TextInput`, `Confirm`, `Note`;
  migrate status / events / links / settings / docs; **remove `@clack/prompts`**.
- **Phase 3 — Polish:** transitions, per-item loading, micro-motion, empty states,
  snapshot tests.

## Out of Scope / Non-Goals

- Non-interactive CLI command mode behavior and flags.
- Multi-theme / user-customizable palettes.
- i18n changes (zh/en stays; new UI strings get both locales).
- New features/data sources — this is a presentation redesign only.

## Compatibility Guarantees

Everything degrades predictably: non-TTY → plain final output, no cursor control, no
motion; `NO_COLOR` → no color; ascii mode → ascii glyphs; small terminals → responsive
layout; `CI` / `NBTCA_NO_MOTION` → instant static frames.
