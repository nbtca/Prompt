import { type, space, glyph, brandMark } from '../core/theme.js';
import { pickIcon } from '../core/icons.js';
import { t } from '../i18n/index.js';
import type { ViewId } from './keys.js';
import { visualWidth } from '../core/text.js';

/** `renderHeader` always returns exactly this many lines (brand, tabs, rule). */
export const HEADER_LINES = 3;
/** `renderFooter` always returns exactly this many lines (rule, keyhints). */
export const FOOTER_LINES = 2;

function renderTabs(views: { id: ViewId; title: string }[], active: ViewId, cols: number): string {
  const dot = pickIcon('·', '-');
  const full = space.indent + views
    .map((view) => view.id === active ? type.active(`[${view.title}]`) : type.hint(view.title))
    .join(`  ${dot}  `);
  if (visualWidth(full) <= cols) return full;

  const compact = space.indent + views
    .map((view, index) => view.id === active
      ? type.active(`[${index + 1} ${view.title}]`)
      : type.hint(String(index + 1)))
    .join(` ${dot} `);
  if (visualWidth(compact) <= cols) return compact;

  return space.indent + views
    .map((view, index) => view.id === active
      ? type.active(`[${index + 1}]`)
      : type.hint(String(index + 1)))
    .join(' ');
}

// The header's persistent brand mark. A literal shrunk-down copy of the
// emblem doesn't survive down to header height (verified: even the boldest
// inner icon alone dissolves into noise below ~12 character-rows), so this
// is a wordmark painted in the same gradient as the startup logo instead --
// ties the two together by color, the one dimension that still reads at
// one line tall, rather than attempting a shape reproduction this small
// can't carry.
export function renderHeader(views: { id: ViewId; title: string }[], active: ViewId, cols: number): string[] {
  const brand = `${space.indent}${brandMark('nbtca')}`;
  const tabs = renderTabs(views, active, cols);
  const rule = space.indent + type.hint(glyph.rule().repeat(Math.max(1, cols - 6)));
  return [brand, tabs, rule];
}

/** Shared footer hint for any view mode that captures all input (a focused
 * text field or a modal-like list) — the only keys that still do something
 * are Ctrl-C/Esc/Enter, so this is what every such view's `footerHint()`
 * should return instead of each re-declaring an identical string. Digits/Tab
 * are deliberately absent: while input is captured they're typed into the
 * field, not routed to global tab-switching, so promising them would itself
 * be the false-promise this hint exists to avoid. */
export function fitFooterHint(cols: number, ...candidates: string[]): string {
  return candidates.find((candidate) => visualWidth(space.indent + candidate) <= cols)
    ?? candidates[candidates.length - 1]
    ?? '';
}

export function captureFooterHint(cols = Number.POSITIVE_INFINITY): string {
  const trans = t();
  const dot = pickIcon('·', '-');
  return fitFooterHint(
    cols,
    `Ctrl+C ${trans.common.exit}  ${dot}  Esc ${trans.common.back}  ${dot}  Enter ${trans.common.confirm}`,
    'Ctrl+C Esc Enter',
    'Ctrl+C Esc',
    'Ctrl+C',
  );
}

/** The "1-N / Tab" tab-switch prefix, factored out so a view's own
 * `footerHint()` override can still include it accurately (tab count isn't
 * knowable inside a view module otherwise) instead of either hardcoding a
 * digit range that goes stale, or dropping a still-true promise entirely. */
export function digitTabHint(tabCount: number): string {
  const dot = pickIcon('·', '-');
  return tabCount > 1 ? `1-${tabCount} / Tab ${dot} ` : '';
}

/** Shared hint for a non-interactive state: digits/Tab still switch tabs,
 * while move/open do nothing and must not be advertised. */
export function passiveFooterHint(tabCount: number, cols = Number.POSITIVE_INFINITY): string {
  const trans = t();
  const dot = pickIcon('·', '-');
  const compactTabs = tabCount > 1 ? `1-${tabCount}/Tab ${dot} ` : '';
  return fitFooterHint(
    cols,
    `${digitTabHint(tabCount)}Esc ${dot} q ${trans.menu.hintQuit}`,
    `${compactTabs}Esc ${dot} q`,
    `Esc ${dot} q`,
    'q',
  );
}

function interactiveFooterHint(tabCount: number, cols: number): string {
  const trans = t();
  const dot = pickIcon('·', '-');
  const fullTabs = digitTabHint(tabCount);
  const compactTabs = tabCount > 1 ? `1-${tabCount}/Tab ${dot} ` : '';
  const localFull = `${trans.menu.hintMove} ${dot} ${trans.menu.hintOpen} ${dot} Esc ${dot} q ${trans.menu.hintQuit}`;
  const localCompact = `${trans.menu.hintMove} ${trans.menu.hintOpen} Esc q`;
  const candidates = [
    `${fullTabs}${localFull}`,
    `${compactTabs}${localFull}`,
    localFull,
    `${compactTabs}${localCompact}`,
    localCompact,
    `${trans.menu.hintOpen} Esc q`,
    `Esc ${dot} q`,
    'q',
  ];
  return fitFooterHint(cols, ...candidates);
}

/** `overrideHint`: a view supplies this (via `View.footerHint()`) when the
 * generic tab-switching hint would be false — e.g. while a text field has
 * focus, digits/Tab/q are typed characters, not shortcuts, and only Ctrl-C/
 * Esc/Enter actually do anything. The footer must never promise a key that
 * doesn't work. */
export function renderFooter(_active: ViewId, cols: number, tabCount: number, overrideHint?: string): string[] {
  const rule = space.indent + type.hint(glyph.rule().repeat(Math.max(1, cols - 6)));
  const hintText = overrideHint ?? interactiveFooterHint(tabCount, cols);
  const hint = space.indent + type.hint(hintText);
  return [rule, hint];
}
