import { type, space, glyph } from '../core/theme.js';
import { pickIcon } from '../core/icons.js';
import { t } from '../i18n/index.js';
import type { ViewId } from './keys.js';

/** `renderHeader` always returns exactly this many lines (brand, tabs, rule). */
export const HEADER_LINES = 3;
/** `renderFooter` always returns exactly this many lines (rule, keyhints). */
export const FOOTER_LINES = 2;

export function renderHeader(views: { id: ViewId; title: string }[], active: ViewId, cols: number): string[] {
  const brand = `${space.indent}${type.heading('nbtca')}`;
  const sep = `  ${pickIcon('·', '-')}  `;
  const tabs = space.indent + views
    .map((v) => (v.id === active ? type.heading(`[${v.title}]`) : type.hint(v.title)))
    .join(sep);
  const rule = space.indent + type.hint(glyph.rule().repeat(Math.max(1, cols - 6)));
  return [brand, tabs, rule];
}

/** Shared footer hint for any view mode that captures all input (a focused
 * text field or a modal-like list) — the only keys that still do something
 * are Ctrl-C/Esc/Enter, so this is what every such view's `footerHint()`
 * should return instead of each re-declaring an identical string. */
export function captureFooterHint(): string {
  const trans = t();
  const dot = pickIcon('·', '-');
  return `Ctrl+C ${trans.common.exit}  ${dot}  Esc ${trans.common.back}  ${dot}  Enter ${trans.common.confirm}`;
}

/** `overrideHint`: a view supplies this (via `View.footerHint()`) when the
 * generic tab-switching hint would be false — e.g. while a text field has
 * focus, digits/Tab/q are typed characters, not shortcuts, and only Ctrl-C/
 * Esc/Enter actually do anything. The footer must never promise a key that
 * doesn't work. */
export function renderFooter(_active: ViewId, cols: number, tabCount: number, overrideHint?: string): string[] {
  const trans = t();
  const dot = pickIcon('·', '-');
  const rule = space.indent + type.hint(glyph.rule().repeat(Math.max(1, cols - 6)));
  // The digit-range must track the real tab count — a stale hardcoded
  // range promises keys (e.g. "1-7" with only 5 tabs) that do nothing.
  const digitHint = tabCount > 1 ? `1-${tabCount} / Tab ${dot} ` : '';
  const hintText = overrideHint ?? (
    `${digitHint}${trans.menu.hintMove} ${dot} ${trans.menu.hintOpen} ${dot} Esc ${dot} q ${trans.menu.hintQuit}`
  );
  const hint = space.indent + type.hint(hintText);
  return [rule, hint];
}
